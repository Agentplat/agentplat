import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";

export type TopologyTransitionKindV1 =
  | "elect_coordinator"
  | "replace_coordinator"
  | "split"
  | "merge"
  | "federate";
export type TopologyTransitionStatusV1 = "prepared" | "activated" | "rolled_back";

export interface AuthorityAssignmentV1 {
  readonly subjectId: string;
  readonly authorityId: string;
  /** Weight in basis points; the sum across a topology is normally 10_000. */
  readonly weightBps: number;
  readonly scope: "local" | "federated";
}

export interface AuthorityConcentrationPolicyV1 {
  readonly maximumSingleAuthorityBps: number;
  readonly maximumFederatedAuthorityBps: number;
  readonly minimumIndependentAuthorities: number;
}

export interface TopologyTransitionProposalV1 {
  readonly schemaVersion: 1;
  readonly transitionId: string;
  readonly kind: TopologyTransitionKindV1;
  readonly topologyId: string;
  readonly fromEpoch: number;
  readonly toEpoch: number;
  readonly predecessorTopologyDigest: PlanningDigestV1;
  readonly nextTopologyDigest: PlanningDigestV1;
  readonly authorityAssignments: readonly AuthorityAssignmentV1[];
  readonly evidenceDigest: PlanningDigestV1;
  readonly requestedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly proposalDigest: PlanningDigestV1;
}

export interface TopologyActivationReceiptV1 {
  readonly schemaVersion: 1;
  readonly transitionId: string;
  readonly topologyId: string;
  readonly epoch: number;
  readonly activatedAtLogicalMs: number;
  readonly status: "activated" | "rolled_back";
  readonly predecessorTopologyDigest: PlanningDigestV1;
  readonly topologyDigest: PlanningDigestV1;
  readonly receiptDigest: PlanningDigestV1;
}

export interface TopologyActivationGateV1 {
  readonly verifyEvidence: (proposal: TopologyTransitionProposalV1) => boolean;
  readonly nowLogicalMs: () => number;
}

export function validateAuthorityConcentrationV1(
  assignments: readonly AuthorityAssignmentV1[],
  policy: AuthorityConcentrationPolicyV1,
): { readonly accepted: boolean; readonly reasonCodes: readonly string[] } {
  const reasons: string[] = [];
  if (!Number.isInteger(policy.maximumSingleAuthorityBps) || policy.maximumSingleAuthorityBps < 0 || policy.maximumSingleAuthorityBps > 10_000)
    reasons.push("invalid_single_authority_limit");
  if (!Number.isInteger(policy.maximumFederatedAuthorityBps) || policy.maximumFederatedAuthorityBps < 0 || policy.maximumFederatedAuthorityBps > 10_000)
    reasons.push("invalid_federated_authority_limit");
  if (!Number.isInteger(policy.minimumIndependentAuthorities) || policy.minimumIndependentAuthorities < 1)
    reasons.push("invalid_independent_authority_limit");
  const weights = new Map<string, number>();
  for (const assignment of assignments) {
    if (!Number.isInteger(assignment.weightBps) || assignment.weightBps < 0) {
      reasons.push("invalid_authority_weight");
      continue;
    }
    weights.set(assignment.authorityId, (weights.get(assignment.authorityId) ?? 0) + assignment.weightBps);
  }
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0);
  if (total > 10_000) reasons.push("authority_weight_exceeds_total");
  if (weights.size < policy.minimumIndependentAuthorities) reasons.push("insufficient_independent_authorities");
  if ([...weights.values()].some((value) => value > policy.maximumSingleAuthorityBps)) reasons.push("single_authority_concentration_exceeded");
  const federated = assignments.filter((assignment) => assignment.scope === "federated").reduce((sum, assignment) => sum + assignment.weightBps, 0);
  if (federated > policy.maximumFederatedAuthorityBps) reasons.push("federated_authority_concentration_exceeded");
  return { accepted: reasons.length === 0, reasonCodes: Object.freeze([...new Set(reasons)]) };
}

export function createTopologyTransitionProposalV1(input: Omit<TopologyTransitionProposalV1, "proposalDigest">): TopologyTransitionProposalV1 {
  if (input.toEpoch !== input.fromEpoch + 1) throw new TypeError("topology_epoch_must_advance_by_one");
  if (input.expiresAtLogicalMs <= input.requestedAtLogicalMs) throw new TypeError("topology_proposal_expiry_invalid");
  const proposalDigest = digestPlanningJsonV1("collective-planning-snapshot", input as never);
  return Object.freeze({ ...input, proposalDigest });
}

export class TopologyActivationControllerV1 {
  readonly #gate: TopologyActivationGateV1;
  #active: TopologyActivationReceiptV1 | null = null;
  #prepared: TopologyTransitionProposalV1 | null = null;
  constructor(gate: TopologyActivationGateV1) { this.#gate = gate; }
  get active(): TopologyActivationReceiptV1 | null { return this.#active; }
  get prepared(): TopologyTransitionProposalV1 | null { return this.#prepared; }
  prepare(proposal: TopologyTransitionProposalV1): void {
    if (this.#gate.nowLogicalMs() >= proposal.expiresAtLogicalMs) throw new Error("topology_proposal_expired");
    if (this.#active && (proposal.fromEpoch !== this.#active.epoch || proposal.predecessorTopologyDigest !== this.#active.topologyDigest)) throw new Error("topology_predecessor_mismatch");
    if (!this.#gate.verifyEvidence(proposal)) throw new Error("topology_evidence_rejected");
    this.#prepared = proposal;
  }
  activate(): TopologyActivationReceiptV1 {
    const proposal = this.#prepared;
    if (!proposal) throw new Error("topology_transition_not_prepared");
    const now = this.#gate.nowLogicalMs();
    if (now >= proposal.expiresAtLogicalMs) throw new Error("topology_proposal_expired");
    const receiptBody = { schemaVersion: 1 as const, transitionId: proposal.transitionId, topologyId: proposal.topologyId, epoch: proposal.toEpoch, activatedAtLogicalMs: now, status: "activated" as const, predecessorTopologyDigest: proposal.predecessorTopologyDigest, topologyDigest: proposal.nextTopologyDigest };
    const receipt = Object.freeze({ ...receiptBody, receiptDigest: digestPlanningJsonV1("collective-planning-snapshot", receiptBody as never) });
    this.#active = receipt;
    this.#prepared = null;
    return receipt;
  }
  rollback(): TopologyActivationReceiptV1 {
    const active = this.#active;
    if (!active) throw new Error("topology_not_active");
    const now = this.#gate.nowLogicalMs();
    const body = { ...active, activatedAtLogicalMs: now, status: "rolled_back" as const, topologyDigest: active.predecessorTopologyDigest };
    const receipt = Object.freeze({ ...body, receiptDigest: digestPlanningJsonV1("collective-planning-snapshot", body as never) });
    this.#active = receipt;
    return receipt;
  }
}
