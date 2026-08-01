export const MESH_CONFORMANCE_REPORT_SCHEMA_VERSION = 1 as const;

export const MESH_CONFORMANCE_CAPABILITIES = Object.freeze([
  "protocol.v0.read",
  "protocol.v0.write",
  "protocol.v1.read",
  "protocol.v1.write",
  "protocol.canonical",
  "transport.exact_byte_retry",
  "transport.coarse_receipts",
  "durability.inbox",
  "durability.atomic_transition",
  "durability.fenced_claims",
  "durability.journal_chain",
  "durability.snapshot_migration",
  "rooms.projection_idempotency",
] as const);

export type MeshConformanceCapability =
  (typeof MESH_CONFORMANCE_CAPABILITIES)[number];

export const MESH_REQUIRED_CONFORMANCE_CAPABILITIES = Object.freeze([
  "protocol.v0.read",
  "protocol.v1.read",
  "protocol.v1.write",
  "protocol.canonical",
] as const satisfies readonly MeshConformanceCapability[]);

export interface MeshConformanceCaseDefinition {
  readonly id: string;
  readonly capability: MeshConformanceCapability;
  readonly required: boolean;
}

/** Deterministic runner inputs supplied to each isolated adapter factory. */
export interface MeshConformanceFactoryContext {
  readonly seed: number;
  readonly signal: AbortSignal;
}

export const MESH_CONFORMANCE_CASES: readonly MeshConformanceCaseDefinition[] =
  Object.freeze([
    caseDefinition("protocol.v0.parse", "protocol.v0.read", true),
    caseDefinition("protocol.v1.parse", "protocol.v1.read", true),
    caseDefinition("protocol.unknown.reject", "protocol.v1.read", true),
    caseDefinition("protocol.canonical.stable", "protocol.canonical", true),
    caseDefinition("protocol.v1.write", "protocol.v1.write", true),
    caseDefinition(
      "protocol.version.signature_binding",
      "protocol.v1.write",
      true,
    ),
    caseDefinition("protocol.v0.explicit_write", "protocol.v0.write", false),
    caseDefinition(
      "transport.retry.exact_bytes",
      "transport.exact_byte_retry",
      false,
    ),
    caseDefinition(
      "transport.redirect.refused",
      "transport.exact_byte_retry",
      false,
    ),
    caseDefinition(
      "transport.receipt.coarse",
      "transport.coarse_receipts",
      false,
    ),
    caseDefinition(
      "durability.inbox.commit_receipt",
      "durability.inbox",
      false,
    ),
    caseDefinition("durability.inbox.conflict", "durability.inbox", false),
    caseDefinition(
      "durability.transition.atomic",
      "durability.atomic_transition",
      false,
    ),
    caseDefinition(
      "durability.claim.stale_fenced",
      "durability.fenced_claims",
      false,
    ),
    caseDefinition(
      "durability.journal.chain",
      "durability.journal_chain",
      false,
    ),
    caseDefinition(
      "durability.snapshot.migration",
      "durability.snapshot_migration",
      false,
    ),
    caseDefinition(
      "rooms.projection.stable_key",
      "rooms.projection_idempotency",
      false,
    ),
    caseDefinition(
      "rooms.projection.duplicate",
      "rooms.projection_idempotency",
      false,
    ),
    caseDefinition(
      "rooms.projection.retry",
      "rooms.projection_idempotency",
      false,
    ),
  ]);

export type MeshConformanceOutcome =
  "passed" | "failed" | "skipped" | "not_declared";

export interface MeshConformanceCaseResult {
  readonly caseId: string;
  readonly capability: MeshConformanceCapability;
  readonly outcome: MeshConformanceOutcome;
  readonly reasonCode?: string;
  readonly durationMs: number;
}

export interface MeshConformanceImplementation {
  readonly name: string;
  readonly version: string;
}

export interface MeshConformanceCounts {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly notDeclared: number;
}

export interface MeshConformanceReport {
  readonly schemaVersion: typeof MESH_CONFORMANCE_REPORT_SCHEMA_VERSION;
  readonly conformanceVersion: string;
  readonly suiteDigest: string;
  readonly fixtureManifestDigest: string;
  readonly implementation: MeshConformanceImplementation;
  readonly declaredCapabilities: readonly MeshConformanceCapability[];
  readonly seed: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly cases: readonly MeshConformanceCaseResult[];
  readonly counts: MeshConformanceCounts;
  readonly verdict: "passed" | "failed";
}

export interface MeshConformanceReportInput {
  readonly conformanceVersion: string;
  readonly suiteDigest: string;
  readonly fixtureManifestDigest: string;
  readonly implementation: MeshConformanceImplementation;
  readonly declaredCapabilities: readonly MeshConformanceCapability[];
  readonly seed: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly cases: readonly MeshConformanceCaseResult[];
}

function caseDefinition(
  id: string,
  capability: MeshConformanceCapability,
  required: boolean,
): MeshConformanceCaseDefinition {
  return Object.freeze({ id, capability, required });
}
