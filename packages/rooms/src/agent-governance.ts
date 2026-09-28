import {
  validateAgentOriginV1,
  type AgentOriginV1,
} from "./agent-continuity.js";
import type { AgentExecutionLimitRuleV1 } from "./agent-execution.js";
import { AgentPlatError } from "@agentplat/core";
import type { JsonValue } from "@agentplat/core";
import type { AgentDefinitionRegistry } from "./agent-registry.js";
import { resolveAgentInteractionBindingV1 } from "./agent-interaction.js";

export type AgentGovernanceDelegatedOperationV1 =
  "signals" | "references" | "limits" | "missions" | "suspend" | "delegate";
export interface AgentGovernanceDelegationV1 {
  subjectId: string;
  operation: AgentGovernanceDelegatedOperationV1;
  expiresAt: string;
}
export interface AgentGovernancePrincipalV1 {
  tenantId: string;
  subjectId: string;
}
/** Implement using host-verified credentials, never actor IDs from request JSON. */
export interface AgentGovernanceAccessV1<Context> {
  authenticate(context: Context): Promise<AgentGovernancePrincipalV1 | null>;
  authorize(
    principal: AgentGovernancePrincipalV1,
    request: {
      agentId: string;
      operation: "read" | AgentGovernanceCommandV1["kind"];
      command?: AgentGovernanceCommandV1;
    },
  ): Promise<boolean>;
}
export interface AgentGovernanceConfigurationV1 {
  origin?: AgentOriginV1;
  purpose: string;
  ownerId: string;
  signalRefs: string[];
  referenceRefs: string[];
  limitRefs: string[];
  delegations: AgentGovernanceDelegationV1[];
  definitionRevisionId: string;
  interactionMode: "instruction" | "purpose";
}
export interface AgentExecutionAdmissionV1 {
  supervisionId?: string;
  platformLimits?: AgentExecutionLimitRuleV1[];
  purposeControlDigest?: string;
  adapterId: string;
  profileDigest: string;
  definitionRevisionId: string;
}
export interface AgentGovernanceActivationPortV1 {
  admit(head: AgentGovernanceHeadV1): Promise<AgentExecutionAdmissionV1>;
}
/** Explicit execution admission is required; purpose profiles also bind qualified mission control. */
export interface AgentGovernanceHeadV1 {
  schemaVersion: 1;
  tenantId: string;
  agentId: string;
  governanceId: string;
  revision: number;
  authorityEpoch: number;
  status: "suspended" | "transitioning" | "active";
  executionAdmission?: AgentExecutionAdmissionV1;
  configuration: AgentGovernanceConfigurationV1;
  configurationDigest: string;
  pendingTransfer: {
    transferId: string;
    targetOwnerId: string;
    expiresAt: string;
  } | null;
  updatedAt: string;
}
export type AgentGovernanceCommandV1 =
  | {
      kind: "create";
      origin?: AgentOriginV1;
      governanceId: string;
      ownerId: string;
      purpose: string;
      definitionRevisionId: string;
    }
  | { kind: "purpose"; purpose: string }
  | { kind: "signals" | "references" | "limits"; refs: string[] }
  | { kind: "delegations"; delegations: AgentGovernanceDelegationV1[] }
  | { kind: "mode"; definitionRevisionId: string }
  | { kind: "suspend" }
  | { kind: "prepare_activation" | "activate" }
  | { kind: "transfer_start"; targetOwnerId: string; expiresAt: string }
  | { kind: "transfer_accept" | "transfer_cancel"; transferId: string };
export interface AgentGovernanceOperationV1 {
  schemaVersion: 1;
  tenantId: string;
  agentId: string;
  operationId: string;
  actorId: string;
  kind: AgentGovernanceCommandV1["kind"];
  requestDigest: string;
  expectedRevision: number | null;
  /** Immutable result snapshot is also the audit record and configuration history. */
  result: AgentGovernanceHeadV1;
}
/** commit MUST atomically append immutable history and update the head, or do neither. */
export interface AgentGovernanceStoreV1 {
  load(
    tenantId: string,
    agentId: string,
  ): Promise<AgentGovernanceHeadV1 | undefined>;
  operation(
    tenantId: string,
    agentId: string,
    operationId: string,
  ): Promise<AgentGovernanceOperationV1 | undefined>;
  history(
    tenantId: string,
    agentId: string,
    afterRevision: number,
    limit: number,
  ): Promise<AgentGovernanceOperationV1[]>;
  commit(operation: AgentGovernanceOperationV1): Promise<boolean>;
}

export class InMemoryAgentGovernanceStoreV1 implements AgentGovernanceStoreV1 {
  private heads = new Map<string, AgentGovernanceHeadV1>();
  private operations = new Map<string, AgentGovernanceOperationV1>();
  /** Synchronous host-store access for atomic in-memory execution admission. */
  executionHead(tenantId: string, agentId: string) {
    return clone(this.heads.get(key(tenantId, agentId)));
  }
  async load(tenantId: string, agentId: string) {
    return clone(this.heads.get(key(tenantId, agentId)));
  }
  async operation(tenantId: string, agentId: string, operationId: string) {
    return clone(this.operations.get(key(tenantId, agentId, operationId)));
  }
  async history(
    tenantId: string,
    agentId: string,
    afterRevision: number,
    limit: number,
  ) {
    validateGovernancePageV1(afterRevision, limit);
    return clone(
      [...this.operations.values()]
        .filter(
          (x) =>
            x.tenantId === tenantId &&
            x.agentId === agentId &&
            x.result.revision > afterRevision,
        )
        .sort((a, b) => a.result.revision - b.result.revision)
        .slice(0, limit),
    );
  }
  /** Synchronous check used only by the in-memory inception adapter at commit. */
  matchesInceptionFence(
    tenantId: string,
    agentId: string,
    binding: {
      governanceId: string;
      revision: number;
      authorityEpoch: number;
      configurationDigest: string;
      definitionRevisionId: string;
    },
  ): boolean {
    const head = this.heads.get(key(tenantId, agentId));
    return (
      !!head &&
      head.configuration.interactionMode === "purpose" &&
      head.governanceId === binding.governanceId &&
      head.revision === binding.revision &&
      head.authorityEpoch === binding.authorityEpoch &&
      head.configurationDigest === binding.configurationDigest &&
      head.configuration.definitionRevisionId === binding.definitionRevisionId
    );
  }
  async commit(operation: AgentGovernanceOperationV1) {
    validateGovernanceCommitV1(operation);
    const k = key(operation.tenantId, operation.agentId);
    const current = this.heads.get(k);
    if (
      (current?.revision ?? null) !== operation.expectedRevision ||
      this.operations.has(
        key(operation.tenantId, operation.agentId, operation.operationId),
      )
    )
      return false;
    this.heads.set(k, clone(operation.result));
    this.operations.set(
      key(operation.tenantId, operation.agentId, operation.operationId),
      clone(operation),
    );
    return true;
  }
}

export class AgentGovernanceServiceV1<Context> {
  constructor(
    private readonly store: AgentGovernanceStoreV1,
    private readonly access: AgentGovernanceAccessV1<Context>,
    private readonly definitions: Pick<AgentDefinitionRegistry, "getRevision">,
    private readonly clock: () => Date = () => new Date(),
    private readonly activation?: AgentGovernanceActivationPortV1,
  ) {}

  async get(
    context: Context,
    agentId: string,
  ): Promise<AgentGovernanceHeadV1 | undefined> {
    const principal = await this.principal(context, agentId, "read");
    return this.store.load(principal.tenantId, agentId);
  }
  async history(
    context: Context,
    agentId: string,
    afterRevision = -1,
    limit = 100,
  ) {
    validateGovernancePageV1(afterRevision, limit);
    const principal = await this.principal(context, agentId, "read");
    return this.store.history(
      principal.tenantId,
      agentId,
      afterRevision,
      limit,
    );
  }
  async execute(
    context: Context,
    input: {
      agentId: string;
      operationId: string;
      expectedRevision: number | null;
      command: AgentGovernanceCommandV1;
    },
  ): Promise<AgentGovernanceHeadV1> {
    // Snapshot caller input before the first await.
    const request = clone(input);
    exact(request, ["agentId", "operationId", "expectedRevision", "command"]);
    id(request.agentId);
    id(request.operationId);
    if (
      request.expectedRevision !== null &&
      (!Number.isSafeInteger(request.expectedRevision) ||
        request.expectedRevision < 0)
    )
      invalid();
    validateCommand(request.command);
    const { command } = request;
    if (
      command.kind === "create" &&
      command.origin?.parentAgentId === request.agentId
    )
      invalid();
    const principal = await this.principal(
      context,
      request.agentId,
      command.kind,
      command,
    );
    const requestDigest = await governanceDigestV1({
      principal,
      request,
    } as unknown as JsonValue);
    const prior = await this.store.operation(
      principal.tenantId,
      request.agentId,
      request.operationId,
    );
    if (prior) return replay(prior, requestDigest);
    const current = await this.store.load(principal.tenantId, request.agentId);
    if ((current?.revision ?? null) !== request.expectedRevision) conflict();
    const now = this.clock().toISOString();
    if (current && now < current.updatedAt) conflict();
    let next: AgentGovernanceHeadV1;
    if (command.kind === "create") {
      if (current || request.expectedRevision !== null) conflict();
      const mode = await this.definition(
        principal.tenantId,
        request.agentId,
        command.definitionRevisionId,
        command.governanceId,
      );
      next = {
        schemaVersion: 1,
        tenantId: principal.tenantId,
        agentId: request.agentId,
        governanceId: command.governanceId,
        revision: 0,
        authorityEpoch: 0,
        status: "suspended",
        configuration: {
          ...(command.origin ? { origin: clone(command.origin) } : {}),
          ownerId: command.ownerId,
          purpose: command.purpose,
          signalRefs: [],
          referenceRefs: [],
          limitRefs: [],
          delegations: [],
          definitionRevisionId: command.definitionRevisionId,
          interactionMode: mode,
        },
        configurationDigest: "",
        pendingTransfer: null,
        updatedAt: now,
      };
    } else {
      if (!current)
        throw new AgentPlatError("NOT_FOUND", "Agent governance not found");
      next = clone(current);
      // Mutations fence live execution; reactivation is always explicit.
      next.status = "suspended";
      delete next.executionAdmission;
      const owner = current.configuration.ownerId === principal.subjectId;
      const delegate = current.configuration.delegations.some(
        (d) =>
          d.subjectId === principal.subjectId &&
          d.operation === command.kind &&
          d.expiresAt > now,
      );
      const accepting = command.kind === "transfer_accept";
      if (!accepting && !owner && !delegate) denied();
      switch (command.kind) {
        case "purpose":
          next.configuration.purpose = command.purpose;
          break;
        case "signals":
          next.configuration.signalRefs = [...command.refs];
          break;
        case "references":
          next.configuration.referenceRefs = [...command.refs];
          break;
        case "limits":
          next.configuration.limitRefs = [...command.refs];
          break;
        case "delegations":
          if (command.delegations.some((d) => d.expiresAt <= now)) invalid();
          next.configuration.delegations = clone(command.delegations);
          break;
        case "mode":
          next.configuration.interactionMode = await this.definition(
            principal.tenantId,
            request.agentId,
            command.definitionRevisionId,
            current.governanceId,
          );
          next.configuration.definitionRevisionId =
            command.definitionRevisionId;
          break;
        case "suspend":
          break;
        case "prepare_activation":
          next.status = "transitioning";
          break;
        case "activate": {
          if (current.status !== "transitioning" || !this.activation) denied();
          const admission = await this.activation.admit(clone(current));
          exact(admission, [
            "adapterId",
            "profileDigest",
            "definitionRevisionId",
            ...(admission.platformLimits !== undefined
              ? ["platformLimits"]
              : []),
            ...(admission.supervisionId !== undefined ? ["supervisionId"] : []),
            ...(current.configuration.interactionMode === "purpose"
              ? ["purposeControlDigest"]
              : []),
          ]);
          if (
            current.configuration.interactionMode === "purpose" &&
            !/^sha256:[a-f0-9]{64}$/u.test(admission.purposeControlDigest ?? "")
          )
            invalid();
          id(admission.adapterId);
          if (
            !/^sha256:[a-f0-9]{64}$/u.test(admission.profileDigest) ||
            admission.definitionRevisionId !==
              current.configuration.definitionRevisionId
          )
            invalid();
          next.executionAdmission = clone(admission);
          next.status = "active";
          break;
        }
        case "transfer_start":
          if (
            command.targetOwnerId === current.configuration.ownerId ||
            command.expiresAt <= now
          )
            invalid();
          next.pendingTransfer = {
            transferId: request.operationId,
            targetOwnerId: command.targetOwnerId,
            expiresAt: command.expiresAt,
          };
          break;
        case "transfer_accept":
          if (
            !current.pendingTransfer ||
            current.pendingTransfer.transferId !== command.transferId ||
            current.pendingTransfer.targetOwnerId !== principal.subjectId ||
            current.pendingTransfer.expiresAt <= now
          )
            denied();
          next.configuration.ownerId = principal.subjectId;
          next.configuration.delegations = [];
          next.pendingTransfer = null;
          break;
        case "transfer_cancel":
          if (
            !current.pendingTransfer ||
            current.pendingTransfer.transferId !== command.transferId
          )
            conflict();
          next.pendingTransfer = null;
          break;
      }
      next.revision++;
      next.authorityEpoch++;
      // Any intervening mutation invalidates a pending offer, preventing stale consent.
      if (command.kind !== "transfer_start") next.pendingTransfer = null;
      next.updatedAt = now;
    }
    next.configurationDigest = await governanceDigestV1(
      next.configuration as unknown as JsonValue,
    );
    const operation: AgentGovernanceOperationV1 = {
      schemaVersion: 1,
      tenantId: principal.tenantId,
      agentId: request.agentId,
      operationId: request.operationId,
      actorId: principal.subjectId,
      kind: command.kind,
      requestDigest,
      expectedRevision: request.expectedRevision,
      result: next,
    };
    if (!(await this.store.commit(operation))) {
      const raced = await this.store.operation(
        principal.tenantId,
        request.agentId,
        request.operationId,
      );
      if (raced) return replay(raced, requestDigest);
      conflict();
    }
    return clone(next);
  }
  private async definition(
    tenantId: string,
    agentId: string,
    revisionId: string,
    governanceId: string,
  ) {
    const { definition, lifecycle } = await this.definitions.getRevision(
      tenantId,
      revisionId,
    );
    if (
      definition.tenantId !== tenantId ||
      definition.agentId !== agentId ||
      lifecycle.status !== "published"
    )
      conflict();
    const binding = resolveAgentInteractionBindingV1(definition);
    if (
      binding.interactionMode === "purpose" &&
      binding.governanceId !== governanceId
    )
      conflict();
    return binding.interactionMode;
  }
  private async principal(
    context: Context,
    agentId: string,
    operation: "read" | AgentGovernanceCommandV1["kind"],
    command?: AgentGovernanceCommandV1,
  ) {
    id(agentId);
    try {
      const authenticated = await this.access.authenticate(context);
      if (!authenticated) denied();
      const principal = clone(authenticated);
      id(principal.tenantId);
      id(principal.subjectId);
      if (
        !(await this.access.authorize(clone(principal), {
          agentId,
          operation,
          ...(command ? { command: clone(command) } : {}),
        }))
      )
        denied();
      return principal;
    } catch {
      return denied();
    }
  }
}

export function validateGovernancePageV1(after: number, limit: number): void {
  if (
    !Number.isSafeInteger(after) ||
    after < -1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000
  )
    invalid();
}
export function validateGovernanceCommitV1(
  op: AgentGovernanceOperationV1,
): void {
  const expected = op.expectedRevision === null ? 0 : op.expectedRevision + 1;
  if (
    op.schemaVersion !== 1 ||
    op.result.schemaVersion !== 1 ||
    op.result.tenantId !== op.tenantId ||
    op.result.agentId !== op.agentId ||
    op.result.revision !== expected ||
    op.result.authorityEpoch !== expected ||
    !["suspended", "transitioning", "active"].includes(op.result.status) ||
    !Number.isSafeInteger(expected) ||
    expected < 0
  )
    invalid();
  id(op.tenantId);
  id(op.agentId);
  id(op.operationId);
  if (op.result.status === "active") {
    const admission = op.result.executionAdmission;
    if (
      op.kind !== "activate" ||
      !admission ||
      (op.result.configuration.interactionMode === "purpose" &&
        !/^sha256:[a-f0-9]{64}$/u.test(admission.purposeControlDigest ?? "")) ||
      admission.definitionRevisionId !==
        op.result.configuration.definitionRevisionId ||
      !/^sha256:[a-f0-9]{64}$/u.test(admission.profileDigest)
    )
      invalid();
    id(admission.adapterId);
  } else if (
    op.result.executionAdmission !== undefined ||
    (op.result.status === "transitioning" && op.kind !== "prepare_activation")
  )
    invalid();
}
function validateCommand(command: AgentGovernanceCommandV1) {
  if (!command || typeof command !== "object") invalid();
  const fields: Record<AgentGovernanceCommandV1["kind"], string[]> = {
    create: [
      "governanceId",
      "ownerId",
      "purpose",
      "definitionRevisionId",
      ...(command.kind === "create" && command.origin !== undefined
        ? ["origin"]
        : []),
    ],
    purpose: ["purpose"],
    signals: ["refs"],
    references: ["refs"],
    limits: ["refs"],
    delegations: ["delegations"],
    mode: ["definitionRevisionId"],
    suspend: [],
    prepare_activation: [],
    activate: [],
    transfer_start: ["targetOwnerId", "expiresAt"],
    transfer_accept: ["transferId"],
    transfer_cancel: ["transferId"],
  };
  if (!Object.hasOwn(fields, command.kind)) invalid();
  exact(command, ["kind", ...fields[command.kind]]);
  if (command.kind === "create" || command.kind === "purpose") {
    if (
      typeof command.purpose !== "string" ||
      !command.purpose.trim() ||
      command.purpose.length > 16000
    )
      invalid();
  }
  if (command.kind === "create") {
    if (command.origin !== undefined) validateAgentOriginV1(command.origin);
    id(command.governanceId);
    id(command.ownerId);
  }
  if (command.kind === "create" || command.kind === "mode")
    id(command.definitionRevisionId);
  if (
    command.kind === "signals" ||
    command.kind === "references" ||
    command.kind === "limits"
  ) {
    if (
      !Array.isArray(command.refs) ||
      command.refs.length > 256 ||
      new Set(command.refs).size !== command.refs.length
    )
      invalid();
    command.refs.forEach(id);
  }
  if (command.kind === "delegations") {
    if (!Array.isArray(command.delegations) || command.delegations.length > 256)
      invalid();
    const seen = new Set<string>();
    for (const d of command.delegations) {
      exact(d, ["subjectId", "operation", "expiresAt"]);
      id(d.subjectId);
      timestamp(d.expiresAt);
      if (
        ![
          "signals",
          "references",
          "limits",
          "missions",
          "suspend",
          "delegate",
        ].includes(d.operation)
      )
        invalid();
      const k = key(d.subjectId, d.operation);
      if (seen.has(k)) invalid();
      seen.add(k);
    }
  }
  if (command.kind === "transfer_start") {
    id(command.targetOwnerId);
    timestamp(command.expiresAt);
  }
  if (command.kind === "transfer_accept" || command.kind === "transfer_cancel")
    id(command.transferId);
}
function exact(value: object, keys: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  )
    invalid();
}
function timestamp(value: string) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
}
function id(value: string) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u.test(value)
  )
    invalid();
}
function key(...values: string[]) {
  return JSON.stringify(values);
}
function clone<T>(value: T): T {
  return structuredClone(value);
}
function denied(): never {
  throw new AgentPlatError("FORBIDDEN", "Agent governance access denied");
}
function invalid(): never {
  throw new AgentPlatError(
    "VALIDATION_ERROR",
    "Agent governance input is invalid",
  );
}
function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Agent governance revision or operation conflict",
  );
}
function replay(op: AgentGovernanceOperationV1, digest: string) {
  if (op.requestDigest !== digest) conflict();
  return clone(op.result);
}
export async function governanceDigestV1(value: JsonValue): Promise<string> {
  const canonical = (v: JsonValue): string =>
    v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? `[${v.map(canonical).join(",")}]`
        : `{${Object.keys(v)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
            .join(",")}}`;
  const bytes = new TextEncoder().encode(
    `agent-governance-v1\u0000${canonical(value)}`,
  );
  return `sha256:${[...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
