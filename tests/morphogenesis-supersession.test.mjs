import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runMorphogenesisExampleScenario } from "../examples/agent-morphogenesis/demo.mjs";
import {
  MorphogenesisExecutionRuntimeV1,
  MorphologyHeadRuntimeV1,
  InMemoryMorphologyHeadStoreV1,
  MorphologyHeadMorphogenesisActivationPortV1,
  createInitialMorphologyHeadV1,
  validateMorphogenesisExecutionRecordV1,
  createMorphogenesisSupersessionReceiptV1,
  isMorphogenesisExecutionTerminalV1,
  MorphogenesisSupersededCompensationPortV1,
} from "../packages/collective-runtime/dist/morphogenesis.js";
import { digestPlanningJsonV1 } from "../packages/collective-planning/dist/index.js";
import { projectMorphogenesisSupersessionToRoomArtifactV1 } from "../packages/rooms-mesh/dist/morphogenesis.js";
import { WorkActionMorphogenesisAuthorityFencePortV1 } from "../packages/collective-host/dist/morphogenesis.js";

const sha = c => `sha256:${c.repeat(64)}`;

async function fixture({winner="other", fault=null, inspection=true, branch="recruit"}={}) {
  const headStore=new InMemoryMorphologyHeadStoreV1();
  const heads=new MorphologyHeadRuntimeV1({store:headStore,maximumCommitAttempts:4});
  const activation=new MorphologyHeadMorphogenesisActivationPortV1(heads);
  const calls={checkpoint:0,fence:0,detach:0,retire:0,budget:0,reconciliations:[]};
  let built;
  const stop=new Error("fixture ready");
  try {
    await runMorphogenesisExampleScenario(branch,"authorized_agent",{
      async transformExecutionOptions({options}) {
        const retained=new Map();
        const wrap=(name,owner,method,reconcile)=>({
          ...owner,
          async [method](input) {
            calls[name]++;
            const result=await owner[method](input);
            retained.set(input.operationId,result);
            if(fault===name)throw new Error(`lost ${name} acknowledgement`);
            return result;
          },
          async [reconcile](input) {
            calls.reconciliations.push(input.operationId);
            return retained.get(input.operationId);
          },
        });
        return {...options,
          morphology:inspection?activation:{activate:i=>activation.activate(i),reconcile:i=>activation.reconcile(i)},
          continuity:wrap("checkpoint",options.continuity,"checkpoint","reconcile"),
          authority:wrap("fence",options.authority,"fence","reconcile"),
          detachment:wrap("detach",options.detachment,"detach","reconcile"),
          retirement:wrap("retire",options.retirement,"retire","reconcile"),
          budgets:{...options.budgets,async release(input){
            const key=input.releaseOperationId;
            if(retained.has(key)){calls.reconciliations.push(key);return retained.get(key);}
            calls.budget++;const r=await options.budgets.release(input);retained.set(key,r);
            if(fault==="budget")throw new Error("lost budget acknowledgement");return r;
          }},
        };
      },
      async directExecutionDriver({runtime,options,execution}) {
        await heads.initialize(createInitialMorphologyHeadV1({stateKey:execution.morphologyHeadStateKey,
          scopeDigest:execution.scope.scopeDigest,policyDigest:sha("a"),morphologyEpoch:1,snapshotDigest:sha("1"),logicalTimeMs:160}));
        const stateKey=execution.stateKey;
        await runtime.resolveAgent({stateKey,logicalTimeMs:180});
        await runtime.attest({stateKey,logicalTimeMs:190});
        await runtime.verifyEnrollment({stateKey,logicalTimeMs:195});
        await runtime.activateTeam({stateKey,logicalTimeMs:200});
        const commit={stateKey:execution.morphologyHeadStateKey,scopeDigest:execution.scope.scopeDigest,policyDigest:sha("a"),expectedMorphologyEpoch:1,
          snapshotDigest:sha("b"),proposalDigest:sha("c"),decisionDigest:sha("d"),receiptDigest:sha("e"),logicalTimeMs:210};
        if(winner==="self")await runtime.commitMorphology({stateKey,logicalTimeMs:210});
        else if(winner!=="none") {
          await heads.commit(commit);
          await assert.rejects(runtime.commitMorphology({stateKey,logicalTimeMs:220}),/stale or cross-scoped/);
          if(winner==="later")await heads.commit({...commit,expectedMorphologyEpoch:2,proposalDigest:sha("f"),logicalTimeMs:225});
        }
        built={runtime,options,stateKey,heads,headStore,calls};throw stop;
      },
    });
  }catch(error){if(error!==stop)throw error;}
  return built;
}

async function finish(built,time=240) {
  let state=await built.runtime.required(built.stateKey);
  for(let i=0;i<8&&!isMorphogenesisExecutionTerminalV1(state);i++)
    state=await built.runtime.advanceSupersededResolution({stateKey:built.stateKey,logicalTimeMs:time+i});
  return state;
}

test("a proven loser closes only after owner cleanup and preserves the winning head",async()=>{
  const f=await fixture(), winner=await f.headStore.load("head:recruit");
  const admitted=await f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230});
  assert.equal(admitted.phase,"superseding");
  assert.equal(admitted.supersession.winningHead.headDigest,winner.headDigest);
  assert.deepEqual([f.calls.checkpoint,f.calls.fence,f.calls.detach,f.calls.budget],[0,0,0,0]);
  await assert.rejects(f.runtime.commitMorphology({stateKey:f.stateKey,logicalTimeMs:231}),/activation phase/);
  const terminal=await finish(f);
  assert.equal(terminal.phase,"superseded");assert.equal(terminal.activation,null);assert.equal(terminal.receipt,null);
  assert.equal(terminal.supersessionReceipt.winningHeadDigest,winner.headDigest);
  assert.equal(terminal.supersessionReceipt.budgetReleaseDigest,terminal.budgetReleaseDigest);
  assert.equal(validateMorphogenesisExecutionRecordV1(terminal).recordDigest,terminal.recordDigest);
  assert.deepEqual(await f.headStore.load("head:recruit"),winner);
  assert.deepEqual([f.calls.checkpoint,f.calls.fence,f.calls.detach,f.calls.budget],[1,1,1,1]);
  const replay=await finish(f,300);assert.equal(replay.recordDigest,terminal.recordDigest);
  await assert.rejects(f.runtime.complete({stateKey:f.stateKey,disposition:"success",outcomeEvidenceDigests:[],logicalTimeMs:301}),/advanceSupersededResolution/);
});

for(const fault of ["checkpoint","fence","detach","budget"])
  test(`lost ${fault} acknowledgement resumes the original cleanup operation`,async()=>{
    const f=await fixture({fault});
    await f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230});
    await assert.rejects(finish(f),/lost .* acknowledgement/);
    const before=await f.runtime.required(f.stateKey);assert.equal(isMorphogenesisExecutionTerminalV1(before),false);
    const pendingId=before.pendingOperation.operationId;
    f.runtime=new MorphogenesisExecutionRuntimeV1(f.options);
    const terminal=await finish(f,260);
    assert.equal(terminal.phase,"superseded");assert(f.calls.reconciliations.includes(pendingId));
    assert.deepEqual([f.calls.checkpoint,f.calls.fence,f.calls.detach,f.calls.budget],[1,1,1,1]);
  });

for(const winner of ["self","none","later"])
  test(`supersession refuses ${winner} or ambiguous head history without cleanup`,async()=>{
    const f=await fixture({winner}),before=await f.runtime.required(f.stateKey);
    await assert.rejects(f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230}),
      /without committed morphology|exact direct successor/);
    assert.equal((await f.runtime.required(f.stateKey)).recordDigest,before.recordDigest);
    assert.deepEqual([f.calls.checkpoint,f.calls.fence,f.calls.detach,f.calls.budget],[0,0,0,0]);
  });

test("a legacy activation port must opt into authoritative head inspection",async()=>{
  const f=await fixture({inspection:false});
  await assert.rejects(f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230}),/authoritative morphology head inspection/);
});

test("concurrent identical admission retains one supersession binding",async()=>{
  const f=await fixture();
  const records=await Promise.all([1,2].map(()=>f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230})));
  assert.equal(records[0].recordDigest,records[1].recordDigest);
  assert.equal(records[0].events.filter(e=>e.phase==="superseding").length,1);
});

test("unknown cleanup results stay pending and cannot produce a final receipt",async()=>{
  const f=await fixture({fault:"fence"});
  await f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230});
  await assert.rejects(finish(f),/lost fence/);
  const blockedOptions={...f.options,authority:{...f.options.authority,async reconcile(){throw new Error("owner unavailable");}}};
  const reopened=new MorphogenesisExecutionRuntimeV1(blockedOptions);
  await assert.rejects(reopened.advanceSupersededResolution({stateKey:f.stateKey,logicalTimeMs:260}),/owner unavailable/);
  const state=await reopened.required(f.stateKey);assert.equal(state.phase,"fencing");assert.equal(state.supersessionReceipt,undefined);
  assert.equal(f.calls.detach,0);assert.equal(f.calls.budget,0);
});

test("terminal receipts cannot be substituted even when the outer digest is recomputed",async()=>{
  const f=await fixture();await f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230});
  const terminal=await finish(f),forged=structuredClone(terminal);
  const {schemaVersion,receiptDigest,...body}=forged.supersessionReceipt;
  forged.supersessionReceipt=createMorphogenesisSupersessionReceiptV1({...body,fenceReceiptDigest:sha("0")});
  const {recordDigest,...recordBody}=forged;
  forged.recordDigest=digestPlanningJsonV1("morphogenesis-execution-record",recordBody);
  assert.throws(()=>validateMorphogenesisExecutionRecordV1(forged),/terminal receipt binding/);
});

test("the pre-extension paper record validates without changing its digest or fields",async()=>{
  const prior=JSON.parse(await readFile(new URL("../docs/research/morphogenesis-paper-v0.2/pilot/morphogenesis-lost-ack/record.json",import.meta.url),"utf8"));
  const validated=validateMorphogenesisExecutionRecordV1(prior);
  assert.deepEqual(validated,prior);assert.equal(Object.hasOwn(validated,"supersession"),false);
});

test("a created specialist follows the retirement owner and reconciles a lost result",async()=>{
  const f=await fixture({branch:"create",fault:"retire"});
  await f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230});
  await assert.rejects(finish(f),/lost retire acknowledgement/);
  const terminal=await finish(f,260);
  assert.equal(terminal.phase,"superseded");assert.equal(terminal.terminalAgent.disposition,"retired");
  assert.equal(f.calls.retire,1);assert.equal(f.calls.detach,0);
});

test("the Workflow compensation adapter closes the loser and replays its cleanup receipt",async()=>{
  const f=await fixture();const adapter=new MorphogenesisSupersededCompensationPortV1(f.runtime);
  const input={stageId:"compensate_enroll",execution:await f.runtime.required(f.stateKey),workflowTaskId:"workflow-task:test",
    idempotencyKey:"workflow-compensate:test",logicalTimeMs:230,signal:new AbortController().signal};
  const receipt=await adapter.compensate(input);
  assert.equal((await f.runtime.required(f.stateKey)).phase,"superseded");
  assert.deepEqual(await adapter.compensate(input),receipt);
});

test("Room cleanup projection is terminal, scope-bound and authority-neutral",async()=>{
  const f=await fixture();await f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230});
  const pending=await f.runtime.required(f.stateKey);
  const room={id:pending.scope.roomId,tenantId:pending.scope.tenantId,status:"active"};
  assert.throws(()=>projectMorphogenesisSupersessionToRoomArtifactV1({room,execution:pending}),/terminal cleanup/);
  const terminal=await finish(f);
  const projection=projectMorphogenesisSupersessionToRoomArtifactV1({room,execution:terminal});
  assert.equal(projection.input.metadata.authorityGranted,false);
  assert.equal(projection.input.metadata.disposition,"superseded");
  assert.throws(()=>projectMorphogenesisSupersessionToRoomArtifactV1({room:{...room,tenantId:"tenant:other"},execution:terminal}),/matching Room/);
});

test("the Work fence adapter preserves the original effect timestamp across reconciliation",async()=>{
  const f=await fixture();const state=await f.runtime.required(f.stateKey);
  const result={fencedWorkContractDigests:state.team.individualWorkContractDigests,revokedActionGrantDigests:[],successorFenceDigests:[sha("a")],
    effectReceiptDigest:sha("b"),fencedAtLogicalMs:230};
  const port=new WorkActionMorphogenesisAuthorityFencePortV1({async fence(){return result;},async reconcile(){return result;}});
  const input={operationId:"fence:timestamp",agent:state.agent,team:state.team,logicalTimeMs:230};
  const original=await port.fence(input),recovered=await port.reconcile({...input,logicalTimeMs:300});
  assert.equal(original.fenceReceiptDigest,recovered.fenceReceiptDigest);
  await assert.rejects(port.reconcile({...input,logicalTimeMs:200}),/incomplete/);
});

for (const field of ["continuity", "fence", "terminalAgent"])
  test(`supersession rejects changed nested ${field} evidence with a recomputed outer digest`, async () => {
    const f = await fixture();
    await f.runtime.beginSupersededResolution({stateKey:f.stateKey,logicalTimeMs:230});
    const forged = structuredClone(await finish(f));
    forged[field].agentDigest = sha("0");
    const {recordDigest, ...body} = forged;
    forged.recordDigest = digestPlanningJsonV1("morphogenesis-execution-record",body);
    assert.throws(() => validateMorphogenesisExecutionRecordV1(forged), /Supersession .* evidence is invalid/);
  });
