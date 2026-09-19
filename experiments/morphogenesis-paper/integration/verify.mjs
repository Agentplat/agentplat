import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {createHash,verify as verifySignature} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import * as M from "../../../packages/collective-runtime/dist/morphogenesis.js";
import * as T from "../../../packages/collective-runtime/dist/team-formation.js";
import * as C from "../../../packages/collective-control/dist/index.js";
const read=f=>JSON.parse(readFileSync(f,"utf8"));
const hash=b=>`sha256:${createHash("sha256").update(b).digest("hex")}`;
export function verify(directory) {
  const dir=path.resolve(directory),load=f=>read(path.join(dir,f));
  const manifest=load("manifest.json");
  assert.deepEqual(manifest.map(x=>x.path),readdirSync(dir).filter(f=>f!=="manifest.json").sort());
  for(const item of manifest){assert(!item.path.includes("/")&&!item.path.includes(".."));assert.equal(hash(readFileSync(path.join(dir,item.path))),item.digest);}
  const config=load("configuration.json"),summary=load("summary.json"),events=load("events.json");
  assert.equal(summary.status,"completed");
  const approvals=events.filter(e=>e.kind==="signed-approval").map(e=>e.value);
  assert.equal(approvals.length,3);
  assert.equal(new Set(approvals.map(e=>e.authorization.candidateDigest)).size,3);
  for(const a of approvals){M.validateMorphogenesisDecisionAuthorizationV1(a.authorization);
    assert(verifySignature(null,Buffer.from(JSON.stringify(a.authorization)),a.publicKey,Buffer.from(a.signature,"base64")));}
  const contexts=events.filter(e=>e.kind==="approved-transition");
  assert.equal(contexts.length,3);
  for(const {value:v} of contexts){
    M.validateMorphogenesisProposalV1(v.context.proposal,v.context);
    M.validateMorphogenesisDecisionBindingV1(v.decision);
    assert.equal(v.decision.candidate.proposalDigest,v.context.proposal.proposalDigest);
    assert(v.context.target.invariantDigests.includes(config.position.positionDigest));
    const a=approvals.find(x=>x.authorization.authorizationDigest===v.decision.authorization.authorizationDigest);assert(a);
  }
  const race=load("race.json");
  assert.equal(race.before.head.morphologyEpoch,1);
  M.validateMorphologyHeadV1(race.before.head);M.validateMorphologyHeadV1(race.after.head);
  assert.equal(race.before.teams.length,2);assert.equal(race.before.effects.length,2);
  for(const team of race.before.teams){T.validateTeamFormationStateV1(team,{policy:config.teamPolicy});assert.equal(team.team.status,"active");}
  for(const state of [race.before.work,race.after.work,race.cleanup.work])C.validateCollectiveExecutionStateV1(state);
  assert.equal(race.before.work.workContracts.filter(w=>w.status==="active").length,2);
  assert.equal(race.commits.filter(c=>c.status==="fulfilled").length,1);
  assert.equal(race.after.head.morphologyEpoch,2);
  for(const e of race.after.executions)M.validateMorphogenesisExecutionRecordV1(e);
  const winning=race.after.executions.find(e=>e.proposalDigest===race.after.head.acceptedProposalDigest);
  assert(winning);assert.equal(winning.phase,"morphology_active");
  assert.equal(race.cleanup.work.workContracts.find(w=>w.workContractId===`work-contract:${race.loser}`).status,"released");
  T.validateTeamFormationStateV1(race.cleanup.team,{policy:config.teamPolicy});assert.equal(race.cleanup.team.team.status,"cancelled");
  M.validateMorphogenesisExecutionRecordV1(race.cleanup.execution);assert.equal(race.cleanup.execution.phase,"committing_morphology");
  const expiry=load("expiry.json");
  M.validateMorphogenesisDecisionBindingV1(expiry.decision);
  C.validateDelegationMandateV1(expiry.mandate);
  assert(380<expiry.decision.authorization.expiresAtLogicalMs);
  assert(Date.parse(config.wallClockOrigin)+380>=Date.parse(expiry.mandate.statement.validUntil));
  C.validateCollectiveExecutionStateV1(expiry.work);assert.equal(expiry.work.workContracts.length,0);
  T.validateTeamFormationStateV1(expiry.team,{policy:config.teamPolicy});assert.equal(expiry.team.team.status,"awaiting_member_contracts");
  assert.equal(expiry.head.morphologyEpoch,1);assert.match(expiry.rejection,/mandate_expired/);
  assert(events.some(e=>e.kind==="owner-admission" && e.value.label==="expiry" && e.value.authorization.authorized===false));
  const drain=load("drain.json");
  M.validateMorphogenesisExecutionRecordV1(drain.pending);M.validateMorphogenesisExecutionRecordV1(drain.terminal);
  assert.equal(drain.pending.phase,"draining");assert.equal(drain.pending.terminalAgent,null);
  assert.equal(drain.terminal.phase,"completed");assert.equal(drain.terminal.terminalAgent.operationId,drain.pending.pendingOperation.operationId);
  C.validateCollectiveExecutionStateV1(drain.work);assert.equal(drain.work.workContracts.filter(w=>w.status==="active").length,0);
  const sequence=kind=>events.find(e=>e.kind===kind)?.sequence;
  assert(sequence("work-admitted")<sequence("work-fenced"));
  assert(sequence("work-fenced")<sequence("drain-blocked"));
  assert(sequence("drain-blocked")<sequence("admitted-work-finished"));
  assert(sequence("admitted-work-finished")<sequence("participant-detached"));
  return {status:"verified",approvedProposals:3,signedApprovals:3,raceSuccessors:1,losingExecutionRemainsPending:true,
    expiryRejected:true,winnerCompleted:true,scope:"record validity, signature integrity and retained traces; not independent deployment attestation"};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log(JSON.stringify(verify(process.argv[2])));
