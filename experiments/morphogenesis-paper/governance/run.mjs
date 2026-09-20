// Independent authority cells around the historical four real controllers.
// Historical source is imported, never rewritten; owner enforcement is shared.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign,verify,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../../../packages/postgres/dist/index.js';
import {runMigrations as migrateHost} from '../../../packages/collective-host-postgres/dist/index.js';
import {runMigrations as migrateWorkflow} from '../../../packages/workflows-postgres/dist/index.js';
import {controller,registerWorkflow} from '../missions/controllers.mjs';
import {MissionOwner} from '../missions/owner.mjs';
import {workload,hash} from '../missions/workload.mjs';
import {fixture} from '../integration/fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const CONDITIONS=['fixed','minimal','durable','morphogenesis'];
const CELLS=['nominal','decision_expired','mandate_expired','plan_substituted','scope_escalated','self_issued','owner_denied','lost_ack','reconciliation_outage'];
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const write=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n');
class Denied extends Error {}
class GovernedOwner extends MissionOwner {
  constructor(pool,schema,id,input,cell,keys,proposal){super(pool,schema,id,input);Object.assign(this,{cell,keys,proposal});this.admissions=[];this.currentOperation=null;}
  async authorize(){
    if(!this.currentOperation)return super.authorize(); // retirement uses already admitted identity
    const approved={proposalDigest:this.proposal.proposalDigest,scopeDigest:this.proposal.scopeDigest,
      subject:'agent:statistics',issuer:'authority:reference',validFrom:200,decisionUntil:450,mandateUntil:400};
    if(this.cell==='decision_expired')approved.decisionUntil=290;
    if(this.cell==='mandate_expired')approved.mandateUntil=290;
    const privateKey=this.cell==='self_issued'?this.keys.attacker.privateKey:this.keys.trusted.privateKey;
    const payload=JSON.stringify(approved),signature=sign(null,Buffer.from(payload),privateKey).toString('base64');
    const request={operationId:this.currentOperation,proposalDigest:approved.proposalDigest,scopeDigest:approved.scopeDigest,subject:approved.subject};
    if(this.cell==='plan_substituted')request.proposalDigest=hash('unapproved plan');
    if(this.cell==='scope_escalated')request.scopeDigest=hash('another tenant');
    const at=300,ownerAllows=this.cell!=='owner_denied';
    const signatureValid=verify(null,Buffer.from(payload),this.keys.trusted.publicKey,Buffer.from(signature,'base64'));
    const allowed=signatureValid&&request.proposalDigest===approved.proposalDigest&&request.scopeDigest===approved.scopeDigest&&request.subject===approved.subject&&at>=approved.validFrom&&at<approved.decisionUntil&&at<approved.mandateUntil&&ownerAllows;
    this.admissions.push({request,payload,signature,at,ownerAllows,allowed});
    if(!allowed)throw new Denied('protected admission denied');
    return true;
  }
  async activate(operationId,initial=false){this.currentOperation=operationId;try{return await super.activate(operationId,initial);}finally{this.currentOperation=null;}}
}
async function runCase(pool,schema,condition,cell,keys){
  const id=`authority-${cell}-${condition}`,input=workload(101,'burst',['lost_ack','reconciliation_outage'].includes(cell)?cell:'none');
  const context=fixture(id,hash('mission-position'));
  const owner=new GovernedOwner(pool,schema,id,input,cell,keys,context.proposal);await owner.initialize();
  const control=controller(condition,owner,pool,schema);let denied=false;
  try{
    await control.initialize();
    const tasks=new Map();
    for(let phase=0;phase<=input.horizon;phase++){
      owner.phase=phase;await control.advance();
      for(const task of input.tasks.filter(t=>t.phase===phase))tasks.set(task.id,task);
      if(phase===input.revision.phase)tasks.set(input.revision.id,input.revision);
      for(const task of tasks.values()){
        if(owner.artifacts.some(a=>a.id===task.id&&a.version===task.version))continue;
        if(task.kind==='variance'&&!control.role)continue;
        await owner.accept(task,control.role?.roleId);
      }
    }
  }catch(e){if(owner.admissions.some(a=>!a.allowed)){denied=true;}else throw e;}
  denied ||= owner.admissions.some(a=>!a.allowed);
  const roles=(await pool.query(`SELECT roles FROM "${schema}".mission_owners WHERE case_id=$1`,[id])).rows[0].roles;
  const state=control.state();
  // All role effects must be connected to the original successful owner admission.
  const chains=roles.map(role=>({operationId:role.operationId,role,admissionIndex:owner.admissions.findIndex(a=>a.allowed&&a.request.operationId===role.operationId),
    proposal:context.proposal,controllerCondition:condition}));
  if(['nominal','lost_ack','reconciliation_outage'].includes(cell))assert(roles.length>0,'positive control must admit');
  else {assert(denied,'attack must be observed');assert.equal(roles.length,0);}
  return {schemaVersion:1,id,condition,cell,clock:{origin:'2026-09-20T00:00:00.000Z',admissionMs:300,scope:'prescribed owner clock; no skew tested'},
    trustedPublicKey:keys.trusted.publicKey.export({format:'pem',type:'spki'}),proposal:context.proposal,
    admissions:owner.admissions,roles,chains,events:owner.events,controller:state,denied,
    limits:'Synthetic signed admission envelope around real controllers and PostgreSQL; not a production identity provider or policy benchmark'};
}
async function main(){
 const output=process.argv[2];assert(output&&!existsSync(output),'supply new output directory');mkdirSync(output,{recursive:true});mkdirSync(path.join(output,'cases'));
 const keys={trusted:generateKeyPairSync('ed25519'),attacker:generateKeyPairSync('ed25519')};
 const pool=createPostgresPool({host:'127.0.0.1',port:Number(process.env.MORPHOGENESIS_PG_PORT),user:'postgres',database:'postgres',max:6});
 const schema=`governance_${randomBytes(6).toString('hex')}`;let count=0;
 const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
 write(path.join(output,'environment.json'),{node:process.version,platform:process.platform,arch:process.arch,
  compiledModules:walk(path.join(root,'packages')).filter(p=>p.includes('/dist/')&&p.endsWith('.js')).sort().map(p=>({path:path.relative(root,p),digest:sha(readFileSync(p))})),
  postgresImageId:process.env.MORPHOGENESIS_PG_IMAGE_ID??'not-recorded'});

 const sourcePaths=['experiments/morphogenesis-paper/governance/run.mjs','experiments/morphogenesis-paper/governance/verify.mjs','experiments/morphogenesis-paper/governance/protocol.md','experiments/morphogenesis-paper/missions/controllers.mjs','experiments/morphogenesis-paper/missions/owner.mjs','experiments/morphogenesis-paper/missions/workload.mjs','experiments/morphogenesis-paper/integration/fixture.mjs'];
 write(path.join(output,'registration.json'),{recordedBeforeRun:new Date().toISOString(),conditions:CONDITIONS,cells:CELLS,trustedPublicKey:keys.trusted.publicKey.export({format:'pem',type:'spki'}),unit:'prescribed scenario; one input seed; no statistical sample-size claim',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sources:sourcePaths.map(p=>({path:p,digest:sha(readFileSync(path.join(root,p)))})),lockfileDigest:sha(readFileSync(path.join(root,'pnpm-lock.yaml')))});
 try{
  await migrateHost(pool,{schema,createSchema:true});await migrateWorkflow(pool,{schema});
  await pool.query(`CREATE TABLE "${schema}".mission_owners(case_id text PRIMARY KEY,roles jsonb NOT NULL)`);
  await pool.query(`CREATE TABLE "${schema}".mission_artifacts(case_id text,artifact_id text,version integer,artifact jsonb,PRIMARY KEY(case_id,artifact_id,version))`);
  await registerWorkflow(pool,schema);
  for(const cell of CELLS)for(const condition of CONDITIONS){write(path.join(output,'cases',`${cell}-${condition}.json`),await runCase(pool,schema,condition,cell,keys));count++;}
  write(path.join(output,'summary.json'),{status:'completed',cases:count,node:process.version,postgres:(await pool.query('SELECT version() v')).rows[0].v,modelCalls:0});
 }catch(e){write(path.join(output,'failure.json'),{completedCases:count,error:e.message});throw e;}
 finally{await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
