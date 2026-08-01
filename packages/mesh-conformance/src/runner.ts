import {
  MESH_CONFORMANCE_CAPABILITIES,
  type MeshConformanceCapability,
  type MeshConformanceCaseResult,
} from "./contracts.js";

export interface MeshConformanceRunnerOptions {
  readonly declaredCapabilities: readonly MeshConformanceCapability[];
  readonly seed?: number;
  readonly timeoutMs?: number;
  readonly totalTimeoutMs?: number;
  readonly cleanupTimeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly clock?: () => number;
}

export function runnerContext(options: MeshConformanceRunnerOptions) {
  const declaredCapabilities = normalizeCapabilities(
    options.declaredCapabilities,
  );
  const timeoutMs = options.timeoutMs ?? 5_000;
  const seed = options.seed ?? 0;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 10 ||
    timeoutMs > 60_000
  ) {
    throw new RangeError("Mesh conformance case timeout is invalid");
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("Mesh conformance seed is invalid");
  }
  const clock = options.clock ?? Date.now;
  const totalTimeoutMs = options.totalTimeoutMs ?? 60_000;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 2_000;
  if (
    !Number.isSafeInteger(totalTimeoutMs) ||
    totalTimeoutMs < 10 ||
    totalTimeoutMs > 300_000 ||
    !Number.isSafeInteger(cleanupTimeoutMs) ||
    cleanupTimeoutMs < 10 ||
    cleanupTimeoutMs > 30_000
  ) {
    throw new RangeError("Mesh conformance suite timeout is invalid");
  }
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new TypeError("Mesh conformance abort signal is invalid");
  }
  const deadline = monotonicNow() + totalTimeoutMs;
  return Object.freeze({
    declaredCapabilities,
    seed,
    timeoutMs,
    totalTimeoutMs,
    cleanupTimeoutMs,
    signal: options.signal,
    clock,
    deadline,
  });
}

export async function runBoundedCase(input: {
  readonly caseId: string;
  readonly capability: MeshConformanceCapability;
  readonly context: ReturnType<typeof runnerContext>;
  readonly run: (signal: AbortSignal) => void | Promise<void>;
}): Promise<MeshConformanceCaseResult> {
  if (!input.context.declaredCapabilities.has(input.capability)) {
    return result(input.caseId, input.capability, "not_declared", 0);
  }
  const started = input.context.clock();
  const remainingMs = Math.trunc(input.context.deadline - monotonicNow());
  if (remainingMs <= 0) {
    return result(input.caseId, input.capability, "failed", 0, "suite_timeout");
  }
  const timeoutMs = Math.min(input.context.timeoutMs, remainingMs);
  const timeoutFailure =
    remainingMs <= input.context.timeoutMs
      ? new ConformanceSuiteTimeout()
      : new ConformanceTimeout();
  const controller = new AbortController();
  const relayAbort = () => controller.abort(new ConformanceAbort());
  input.context.signal?.addEventListener("abort", relayAbort, { once: true });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (input.context.signal?.aborted) throw new ConformanceAbort();
    timeout = setTimeout(() => controller.abort(timeoutFailure), timeoutMs);
    await input.run(controller.signal);
    if (controller.signal.aborted) throw controller.signal.reason;
    return result(
      input.caseId,
      input.capability,
      "passed",
      duration(started, input.context.clock()),
    );
  } catch (error) {
    return result(
      input.caseId,
      input.capability,
      "failed",
      duration(started, input.context.clock()),
      error instanceof ConformanceTimeout
        ? "timeout"
        : error instanceof ConformanceSuiteTimeout
          ? "suite_timeout"
          : error instanceof ConformanceAbort
            ? "aborted"
            : error instanceof MeshConformanceCleanupError
              ? cleanupReason(error)
              : "assertion_failed",
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    input.context.signal?.removeEventListener("abort", relayAbort);
  }
}

export async function awaitConformanceOperation<T>(
  operation: T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw signal.reason;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
  }
}

export async function runConformanceCleanup(
  cleanup: (() => void | Promise<void>) | undefined,
  timeoutMs: number,
  previousFailure?: unknown,
): Promise<void> {
  if (cleanup === undefined) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(cleanup),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new MeshConformanceCleanupError(previousFailure)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof MeshConformanceCleanupError) throw error;
    throw new MeshConformanceCleanupError(previousFailure);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function assertCondition(
  condition: unknown,
  reason = "conformance assertion failed",
): asserts condition {
  if (condition !== true) throw new TypeError(reason);
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function normalizeCapabilities(
  values: readonly MeshConformanceCapability[],
): ReadonlySet<MeshConformanceCapability> {
  if (
    !Array.isArray(values) ||
    values.length > MESH_CONFORMANCE_CAPABILITIES.length
  ) {
    throw new RangeError("Mesh conformance capability count is invalid");
  }
  const result = new Set<MeshConformanceCapability>();
  for (const value of values) {
    if (!MESH_CONFORMANCE_CAPABILITIES.includes(value)) {
      throw new TypeError("Mesh conformance capability is unknown");
    }
    if (result.has(value)) {
      throw new TypeError("Mesh conformance capability is duplicated");
    }
    result.add(value);
  }
  return result;
}

function result(
  caseId: string,
  capability: MeshConformanceCapability,
  outcome: MeshConformanceCaseResult["outcome"],
  durationMs: number,
  reasonCode?: string,
): MeshConformanceCaseResult {
  return Object.freeze({
    caseId,
    capability,
    outcome,
    ...(reasonCode === undefined ? {} : { reasonCode }),
    durationMs,
  });
}

function duration(started: number, ended: number): number {
  const value = Math.max(0, Math.trunc(ended - started));
  return Number.isSafeInteger(value) ? Math.min(value, 60_000) : 60_000;
}

class ConformanceTimeout extends Error {}
class ConformanceSuiteTimeout extends Error {}
class ConformanceAbort extends Error {}

export class MeshConformanceCleanupError extends Error {
  constructor(readonly previousFailure?: unknown) {
    super("Mesh conformance cleanup failed");
  }
}

function cleanupReason(error: MeshConformanceCleanupError): string {
  return error.previousFailure instanceof ConformanceTimeout
    ? "timeout_cleanup_failed"
    : error.previousFailure instanceof ConformanceSuiteTimeout
      ? "suite_timeout_cleanup_failed"
      : error.previousFailure instanceof ConformanceAbort
        ? "aborted_cleanup_failed"
        : "cleanup_failed";
}

function monotonicNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}
