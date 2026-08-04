import { compareMeshTimestamps } from "@agentplat/mesh-protocol";
import type {
  CollectivePeerNodeAssignmentConfirmationV1,
  CollectivePeerNodeRecoveryElectionDecisionV1,
} from "@agentplat/collective-runtime/node";
import type {
  CollectivePeerNodeQuorumPortsV1,
  CollectiveQuorumAssignmentAttestationPayloadV1,
  CollectiveQuorumAssignmentCertificateV1,
  CollectiveQuorumAssignmentInputV1,
  CollectiveQuorumAssignmentRequestPayloadV1,
  CollectiveQuorumBallotV1,
  CollectiveQuorumClientOptionsV1,
  CollectiveQuorumPayloadV1,
  CollectiveQuorumRecoveryAcceptPayloadV1,
  CollectiveQuorumRecoveryAcceptedPayloadV1,
  CollectiveQuorumRecoveryCertificateV1,
  CollectiveQuorumRecoveryInputV1,
  CollectiveQuorumRecoveryPreparePayloadV1,
  CollectiveQuorumRecoveryPromisePayloadV1,
  CollectiveQuorumRecoveryProposalV1,
  CollectiveQuorumRecoveryValueV1,
  CollectiveQuorumRequestPayloadV1,
  CollectiveQuorumResponsePayloadV1,
  SignedCollectiveQuorumEnvelopeV1,
  UnsignedCollectiveQuorumEnvelopeV1,
} from "./contracts.js";
import {
  COLLECTIVE_QUORUM_PROTOCOL_V1,
  COLLECTIVE_QUORUM_SCHEMA_VERSION_V1,
} from "./contracts.js";
import {
  compareCollectiveQuorumBallotsV1,
  sameCollectiveQuorumBallotV1,
  sameCollectiveQuorumRecoveryValueV1,
} from "./codec.js";
import {
  collectiveQuorumDigestV1,
  collectiveQuorumMessageIdV1,
  signCollectiveQuorumEnvelopeV1,
  verifyCollectiveQuorumEnvelopeV1,
} from "./crypto.js";

const DEFAULT_MAXIMUM_ATTEMPTS = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_MAXIMUM_ENVELOPE_TTL_MS = 30_000;

/**
 * Per-operation quorum proposer. It has no elected or persistent coordinator
 * role: every peer may create a higher durable ballot after a partition.
 */
export class CollectiveQuorumClientV1 {
  readonly #maximumAttempts: number;
  readonly #requestTimeoutMs: number;
  readonly #maximumEnvelopeTtlMs: number;

  constructor(readonly options: CollectiveQuorumClientOptionsV1) {
    assertOptions(options);
    this.#maximumAttempts = options.maximumAttempts ?? DEFAULT_MAXIMUM_ATTEMPTS;
    this.#requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#maximumEnvelopeTtlMs =
      options.maximumEnvelopeTtlMs ?? DEFAULT_MAXIMUM_ENVELOPE_TTL_MS;
  }

  async confirm(
    input: CollectiveQuorumAssignmentInputV1,
  ): Promise<CollectivePeerNodeAssignmentConfirmationV1 | null> {
    const scope = this.options.scope;
    const contract = input.workContract;
    const assignment = contract.assignment;
    const witnesses = sortedIdentifiers(input.eligibleWitnessPeerIds);
    if (
      contract.tenantId !== scope.tenantId ||
      contract.policyDomainId !== scope.policyDomainId ||
      contract.objective.meshId !== scope.meshId ||
      assignment.assignedPeerId !== scope.peerId ||
      assignment.assignedInstanceId !== scope.instanceId ||
      !strictMajority(input.recoveryWitnessThreshold, witnesses.length)
    )
      return null;
    const membership = await this.#membershipBinding(input.logicalTimeMs, [
      this.options.scope.peerId,
      assignment.ownerPeerId,
      assignment.assignedPeerId,
      ...witnesses,
    ]);
    if (!membership) return null;
    const assignmentSlotDigest = await collectiveQuorumDigestV1(
      {
        tenantId: scope.tenantId,
        meshId: scope.meshId,
        objectiveId: contract.objective.objectiveId,
        objectiveRevision: contract.objective.objectiveRevision,
        workItemId: assignment.workItemId,
        workItemRevision: assignment.workItemRevision,
        assignmentEpoch: assignment.assignmentEpoch,
        latestLeaseRenewalId: input.latestLeaseRenewalId,
      },
      this.options.crypto,
    );
    const scopeDigest = await collectiveQuorumDigestV1(
      {
        assignmentSlotDigest,
        workContractId: contract.workContractId,
        workContractDigest: contract.workContractDigest,
        ownerPeerId: assignment.ownerPeerId,
        assignedPeerId: assignment.assignedPeerId,
        assignedInstanceId: assignment.assignedInstanceId,
        assignmentAuthorityId: assignment.assignmentAuthorityId,
        assignmentEpoch: assignment.assignmentEpoch,
        fencingToken: assignment.fencingToken,
        acceptanceMessageId: input.acceptanceMessageId,
      },
      this.options.crypto,
    );
    const payload: CollectiveQuorumAssignmentRequestPayloadV1 = {
      type: "assignment.confirm.request",
      scopeDigest,
      assignmentSlotDigest,
      workContractId: contract.workContractId,
      workContractDigest: contract.workContractDigest,
      policyDomainId: contract.policyDomainId,
      objectiveId: contract.objective.objectiveId,
      objectiveRevision: contract.objective.objectiveRevision,
      workItemId: assignment.workItemId,
      workItemRevision: assignment.workItemRevision,
      ownerPeerId: assignment.ownerPeerId,
      assignedPeerId: assignment.assignedPeerId,
      assignedInstanceId: assignment.assignedInstanceId,
      assignmentAuthorityId: assignment.assignmentAuthorityId,
      assignmentEpoch: assignment.assignmentEpoch,
      fencingToken: assignment.fencingToken,
      acceptanceMessageId: input.acceptanceMessageId,
      latestLeaseRenewalId: input.latestLeaseRenewalId,
      eligibleWitnessPeerIds: witnesses,
      recoveryWitnessThreshold: input.recoveryWitnessThreshold,
      requestedAtLogicalMs: input.logicalTimeMs,
      ...membership,
    };
    const peerIds = [assignment.ownerPeerId, ...witnesses];
    const exchanges = await this.#exchangeMany(payload, peerIds);
    const owner = exchanges.find(
      ({ peerId, request, response }) =>
        peerId === assignment.ownerPeerId &&
        isAssignmentAttestation(response?.payload) &&
        validAssignmentAttestation(
          payload,
          request,
          response!,
          peerId,
          "owner",
        ),
    );
    if (!owner?.response || !isAssignmentAttestation(owner.response.payload))
      return null;
    const ownerValue = assignmentAttestationValue(owner.response.payload);
    const witnessExchanges = exchanges
      .filter(
        ({ peerId, request, response }) =>
          witnesses.includes(peerId) &&
          isAssignmentAttestation(response?.payload) &&
          validAssignmentAttestation(
            payload,
            request,
            response!,
            peerId,
            "witness",
          ) &&
          sameJson(
            ownerValue,
            assignmentAttestationValue(
              response!
                .payload as CollectiveQuorumAssignmentAttestationPayloadV1,
            ),
          ),
      )
      .sort((left, right) => left.peerId.localeCompare(right.peerId));
    if (witnessExchanges.length < input.recoveryWitnessThreshold) return null;
    const selectedWitnesses = witnessExchanges.slice(
      0,
      input.recoveryWitnessThreshold,
    );
    const requests = [owner, ...selectedWitnesses]
      .map(({ request }) => request)
      .sort((left, right) =>
        left.audiencePeerId.localeCompare(right.audiencePeerId),
      );
    const witnessAttestations = selectedWitnesses.map(
      ({ response }) =>
        response as SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1>,
    );
    const certificateSeed = {
      schemaVersion: 1 as const,
      kind: "assignment_confirmation" as const,
      scopeDigest,
      requestMessageIds: requests.map(({ messageId }) => messageId),
      ownerAttestation: owner.response,
      witnessAttestations,
    };
    const certificateDigest = await collectiveQuorumDigestV1(
      certificateSeed,
      this.options.crypto,
    );
    const certificateId = `quorum.assignment.certificate.${certificateDigest.slice(7, 47)}`;
    const certificate: CollectiveQuorumAssignmentCertificateV1 = deepFreeze({
      schemaVersion: 1,
      kind: "assignment_confirmation",
      certificateId,
      scopeDigest,
      requests,
      ownerAttestation:
        owner.response as SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1>,
      witnessAttestations,
      certificateDigest,
    });
    await this.options.repository.saveCertificate(certificate);
    const ownerPayload = owner.response.payload;
    return Object.freeze({
      schemaVersion: 1,
      confirmationId: certificateId,
      ownerPeerId: ownerPayload.ownerPeerId,
      acceptanceId: ownerPayload.acceptanceId,
      assignmentAuthorityId: ownerPayload.assignmentAuthorityId,
      assignmentEpoch: ownerPayload.assignmentEpoch,
      fencingToken: ownerPayload.fencingToken,
      leaseRenewalId: ownerPayload.leaseRenewalId,
      confirmedLeaseExpiresAt: ownerPayload.confirmedLeaseExpiresAt,
      confirmedWitnessPeerIds: Object.freeze(
        selectedWitnesses.map(({ peerId }) => peerId),
      ),
      confirmedAtLogicalMs: input.logicalTimeMs,
    });
  }

  async select(
    input: CollectiveQuorumRecoveryInputV1,
  ): Promise<CollectivePeerNodeRecoveryElectionDecisionV1 | null> {
    const witnesses = sortedIdentifiers(input.eligibleWitnessPeerIds);
    const proposals = Object.freeze(
      [...input.proposals]
        .map((proposal) => Object.freeze({ ...proposal }))
        .sort((left, right) =>
          left.takeoverProposalId.localeCompare(right.takeoverProposalId),
        ),
    ) as readonly CollectiveQuorumRecoveryProposalV1[];
    if (
      proposals.length === 0 ||
      !strictMajority(input.recoveryWitnessThreshold, witnesses.length) ||
      input.proposedAssignmentEpoch !== input.priorAssignmentEpoch + 1 ||
      input.logicalTimeMs >= input.objectiveExpiresAtLogicalMs
    )
      return null;
    const membership = await this.#membershipBinding(input.logicalTimeMs, [
      this.options.scope.peerId,
      ...witnesses,
      ...proposals.map(({ proposedAssigneePeerId }) => proposedAssigneePeerId),
    ]);
    if (!membership) return null;
    const proposalsDigest = await collectiveQuorumDigestV1(
      proposals,
      this.options.crypto,
    );
    for (let attempt = 0; attempt < this.#maximumAttempts; attempt += 1) {
      const ballot = await this.options.repository.nextBallot({
        scopeDigest: input.scopeDigest,
        proposerPeerId: this.options.scope.peerId,
      });
      const preparePayload: CollectiveQuorumRecoveryPreparePayloadV1 = {
        type: "recovery.prepare",
        scopeDigest: input.scopeDigest,
        objectiveId: input.objectiveId,
        objectiveRevision: input.objectiveRevision,
        objectiveExpiresAtLogicalMs: input.objectiveExpiresAtLogicalMs,
        workItemId: input.workItemId,
        workItemRevision: input.workItemRevision,
        priorAssignmentEpoch: input.priorAssignmentEpoch,
        proposedAssignmentEpoch: input.proposedAssignmentEpoch,
        ballot,
        proposalsDigest,
        proposals,
        eligibleWitnessPeerIds: witnesses,
        recoveryWitnessThreshold: input.recoveryWitnessThreshold,
        requestedAtLogicalMs: input.logicalTimeMs,
        ...membership,
      };
      const prepareExchanges = await this.#exchangeMany(
        preparePayload,
        witnesses,
      );
      const promiseExchanges = prepareExchanges
        .filter(({ peerId, request, response }) =>
          validRecoveryPromise(
            preparePayload,
            request,
            response,
            peerId,
            this.options.scope.peerId,
          ),
        )
        .sort((left, right) => left.peerId.localeCompare(right.peerId));
      if (promiseExchanges.length < input.recoveryWitnessThreshold) continue;
      const quorumPromises = promiseExchanges.slice(
        0,
        input.recoveryWitnessThreshold,
      );
      const selected = await selectRecoveryValue(
        input.scopeDigest,
        proposals,
        quorumPromises.map(
          ({ response }) =>
            (
              response as SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1>
            ).payload,
        ),
        this.options.crypto,
      );
      if (!selected) return null;
      const expiresAtLogicalMs = input.objectiveExpiresAtLogicalMs;
      const acceptPayload: CollectiveQuorumRecoveryAcceptPayloadV1 = {
        type: "recovery.accept",
        scopeDigest: input.scopeDigest,
        objectiveId: input.objectiveId,
        objectiveRevision: input.objectiveRevision,
        objectiveExpiresAtLogicalMs: input.objectiveExpiresAtLogicalMs,
        workItemId: input.workItemId,
        workItemRevision: input.workItemRevision,
        priorAssignmentEpoch: input.priorAssignmentEpoch,
        proposedAssignmentEpoch: input.proposedAssignmentEpoch,
        ballot,
        proposalsDigest,
        proposals,
        selected,
        eligibleWitnessPeerIds: witnesses,
        recoveryWitnessThreshold: input.recoveryWitnessThreshold,
        promiseMessageIds: Object.freeze(
          quorumPromises.map(({ response }) => response!.messageId).sort(),
        ),
        requestedAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs,
        ...membership,
      };
      const acceptExchanges = await this.#exchangeMany(
        acceptPayload,
        witnesses,
      );
      const acceptedExchanges = acceptExchanges
        .filter(({ peerId, request, response }) =>
          validRecoveryAccepted(
            acceptPayload,
            request,
            response,
            peerId,
            this.options.scope.peerId,
          ),
        )
        .sort((left, right) => left.peerId.localeCompare(right.peerId));
      if (acceptedExchanges.length < input.recoveryWitnessThreshold) continue;
      const acceptedQuorum = acceptedExchanges.slice(
        0,
        input.recoveryWitnessThreshold,
      );
      const prepares = quorumPromises.map(({ request }) => request);
      const promises = quorumPromises.map(
        ({ response }) =>
          response as SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1>,
      );
      const accepts = acceptedQuorum.map(({ request }) => request);
      const accepted = acceptedQuorum.map(
        ({ response }) =>
          response as SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptedPayloadV1>,
      );
      const certificateSeed = {
        schemaVersion: 1 as const,
        kind: "recovery_election" as const,
        scopeDigest: input.scopeDigest,
        ballot,
        prepareMessageIds: prepares.map(({ messageId }) => messageId),
        promises,
        acceptMessageIds: accepts.map(({ messageId }) => messageId),
        accepted,
        selected,
        certifiedAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs,
      };
      const certificateDigest = await collectiveQuorumDigestV1(
        certificateSeed,
        this.options.crypto,
      );
      const certificateId = `quorum.recovery.certificate.${certificateDigest.slice(7, 47)}`;
      const certificate: CollectiveQuorumRecoveryCertificateV1 = deepFreeze({
        schemaVersion: 1,
        kind: "recovery_election",
        certificateId,
        scopeDigest: input.scopeDigest,
        ballot,
        prepares,
        promises,
        accepts,
        accepted,
        selected,
        certifiedAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs,
        certificateDigest,
      });
      await this.options.repository.saveCertificate(certificate);
      return Object.freeze({
        schemaVersion: 1,
        electionId: certificateId,
        electionRound: ballot.counter,
        scopeDigest: input.scopeDigest,
        selectedProposalId: selected.selectedProposalId,
        selectedAssigneePeerId: selected.selectedAssigneePeerId,
        certifiedWitnessPeerIds: Object.freeze(
          acceptedQuorum.map(({ peerId }) => peerId),
        ),
        certifiedAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs,
      });
    }
    return null;
  }

  ports(): CollectivePeerNodeQuorumPortsV1 {
    return Object.freeze({
      assignmentConfirmation: Object.freeze({
        confirm: (input: CollectiveQuorumAssignmentInputV1) =>
          this.confirm(input),
      }),
      recoveryElection: Object.freeze({
        select: (input: CollectiveQuorumRecoveryInputV1) => this.select(input),
      }),
    });
  }

  async #exchangeMany<TRequest extends CollectiveQuorumRequestPayloadV1>(
    payload: TRequest,
    peerIds: readonly string[],
  ): Promise<readonly ExchangeResult<TRequest>[]> {
    return Promise.all(
      peerIds.map(async (peerId) => {
        const request = await this.#signRequest(payload, peerId);
        let candidate: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1> | null =
          null;
        try {
          candidate = await this.options.transport.exchange({
            peerId,
            request,
            signal: AbortSignal.timeout(this.#requestTimeoutMs),
          });
        } catch {
          candidate = null;
        }
        const verified = candidate
          ? await this.#verifyResponse(
              candidate,
              peerId,
              payload.requestedAtLogicalMs,
            )
          : null;
        return Object.freeze({ peerId, request, response: verified });
      }),
    );
  }

  async #membershipBinding(
    logicalTimeMs: number,
    requiredPeerIds: readonly string[],
  ): Promise<
    | Record<string, never>
    | {
        readonly membershipEpoch: number;
        readonly membershipConfigurationDigest: string;
      }
    | null
  > {
    if (!this.options.membership) return {};
    const binding = await this.options.membership.currentBinding({
      logicalTimeMs,
    });
    if (!binding) return null;
    const members = new Set(binding.memberPeerIds);
    const localInstance = binding.memberInstances.find(
      ({ peerId }) => peerId === this.options.scope.peerId,
    );
    if (
      localInstance?.instanceId !== this.options.scope.instanceId ||
      !requiredPeerIds.every((peerId) => members.has(peerId))
    )
      return null;
    return {
      membershipEpoch: binding.epoch,
      membershipConfigurationDigest: binding.configurationDigest,
    };
  }

  async #signRequest<TPayload extends CollectiveQuorumRequestPayloadV1>(
    payload: TPayload,
    audiencePeerId: string,
  ): Promise<SignedCollectiveQuorumEnvelopeV1<TPayload>> {
    const now = this.options.clock.now();
    const expiresAt = new Date(
      Date.parse(now.wallTime) + this.#maximumEnvelopeTtlMs,
    ).toISOString();
    const messageId = await collectiveQuorumMessageIdV1(
      payload.type.replaceAll(".", "-"),
      {
        payload,
        audiencePeerId,
        senderPeerId: this.options.scope.peerId,
        issuedAt: now.wallTime,
      },
      this.options.crypto,
    );
    const envelope: UnsignedCollectiveQuorumEnvelopeV1<TPayload> = {
      protocol: COLLECTIVE_QUORUM_PROTOCOL_V1,
      schemaVersion: COLLECTIVE_QUORUM_SCHEMA_VERSION_V1,
      messageId,
      tenantId: this.options.scope.tenantId,
      meshId: this.options.scope.meshId,
      senderPeerId: this.options.scope.peerId,
      senderInstanceId: this.options.scope.instanceId,
      audiencePeerId,
      issuedAt: now.wallTime,
      expiresAt,
      payload,
      proof: {
        algorithm: this.options.signing.algorithm,
        keyId: this.options.signing.keyId,
      },
    };
    return signCollectiveQuorumEnvelopeV1({
      envelope,
      privateKey: this.options.signing.privateKey,
      crypto: this.options.crypto,
    });
  }

  async #verifyResponse(
    candidate: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1>,
    peerId: string,
    logicalTimeMs: number,
  ): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1> | null> {
    const now = this.options.clock.now();
    const response =
      await verifyCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1>(
        {
          envelope: candidate,
          resolver: this.options.resolver,
          verifiedAt: now.wallTime,
          crypto: this.options.crypto,
        },
      );
    let validInstance = true;
    if (response && this.options.membership) {
      const epoch = response.payload.membershipEpoch;
      const configurationDigest =
        response.payload.membershipConfigurationDigest;
      const binding =
        epoch !== undefined && configurationDigest !== undefined
          ? await this.options.membership.resolveBinding({
              epoch,
              configurationDigest,
              logicalTimeMs,
            })
          : null;
      validInstance =
        binding?.memberInstances.find(
          ({ peerId: memberPeerId }) => memberPeerId === peerId,
        )?.instanceId === response.senderInstanceId;
    }
    if (
      !response ||
      response.tenantId !== this.options.scope.tenantId ||
      response.meshId !== this.options.scope.meshId ||
      response.senderPeerId !== peerId ||
      !validInstance ||
      response.audiencePeerId !== this.options.scope.peerId
    )
      return null;
    const expiry = compareMeshTimestamps(now.wallTime, response.expiresAt);
    return expiry.ok && expiry.value < 0 ? response : null;
  }
}

interface ExchangeResult<TRequest extends CollectiveQuorumRequestPayloadV1> {
  readonly peerId: string;
  readonly request: SignedCollectiveQuorumEnvelopeV1<TRequest>;
  readonly response: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1> | null;
}

async function selectRecoveryValue(
  scopeDigest: string,
  proposals: readonly CollectiveQuorumRecoveryProposalV1[],
  promises: readonly CollectiveQuorumRecoveryPromisePayloadV1[],
  crypto?: Crypto,
): Promise<CollectiveQuorumRecoveryValueV1 | null> {
  const accepted = promises
    .map((promise) => promise.accepted)
    .filter((value) => value !== null)
    .sort((left, right) =>
      compareCollectiveQuorumBallotsV1(right.ballot, left.ballot),
    );
  let selected: CollectiveQuorumRecoveryValueV1;
  if (accepted[0]) {
    const highest = accepted[0];
    if (
      accepted.some(
        (entry) =>
          sameCollectiveQuorumBallotV1(entry.ballot, highest.ballot) &&
          !sameCollectiveQuorumRecoveryValueV1(entry.value, highest.value),
      )
    )
      return null;
    selected = highest.value;
  } else {
    const ranked = await Promise.all(
      proposals.map(async (proposal) => ({
        proposal,
        rank: await collectiveQuorumDigestV1(
          {
            scopeDigest,
            selectedProposalId: proposal.takeoverProposalId,
            selectedAssigneePeerId: proposal.proposedAssigneePeerId,
          },
          crypto,
        ),
      })),
    );
    ranked.sort((left, right) => left.rank.localeCompare(right.rank));
    selected = {
      selectedProposalId: ranked[0]!.proposal.takeoverProposalId,
      selectedAssigneePeerId: ranked[0]!.proposal.proposedAssigneePeerId,
    };
  }
  return proposals.some(
    (proposal) =>
      proposal.takeoverProposalId === selected.selectedProposalId &&
      proposal.proposedAssigneePeerId === selected.selectedAssigneePeerId,
  )
    ? Object.freeze({ ...selected })
    : null;
}

function validAssignmentAttestation(
  request: CollectiveQuorumAssignmentRequestPayloadV1,
  requestEnvelope: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentRequestPayloadV1>,
  response: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1>,
  peerId: string,
  role: "owner" | "witness",
): boolean {
  const payload = response.payload;
  return (
    isAssignmentAttestation(payload) &&
    payload.requestMessageId === requestEnvelope.messageId &&
    payload.scopeDigest === request.scopeDigest &&
    payload.assignmentSlotDigest === request.assignmentSlotDigest &&
    payload.attesterPeerId === peerId &&
    payload.attesterRole === role &&
    payload.ownerPeerId === request.ownerPeerId &&
    payload.assignmentAuthorityId === request.assignmentAuthorityId &&
    payload.assignmentEpoch === request.assignmentEpoch &&
    payload.fencingToken === request.fencingToken &&
    payload.leaseRenewalId === request.latestLeaseRenewalId &&
    payload.confirmedAtLogicalMs === request.requestedAtLogicalMs &&
    sameMembershipBinding(request, payload)
  );
}

function validRecoveryPromise(
  payload: CollectiveQuorumRecoveryPreparePayloadV1,
  request: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPreparePayloadV1>,
  response: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1> | null,
  peerId: string,
  requesterPeerId: string,
): boolean {
  if (!response || !isRecoveryPromise(response.payload)) return false;
  const promise = response.payload;
  return (
    response.audiencePeerId === requesterPeerId &&
    promise.requestMessageId === request.messageId &&
    promise.scopeDigest === payload.scopeDigest &&
    sameCollectiveQuorumBallotV1(promise.ballot, payload.ballot) &&
    promise.witnessPeerId === peerId &&
    payload.eligibleWitnessPeerIds.includes(peerId) &&
    sameMembershipBinding(payload, promise)
  );
}

function validRecoveryAccepted(
  payload: CollectiveQuorumRecoveryAcceptPayloadV1,
  request: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptPayloadV1>,
  response: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1> | null,
  peerId: string,
  requesterPeerId: string,
): boolean {
  if (!response || !isRecoveryAccepted(response.payload)) return false;
  const accepted = response.payload;
  return (
    response.audiencePeerId === requesterPeerId &&
    accepted.requestMessageId === request.messageId &&
    accepted.scopeDigest === payload.scopeDigest &&
    sameCollectiveQuorumBallotV1(accepted.ballot, payload.ballot) &&
    sameCollectiveQuorumRecoveryValueV1(accepted.selected, payload.selected) &&
    accepted.witnessPeerId === peerId &&
    accepted.acceptedAtLogicalMs === payload.requestedAtLogicalMs &&
    accepted.expiresAtLogicalMs === payload.expiresAtLogicalMs &&
    sameMembershipBinding(payload, accepted)
  );
}

function sameMembershipBinding(
  request: {
    readonly membershipEpoch?: number;
    readonly membershipConfigurationDigest?: string;
  },
  response: {
    readonly membershipEpoch?: number;
    readonly membershipConfigurationDigest?: string;
  },
): boolean {
  return (
    request.membershipEpoch === response.membershipEpoch &&
    request.membershipConfigurationDigest ===
      response.membershipConfigurationDigest
  );
}

function isAssignmentAttestation(
  value: CollectiveQuorumPayloadV1 | undefined,
): value is CollectiveQuorumAssignmentAttestationPayloadV1 {
  return value?.type === "assignment.confirm.attestation";
}

function isRecoveryPromise(
  value: CollectiveQuorumPayloadV1,
): value is CollectiveQuorumRecoveryPromisePayloadV1 {
  return value.type === "recovery.promise";
}

function isRecoveryAccepted(
  value: CollectiveQuorumPayloadV1,
): value is CollectiveQuorumRecoveryAcceptedPayloadV1 {
  return value.type === "recovery.accepted";
}

function assignmentAttestationValue(
  payload: CollectiveQuorumAssignmentAttestationPayloadV1,
) {
  return {
    scopeDigest: payload.scopeDigest,
    assignmentSlotDigest: payload.assignmentSlotDigest,
    ownerPeerId: payload.ownerPeerId,
    acceptanceId: payload.acceptanceId,
    assignmentAuthorityId: payload.assignmentAuthorityId,
    assignmentEpoch: payload.assignmentEpoch,
    fencingToken: payload.fencingToken,
    leaseRenewalId: payload.leaseRenewalId,
    confirmedLeaseExpiresAt: payload.confirmedLeaseExpiresAt,
  } as const;
}

function sortedIdentifiers(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function strictMajority(threshold: number, members: number): boolean {
  return (
    Number.isSafeInteger(threshold) &&
    threshold > members / 2 &&
    threshold <= members
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>))
      deepFreeze(nested);
  }
  return value;
}

function assertOptions(options: CollectiveQuorumClientOptionsV1): void {
  if (
    !options?.scope?.tenantId ||
    !options.scope.meshId ||
    !options.scope.peerId ||
    !options.scope.instanceId ||
    !options.scope.policyDomainId ||
    !options.signing?.privateKey ||
    !options.signing.keyId ||
    !options.resolver ||
    !options.repository ||
    !options.transport ||
    !options.clock
  )
    throw new TypeError("Collective quorum client options are required");
  const attempts = options.maximumAttempts ?? DEFAULT_MAXIMUM_ATTEMPTS;
  const timeout = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 32)
    throw new RangeError("maximumAttempts is out of range");
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000)
    throw new RangeError("requestTimeoutMs is out of range");
}
