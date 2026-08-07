import { sha256Base64Url } from "./sha256.js";
import type {
  MeshAdaptiveOverlayAppliedViewV1,
  MeshAdaptiveOverlayBindingV1,
  MeshAdaptiveOverlayCertificateV1,
  MeshAdaptiveOverlayDigestV1,
  MeshAdaptiveOverlayPolicyV1,
  MeshAdaptiveOverlayProposalV1,
  MeshAdaptiveOverlaySignalV1,
  MeshAdaptiveOverlayStateV1,
} from "./adaptive-overlay-contracts.js";

const text = new TextEncoder();
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const MAX_ITEMS = 4_096;

export class MeshAdaptiveOverlayErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeshAdaptiveOverlayErrorV1";
  }
}

export function meshAdaptiveOverlayDigestV1(
  domain: string,
  body: unknown,
): MeshAdaptiveOverlayDigestV1 {
  return `sha256:${sha256Base64Url(text.encode(stable({ domain, body })))}`;
}

export function createMeshAdaptiveOverlayBindingV1(
  input: Omit<MeshAdaptiveOverlayBindingV1, "schemaVersion" | "bindingDigest">,
): MeshAdaptiveOverlayBindingV1 {
  const body = {
    schemaVersion: 1 as const,
    overlayId: id(input.overlayId, "overlayId"),
    localPeerIndex: integer(input.localPeerIndex, "localPeerIndex", 0),
    membershipDigest: digest(input.membershipDigest, "membershipDigest"),
    profileDigest: digest(input.profileDigest, "profileDigest"),
    viewDigest: digest(input.viewDigest, "viewDigest"),
    revision: integer(input.revision, "revision", 0),
  };
  return freeze({
    ...body,
    bindingDigest: meshAdaptiveOverlayDigestV1(
      "adaptive-overlay-binding-v1",
      body,
    ),
  });
}

export function createMeshAdaptiveOverlayPolicyV1(
  input: Omit<MeshAdaptiveOverlayPolicyV1, "schemaVersion" | "policyDigest">,
): MeshAdaptiveOverlayPolicyV1 {
  const observers = normalizeObservers(input.observers);
  const body = {
    schemaVersion: 1 as const,
    policyId: id(input.policyId, "policyId"),
    policyRevision: integer(input.policyRevision, "policyRevision", 1),
    observers,
    independentGroupThreshold: integer(
      input.independentGroupThreshold,
      "independentGroupThreshold",
      1,
    ),
    maximumSignalLifetimeMs: integer(
      input.maximumSignalLifetimeMs,
      "maximumSignalLifetimeMs",
      1,
    ),
    maximumExcludedNeighbors: integer(
      input.maximumExcludedNeighbors,
      "maximumExcludedNeighbors",
      1,
    ),
    validUntilLogicalMs: integer(
      input.validUntilLogicalMs,
      "validUntilLogicalMs",
      1,
    ),
  };
  if (
    body.independentGroupThreshold >
    new Set(observers.map((item) => item.groupId)).size
  )
    invalid("independent group threshold is invalid");
  return freeze({
    ...body,
    policyDigest: meshAdaptiveOverlayDigestV1(
      "adaptive-overlay-policy-v1",
      body,
    ),
  });
}

export function createMeshAdaptiveOverlaySignalV1(
  input: Omit<MeshAdaptiveOverlaySignalV1, "schemaVersion" | "signalDigest">,
): MeshAdaptiveOverlaySignalV1 {
  const binding = validateMeshAdaptiveOverlayBindingV1(input.binding);
  const body = {
    schemaVersion: 1 as const,
    signalId: id(input.signalId, "signalId"),
    binding,
    observerPeerId: id(input.observerPeerId, "observerPeerId"),
    observerGroupId: id(input.observerGroupId, "observerGroupId"),
    subjectPeerIndex: integer(input.subjectPeerIndex, "subjectPeerIndex", 0),
    subjectDigest: digest(input.subjectDigest, "subjectDigest"),
    kind: oneOf(
      input.kind,
      ["unreachable", "degraded", "policy_violation"] as const,
      "kind",
    ),
    observedAtLogicalMs: integer(
      input.observedAtLogicalMs,
      "observedAtLogicalMs",
      0,
    ),
    expiresAtLogicalMs: integer(
      input.expiresAtLogicalMs,
      "expiresAtLogicalMs",
      1,
    ),
    authentication: auth(input.authentication),
  };
  if (body.expiresAtLogicalMs <= body.observedAtLogicalMs)
    invalid("signal expiry is invalid");
  return freeze({
    ...body,
    signalDigest: meshAdaptiveOverlayDigestV1(
      "adaptive-overlay-signal-v1",
      body,
    ),
  });
}

export function createMeshAdaptiveOverlayProposalV1(
  input: Omit<
    MeshAdaptiveOverlayProposalV1,
    "schemaVersion" | "proposalDigest"
  >,
): MeshAdaptiveOverlayProposalV1 {
  const binding = validateMeshAdaptiveOverlayBindingV1(input.binding);
  const policy = validateMeshAdaptiveOverlayPolicyV1(input.policy);
  const body = {
    schemaVersion: 1 as const,
    proposalId: id(input.proposalId, "proposalId"),
    binding,
    policy,
    excludedNeighborIndexes: indexes(
      input.excludedNeighborIndexes,
      "excludedNeighborIndexes",
    ),
    signalDigests: digests(input.signalDigests, "signalDigests"),
    proposedAtLogicalMs: integer(
      input.proposedAtLogicalMs,
      "proposedAtLogicalMs",
      0,
    ),
    expiresAtLogicalMs: integer(
      input.expiresAtLogicalMs,
      "expiresAtLogicalMs",
      1,
    ),
  };
  if (
    body.excludedNeighborIndexes.length > policy.maximumExcludedNeighbors ||
    body.expiresAtLogicalMs <= body.proposedAtLogicalMs ||
    body.expiresAtLogicalMs > policy.validUntilLogicalMs
  )
    invalid("proposal timing or exclusion bounds are invalid");
  return freeze({
    ...body,
    proposalDigest: meshAdaptiveOverlayDigestV1(
      "adaptive-overlay-proposal-v1",
      body,
    ),
  });
}

export function createMeshAdaptiveOverlayCertificateV1(
  input: Omit<
    MeshAdaptiveOverlayCertificateV1,
    "schemaVersion" | "certificateDigest"
  >,
): MeshAdaptiveOverlayCertificateV1 {
  const binding = validateMeshAdaptiveOverlayBindingV1(input.binding);
  if (
    input.signalDigests.length !== input.observerPeerIds.length ||
    input.observerPeerIds.length !== input.observerGroupIds.length ||
    input.observerPeerIds.length === 0 ||
    input.observerPeerIds.length > MAX_ITEMS
  )
    invalid("certificate witness tuples are invalid");
  const witnesses = input.observerPeerIds
    .map((peerId, index) => ({
      signalDigest: digest(input.signalDigests[index], "signalDigests"),
      peerId: id(peerId, "observerPeerIds"),
      groupId: id(input.observerGroupIds[index], "observerGroupIds"),
    }))
    .sort((left, right) => left.peerId.localeCompare(right.peerId));
  if (
    new Set(witnesses.map((witness) => witness.peerId)).size !==
    witnesses.length
  )
    invalid("certificate witness peers contain duplicates");
  const body = {
    schemaVersion: 1 as const,
    certificateId: id(input.certificateId, "certificateId"),
    proposalId: id(input.proposalId, "proposalId"),
    proposalDigest: digest(input.proposalDigest, "proposalDigest"),
    binding,
    policy: validateMeshAdaptiveOverlayPolicyV1(input.policy),
    policyDigest: digest(input.policyDigest, "policyDigest"),
    signalDigests: freezeArray(
      witnesses.map((witness) => witness.signalDigest),
    ),
    observerPeerIds: freezeArray(witnesses.map((witness) => witness.peerId)),
    observerGroupIds: freezeArray(witnesses.map((witness) => witness.groupId)),
    issuedAtLogicalMs: integer(input.issuedAtLogicalMs, "issuedAtLogicalMs", 0),
    expiresAtLogicalMs: integer(
      input.expiresAtLogicalMs,
      "expiresAtLogicalMs",
      1,
    ),
  };
  if (
    body.policy.policyDigest !== body.policyDigest ||
    new Set(body.signalDigests).size !== body.signalDigests.length ||
    body.signalDigests.length !== body.observerPeerIds.length ||
    body.observerPeerIds.length !== body.observerGroupIds.length ||
    body.expiresAtLogicalMs <= body.issuedAtLogicalMs ||
    body.expiresAtLogicalMs > body.policy.validUntilLogicalMs
  )
    invalid("certificate evidence is invalid");
  return freeze({
    ...body,
    certificateDigest: meshAdaptiveOverlayDigestV1(
      "adaptive-overlay-certificate-v1",
      body,
    ),
  });
}

export function createMeshAdaptiveOverlayAppliedViewV1(
  input: Omit<
    MeshAdaptiveOverlayAppliedViewV1,
    "schemaVersion" | "applicationDigest"
  >,
): MeshAdaptiveOverlayAppliedViewV1 {
  const body = {
    schemaVersion: 1 as const,
    certificateDigest: digest(input.certificateDigest, "certificateDigest"),
    binding: validateMeshAdaptiveOverlayBindingV1(input.binding),
    resultingViewDigest: digest(
      input.resultingViewDigest,
      "resultingViewDigest",
    ),
    resultingRevision: integer(input.resultingRevision, "resultingRevision", 1),
    appliedAtLogicalMs: integer(
      input.appliedAtLogicalMs,
      "appliedAtLogicalMs",
      0,
    ),
  };
  if (body.resultingRevision <= body.binding.revision)
    invalid("applied revision is invalid");
  return freeze({
    ...body,
    applicationDigest: meshAdaptiveOverlayDigestV1(
      "adaptive-overlay-application-v1",
      body,
    ),
  });
}

export function createMeshAdaptiveOverlayStateV1(
  input: Omit<MeshAdaptiveOverlayStateV1, "schemaVersion" | "stateDigest">,
): MeshAdaptiveOverlayStateV1 {
  const body = {
    schemaVersion: 1 as const,
    revision: integer(input.revision, "revision", 0),
    policyDigest: digest(input.policyDigest, "policyDigest"),
    currentBinding: validateMeshAdaptiveOverlayBindingV1(input.currentBinding),
    applied:
      input.applied === null
        ? null
        : createMeshAdaptiveOverlayAppliedViewV1(input.applied),
    signals: input.signals.map(validateMeshAdaptiveOverlaySignalV1),
    proposals: input.proposals.map(validateMeshAdaptiveOverlayProposalV1),
    certificates: input.certificates.map(
      validateMeshAdaptiveOverlayCertificateV1,
    ),
    conflicts: optionalDigests(input.conflicts, "conflicts"),
    lastLogicalTimeMs: integer(input.lastLogicalTimeMs, "lastLogicalTimeMs", 0),
  };
  if (
    body.signals.length > MAX_ITEMS ||
    body.proposals.length > MAX_ITEMS ||
    body.certificates.length > MAX_ITEMS
  )
    invalid("state capacity is invalid");
  return freeze({
    ...body,
    signals: freezeArray(body.signals),
    proposals: freezeArray(body.proposals),
    certificates: freezeArray(body.certificates),
    conflicts: freezeArray(body.conflicts),
    stateDigest: meshAdaptiveOverlayDigestV1("adaptive-overlay-state-v1", body),
  });
}

export function validateMeshAdaptiveOverlayBindingV1(
  input: unknown,
): MeshAdaptiveOverlayBindingV1 {
  return validate(input, createMeshAdaptiveOverlayBindingV1, "binding");
}
export function validateMeshAdaptiveOverlayPolicyV1(
  input: unknown,
): MeshAdaptiveOverlayPolicyV1 {
  return validate(input, createMeshAdaptiveOverlayPolicyV1, "policy");
}
export function validateMeshAdaptiveOverlaySignalV1(
  input: unknown,
): MeshAdaptiveOverlaySignalV1 {
  return validate(input, createMeshAdaptiveOverlaySignalV1, "signal");
}
export function validateMeshAdaptiveOverlayProposalV1(
  input: unknown,
): MeshAdaptiveOverlayProposalV1 {
  return validate(input, createMeshAdaptiveOverlayProposalV1, "proposal");
}
export function validateMeshAdaptiveOverlayCertificateV1(
  input: unknown,
): MeshAdaptiveOverlayCertificateV1 {
  return validate(input, createMeshAdaptiveOverlayCertificateV1, "certificate");
}
export function validateMeshAdaptiveOverlayStateV1(
  input: unknown,
): MeshAdaptiveOverlayStateV1 {
  return validate(input, createMeshAdaptiveOverlayStateV1, "state");
}

function validate<T extends object>(
  input: unknown,
  factory: (value: any) => T,
  name: string,
): T {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (input as { schemaVersion?: unknown }).schemaVersion !== 1
  )
    invalid(`${name} is invalid`);
  const value = input as any;
  const { schemaVersion: _schemaVersion, ...body } = value;
  const rebuilt = factory(body);
  const digestField =
    name === "binding"
      ? "bindingDigest"
      : name === "policy"
        ? "policyDigest"
        : name === "signal"
          ? "signalDigest"
          : name === "proposal"
            ? "proposalDigest"
            : name === "certificate"
              ? "certificateDigest"
              : "stateDigest";
  if (
    value[digestField] !== (rebuilt as any)[digestField] ||
    stable(value) !== stable(rebuilt)
  )
    invalid(`${name} binding is invalid`);
  return rebuilt;
}
function normalizeObservers(
  input: readonly { readonly peerId: string; readonly groupId: string }[],
) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_ITEMS)
    invalid("observers are invalid");
  const result = input
    .map((item) => ({
      peerId: id(item?.peerId, "observer.peerId"),
      groupId: id(item?.groupId, "observer.groupId"),
    }))
    .sort((a, b) => a.peerId.localeCompare(b.peerId));
  if (new Set(result.map((x) => x.peerId)).size !== result.length)
    invalid("observers duplicate peer");
  return freezeArray(result);
}
function auth(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("authentication is invalid");
  const value = input as { algorithm?: unknown; value?: unknown };
  return freeze({
    algorithm: id(value.algorithm, "authentication.algorithm"),
    value: id(value.value, "authentication.value"),
  });
}
function ids(input: readonly string[], name: string) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_ITEMS)
    invalid(`${name} is invalid`);
  const value = input.map((item) => id(item, name)).sort();
  if (new Set(value).size !== value.length)
    invalid(`${name} contains duplicates`);
  return freezeArray(value);
}
function idList(input: readonly string[], name: string) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_ITEMS)
    invalid(`${name} is invalid`);
  return freezeArray(input.map((item) => id(item, name)));
}
function digests(input: readonly string[], name: string) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_ITEMS)
    invalid(`${name} is invalid`);
  const value = input.map((item) => digest(item, name)).sort();
  if (new Set(value).size !== value.length)
    invalid(`${name} contains duplicates`);
  return freezeArray(value);
}
function optionalDigests(input: readonly string[], name: string) {
  if (!Array.isArray(input) || input.length > MAX_ITEMS)
    invalid(`${name} is invalid`);
  const value = input.map((item) => digest(item, name)).sort();
  if (new Set(value).size !== value.length)
    invalid(`${name} contains duplicates`);
  return freezeArray(value);
}
function indexes(input: readonly number[], name: string) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_ITEMS)
    invalid(`${name} is invalid`);
  const value = input
    .map((item) => integer(item, name, 0))
    .sort((a, b) => a - b);
  if (new Set(value).size !== value.length)
    invalid(`${name} contains duplicates`);
  return freezeArray(value);
}
function id(value: unknown, name: string) {
  if (typeof value !== "string" || !ID.test(value))
    invalid(`${name} is invalid`);
  return value;
}
function digest(value: unknown, name: string): MeshAdaptiveOverlayDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    invalid(`${name} is invalid`);
  return value as MeshAdaptiveOverlayDigestV1;
}
function integer(value: unknown, name: string, minimum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    invalid(`${name} is invalid`);
  return value as number;
}
function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  name: string,
): T {
  if (
    typeof value !== "string" ||
    !(values as readonly string[]).includes(value)
  )
    invalid(`${name} is invalid`);
  return value as T;
}
function invalid(message: string): never {
  throw new MeshAdaptiveOverlayErrorV1(message);
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
    .join(",")}}`;
}
function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}
function freezeArray<T>(value: readonly T[]): readonly T[] {
  return Object.freeze([...value]);
}
