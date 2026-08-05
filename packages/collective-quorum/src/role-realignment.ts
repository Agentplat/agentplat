import {
  assertRoleRealignmentStateV1,
  createRoleRealignmentCertificateV1,
  validateRoleRealignmentCertificateV1,
  type RoleRealignmentCertificateV1,
  type RoleRealignmentCertificationPortV1,
  type RoleRealignmentPolicyV1,
  type RoleRealignmentStateV1,
} from "@agentplat/inference-control/role-realignment";
import {
  validateTrustEligibilityDecisionV1,
  type TrustEligibilityDecisionV1,
} from "@agentplat/trust";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";

import type {
  CollectiveAgreementDecisionPortV1,
  CollectiveAgreementClockV1,
  CollectiveAgreementMembershipPortV1,
  CollectiveAgreementSemanticPortV1,
} from "./agreement-contracts.js";
import { createCollectiveAgreementValueV1 } from "./agreement-codec.js";
import { verifyCollectiveAgreementCommitCertificateV1 } from "./agreement-certificates.js";

export interface RoleRealignmentAgreementCoordinateV1 {
  readonly height: number;
  readonly round: number;
  readonly previousCommitDigest: string | null;
}

export interface RoleRealignmentAgreementCoordinatePortV1 {
  resolve(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly requestDigest: string;
    readonly selectionDigest: string;
    readonly logicalTimeMs: number;
  }):
    | Promise<RoleRealignmentAgreementCoordinateV1>
    | RoleRealignmentAgreementCoordinateV1;
}

/**
 * Resolves an exact Trust decision for one prospective voter. The adapter
 * accepts only `eligible`; restricted, quarantined, stale and unavailable
 * participants cannot count as certification witnesses.
 */
export interface RoleRealignmentWitnessTrustPortV1 {
  evaluate(input: {
    readonly tenantId: string;
    readonly peerId: string;
    readonly instanceId: string;
    readonly requestDigest: string;
    readonly selectionDigest: string;
    readonly logicalTimeMs: number;
  }):
    | Promise<TrustEligibilityDecisionV1 | null>
    | TrustEligibilityDecisionV1
    | null;
}

export interface CollectiveRoleRealignmentCertificationOptionsV1 {
  readonly policyDomainId: string;
  readonly certifierId: string;
  readonly certifierVersion: number;
  readonly certifierBindingDigest: string;
  readonly agreement: CollectiveAgreementDecisionPortV1;
  readonly membership: CollectiveAgreementMembershipPortV1;
  readonly resolver: MeshKeyResolver;
  readonly clock: CollectiveAgreementClockV1;
  readonly coordinates: RoleRealignmentAgreementCoordinatePortV1;
  readonly witnessTrust: RoleRealignmentWitnessTrustPortV1;
  readonly crypto?: Crypto;
}

/**
 * Turns an existing Byzantine agreement commit into a content-free role
 * certificate. The commit can select a trusted definition digest; it never
 * carries role instructions and never grants action authority.
 */
export function createCollectiveRoleRealignmentCertificationPortV1(
  options: CollectiveRoleRealignmentCertificationOptionsV1,
): RoleRealignmentCertificationPortV1 {
  validateOptions(options);
  return Object.freeze({
    certify: async (
      input: Parameters<RoleRealignmentCertificationPortV1["certify"]>[0],
    ): Promise<RoleRealignmentCertificateV1 | null> => {
      const policy = assertRoleRealignmentStateV1(input.state, input.policy);
      const state = input.state;
      if (
        state.status !== "selected" ||
        !state.selection ||
        input.logicalTimeMs < state.lastLogicalTimeMs ||
        input.logicalTimeMs >= state.request.expiresAtLogicalMs ||
        input.expiresAtLogicalMs <= input.logicalTimeMs ||
        input.expiresAtLogicalMs > state.request.expiresAtLogicalMs
      )
        return null;
      const membership = await options.membership.current({
        policyDomainId: options.policyDomainId,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!membership) return null;
      const slotId = `role-realignment.${state.request.requestDigest.slice(7, 47)}`;
      const coordinate = await options.coordinates.resolve({
        policyDomainId: options.policyDomainId,
        slotId,
        requestDigest: state.request.requestDigest,
        selectionDigest: state.selection.selectionDigest,
        logicalTimeMs: input.logicalTimeMs,
      });
      validateCoordinate(coordinate);
      const value = await createCollectiveAgreementValueV1({
        kind: "role_reconfiguration",
        valueId: state.selection.selectionId,
        previousCommitDigest: coordinate.previousCommitDigest,
        payload: roleRealignmentAgreementPayloadV1(state),
        crypto: options.crypto,
      });
      const unverifiedCommit = await options.agreement.decide({
        membership,
        policyDomainId: options.policyDomainId,
        slotId,
        height: coordinate.height,
        round: coordinate.round,
        value,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
      });
      const commit = unverifiedCommit
        ? await verifyCollectiveAgreementCommitCertificateV1({
            certificate: unverifiedCommit,
            membership,
            resolver: options.resolver,
            verifiedAt: options.clock.now().wallTime,
            crypto: options.crypto,
          })
        : null;
      if (
        !commit ||
        commit.value.valueDigest !== value.valueDigest ||
        commit.coordinate.membershipEpoch !== membership.epoch ||
        commit.coordinate.membershipConfigurationDigest !==
          membership.configurationDigest ||
        commit.coordinate.policyDomainId !== options.policyDomainId ||
        commit.coordinate.slotId !== slotId
      )
        return null;
      const validators = new Map(
        membership.validators.map((validator) => [validator.peerId, validator]),
      );
      const signedPeerIds = [
        ...new Set(
          commit.precommitCertificate.votes.map((vote) => vote.senderPeerId),
        ),
      ].sort(compare);
      const eligibleWitnessIds: string[] = [];
      for (const peerId of signedPeerIds) {
        const validator = validators.get(peerId);
        if (!validator) return null;
        const rawDecision = await options.witnessTrust.evaluate({
          tenantId: state.tenantId,
          peerId,
          instanceId: validator.instanceId,
          requestDigest: state.request.requestDigest,
          selectionDigest: state.selection.selectionDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!rawDecision) continue;
        let decision: TrustEligibilityDecisionV1;
        try {
          decision = validateTrustEligibilityDecisionV1(rawDecision);
        } catch {
          continue;
        }
        if (
          decision.disposition === "eligible" &&
          decision.evaluatedAtLogicalMs <= input.logicalTimeMs
        )
          eligibleWitnessIds.push(peerId);
      }
      if (eligibleWitnessIds.length < policy.minimumCertificationWitnesses)
        return null;
      const certificate = createRoleRealignmentCertificateV1({
        certificateId: `role-certificate-${commit.certificateDigest.slice(7, 39)}`,
        certificationKind: "collective_agreement",
        certifierId: options.certifierId,
        certifierVersion: options.certifierVersion,
        certifierBindingDigest: options.certifierBindingDigest,
        requestDigest: state.request.requestDigest,
        selectionDigest: state.selection.selectionDigest,
        selectedCandidateDigest: state.selection.selectedCandidateDigest,
        selectedDefinitionDigest: state.selection.selectedDefinitionDigest,
        authorityCeilingDigest: state.request.authorityCeiling.ceilingDigest,
        witnessIds: eligibleWitnessIds,
        membershipEpoch: membership.epoch,
        membershipConfigurationDigest: membership.configurationDigest,
        sourceCertificateDigest: commit.certificateDigest,
        certifiedAtLogicalMs: commit.committedAtLogicalMs,
        expiresAtLogicalMs: input.expiresAtLogicalMs,
      });
      return validateRoleRealignmentCertificateV1(certificate, state, policy);
    },
  });
}

export interface RoleRealignmentAgreementSemanticOptionsV1 {
  readonly selectionResolver: {
    validate(input: {
      readonly requestDigest: string;
      readonly selectionDigest: string;
      readonly selectedCandidateDigest: string;
      readonly selectedDefinitionDigest: string;
      readonly authorityCeilingDigest: string;
      readonly selectionStateRevision: number;
      readonly logicalTimeMs: number;
    }): Promise<boolean> | boolean;
  };
  readonly proposerTrust: RoleRealignmentWitnessTrustPortV1;
  readonly tenantId: string;
  readonly instanceForPeer: (
    peerId: string,
  ) => Promise<string | null> | string | null;
  readonly fallback?: CollectiveAgreementSemanticPortV1;
}

/** Peer-side semantic gate suitable for composition with other value kinds. */
export function createRoleRealignmentAgreementSemanticPortV1(
  options: RoleRealignmentAgreementSemanticOptionsV1,
): CollectiveAgreementSemanticPortV1 {
  if (
    !options?.selectionResolver ||
    typeof options.selectionResolver.validate !== "function" ||
    !options.proposerTrust ||
    typeof options.proposerTrust.evaluate !== "function" ||
    !options.tenantId ||
    typeof options.instanceForPeer !== "function" ||
    (options.fallback !== undefined &&
      typeof options.fallback.evaluate !== "function")
  )
    throw new TypeError("role realignment semantic options are required");
  return Object.freeze({
    evaluate: async (
      input: Parameters<CollectiveAgreementSemanticPortV1["evaluate"]>[0],
    ) => {
      if (input.value.kind !== "role_reconfiguration")
        return options.fallback
          ? options.fallback.evaluate(input)
          : Object.freeze({
              accepted: false,
              reasonCode: "unsupported_value_kind",
            });
      const payload = parseRoleRealignmentPayload(input.value.payload);
      if (!payload)
        return Object.freeze({
          accepted: false,
          reasonCode: "invalid_role_reconfiguration",
        });
      const instanceId = await options.instanceForPeer(input.proposerPeerId);
      if (!instanceId)
        return Object.freeze({
          accepted: false,
          reasonCode: "proposer_instance_unavailable",
        });
      const rawDecision = await options.proposerTrust.evaluate({
        tenantId: options.tenantId,
        peerId: input.proposerPeerId,
        instanceId,
        requestDigest: payload.requestDigest,
        selectionDigest: payload.selectionDigest,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!rawDecision)
        return Object.freeze({
          accepted: false,
          reasonCode: "proposer_trust_unavailable",
        });
      try {
        const decision = validateTrustEligibilityDecisionV1(rawDecision);
        if (
          decision.disposition !== "eligible" ||
          decision.evaluatedAtLogicalMs > input.logicalTimeMs
        )
          return Object.freeze({
            accepted: false,
            reasonCode: "proposer_not_eligible",
          });
      } catch {
        return Object.freeze({
          accepted: false,
          reasonCode: "proposer_trust_invalid",
        });
      }
      const accepted = await options.selectionResolver.validate({
        ...payload,
        logicalTimeMs: input.logicalTimeMs,
      });
      return Object.freeze({
        accepted,
        reasonCode: accepted
          ? "role_reconfiguration_valid"
          : "role_reconfiguration_unavailable",
      });
    },
  });
}

function roleRealignmentAgreementPayloadV1(state: RoleRealignmentStateV1) {
  const selection = state.selection!;
  return Object.freeze({
    requestDigest: state.request.requestDigest,
    selectionDigest: selection.selectionDigest,
    selectedCandidateDigest: selection.selectedCandidateDigest,
    selectedDefinitionDigest: selection.selectedDefinitionDigest,
    authorityCeilingDigest: state.request.authorityCeiling.ceilingDigest,
    selectionStateRevision: selection.stateRevision,
  });
}

function parseRoleRealignmentPayload(value: Readonly<Record<string, unknown>>) {
  const keys = Object.keys(value).sort();
  const expected = [
    "authorityCeilingDigest",
    "requestDigest",
    "selectedCandidateDigest",
    "selectedDefinitionDigest",
    "selectionDigest",
    "selectionStateRevision",
  ];
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    !digest(value.requestDigest) ||
    !digest(value.selectionDigest) ||
    !digest(value.selectedCandidateDigest) ||
    !digest(value.selectedDefinitionDigest) ||
    !digest(value.authorityCeilingDigest) ||
    !Number.isSafeInteger(value.selectionStateRevision) ||
    (value.selectionStateRevision as number) < 1
  )
    return null;
  return value as unknown as {
    readonly requestDigest: string;
    readonly selectionDigest: string;
    readonly selectedCandidateDigest: string;
    readonly selectedDefinitionDigest: string;
    readonly authorityCeilingDigest: string;
    readonly selectionStateRevision: number;
  };
}

function validateOptions(
  options: CollectiveRoleRealignmentCertificationOptionsV1,
): void {
  if (
    !options?.policyDomainId ||
    !options.certifierId ||
    !Number.isSafeInteger(options.certifierVersion) ||
    options.certifierVersion < 1 ||
    !digest(options.certifierBindingDigest) ||
    !options.agreement ||
    typeof options.agreement.decide !== "function" ||
    !options.membership ||
    typeof options.membership.current !== "function" ||
    !options.resolver ||
    !options.clock ||
    typeof options.clock.now !== "function" ||
    !options.coordinates ||
    typeof options.coordinates.resolve !== "function" ||
    !options.witnessTrust ||
    typeof options.witnessTrust.evaluate !== "function"
  )
    throw new TypeError("role realignment certification options are required");
}

function validateCoordinate(value: RoleRealignmentAgreementCoordinateV1): void {
  if (
    !value ||
    !Number.isSafeInteger(value.height) ||
    value.height < 1 ||
    !Number.isSafeInteger(value.round) ||
    value.round < 0 ||
    !(
      value.previousCommitDigest === null || digest(value.previousCommitDigest)
    ) ||
    (value.height === 1) !== (value.previousCommitDigest === null)
  )
    throw new TypeError("role realignment agreement coordinate is invalid");
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
