import type { JsonObject, JsonValue } from "@agentplat/core";
import type { PortableAgentRoleBindingV1 } from "@agentplat/runtime/adapter";

import { canonicalizeControlJsonV1 } from "./canonical.js";
import { sha256Hex } from "./sha256.js";
import { deepFreeze } from "./validation.js";

export interface DynamicRoleBlueprintV2 {
  readonly schemaVersion: 2;
  readonly blueprintId: string;
  readonly missionId: string;
  readonly roleKey: string;
  readonly predecessorDefinitionDigest: string | null;
  readonly guidance: readonly string[];
  readonly requiredCapabilityKeys: readonly string[];
  readonly requestedToolNames: readonly string[];
  readonly requestedActionClasses: readonly string[];
  readonly resourceCeilingUnits: number;
  readonly constraints: JsonObject;
  readonly proposerPeerId: string;
  readonly proposerCredibilityDigest: string;
  readonly basisEvidenceDigests: readonly string[];
  readonly proposedAtLogicalMs: number;
  readonly blueprintDigest: string;
}

export interface RoleAuthorityCeilingV2 {
  readonly missionId: string;
  readonly authorityDigest: string;
  readonly permittedCapabilityKeys: readonly string[];
  readonly permittedToolNames: readonly string[];
  readonly permittedActionClasses: readonly string[];
  readonly maximumResourceUnits: number;
  readonly requiredConstraintKeys: readonly string[];
  readonly localRuleProgramDigest: string;
}

export interface GovernedRoleDefinitionV2 {
  readonly schemaVersion: 2;
  readonly definitionId: string;
  readonly definitionRevision: number;
  readonly missionId: string;
  readonly roleKey: string;
  readonly predecessorDefinitionDigest: string | null;
  readonly guidance: readonly string[];
  readonly capabilityKeys: readonly string[];
  readonly toolNames: readonly string[];
  readonly actionClasses: readonly string[];
  readonly resourceCeilingUnits: number;
  readonly constraints: JsonObject;
  readonly authorityDigest: string;
  readonly localRuleProgramDigest: string;
  readonly semanticGuaranteeDigest: string;
  readonly sourceBlueprintDigest: string;
  readonly definitionDigest: string;
}

export interface GovernedRoleCertificationV2 {
  readonly schemaVersion: 2;
  readonly definitionDigest: string;
  readonly semanticGuaranteeDigest: string;
  readonly collectiveCertificateDigest: string;
  readonly membershipConfigurationDigest: string;
  readonly membershipEpoch: number;
  readonly validUntilLogicalMs: number;
  readonly certificationDigest: string;
}

export interface GovernedRoleCatalogEntryV2 {
  readonly definition: GovernedRoleDefinitionV2;
  readonly certification: GovernedRoleCertificationV2;
  readonly status: "staged" | "active" | "revoked" | "superseded";
  readonly activatedAtLogicalMs: number | null;
  readonly revokedAtLogicalMs: number | null;
  readonly reasonCode: string | null;
}

export interface GovernedRoleCatalogStateV2 {
  readonly schemaVersion: 2;
  readonly catalogId: string;
  readonly missionId: string;
  readonly authorityDigest: string;
  readonly revision: number;
  readonly fence: number;
  readonly entries: readonly GovernedRoleCatalogEntryV2[];
  readonly activeDefinitionByRole: Readonly<Record<string, string>>;
  readonly logicalTimeHighWaterMs: number;
  readonly previousStateDigest: string | null;
  readonly stateDigest: string;
}

export interface GovernedRoleCertificationPortV2 {
  verify(input: {
    readonly definition: GovernedRoleDefinitionV2;
    readonly certification: GovernedRoleCertificationV2;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface GovernedRoleCatalogStoreV2 {
  load(catalogId: string): Promise<GovernedRoleCatalogStateV2 | null>;
  save(
    state: GovernedRoleCatalogStateV2,
    expectedRevision: number | null,
  ): Promise<boolean>;
}

export class InMemoryGovernedRoleCatalogStoreV2 implements GovernedRoleCatalogStoreV2 {
  readonly #states = new Map<string, GovernedRoleCatalogStateV2>();
  async load(catalogId: string): Promise<GovernedRoleCatalogStateV2 | null> {
    return this.#states.get(catalogId) ?? null;
  }
  async save(
    state: GovernedRoleCatalogStateV2,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const current = this.#states.get(state.catalogId);
    if (
      (expectedRevision === null &&
        (current !== undefined || state.revision !== 0)) ||
      (expectedRevision !== null &&
        (!current ||
          current.revision !== expectedRevision ||
          state.revision !== expectedRevision + 1))
    )
      return false;
    this.#states.set(state.catalogId, state);
    return true;
  }
}

/** Compiles a peer proposal into a bounded role; proposals never grant authority. */
export function compileGovernedRoleDefinitionV2(input: {
  readonly blueprint: DynamicRoleBlueprintV2;
  readonly authority: RoleAuthorityCeilingV2;
  readonly semanticGuaranteeDigest: string;
  readonly definitionRevision: number;
}): GovernedRoleDefinitionV2 {
  const blueprint = validateDynamicRoleBlueprintV2(input.blueprint);
  validateAuthority(input.authority);
  digest(input.semanticGuaranteeDigest, "semanticGuaranteeDigest");
  integer(
    input.definitionRevision,
    "definitionRevision",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (blueprint.missionId !== input.authority.missionId)
    fail("dynamic role mission and authority differ");
  if (
    blueprint.requiredCapabilityKeys.some(
      (item) => !input.authority.permittedCapabilityKeys.includes(item),
    )
  )
    fail("dynamic role requests a capability outside the authority ceiling");
  if (
    blueprint.requestedToolNames.some(
      (item) => !input.authority.permittedToolNames.includes(item),
    )
  )
    fail("dynamic role requests a tool outside the authority ceiling");
  if (
    blueprint.requestedActionClasses.some(
      (item) => !input.authority.permittedActionClasses.includes(item),
    )
  )
    fail("dynamic role requests an action outside the authority ceiling");
  if (blueprint.resourceCeilingUnits > input.authority.maximumResourceUnits)
    fail("dynamic role requests resources outside the authority ceiling");
  if (
    input.authority.requiredConstraintKeys.some(
      (item) => !(item in blueprint.constraints),
    )
  )
    fail("dynamic role omits a required constraint");
  const body = {
    schemaVersion: 2 as const,
    definitionId: `${blueprint.blueprintId}:definition:${input.definitionRevision}`,
    definitionRevision: input.definitionRevision,
    missionId: blueprint.missionId,
    roleKey: blueprint.roleKey,
    predecessorDefinitionDigest: blueprint.predecessorDefinitionDigest,
    guidance: blueprint.guidance,
    capabilityKeys: blueprint.requiredCapabilityKeys,
    toolNames: blueprint.requestedToolNames,
    actionClasses: blueprint.requestedActionClasses,
    resourceCeilingUnits: blueprint.resourceCeilingUnits,
    constraints: blueprint.constraints,
    authorityDigest: input.authority.authorityDigest,
    localRuleProgramDigest: input.authority.localRuleProgramDigest,
    semanticGuaranteeDigest: input.semanticGuaranteeDigest,
    sourceBlueprintDigest: blueprint.blueprintDigest,
  };
  return deepFreeze({
    ...body,
    definitionDigest: roleDigest(
      "governed-role-definition-v2",
      body as unknown as JsonValue,
    ),
  });
}

type GovernedRoleBindingInputV2 = {
  readonly roleKey: string;
  readonly agentId: string;
  readonly objectiveId: string;
  readonly validFromLogicalMs: number;
  readonly validUntilLogicalMs: number;
};

interface GovernedRoleCatalogInvokerV2 {
  readonly missionId: string;
  resolveActiveRoleBinding(
    input: GovernedRoleBindingInputV2,
  ): Promise<PortableAgentRoleBindingV1 | null>;
}

const governedRoleCatalogInvokersV2 = new WeakMap<
  object,
  GovernedRoleCatalogInvokerV2
>();

export class GovernedRoleCatalogRuntimeV2 {
  readonly #store: GovernedRoleCatalogStoreV2;
  readonly #certification: GovernedRoleCertificationPortV2;
  readonly #maximumEntries: number;
  readonly #maximumCommitAttempts: number;
  readonly #catalogId: string;
  readonly #missionId: string;
  readonly #authorityDigest: string;

  constructor(
    readonly options: {
      readonly catalogId: string;
      readonly missionId: string;
      readonly authorityDigest: string;
      readonly store?: GovernedRoleCatalogStoreV2;
      readonly certification: GovernedRoleCertificationPortV2;
      readonly maximumEntries?: number;
      readonly maximumCommitAttempts?: number;
    },
  ) {
    identifier(options.catalogId, "catalogId");
    identifier(options.missionId, "missionId");
    digest(options.authorityDigest, "authorityDigest");
    if (
      !options.certification ||
      typeof options.certification.verify !== "function"
    )
      fail("governed role certification port is required");
    this.#catalogId = options.catalogId;
    this.#missionId = options.missionId;
    this.#authorityDigest = options.authorityDigest;
    this.#store = options.store ?? new InMemoryGovernedRoleCatalogStoreV2();
    this.#certification = options.certification;
    this.#maximumEntries = integer(
      options.maximumEntries ?? 10_000,
      "maximumEntries",
      1,
      100_000,
    );
    this.#maximumCommitAttempts = integer(
      options.maximumCommitAttempts ?? 4,
      "maximumCommitAttempts",
      1,
      32,
    );
    Object.defineProperty(this, "options", {
      value: Object.freeze({ ...options }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    governedRoleCatalogInvokersV2.set(
      this,
      Object.freeze({
        missionId: this.#missionId,
        resolveActiveRoleBinding: (input: GovernedRoleBindingInputV2) =>
          this.#resolveActiveRoleBinding(input),
      }),
    );
  }

  async initialize(): Promise<GovernedRoleCatalogStateV2> {
    const state = createCatalogState({
      schemaVersion: 2,
      catalogId: this.#catalogId,
      missionId: this.#missionId,
      authorityDigest: this.#authorityDigest,
      revision: 0,
      fence: 0,
      entries: [],
      activeDefinitionByRole: {},
      logicalTimeHighWaterMs: 0,
      previousStateDigest: null,
    });
    if (!(await this.#store.save(state, null)))
      fail("governed role catalog already exists");
    return state;
  }

  async stage(input: {
    readonly definition: GovernedRoleDefinitionV2;
    readonly certification: GovernedRoleCertificationV2;
    readonly logicalTimeMs: number;
  }): Promise<GovernedRoleCatalogStateV2> {
    const definition = validateGovernedRoleDefinitionV2(input.definition);
    const certification = validateGovernedRoleCertificationV2(
      input.certification,
    );
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    if (
      definition.missionId !== this.#missionId ||
      definition.authorityDigest !== this.#authorityDigest ||
      certification.definitionDigest !== definition.definitionDigest ||
      certification.semanticGuaranteeDigest !==
        definition.semanticGuaranteeDigest ||
      input.logicalTimeMs > certification.validUntilLogicalMs ||
      !(await this.#certification.verify({
        definition,
        certification,
        logicalTimeMs: input.logicalTimeMs,
      }))
    )
      fail("governed role certification is not valid for this catalog");
    return this.#commit(input.logicalTimeMs, (current) => {
      const duplicate = current.entries.find(
        (item) =>
          item.definition.definitionDigest === definition.definitionDigest,
      );
      if (duplicate) return current;
      const active = current.activeDefinitionByRole[definition.roleKey] ?? null;
      if (definition.predecessorDefinitionDigest !== active)
        fail("governed role predecessor is not the active definition");
      const predecessor =
        active === null
          ? null
          : (current.entries.find(
              (item) => item.definition.definitionDigest === active,
            )?.definition ?? null);
      if (
        definition.definitionRevision !==
        (predecessor?.definitionRevision ?? 0) + 1
      )
        fail(
          "governed role definition revision does not extend its predecessor",
        );
      if (current.entries.length >= this.#maximumEntries)
        fail("governed role catalog capacity exceeded");
      return transition(current, {
        entries: [
          ...current.entries,
          {
            definition,
            certification,
            status: "staged",
            activatedAtLogicalMs: null,
            revokedAtLogicalMs: null,
            reasonCode: null,
          },
        ],
        logicalTimeMs: input.logicalTimeMs,
        advanceFence: false,
      });
    });
  }

  async activate(input: {
    readonly definitionDigest: string;
    readonly expectedFence: number;
    readonly logicalTimeMs: number;
  }): Promise<GovernedRoleCatalogStateV2> {
    digest(input.definitionDigest, "definitionDigest");
    integer(input.expectedFence, "expectedFence", 0, Number.MAX_SAFE_INTEGER);
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const before = await this.#load();
    const stagedBefore = before.entries.find(
      (item) =>
        item.definition.definitionDigest === input.definitionDigest &&
        item.status === "staged",
    );
    if (
      !stagedBefore ||
      input.logicalTimeMs > stagedBefore.certification.validUntilLogicalMs ||
      !(await this.#certification.verify({
        definition: stagedBefore.definition,
        certification: stagedBefore.certification,
        logicalTimeMs: input.logicalTimeMs,
      }))
    )
      fail("governed role activation certification is no longer valid");
    return this.#commit(input.logicalTimeMs, (current) => {
      if (current.fence !== input.expectedFence)
        fail("governed role activation fence is stale");
      const staged = current.entries.find(
        (item) =>
          item.definition.definitionDigest === input.definitionDigest &&
          item.status === "staged",
      );
      if (
        !staged ||
        input.logicalTimeMs > staged.certification.validUntilLogicalMs
      )
        fail("governed role staged definition is unavailable");
      const entries = current.entries.map(
        (entry): GovernedRoleCatalogEntryV2 => {
          if (entry.definition.roleKey !== staged.definition.roleKey)
            return entry;
          if (
            entry.definition.definitionDigest ===
            staged.definition.definitionDigest
          )
            return {
              ...entry,
              status: "active",
              activatedAtLogicalMs: input.logicalTimeMs,
            };
          if (entry.status === "active")
            return {
              ...entry,
              status: "superseded",
              reasonCode: "successor_activated",
            };
          return entry;
        },
      );
      return transition(current, {
        entries,
        activeDefinitionByRole: {
          ...current.activeDefinitionByRole,
          [staged.definition.roleKey]: staged.definition.definitionDigest,
        },
        logicalTimeMs: input.logicalTimeMs,
        advanceFence: true,
      });
    });
  }

  async revoke(input: {
    readonly definitionDigest: string;
    readonly reasonCode: string;
    readonly expectedFence: number;
    readonly logicalTimeMs: number;
  }): Promise<GovernedRoleCatalogStateV2> {
    digest(input.definitionDigest, "definitionDigest");
    token(input.reasonCode, "reasonCode");
    return this.#commit(input.logicalTimeMs, (current) => {
      if (current.fence !== input.expectedFence)
        fail("governed role revocation fence is stale");
      const target = current.entries.find(
        (item) => item.definition.definitionDigest === input.definitionDigest,
      );
      if (!target || target.status === "revoked") return current;
      const active = current.activeDefinitionByRole[target.definition.roleKey];
      const activeDefinitionByRole = { ...current.activeDefinitionByRole };
      if (active === input.definitionDigest)
        delete activeDefinitionByRole[target.definition.roleKey];
      return transition(current, {
        entries: current.entries.map((entry): GovernedRoleCatalogEntryV2 =>
          entry.definition.definitionDigest === input.definitionDigest
            ? {
                ...entry,
                status: "revoked",
                revokedAtLogicalMs: input.logicalTimeMs,
                reasonCode: input.reasonCode,
              }
            : entry,
        ),
        activeDefinitionByRole,
        logicalTimeMs: input.logicalTimeMs,
        advanceFence: true,
      });
    });
  }

  /** Reactivates a retained predecessor without granting any new authority. */
  async rollback(input: {
    readonly roleKey: string;
    readonly targetDefinitionDigest: string;
    readonly reasonCode: string;
    readonly expectedFence: number;
    readonly logicalTimeMs: number;
  }): Promise<GovernedRoleCatalogStateV2> {
    identifier(input.roleKey, "roleKey");
    digest(input.targetDefinitionDigest, "targetDefinitionDigest");
    token(input.reasonCode, "reasonCode");
    integer(input.expectedFence, "expectedFence", 0, Number.MAX_SAFE_INTEGER);
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const before = await this.#load();
    const targetBefore = before.entries.find(
      (entry) =>
        entry.definition.definitionDigest === input.targetDefinitionDigest &&
        entry.definition.roleKey === input.roleKey &&
        (entry.status === "superseded" || entry.status === "staged"),
    );
    if (
      !targetBefore ||
      input.logicalTimeMs > targetBefore.certification.validUntilLogicalMs ||
      !(await this.#certification.verify({
        definition: targetBefore.definition,
        certification: targetBefore.certification,
        logicalTimeMs: input.logicalTimeMs,
      }))
    )
      fail("governed role rollback certification is no longer valid");
    return this.#commit(input.logicalTimeMs, (current) => {
      if (current.fence !== input.expectedFence)
        fail("governed role rollback fence is stale");
      const activeDigest =
        current.activeDefinitionByRole[input.roleKey] ?? null;
      if (activeDigest === input.targetDefinitionDigest) return current;
      const target = current.entries.find(
        (entry) =>
          entry.definition.definitionDigest === input.targetDefinitionDigest &&
          entry.definition.roleKey === input.roleKey &&
          (entry.status === "superseded" || entry.status === "staged"),
      );
      if (
        !target ||
        input.logicalTimeMs > target.certification.validUntilLogicalMs
      )
        fail("governed role rollback target is unavailable");
      const entries = current.entries.map(
        (entry): GovernedRoleCatalogEntryV2 => {
          if (
            entry.definition.definitionDigest ===
            target.definition.definitionDigest
          )
            return {
              ...entry,
              status: "active",
              activatedAtLogicalMs: input.logicalTimeMs,
              revokedAtLogicalMs: null,
              reasonCode: input.reasonCode,
            };
          if (
            entry.definition.definitionDigest === activeDigest &&
            entry.status === "active"
          )
            return {
              ...entry,
              status: "superseded",
              reasonCode: "rolled_back",
            };
          return entry;
        },
      );
      return transition(current, {
        entries,
        activeDefinitionByRole: {
          ...current.activeDefinitionByRole,
          [input.roleKey]: target.definition.definitionDigest,
        },
        logicalTimeMs: input.logicalTimeMs,
        advanceFence: true,
      });
    });
  }

  async resolveActiveRoleBinding(
    input: GovernedRoleBindingInputV2,
  ): Promise<PortableAgentRoleBindingV1 | null> {
    return invokeGovernedRoleCatalogResolveActiveRoleBindingV2(this, input);
  }

  async #resolveActiveRoleBinding(
    input: GovernedRoleBindingInputV2,
  ): Promise<PortableAgentRoleBindingV1 | null> {
    identifier(input.roleKey, "roleKey");
    identifier(input.agentId, "agentId");
    identifier(input.objectiveId, "objectiveId");
    integer(
      input.validFromLogicalMs,
      "validFromLogicalMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    integer(
      input.validUntilLogicalMs,
      "validUntilLogicalMs",
      input.validFromLogicalMs + 1,
      Number.MAX_SAFE_INTEGER,
    );
    const state = await this.#load();
    const digestValue = state.activeDefinitionByRole[input.roleKey];
    const entry = state.entries.find(
      (item) =>
        item.definition.definitionDigest === digestValue &&
        item.status === "active",
    );
    if (
      !entry ||
      input.validUntilLogicalMs > entry.certification.validUntilLogicalMs
    )
      return null;
    return deepFreeze({
      schemaVersion: 1,
      roleBindingId: `${input.agentId}:${entry.definition.definitionId}:${state.fence}`,
      roleRevision: entry.definition.definitionRevision,
      predecessorRoleBindingId: null,
      objectiveId: input.objectiveId,
      roleKey: entry.definition.roleKey,
      instructions: entry.definition.guidance,
      constraints: {
        ...entry.definition.constraints,
        authorityDigest: entry.definition.authorityDigest,
        localRuleProgramDigest: entry.definition.localRuleProgramDigest,
        definitionDigest: entry.definition.definitionDigest,
        capabilityKeys: [...entry.definition.capabilityKeys],
        toolNames: [...entry.definition.toolNames],
        actionClasses: [...entry.definition.actionClasses],
        resourceCeilingUnits: entry.definition.resourceCeilingUnits,
        catalogFence: state.fence,
      },
      validFromLogicalMs: input.validFromLogicalMs,
      validUntilLogicalMs: input.validUntilLogicalMs,
    });
  }

  async load(): Promise<GovernedRoleCatalogStateV2> {
    return this.#load();
  }

  async #load(): Promise<GovernedRoleCatalogStateV2> {
    const state = await this.#store.load(this.#catalogId);
    if (!state) fail("governed role catalog is not initialized");
    const validated = validateGovernedRoleCatalogStateV2(state);
    if (
      validated.catalogId !== this.#catalogId ||
      validated.missionId !== this.#missionId ||
      validated.authorityDigest !== this.#authorityDigest
    )
      fail("governed role catalog binding changed");
    return validated;
  }

  async #commit(
    logicalTimeMs: number,
    mutate: (state: GovernedRoleCatalogStateV2) => GovernedRoleCatalogStateV2,
  ): Promise<GovernedRoleCatalogStateV2> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const current = await this.#load();
      if (logicalTimeMs < current.logicalTimeHighWaterMs)
        fail("governed role logical time rollback");
      const next = mutate(current);
      if (next === current) return current;
      if (await this.#store.save(next, current.revision)) return next;
    }
    fail("governed role commit attempts exhausted");
  }
}

/** Nominal check for the governed role catalog reference runtime. */
export function isGovernedRoleCatalogRuntimeV2(
  value: unknown,
): value is GovernedRoleCatalogRuntimeV2 {
  return (
    typeof value === "object" &&
    value !== null &&
    governedRoleCatalogInvokersV2.has(value)
  );
}

/** Returns the mission identity captured when the catalog was constructed. */
export function governedRoleCatalogMissionIdV2(
  runtime: GovernedRoleCatalogRuntimeV2,
): string {
  return governedRoleCatalogInvoker(runtime).missionId;
}

/** Resolves role currentness through the library-owned private implementation. */
export function invokeGovernedRoleCatalogResolveActiveRoleBindingV2(
  runtime: GovernedRoleCatalogRuntimeV2,
  input: Parameters<
    GovernedRoleCatalogRuntimeV2["resolveActiveRoleBinding"]
  >[0],
): ReturnType<GovernedRoleCatalogRuntimeV2["resolveActiveRoleBinding"]> {
  return governedRoleCatalogInvoker(runtime).resolveActiveRoleBinding(input);
}

function governedRoleCatalogInvoker(
  runtime: GovernedRoleCatalogRuntimeV2,
): GovernedRoleCatalogInvokerV2 {
  const invoker =
    typeof runtime === "object" && runtime !== null
      ? governedRoleCatalogInvokersV2.get(runtime)
      : undefined;
  if (!invoker) fail("concrete governed role catalog runtime is required");
  return invoker;
}

export function createDynamicRoleBlueprintV2(
  input: Omit<DynamicRoleBlueprintV2, "schemaVersion" | "blueprintDigest">,
): DynamicRoleBlueprintV2 {
  const body = { schemaVersion: 2 as const, ...input };
  validateBlueprintBody(body);
  return deepFreeze({
    ...body,
    blueprintDigest: roleDigest(
      "dynamic-role-blueprint-v2",
      body as unknown as JsonValue,
    ),
  });
}

export function validateDynamicRoleBlueprintV2(
  input: DynamicRoleBlueprintV2,
): DynamicRoleBlueprintV2 {
  const { blueprintDigest, schemaVersion: _schemaVersion, ...body } = input;
  const rebuilt = createDynamicRoleBlueprintV2(body);
  if (rebuilt.blueprintDigest !== blueprintDigest)
    fail("dynamic role blueprint digest invalid");
  return rebuilt;
}

export function validateGovernedRoleDefinitionV2(
  input: GovernedRoleDefinitionV2,
): GovernedRoleDefinitionV2 {
  const { definitionDigest, ...body } = input;
  digest(definitionDigest, "definitionDigest");
  validateDefinitionBody(body);
  if (
    roleDigest("governed-role-definition-v2", body as unknown as JsonValue) !==
    definitionDigest
  )
    fail("governed role definition digest invalid");
  return deepFreeze(structuredClone(input));
}

export function validateGovernedRoleCertificationV2(
  input: GovernedRoleCertificationV2,
): GovernedRoleCertificationV2 {
  const { certificationDigest, schemaVersion: _schemaVersion, ...body } = input;
  const rebuilt = createGovernedRoleCertificationV2(body);
  if (rebuilt.certificationDigest !== certificationDigest)
    fail("governed role certification digest invalid");
  return rebuilt;
}

export function createGovernedRoleCertificationV2(
  input: Omit<
    GovernedRoleCertificationV2,
    "schemaVersion" | "certificationDigest"
  >,
): GovernedRoleCertificationV2 {
  const body = { schemaVersion: 2 as const, ...input };
  digest(body.definitionDigest, "definitionDigest");
  digest(body.semanticGuaranteeDigest, "semanticGuaranteeDigest");
  digest(body.collectiveCertificateDigest, "collectiveCertificateDigest");
  digest(body.membershipConfigurationDigest, "membershipConfigurationDigest");
  integer(body.membershipEpoch, "membershipEpoch", 1, Number.MAX_SAFE_INTEGER);
  integer(
    body.validUntilLogicalMs,
    "validUntilLogicalMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  return deepFreeze({
    ...body,
    certificationDigest: roleDigest(
      "governed-role-certification-v2",
      body as unknown as JsonValue,
    ),
  });
}

function transition(
  current: GovernedRoleCatalogStateV2,
  input: {
    readonly entries: readonly GovernedRoleCatalogEntryV2[];
    readonly activeDefinitionByRole?: Readonly<Record<string, string>>;
    readonly logicalTimeMs: number;
    readonly advanceFence: boolean;
  },
): GovernedRoleCatalogStateV2 {
  return createCatalogState({
    ...current,
    revision: current.revision + 1,
    fence: current.fence + (input.advanceFence ? 1 : 0),
    entries: input.entries,
    activeDefinitionByRole:
      input.activeDefinitionByRole ?? current.activeDefinitionByRole,
    logicalTimeHighWaterMs: input.logicalTimeMs,
    previousStateDigest: current.stateDigest,
  });
}

function createCatalogState(
  input: Omit<GovernedRoleCatalogStateV2, "stateDigest">,
): GovernedRoleCatalogStateV2 {
  const { stateDigest: _staleStateDigest, ...body } =
    input as GovernedRoleCatalogStateV2;
  return deepFreeze({
    ...body,
    stateDigest: roleDigest(
      "governed-role-catalog-state-v2",
      body as unknown as JsonValue,
    ),
  });
}

export function validateGovernedRoleCatalogStateV2(
  input: GovernedRoleCatalogStateV2,
): GovernedRoleCatalogStateV2 {
  if (!input || input.schemaVersion !== 2)
    fail("governed role catalog state schema invalid");
  identifier(input.catalogId, "catalogId");
  identifier(input.missionId, "missionId");
  digest(input.authorityDigest, "authorityDigest");
  integer(input.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
  integer(input.fence, "fence", 0, Number.MAX_SAFE_INTEGER);
  integer(
    input.logicalTimeHighWaterMs,
    "logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (input.previousStateDigest !== null)
    digest(input.previousStateDigest, "previousStateDigest");
  if ((input.revision === 0) !== (input.previousStateDigest === null))
    fail("governed role catalog state lineage invalid");
  const definitions = new Set<string>();
  for (const entry of input.entries) {
    const definition = validateGovernedRoleDefinitionV2(entry.definition);
    const certification = validateGovernedRoleCertificationV2(
      entry.certification,
    );
    if (
      definitions.has(definition.definitionDigest) ||
      definition.missionId !== input.missionId ||
      definition.authorityDigest !== input.authorityDigest ||
      certification.definitionDigest !== definition.definitionDigest ||
      certification.semanticGuaranteeDigest !==
        definition.semanticGuaranteeDigest ||
      !["staged", "active", "revoked", "superseded"].includes(entry.status)
    )
      fail("governed role catalog entry invalid");
    definitions.add(definition.definitionDigest);
    if (entry.activatedAtLogicalMs !== null)
      integer(
        entry.activatedAtLogicalMs,
        "activatedAtLogicalMs",
        0,
        input.logicalTimeHighWaterMs,
      );
    if (entry.revokedAtLogicalMs !== null)
      integer(
        entry.revokedAtLogicalMs,
        "revokedAtLogicalMs",
        0,
        input.logicalTimeHighWaterMs,
      );
    if (
      (entry.status === "active" || entry.status === "superseded") &&
      entry.activatedAtLogicalMs === null
    )
      fail("governed role activated state lacks activation time");
    if ((entry.status === "revoked") !== (entry.revokedAtLogicalMs !== null))
      fail("governed role revocation state invalid");
    if (entry.reasonCode !== null) token(entry.reasonCode, "reasonCode");
  }
  for (const [roleKey, definitionDigest] of Object.entries(
    input.activeDefinitionByRole,
  )) {
    identifier(roleKey, "active roleKey");
    digest(definitionDigest, "active definitionDigest");
    const active = input.entries.find(
      (entry) =>
        entry.definition.roleKey === roleKey &&
        entry.definition.definitionDigest === definitionDigest &&
        entry.status === "active",
    );
    if (!active) fail("governed role active definition mapping invalid");
  }
  if (
    input.entries.some(
      (entry) =>
        entry.status === "active" &&
        input.activeDefinitionByRole[entry.definition.roleKey] !==
          entry.definition.definitionDigest,
    )
  )
    fail("governed role active entry is not mapped");
  const { stateDigest, ...body } = input;
  digest(stateDigest, "stateDigest");
  if (
    roleDigest(
      "governed-role-catalog-state-v2",
      body as unknown as JsonValue,
    ) !== stateDigest
  )
    fail("governed role catalog state digest invalid");
  return deepFreeze(structuredClone(input));
}

function validateBlueprintBody(
  input: Omit<DynamicRoleBlueprintV2, "blueprintDigest">,
): void {
  if (input.schemaVersion !== 2) fail("dynamic role blueprint schema invalid");
  identifier(input.blueprintId, "blueprintId");
  identifier(input.missionId, "missionId");
  identifier(input.roleKey, "roleKey");
  if (input.predecessorDefinitionDigest !== null)
    digest(input.predecessorDefinitionDigest, "predecessorDefinitionDigest");
  if (
    input.guidance.length === 0 ||
    input.guidance.length > 128 ||
    input.guidance.some((item) => item.length === 0 || item.length > 2_048)
  )
    fail("dynamic role guidance invalid");
  canonicalIdentifiers(input.requiredCapabilityKeys, "requiredCapabilityKeys");
  canonicalIdentifiers(input.requestedToolNames, "requestedToolNames");
  canonicalIdentifiers(input.requestedActionClasses, "requestedActionClasses");
  integer(
    input.resourceCeilingUnits,
    "resourceCeilingUnits",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  identifier(input.proposerPeerId, "proposerPeerId");
  digest(input.proposerCredibilityDigest, "proposerCredibilityDigest");
  canonicalDigests(input.basisEvidenceDigests, "basisEvidenceDigests");
  integer(
    input.proposedAtLogicalMs,
    "proposedAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  canonicalizeControlJsonV1(input.constraints);
}

function validateDefinitionBody(
  input: Omit<GovernedRoleDefinitionV2, "definitionDigest">,
): void {
  if (input.schemaVersion !== 2)
    fail("governed role definition schema invalid");
  identifier(input.definitionId, "definitionId");
  integer(
    input.definitionRevision,
    "definitionRevision",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  identifier(input.missionId, "missionId");
  identifier(input.roleKey, "roleKey");
  if (input.predecessorDefinitionDigest !== null)
    digest(input.predecessorDefinitionDigest, "predecessorDefinitionDigest");
  if (
    input.guidance.length === 0 ||
    input.guidance.length > 128 ||
    input.guidance.some((item) => item.length === 0 || item.length > 2_048)
  )
    fail("governed role guidance invalid");
  canonicalIdentifiers(input.capabilityKeys, "capabilityKeys");
  canonicalIdentifiers(input.toolNames, "toolNames");
  canonicalIdentifiers(input.actionClasses, "actionClasses");
  integer(
    input.resourceCeilingUnits,
    "resourceCeilingUnits",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  canonicalizeControlJsonV1(input.constraints);
  digest(input.authorityDigest, "authorityDigest");
  digest(input.localRuleProgramDigest, "localRuleProgramDigest");
  digest(input.semanticGuaranteeDigest, "semanticGuaranteeDigest");
  digest(input.sourceBlueprintDigest, "sourceBlueprintDigest");
}

function validateAuthority(input: RoleAuthorityCeilingV2): void {
  identifier(input.missionId, "authority.missionId");
  digest(input.authorityDigest, "authorityDigest");
  canonicalIdentifiers(
    input.permittedCapabilityKeys,
    "permittedCapabilityKeys",
  );
  canonicalIdentifiers(input.permittedToolNames, "permittedToolNames");
  canonicalIdentifiers(input.permittedActionClasses, "permittedActionClasses");
  integer(
    input.maximumResourceUnits,
    "maximumResourceUnits",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  canonicalIdentifiers(input.requiredConstraintKeys, "requiredConstraintKeys");
  digest(input.localRuleProgramDigest, "localRuleProgramDigest");
}

function roleDigest(domain: string, value: JsonValue): string {
  return `sha256:${sha256Hex(
    new TextEncoder().encode(
      `agentplat.inference-control/${domain}/v1\u0000${canonicalizeControlJsonV1(value)}`,
    ),
  )}`;
}

function canonicalIdentifiers(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 100_000)
    fail(`${label} invalid`);
  values.forEach((item) => identifier(item, label));
  const canonical = [...new Set(values)].sort();
  if (
    canonical.length !== values.length ||
    canonical.some((item, index) => item !== values[index])
  )
    fail(`${label} must be canonical`);
}

function canonicalDigests(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 100_000)
    fail(`${label} invalid`);
  values.forEach((item) => digest(item, label));
  const canonical = [...new Set(values)].sort();
  if (
    canonical.length !== values.length ||
    canonical.some((item, index) => item !== values[index])
  )
    fail(`${label} must be canonical`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value)
  )
    fail(`${label} invalid`);
}

function token(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(value))
    fail(`${label} invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    fail(`${label} invalid`);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    fail(`${label} invalid`);
  return value as number;
}

function fail(message: string): never {
  throw new TypeError(message);
}
