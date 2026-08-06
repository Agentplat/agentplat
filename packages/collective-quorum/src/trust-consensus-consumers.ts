import type {
  TrustEligibilityDecisionV1 as InferenceTrustEligibilityDecisionV1,
  TrustEligibilityResolverV1 as InferenceTrustEligibilityResolverV1,
  TrustEligibilityStatusV1 as InferenceTrustEligibilityStatusV1,
  TrustEligibilityTargetV1 as InferenceTrustEligibilityTargetV1,
} from "@agentplat/inference-control/trust";
import type {
  MeshTrustCandidateV1,
  MeshTrustEligibilityResolverV1,
} from "@agentplat/mesh/trust";
import type {
  CollectiveTrustInferenceEligibilityOptionsV1,
  CollectiveTrustMeshEligibilityOptionsV1,
} from "./trust-consensus-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const TRUST_DIGEST = /^[0-9a-f]{64}$/u;
const INFERENCE_STATUSES = new Set([
  "eligible",
  "mismatch",
  "quarantined",
  "restricted",
  "stale",
  "unavailable",
]);
const MESH_STATUSES = new Set([
  "eligible",
  "quarantined",
  "restricted",
  "unavailable",
]);

/**
 * Mesh allocation is deliberately synchronous. The host refreshes verified
 * gate decisions outside the final selection step and this adapter reads only
 * that local cache.
 */
export function createCollectiveTrustMeshEligibilityResolverV1<
  TCandidate extends MeshTrustCandidateV1,
>(
  options: CollectiveTrustMeshEligibilityOptionsV1<TCandidate>,
): MeshTrustEligibilityResolverV1 {
  if (
    !TRUST_DIGEST.test(options?.bindingDigest ?? "") ||
    !options.local ||
    !TRUST_DIGEST.test(options.local.bindingDigest) ||
    typeof options.local.evaluate !== "function" ||
    !options.gates ||
    typeof options.gates.resolve !== "function"
  )
    throw new TypeError("collective Mesh eligibility options are required");
  return Object.freeze({
    bindingDigest: options.bindingDigest,
    evaluate: (candidate: MeshTrustCandidateV1) => {
      try {
        const local = options.local.evaluate(candidate);
        if (!MESH_STATUSES.has(local)) return "unavailable";
        if (local !== "eligible") return local;
        const gate = options.gates.resolve(candidate as TCandidate);
        return gate && MESH_STATUSES.has(gate.disposition)
          ? gate.disposition
          : "unavailable";
      } catch {
        return "unavailable";
      }
    },
  });
}

/**
 * Inference Control performs its final lookup synchronously. The wrapper owns
 * a distinct resolver binding and preserves every stricter local status.
 */
export function createCollectiveTrustInferenceEligibilityResolverV1(
  options: CollectiveTrustInferenceEligibilityOptionsV1,
): InferenceTrustEligibilityResolverV1 {
  if (
    !IDENTIFIER.test(options?.resolverId ?? "") ||
    !Number.isSafeInteger(options.resolverVersion) ||
    options.resolverVersion < 1 ||
    !TRUST_DIGEST.test(options.resolverDigest) ||
    !options.local ||
    !IDENTIFIER.test(options.local.resolverId) ||
    !Number.isSafeInteger(options.local.resolverVersion) ||
    options.local.resolverVersion < 1 ||
    !TRUST_DIGEST.test(options.local.resolverDigest) ||
    typeof options.local.resolve !== "function" ||
    !options.gates ||
    typeof options.gates.resolve !== "function"
  )
    throw new TypeError(
      "collective inference eligibility options are required",
    );
  return Object.freeze({
    resolverId: options.resolverId,
    resolverVersion: options.resolverVersion,
    resolverDigest: options.resolverDigest,
    resolve: (target: InferenceTrustEligibilityTargetV1) => {
      const local: InferenceTrustEligibilityDecisionV1 =
        options.local.resolve(target);
      if (!INFERENCE_STATUSES.has(local.status))
        throw new TypeError("local inference eligibility status is invalid");
      let status: InferenceTrustEligibilityStatusV1 = local.status;
      if (status === "eligible") {
        try {
          const collective = options.gates.resolve(target);
          status =
            collective && MESH_STATUSES.has(collective.disposition)
              ? collective.disposition
              : "unavailable";
        } catch {
          status = "unavailable";
        }
      }
      return Object.freeze({
        ...local,
        status,
        resolverDigest: options.resolverDigest,
      });
    },
  });
}
