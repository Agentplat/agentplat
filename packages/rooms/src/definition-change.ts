import { AgentPlatError } from "@agentplat/core";
import type { JsonValue } from "@agentplat/core";
import type { AgentDefinitionRegistry } from "./agent-registry.js";
import type {
  AgentGovernanceServiceV1,
  AgentGovernancePrincipalV1,
} from "./agent-governance.js";
import { governanceDigestV1 } from "./agent-governance.js";
import type { RoomService } from "./service.js";

/** Content of a versioned Room artifact; instructions/skills are in the definition. */
export interface AgentDefinitionChangeV1 {
  schemaVersion: 1;
  agentId: string;
  baseRevisionId: string;
  baseDigest: string;
  candidateRevisionId: string;
  candidateDigest: string;
  evaluationRef: string;
  reason: string;
}
export interface AgentDefinitionChangeEvaluationV1 {
  /** Authenticates canonical evaluator evidence for the exact base/candidate pair. */
  verify(input: {
    tenantId: string;
    change: AgentDefinitionChangeV1;
  }): Promise<{
    passed: boolean;
    baseDigest: string;
    candidateDigest: string;
    evaluationRef: string;
    expiresAt: string;
  }>;
}
/** Selects an already published candidate; execution stays suspended until existing admission. */
export class AgentDefinitionChangeServiceV1<Context> {
  constructor(
    private readonly options: {
      authenticate(
        context: Context,
      ): Promise<AgentGovernancePrincipalV1 | null>;
      rooms: Pick<RoomService, "getRoomState">;
      definitions: Pick<AgentDefinitionRegistry, "getRevision">;
      governance: Pick<AgentGovernanceServiceV1<Context>, "get" | "execute">;
      evaluations: AgentDefinitionChangeEvaluationV1;
      clock?: () => Date;
    },
  ) {}
  async apply(
    context: Context,
    request: {
      agentId: string;
      roomId: string;
      artifactId: string;
      artifactVersion: number;
      approvalId: string;
      operationId: string;
      expectedGovernanceRevision: number;
    },
  ) {
    const input = structuredClone(request);
    for (const field of [
      "agentId",
      "roomId",
      "artifactId",
      "approvalId",
      "operationId",
    ] as const)
      if (
        typeof input[field] !== "string" ||
        !input[field].trim() ||
        input[field].length > 160
      )
        fail("Invalid change request");
    if (
      !Number.isSafeInteger(input.artifactVersion) ||
      input.artifactVersion < 1 ||
      !Number.isSafeInteger(input.expectedGovernanceRevision) ||
      input.expectedGovernanceRevision < 0
    )
      fail("Invalid change revision");
    const authenticated = await this.options.authenticate(context);
    const principal = authenticated ? structuredClone(authenticated) : null;
    if (!principal) denied();
    // Existing governance authentication determines tenant and owner permissions.
    const head = await this.options.governance.get(context, input.agentId);
    if (
      !head ||
      head.tenantId !== principal.tenantId ||
      head.configuration.ownerId !== principal.subjectId
    )
      denied();
    const room = await this.options.rooms.getRoomState(
      head.tenantId,
      input.roomId,
    );
    if (
      room.room.tenantId !== head.tenantId ||
      room.room.id !== input.roomId ||
      room.room.status !== "active"
    )
      fail("Change Room is not active");
    const artifact = room.artifacts.find((a) => a.id === input.artifactId);
    const approval = room.approvals.find((a) => a.id === input.approvalId);
    const version = artifact?.versions.find(
      (v) => v.version === input.artifactVersion,
    );
    const now = (this.options.clock?.() ?? new Date()).toISOString();
    if (
      !artifact ||
      artifact.tenantId !== head.tenantId ||
      artifact.type !== "agent.definition.change.v1" ||
      artifact.currentVersion !== input.artifactVersion ||
      !version ||
      version.tenantId !== head.tenantId ||
      !approval ||
      approval.tenantId !== head.tenantId ||
      approval.status !== "approved" ||
      approval.targetType !== "artifact" ||
      approval.targetId !== artifact.id ||
      approval.targetVersion !== input.artifactVersion ||
      !approval.decidedBy ||
      !room.participants.some(
        (p) => p.id === approval.decidedBy && p.type === "human",
      ) ||
      (approval.expiresAt && approval.expiresAt <= now)
    )
      fail("Exact current artifact approval required");
    const change = validateAgentDefinitionChangeV1(version.content);
    if (change.agentId !== input.agentId) fail("Agent change target mismatch");
    const [base, candidate] = await Promise.all([
      this.options.definitions.getRevision(
        head.tenantId,
        change.baseRevisionId,
      ),
      this.options.definitions.getRevision(
        head.tenantId,
        change.candidateRevisionId,
      ),
    ]);
    if (
      base.definition.agentId !== input.agentId ||
      candidate.definition.agentId !== input.agentId ||
      base.definition.tenantId !== head.tenantId ||
      candidate.definition.tenantId !== head.tenantId ||
      base.definition.digest !== change.baseDigest ||
      candidate.definition.digest !== change.candidateDigest ||
      candidate.lifecycle.status !== "published"
    )
      fail("Definition change bytes or publication mismatch");
    const evidence = structuredClone(
      await this.options.evaluations.verify({
        tenantId: head.tenantId,
        change: structuredClone(change),
      }),
    );
    if (
      evidence.passed !== true ||
      evidence.baseDigest !== change.baseDigest ||
      evidence.candidateDigest !== change.candidateDigest ||
      evidence.evaluationRef !== change.evaluationRef ||
      !Number.isFinite(Date.parse(evidence.expiresAt)) ||
      new Date(evidence.expiresAt).toISOString() !== evidence.expiresAt ||
      evidence.expiresAt <= (this.options.clock?.() ?? new Date()).toISOString()
    )
      fail("Current exact evaluation evidence required");
    const latestRoom = await this.options.rooms.getRoomState(
      head.tenantId,
      input.roomId,
    );
    const latestArtifact = latestRoom.artifacts.find(
      (a) => a.id === input.artifactId,
    );
    const latestApproval = latestRoom.approvals.find(
      (a) => a.id === input.approvalId,
    );
    const latestVersion = latestArtifact?.versions.find(
      (v) => v.version === input.artifactVersion,
    );
    const admittedAt = (this.options.clock?.() ?? new Date()).toISOString();
    if (
      latestRoom.room.status !== "active" ||
      latestArtifact?.currentVersion !== input.artifactVersion ||
      !latestVersion ||
      (await governanceDigestV1(latestVersion.content)) !==
        (await governanceDigestV1(version.content)) ||
      !latestApproval ||
      (await governanceDigestV1(latestApproval as unknown as JsonValue)) !==
        (await governanceDigestV1(approval as unknown as JsonValue)) ||
      (latestApproval.expiresAt && latestApproval.expiresAt <= admittedAt) ||
      evidence.expiresAt <= admittedAt
    )
      fail("Approval or evaluation changed or expired during validation");
    // Keep logical operation identity stable across retries. Governance binds it to
    // candidate and expected revision, rejecting conflicting reuse.
    const binding = await governanceDigestV1({
      tenantId: head.tenantId,
      agentId: input.agentId,
      operationId: input.operationId,
    });
    if (
      head.revision === input.expectedGovernanceRevision &&
      head.configuration.definitionRevisionId !== change.baseRevisionId
    )
      fail("Base definition changed");
    // A stale expectedRevision conflicts in governance. Exact retries use its durable operation receipt.
    return this.options.governance.execute(context, {
      agentId: input.agentId,
      operationId: `definition-change:${binding.slice(7)}`,
      expectedRevision: input.expectedGovernanceRevision,
      command: {
        kind: "mode",
        definitionRevisionId: change.candidateRevisionId,
        review: {
          roomId: input.roomId,
          artifactId: input.artifactId,
          artifactVersion: input.artifactVersion,
          approvalId: input.approvalId,
          evaluationRef: change.evaluationRef,
          proposalDigest: await governanceDigestV1(
            change as unknown as JsonValue,
          ),
        },
      },
    });
  }
}
export function validateAgentDefinitionChangeV1(
  value: JsonValue,
): AgentDefinitionChangeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Invalid definition change");
  const keys = [
    "schemaVersion",
    "agentId",
    "baseRevisionId",
    "baseDigest",
    "candidateRevisionId",
    "candidateDigest",
    "evaluationRef",
    "reason",
  ];
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k)) ||
    value.schemaVersion !== 1
  )
    fail("Invalid definition change shape");
  for (const k of keys.filter((k) => k !== "schemaVersion"))
    if (
      typeof value[k] !== "string" ||
      !(value[k] as string).trim() ||
      (value[k] as string).length > 1024
    )
      fail("Invalid change field");
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(value.baseDigest as string) ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.candidateDigest as string) ||
    value.baseRevisionId === value.candidateRevisionId
  )
    fail("Invalid definition binding");
  return structuredClone(value) as unknown as AgentDefinitionChangeV1;
}
function fail(message: string): never {
  throw new AgentPlatError("CONFLICT", message);
}

function denied(): never {
  throw new AgentPlatError("FORBIDDEN", "Authenticated owner required");
}
