import assert from "node:assert/strict";
import * as M from "../../../packages/collective-runtime/dist/morphogenesis.js";
import {PostgresMorphogenesisExecutionStoreV1,PostgresMorphologyHeadStoreV1} from "../../../packages/collective-host-postgres/dist/index.js";
import {InMemoryProcessRunnerV1,createProcessDefinitionV1,createTaskDefinitionV1} from "../../../packages/workflows/dist/index.js";
import {PostgresWorkflowStoreV1} from "../../../packages/workflows-postgres/dist/index.js";
import {fixture} from "../integration/fixture.mjs";
import {hash} from "./workload.mjs";
const sha=c=>`sha256:${c.repeat(64)}`;
const timestamp=phase=>new Date(Date.parse("2026-09-19T12:00:00Z")+phase*10000).toISOString();

export async function registerWorkflow(pool,schema){
  const store=new PostgresWorkflowStoreV1(pool,{schema}),runner=new InMemoryProcessRunnerV1(store);
  const names=["authorize","apply","finalize"];
  for(const name of names)await runner.registerTaskDefinition("missions",createTaskDefinitionV1({taskDefinitionId:`mission:${name}`,version:"1",name,
    handlerKey:`mission:${name}`,handlerDigest:hash(`mission:${name}`),effectClass:"internal"}));
  await runner.registerProcessDefinition("missions",createProcessDefinitionV1({processId:"mission-role",version:"1",name:"Durable role transition",
    stages:names.map((name,i)=>({schemaVersion:1,stageId:name,name,kind:"task",taskDefinitionId:`mission:${name}`,taskDefinitionVersion:"1",
      dependsOn:i?[{stageId:names[i-1],outcomes:["succeeded"]}]:[],retryPolicy:{maximumAttempts:8}}))}));
}

class SimpleController {
  constructor(condition,owner){this.condition=condition;this.owner=owner;this.role=null;this.done=false;}
  async initialize(){if(this.condition==="fixed"&&this.owner.input.fixedSpecialist)this.role=await this.owner.activate(`${this.owner.caseId}:fixed`,true);}
  async advance(){
    if(this.condition==="fixed"){
      if(this.owner.phase===this.owner.input.horizon&&this.role){await this.owner.retire(this.role.roleId);this.role=null;this.done=true;}
      return;
    }
    const {specialistStart:start,specialistEnd:end}=this.owner.input;
    if(start===null||this.done)return;
    if(!this.role&&this.owner.phase>=start){
      for(let retry=0;retry<2;retry++)try{this.role=await this.owner.activate(`${this.owner.caseId}:attempt:${retry}`);break;}
      catch(e){if(!e.message.includes("lost activation"))throw e;}
    }
    if(this.role&&this.owner.phase>end&&!this.owner.outstandingSpecialistWork()){await this.owner.retire(this.role.roleId);this.role=null;this.done=true;}
  }
  state(){return {condition:this.condition,role:this.role,done:this.done};}
}

class DurableController {
  constructor(owner,pool,schema){Object.assign(this,{owner,pool,schema});this.role=null;this.started=new Set();this.done=false;this.states=[];}
  async initialize(){}
  async transition(action){
    const runId=`${this.owner.caseId}:${action}`;
    const store=new PostgresWorkflowStoreV1(this.pool,{schema:this.schema});
    const runner=new InMemoryProcessRunnerV1(store,{taskLeaseDurationMs:1000,workerId:`worker:${this.owner.phase}`,taskExecutor:{execute:async input=>{
      assert.equal(input.processInput.caseId,this.owner.caseId);
      assert.equal(input.processInput.action,action);
      if(input.stage.stageId==="authorize"){await this.owner.authorize();return {status:"completed"};}
      if(input.stage.stageId==="apply"){
        if(action==="retire"){await this.owner.fence(this.role.roleId);await this.owner.retire(this.role.roleId);return {status:"completed"};}
        const operationId=`${this.owner.caseId}:durable-activate`,resolved=await this.owner.reconcile(operationId);
        if(resolved.status==="unknown")return {status:"in_flight",reasonCode:"owner_indeterminate"};
        try{this.role=resolved.status==="applied"?resolved.role:await this.owner.activate(operationId);}
        catch(e){if(!e.message.includes("lost activation"))throw e;return {status:"failed",reasonCode:"response_lost",retryable:true};}
        return {status:"completed",result:{roleId:this.role.roleId}};
      }
      return {status:"completed"};
    }}});
    const result=this.started.has(action)
      ?await runner.advance({tenantId:"missions",runId,operationId:`advance:${runId}:${this.owner.phase}`,idempotencyKey:`advance:${runId}:${this.owner.phase}`,logicalTime:timestamp(this.owner.phase)})
      :await runner.start({tenantId:"missions",runId,processId:"mission-role",processVersion:"1",operationId:`start:${runId}`,idempotencyKey:`start:${runId}`,
        input:{caseId:this.owner.caseId,action},logicalTime:timestamp(this.owner.phase)});
    this.started.add(action);this.states.push(result.run);
    if(result.run.status==="failed")throw new Error(`durable baseline unexpectedly failed: ${JSON.stringify(result.run.stageStates)}`);
    return result.run.status==="completed";
  }
  async advance(){
    const {specialistStart:start,specialistEnd:end}=this.owner.input;
    if(start===null||this.done)return;
    if(!this.role&&this.owner.phase>=start){if(!await this.transition("activate"))this.owner.event("transition-blocked");}
    if(this.role&&this.owner.phase>end&&!this.owner.outstandingSpecialistWork()){if(await this.transition("retire")){this.done=true;this.role=null;}}
  }
  state(){return {condition:"durable",done:this.done,role:this.role,workflowStates:this.states};}
}

class MorphogenesisController {
  constructor(owner,pool,schema){Object.assign(this,{owner,pool,schema});this.role=null;this.done=false;this.runtime=null;this.states=[];}
  async initialize(){}
  async prepare(){
    const context=fixture(this.owner.caseId,hash("mission-position")),recordKey=`execution:${this.owner.caseId}`;
    const heads=new Map(),key=i=>`${i.stateKind}:${i.stateKey}`;
    const witness={async verify(i){const prior=heads.get(key(i));return prior?.revision===i.revision&&prior.digest===i.digest;},
      async record(i){const prior=heads.get(key(i));if(i.previousRevision!==null&&(prior?.revision!==i.previousRevision||prior?.digest!==i.previousDigest))return false;
        heads.set(key(i),{revision:i.nextRevision,digest:i.nextDigest});return true;}};
    const options={schema:this.schema,scopeId:this.owner.caseId,rollbackWitness:witness};
    const store=new PostgresMorphogenesisExecutionStoreV1(this.pool,options),headStore=new PostgresMorphologyHeadStoreV1(this.pool,options);
    const headRuntime=new M.MorphologyHeadRuntimeV1({store:headStore,maximumCommitAttempts:4});
    await headRuntime.initialize(M.createInitialMorphologyHeadV1({stateKey:`head:${this.owner.caseId}`,scopeDigest:context.scope.scopeDigest,
      policyDigest:context.policy.policyDigest,morphologyEpoch:1,snapshotDigest:context.snapshot.snapshotDigest,logicalTimeMs:200}));
    const candidate=M.createMorphogenesisDecisionCandidateV1({candidateId:`candidate:${this.owner.caseId}`,proposal:context.proposal,policy:context.policy,
      membershipConfigurationDigest:sha("1"),membershipEpoch:1,authorityId:"authority:mission",authorityEpoch:1,workContractDigest:sha("2"),preparedAtLogicalMs:230,expiresAtLogicalMs:480});
    const authorization=M.createMorphogenesisDecisionAuthorizationV1({authorizationId:`approval:${this.owner.caseId}`,candidateDigest:candidate.candidateDigest,
      route:"authorized_agent",actorType:"agent",actorId:"agent:reviewer",actorMandateDigest:sha("3"),independenceGroupId:"reviewer:independent",disposition:"approved",
      proofDigest:sha("4"),issuedAtLogicalMs:235,expiresAtLogicalMs:470});
    const decision=M.createMorphogenesisDecisionBindingV1({decisionId:`decision:${this.owner.caseId}`,candidate,authorization,decisionPortId:"decision:mission",
      decisionPortVersion:1,decisionPortImplementationDigest:hash("mission-test-issuer"),decidedAtLogicalMs:240});
    const reservation=M.createMorphogenesisBudgetReservationV1({request:M.createMorphogenesisBudgetReservationRequestV1({reservationId:`reservation:${this.owner.caseId}`,
      scopeDigest:context.scope.scopeDigest,proposalDigest:context.proposal.proposalDigest,expectedMorphologyEpoch:1,operationId:`reserve:${this.owner.caseId}`,
      budget:context.proposal.budget,reservedAtLogicalMs:245,expiresAtLogicalMs:500}),status:"reserved",closedAtLogicalMs:null,closeOperationId:null,closeReasonCode:null});
    const agent=M.createMorphogenesisLifecycleAgentV1({agentId:"agent:statistics",peerId:"peer:statistics",instanceId:"instance:statistics",lineageDigest:sha("5"),
      capabilityKeys:["database_forensics"],roleDefinitionDigest:sha("6"),membershipConfigurationDigest:sha("1"),membershipEpoch:1,source:"existing"});
    const search=M.createMorphogenesisCandidateSearchRequestV1({requestId:`search:${this.owner.caseId}`,scopeDigest:context.scope.scopeDigest,positionDigest:hash("mission-position"),
      requiredCapabilityKeys:agent.capabilityKeys,membershipConfigurationDigest:sha("1"),membershipEpoch:1,viewId:"view:local",viewDigest:sha("7"),searchLimit:2,requestedAtLogicalMs:245,expiresAtLogicalMs:500});
    const existing=M.createMorphogenesisExistingCandidateV1({candidateId:`existing:${this.owner.caseId}`,agentId:agent.agentId,peerId:agent.peerId,instanceId:agent.instanceId,
      lineageDigest:agent.lineageDigest,capabilityKeys:agent.capabilityKeys,sourceEvidenceDigest:sha("8"),membershipConfigurationDigest:sha("1"),membershipEpoch:1,
      locallyEvaluatedScoreMicros:9000,budgetUnits:10,observedAtLogicalMs:245,validUntilLogicalMs:450});
    const result=M.createMorphogenesisCandidateSearchResultV1({requestDigest:search.requestDigest,status:"eligible_candidates",completeWithinDeclaredView:true,
      searchedCandidateCount:1,candidates:[existing],observedAtLogicalMs:245},search);
    const teamReceipt=(input,role)=>M.createMorphogenesisSuccessorTeamReceiptV1({operationId:input.operationId,agentDigest:input.agent.agentDigest,teamId:role.roleId,teamEpoch:2,
      teamProposalDigest:context.proposal.proposalDigest,jointWorkContractDigest:hash(role),individualWorkContractDigests:[hash(role)],executionStateDigest:hash(role),
      retainedArtifactDigests:this.owner.artifacts.map(a=>a.digest),invalidatedCausalClosureDigests:[],activatedAtLogicalMs:290+role.createdPhase*10});
    const checkpoint=async input=>M.createMorphogenesisContinuityReceiptV1({operationId:input.operationId,agentDigest:agent.agentDigest,teamReceiptDigest:input.team.receiptDigest,
      checkpointDigest:hash(this.owner.artifacts),preservedArtifactDigests:this.owner.artifacts.map(a=>a.digest),completedCausalNodeDigests:[],invalidatedCausalClosureDigests:[],completedAtLogicalMs:input.logicalTimeMs});
    const fence=async input=>M.createMorphogenesisAuthorityFenceReceiptV1({operationId:input.operationId,agentDigest:agent.agentDigest,teamReceiptDigest:input.team.receiptDigest,
      fencedWorkContractDigests:input.team.individualWorkContractDigests,revokedActionGrantDigests:[],successorFenceDigests:[await this.owner.fence(this.role.roleId)],
      effectReceiptDigest:hash(this.role),fencedAtLogicalMs:input.logicalTimeMs});
    const detach=async input=>M.createMorphogenesisTerminalAgentReceiptV1({operationId:input.operationId,agentDigest:agent.agentDigest,disposition:"detached",membershipConfigurationDigest:null,
      membershipEpoch:null,lifecycleReceiptDigest:hash(await this.owner.retire(this.role.roleId)),terminatedAtLogicalMs:input.logicalTimeMs});
    this.runtime=new M.MorphogenesisExecutionRuntimeV1({store,maximumCommitAttempts:4,
      discovery:{async search(){return result;}},profiles:{async resolve(){return null;}},lifecycle:{async eligibility(){return agent;}},
      attestation:{async attest(input){return M.createMorphogenesisAgentAttestationV1({operationId:input.operationId,agentDigest:agent.agentDigest,profileDigest:null,
        runtimeAttestationDigest:sha("9"),capabilityAssessmentDigests:[sha("a")],eligibilityEvidenceDigests:[sha("b")],attestedAtLogicalMs:270,validUntilLogicalMs:450});}},
      teams:{activateSuccessor:async input=>{const role=await this.owner.activate(input.operationId);this.role=role;return teamReceipt(input,role);},
        reconcileActivation:async input=>{const r=await this.owner.reconcile(input.operationId);this.ownerUnknown=r.status==="unknown";if(r.status!=="applied")return null;this.role=r.role;return teamReceipt(input,r.role);}},
      morphology:new M.MorphologyHeadMorphogenesisActivationPortV1(headRuntime),continuity:{checkpoint,reconcile:checkpoint},authority:{fence,reconcile:fence},
      detachment:{detach,reconcile:detach},retirement:{},budgets:{async release(input){return M.createMorphogenesisBudgetReservationV1({request:reservation.request,status:"released",
        closedAtLogicalMs:input.logicalTimeMs,closeOperationId:input.releaseOperationId,closeReasonCode:input.reasonCode});}}});
    this.recordKey=recordKey;this.context=context;this.decision=decision;this.reservation=reservation;
    await this.runtime.initialize({stateKey:recordKey,scope:context.scope,proposalDigest:context.proposal.proposalDigest,targetDigest:context.target.targetDigest,decision,budgetReservation:reservation,
      morphologyHeadStateKey:`head:${this.owner.caseId}`,expectedMorphologyEpoch:1,resultingSnapshotDigest:hash({case:this.owner.caseId,role:"statistics"}),positionDigest:search.positionDigest,
      requiredCapabilityKeys:agent.capabilityKeys,searchRequest:search,profile:null,profileCertificationDigest:null,logicalTimeMs:250});
    await this.runtime.resolveAgent({stateKey:recordKey,logicalTimeMs:260});await this.runtime.attest({stateKey:recordKey,logicalTimeMs:270});
    await this.runtime.verifyEnrollment({stateKey:recordKey,logicalTimeMs:280});
  }
  async advance(){
    const {specialistStart:start,specialistEnd:end}=this.owner.input;if(start===null||this.done)return;
    if(!this.runtime&&this.owner.phase>=start)await this.prepare();
    if(!this.runtime)return;
    let state=await this.runtime.required(this.recordKey);
    const time=290+this.owner.phase*10;
    if(["enrollment_verified","activating_team"].includes(state.phase)){
      for(let attempt=0;attempt<2;attempt++){
        try{await this.runtime.activateTeam({stateKey:this.recordKey,logicalTimeMs:time});break;}
        catch(e){const pending=await this.runtime.required(this.recordKey);if(pending.phase!=="activating_team"||(!this.ownerUnknown&&!e.message.includes("lost activation")))throw e;
          if(attempt===1)this.owner.event("transition-blocked",{reason:e.message});}
      }
      state=await this.runtime.required(this.recordKey);
    }
    if(state.phase==="team_active")await this.runtime.commitMorphology({stateKey:this.recordKey,logicalTimeMs:time});
    state=await this.runtime.required(this.recordKey);
    if(state.phase==="morphology_active"&&this.owner.phase>end&&!this.owner.outstandingSpecialistWork()){
      await this.runtime.checkpoint({stateKey:this.recordKey,logicalTimeMs:time});await this.runtime.fenceAuthority({stateKey:this.recordKey,logicalTimeMs:time});
      await this.runtime.drain({stateKey:this.recordKey,logicalTimeMs:time});await this.runtime.releaseBudget({stateKey:this.recordKey,logicalTimeMs:time});
      await this.runtime.complete({stateKey:this.recordKey,disposition:"success",outcomeEvidenceDigests:[hash(this.owner.artifacts)],logicalTimeMs:time});this.role=null;this.done=true;
    }
    this.states.push(await this.runtime.required(this.recordKey));
  }
  state(){return {condition:"morphogenesis",role:this.role,done:this.done,context:this.context??null,decision:this.decision??null,reservation:this.reservation??null,executions:this.states};}
}
export function controller(condition,owner,pool,schema){
  if(condition==="durable")return new DurableController(owner,pool,schema);
  if(condition==="morphogenesis")return new MorphogenesisController(owner,pool,schema);
  return new SimpleController(condition,owner);
}
