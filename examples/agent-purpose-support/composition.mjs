// Local deterministic demonstration. No model, credentials or external messages.
import * as R from "../../packages/rooms/dist/index.js";
import * as P from "../../packages/rooms-postgres/dist/index.js";
export const tenant = "support-demo",
  roomId = "support-room",
  purposeAgent = "purpose-support",
  instructionAgent = "instruction-support";
export const actors = Object.freeze({
  owner: Object.freeze({}),
  worker: Object.freeze({}),
  customer: Object.freeze({}),
  collector: Object.freeze({}),
});
const identities = new Map(
  Object.entries(actors).map(([name, context]) => [context, name]),
);
const authenticate = async (context) =>
  identities.has(context)
    ? { tenantId: tenant, subjectId: identities.get(context) }
    : null;
export const auth = { authenticate, authorize: async () => true };
export async function openComposition(schema) {
  if (!/^support_demo_[a-f0-9]{12}$/.test(schema))
    throw Error("Use an isolated demo schema");
  const pool = P.createPostgresPool({ options: "-c search_path=pg_catalog" }),
    q = `"${schema}"`;
  const governance = new P.PostgresAgentGovernanceStoreV1(pool, { schema }),
    execution = new P.PostgresAgentExecutionStoreV1(pool, { schema }),
    missions = new P.PostgresPurposeMissionStoreV1(pool, { schema }),
    inceptions = new P.PostgresAgentInceptionStoreV1(pool, { schema }),
    signals = new P.PostgresAttentionSignalStoreV1(pool, { schema }),
    plans = new P.PostgresAgentRoomPlanStore(pool, { schema }),
    repository = new P.PostgresRoomRepository(pool, { schema }),
    definitions = new R.AgentDefinitionRegistry(
      new P.PostgresAgentDefinitionRegistryStore(pool, { schema }),
    );
  const readRooms = new R.RoomService({ repository });
  const account = async () =>
    (
      await pool.query(
        `SELECT state FROM ${q}.demo_account WHERE id='customer'`,
      )
    ).rows[0].state;
  const trace = async (kind, data) => {
    await pool.query(
      `INSERT INTO ${q}.demo_trace(kind,data,pid) VALUES($1,$2::jsonb,$3)`,
      [kind, JSON.stringify(data), process.pid],
    );
  };
  const assessors = {
    assessorId: "support-rules-v1",
    outcomeAssessorId: "simulated-access-evidence-v1",
    align: async () => ({
      verdict: "aligned",
      explanation:
        "Bounded support plan preserves identity verification; fixture-defined alignment.",
    }),
    evaluate: async (input) => {
      let disposition = "act",
        explanation =
          "Prepare a bounded support response; this does not itself restore access.";
      if (input.trigger?.reason === "attempt-completion") {
        disposition = "complete";
        explanation =
          "Request completion only if native outcome checks support it.";
      }
      if (
        input.trigger?.inception &&
        input.trigger.assessment.disposition === "rejected"
      ) {
        disposition = "needs_evidence";
        explanation =
          "The suggestion to bypass identity verification was rejected.";
      }
      if (input.trigger?.reason === "escalate-unresolved") {
        disposition = "escalate";
        explanation =
          "Falta evidencia de identidad/acceso: el caso se escala al soporte verificado, sin declarar resolución.";
      }
      if (input.trigger?.wakeup) {
        disposition = "act";
        explanation =
          "The access-failure signal prompts reassessment, not automatic account modification.";
      }
      return {
        disposition,
        explanation,
        uncertainty:
          "Deterministic fixture; no general semantic judgment is demonstrated.",
      };
    },
    review: async (input) => {
      const evidence = input.evidence.find(
        (e) => e.content?.kind === "simulated-access-verification",
      )?.content;
      const met =
        evidence?.simulated === true &&
        evidence.identityVerified === true &&
        evidence.accessRestored === true &&
        evidence.caseId === "case-001";
      return {
        criteria: input.mission.criteria.map((c) => ({
          criterionId: c.criterionId,
          status: met ? "met" : "unmet",
        })),
        coverage: evidence ? "sufficient" : "insufficient",
        purposeContribution: met ? "supported" : "uncertain",
        causalAttribution: met ? "supported" : "not_established",
        explanation: met
          ? "Synthetic fixture verifies identity and access; attribution is stipulated by the simulator, not empirical."
          : "A delivered response does not prove recovered access.",
      };
    },
  };
  const service = new R.PurposeMissionServiceV1(
    missions,
    governance,
    plans,
    readRooms,
    inceptions,
    signals,
    execution,
    assessors,
    {
      authenticate,
      authorize: async (p, r) =>
        ["evaluate", "review", "work"].includes(r.operation)
          ? p.subjectId === "worker"
          : p.subjectId === "owner",
    },
  );
  const controllers = new Map(),
    governments = new Map();
  async function registerController(agentId, definition) {
    const profile = {
      adapterId: "support-fixture-v1",
      runtimePlatform: "support-fixture",
      definitionRevisionId: definition.revisionId,
      preActionCheckpoint: true,
      cooperativeAbort: true,
      gatewayOnlyEffects: true,
      idempotentEffects: true,
    };
    const c = new R.AgentExecutionControllerV1(
      execution,
      governance,
      definitions,
      profile,
      [{ kind: "operations", allowed: ["execute"] }],
      undefined,
      undefined,
      agentId === purposeAgent ? service.control() : undefined,
    );
    controllers.set(agentId, c);
    governments.set(
      agentId,
      new R.AgentGovernanceServiceV1(
        governance,
        auth,
        definitions,
        undefined,
        c,
      ),
    );
    return c;
  }
  const select = (input) => controllers.get(input.participant.metadata.agentId);
  const rooms = new R.RoomService({
    repository,
    requireGovernedExecution: true,
    executionGovernance: {
      bindRoomTask: (i) => select(i).bindRoomTask(i),
      openRoom: (i) => select(i).openRoom(i),
      definitionForParticipant: (i) => select(i).definitionForParticipant(i),
    },
    runtime: {
      registerProvider() {},
      supportsCheckpoint: () => true,
      async *stream() {},
      async run(_a, input, context) {
        await context.checkpoint({ checkpoint: "pre_action" });
        const binding = context.metadata.agentGovernance;
        const output =
          binding.agentId === instructionAgent
            ? "SIMULACIÓN: instrucciones de recuperación preparadas y entregadas al buzón local."
            : "SIMULACIÓN: propuesta de recuperación por canal verificado; escalar si falta evidencia de acceso.";
        await trace("runtime-output", {
          agentId: binding.agentId,
          runId: context.runId,
          binding,
          output,
        });
        return { status: "completed", output };
      },
    },
  });
  const planner = new R.AgentRoomPlannerBridge(
    plans,
    rooms,
    new R.HumanContributionCoordinator(
      readRooms,
      new P.PostgresHumanContributionStore(pool, { schema }),
    ),
    new R.AgentRoomHandoffCoordinator(
      readRooms,
      new P.PostgresRoomHandoffStore(pool, { schema }),
      definitions,
    ),
  );
  const inceptionService = new R.AgentInceptionServiceV1(
    inceptions,
    governance,
    readRooms,
    {
      authenticate,
      authorize: async (p, r) =>
        r.operation === "assess"
          ? p.subjectId === "worker"
          : ["owner", "customer", "worker"].includes(p.subjectId),
    },
  );
  const attention = new R.AttentionSignalServiceV1(signals, governance, {
    authenticate,
    authorize: async (p, r) =>
      r.operation === "observe"
        ? p.subjectId === "collector"
        : r.operation === "work"
          ? p.subjectId === "worker"
          : p.subjectId === "owner",
  });
  const limits = new R.AgentExecutionLimitServiceV1(
    execution,
    governance,
    auth,
  );
  async function govern(agentId, operationId, command) {
    const h = await governance.load(tenant, agentId);
    const result = await governments.get(agentId).execute(actors.owner, {
      agentId,
      operationId,
      expectedRevision: h?.revision ?? null,
      command,
    });
    await trace("governance", {
      agentId,
      operationId,
      revision: result.revision,
      status: result.status,
      configurationDigest: result.configurationDigest,
      command,
    });
    return result;
  }
  async function activate(agentId, prefix) {
    await govern(agentId, `${prefix}:prepare`, { kind: "prepare_activation" });
    return govern(agentId, `${prefix}:activate`, { kind: "activate" });
  }
  async function issue(missionId, planId, instruction) {
    const h = await governance.load(tenant, purposeAgent);
    await planner.create({
      tenantId: tenant,
      roomId,
      planId,
      planVersion: 1,
      objective: "Recuperar acceso legítimo con evidencia",
      steps: [
        {
          stepId: "support",
          kind: "agent_task",
          participantId: purposeAgent,
          instruction,
          expectedOutput: "Respuesta verificable",
          expectedArtifactKind: "support-response",
          actionLevel: "draft",
          toolIds: [],
        },
      ],
    });
    await service.issue(actors.owner, {
      agentId: purposeAgent,
      missionId,
      operationId: `issue:${missionId}`,
      roomId,
      planId,
      participantId: purposeAgent,
      criteria: [
        {
          criterionId: "verified-access",
          description:
            "Simulated identity verification and access probe both succeed",
        },
      ],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      expectedGovernanceRevision: h.revision,
    });
  }
  async function evaluate(missionId, operationId, trigger) {
    const state = await missions.load(tenant, purposeAgent, missionId);
    const receipt = await service.evaluate(actors.worker, {
      agentId: purposeAgent,
      missionId,
      operationId,
      expectedRevision: state.revision,
      trigger,
    });
    await trace("decision", { missionId, ...receipt });
    return receipt;
  }
  async function input(id, content, disposition) {
    const head = await governance.load(tenant, purposeAgent);
    const message = await readRooms.sendMessage(tenant, roomId, {
      id,
      role: "human",
      content,
    });
    await inceptionService.submit(actors.customer, {
      agentId: purposeAgent,
      roomId,
      inceptionId: id,
      sourceMessageId: message.id,
      expectedGovernanceRevision: head.revision,
    });
    const assessment = await inceptionService.assess(actors.worker, {
      agentId: purposeAgent,
      roomId,
      inceptionId: id,
      assessmentId: `assess:${id}`,
      expectedGovernanceRevision: head.revision,
      expectedAssessmentRevision: -1,
      evaluatorRef: "support-rules-v1",
      disposition,
      explanation:
        disposition === "rejected"
          ? "No se omite la verificación de identidad."
          : "La solicitud de recuperar acceso legítimo es compatible con el propósito.",
      uncertainty: "Clasificación reproducible definida por el escenario.",
      reformulation: null,
      evidence: [{ kind: "message", id }],
      proposedWork: [],
    });
    await trace("inception", { id, content, assessment });
    return {
      kind: "inception",
      inceptionId: id,
      assessmentId: assessment.assessmentId,
    };
  }
  async function materialize(missionId) {
    return service.materialize(
      actors.worker,
      {
        agentId: purposeAgent,
        missionId,
        operationId: `materialize:${missionId}`,
      },
      planner,
    );
  }
  async function run(missionId) {
    return service.runOne(
      actors.worker,
      { agentId: purposeAgent, missionId },
      { rooms, planner },
    );
  }
  async function review(missionId, id, refs = []) {
    const s = await missions.load(tenant, purposeAgent, missionId);
    const result = await service.review(actors.worker, {
      agentId: purposeAgent,
      missionId,
      operationId: id,
      expectedRevision: s.revision,
      evidence: refs,
    });
    await trace("outcome-review", { missionId, ...result });
    return result;
  }
  return {
    pool,
    q,
    governance,
    execution,
    missions,
    inceptions,
    signals,
    plans,
    repository,
    definitions,
    rooms,
    readRooms,
    service,
    controllers,
    governments,
    registerController,
    planner,
    inceptionService,
    attention,
    limits,
    govern,
    activate,
    issue,
    evaluate,
    input,
    materialize,
    run,
    review,
    account,
    trace,
  };
}
