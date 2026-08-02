import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type {
  CollectiveEvaluationRegistrationBindingV1,
  CollectiveTraceEventV2,
  CollectiveTraceV2,
  CreateCollectiveTraceEventInputV2,
} from "@agentplat/collective-planning/evaluation";
import {
  createCollectiveTraceEventV2,
  createCollectiveTraceV2,
  validateCollectiveEvaluationRegistrationBindingV1,
} from "@agentplat/collective-planning/evaluation";

export type CollectiveTraceJournalAppendInputV2 = Omit<
  CreateCollectiveTraceEventInputV2,
  | "schemaVersion"
  | "eventId"
  | "causalParentIds"
  | "registrationDigest"
  | "seed"
  | "runner"
  | "tenantId"
  | "missionIntentId"
  | "previousTraceChainDigest"
>;

/**
 * Package-internal append-only journal shared by instrumented evaluation
 * boundaries. It is intentionally not exported from the package root.
 */
export interface CollectiveTraceJournalV2 {
  readonly registrationBindingDigest: PlanningDigestV1;
  readonly events: readonly CollectiveTraceEventV2[];
  append(input: CollectiveTraceJournalAppendInputV2): CollectiveTraceEventV2;
  snapshot(): readonly CollectiveTraceEventV2[];
  restore(events: readonly CollectiveTraceEventV2[]): void;
  trace(): CollectiveTraceV2;
}

const appendKeys = Object.freeze([
  "logicalTimeMs",
  "peerId",
  "component",
  "kind",
  "status",
  "reasonCode",
  "recordDigest",
  "stateDigestBefore",
  "stateDigestAfter",
  "faultBinding",
] as const);

function exactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  )
    throw new TypeError(`${label} has an invalid shape`);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new TypeError(`${label} must contain enumerable data properties`);
  }
}

function plainDenseArray(
  value: unknown,
  label: string,
): asserts value is unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  )
    throw new TypeError(`${label} must be a dense array`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new TypeError(`${label} must contain enumerable data properties`);
  }
}

export function createCollectiveTraceJournalV2(
  registrationInput: CollectiveEvaluationRegistrationBindingV1,
): CollectiveTraceJournalV2 {
  const registration =
    validateCollectiveEvaluationRegistrationBindingV1(registrationInput);
  let retainedEvents: readonly CollectiveTraceEventV2[] = Object.freeze([]);

  const journal: CollectiveTraceJournalV2 = {
    registrationBindingDigest: registration.bindingDigest,
    get events() {
      return retainedEvents;
    },
    append(input) {
      exactDataObject(input, appendKeys, "trace journal append input");
      if (retainedEvents.length >= registration.limits.maximumTraceEvents)
        throw new TypeError("trace event limit exceeded");
      const previous = retainedEvents.at(-1);
      if (
        !Number.isSafeInteger(input.logicalTimeMs) ||
        input.logicalTimeMs < 0 ||
        (previous !== undefined && input.logicalTimeMs < previous.logicalTimeMs)
      )
        throw new TypeError("trace logical time regressed");
      const event = createCollectiveTraceEventV2({
        schemaVersion: 2,
        eventId: `evaluation-event:${String(retainedEvents.length + 1).padStart(8, "0")}`,
        causalParentIds: previous === undefined ? [] : [previous.eventId],
        registrationDigest: registration.bindingDigest,
        seed: registration.seed,
        runner: registration.runner,
        tenantId: registration.tenantId,
        missionIntentId: registration.missionIntentId,
        previousTraceChainDigest: previous?.traceChainDigest ?? null,
        ...input,
      });
      retainedEvents = Object.freeze([...retainedEvents, event]);
      return event;
    },
    snapshot() {
      return retainedEvents;
    },
    restore(eventsInput) {
      plainDenseArray(eventsInput, "trace journal events");
      const trace = createCollectiveTraceV2(
        registration,
        eventsInput as readonly CollectiveTraceEventV2[],
      );
      retainedEvents = trace.events;
    },
    trace() {
      return createCollectiveTraceV2(registration, retainedEvents);
    },
  };
  return Object.freeze(journal);
}

const sharedJournals = new WeakMap<object, CollectiveTraceJournalV2>();

/** Package-internal sidecar binding; it adds no member to the runner port. */
export function bindCollectiveTraceJournalV2(
  owner: object,
  journal: CollectiveTraceJournalV2,
): void {
  if (
    owner === null ||
    typeof owner !== "object" ||
    journal === null ||
    typeof journal !== "object"
  )
    throw new TypeError("trace journal binding is invalid");
  const prior = sharedJournals.get(owner);
  if (prior !== undefined && prior !== journal)
    throw new TypeError("trace journal owner is already bound");
  sharedJournals.set(owner, journal);
}

export function collectiveTraceJournalForOwnerV2(
  owner: object,
): CollectiveTraceJournalV2 | null {
  return sharedJournals.get(owner) ?? null;
}
