import type { VerifiedMeshEnvelope } from "@agentplat/mesh-protocol";

import type {
  CollectivePeerHostRoutePortV1,
  CollectivePeerHostRouteV1,
} from "./host-contracts.js";

import { assertVerifiedEnvelopeShapeV1 } from "./host-validation.js";

const NODE_TYPES = new Set([
  "peer.hello",
  "peer.card",
  "peer.ping",
  "peer.ping_ack",
  "peer.digest",
  "peer.sync_request",
  "peer.sync_response",
  "peer.goodbye",
  "capability.advertise",
  "capability.withdraw",
  "objective.announce",
  "objective.revise",
  "objective.cancel",
  "work.offer",
  "work.bid",
  "work.award",
  "work.accept",
  "work.decline",
  "work.progress",
  "work.checkpoint",
  "work.result",
  "work.release",
  "work.cancel",
  "lease.renew",
  "lease.takeover_proposal",
  "lease.vote",
  "lease.certificate",
  "evidence.claim",
  "evidence.attest",
  "evidence.challenge",
  "evidence.retract",
  "trust.observation",
]);

/**
 * Resolves exactly one local route. No prefix matching and no best-effort
 * fallback: an unknown or ambiguous critical extension is rejected.
 */
export function routeCollectivePeerEnvelopeV1(input: {
  readonly envelope: VerifiedMeshEnvelope;
  readonly routes: readonly CollectivePeerHostRoutePortV1[];
  readonly knownCriticalExtensions: ReadonlySet<string>;
}): CollectivePeerHostRouteV1 {
  const envelope = assertVerifiedEnvelopeShapeV1(input.envelope);
  const critical = envelope.criticalExtensions ?? [];
  if (critical.length > 1)
    throw new TypeError(
      "multiple critical extensions cannot select one host route",
    );
  if (critical.length === 1) {
    const extension = critical[0]!;
    if (!input.knownCriticalExtensions.has(extension))
      throw new TypeError("unknown critical extension");
    const matches = input.routes.filter(
      (route) =>
        route.route.kind === "exchange" &&
        route.route.criticalExtension === extension,
    );
    if (matches.length !== 1)
      throw new TypeError("critical extension has no unique exchange route");
    return matches[0]!.route;
  }
  if (!NODE_TYPES.has(envelope.type))
    throw new TypeError("unrecognized allocation or node envelope type");
  const matches = input.routes.filter(
    (route) =>
      route.route.kind === "node" && route.route.criticalExtension === null,
  );
  if (matches.length !== 1)
    throw new TypeError("node envelope has no unique node route");
  return matches[0]!.route;
}
