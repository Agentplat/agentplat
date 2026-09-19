import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign, verify, randomBytes } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../../../packages/collective-runtime/dist/morphogenesis.js";
import * as T from "../../../packages/collective-runtime/dist/team-formation.js";
import * as C from "../../../packages/collective-control/dist/index.js";
import { createPostgresPool } from "../../../packages/postgres/dist/index.js";
import { runMigrations as migrateHost, PostgresMorphologyHeadStoreV1,
  PostgresMorphogenesisExecutionStoreV1, PostgresMorphogenesisBudgetReservationPortV1,
} from "../../../packages/collective-host-postgres/dist/index.js";
import { runMigrations as migrateControl, PostgresCollectiveExecutionRepositoryV1,
  PostgresCollectiveAuthorityRepositoryV1,
} from "../../../packages/collective-control-postgres/dist/index.js";
import { TeamFormationMorphogenesisSuccessorPortV1, WorkActionMorphogenesisAuthorityFencePortV1 } from "../../../packages/collective-host/dist/morphogenesis.js";
import { fixture } from "./fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sha = c => `sha256:${c.repeat(64)}`;
const digest = x => `sha256:${createHash("sha256").update(typeof x === "string" || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest("hex")}`;
const wall = ms => new Date(Date.parse("2026-09-19T12:00:00.000Z") + ms).toISOString();
const write = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const events = [];
const record = (kind, value) => events.push({sequence: events.length + 1, kind, value});

// Test-only Team store adapter. Policy/state validation remains the real runtime's.
class PgTeamStore {
  constructor(pool, schema) { this.pool = pool; this.schema = schema; }
  async load(key) {
    const r = await this.pool.query(`SELECT state FROM "${this.schema}".paper_team_states WHERE state_key=$1`, [key]);
    return r.rows[0]?.state ?? null;
  }
  async save({state, expectedRevision}) {
    const r = expectedRevision === null
      ? await this.pool.query(`INSERT INTO "${this.schema}".paper_team_states(state_key, revision, state) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING`, [state.stateKey,state.revision,JSON.stringify(state)])
      : await this.pool.query(`UPDATE "${this.schema}".paper_team_states SET revision=$2,state=$3::jsonb WHERE state_key=$1 AND revision=$4`, [state.stateKey,state.revision,JSON.stringify(state),expectedRevision]);
    return r.rowCount === 1;
  }
}

function witness() {
  const states = new Map();
  const key = i => `${i.scopeId}:${i.stateKind}:${i.stateKey}`;
  return {
    async verify(i) {
      for (let n=0;n<250;n++) {
        const current=states.get(key(i));
        if(current?.revision===i.revision && current?.digest===i.digest)return true;
        await new Promise(r=>setTimeout(r,1));
      }
      return false;
    },
    async record(i) {
      const current=states.get(key(i));
      if(i.previousRevision===null ? !!current : current?.revision!==i.previousRevision || current?.digest!==i.previousDigest)return false;
      states.set(key(i),{revision:i.nextRevision,digest:i.nextDigest});return true;
    },
  };
}

const position = T.createTeamPositionV1({schemaVersion:1,positionId:"position:forensics",workItemId:"work:test",workItemRevision:1,
  roleKey:"database_forensics",requiredCapabilityKeys:["database_forensics"],completionCriteria:["artifact_published"],
  dependsOnPositionIds:[],budgetUnits:10,maximumActionBudgetUnits:5});
const teamPolicy = T.createTeamFormationPolicyV1({schemaVersion:1,policyId:"team-policy:paper",policyVersion:1,parentPolicyDigest:null,
  minimumDistinctPeers:1,minimumIndependenceGroups:1,maximumTotalBudgetUnits:20,requireDistinctPeerPerPosition:true,
  limits:{maximumPositions:4,maximumBidsPerPosition:8,maximumMembers:4,maximumSearchNodes:100,maximumReasonCodesPerDecision:8,
    maximumHistoryEntries:8,maximumRequestInvalidations:8,maximumRequestTtlMs:1000,maximumTeamDurationMs:1000,maximumCommitAttempts:8}});

function mandate() {
  const statement={schemaVersion:1,mandateId:"mandate:paper-work",tenantId:"tenant:test",policyDomainId:"policy-domain:test",
    issuerId:"issuer:paper",revision:1,predecessorDigest:null,subjectPeerIds:["peer:a","peer:b","peer:expiry"],
    objective:{schemaVersion:1,meshId:"mesh:test",objectiveId:"objective:test",objectiveDocumentId:"objective-document:test",minimumObjectiveRevision:1,maximumObjectiveRevision:1},
    work:{schemaVersion:1,workItemIds:["work:test"],permittedRoleKeys:["database_forensics"],maximumWorkItemRevision:1},
    permittedCapabilityKeys:["database_forensics"],permittedActions:[{schemaVersion:1,namespace:"paper",toolId:"artifact",operation:"write"}],
    budget:{schemaVersion:1,totalBudgetUnits:100,maximumWorkBudgetUnits:20,maximumActionBudgetUnits:5,maximumConcurrentWorkReservations:4,maximumConcurrentActionReservations:4,reservationLifetimeMs:500},
    validFrom:wall(0),validUntil:wall(350),roomProvenance:null,
    evidence:{schemaVersion:1,redactionPolicyId:"redaction:paper",retentionClass:"standard",requireDurablePreDispatchEvidence:true}};
  return C.createDelegationMandateV1({statement,proof:{schemaVersion:1,kind:"local_attestation",issuerId:statement.issuerId,
    attestorId:"attestor:paper",attestationId:"attestation:paper",signedDigest:C.delegationMandateDigestV1(statement)}});
}

async function mutateWork(repository, reducer) {
  for(let i=0;i<8;i++) {
    const old=await repository.read(), decision=reducer(old);
    if(!decision.accepted)throw new Error(`work owner rejected: ${decision.code}`);
    if(decision.state.stateDigest===old.stateDigest)return decision;
    if(await repository.compareAndSwap({expectedGeneration:old.generation,expectedStateDigest:old.stateDigest,nextState:decision.state}))return decision;
  }
  throw new Error("work owner CAS attempts exhausted");
}

async function setup(pool,schema) {
  await migrateHost(pool,{schema,createSchema:true});
  await migrateControl(pool,{schema});
  await pool.query(`CREATE TABLE "${schema}".paper_team_states(state_key text PRIMARY KEY,revision integer NOT NULL,state jsonb NOT NULL)`);
  await pool.query(`CREATE TABLE "${schema}".paper_work_effects(effect_id text PRIMARY KEY,work_id text NOT NULL,body jsonb NOT NULL)`);
  const options={schema,tenantId:"tenant:test",policyDomainId:"policy-domain:test"};
  const work=new PostgresCollectiveExecutionRepositoryV1(pool,options);
  await work.initialize(C.createCollectiveExecutionStateV1(options));
  const authority=new PostgresCollectiveAuthorityRepositoryV1(pool,options), document=mandate();
  await authority.initialize(C.createCollectiveAuthorityStateV1(options));
  const old=await authority.read();
  const accepted=C.acceptDelegationMandateV1(old,{mandate:document,verification:{schemaVersion:1,verifierId:"fixture-verifier",verifierVersion:1,
    issuerId:document.statement.issuerId,signedDigest:document.mandateDigest,verifiedAt:wall(100),status:"verified"},acceptedAtLogicalMs:100});
  assert.equal(accepted.accepted,true);
  assert.equal(await authority.compareAndSwap({expectedGeneration:old.generation,expectedStateDigest:old.stateDigest,nextState:accepted.state}),true);
  const rollbackWitness=witness();
  const scopeOptions={schema,scopeId:`paper:${schema}`,rollbackWitness};
  const headStore=new PostgresMorphologyHeadStoreV1(pool,scopeOptions);
  const heads=new M.MorphologyHeadRuntimeV1({store:headStore,maximumCommitAttempts:8});
  const context=fixture("base",position.positionDigest);
  await heads.initialize(M.createInitialMorphologyHeadV1({stateKey:"head:paper",scopeDigest:context.scope.scopeDigest,
    policyDigest:context.policy.policyDigest,morphologyEpoch:1,snapshotDigest:context.snapshot.snapshotDigest,logicalTimeMs:200}));
  const {budgetDigest,...capacity}=context.proposal.budget;
  capacity.maximumActiveAgents=12;capacity.maximumResourceUnits=100;
  capacity.maximumInteractionUnits=1000;capacity.maximumActionUnits=100;capacity.maximumInputTokens=1000;
  capacity.maximumOutputTokens=1000;capacity.maximumTotalTokens=2000;capacity.maximumCosts=[{currency:"USD",micros:10000000}];
  const budgets=new PostgresMorphogenesisBudgetReservationPortV1(pool,{...scopeOptions,scopeDigest:context.scope.scopeDigest,capacity});
  return {pool,schema,work,authority,document,heads,headStore,budgets,scopeOptions,options};
}

async function transition(env,label,activationTime=300) {
  const context=fixture(label,position.positionDigest);
  assert(context.target.invariantDigests.includes(position.positionDigest),"approved target binds the explicit Team-position mapping");
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const signatures=new Map();
  const authorizations={
    async issue({candidate}) {
      const authorization=M.createMorphogenesisDecisionAuthorizationV1({authorizationId:`authorization:${label}`,candidateDigest:candidate.candidateDigest,
        route:"authorized_agent",actorType:"agent",actorId:`agent:reviewer:${label}`,actorMandateDigest:sha("a"),independenceGroupId:`reviewer:${label}`,
        disposition:"approved",proofDigest:digest(publicKey.export({type:"spki",format:"pem"})),issuedAtLogicalMs:235,expiresAtLogicalMs:470});
      const signature=sign(null,Buffer.from(JSON.stringify(authorization)),privateKey).toString("base64");
      signatures.set(authorization.authorizationDigest,signature);
      record("signed-approval",{authorization,signature,publicKey:publicKey.export({type:"spki",format:"pem"})});
      return authorization;
    },
    async verify({candidate,authorization}) {
      const signature=signatures.get(authorization.authorizationDigest);
      return candidate.candidateDigest===authorization.candidateDigest && !!signature && verify(null,Buffer.from(JSON.stringify(authorization)),publicKey,Buffer.from(signature,"base64"));
    },
  };
  const decisions=new M.MorphogenesisDecisionRuntimeV1({decisionPortId:`decider:${label}`,decisionPortVersion:1,decisionPortImplementationDigest:digest("paper-local-ed25519"),
    policy:context.policy,proposals:{async resolve(d){return d===context.proposal.proposalDigest?context.proposal:null;}},
    authorizations,store:new M.InMemoryMorphogenesisDecisionStoreV1()});
  const candidate=await decisions.prepare({candidateId:`candidate:${label}`,proposal:context.proposal,policy:context.policy,
    membershipConfigurationDigest:sha("1"),membershipEpoch:1,authorityId:"authority:paper",authorityEpoch:1,workContractDigest:sha("2"),preparedAtLogicalMs:230,expiresAtLogicalMs:480});
  const decision=await decisions.decide({candidate,logicalTimeMs:240});
  assert(decision);
  assert.equal(await authorizations.verify({candidate:{...candidate,candidateDigest:sha("0")},authorization:decision.authorization}),false);
  const reserved=await env.budgets.reserve(M.createMorphogenesisBudgetReservationRequestV1({reservationId:`reservation:${label}`,
    scopeDigest:context.scope.scopeDigest,proposalDigest:context.proposal.proposalDigest,expectedMorphologyEpoch:1,
    operationId:`reserve:${label}`,budget:context.proposal.budget,reservedAtLogicalMs:245,expiresAtLogicalMs:500}));
  const agent=M.createMorphogenesisLifecycleAgentV1({agentId:`agent:${label}`,peerId:`peer:${label}`,instanceId:`instance:${label}`,lineageDigest:digest(`lineage:${label}`),
    capabilityKeys:["database_forensics"],roleDefinitionDigest:digest("role:forensics"),membershipConfigurationDigest:sha("1"),membershipEpoch:1,source:"existing"});
  const search=M.createMorphogenesisCandidateSearchRequestV1({requestId:`search:${label}`,scopeDigest:context.scope.scopeDigest,positionDigest:position.positionDigest,
    requiredCapabilityKeys:position.requiredCapabilityKeys,membershipConfigurationDigest:sha("1"),membershipEpoch:1,viewId:"view:paper",viewDigest:sha("2"),searchLimit:8,requestedAtLogicalMs:245,expiresAtLogicalMs:500});
  const discovered=M.createMorphogenesisExistingCandidateV1({candidateId:`discovered:${label}`,agentId:agent.agentId,peerId:agent.peerId,instanceId:agent.instanceId,
    lineageDigest:agent.lineageDigest,capabilityKeys:agent.capabilityKeys,sourceEvidenceDigest:sha("3"),membershipConfigurationDigest:sha("1"),membershipEpoch:1,
    locallyEvaluatedScoreMicros:9000,budgetUnits:10,observedAtLogicalMs:245,validUntilLogicalMs:450});
  const searchResult=M.createMorphogenesisCandidateSearchResultV1({requestDigest:search.requestDigest,status:"eligible_candidates",completeWithinDeclaredView:true,
    searchedCandidateCount:1,candidates:[discovered],observedAtLogicalMs:245},search);
  const formation=new T.TeamFormationRuntimeV1({stateKey:`formation:${label}`,formationId:`formation:${label}`,formationVersion:1,
    implementationId:"formation:paper",policy:teamPolicy,store:new PgTeamStore(env.pool,env.schema)});
  let workContract;
  const teamPort=new TeamFormationMorphogenesisSuccessorPortV1({formation,commands:{
    async buildFormationRequest(input) {
      const tc=T.createTeamCandidateV1({schemaVersion:1,candidateId:`team-candidate:${label}`,peerId:agent.peerId,instanceId:agent.instanceId,
        independenceGroupId:`specialist:${label}`,sourceCandidateDigest:discovered.candidateDigest,sourceRequestDigest:search.requestDigest,
        sourceDecisionDigest:decision.decisionDigest,eligibleWorkItemId:position.workItemId,eligibleWorkItemRevision:1,requiredCapabilityKeys:position.requiredCapabilityKeys});
      const bid=T.createTeamPositionBidV1({schemaVersion:1,bidId:`bid:${label}`,positionId:position.positionId,candidate:tc,sourceBidDigest:digest(`bid:${label}`),
        capacityReservationUnits:1,budgetUnits:10,expectedCompletionAtLogicalMs:activationTime+40,locallyEvaluatedScoreMicros:9000,observedAtLogicalMs:280,validUntilLogicalMs:450});
      return T.createTeamFormationRequestV1({schemaVersion:1,requestId:input.operationId,scope:T.createTeamFormationScopeV1({tenantId:context.scope.tenantId,
        meshId:context.scope.meshId,policyDomainId:context.scope.policyDomainId,missionIntentId:context.scope.missionIntentId,objectiveId:context.scope.objectiveId,
        rootWorkItemId:context.scope.workItemId,rootWorkItemRevision:1}),membershipEpoch:1,membershipConfigurationDigest:sha("1"),
        positions:[position],bids:[bid],logicalTimeMs:activationTime,validUntilLogicalMs:450});
    },
    async resolveWorkContracts({proposal}) {
      // Re-read real authoritative state at owner use time, after organizational approval.
      const authorization=C.authorizeDelegationMandateAtV1(await env.authority.read(),{mandateId:env.document.statement.mandateId,
        mandateDigest:env.document.mandateDigest,at:wall(activationTime)});
      record("owner-admission",{label,activationTime,authorization});
      if(!authorization.authorized)throw new Error(`owner admission: ${authorization.code}`);
      const body={schemaVersion:1,workContractId:`work-contract:${label}`,generation:1,tenantId:context.scope.tenantId,policyDomainId:context.scope.policyDomainId,
        mandate:{schemaVersion:1,mandateId:env.document.statement.mandateId,mandateRevision:1,mandateDigest:env.document.mandateDigest},
        objective:{schemaVersion:1,meshId:context.scope.meshId,objectiveId:context.scope.objectiveId,objectiveDocumentId:"objective-document:test",objectiveRevision:1,
          acceptedMessageId:"objective-message:test",acceptedPolicyDigest:sha("a")},
        assignment:{schemaVersion:1,workItemId:position.workItemId,workItemRevision:1,ownerPeerId:"peer:owner",assignedPeerId:agent.peerId,assignedInstanceId:agent.instanceId,
          assignmentAuthorityId:"assignment:paper",assignmentEpoch:1,authorityGeneration:1,fencingToken:`fence:${label}`,leaseExpiresAtLogicalMs:350,workDeadline:wall(350)},
        roleKey:position.roleKey,requiredCapabilityKeys:position.requiredCapabilityKeys,completionCriteria:position.completionCriteria,inputReferenceDigest:null,
        reservedBudgetUnits:10,maximumActionBudgetUnits:5,trustPolicyId:"trust:paper",inferencePolicyId:"inference:paper",createdAtLogicalMs:activationTime,
        updatedAtLogicalMs:activationTime,status:"active",terminalReasonCode:null};
      workContract={...body,workContractDigest:C.workContractDigestV1(body)};
      await mutateWork(env.work,state=>C.registerWorkContractV1(state,{mandate:env.document,workContract,authorizedAt:wall(activationTime),acceptedAtLogicalMs:activationTime}));
      return [workContract];
    },
    async continueExecution({jointWorkContract}) {
      const current=(await env.work.read()).workContracts.find(w=>w.workContractId===workContract.workContractId);
      assert.equal(current.status,"active");
      // Local instrumented work product, not a protected ActionGateway effect.
      const workProduct={label,workContractDigest:current.workContractDigest,jointWorkContractDigest:jointWorkContract.jointWorkContractDigest,result:2+3};
      await env.pool.query(`INSERT INTO "${env.schema}".paper_work_effects(effect_id,work_id,body) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING`,
        [`effect:${label}`,current.workContractId,JSON.stringify(workProduct)]);
      return {executionStateDigest:digest(workProduct),retainedArtifactDigests:[digest(workProduct)],invalidatedCausalClosureDigests:[]};
    },
  }});
  const executionStore=new PostgresMorphogenesisExecutionStoreV1(env.pool,env.scopeOptions);
  let inFlight=0,releaseJob;
  const startWork = async () => {
    const work=(await env.work.read()).workContracts.find(w=>w.workContractId===`work-contract:${label}`);
    if(!work || work.status!=="active")throw new Error("work admission is fenced");
    inFlight++;
    const job=new Promise(resolve=>{releaseJob=resolve;}).then(()=>{inFlight--;record("admitted-work-finished",{label});});
    record("work-admitted",{label,workContractDigest:work.workContractDigest});
    return {job,finish:()=>releaseJob()};
  };
  const checkpoint = async input => {
    const rows=(await env.pool.query(`SELECT body FROM "${env.schema}".paper_work_effects WHERE work_id=$1`,[`work-contract:${label}`])).rows;
    return M.createMorphogenesisContinuityReceiptV1({operationId:input.operationId,agentDigest:input.agent.agentDigest,
      teamReceiptDigest:input.team.receiptDigest,checkpointDigest:digest(rows),preservedArtifactDigests:rows.map(r=>digest(r.body)),
      completedCausalNodeDigests:[],invalidatedCausalClosureDigests:[],completedAtLogicalMs:input.logicalTimeMs});
  };
  let fenced;
  const fence = async input => {
    if(fenced)return fenced;
    const prior=(await env.work.read()).workContracts.find(w=>w.workContractId===`work-contract:${label}`);
    const changed=await mutateWork(env.work,state=>C.transitionWorkContractV1(state,{workContractId:prior.workContractId,
      expectedGeneration:prior.generation,expectedDigest:prior.workContractDigest,nextStatus:"revoked",terminalReasonCode:"participant_draining",logicalTimeMs:input.logicalTimeMs}));
    fenced={fencedWorkContractDigests:[prior.workContractDigest],revokedActionGrantDigests:[],
      successorFenceDigests:[changed.state.stateDigest],effectReceiptDigest:digest({work:changed.state.workContracts,inFlight})};
    record("work-fenced",{label,inFlight,state:changed.state});return fenced;
  };
  let detached;
  const detach = async input => {
    if(inFlight){record("drain-blocked",{label,inFlight,operationId:input.operationId});return null;}
    if(detached)return detached;
    const state=await formation.loadState();
    await formation.cancel({reasonCode:"participant_detached",expectedProposalDigest:state.team.proposal.proposalDigest,logicalTimeMs:input.logicalTimeMs});
    detached=M.createMorphogenesisTerminalAgentReceiptV1({operationId:input.operationId,agentDigest:input.agent.agentDigest,disposition:"detached",
      membershipConfigurationDigest:null,membershipEpoch:null,lifecycleReceiptDigest:digest(await formation.loadState()),terminatedAtLogicalMs:input.logicalTimeMs});
    record("participant-detached",{label,receipt:detached});return detached;
  };
  const runtime=new M.MorphogenesisExecutionRuntimeV1({store:executionStore,maximumCommitAttempts:8,
    discovery:{async search(){return searchResult;}},profiles:{async resolve(){return null;}},
    lifecycle:{async eligibility(){return agent;},async createAndEnroll(){throw new Error("unexpected creation");},async reconcileCreateAndEnroll(){throw new Error("unexpected creation");}},
    attestation:{async attest(input){return M.createMorphogenesisAgentAttestationV1({operationId:input.operationId,agentDigest:agent.agentDigest,profileDigest:null,
      runtimeAttestationDigest:sha("4"),capabilityAssessmentDigests:[sha("5")],eligibilityEvidenceDigests:[sha("6")],attestedAtLogicalMs:270,validUntilLogicalMs:450});}},
    teams:teamPort,morphology:new M.MorphologyHeadMorphogenesisActivationPortV1(env.heads),budgets:env.budgets,
    continuity:{checkpoint,reconcile:checkpoint},authority:new WorkActionMorphogenesisAuthorityFencePortV1({fence,reconcile:fence}),
    detachment:{detach,reconcile:detach},retirement:{}});
  const stateKey=`execution:${label}`;
  await runtime.initialize({stateKey,scope:context.scope,proposalDigest:context.proposal.proposalDigest,targetDigest:context.target.targetDigest,decision,
    budgetReservation:reserved,morphologyHeadStateKey:"head:paper",expectedMorphologyEpoch:1,resultingSnapshotDigest:digest(`successor:${label}`),
    positionDigest:position.positionDigest,requiredCapabilityKeys:position.requiredCapabilityKeys,searchRequest:search,profile:null,profileCertificationDigest:null,logicalTimeMs:250});
  await runtime.resolveAgent({stateKey,logicalTimeMs:260});
  await runtime.attest({stateKey,logicalTimeMs:270});
  await runtime.verifyEnrollment({stateKey,logicalTimeMs:280});
  record("approved-transition",{label,context,decision,reservation:reserved,agent,search,searchResult});
  return {label,context,decision,candidate,decisions,runtime,stateKey,formation,executionStore,activationTime,startWork};
}

async function main() {
  const output=path.resolve(process.argv[2]??"");
  assert(process.argv[2] && !existsSync(output),"supply a new output directory");
  const port=Number(process.env.MORPHOGENESIS_PG_PORT);
  assert(Number.isInteger(port)&&port>0,"set MORPHOGENESIS_PG_PORT for dedicated loopback PostgreSQL");
  mkdirSync(output,{recursive:true});
  const poolOptions={host:"127.0.0.1",port,user:"postgres",database:"postgres",max:6};
  const pool=createPostgresPool(poolOptions),schemas=[];
  const summary={sourceCommit:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
    startedAt:new Date().toISOString(),evidenceClass:"local PostgreSQL integration pilot; fixture discovery/membership/attestation",externalSpendUsd:0,modelCalls:0};
  try {
    const schema=`paper_race_${randomBytes(6).toString("hex")}`;schemas.push(schema);
    const env=await setup(pool,schema);
    const a=await transition(env,"a"),b=await transition(env,"b");
    await Promise.all([a,b].map(t=>t.runtime.activateTeam({stateKey:t.stateKey,logicalTimeMs:t.activationTime})));
    const before={head:await env.headStore.load("head:paper"),work:await env.work.read(),teams:await Promise.all([a,b].map(t=>t.formation.loadState())),
      effects:(await pool.query(`SELECT * FROM "${schema}".paper_work_effects ORDER BY effect_id`)).rows};
    const commits=await Promise.allSettled([a,b].map(t=>t.runtime.commitMorphology({stateKey:t.stateKey,logicalTimeMs:310})));
    const accepted=commits.filter(r=>r.status==="fulfilled");
    assert.equal(accepted.length,1);
    const winner=[a,b][commits.findIndex(r=>r.status==="fulfilled")],loser=[a,b][commits.findIndex(r=>r.status==="rejected")];
    const after={head:await env.headStore.load("head:paper"),work:await env.work.read(),executions:await Promise.all([a,b].map(t=>t.runtime.required(t.stateKey)))};
    const prior=(await env.work.read()).workContracts.find(w=>w.workContractId===`work-contract:${loser.label}`);
    await mutateWork(env.work,state=>C.transitionWorkContractV1(state,{workContractId:prior.workContractId,expectedGeneration:prior.generation,
      expectedDigest:prior.workContractDigest,nextStatus:"released",terminalReasonCode:"losing_morphology_proposal",logicalTimeMs:320}));
    const loserTeam=await loser.formation.loadState();
    await loser.formation.cancel({reasonCode:"losing_morphology_proposal",expectedProposalDigest:loserTeam.team.proposal.proposalDigest,logicalTimeMs:320});
    await env.budgets.release({reservationId:`reservation:${loser.label}`,proposalDigest:loser.context.proposal.proposalDigest,
      releaseOperationId:`cleanup-budget:${loser.label}`,reasonCode:"losing_morphology_proposal",logicalTimeMs:320});
    const cleanup={work:await env.work.read(),team:await loser.formation.loadState(),execution:await loser.runtime.required(loser.stateKey)};
    assert.equal(cleanup.work.workContracts.find(w=>w.workContractId===prior.workContractId).status,"released");
    assert.equal(cleanup.team.team.status,"cancelled");
    const reopenedPool=createPostgresPool(poolOptions);
    try {
      const reopened=new PostgresMorphologyHeadStoreV1(reopenedPool,env.scopeOptions);
      assert.equal((await reopened.load("head:paper")).headDigest,after.head.headDigest);
      const workReopened=new PostgresCollectiveExecutionRepositoryV1(reopenedPool,env.options);
      assert.equal((await workReopened.read()).stateDigest,cleanup.work.stateDigest);
    } finally {await reopenedPool.end();}
    write(path.join(output,"race.json"),{before,after,cleanup,winner:winner.label,loser:loser.label,commits:commits.map(r=>r.status==="fulfilled"?{status:r.status}:{status:r.status,reason:r.reason.message})});
    summary.race={approvedProposals:2,teamsActivatedBeforeHead:before.teams.filter(t=>t.team.status==="active").length,
      workProductsBeforeHead:before.effects.length,headEpochBefore:before.head.morphologyEpoch,acceptedSuccessors:1,
      losingWorkReleased:true,losingTeamCancelled:true,losingExecutionPhase:cleanup.execution.phase,newPoolReopenVerified:true};
    const admitted=await winner.startWork();
    await winner.runtime.checkpoint({stateKey:winner.stateKey,logicalTimeMs:325});
    await winner.runtime.fenceAuthority({stateKey:winner.stateKey,logicalTimeMs:330});
    await assert.rejects(winner.startWork(),/admission is fenced/);
    await assert.rejects(winner.runtime.drain({stateKey:winner.stateKey,logicalTimeMs:335}));
    const pending=await winner.runtime.required(winner.stateKey);
    assert.equal(pending.phase,"draining");assert.equal(pending.terminalAgent,null);
    admitted.finish();await admitted.job;
    await winner.runtime.drain({stateKey:winner.stateKey,logicalTimeMs:340});
    await winner.runtime.releaseBudget({stateKey:winner.stateKey,logicalTimeMs:345});
    const terminal=await winner.runtime.complete({stateKey:winner.stateKey,disposition:"success",outcomeEvidenceDigests:[digest(before.effects)],logicalTimeMs:346});
    assert.equal(terminal.phase,"completed");
    assert.equal(terminal.terminalAgent.operationId,pending.pendingOperation.operationId);
    write(path.join(output,"drain.json"),{pending,terminal,work:await env.work.read(),team:await winner.formation.loadState()});
    summary.drain={newWorkRejectedAfterFence:true,blockedWhileAdmittedJobPending:true,originalOperationReconciled:true,
      terminalPhase:terminal.phase,scope:"Work reducer plus application admission/draining adapter; no ActionGateway or external provider"};
    const expirySchema=`paper_expiry_${randomBytes(6).toString("hex")}`;schemas.push(expirySchema);
    const expiredEnv=await setup(pool,expirySchema),expired=await transition(expiredEnv,"expiry",380);
    assert(await expired.decisions.verifyRetained({candidate:expired.candidate,logicalTimeMs:380}));
    let rejection;
    try {await expired.runtime.activateTeam({stateKey:expired.stateKey,logicalTimeMs:380});}
    catch(e){rejection=e.message;}
    assert.match(rejection??"",/owner admission/);
    const expiry={rejection,decision:expired.decision,mandate:expiredEnv.document,work:await expiredEnv.work.read(),team:await expired.formation.loadState(),
      execution:await expired.runtime.required(expired.stateKey),head:await expiredEnv.headStore.load("head:paper")};
    assert.equal(expiry.work.workContracts.length,0);assert.notEqual(expiry.team.team.status,"active");assert.equal(expiry.head.morphologyEpoch,1);
    write(path.join(output,"expiry.json"),expiry);
    summary.expiry={decisionStillValid:true,workContracts:0,teamStatus:expiry.team.team.status,headEpoch:1,rejection};
    summary.status="completed";
  } catch(error) {summary.status="failed";summary.error={message:error.message,stack:error.stack};throw error;}
  finally {
    summary.completedAt=new Date().toISOString();
    write(path.join(output,"events.json"),events);write(path.join(output,"summary.json"),summary);
    write(path.join(output,"configuration.json"),{teamPolicy,position,wallClockOrigin:wall(0),mandateTrust:"local test attestation",
      discoveryMembershipAttestation:"fixtures",teamStore:"test PostgreSQL CAS adapter",rollbackWitness:"process-local; not host-loss safe"});
    const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
    write(path.join(output,"environment.json"),{node:process.version,platform:process.platform,arch:process.arch,
      postgres:(await pool.query("SELECT version() AS version")).rows[0].version,
      postgresImageId:process.env.MORPHOGENESIS_PG_IMAGE_ID??"not-recorded",
      sourceFiles: ["run.mjs","fixture.mjs","protocol.md","verify.mjs"].map(f=>({path:f,digest:digest(readFileSync(new URL(f,import.meta.url)))})),
      lockfileDigest:digest(readFileSync(path.join(root,"pnpm-lock.yaml"))),
      compiledModules:walk(path.join(root,"packages")).filter(f=>f.includes('/dist/')&&f.endsWith('.js')).map(f=>({path:path.relative(root,f),digest:digest(readFileSync(f))}))});
    for(const schema of schemas)await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
    write(path.join(output,"manifest.json"),readdirSync(output).filter(f=>f!=="manifest.json").sort().map(f=>({path:f,digest:digest(readFileSync(path.join(output,f)))})));
  }
  console.log(JSON.stringify(summary));
}
await main();
