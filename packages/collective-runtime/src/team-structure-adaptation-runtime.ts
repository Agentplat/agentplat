import type {
  TeamStructureAdaptationDecisionV1,
  TeamStructureAdaptationHandoffEnvelopeV1,
  TeamStructureAdaptationPortV1,
  TeamStructureAdaptationRuntimeOptionsV1,
  TeamStructureAdaptationStateV1,
  TeamStructureAdaptationStoreV1,
  TeamStructureObservationAdmissionPortV1,
  TeamStructureObservationV1,
} from "./team-structure-adaptation-contracts.js";
import {
  decideTeamStructureV1,
  recordTeamStructureObservationV1,
} from "./team-structure-adaptation-reducer.js";
import {
  createTeamStructureAdaptationHandoffV1,
  createTeamStructureAdaptationStateV1,
  validateTeamStructureAdaptationHandoffV1,
  validateTeamStructureAdaptationPolicyV1,
  validateTeamStructureAdaptationRequestV1,
  validateTeamStructureAdaptationStateV1,
  validateTeamStructureObservationV1,
  validateTeamStructureTemplateCatalogV1,
} from "./team-structure-adaptation-validation.js";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

export class TeamStructureAdaptationRuntimeV1 implements TeamStructureAdaptationPortV1 {
  readonly adaptationId: string;
  readonly adaptationVersion: number;
  readonly implementationId: string;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogDigest: PlanningDigestV1;
  readonly #stateKey: string;
  readonly #catalog;
  readonly #policy;
  readonly #observationAdmission: TeamStructureObservationAdmissionPortV1;
  readonly #store;

  constructor(options: TeamStructureAdaptationRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      throw new TypeError("team structure runtime options are required");
    this.#stateKey = stringId(options.stateKey, "runtime state key");
    this.adaptationId = stringId(options.adaptationId, "runtime adaptation ID");
    this.adaptationVersion = positive(
      options.adaptationVersion,
      "runtime adaptation version",
    );
    this.implementationId = stringId(
      options.implementationId,
      "runtime implementation ID",
    );
    this.#catalog = validateTeamStructureTemplateCatalogV1(options.catalog);
    this.#policy = validateTeamStructureAdaptationPolicyV1(options.policy);
    this.policyDigest = this.#policy.policyDigest;
    this.catalogDigest = this.#catalog.catalogDigest;
    if (
      !options.observationAdmission ||
      typeof options.observationAdmission.verify !== "function"
    )
      throw new TypeError(
        "team structure observation admission port is required",
      );
    stringId(
      options.observationAdmission.admissionId,
      "observation admission ID",
    );
    positive(
      options.observationAdmission.admissionVersion,
      "observation admission version",
    );
    stringId(
      options.observationAdmission.implementationId,
      "observation admission implementation ID",
    );
    this.#observationAdmission = options.observationAdmission;
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      throw new TypeError("team structure adaptation store is required");
    this.#store = options.store;
  }

  async observe(
    observationValue: TeamStructureObservationV1,
  ): Promise<TeamStructureAdaptationStateV1> {
    const observation = validateTeamStructureObservationV1(observationValue);
    if (
      !(await this.#observationAdmission.verify({
        observation,
        catalog: this.#catalog,
      }))
    )
      throw new TypeError(
        "team structure observation provenance was not admitted",
      );
    return this.#commit((state) => ({
      state: recordTeamStructureObservationV1({
        state,
        catalog: this.#catalog,
        policy: this.#policy,
        observation,
      }),
    }));
  }

  async recommend(
    requestValue: import("./team-structure-adaptation-contracts.js").TeamStructureAdaptationRequestV1,
  ): Promise<TeamStructureAdaptationDecisionV1> {
    const request = validateTeamStructureAdaptationRequestV1(requestValue);
    return this.#commit((state) =>
      decideTeamStructureV1({
        state,
        catalog: this.#catalog,
        policy: this.#policy,
        request,
      }),
    );
  }

  async loadState(): Promise<TeamStructureAdaptationStateV1> {
    const loaded = await this.#store.load(this.#stateKey);
    const state = loaded ? this.#validate(loaded) : this.#initial();
    this.#assertBinding(state);
    return state;
  }

  async exportHandoff(input: {
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<TeamStructureAdaptationHandoffEnvelopeV1> {
    return createTeamStructureAdaptationHandoffV1({
      sourceState: await this.loadState(),
      targetStateKey: input.targetStateKey,
      exportedAtLogicalMs: input.logicalTimeMs,
      catalog: this.#catalog,
      policy: this.#policy,
    });
  }

  async importHandoff(input: {
    readonly handoff: TeamStructureAdaptationHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamStructureAdaptationStateV1> {
    const handoff = validateTeamStructureAdaptationHandoffV1(input.handoff, {
      catalog: this.#catalog,
      policy: this.#policy,
    });
    if (
      handoff.targetStateKey !== this.#stateKey ||
      handoff.adaptationId !== this.adaptationId ||
      handoff.adaptationVersion !== this.adaptationVersion ||
      handoff.implementationId !== this.implementationId ||
      handoff.policyDigest !== this.policyDigest ||
      handoff.catalogDigest !== this.catalogDigest ||
      !Number.isSafeInteger(input.logicalTimeMs) ||
      input.logicalTimeMs < handoff.exportedAtLogicalMs ||
      input.logicalTimeMs < handoff.sourceState.logicalTimeHighWaterMs
    )
      throw new TypeError("team structure handoff binding is invalid");
    const existing = await this.#store.load(this.#stateKey);
    if (existing) {
      const state = this.#validate(existing);
      if (state.predecessorStateDigest === handoff.sourceStateDigest)
        return state;
      throw new TypeError(
        "team structure handoff target conflicts with existing state",
      );
    }
    const source = handoff.sourceState;
    const restored = createTeamStructureAdaptationStateV1({
      stateKey: this.#stateKey,
      adaptationId: this.adaptationId,
      adaptationVersion: this.adaptationVersion,
      implementationId: this.implementationId,
      catalog: this.#catalog,
      policy: this.#policy,
      revision: increment(source.revision, "handoff state revision"),
      logicalTimeHighWaterMs: Math.max(
        input.logicalTimeMs,
        source.logicalTimeHighWaterMs,
      ),
      arms: source.arms,
      observationDigests: source.observationDigests,
      observationHeads: source.observationHeads,
      decisions: source.decisions,
      lastDecision: source.lastDecision,
      predecessorStateDigest: source.stateDigest,
    });
    if (await this.#store.save({ state: restored, expectedRevision: null }))
      return restored;
    const raced = await this.#store.load(this.#stateKey);
    if (raced) {
      const state = this.#validate(raced);
      if (state.predecessorStateDigest === source.stateDigest) return state;
    }
    throw new Error("team_structure_adaptation_handoff_conflict");
  }

  async #commit<T>(
    transition: (state: TeamStructureAdaptationStateV1) => {
      readonly state: TeamStructureAdaptationStateV1;
      readonly decision?: TeamStructureAdaptationDecisionV1;
    },
  ): Promise<T> {
    for (
      let attempt = 0;
      attempt < this.#policy.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validate(loaded) : this.#initial();
      this.#assertBinding(state);
      const result = transition(state);
      const output = result.decision ?? result.state;
      if (result.state.revision === state.revision) return output as T;
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return output as T;
    }
    throw new Error("team_structure_adaptation_commit_conflict");
  }

  #initial(): TeamStructureAdaptationStateV1 {
    return createTeamStructureAdaptationStateV1({
      stateKey: this.#stateKey,
      adaptationId: this.adaptationId,
      adaptationVersion: this.adaptationVersion,
      implementationId: this.implementationId,
      catalog: this.#catalog,
      policy: this.#policy,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      predecessorStateDigest: null,
    });
  }

  #validate(input: unknown): TeamStructureAdaptationStateV1 {
    return validateTeamStructureAdaptationStateV1(input, {
      catalog: this.#catalog,
      policy: this.#policy,
    });
  }

  #assertBinding(state: TeamStructureAdaptationStateV1): void {
    if (
      state.stateKey !== this.#stateKey ||
      state.adaptationId !== this.adaptationId ||
      state.adaptationVersion !== this.adaptationVersion ||
      state.implementationId !== this.implementationId ||
      state.policyDigest !== this.policyDigest ||
      state.catalogDigest !== this.catalogDigest
    )
      throw new TypeError("team structure runtime binding changed");
  }
}

export class InMemoryTeamStructureAdaptationStoreV1 implements TeamStructureAdaptationStoreV1 {
  readonly #states = new Map<string, TeamStructureAdaptationStateV1>();
  async load(stateKey: string): Promise<TeamStructureAdaptationStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state ? structuredClone(state) : null;
  }
  async save(input: {
    readonly state: TeamStructureAdaptationStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    const existing = this.#states.get(input.state.stateKey);
    if (
      (input.expectedRevision === null && existing) ||
      (input.expectedRevision !== null &&
        (!existing || existing.revision !== input.expectedRevision))
    )
      return false;
    this.#states.set(input.state.stateKey, structuredClone(input.state));
    return true;
  }
}

/** Explicit test/simulation admission registry; nothing is admitted by default. */
export class InMemoryTeamStructureObservationAdmissionPortV1 implements TeamStructureObservationAdmissionPortV1 {
  readonly admissionId: string;
  readonly admissionVersion: number;
  readonly implementationId: string;
  readonly #digests = new Set<PlanningDigestV1>();

  constructor(options: {
    readonly admissionId: string;
    readonly admissionVersion: number;
    readonly implementationId: string;
  }) {
    this.admissionId = stringId(
      options.admissionId,
      "observation admission ID",
    );
    this.admissionVersion = positive(
      options.admissionVersion,
      "observation admission version",
    );
    this.implementationId = stringId(
      options.implementationId,
      "observation admission implementation ID",
    );
  }

  admit(observationValue: TeamStructureObservationV1): void {
    this.#digests.add(
      validateTeamStructureObservationV1(observationValue).observationDigest,
    );
  }

  async verify(input: {
    readonly observation: TeamStructureObservationV1;
    readonly catalog: import("./team-structure-adaptation-contracts.js").TeamStructureTemplateCatalogV1;
  }): Promise<boolean> {
    const observation = validateTeamStructureObservationV1(input.observation);
    const catalog = validateTeamStructureTemplateCatalogV1(input.catalog);
    return (
      this.#digests.has(observation.observationDigest) &&
      catalog.templates.some(
        (template) =>
          template.templateId === observation.templateId &&
          template.templateDigest === observation.templateDigest,
      )
    );
  }
}

function stringId(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(input)
  )
    throw new TypeError(`${label} is invalid`);
  return input;
}
function positive(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1)
    throw new TypeError(`${label} is invalid`);
  return input as number;
}
function increment(input: number, label: string): number {
  const value = input + 1;
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${label} exceeds safe integer range`);
  return value;
}
