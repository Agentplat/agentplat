import {
  COLLECTIVE_DECISION_STATE_FORMAT_V1,
  type CollectiveDecisionCandidateV1,
  type CollectiveDecisionCertificateV1,
  type CollectiveDecisionCompactedHeadV1,
  type CollectiveDecisionCommitInputV1,
  type CollectiveDecisionPortV1,
  type CollectiveDecisionRuntimeOptionsV1,
  type CollectiveDecisionStateV1,
  type CollectiveDecisionStoreV1,
  type CollectiveDecisionV1,
} from "./collective-decision-contracts.js";
import {
  compactedDecisionSlotV1,
  createCollectiveDecisionCandidateV1,
  createCollectiveDecisionCompactedHeadV1,
  createCollectiveDecisionStateV1,
  createCollectiveDecisionV1,
  decisionSlotV1,
  validateCollectiveDecisionCandidateV1,
  validateCollectiveDecisionCertificateV1,
  validateCollectiveDecisionPolicyV1,
  validateCollectiveDecisionStateV1,
  verifyCollectiveDecisionCertificateV1,
} from "./collective-decision-validation.js";

/** Deterministic in-memory CAS store for local simulations and tests. */
export class InMemoryCollectiveDecisionStoreV1 implements CollectiveDecisionStoreV1 {
  readonly #states = new Map<string, CollectiveDecisionStateV1>();

  async load(stateKey: string): Promise<CollectiveDecisionStateV1 | null> {
    return this.#states.get(stateKey) ?? null;
  }

  async save(input: {
    readonly state: CollectiveDecisionStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    const state = validateCollectiveDecisionStateV1(input.state);
    const current = this.#states.get(state.stateKey);
    if (
      (current === undefined && input.expectedRevision !== null) ||
      (current !== undefined && current.revision !== input.expectedRevision)
    )
      return false;
    this.#states.set(state.stateKey, state);
    return true;
  }
}

export function createCollectiveDecisionRuntimeV1(
  options: CollectiveDecisionRuntimeOptionsV1,
): CollectiveDecisionPortV1 {
  if (
    !options ||
    !options.certification ||
    typeof options.certification.certify !== "function" ||
    typeof options.certification.verify !== "function" ||
    !options.store ||
    typeof options.store.load !== "function" ||
    typeof options.store.save !== "function"
  )
    throw new TypeError("collective decision runtime ports are required");
  const policy = validateCollectiveDecisionPolicyV1(options.policy);
  if (
    !Number.isSafeInteger(options.decisionPlaneVersion) ||
    options.decisionPlaneVersion < 1
  )
    throw new TypeError("decisionPlaneVersion is invalid");
  const identity = {
    stateKey: identifier(options.stateKey, "stateKey"),
    decisionPlaneId: identifier(options.decisionPlaneId, "decisionPlaneId"),
    decisionPlaneVersion: options.decisionPlaneVersion,
    implementationId: identifier(options.implementationId, "implementationId"),
  };

  async function certify(
    candidateInput: CollectiveDecisionCandidateV1,
  ): Promise<CollectiveDecisionCertificateV1> {
    const candidate = validateCandidateAgainstPolicy(candidateInput);
    const certificate = validateCollectiveDecisionCertificateV1(
      await options.certification.certify({ candidate, policy }),
    );
    return certificate;
  }

  async function verify(input: {
    readonly candidate: CollectiveDecisionCandidateV1;
    readonly certificate: CollectiveDecisionCertificateV1;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveDecisionCertificateV1> {
    const candidate = validateCandidateAgainstPolicy(input.candidate);
    const certificate = verifyCollectiveDecisionCertificateV1({
      candidate,
      certificate: input.certificate,
      policy,
      logicalTimeMs: input.logicalTimeMs,
    });
    let authentic = false;
    try {
      authentic =
        (await options.certification.verify({
          candidate,
          certificate,
          policy,
          logicalTimeMs: input.logicalTimeMs,
        })) === true;
    } catch {
      authentic = false;
    }
    if (!authentic)
      throw new TypeError(
        "collective decision certificate authenticity verification failed",
      );
    return certificate;
  }

  async function commit(
    input: CollectiveDecisionCommitInputV1,
  ): Promise<CollectiveDecisionV1> {
    const decisionId = identifier(input.decisionId, "decisionId");
    const candidate = validateCandidateAgainstPolicy(input.candidate);
    const logicalTimeMs = logicalTime(input.logicalTimeMs);
    const certificate = await verify({
      candidate,
      certificate: input.certificate,
      logicalTimeMs,
    });
    for (
      let attempt = 0;
      attempt < policy.policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await options.store.load(identity.stateKey);
      const state =
        loaded === null ? initialState() : await validateState(loaded);
      if (logicalTimeMs < state.logicalTimeHighWaterMs)
        throw new TypeError(
          "collective decision logical time rollback is rejected",
        );
      const slot = decisionSlotV1(candidate);
      const prior = state.accepted.find(
        (current) => decisionSlotV1(current.candidate) === slot,
      );
      if (prior) {
        if (
          prior.candidate.candidateDigest === candidate.candidateDigest &&
          prior.certificate.certificateDigest ===
            certificate.certificateDigest &&
          prior.decisionId === decisionId
        )
          return prior;
        throw new TypeError(
          "conflicting or equivocal accepted collective decision",
        );
      }
      if (
        state.compacted.some(
          (current) => compactedDecisionSlotV1(current) === slot,
        )
      )
        throw new TypeError(
          "collective decision slot was previously accepted and compacted",
        );
      if (
        state.accepted.some((current) => current.decisionId === decisionId) ||
        state.compacted.some((current) => current.decisionId === decisionId)
      )
        throw new TypeError("collective decision id replay is rejected");
      const retained: CollectiveDecisionV1[] = [];
      const newlyCompacted: CollectiveDecisionCompactedHeadV1[] = [];
      for (const current of state.accepted) {
        if (current.expiresAtLogicalMs > logicalTimeMs) retained.push(current);
        else newlyCompacted.push(compactDecision(current));
      }
      if (
        state.compacted.length + newlyCompacted.length >
        policy.policy.maximumCompactedHeads
      )
        throw new TypeError(
          "collective decision compacted head limit is reached",
        );
      if (retained.length >= policy.policy.maximumAcceptedHeads)
        throw new TypeError(
          "collective decision accepted head limit is reached",
        );
      const decision = createCollectiveDecisionV1({
        schemaVersion: 1,
        decisionId,
        decisionPlaneId: identity.decisionPlaneId,
        decisionPlaneVersion: identity.decisionPlaneVersion,
        implementationId: identity.implementationId,
        policyId: policy.policy.policyId,
        policyVersion: policy.policy.policyVersion,
        policyDigest: policy.policyDigest,
        candidate,
        certificate,
        acceptedAtLogicalMs: logicalTimeMs,
        expiresAtLogicalMs: certificate.expiresAtLogicalMs,
        priorStateRevision: state.revision,
        committedStateRevision: state.revision + 1,
      });
      const next = createCollectiveDecisionStateV1({
        format: state.format,
        schemaVersion: state.schemaVersion,
        stateKey: state.stateKey,
        decisionPlaneId: state.decisionPlaneId,
        decisionPlaneVersion: state.decisionPlaneVersion,
        implementationId: state.implementationId,
        policyId: state.policyId,
        policyVersion: state.policyVersion,
        policyDigest: state.policyDigest,
        revision: state.revision + 1,
        logicalTimeHighWaterMs: Math.max(
          state.logicalTimeHighWaterMs,
          logicalTimeMs,
        ),
        accepted: [...retained, decision],
        compacted: [...state.compacted, ...newlyCompacted],
      });
      if (
        await options.store.save({
          state: next,
          expectedRevision: loaded === null ? null : state.revision,
        })
      )
        return decision;
    }
    throw new TypeError("collective decision commit CAS retries exhausted");
  }

  return Object.freeze({
    prepare(
      input: Omit<CollectiveDecisionCandidateV1, "candidateDigest">,
    ): CollectiveDecisionCandidateV1 {
      return validateCandidateAgainstPolicy(
        createCollectiveDecisionCandidateV1(input),
      );
    },
    certify,
    verify,
    commit,
    async decide(input: {
      readonly decisionId: string;
      readonly candidate: Omit<
        CollectiveDecisionCandidateV1,
        "candidateDigest"
      >;
      readonly logicalTimeMs: number;
    }): Promise<CollectiveDecisionV1> {
      const candidate = validateCandidateAgainstPolicy(
        createCollectiveDecisionCandidateV1(input.candidate),
      );
      const certificate = await certify(candidate);
      return commit({
        decisionId: input.decisionId,
        candidate,
        certificate,
        logicalTimeMs: input.logicalTimeMs,
      });
    },
  });

  function initialState(): CollectiveDecisionStateV1 {
    return createCollectiveDecisionStateV1({
      format: COLLECTIVE_DECISION_STATE_FORMAT_V1,
      schemaVersion: 1,
      stateKey: identity.stateKey,
      decisionPlaneId: identity.decisionPlaneId,
      decisionPlaneVersion: identity.decisionPlaneVersion,
      implementationId: identity.implementationId,
      policyId: policy.policy.policyId,
      policyVersion: policy.policy.policyVersion,
      policyDigest: policy.policyDigest,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      accepted: [],
      compacted: [],
    });
  }
  async function validateState(
    value: CollectiveDecisionStateV1,
  ): Promise<CollectiveDecisionStateV1> {
    const state = validateCollectiveDecisionStateV1(value);
    if (
      state.stateKey !== identity.stateKey ||
      state.decisionPlaneId !== identity.decisionPlaneId ||
      state.decisionPlaneVersion !== identity.decisionPlaneVersion ||
      state.implementationId !== identity.implementationId ||
      state.policyId !== policy.policy.policyId ||
      state.policyVersion !== policy.policy.policyVersion ||
      state.policyDigest !== policy.policyDigest
    )
      throw new TypeError("collective decision state binding is invalid");
    if (state.accepted.length > policy.policy.maximumAcceptedHeads)
      throw new TypeError(
        "collective decision state exceeds accepted head limit",
      );
    if (state.compacted.length > policy.policy.maximumCompactedHeads)
      throw new TypeError(
        "collective decision state exceeds compacted head limit",
      );
    for (const decision of state.accepted) {
      if (
        decision.decisionPlaneId !== identity.decisionPlaneId ||
        decision.decisionPlaneVersion !== identity.decisionPlaneVersion ||
        decision.implementationId !== identity.implementationId ||
        decision.policyId !== policy.policy.policyId ||
        decision.policyVersion !== policy.policy.policyVersion ||
        decision.policyDigest !== policy.policyDigest
      )
        throw new TypeError("retained collective decision binding is invalid");
      await verify({
        candidate: decision.candidate,
        certificate: decision.certificate,
        logicalTimeMs: decision.acceptedAtLogicalMs,
      });
    }
    return state;
  }
  function validateCandidateAgainstPolicy(
    value: CollectiveDecisionCandidateV1,
  ): CollectiveDecisionCandidateV1 {
    const candidate = validateCollectiveDecisionCandidateV1(value);
    if (
      candidate.expiresAtLogicalMs - candidate.preparedAtLogicalMs >
      policy.policy.maximumCandidateTtlMs
    )
      throw new TypeError("collective decision candidate ttl exceeds policy");
    return candidate;
  }
  function compactDecision(
    decision: CollectiveDecisionV1,
  ): CollectiveDecisionCompactedHeadV1 {
    return createCollectiveDecisionCompactedHeadV1({
      schemaVersion: 1,
      decisionId: decision.decisionId,
      scopeDigest: decision.candidate.scope.scopeDigest,
      decisionKind: decision.candidate.decisionKind,
      epoch: decision.candidate.epoch,
      candidateDigest: decision.candidate.candidateDigest,
      certificateDigest: decision.certificate.certificateDigest,
      certificationProofDigest: decision.certificate.certificationProofDigest,
      decisionDigest: decision.decisionDigest,
      committedStateRevision: decision.committedStateRevision,
    });
  }
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}
function logicalTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError("logicalTimeMs is invalid");
  return value as number;
}
