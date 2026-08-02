import type {
  CollectiveEnvironmentPortV1,
  CollectiveProtectedEffectAttemptV1,
  CollectiveProtectedEffectReceiptV1,
} from "@agentplat/collective-planning/evaluation";

interface ReceiptProvenanceV1 {
  readonly environment: CollectiveEnvironmentPortV1;
  readonly attemptDigest: string;
  readonly receiptDigest: string;
}

const receiptProvenance = new WeakMap<object, ReceiptProvenanceV1>();
const finalizerEnvironments = new WeakMap<object, CollectiveEnvironmentPortV1>();

export function recordCollectiveEffectReceiptProvenanceV1(
  environment: CollectiveEnvironmentPortV1,
  attempt: CollectiveProtectedEffectAttemptV1,
  receipt: CollectiveProtectedEffectReceiptV1,
): void {
  const retained = receiptProvenance.get(receipt as object);
  if (
    retained !== undefined &&
    (retained.environment !== environment ||
      retained.attemptDigest !== attempt.attemptDigest ||
      retained.receiptDigest !== receipt.receiptDigest)
  )
    throw new TypeError("closed_loop_receipt_provenance_conflict");
  receiptProvenance.set(receipt as object, {
    environment,
    attemptDigest: attempt.attemptDigest,
    receiptDigest: receipt.receiptDigest,
  });
}

export function bindCollectiveFinalizerEnvironmentV1(
  finalizer: object,
  environment: CollectiveEnvironmentPortV1,
): void {
  const retained = finalizerEnvironments.get(finalizer);
  if (retained !== undefined && retained !== environment)
    throw new TypeError("closed_loop_finalizer_environment_conflict");
  finalizerEnvironments.set(finalizer, environment);
}

export function assertCollectiveEffectReceiptProvenanceV1(
  finalizer: object,
  attempt: CollectiveProtectedEffectAttemptV1,
  receipt: CollectiveProtectedEffectReceiptV1,
): void {
  const environment = finalizerEnvironments.get(finalizer);
  const provenance = receiptProvenance.get(receipt as object);
  if (
    environment === undefined ||
    provenance === undefined ||
    provenance.environment !== environment ||
    provenance.attemptDigest !== attempt.attemptDigest ||
    provenance.receiptDigest !== receipt.receiptDigest
  )
    throw new Error("closed_loop_effect_receipt_untrusted");
}
