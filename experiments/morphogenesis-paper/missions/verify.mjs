import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {CONDITIONS,SHAPES,FAULTS,workload,hash} from "./workload.mjs";
import {validateMorphogenesisExecutionRecordV1,validateMorphogenesisProposalV1,validateMorphogenesisDecisionBindingV1} from "../../../packages/collective-runtime/dist/morphogenesis.js";
import {validateProcessRunV1} from "../../../packages/workflows/dist/index.js";
const read=f=>JSON.parse(readFileSync(f,"utf8"));
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
export function verify(directory){
  const dir=path.resolve(directory),manifest=read(path.join(dir,"manifest.json"));
  assert.deepEqual(manifest.map(e=>e.path).sort(),walk(dir).map(f=>path.relative(dir,f)).filter(f=>f!=="manifest.json").sort());
  for(const entry of manifest){assert(!path.isAbsolute(entry.path)&&!entry.path.split(path.sep).includes(".."));assert.equal(hash(readFileSync(path.join(dir,entry.path))),entry.digest,entry.path);}
  const plan=read(path.join(dir,"plan.json")),summary=read(path.join(dir,"summary.json"));
  assert.equal(summary.status,"completed");
  const cases=readdirSync(path.join(dir,"cases")).map(f=>read(path.join(dir,"cases",f)));
  const expected=plan.seeds.length*SHAPES.length*FAULTS.length*CONDITIONS.length;
  assert.equal(cases.length,expected);assert.equal(summary.completedCases,expected);
  assert.equal(new Set(cases.map(c=>c.caseId)).size,expected);
  for(const seed of plan.seeds)for(const shape of SHAPES)for(const fault of FAULTS){
    const group=cases.filter(c=>c.input.seed===seed&&c.input.shape===shape&&c.input.fault===fault);
    assert.deepEqual(group.map(c=>c.condition).sort(),[...CONDITIONS].sort());
    for(const c of group){
      assert.deepEqual(c.input,workload(seed,shape,fault));
      assert.equal(c.metrics.queries,c.metrics.queryEvents.length);assert(c.metrics.queries<=c.input.databaseQueryBudget);
      assert(c.metrics.wallTimeMs>=0&&Number.isFinite(c.metrics.wallTimeMs));
      if(c.condition==="morphogenesis"&&c.controller.context){
        validateMorphogenesisProposalV1(c.controller.context.proposal,c.controller.context);
        validateMorphogenesisDecisionBindingV1(c.controller.decision);
        for(const record of c.controller.executions){
          validateMorphogenesisExecutionRecordV1(record);
          assert.equal(record.proposalDigest,c.controller.context.proposal.proposalDigest);
          assert.equal(record.decisionDigest,c.controller.decision.decisionDigest);
        }
      }
      if(c.condition==="durable")for(const run of c.controller.workflowStates)validateProcessRunV1(run);
      const faults=c.events.filter(e=>e.kind==="ack-lost");
      const shouldExpose=c.condition!=="fixed"&&fault!=="none"&&c.input.specialistStart!==null;
      assert.equal(faults.length,shouldExpose?1:0,`${c.caseId}: fault exposure`);
      if(c.condition!=="minimal"){
        assert(c.events.filter(e=>e.kind==="role-materialized"&&!e.initial).length<=1);
      }
    }
  }
  return {status:"verified",cases:cases.length,matchedConditions:4,faultExposureVerified:true,
    scope:"raw integrity, input equality, protocol record validity and injection coverage; task correctness is checked by the separate Python oracle"};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log(JSON.stringify(verify(process.argv[2])));
