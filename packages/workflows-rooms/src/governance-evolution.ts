import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import type {
  MorphogenesisAgentGenesisActivationHandoffV6,
  MorphogenesisOrganizationalOwnerHandoffV7,
} from "@agentplat/collective-runtime/morphogenesis";
import type {
  AgentContinuityEvidencePortV1,
  AgentGovernanceHeadV1,
} from "@agentplat/rooms";

export interface GovernedEvolutionReceiptV1 {
  tenantId: string;
  parentAgentId: string;
  childAgentId: string;
  parentConfigurationDigest: string;
  childConfigurationDigest: string;
  receipt:
    | MorphogenesisAgentGenesisActivationHandoffV6
    | MorphogenesisOrganizationalOwnerHandoffV7;
}
/** Loader authenticates the canonical owner record and its exact enrollment mapping. */
export function createEvolutionContinuityEvidenceV1(options: {
  load(
    tenantId: string,
    reference: string,
  ): Promise<GovernedEvolutionReceiptV1 | undefined>;
  align(input: {
    parent: AgentGovernanceHeadV1;
    child: AgentGovernanceHeadV1;
    receipt: GovernedEvolutionReceiptV1;
  }): Promise<{ compatible: boolean; explanation: string }>;
  clock?: () => Date;
}): AgentContinuityEvidencePortV1 {
  return {
    async verify(input) {
      if (input.kind === "handoff")
        throw new Error("evolution_receipt_kind_mismatch");
      const loaded = await options.load(input.parent.tenantId, input.reference);
      if (!loaded) throw new Error("evolution_receipt_unavailable");
      const r = structuredClone(loaded),
        receipt = r.receipt,
        now = (options.clock?.() ?? new Date()).getTime();
      if (
        r.tenantId !== input.parent.tenantId ||
        r.tenantId !== input.child.tenantId ||
        r.parentAgentId !== input.parent.agentId ||
        r.childAgentId !== input.child.agentId ||
        r.parentConfigurationDigest !== input.parent.configurationDigest ||
        r.childConfigurationDigest !== input.child.configurationDigest
      )
        throw new Error("evolution_enrollment_mismatch");
      if (
        receipt.workGranted !== false ||
        receipt.actionAuthorityGranted !== false ||
        !Number.isSafeInteger(receipt.createdAtLogicalMs) ||
        !Number.isSafeInteger(receipt.expiresAtLogicalMs) ||
        receipt.createdAtLogicalMs > now ||
        receipt.expiresAtLogicalMs <= now
      )
        throw new Error("evolution_receipt_authority_or_expiry");
      if (
        input.kind === "genesis"
          ? receipt.schemaVersion !== 6 || !receipt.eligibleForExistingWorkOwner
          : receipt.schemaVersion !== 7 ||
            receipt.membershipGranted !== false ||
            receipt.owner !== "morphogenesis"
      )
        throw new Error("evolution_owner_mismatch");
      const { handoffDigest, ...body } = receipt;
      const expected = digestPlanningJsonV1(
        (receipt.schemaVersion === 6
          ? "morphogenesis-agent-genesis-activation-handoff-v6"
          : "morphogenesis-organizational-owner-handoff-v7") as never,
        JSON.parse(JSON.stringify(body)),
      );
      if (expected !== handoffDigest)
        throw new Error("evolution_receipt_digest_mismatch");
      const alignment = await options.align({
        parent: structuredClone(input.parent),
        child: structuredClone(input.child),
        receipt: r,
      });
      return {
        ...alignment,
        parentConfigurationDigest: r.parentConfigurationDigest,
        childConfigurationDigest: r.childConfigurationDigest,
        evidenceDigest: handoffDigest,
        permittedTools: null,
        expiresAt: new Date(receipt.expiresAtLogicalMs).toISOString(),
      };
    },
  };
}
/** Enrollment intent only. Existing governance owner authentication and activation still apply. */
export function createGenesisGovernanceCommandV1(input: {
  parent: AgentGovernanceHeadV1;
  continuityId: string;
  governanceId: string;
  definitionRevisionId: string;
}) {
  if (input.parent.configuration.origin?.kind === "delegation")
    throw new Error("delegated_work_cannot_create_descendants");
  return {
    kind: "create" as const,
    governanceId: input.governanceId,
    ownerId: input.parent.configuration.ownerId,
    purpose: input.parent.configuration.purpose,
    definitionRevisionId: input.definitionRevisionId,
    origin: {
      parentAgentId: input.parent.agentId,
      continuityId: input.continuityId,
      kind: "genesis" as const,
    },
  };
}
