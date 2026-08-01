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

export type MeshTransportConformanceScenario = "retry" | "redirect" | "receipt";

export interface MeshTransportConformanceReceipt {
  readonly disposition: "accepted" | "permanent_rejection" | "retryable";
  readonly messageId?: string;
  readonly retryAfterMs?: number;
}

export interface MeshTransportConformanceAdapter {
  deliver(
    bytes: Uint8Array,
  ): MeshTransportConformanceReceipt | Promise<MeshTransportConformanceReceipt>;
  observations(): Readonly<{
    readonly attempts: readonly Uint8Array[];
    readonly redirectFollowed: boolean;
  }>;
  cleanup?(): void | Promise<void>;
}

export type MeshTransportConformanceFactory = (
  scenario: MeshTransportConformanceScenario,
  context: MeshConformanceFactoryContext,
) => MeshTransportConformanceAdapter | Promise<MeshTransportConformanceAdapter>;

export interface MeshTransportConformanceOptions extends MeshConformanceRunnerOptions {
  readonly factory: MeshTransportConformanceFactory;
  readonly signedEnvelopeBytes: Uint8Array;
}

export async function runMeshTransportConformance(
  options: MeshTransportConformanceOptions,
): Promise<readonly MeshConformanceCaseResult[]> {
  const context = runnerContext(options);
  const bytes = options.signedEnvelopeBytes?.slice();
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 1 ||
    bytes.byteLength > 262_144
  ) {
    throw new RangeError("Mesh transport conformance bytes are invalid");
  }
  return Object.freeze([
    await runBoundedCase({
      caseId: "transport.retry.exact_bytes",
      capability: "transport.exact_byte_retry",
      context,
      run: (signal) =>
        withAdapter(
          options.factory,
          context,
          signal,
          "retry",
          async (adapter) => {
            const first = await adapter.deliver(bytes.slice());
            const second = await adapter.deliver(bytes.slice());
            assertReceipt(first);
            assertReceipt(second);
            assertCondition(first.disposition === "retryable");
            assertCondition(second.disposition === "accepted");
            const observed = adapter.observations();
            assertObservations(observed);
            assertCondition(observed.attempts.length === 2);
            assertCondition(bytesEqual(observed.attempts[0]!, bytes));
            assertCondition(bytesEqual(observed.attempts[1]!, bytes));
            assertCondition(
              bytesEqual(observed.attempts[0]!, observed.attempts[1]!),
            );
          },
        ),
    }),
    await runBoundedCase({
      caseId: "transport.redirect.refused",
      capability: "transport.exact_byte_retry",
      context,
      run: (signal) =>
        withAdapter(
          options.factory,
          context,
          signal,
          "redirect",
          async (adapter) => {
            const receipt = await adapter.deliver(bytes.slice());
            assertReceipt(receipt);
            const observed = adapter.observations();
            assertObservations(observed);
            assertCondition(observed.redirectFollowed === false);
            assertCondition(observed.attempts.length === 1);
            assertCondition(receipt.disposition !== "accepted");
          },
        ),
    }),
    await runBoundedCase({
      caseId: "transport.receipt.coarse",
      capability: "transport.coarse_receipts",
      context,
      run: (signal) =>
        withAdapter(
          options.factory,
          context,
          signal,
          "receipt",
          async (adapter) => {
            const receipt = await adapter.deliver(bytes.slice());
            assertReceipt(receipt);
          },
        ),
    }),
  ]);
}

function assertReceipt(receipt: MeshTransportConformanceReceipt): void {
  if (!receipt || typeof receipt !== "object") {
    throw new TypeError("Mesh conformance receipt is invalid");
  }
  const keys = Object.keys(receipt).sort();
  const allowed = new Set(["disposition", "messageId", "retryAfterMs"]);
  assertCondition(keys.every((key) => allowed.has(key)));
  assertCondition(
    receipt.disposition === "accepted" ||
      receipt.disposition === "permanent_rejection" ||
      receipt.disposition === "retryable",
  );
  assertCondition(
    receipt.messageId === undefined ||
      /^[A-Za-z0-9_-]{21}[AQgw]$/u.test(receipt.messageId),
  );
  assertCondition(
    receipt.retryAfterMs === undefined ||
      (receipt.disposition === "retryable" &&
        Number.isSafeInteger(receipt.retryAfterMs) &&
        receipt.retryAfterMs >= 1 &&
        receipt.retryAfterMs <= 3_600_000),
  );
  assertCondition(
    new TextEncoder().encode(JSON.stringify(receipt)).byteLength <= 2_048,
  );
  assertCondition(
    !/(?:capabilit|credential|database|high.?water|key|peer.?card|secret|supported.?version)/iu.test(
      JSON.stringify(receipt),
    ),
  );
}

function assertObservations(
  observed: ReturnType<MeshTransportConformanceAdapter["observations"]>,
): void {
  if (
    !observed ||
    typeof observed !== "object" ||
    Array.isArray(observed) ||
    Object.keys(observed).sort().join(",") !== "attempts,redirectFollowed" ||
    !Array.isArray(observed.attempts) ||
    observed.attempts.length > 8 ||
    observed.attempts.some(
      (attempt) =>
        !(attempt instanceof Uint8Array) || attempt.byteLength > 262_144,
    ) ||
    typeof observed.redirectFollowed !== "boolean"
  ) {
    throw new TypeError("Mesh transport conformance observations are invalid");
  }
}

async function withAdapter(
  factory: MeshTransportConformanceFactory,
  context: ReturnType<typeof runnerContext>,
  signal: AbortSignal,
  scenario: MeshTransportConformanceScenario,
  run: (adapter: MeshTransportConformanceAdapter) => void | Promise<void>,
): Promise<void> {
  const adapter = await awaitConformanceOperation(
    factory(scenario, Object.freeze({ seed: context.seed, signal })),
    signal,
  );
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Mesh transport conformance factory is invalid");
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
