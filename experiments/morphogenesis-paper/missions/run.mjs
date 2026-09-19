import assert from "node:assert/strict";
import {mkdirSync,existsSync,writeFileSync,readFileSync,readdirSync} from "node:fs";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {randomBytes} from "node:crypto";
import {createPostgresPool} from "../../../packages/postgres/dist/index.js";
import {runMigrations as migrateHost} from "../../../packages/collective-host-postgres/dist/index.js";
import {runMigrations as migrateWorkflow} from "../../../packages/workflows-postgres/dist/index.js";
import {CONDITIONS,SHAPES,FAULTS,workload,hash} from "./workload.mjs";
import {MissionOwner} from "./owner.mjs";
import {controller,registerWorkflow} from "./controllers.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+"\n");
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
function instrument(pool,metrics,limit){
  const wrap=obj=>new Proxy(obj,{get(target,key){
    if(key==="query")return (...args)=>{
      const sql=typeof args[0]==="string"?args[0]:args[0].text;
      const kind=sql.trim().split(/\s+/)[0].toUpperCase();
      if(metrics.queries>=(kind==="ROLLBACK"?limit:limit-2))throw new Error("mission_database_budget_exhausted");
      metrics.queries++;metrics.queryEvents.push({sequence:metrics.queries,kind,statementDigest:hash(sql)});
      return target.query(...args);
    };
    if(key==="connect")return async()=>wrap(await target.connect());
    const v=target[key];return typeof v==="function"?v.bind(target):v;
  }});return wrap(pool);
}
async function runCase(pool,schema,input,condition,caseId){
  const metrics={queries:0,queryEvents:[],wallTimeMs:0},metered=instrument(pool,metrics,input.databaseQueryBudget),started=performance.now();
  const owner=new MissionOwner(metered,schema,caseId,input);await owner.initialize();
  const control=controller(condition,owner,metered,schema);await control.initialize();
  const tasks=new Map();let exhausted=false;
  try{for(let phase=0;phase<input.horizon;phase++){
    owner.phase=phase;
    for(const task of input.tasks.filter(t=>t.phase===phase))tasks.set(task.id,task);
    if(phase===input.revision.phase)tasks.set(input.revision.id,input.revision);
    await control.advance();
    if(!await owner.chargePhase()){exhausted=true;break;}
    for(const task of tasks.values()){
      if(owner.artifacts.some(a=>a.id===task.id&&a.version===task.version))continue;
      if(task.kind==="variance"&&!control.role){owner.event("task-blocked",{taskId:task.id});continue;}
      await owner.accept(task,control.role?.roleId);
    }
  }
  if(!exhausted){await owner.report();owner.phase=input.horizon;await control.advance();}
  }catch(e){if(e.message!=="mission_database_budget_exhausted")throw e;exhausted=true;owner.event("database-budget-exhausted");}
  metrics.wallTimeMs=performance.now()-started;
  const roles=(await pool.query(`SELECT roles FROM "${schema}".mission_owners WHERE case_id=$1`,[caseId])).rows[0]?.roles??[];
  const persisted=(await pool.query(`SELECT artifact FROM "${schema}".mission_artifacts WHERE case_id=$1 ORDER BY artifact_id,version`,[caseId])).rows.map(r=>r.artifact);
  assert.equal(persisted.length,owner.artifacts.length);
  return {schemaVersion:1,caseId,condition,input,metrics,events:owner.events,roles,artifacts:persisted,controller:control.state()};
}
async function main(){
  const output=path.resolve(process.argv[2]??""),planFile=process.argv[3];
  assert(process.argv[2]&&planFile&&!existsSync(output),"usage: run.mjs <new-output> <plan.json>");
  const plan=JSON.parse(readFileSync(planFile,"utf8"));assert(plan.seeds.length>0);
  assert.deepEqual(plan.conditions,CONDITIONS);assert.deepEqual(plan.faults,FAULTS);
  assert.equal(plan.horizon,8);assert.equal(plan.rolePhaseBudget,16);assert.equal(plan.databaseQueryBudget,512);
  if(plan.phase==="held-out-finite-grid"){
    assert(Date.parse(plan.frozenAt)<Date.now());
    for(const file of plan.sourceFiles)assert.equal(hash(readFileSync(path.join(root,file.path))),file.digest,`frozen source changed: ${file.path}`);
    assert.equal(plan.sharedFixtureDigest,hash(readFileSync(new URL("../integration/fixture.mjs",import.meta.url))));
    assert.equal(plan.lockfileDigest,hash(readFileSync(path.join(root,"pnpm-lock.yaml"))));
    for(const input of plan.inputs)assert.equal(hash(workload(input.seed,input.shape,input.fault)),input.digest);
  }
  const port=Number(process.env.MORPHOGENESIS_PG_PORT);assert(Number.isInteger(port)&&port>0);
  mkdirSync(path.join(output,"cases"),{recursive:true});write(path.join(output,"plan.json"),plan);
  const schema=`paper_missions_${randomBytes(6).toString("hex")}`;
  const pool=createPostgresPool({host:"127.0.0.1",port,user:"postgres",database:"postgres",max:6});
  const summary={phase:plan.phase,startedAt:new Date().toISOString(),completedCases:0,status:"running"};
  try{
    await migrateHost(pool,{schema,createSchema:true});await migrateWorkflow(pool,{schema});
    await pool.query(`CREATE TABLE "${schema}".mission_owners(case_id text PRIMARY KEY,roles jsonb NOT NULL)`);
    await pool.query(`CREATE TABLE "${schema}".mission_artifacts(case_id text,artifact_id text,version integer,artifact jsonb,PRIMARY KEY(case_id,artifact_id,version))`);
    await registerWorkflow(pool,schema);
    for(const seed of plan.seeds)for(const shape of SHAPES)for(const fault of FAULTS){
      const input=workload(seed,shape,fault),offset=(seed+SHAPES.indexOf(shape)+FAULTS.indexOf(fault))%4;
      const order=[...CONDITIONS.slice(offset),...CONDITIONS.slice(0,offset)];
      for(const condition of order){
        const caseId=`${seed}-${shape}-${fault}-${condition}`;
        try{write(path.join(output,"cases",`${caseId}.json`),await runCase(pool,schema,input,condition,caseId));}
        catch(e){write(path.join(output,"failed-case.json"),{caseId,message:e.message,stack:e.stack});throw e;}
        summary.completedCases++;
      }
      if(summary.completedCases%48===0)console.log(JSON.stringify({completedCases:summary.completedCases}));
    }
    summary.status="completed";
  }catch(error){summary.status="failed";summary.error=error.message;throw error;}
  finally{
    summary.completedAt=new Date().toISOString();write(path.join(output,"summary.json"),summary);
    write(path.join(output,"environment.json"),{sourceCommit:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
      node:process.version,platform:process.platform,arch:process.arch,postgres:(await pool.query("SELECT version() AS v")).rows[0].v,
      postgresImageId:process.env.MORPHOGENESIS_PG_IMAGE_ID??"not-recorded",planDigest:hash(readFileSync(planFile)),
      sourceFiles:walk(path.dirname(fileURLToPath(import.meta.url))).filter(p=>!p.includes("__pycache__")).sort().map(p=>({path:path.relative(root,p),digest:hash(readFileSync(p))})),
      sharedFixtureDigest:hash(readFileSync(new URL("../integration/fixture.mjs",import.meta.url))),
      lockfileDigest:hash(readFileSync(path.join(root,"pnpm-lock.yaml"))),compiledModules:walk(path.join(root,"packages")).filter(p=>p.includes("/dist/")&&p.endsWith(".js")).map(p=>({path:path.relative(root,p),digest:hash(readFileSync(p))})),
      externalSpendUsd:0,modelCalls:0,measurementBoundary:"schema/catalog setup excluded; per-mission owner and controller queries included"});
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();
    write(path.join(output,"manifest.json"),walk(output).filter(p=>!p.endsWith("/manifest.json")).sort().map(p=>({path:path.relative(output,p),digest:hash(readFileSync(p))})));
  }
  console.log(JSON.stringify(summary));
}
await main();
