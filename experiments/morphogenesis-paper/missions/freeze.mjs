import assert from "node:assert/strict";
import {existsSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {hash,workload,CONDITIONS,SHAPES,FAULTS} from "./workload.mjs";
const [pilot,destination]=process.argv.slice(2);assert(pilot&&destination&&!existsSync(destination));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const pilotSummary=JSON.parse(readFileSync(path.join(pilot,"summary.json"),"utf8"));assert.equal(pilotSummary.status,"completed");
const seeds=Array.from({length:32},(_,i)=>101+i);
const registration={schemaVersion:1,phase:"held-out-finite-grid",frozenAt:new Date().toISOString(),
  sourceCommit:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),seeds,horizon:8,rolePhaseBudget:16,databaseQueryBudget:512,
  conditions:CONDITIONS,shapes:SHAPES,faults:FAULTS,expectedCases:seeds.length*SHAPES.length*FAULTS.length*CONDITIONS.length,
  pilotManifestDigest:hash(readFileSync(path.join(pilot,"manifest.json"))),
  sampleRationale:"32 distinct integer-array inputs per shape/fault cell for held-out finite-grid coverage. No statistical-power or population reliability claim.",
  analysis:"Independent Python exact-arithmetic oracle; raw per-case scores, stratified summaries, paired mean differences. Local elapsed times diagnostic only; no monetary conversion.",
  exclusions:"None. Unexpected errors invalidate the attempt; preserve all cases. Denials, blocked phases and budget exhaustion remain outcomes. Pilot seeds excluded.",
  claimBoundary:"Controlled deterministic task and reservation study; not LLM organizational intelligence, independent-host fault tolerance, production performance or cross-framework superiority.",
  inputs:seeds.flatMap(seed=>SHAPES.flatMap(shape=>FAULTS.map(fault=>({seed,shape,fault,digest:hash(workload(seed,shape,fault))})))),
  sourceFiles:walk(path.dirname(fileURLToPath(import.meta.url))).filter(p=>!p.includes("__pycache__")).sort().map(p=>({path:path.relative(root,p),digest:hash(readFileSync(p))})),
  sharedFixtureDigest:hash(readFileSync(new URL("../integration/fixture.mjs",import.meta.url))),
  lockfileDigest:hash(readFileSync(path.join(root,"pnpm-lock.yaml")))};
writeFileSync(destination,JSON.stringify(registration,null,2)+"\n");
console.log(JSON.stringify({registration:destination,cases:registration.expectedCases,digest:hash(readFileSync(destination))}));
