import type {
  MechanismAllocationAdmittedEventV1,
  MechanismAllocationAdmissionPortV1,
  MechanismAllocationEventV1,
  MechanismAllocationPortV1,
  MechanismAllocationRuntimeOptionsV1,
  MechanismAllocationPolicyRecordV1,
  MechanismAllocationStateV1,
  MechanismAllocationStoreV1,
} from "./mechanism-allocation-contracts.js";
import { reduceMechanismAllocationV1 } from "./mechanism-allocation-reducer.js";
import {
  createMechanismAllocationStateV1,
  validateMechanismAllocationPolicyV1,
  validateMechanismAllocationAdmissionBindingV1,
  validateMechanismAllocationAdmissionV1,
  validateMechanismAllocationEventV1,
  validateMechanismAllocationStateForPolicyV1,
  validateMechanismAllocationStateV1,
  requiredCapabilitiesForMechanismAllocationEventV1,
} from "./mechanism-allocation-validation.js";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

/** Deterministic CAS store for local simulations and tests. */
export class InMemoryMechanismAllocationStoreV1 implements MechanismAllocationStoreV1 {
  readonly #states = new Map<string, MechanismAllocationStateV1>();
  async load(stateKey: string): Promise<MechanismAllocationStateV1 | null> {
    return this.#states.get(stateKey) ?? null;
  }
  async save(input: {
    readonly state: MechanismAllocationStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    const state = validateMechanismAllocationStateV1(input.state);
    const current = this.#states.get(state.stateKey);
    if (
      (current === undefined &&
        (input.expectedRevision !== null ||
          input.expectedStateDigest !== null)) ||
      (current !== undefined &&
        (current.revision !== input.expectedRevision ||
          current.stateDigest !== input.expectedStateDigest))
    )
      return false;
    this.#states.set(state.stateKey, state);
    return true;
  }
}

export class MechanismAllocationRuntimeV1 implements MechanismAllocationPortV1 {
  readonly allocationId: string;
  readonly allocationVersion: number;
  readonly implementationId: string;
  readonly policyDigest: PlanningDigestV1;
  readonly #stateKey: string;
  readonly #policy;
  readonly #store;
  readonly #admission: MechanismAllocationAdmissionPortV1;
  constructor(options: MechanismAllocationRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      throw new TypeError("mechanism allocation runtime options are required");
    this.#stateKey = id(options.stateKey, "runtime.stateKey");
    this.allocationId = id(options.allocationId, "runtime.allocationId");
    this.allocationVersion = positive(
      options.allocationVersion,
      "runtime.allocationVersion",
    );
    this.implementationId = id(
      options.implementationId,
      "runtime.implementationId",
    );
    this.#policy = validateMechanismAllocationPolicyV1(options.policy);
    this.policyDigest = this.#policy.policyDigest;
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      throw new TypeError("mechanism allocation store is required");
    this.#store = options.store;
    if (!options.admission || typeof options.admission.verify !== "function")
      throw new TypeError("mechanism allocation admission port is required");
    id(options.admission.admissionId, "admission.admissionId");
    positive(options.admission.admissionVersion, "admission.admissionVersion");
    id(options.admission.implementationId, "admission.implementationId");
    this.#admission = options.admission;
  }
  async submit(
    inputValue: MechanismAllocationAdmittedEventV1,
  ): Promise<MechanismAllocationStateV1> {
    if (!inputValue || typeof inputValue !== "object")
      throw new TypeError("mechanism allocation admitted event is required");
    const event = validateMechanismAllocationEventV1(inputValue.event);
    const admissionValue = validateMechanismAllocationAdmissionV1(
      inputValue.admission,
    );
    for (
      let attempt = 0;
      attempt < this.#policy.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? await this.#state(loaded) : this.#initial();
      const admission = validateMechanismAllocationAdmissionBindingV1({
        event,
        admission: admissionValue,
        proposal:
          state.proposal ?? (event.kind === "proposal" ? event.proposal : null),
      });
      const requiredCapabilityKeys =
        requiredCapabilitiesForMechanismAllocationEventV1(
          event,
          state.proposal ?? (event.kind === "proposal" ? event.proposal : null),
        );
      if (
        !(await this.#admission.verify({
          event,
          admission,
          requiredCapabilityKeys,
          policyDigest: this.policyDigest,
        }))
      )
        throw new TypeError(
          "mechanism allocation authentication or authorization was denied",
        );
      const next = reduceMechanismAllocationV1({
        state,
        policy: this.#policy,
        event: Object.freeze({ event, admission }),
      });
      if (next.revision === state.revision) return next;
      if (
        await this.#store.save({
          state: next,
          expectedRevision: loaded ? state.revision : null,
          expectedStateDigest: loaded ? state.stateDigest : null,
        })
      )
        return next;
    }
    throw new Error("mechanism_allocation_commit_conflict");
  }
  async loadState(): Promise<MechanismAllocationStateV1> {
    const loaded = await this.#store.load(this.#stateKey);
    return loaded ? await this.#state(loaded) : this.#initial();
  }
  #initial(): MechanismAllocationStateV1 {
    return createMechanismAllocationStateV1({
      stateKey: this.#stateKey,
      allocationId: this.allocationId,
      allocationVersion: this.allocationVersion,
      implementationId: this.implementationId,
      policyDigest: this.policyDigest,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      proposal: null,
      auction: null,
      commitments: [],
      reveals: [],
      plan: null,
      withdrawals: [],
      equivocations: [],
      admissions: [],
      admittedEvents: [],
      predecessorStateDigest: null,
    });
  }
  async #state(value: unknown): Promise<MechanismAllocationStateV1> {
    const state = await verifyMechanismAllocationStateAdmissionsV1({
      state: value,
      policy: this.#policy,
      admission: this.#admission,
    });
    if (
      state.stateKey !== this.#stateKey ||
      state.allocationId !== this.allocationId ||
      state.allocationVersion !== this.allocationVersion ||
      state.implementationId !== this.implementationId ||
      state.policyDigest !== this.policyDigest
    )
      throw new TypeError("mechanism allocation state binding changed");
    return state;
  }
}

/** Re-verifies every exact persisted event at restore/projection boundaries. */
export async function verifyMechanismAllocationStateAdmissionsV1(input: {
  readonly state: unknown;
  readonly policy: MechanismAllocationPolicyRecordV1;
  readonly admission: MechanismAllocationAdmissionPortV1;
}): Promise<MechanismAllocationStateV1> {
  const policy = validateMechanismAllocationPolicyV1(input.policy);
  const state = validateMechanismAllocationStateForPolicyV1(
    input.state,
    policy,
  );
  if (!input.admission || typeof input.admission.verify !== "function")
    throw new TypeError("mechanism allocation admission port is required");
  id(input.admission.admissionId, "admission.admissionId");
  positive(input.admission.admissionVersion, "admission.admissionVersion");
  id(input.admission.implementationId, "admission.implementationId");
  for (let index = 0; index < state.admittedEvents.length; index += 1) {
    const event = state.admittedEvents[index]!;
    const admission = validateMechanismAllocationAdmissionBindingV1({
      event,
      admission: state.admissions[index]!,
      proposal: state.proposal,
    });
    const requiredCapabilityKeys =
      requiredCapabilitiesForMechanismAllocationEventV1(event, state.proposal);
    if (
      !(await input.admission.verify({
        event,
        admission,
        requiredCapabilityKeys,
        policyDigest: policy.policyDigest,
      }))
    )
      throw new TypeError("mechanism allocation restored admission was denied");
  }
  let replayed = createMechanismAllocationStateV1({
    stateKey: state.stateKey,
    allocationId: state.allocationId,
    allocationVersion: state.allocationVersion,
    implementationId: state.implementationId,
    policyDigest: policy.policyDigest,
    revision: 0,
    logicalTimeHighWaterMs: 0,
    proposal: null,
    auction: null,
    commitments: [],
    reveals: [],
    plan: null,
    withdrawals: [],
    equivocations: [],
    admissions: [],
    admittedEvents: [],
    predecessorStateDigest: null,
  });
  for (let index = 0; index < state.admittedEvents.length; index += 1)
    replayed = reduceMechanismAllocationV1({
      state: replayed,
      policy,
      event: Object.freeze({
        event: state.admittedEvents[index]!,
        admission: state.admissions[index]!,
      }),
    });
  if (replayed.stateDigest !== state.stateDigest)
    throw new TypeError(
      "mechanism allocation state does not match deterministic event replay",
    );
  return state;
}

function id(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}
function positive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${label} is invalid`);
  return value;
}
