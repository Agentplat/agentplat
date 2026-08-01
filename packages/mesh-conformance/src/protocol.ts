import type { MeshJsonValue, MeshWireVersion } from "@agentplat/mesh-protocol";

import type {
  MeshConformanceCaseResult,
  MeshConformanceFactoryContext,
} from "./contracts.js";
import {
  assertCondition,
  awaitConformanceOperation,
  bytesEqual,
  runConformanceCleanup,
  runBoundedCase,
  runnerContext,
  type MeshConformanceRunnerOptions,
} from "./runner.js";

export interface MeshProtocolConformanceParseResult {
  readonly accepted: boolean;
  readonly wireVersion?: number;
  readonly reasonCode?: string;
}

export interface MeshProtocolConformanceAdapter {
  parse(
    bytes: Uint8Array,
    acceptedWireVersions?: readonly MeshWireVersion[],
  ):
    | MeshProtocolConformanceParseResult
    | Promise<MeshProtocolConformanceParseResult>;
  canonicalize(value: MeshJsonValue): Uint8Array | Promise<Uint8Array>;
  write?(wireVersion: MeshWireVersion): Uint8Array | Promise<Uint8Array>;
  verify(bytes: Uint8Array): boolean | Promise<boolean>;
  cleanup?(): void | Promise<void>;
}

export type MeshProtocolConformanceFactory = (
  context: MeshConformanceFactoryContext,
) => MeshProtocolConformanceAdapter | Promise<MeshProtocolConformanceAdapter>;

export interface MeshProtocolConformanceFixtures {
  readonly v0EnvelopeBytes: Uint8Array;
  readonly v1EnvelopeBytes: Uint8Array;
  readonly unknownEnvelopeBytes: Uint8Array;
  readonly substitutedV1EnvelopeBytes: Uint8Array;
  readonly canonicalValueA: MeshJsonValue;
  readonly canonicalValueB: MeshJsonValue;
  readonly expectedCanonicalBytes: Uint8Array;
}

export interface MeshProtocolConformanceOptions extends MeshConformanceRunnerOptions {
  readonly factory: MeshProtocolConformanceFactory;
  readonly fixtures: MeshProtocolConformanceFixtures;
}

export async function runMeshProtocolConformance(
  options: MeshProtocolConformanceOptions,
): Promise<readonly MeshConformanceCaseResult[]> {
  const context = runnerContext(options);
  const fixtures = normalizeFixtures(options.fixtures);
  return Object.freeze([
    await runBoundedCase({
      caseId: "protocol.v0.parse",
      capability: "protocol.v0.read",
      context,
      run: (signal) =>
        withAdapter(options.factory, context, signal, async (adapter) => {
          const result = await adapter.parse(fixtures.v0EnvelopeBytes.slice());
          assertParseResult(result);
          assertCondition(result.accepted && result.wireVersion === 0);
        }),
    }),
    await runBoundedCase({
      caseId: "protocol.v1.parse",
      capability: "protocol.v1.read",
      context,
      run: (signal) =>
        withAdapter(options.factory, context, signal, async (adapter) => {
          const result = await adapter.parse(fixtures.v1EnvelopeBytes.slice());
          assertParseResult(result);
          assertCondition(result.accepted && result.wireVersion === 1);
        }),
    }),
    await runBoundedCase({
      caseId: "protocol.unknown.reject",
      capability: "protocol.v1.read",
      context,
      run: (signal) =>
        withAdapter(options.factory, context, signal, async (adapter) => {
          const result = await adapter.parse(
            fixtures.unknownEnvelopeBytes.slice(),
          );
          assertParseResult(result);
          assertCondition(
            !result.accepted &&
              result.reasonCode === "unsupported_wire_version",
          );
        }),
    }),
    await runBoundedCase({
      caseId: "protocol.canonical.stable",
      capability: "protocol.canonical",
      context,
      run: (signal) =>
        withAdapter(options.factory, context, signal, async (adapter) => {
          const [left, right] = await Promise.all([
            adapter.canonicalize(fixtures.canonicalValueA),
            adapter.canonicalize(fixtures.canonicalValueB),
          ]);
          assertBytes(left);
          assertBytes(right);
          assertCondition(bytesEqual(left, right));
          assertCondition(bytesEqual(left, fixtures.expectedCanonicalBytes));
        }),
    }),
    await runBoundedCase({
      caseId: "protocol.v1.write",
      capability: "protocol.v1.write",
      context,
      run: (signal) =>
        withAdapter(options.factory, context, signal, async (adapter) => {
          assertCondition(adapter.write !== undefined);
          const bytes = await adapter.write(1);
          assertBytes(bytes);
          const parsed = await adapter.parse(bytes.slice(), [1]);
          assertParseResult(parsed);
          assertCondition(parsed.accepted && parsed.wireVersion === 1);
          assertCondition(await adapter.verify(bytes));
        }),
    }),
    await runBoundedCase({
      caseId: "protocol.version.signature_binding",
      capability: "protocol.v1.write",
      context,
      run: (signal) =>
        withAdapter(options.factory, context, signal, async (adapter) => {
          assertCondition(
            await adapter.verify(fixtures.v1EnvelopeBytes.slice()),
          );
          assertCondition(
            !(await adapter.verify(
              fixtures.substitutedV1EnvelopeBytes.slice(),
            )),
          );
        }),
    }),
    await runBoundedCase({
      caseId: "protocol.v0.explicit_write",
      capability: "protocol.v0.write",
      context,
      run: (signal) =>
        withAdapter(options.factory, context, signal, async (adapter) => {
          assertCondition(adapter.write !== undefined);
          const bytes = await adapter.write(0);
          assertBytes(bytes);
          const parsed = await adapter.parse(bytes.slice(), [0]);
          assertParseResult(parsed);
          assertCondition(parsed.accepted && parsed.wireVersion === 0);
          assertCondition(await adapter.verify(bytes));
        }),
    }),
  ]);
}

async function withAdapter(
  factory: MeshProtocolConformanceFactory,
  context: ReturnType<typeof runnerContext>,
  signal: AbortSignal,
  run: (adapter: MeshProtocolConformanceAdapter) => void | Promise<void>,
): Promise<void> {
  const adapter = await awaitConformanceOperation(
    factory(Object.freeze({ seed: context.seed, signal })),
    signal,
  );
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Mesh protocol conformance factory is invalid");
  }
  let failed: unknown;
  try {
    await awaitConformanceOperation(run(adapter), signal);
  } catch (error) {
    failed = error;
  }
  await runConformanceCleanup(
    adapter.cleanup?.bind(adapter),
    context.cleanupTimeoutMs,
    failed,
  );
  if (failed !== undefined) throw failed;
}

function normalizeFixtures(
  fixtures: MeshProtocolConformanceFixtures,
): MeshProtocolConformanceFixtures {
  if (!fixtures || typeof fixtures !== "object") {
    throw new TypeError("Mesh protocol conformance fixtures are required");
  }
  for (const value of [
    fixtures.v0EnvelopeBytes,
    fixtures.v1EnvelopeBytes,
    fixtures.unknownEnvelopeBytes,
    fixtures.substitutedV1EnvelopeBytes,
    fixtures.expectedCanonicalBytes,
  ]) {
    if (
      !(value instanceof Uint8Array) ||
      value.byteLength < 1 ||
      value.byteLength > 262_144
    ) {
      throw new RangeError("Mesh protocol conformance fixture is invalid");
    }
  }
  return Object.freeze({
    v0EnvelopeBytes: fixtures.v0EnvelopeBytes.slice(),
    v1EnvelopeBytes: fixtures.v1EnvelopeBytes.slice(),
    unknownEnvelopeBytes: fixtures.unknownEnvelopeBytes.slice(),
    substitutedV1EnvelopeBytes: fixtures.substitutedV1EnvelopeBytes.slice(),
    canonicalValueA: deepFreeze(structuredClone(fixtures.canonicalValueA)),
    canonicalValueB: deepFreeze(structuredClone(fixtures.canonicalValueB)),
    expectedCanonicalBytes: fixtures.expectedCanonicalBytes.slice(),
  });
}

function assertParseResult(value: MeshProtocolConformanceParseResult): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Mesh protocol conformance parse result is invalid");
  }
  const keys = Object.keys(value).sort();
  const allowed = new Set(["accepted", "reasonCode", "wireVersion"]);
  if (
    keys.some((key) => !allowed.has(key)) ||
    typeof value.accepted !== "boolean" ||
    (value.wireVersion !== undefined &&
      (!Number.isSafeInteger(value.wireVersion) || value.wireVersion < 0)) ||
    (value.reasonCode !== undefined &&
      (typeof value.reasonCode !== "string" ||
        !/^[a-z][a-z0-9._:-]{0,63}$/u.test(value.reasonCode))) ||
    (value.accepted && value.wireVersion === undefined) ||
    (value.accepted && value.reasonCode !== undefined) ||
    (!value.accepted && value.wireVersion !== undefined)
  ) {
    throw new TypeError("Mesh protocol conformance parse result is invalid");
  }
}

function assertBytes(value: Uint8Array): void {
  if (!(value instanceof Uint8Array) || value.byteLength > 262_144) {
    throw new TypeError("Mesh protocol conformance output is invalid");
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
