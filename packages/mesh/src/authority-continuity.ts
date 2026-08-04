import { sha256Base64Url } from "./sha256.js";
import {
  MeshAuthorityContinuityErrorV1,
  type MeshAuthorityAcceptanceV1,
  type MeshAuthorityAcceptInputV1,
  type MeshAuthorityCertificateV1,
  type MeshAuthorityContinuityPolicyV1,
  type MeshAuthorityContinuityRuntimeOptionsV1,
  type MeshAuthorityContinuitySnapshotV1,
  type MeshAuthorityContinuityStoreV1,
  type MeshAuthorityCurrentBindingV1,
  type MeshAuthorityCurrentnessDecisionV1,
  type MeshAuthorityEndorsementV1,
  type MeshAuthorityHeadV1,
  type MeshAuthorityIdentityV1,
  type MeshAuthorityInitializeInputV1,
  type MeshAuthorityIssueCertificateInputV1,
  type MeshAuthorityProposalV1,
  type MeshAuthorityRecordEndorsementInputV1,
  type MeshAuthorityRecordProposalInputV1,
  type MeshAuthorityScopeV1,
  type MeshAuthoritySignedRecordV1,
  type MeshAuthoritySignedStatementV1,
  type MeshAuthorityTransitionEvidenceV1,
} from "./authority-continuity-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const DEFAULT_MAXIMUM_TRANSITIONS = 256;
const DEFAULT_MAXIMUM_PROOF_BYTES = 16_384;
const MAXIMUM_ARRAY = 4_096;
const utf8 = new TextEncoder();

/** Stable key for one independently fenced authority scope. */
export function meshAuthorityScopeKeyV1(scope: MeshAuthorityScopeV1): string {
  const normalized = normalizeScope(scope);
  return `authority:${sha256Base64Url(utf8.encode(stableJson(normalized)))}`;
}

/** Canonical signer-and-statement bytes signed by an evidence provider. */
export function meshAuthorityEvidenceBytesV1(
  input: Pick<
    MeshAuthoritySignedRecordV1,
    "schemaVersion" | "statement" | "signer"
  >,
): Uint8Array {
  if (!input || typeof input !== "object" || input.schemaVersion !== 1) {
    invalid("authority evidence input is invalid");
  }
  return utf8.encode(
    stableJson({
      schemaVersion: 1,
      statement: normalizeStatement(input.statement),
      signer: normalizeIdentity(input.signer, "evidence.signer"),
    }),
  );
}

export function createMeshAuthorityContinuityPolicyV1(
  input: Omit<
    MeshAuthorityContinuityPolicyV1,
    "schemaVersion" | "policyDigest"
  >,
): MeshAuthorityContinuityPolicyV1 {
  const body = {
    schemaVersion: 1 as const,
    policyId: identifier(input.policyId, "policyId"),
    policyRevision: positive(input.policyRevision, "policyRevision"),
    witnessPeerIds: identifiers(input.witnessPeerIds, "witnessPeerIds", true),
    witnessThreshold: positive(input.witnessThreshold, "witnessThreshold"),
    recoveryDelayMs: safeInteger(input.recoveryDelayMs, "recoveryDelayMs", 0),
    maximumProposalLifetimeMs: positive(
      input.maximumProposalLifetimeMs,
      "maximumProposalLifetimeMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "validUntilLogicalMs",
    ),
  };
  if (
    body.witnessThreshold > body.witnessPeerIds.length ||
    body.witnessThreshold <= Math.floor(body.witnessPeerIds.length / 2)
  ) {
    invalid("witnessThreshold must be a strict majority of the witness set");
  }
  return freeze({
    ...body,
    policyDigest: digestOf("authority-policy", body),
  });
}

export function createMeshAuthorityHeadV1(
  input: Omit<MeshAuthorityHeadV1, "schemaVersion" | "scopeKey" | "headDigest">,
): MeshAuthorityHeadV1 {
  const scope = normalizeScope(input.scope);
  const policy = normalizePolicy(input.policy);
  const body = {
    schemaVersion: 1 as const,
    scope,
    scopeKey: meshAuthorityScopeKeyV1(scope),
    generation: positive(input.generation, "generation"),
    holder: normalizeIdentity(input.holder, "holder"),
    activatedBy: oneOf(
      input.activatedBy,
      ["bootstrap", "certified_transition"] as const,
      "activatedBy",
    ),
    activationId: identifier(input.activationId, "activationId"),
    predecessorHeadDigest:
      input.predecessorHeadDigest === null
        ? null
        : digest(input.predecessorHeadDigest, "predecessorHeadDigest"),
    fencingToken: identifier(input.fencingToken, "fencingToken"),
    activatedAtLogicalMs: safeInteger(
      input.activatedAtLogicalMs,
      "activatedAtLogicalMs",
      0,
    ),
    holderValidUntilLogicalMs: positive(
      input.holderValidUntilLogicalMs,
      "holderValidUntilLogicalMs",
    ),
    policy,
  };
  if (
    body.holderValidUntilLogicalMs <= body.activatedAtLogicalMs ||
    body.holderValidUntilLogicalMs > policy.validUntilLogicalMs ||
    policy.witnessPeerIds.includes(body.holder.peerId) ||
    (body.activatedBy === "bootstrap") !== (body.predecessorHeadDigest === null)
  ) {
    invalid("authority head validity or predecessor is invalid");
  }
  return freeze({ ...body, headDigest: digestOf("authority-head", body) });
}

export function createMeshAuthorityProposalV1(
  input: Omit<
    MeshAuthorityProposalV1,
    "schemaVersion" | "scopeKey" | "proposalDigest"
  >,
): MeshAuthorityProposalV1 {
  const scope = normalizeScope(input.scope);
  const body = {
    schemaVersion: 1 as const,
    proposalId: identifier(input.proposalId, "proposalId"),
    scope,
    scopeKey: meshAuthorityScopeKeyV1(scope),
    mode: oneOf(
      input.mode,
      ["coordinated_transfer", "witness_recovery"] as const,
      "mode",
    ),
    previousHeadDigest: digest(input.previousHeadDigest, "previousHeadDigest"),
    previousGeneration: positive(
      input.previousGeneration,
      "previousGeneration",
    ),
    proposedGeneration: positive(
      input.proposedGeneration,
      "proposedGeneration",
    ),
    previousHolder: normalizeIdentity(input.previousHolder, "previousHolder"),
    successor: normalizeIdentity(input.successor, "successor"),
    successorValidUntilLogicalMs: positive(
      input.successorValidUntilLogicalMs,
      "successorValidUntilLogicalMs",
    ),
    successorPolicy: normalizePolicy(input.successorPolicy),
    proposedAtLogicalMs: safeInteger(
      input.proposedAtLogicalMs,
      "proposedAtLogicalMs",
      0,
    ),
    notBeforeLogicalMs: safeInteger(
      input.notBeforeLogicalMs,
      "notBeforeLogicalMs",
      0,
    ),
    expiresAtLogicalMs: positive(
      input.expiresAtLogicalMs,
      "expiresAtLogicalMs",
    ),
  };
  if (
    body.proposedGeneration !== body.previousGeneration + 1 ||
    body.notBeforeLogicalMs < body.proposedAtLogicalMs ||
    body.expiresAtLogicalMs <= body.notBeforeLogicalMs ||
    body.successorValidUntilLogicalMs <= body.notBeforeLogicalMs ||
    body.successorPolicy.witnessPeerIds.includes(body.successor.peerId) ||
    sameIdentity(body.previousHolder, body.successor)
  ) {
    invalid("authority proposal generations, timing or successor is invalid");
  }
  return freeze({
    ...body,
    proposalDigest: digestOf("authority-proposal", body),
  });
}

export function createMeshAuthorityEndorsementV1(
  input: Omit<
    MeshAuthorityEndorsementV1,
    "schemaVersion" | "endorsementDigest"
  >,
): MeshAuthorityEndorsementV1 {
  const body = {
    schemaVersion: 1 as const,
    endorsementId: identifier(input.endorsementId, "endorsementId"),
    scopeKey: identifier(input.scopeKey, "scopeKey"),
    proposalId: identifier(input.proposalId, "proposalId"),
    proposalDigest: digest(input.proposalDigest, "proposalDigest"),
    witnessPeerId: identifier(input.witnessPeerId, "witnessPeerId"),
    observedUnavailableSinceLogicalMs: safeInteger(
      input.observedUnavailableSinceLogicalMs,
      "observedUnavailableSinceLogicalMs",
      0,
    ),
    endorsedAtLogicalMs: safeInteger(
      input.endorsedAtLogicalMs,
      "endorsedAtLogicalMs",
      0,
    ),
  };
  if (body.observedUnavailableSinceLogicalMs > body.endorsedAtLogicalMs) {
    invalid("witness observation follows its endorsement");
  }
  return freeze({
    ...body,
    endorsementDigest: digestOf("authority-endorsement", body),
  });
}

export function createMeshAuthorityAcceptanceV1(
  input: Omit<MeshAuthorityAcceptanceV1, "schemaVersion" | "acceptanceDigest">,
): MeshAuthorityAcceptanceV1 {
  const body = {
    schemaVersion: 1 as const,
    acceptanceId: identifier(input.acceptanceId, "acceptanceId"),
    scopeKey: identifier(input.scopeKey, "scopeKey"),
    proposalId: identifier(input.proposalId, "proposalId"),
    proposalDigest: digest(input.proposalDigest, "proposalDigest"),
    certificateId: identifier(input.certificateId, "certificateId"),
    certificateDigest: digest(input.certificateDigest, "certificateDigest"),
    successor: normalizeIdentity(input.successor, "successor"),
    acceptedAtLogicalMs: safeInteger(
      input.acceptedAtLogicalMs,
      "acceptedAtLogicalMs",
      0,
    ),
  };
  return freeze({
    ...body,
    acceptanceDigest: digestOf("authority-acceptance", body),
  });
}

/** CAS-backed productive runtime for certified authority succession. */
export class MeshAuthorityContinuityRuntimeV1 {
  private readonly maximumTransitions: number;
  private readonly maximumProofBytes: number;

  constructor(
    private readonly options: MeshAuthorityContinuityRuntimeOptionsV1,
  ) {
    if (
      !options ||
      typeof options !== "object" ||
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.compareAndSwap !== "function"
    ) {
      invalid("authority continuity store is required");
    }
    if (!options.verifier || typeof options.verifier.verify !== "function") {
      invalid("authority evidence verifier is required");
    }
    if (
      !options.eligibility ||
      typeof options.eligibility.check !== "function"
    ) {
      invalid("successor eligibility provider is required");
    }
    identifier(options.verifier.verifierId, "verifierId");
    positive(options.verifier.verifierVersion, "verifierVersion");
    identifier(options.verifier.implementationId, "verifier implementationId");
    identifier(options.eligibility.eligibilityId, "eligibilityId");
    positive(options.eligibility.eligibilityVersion, "eligibilityVersion");
    identifier(
      options.eligibility.implementationId,
      "eligibility implementationId",
    );
    this.maximumTransitions = boundedLimit(
      options.maximumTransitions,
      DEFAULT_MAXIMUM_TRANSITIONS,
      "maximumTransitions",
      1,
      16_384,
    );
    this.maximumProofBytes = boundedLimit(
      options.maximumProofBytes,
      DEFAULT_MAXIMUM_PROOF_BYTES,
      "maximumProofBytes",
      64,
      1_048_576,
    );
  }

  async initialize(
    input: MeshAuthorityInitializeInputV1,
  ): Promise<MeshAuthorityContinuitySnapshotV1> {
    const head = normalizeHead(input.head);
    const logicalTimeMs = safeInteger(
      input.logicalTimeMs,
      "logicalTimeMs",
      head.activatedAtLogicalMs,
    );
    const snapshot = buildSnapshot({
      revision: 1,
      head,
      activeProposal: null,
      endorsements: [],
      certificate: null,
      transitions: [],
      lastLogicalTimeMs: logicalTimeMs,
      bindings: this.bindings(),
      maximumTransitions: this.maximumTransitions,
      maximumProofBytes: this.maximumProofBytes,
    });
    if (
      !(await this.options.store.compareAndSwap({
        scopeKey: head.scopeKey,
        expectedRevision: null,
        next: snapshot,
      }))
    ) {
      conflict("authority scope is already initialized");
    }
    return snapshot;
  }

  async getSnapshot(
    scopeKey: string,
  ): Promise<MeshAuthorityContinuitySnapshotV1 | undefined> {
    const value = await this.options.store.load(
      identifier(scopeKey, "scopeKey"),
    );
    if (!value) return undefined;
    return this.boundSnapshot(value);
  }

  async recordProposal(
    input: MeshAuthorityRecordProposalInputV1,
  ): Promise<MeshAuthorityContinuitySnapshotV1> {
    const current = await this.requireSnapshot(
      input.scopeKey,
      input.expectedRevision,
      input.logicalTimeMs,
    );
    const proposal = normalizeSignedRecord(
      input.proposal,
      "proposal",
      this.maximumProofBytes,
    ) as MeshAuthoritySignedRecordV1<MeshAuthorityProposalV1>;
    const statement = proposal.statement;
    assertProposalBinding(current, proposal, input.logicalTimeMs);
    if (
      current.activeProposal &&
      input.logicalTimeMs < current.activeProposal.statement.expiresAtLogicalMs
    ) {
      conflict("an unexpired authority proposal already exists");
    }
    await this.verify(
      "proposal",
      current.head.scope,
      proposal,
      input.logicalTimeMs,
    );
    await this.checkEligibility(statement, input.logicalTimeMs);
    const next = buildSnapshot({
      ...snapshotParts(current),
      revision: current.revision + 1,
      activeProposal: proposal,
      endorsements: [],
      certificate: null,
      lastLogicalTimeMs: input.logicalTimeMs,
      bindings: this.bindings(),
      maximumTransitions: this.maximumTransitions,
      maximumProofBytes: this.maximumProofBytes,
    });
    return this.swap(current, next);
  }

  async recordEndorsement(
    input: MeshAuthorityRecordEndorsementInputV1,
  ): Promise<MeshAuthorityContinuitySnapshotV1> {
    const current = await this.requireSnapshot(
      input.scopeKey,
      input.expectedRevision,
      input.logicalTimeMs,
    );
    const endorsement = normalizeSignedRecord(
      input.endorsement,
      "endorsement",
      this.maximumProofBytes,
    ) as MeshAuthoritySignedRecordV1<MeshAuthorityEndorsementV1>;
    assertEndorsementBinding(current, endorsement, input.logicalTimeMs);
    const existing = current.endorsements.find(
      ({ statement }) =>
        statement.witnessPeerId === endorsement.statement.witnessPeerId ||
        statement.endorsementId === endorsement.statement.endorsementId,
    );
    if (existing) {
      if (stableJson(existing) === stableJson(endorsement)) return current;
      conflict("witness already endorsed the active authority proposal");
    }
    await this.verify(
      "endorsement",
      current.head.scope,
      endorsement,
      input.logicalTimeMs,
    );
    const endorsements = [...current.endorsements, endorsement].sort((a, b) =>
      compare(a.statement.witnessPeerId, b.statement.witnessPeerId),
    );
    const next = buildSnapshot({
      ...snapshotParts(current),
      revision: current.revision + 1,
      endorsements,
      lastLogicalTimeMs: input.logicalTimeMs,
      bindings: this.bindings(),
      maximumTransitions: this.maximumTransitions,
      maximumProofBytes: this.maximumProofBytes,
    });
    return this.swap(current, next);
  }

  async issueCertificate(
    input: MeshAuthorityIssueCertificateInputV1,
  ): Promise<MeshAuthorityContinuitySnapshotV1> {
    const current = await this.requireSnapshot(
      input.scopeKey,
      input.expectedRevision,
      input.logicalTimeMs,
    );
    const proposalId = identifier(input.proposalId, "proposalId");
    const proposal = current.activeProposal?.statement;
    if (!proposal || proposal.proposalId !== proposalId) {
      notReady("active authority proposal is unavailable");
    }
    if (current.certificate) return current;
    if (
      input.logicalTimeMs < proposal.notBeforeLogicalMs ||
      input.logicalTimeMs >= proposal.expiresAtLogicalMs ||
      input.logicalTimeMs >= current.head.policy.validUntilLogicalMs
    ) {
      notReady("authority proposal is outside its certification window");
    }
    if (
      proposal.mode === "witness_recovery" &&
      current.endorsements.length < current.head.policy.witnessThreshold
    ) {
      notReady("authority recovery witness threshold is not met");
    }
    const certificate = createCertificate(
      current,
      proposal,
      input.logicalTimeMs,
    );
    const next = buildSnapshot({
      ...snapshotParts(current),
      revision: current.revision + 1,
      certificate,
      lastLogicalTimeMs: input.logicalTimeMs,
      bindings: this.bindings(),
      maximumTransitions: this.maximumTransitions,
      maximumProofBytes: this.maximumProofBytes,
    });
    return this.swap(current, next);
  }

  async accept(
    input: MeshAuthorityAcceptInputV1,
  ): Promise<MeshAuthorityContinuitySnapshotV1> {
    const current = await this.requireSnapshot(
      input.scopeKey,
      input.expectedRevision,
      input.logicalTimeMs,
    );
    const acceptance = normalizeSignedRecord(
      input.acceptance,
      "acceptance",
      this.maximumProofBytes,
    ) as MeshAuthoritySignedRecordV1<MeshAuthorityAcceptanceV1>;
    const proposalRecord = current.activeProposal;
    const certificate = current.certificate;
    if (!proposalRecord || !certificate) {
      notReady("certified authority proposal is unavailable");
    }
    assertAcceptanceBinding(
      current,
      proposalRecord.statement,
      certificate,
      acceptance,
      input.logicalTimeMs,
    );
    await this.verify(
      "acceptance",
      current.head.scope,
      acceptance,
      input.logicalTimeMs,
    );
    await this.checkEligibility(proposalRecord.statement, input.logicalTimeMs);
    if (current.transitions.length >= this.maximumTransitions) {
      conflict("authority transition evidence capacity is exhausted");
    }
    const newHead = transitionedHead(
      current.head,
      proposalRecord.statement,
      certificate,
      acceptance.statement,
    );
    const evidence: MeshAuthorityTransitionEvidenceV1 = freeze({
      schemaVersion: 1,
      previousHead: current.head,
      proposal: proposalRecord,
      endorsements: current.endorsements,
      certificate,
      acceptance,
      resultingHeadDigest: newHead.headDigest,
    });
    const next = buildSnapshot({
      revision: current.revision + 1,
      head: newHead,
      activeProposal: null,
      endorsements: [],
      certificate: null,
      transitions: [...current.transitions, evidence],
      lastLogicalTimeMs: input.logicalTimeMs,
      bindings: this.bindings(),
      maximumTransitions: this.maximumTransitions,
      maximumProofBytes: this.maximumProofBytes,
    });
    return this.swap(current, next);
  }

  async checkCurrent(
    binding: MeshAuthorityCurrentBindingV1,
  ): Promise<MeshAuthorityCurrentnessDecisionV1> {
    try {
      const normalized = normalizeCurrentBinding(binding);
      const snapshot = await this.getSnapshot(normalized.scopeKey);
      if (!snapshot) {
        return freeze({
          current: false as const,
          reasonCode: "authority_scope_missing",
          head: null,
        });
      }
      const head = snapshot.head;
      const current =
        normalized.generation === head.generation &&
        sameIdentity(normalized.holder, head.holder) &&
        normalized.headDigest === head.headDigest &&
        normalized.fencingToken === head.fencingToken &&
        normalized.logicalTimeMs >= head.activatedAtLogicalMs &&
        normalized.logicalTimeMs < head.holderValidUntilLogicalMs;
      return current
        ? freeze({
            current: true as const,
            reasonCode: "current" as const,
            head,
          })
        : freeze({
            current: false as const,
            reasonCode: "authority_not_current",
            head,
          });
    } catch {
      return freeze({
        current: false as const,
        reasonCode: "authority_currentness_unavailable",
        head: null,
      });
    }
  }

  private bindings() {
    return {
      verifierId: this.options.verifier.verifierId,
      verifierVersion: this.options.verifier.verifierVersion,
      verifierImplementationId: this.options.verifier.implementationId,
      eligibilityId: this.options.eligibility.eligibilityId,
      eligibilityVersion: this.options.eligibility.eligibilityVersion,
      eligibilityImplementationId: this.options.eligibility.implementationId,
    } as const;
  }

  private boundSnapshot(
    value: MeshAuthorityContinuitySnapshotV1,
  ): MeshAuthorityContinuitySnapshotV1 {
    const snapshot = validateMeshAuthorityContinuitySnapshotV1(value);
    const bindings = this.bindings();
    if (
      snapshot.verifierId !== bindings.verifierId ||
      snapshot.verifierVersion !== bindings.verifierVersion ||
      snapshot.verifierImplementationId !== bindings.verifierImplementationId ||
      snapshot.eligibilityId !== bindings.eligibilityId ||
      snapshot.eligibilityVersion !== bindings.eligibilityVersion ||
      snapshot.eligibilityImplementationId !==
        bindings.eligibilityImplementationId ||
      snapshot.maximumTransitions !== this.maximumTransitions ||
      snapshot.maximumProofBytes !== this.maximumProofBytes
    ) {
      conflict("authority continuity implementation binding changed");
    }
    return snapshot;
  }

  private async requireSnapshot(
    scopeKey: string,
    expectedRevision: number,
    logicalTimeMs: number,
  ): Promise<MeshAuthorityContinuitySnapshotV1> {
    const value = await this.getSnapshot(scopeKey);
    if (!value) {
      throw new MeshAuthorityContinuityErrorV1(
        "NOT_FOUND",
        "authority scope is not initialized",
      );
    }
    if (
      value.revision !== positive(expectedRevision, "expectedRevision") ||
      safeInteger(logicalTimeMs, "logicalTimeMs", value.lastLogicalTimeMs) <
        value.lastLogicalTimeMs
    ) {
      conflict("authority snapshot revision or logical time is stale");
    }
    return value;
  }

  private async verify(
    purpose: "proposal" | "endorsement" | "acceptance",
    scope: MeshAuthorityScopeV1,
    record: MeshAuthoritySignedRecordV1,
    logicalTimeMs: number,
  ): Promise<void> {
    let decision;
    try {
      decision = await this.options.verifier.verify({
        schemaVersion: 1,
        purpose,
        scope,
        record,
        logicalTimeMs,
      });
    } catch {
      rejected("authority evidence verifier failed closed");
    }
    if (
      !decision ||
      typeof decision !== "object" ||
      !exactDecision(decision, "verified") ||
      decision.verified !== true ||
      decision.reasonCode !== "verified"
    ) {
      rejected("authority evidence was not verified");
    }
  }

  private async checkEligibility(
    proposal: MeshAuthorityProposalV1,
    logicalTimeMs: number,
  ): Promise<void> {
    let decision;
    try {
      decision = await this.options.eligibility.check({
        schemaVersion: 1,
        scope: proposal.scope,
        successor: proposal.successor,
        proposedGeneration: proposal.proposedGeneration,
        logicalTimeMs,
      });
    } catch {
      ineligible("successor eligibility provider failed closed");
    }
    if (
      !decision ||
      typeof decision !== "object" ||
      !exactDecision(decision, "eligible") ||
      decision.eligible !== true ||
      decision.reasonCode !== "eligible"
    ) {
      ineligible("authority successor is not eligible");
    }
  }

  private async swap(
    current: MeshAuthorityContinuitySnapshotV1,
    next: MeshAuthorityContinuitySnapshotV1,
  ): Promise<MeshAuthorityContinuitySnapshotV1> {
    if (
      !(await this.options.store.compareAndSwap({
        scopeKey: current.scopeKey,
        expectedRevision: current.revision,
        next,
      }))
    ) {
      conflict("authority snapshot changed concurrently");
    }
    return next;
  }
}

/** Minimal reference store. Production stores implement the same CAS port. */
export class InMemoryMeshAuthorityContinuityStoreV1 implements MeshAuthorityContinuityStoreV1 {
  private readonly values = new Map<
    string,
    MeshAuthorityContinuitySnapshotV1
  >();

  async load(
    scopeKey: string,
  ): Promise<MeshAuthorityContinuitySnapshotV1 | undefined> {
    return this.values.get(scopeKey);
  }

  async compareAndSwap(input: {
    readonly scopeKey: string;
    readonly expectedRevision: number | null;
    readonly next: MeshAuthorityContinuitySnapshotV1;
  }): Promise<boolean> {
    const current = this.values.get(input.scopeKey);
    if (
      (input.expectedRevision === null && current !== undefined) ||
      (input.expectedRevision !== null &&
        current?.revision !== input.expectedRevision)
    ) {
      return false;
    }
    this.values.set(input.scopeKey, input.next);
    return true;
  }
}

/** Strict validation used by stores when restoring durable snapshots. */
export function validateMeshAuthorityContinuitySnapshotV1(
  value: unknown,
): MeshAuthorityContinuitySnapshotV1 {
  record(value, "snapshot");
  exactKeys(value, [
    "activeProposal",
    "certificate",
    "eligibilityId",
    "eligibilityImplementationId",
    "eligibilityVersion",
    "endorsements",
    "head",
    "lastLogicalTimeMs",
    "maximumProofBytes",
    "maximumTransitions",
    "revision",
    "schemaVersion",
    "scopeKey",
    "snapshotDigest",
    "transitions",
    "verifierId",
    "verifierImplementationId",
    "verifierVersion",
  ]);
  if (value.schemaVersion !== 1) invalid("snapshot schemaVersion is invalid");
  const maximumTransitions = boundedLimit(
    value.maximumTransitions as number,
    DEFAULT_MAXIMUM_TRANSITIONS,
    "maximumTransitions",
    1,
    16_384,
  );
  const maximumProofBytes = boundedLimit(
    value.maximumProofBytes as number,
    DEFAULT_MAXIMUM_PROOF_BYTES,
    "maximumProofBytes",
    64,
    1_048_576,
  );
  const head = normalizeHead(value.head);
  const activeProposal =
    value.activeProposal === null
      ? null
      : (normalizeSignedRecord(
          value.activeProposal,
          "proposal",
          maximumProofBytes,
        ) as MeshAuthoritySignedRecordV1<MeshAuthorityProposalV1>);
  const endorsements = signedRecords(
    value.endorsements,
    "endorsement",
    maximumProofBytes,
  ) as readonly MeshAuthoritySignedRecordV1<MeshAuthorityEndorsementV1>[];
  const certificate =
    value.certificate === null ? null : normalizeCertificate(value.certificate);
  const transitions = transitionEvidence(
    value.transitions,
    maximumTransitions,
    maximumProofBytes,
  );
  const parts = {
    revision: positive(value.revision, "revision"),
    head,
    activeProposal,
    endorsements,
    certificate,
    transitions,
    lastLogicalTimeMs: safeInteger(
      value.lastLogicalTimeMs,
      "lastLogicalTimeMs",
      head.activatedAtLogicalMs,
    ),
    bindings: {
      verifierId: identifier(value.verifierId, "verifierId"),
      verifierVersion: positive(value.verifierVersion, "verifierVersion"),
      verifierImplementationId: identifier(
        value.verifierImplementationId,
        "verifierImplementationId",
      ),
      eligibilityId: identifier(value.eligibilityId, "eligibilityId"),
      eligibilityVersion: positive(
        value.eligibilityVersion,
        "eligibilityVersion",
      ),
      eligibilityImplementationId: identifier(
        value.eligibilityImplementationId,
        "eligibilityImplementationId",
      ),
    },
    maximumTransitions,
    maximumProofBytes,
  };
  const rebuilt = buildSnapshot(parts);
  if (
    identifier(value.scopeKey, "scopeKey") !== rebuilt.scopeKey ||
    digest(value.snapshotDigest, "snapshotDigest") !== rebuilt.snapshotDigest
  ) {
    invalid("authority snapshot digest or scope binding is invalid");
  }
  assertActiveState(rebuilt);
  assertTransitionChain(rebuilt);
  return rebuilt;
}

function assertProposalBinding(
  current: MeshAuthorityContinuitySnapshotV1,
  recordValue: MeshAuthoritySignedRecordV1<MeshAuthorityProposalV1>,
  logicalTimeMs: number,
): void {
  const proposal = recordValue.statement;
  const head = current.head;
  if (
    proposal.scopeKey !== current.scopeKey ||
    stableJson(proposal.scope) !== stableJson(head.scope) ||
    proposal.previousHeadDigest !== head.headDigest ||
    proposal.previousGeneration !== head.generation ||
    proposal.proposedGeneration !== head.generation + 1 ||
    !sameIdentity(proposal.previousHolder, head.holder) ||
    proposal.proposedAtLogicalMs < current.lastLogicalTimeMs ||
    proposal.proposedAtLogicalMs > logicalTimeMs ||
    logicalTimeMs >= proposal.expiresAtLogicalMs ||
    proposal.expiresAtLogicalMs - proposal.proposedAtLogicalMs >
      head.policy.maximumProposalLifetimeMs ||
    proposal.expiresAtLogicalMs > head.policy.validUntilLogicalMs ||
    proposal.successorValidUntilLogicalMs >
      proposal.successorPolicy.validUntilLogicalMs
  ) {
    invalid("authority proposal is not bound to the current head");
  }
  if (proposal.mode === "coordinated_transfer") {
    if (
      !sameIdentity(recordValue.signer, head.holder) ||
      proposal.proposedAtLogicalMs >= head.holderValidUntilLogicalMs ||
      proposal.notBeforeLogicalMs !== proposal.proposedAtLogicalMs
    ) {
      rejected("coordinated authority transfer lacks current holder authority");
    }
    return;
  }
  if (
    !sameIdentity(recordValue.signer, proposal.successor) ||
    proposal.notBeforeLogicalMs <
      proposal.proposedAtLogicalMs + head.policy.recoveryDelayMs ||
    stableJson(proposal.successorPolicy) !== stableJson(head.policy) ||
    proposal.successorValidUntilLogicalMs > head.policy.validUntilLogicalMs
  ) {
    rejected("authority recovery proposal is not witness-policy bound");
  }
}

function assertEndorsementBinding(
  current: MeshAuthorityContinuitySnapshotV1,
  recordValue: MeshAuthoritySignedRecordV1<MeshAuthorityEndorsementV1>,
  logicalTimeMs: number,
): void {
  const proposal = current.activeProposal?.statement;
  const endorsement = recordValue.statement;
  if (
    !proposal ||
    proposal.mode !== "witness_recovery" ||
    current.certificate !== null ||
    endorsement.scopeKey !== current.scopeKey ||
    endorsement.proposalId !== proposal.proposalId ||
    endorsement.proposalDigest !== proposal.proposalDigest ||
    endorsement.witnessPeerId !== recordValue.signer.peerId ||
    !current.head.policy.witnessPeerIds.includes(endorsement.witnessPeerId) ||
    endorsement.endorsedAtLogicalMs < proposal.proposedAtLogicalMs ||
    endorsement.endorsedAtLogicalMs > logicalTimeMs ||
    endorsement.endorsedAtLogicalMs >= proposal.expiresAtLogicalMs ||
    endorsement.observedUnavailableSinceLogicalMs >
      proposal.proposedAtLogicalMs ||
    endorsement.endorsedAtLogicalMs <
      endorsement.observedUnavailableSinceLogicalMs +
        current.head.policy.recoveryDelayMs
  ) {
    rejected("authority recovery endorsement is not current or eligible");
  }
}

function assertAcceptanceBinding(
  current: MeshAuthorityContinuitySnapshotV1,
  proposal: MeshAuthorityProposalV1,
  certificate: MeshAuthorityCertificateV1,
  recordValue: MeshAuthoritySignedRecordV1<MeshAuthorityAcceptanceV1>,
  logicalTimeMs: number,
): void {
  const acceptance = recordValue.statement;
  if (
    acceptance.scopeKey !== current.scopeKey ||
    acceptance.proposalId !== proposal.proposalId ||
    acceptance.proposalDigest !== proposal.proposalDigest ||
    acceptance.certificateId !== certificate.certificateId ||
    acceptance.certificateDigest !== certificate.certificateDigest ||
    !sameIdentity(acceptance.successor, proposal.successor) ||
    !sameIdentity(recordValue.signer, proposal.successor) ||
    acceptance.acceptedAtLogicalMs < certificate.issuedAtLogicalMs ||
    acceptance.acceptedAtLogicalMs > logicalTimeMs ||
    acceptance.acceptedAtLogicalMs >= certificate.expiresAtLogicalMs ||
    acceptance.acceptedAtLogicalMs >= proposal.successorValidUntilLogicalMs ||
    current.head.headDigest !== certificate.previousHeadDigest ||
    current.head.generation + 1 !== certificate.proposedGeneration
  ) {
    rejected("authority acceptance is not bound to the current certificate");
  }
}

function createCertificate(
  current: MeshAuthorityContinuitySnapshotV1,
  proposal: MeshAuthorityProposalV1,
  issuedAtLogicalMs: number,
): MeshAuthorityCertificateV1 {
  const endorsements =
    proposal.mode === "witness_recovery" ? current.endorsements : [];
  const certificateId = certificateIdFor({
    scopeKey: current.scopeKey,
    proposalDigest: proposal.proposalDigest,
    previousHeadDigest: current.head.headDigest,
    proposedGeneration: proposal.proposedGeneration,
    issuedAtLogicalMs,
  });
  const body = {
    schemaVersion: 1 as const,
    certificateId,
    scopeKey: current.scopeKey,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    previousHeadDigest: current.head.headDigest,
    proposedGeneration: proposal.proposedGeneration,
    mode: proposal.mode,
    endorsementDigests: endorsements.map(
      ({ statement }) => statement.endorsementDigest,
    ),
    witnessPeerIds: endorsements.map(
      ({ statement }) => statement.witnessPeerId,
    ),
    issuedAtLogicalMs,
    expiresAtLogicalMs: proposal.expiresAtLogicalMs,
  };
  return freeze({
    ...body,
    certificateDigest: digestOf("authority-certificate", body),
  });
}

function transitionedHead(
  previous: MeshAuthorityHeadV1,
  proposal: MeshAuthorityProposalV1,
  certificate: MeshAuthorityCertificateV1,
  acceptance: MeshAuthorityAcceptanceV1,
): MeshAuthorityHeadV1 {
  const fencingToken = `fence:${sha256Base64Url(
    utf8.encode(
      stableJson({
        certificateDigest: certificate.certificateDigest,
        generation: proposal.proposedGeneration,
        successor: proposal.successor,
      }),
    ),
  )}`;
  return createMeshAuthorityHeadV1({
    scope: previous.scope,
    generation: proposal.proposedGeneration,
    holder: proposal.successor,
    activatedBy: "certified_transition",
    activationId: acceptance.acceptanceId,
    predecessorHeadDigest: previous.headDigest,
    fencingToken,
    activatedAtLogicalMs: acceptance.acceptedAtLogicalMs,
    holderValidUntilLogicalMs: proposal.successorValidUntilLogicalMs,
    policy: proposal.successorPolicy,
  });
}

function buildSnapshot(input: {
  revision: number;
  head: MeshAuthorityHeadV1;
  activeProposal: MeshAuthoritySignedRecordV1<MeshAuthorityProposalV1> | null;
  endorsements: readonly MeshAuthoritySignedRecordV1<MeshAuthorityEndorsementV1>[];
  certificate: MeshAuthorityCertificateV1 | null;
  transitions: readonly MeshAuthorityTransitionEvidenceV1[];
  lastLogicalTimeMs: number;
  bindings: {
    verifierId: string;
    verifierVersion: number;
    verifierImplementationId: string;
    eligibilityId: string;
    eligibilityVersion: number;
    eligibilityImplementationId: string;
  };
  maximumTransitions: number;
  maximumProofBytes: number;
}): MeshAuthorityContinuitySnapshotV1 {
  const body = {
    schemaVersion: 1 as const,
    revision: input.revision,
    scopeKey: input.head.scopeKey,
    ...input.bindings,
    maximumTransitions: input.maximumTransitions,
    maximumProofBytes: input.maximumProofBytes,
    head: input.head,
    activeProposal: input.activeProposal,
    endorsements: input.endorsements,
    certificate: input.certificate,
    transitions: input.transitions,
    lastLogicalTimeMs: input.lastLogicalTimeMs,
  };
  return freeze({
    ...body,
    snapshotDigest: digestOf("authority-snapshot", body),
  });
}

function snapshotParts(snapshot: MeshAuthorityContinuitySnapshotV1) {
  return {
    head: snapshot.head,
    activeProposal: snapshot.activeProposal,
    endorsements: snapshot.endorsements,
    certificate: snapshot.certificate,
    transitions: snapshot.transitions,
  };
}

function assertActiveState(snapshot: MeshAuthorityContinuitySnapshotV1): void {
  const proposal = snapshot.activeProposal?.statement;
  if (
    snapshot.scopeKey !== snapshot.head.scopeKey ||
    (proposal === undefined &&
      (snapshot.endorsements.length !== 0 || snapshot.certificate !== null)) ||
    (proposal !== undefined &&
      (proposal.scopeKey !== snapshot.scopeKey ||
        proposal.previousHeadDigest !== snapshot.head.headDigest ||
        proposal.proposedAtLogicalMs > snapshot.lastLogicalTimeMs)) ||
    (snapshot.certificate !== null &&
      (proposal === undefined ||
        snapshot.certificate.proposalDigest !== proposal.proposalDigest)) ||
    new Set(
      snapshot.endorsements.map(({ statement }) => statement.witnessPeerId),
    ).size !== snapshot.endorsements.length
  ) {
    invalid("authority snapshot active transition is inconsistent");
  }
  if (!snapshot.activeProposal) return;
  const atProposal = {
    ...snapshot,
    lastLogicalTimeMs: snapshot.activeProposal.statement.proposedAtLogicalMs,
  } as MeshAuthorityContinuitySnapshotV1;
  assertProposalBinding(
    atProposal,
    snapshot.activeProposal,
    snapshot.activeProposal.statement.proposedAtLogicalMs,
  );
  const beforeCertificate = {
    ...snapshot,
    certificate: null,
  } as MeshAuthorityContinuitySnapshotV1;
  for (const endorsement of snapshot.endorsements) {
    assertEndorsementBinding(
      beforeCertificate,
      endorsement,
      snapshot.lastLogicalTimeMs,
    );
  }
  if (!snapshot.certificate) return;
  const activeProposalStatement = snapshot.activeProposal.statement;
  if (
    snapshot.certificate.issuedAtLogicalMs > snapshot.lastLogicalTimeMs ||
    (activeProposalStatement.mode === "witness_recovery" &&
      snapshot.endorsements.length < snapshot.head.policy.witnessThreshold)
  ) {
    invalid("active authority certificate is not ready");
  }
  const expectedCertificate = createCertificate(
    snapshot,
    activeProposalStatement,
    snapshot.certificate.issuedAtLogicalMs,
  );
  if (stableJson(expectedCertificate) !== stableJson(snapshot.certificate)) {
    invalid("active authority certificate does not match its evidence");
  }
}

function assertTransitionChain(
  snapshot: MeshAuthorityContinuitySnapshotV1,
): void {
  let resulting: MeshAuthorityHeadV1 | undefined;
  for (const evidence of snapshot.transitions) {
    if (
      resulting !== undefined &&
      evidence.previousHead.headDigest !== resulting.headDigest
    ) {
      invalid("authority transition history is not contiguous");
    }
    resulting = validateTransitionBinding(evidence);
  }
  if (
    resulting !== undefined &&
    resulting.headDigest !== snapshot.head.headDigest
  ) {
    invalid("authority transition history does not reach the current head");
  }
}

function validateTransitionBinding(
  evidence: MeshAuthorityTransitionEvidenceV1,
): MeshAuthorityHeadV1 {
  const previous = evidence.previousHead;
  const proposalRecord = evidence.proposal;
  const proposal = proposalRecord.statement;
  const certificate = evidence.certificate;
  const acceptanceRecord = evidence.acceptance;
  const acceptance = acceptanceRecord.statement;
  const endorsementDigests = evidence.endorsements.map(
    ({ statement }) => statement.endorsementDigest,
  );
  const witnessPeerIds = evidence.endorsements.map(
    ({ statement }) => statement.witnessPeerId,
  );
  if (
    proposal.scopeKey !== previous.scopeKey ||
    stableJson(proposal.scope) !== stableJson(previous.scope) ||
    proposal.previousHeadDigest !== previous.headDigest ||
    proposal.previousGeneration !== previous.generation ||
    proposal.proposedGeneration !== previous.generation + 1 ||
    !sameIdentity(proposal.previousHolder, previous.holder) ||
    proposal.proposedAtLogicalMs < previous.activatedAtLogicalMs ||
    proposal.expiresAtLogicalMs - proposal.proposedAtLogicalMs >
      previous.policy.maximumProposalLifetimeMs ||
    proposal.expiresAtLogicalMs > previous.policy.validUntilLogicalMs ||
    proposal.successorValidUntilLogicalMs >
      proposal.successorPolicy.validUntilLogicalMs ||
    certificate.scopeKey !== previous.scopeKey ||
    certificate.proposalId !== proposal.proposalId ||
    certificate.proposalDigest !== proposal.proposalDigest ||
    certificate.previousHeadDigest !== previous.headDigest ||
    certificate.proposedGeneration !== proposal.proposedGeneration ||
    certificate.mode !== proposal.mode ||
    certificate.issuedAtLogicalMs < proposal.notBeforeLogicalMs ||
    certificate.expiresAtLogicalMs !== proposal.expiresAtLogicalMs ||
    stableJson(certificate.endorsementDigests) !==
      stableJson(endorsementDigests) ||
    stableJson(certificate.witnessPeerIds) !== stableJson(witnessPeerIds) ||
    acceptance.scopeKey !== previous.scopeKey ||
    acceptance.proposalId !== proposal.proposalId ||
    acceptance.proposalDigest !== proposal.proposalDigest ||
    acceptance.certificateId !== certificate.certificateId ||
    acceptance.certificateDigest !== certificate.certificateDigest ||
    !sameIdentity(acceptance.successor, proposal.successor) ||
    !sameIdentity(acceptanceRecord.signer, proposal.successor) ||
    acceptance.acceptedAtLogicalMs < certificate.issuedAtLogicalMs ||
    acceptance.acceptedAtLogicalMs >= certificate.expiresAtLogicalMs ||
    acceptance.acceptedAtLogicalMs >= proposal.successorValidUntilLogicalMs
  ) {
    invalid("authority transition evidence is not fully bound");
  }
  if (proposal.mode === "coordinated_transfer") {
    if (
      !sameIdentity(proposalRecord.signer, previous.holder) ||
      evidence.endorsements.length !== 0 ||
      proposal.proposedAtLogicalMs >= previous.holderValidUntilLogicalMs ||
      proposal.notBeforeLogicalMs !== proposal.proposedAtLogicalMs
    ) {
      invalid("coordinated authority transition evidence is invalid");
    }
  } else {
    const witnesses = new Set<string>();
    for (const recordValue of evidence.endorsements) {
      const endorsement = recordValue.statement;
      if (
        endorsement.scopeKey !== previous.scopeKey ||
        endorsement.proposalId !== proposal.proposalId ||
        endorsement.proposalDigest !== proposal.proposalDigest ||
        endorsement.witnessPeerId !== recordValue.signer.peerId ||
        !previous.policy.witnessPeerIds.includes(endorsement.witnessPeerId) ||
        witnesses.has(endorsement.witnessPeerId) ||
        endorsement.endorsedAtLogicalMs < proposal.proposedAtLogicalMs ||
        endorsement.endorsedAtLogicalMs >= proposal.expiresAtLogicalMs ||
        endorsement.observedUnavailableSinceLogicalMs >
          proposal.proposedAtLogicalMs ||
        endorsement.endorsedAtLogicalMs <
          endorsement.observedUnavailableSinceLogicalMs +
            previous.policy.recoveryDelayMs
      ) {
        invalid("authority witness evidence is invalid");
      }
      witnesses.add(endorsement.witnessPeerId);
    }
    if (
      !sameIdentity(proposalRecord.signer, proposal.successor) ||
      witnesses.size < previous.policy.witnessThreshold ||
      stableJson(proposal.successorPolicy) !== stableJson(previous.policy) ||
      proposal.notBeforeLogicalMs <
        proposal.proposedAtLogicalMs + previous.policy.recoveryDelayMs ||
      proposal.successorValidUntilLogicalMs >
        previous.policy.validUntilLogicalMs
    ) {
      invalid("authority recovery evidence does not meet its policy");
    }
  }
  const resulting = transitionedHead(
    previous,
    proposal,
    certificate,
    acceptance,
  );
  if (resulting.headDigest !== evidence.resultingHeadDigest) {
    invalid("authority transition resulting head digest is invalid");
  }
  return resulting;
}

function normalizeHead(value: unknown): MeshAuthorityHeadV1 {
  record(value, "authority head");
  exactKeys(value, [
    "activatedAtLogicalMs",
    "activatedBy",
    "activationId",
    "fencingToken",
    "generation",
    "headDigest",
    "holder",
    "holderValidUntilLogicalMs",
    "policy",
    "predecessorHeadDigest",
    "schemaVersion",
    "scope",
    "scopeKey",
  ]);
  if (value.schemaVersion !== 1)
    invalid("authority head schemaVersion is invalid");
  const rebuilt = createMeshAuthorityHeadV1({
    scope: value.scope as MeshAuthorityScopeV1,
    generation: value.generation as number,
    holder: value.holder as MeshAuthorityIdentityV1,
    activatedBy: value.activatedBy as MeshAuthorityHeadV1["activatedBy"],
    activationId: value.activationId as string,
    predecessorHeadDigest: value.predecessorHeadDigest as string | null,
    fencingToken: value.fencingToken as string,
    activatedAtLogicalMs: value.activatedAtLogicalMs as number,
    holderValidUntilLogicalMs: value.holderValidUntilLogicalMs as number,
    policy: value.policy as MeshAuthorityContinuityPolicyV1,
  });
  if (
    value.scopeKey !== rebuilt.scopeKey ||
    value.headDigest !== rebuilt.headDigest
  ) {
    invalid("authority head digest is invalid");
  }
  return rebuilt;
}

function normalizePolicy(value: unknown): MeshAuthorityContinuityPolicyV1 {
  record(value, "continuity policy");
  exactKeys(value, [
    "maximumProposalLifetimeMs",
    "policyDigest",
    "policyId",
    "policyRevision",
    "recoveryDelayMs",
    "schemaVersion",
    "validUntilLogicalMs",
    "witnessPeerIds",
    "witnessThreshold",
  ]);
  if (value.schemaVersion !== 1)
    invalid("continuity policy schemaVersion is invalid");
  const rebuilt = createMeshAuthorityContinuityPolicyV1({
    policyId: value.policyId as string,
    policyRevision: value.policyRevision as number,
    witnessPeerIds: value.witnessPeerIds as readonly string[],
    witnessThreshold: value.witnessThreshold as number,
    recoveryDelayMs: value.recoveryDelayMs as number,
    maximumProposalLifetimeMs: value.maximumProposalLifetimeMs as number,
    validUntilLogicalMs: value.validUntilLogicalMs as number,
  });
  if (value.policyDigest !== rebuilt.policyDigest) {
    invalid("continuity policy digest is invalid");
  }
  return rebuilt;
}

function normalizeScope(value: unknown): MeshAuthorityScopeV1 {
  record(value, "authority scope");
  exactKeys(value, [
    "kind",
    "meshId",
    "objectiveId",
    "schemaVersion",
    "tenantId",
    "workItemId",
  ]);
  if (value.schemaVersion !== 1)
    invalid("authority scope schemaVersion is invalid");
  const kind = oneOf(
    value.kind,
    ["objective_issuer", "work_owner"] as const,
    "scope.kind",
  );
  const workItemId =
    value.workItemId === null
      ? null
      : identifier(value.workItemId, "scope.workItemId");
  if (
    (kind === "objective_issuer" && workItemId !== null) ||
    (kind === "work_owner" && workItemId === null)
  ) {
    invalid("authority scope workItemId is inconsistent with its kind");
  }
  return freeze({
    schemaVersion: 1,
    kind,
    tenantId: identifier(value.tenantId, "scope.tenantId"),
    meshId: identifier(value.meshId, "scope.meshId"),
    objectiveId: identifier(value.objectiveId, "scope.objectiveId"),
    workItemId,
  });
}

function normalizeIdentity(
  value: unknown,
  label: string,
): MeshAuthorityIdentityV1 {
  record(value, label);
  exactKeys(value, ["instanceId", "keyId", "peerId", "schemaVersion"]);
  if (value.schemaVersion !== 1) invalid(`${label}.schemaVersion is invalid`);
  return freeze({
    schemaVersion: 1,
    peerId: identifier(value.peerId, `${label}.peerId`),
    instanceId: identifier(value.instanceId, `${label}.instanceId`),
    keyId: identifier(value.keyId, `${label}.keyId`),
  });
}

function normalizeSignedRecord(
  value: unknown,
  purpose: "proposal" | "endorsement" | "acceptance",
  maximumProofBytes: number,
): MeshAuthoritySignedRecordV1 {
  record(value, `${purpose} record`);
  exactKeys(value, ["proof", "schemaVersion", "signer", "statement"]);
  if (value.schemaVersion !== 1)
    invalid(`${purpose} record schemaVersion is invalid`);
  const statement = normalizeStatementForPurpose(value.statement, purpose);
  const signer = normalizeIdentity(value.signer, `${purpose}.signer`);
  record(value.proof, `${purpose}.proof`);
  exactKeys(value.proof, ["algorithm", "schemaVersion", "value"]);
  if (value.proof.schemaVersion !== 1)
    invalid(`${purpose} proof schemaVersion is invalid`);
  const proof = freeze({
    schemaVersion: 1 as const,
    algorithm: identifier(value.proof.algorithm, `${purpose}.proof.algorithm`),
    value: boundedText(
      value.proof.value,
      `${purpose}.proof.value`,
      maximumProofBytes,
    ),
  });
  return freeze({ schemaVersion: 1, statement, signer, proof });
}

function normalizeStatement(
  value: MeshAuthoritySignedStatementV1,
): MeshAuthoritySignedStatementV1 {
  if (isRecord(value) && "proposalDigest" in value) {
    if ("successorPolicy" in value) return normalizeProposal(value);
    if ("certificateDigest" in value) return normalizeAcceptance(value);
    return normalizeEndorsement(value);
  }
  invalid("authority signed statement kind is invalid");
}

function normalizeStatementForPurpose(
  value: unknown,
  purpose: "proposal" | "endorsement" | "acceptance",
): MeshAuthoritySignedStatementV1 {
  if (purpose === "proposal") return normalizeProposal(value);
  if (purpose === "endorsement") return normalizeEndorsement(value);
  return normalizeAcceptance(value);
}

function normalizeProposal(value: unknown): MeshAuthorityProposalV1 {
  record(value, "authority proposal");
  exactKeys(value, [
    "expiresAtLogicalMs",
    "mode",
    "notBeforeLogicalMs",
    "previousGeneration",
    "previousHeadDigest",
    "previousHolder",
    "proposalDigest",
    "proposalId",
    "proposedAtLogicalMs",
    "proposedGeneration",
    "schemaVersion",
    "scope",
    "scopeKey",
    "successor",
    "successorPolicy",
    "successorValidUntilLogicalMs",
  ]);
  if (value.schemaVersion !== 1)
    invalid("authority proposal schemaVersion is invalid");
  const rebuilt = createMeshAuthorityProposalV1({
    proposalId: value.proposalId as string,
    scope: value.scope as MeshAuthorityScopeV1,
    mode: value.mode as MeshAuthorityProposalV1["mode"],
    previousHeadDigest: value.previousHeadDigest as string,
    previousGeneration: value.previousGeneration as number,
    proposedGeneration: value.proposedGeneration as number,
    previousHolder: value.previousHolder as MeshAuthorityIdentityV1,
    successor: value.successor as MeshAuthorityIdentityV1,
    successorValidUntilLogicalMs: value.successorValidUntilLogicalMs as number,
    successorPolicy: value.successorPolicy as MeshAuthorityContinuityPolicyV1,
    proposedAtLogicalMs: value.proposedAtLogicalMs as number,
    notBeforeLogicalMs: value.notBeforeLogicalMs as number,
    expiresAtLogicalMs: value.expiresAtLogicalMs as number,
  });
  if (
    value.scopeKey !== rebuilt.scopeKey ||
    value.proposalDigest !== rebuilt.proposalDigest
  ) {
    invalid("authority proposal digest is invalid");
  }
  return rebuilt;
}

function normalizeEndorsement(value: unknown): MeshAuthorityEndorsementV1 {
  record(value, "authority endorsement");
  exactKeys(value, [
    "endorsedAtLogicalMs",
    "endorsementDigest",
    "endorsementId",
    "observedUnavailableSinceLogicalMs",
    "proposalDigest",
    "proposalId",
    "schemaVersion",
    "scopeKey",
    "witnessPeerId",
  ]);
  if (value.schemaVersion !== 1)
    invalid("authority endorsement schemaVersion is invalid");
  const rebuilt = createMeshAuthorityEndorsementV1({
    endorsementId: value.endorsementId as string,
    scopeKey: value.scopeKey as string,
    proposalId: value.proposalId as string,
    proposalDigest: value.proposalDigest as string,
    witnessPeerId: value.witnessPeerId as string,
    observedUnavailableSinceLogicalMs:
      value.observedUnavailableSinceLogicalMs as number,
    endorsedAtLogicalMs: value.endorsedAtLogicalMs as number,
  });
  if (value.endorsementDigest !== rebuilt.endorsementDigest) {
    invalid("authority endorsement digest is invalid");
  }
  return rebuilt;
}

function normalizeAcceptance(value: unknown): MeshAuthorityAcceptanceV1 {
  record(value, "authority acceptance");
  exactKeys(value, [
    "acceptanceDigest",
    "acceptanceId",
    "acceptedAtLogicalMs",
    "certificateDigest",
    "certificateId",
    "proposalDigest",
    "proposalId",
    "schemaVersion",
    "scopeKey",
    "successor",
  ]);
  if (value.schemaVersion !== 1)
    invalid("authority acceptance schemaVersion is invalid");
  const rebuilt = createMeshAuthorityAcceptanceV1({
    acceptanceId: value.acceptanceId as string,
    scopeKey: value.scopeKey as string,
    proposalId: value.proposalId as string,
    proposalDigest: value.proposalDigest as string,
    certificateId: value.certificateId as string,
    certificateDigest: value.certificateDigest as string,
    successor: value.successor as MeshAuthorityIdentityV1,
    acceptedAtLogicalMs: value.acceptedAtLogicalMs as number,
  });
  if (value.acceptanceDigest !== rebuilt.acceptanceDigest) {
    invalid("authority acceptance digest is invalid");
  }
  return rebuilt;
}

function normalizeCertificate(value: unknown): MeshAuthorityCertificateV1 {
  record(value, "authority certificate");
  exactKeys(value, [
    "certificateDigest",
    "certificateId",
    "endorsementDigests",
    "expiresAtLogicalMs",
    "issuedAtLogicalMs",
    "mode",
    "previousHeadDigest",
    "proposalDigest",
    "proposalId",
    "proposedGeneration",
    "schemaVersion",
    "scopeKey",
    "witnessPeerIds",
  ]);
  if (value.schemaVersion !== 1)
    invalid("authority certificate schemaVersion is invalid");
  const body = {
    schemaVersion: 1 as const,
    certificateId: identifier(value.certificateId, "certificateId"),
    scopeKey: identifier(value.scopeKey, "certificate.scopeKey"),
    proposalId: identifier(value.proposalId, "certificate.proposalId"),
    proposalDigest: digest(value.proposalDigest, "certificate.proposalDigest"),
    previousHeadDigest: digest(
      value.previousHeadDigest,
      "certificate.previousHeadDigest",
    ),
    proposedGeneration: positive(
      value.proposedGeneration,
      "certificate.proposedGeneration",
    ),
    mode: oneOf(
      value.mode,
      ["coordinated_transfer", "witness_recovery"] as const,
      "certificate.mode",
    ),
    endorsementDigests: digests(
      value.endorsementDigests,
      "certificate.endorsementDigests",
    ),
    witnessPeerIds: identifiers(
      value.witnessPeerIds,
      "certificate.witnessPeerIds",
      false,
    ),
    issuedAtLogicalMs: safeInteger(
      value.issuedAtLogicalMs,
      "certificate.issuedAtLogicalMs",
      0,
    ),
    expiresAtLogicalMs: positive(
      value.expiresAtLogicalMs,
      "certificate.expiresAtLogicalMs",
    ),
  };
  if (
    body.certificateId !==
      certificateIdFor({
        scopeKey: body.scopeKey,
        proposalDigest: body.proposalDigest,
        previousHeadDigest: body.previousHeadDigest,
        proposedGeneration: body.proposedGeneration,
        issuedAtLogicalMs: body.issuedAtLogicalMs,
      }) ||
    body.endorsementDigests.length !== body.witnessPeerIds.length ||
    body.expiresAtLogicalMs <= body.issuedAtLogicalMs ||
    (body.mode === "coordinated_transfer" &&
      body.endorsementDigests.length !== 0)
  ) {
    invalid("authority certificate evidence or timing is invalid");
  }
  const rebuilt = freeze({
    ...body,
    certificateDigest: digestOf("authority-certificate", body),
  });
  if (value.certificateDigest !== rebuilt.certificateDigest) {
    invalid("authority certificate digest is invalid");
  }
  return rebuilt;
}

function certificateIdFor(input: {
  scopeKey: string;
  proposalDigest: string;
  previousHeadDigest: string;
  proposedGeneration: number;
  issuedAtLogicalMs: number;
}): string {
  return `certificate:${sha256Base64Url(utf8.encode(stableJson(input)))}`;
}

function signedRecords(
  value: unknown,
  purpose: "endorsement",
  maximumProofBytes: number,
): readonly MeshAuthoritySignedRecordV1[] {
  if (!Array.isArray(value) || value.length > MAXIMUM_ARRAY) {
    invalid(`${purpose} records are invalid`);
  }
  return freeze(
    value.map((item) =>
      normalizeSignedRecord(item, purpose, maximumProofBytes),
    ),
  );
}

function transitionEvidence(
  value: unknown,
  maximumTransitions: number,
  maximumProofBytes: number,
): readonly MeshAuthorityTransitionEvidenceV1[] {
  if (!Array.isArray(value) || value.length > maximumTransitions) {
    invalid("authority transition evidence is invalid");
  }
  return freeze(
    value.map((item, index) =>
      normalizeTransition(item, index, maximumProofBytes),
    ),
  );
}

function normalizeTransition(
  value: unknown,
  index: number,
  maximumProofBytes: number,
): MeshAuthorityTransitionEvidenceV1 {
  record(value, `transition[${index}]`);
  exactKeys(value, [
    "acceptance",
    "certificate",
    "endorsements",
    "previousHead",
    "proposal",
    "resultingHeadDigest",
    "schemaVersion",
  ]);
  if (value.schemaVersion !== 1) invalid("transition schemaVersion is invalid");
  const previousHead = normalizeHead(value.previousHead);
  const proposal = normalizeSignedRecord(
    value.proposal,
    "proposal",
    maximumProofBytes,
  ) as MeshAuthoritySignedRecordV1<MeshAuthorityProposalV1>;
  const endorsements = signedRecords(
    value.endorsements,
    "endorsement",
    maximumProofBytes,
  ) as readonly MeshAuthoritySignedRecordV1<MeshAuthorityEndorsementV1>[];
  const certificate = normalizeCertificate(value.certificate);
  const acceptance = normalizeSignedRecord(
    value.acceptance,
    "acceptance",
    maximumProofBytes,
  ) as MeshAuthoritySignedRecordV1<MeshAuthorityAcceptanceV1>;
  const resultingHeadDigest = digest(
    value.resultingHeadDigest,
    "resultingHeadDigest",
  );
  if (
    proposal.statement.previousHeadDigest !== previousHead.headDigest ||
    certificate.proposalDigest !== proposal.statement.proposalDigest ||
    acceptance.statement.certificateDigest !== certificate.certificateDigest
  ) {
    invalid("authority transition evidence bindings are invalid");
  }
  return freeze({
    schemaVersion: 1,
    previousHead,
    proposal,
    endorsements,
    certificate,
    acceptance,
    resultingHeadDigest,
  });
}

function normalizeCurrentBinding(
  value: MeshAuthorityCurrentBindingV1,
): MeshAuthorityCurrentBindingV1 {
  record(value, "authority current binding");
  exactKeys(value, [
    "fencingToken",
    "generation",
    "headDigest",
    "holder",
    "logicalTimeMs",
    "schemaVersion",
    "scopeKey",
  ]);
  if (value.schemaVersion !== 1)
    invalid("current binding schemaVersion is invalid");
  return freeze({
    schemaVersion: 1,
    scopeKey: identifier(value.scopeKey, "current.scopeKey"),
    generation: positive(value.generation, "current.generation"),
    holder: normalizeIdentity(value.holder, "current.holder"),
    headDigest: digest(value.headDigest, "current.headDigest"),
    fencingToken: identifier(value.fencingToken, "current.fencingToken"),
    logicalTimeMs: safeInteger(value.logicalTimeMs, "current.logicalTimeMs", 0),
  });
}

function exactDecision(
  value: object,
  discriminant: "verified" | "eligible",
): value is Record<string, unknown> {
  const keys = Object.keys(value).sort(compare);
  return (
    keys.length === 2 &&
    keys.includes("reasonCode") &&
    keys.includes(discriminant)
  );
}

function sameIdentity(
  left: MeshAuthorityIdentityV1,
  right: MeshAuthorityIdentityV1,
): boolean {
  return (
    left.peerId === right.peerId &&
    left.instanceId === right.instanceId &&
    left.keyId === right.keyId
  );
}

function digestOf(domain: string, value: unknown): string {
  return `sha256:${sha256Base64Url(
    utf8.encode(stableJson({ domain, value })),
  )}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort(compare)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) invalid("value is not canonical JSON");
  return encoded;
}

function identifiers(
  value: unknown,
  label: string,
  nonEmpty: boolean,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAXIMUM_ARRAY ||
    (nonEmpty && value.length === 0)
  ) {
    invalid(`${label} is invalid`);
  }
  const result = (value as unknown[])
    .map((item) => identifier(item, label))
    .sort(compare);
  if (new Set(result).size !== result.length)
    invalid(`${label} has duplicates`);
  return freeze(result);
}

function digests(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length > MAXIMUM_ARRAY) {
    invalid(`${label} is invalid`);
  }
  const result = (value as unknown[]).map((item) => digest(item, label));
  if (new Set(result).size !== result.length)
    invalid(`${label} has duplicates`);
  return freeze(result);
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !IDENTIFIER.test(value)
  ) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8.encode(value).byteLength > maximum ||
    value.includes("\u0000")
  ) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function positive(value: unknown, label: string): number {
  return safeInteger(value, label, 1);
}

function safeInteger(value: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    invalid(`${label} is invalid`);
  }
  return value as number;
}

function boundedLimit(
  value: number | undefined,
  fallback: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    invalid(`${label} is invalid`);
  }
  return result;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalid(`${label} is invalid`);
  }
  return value as T;
}

function record(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) invalid(`${label} must be a plain object`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  const actual = Object.keys(value).sort(compare);
  const expected = [...keys].sort(compare);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalid("object fields are invalid");
  }
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) freeze(item);
  }
  return Object.freeze(value);
}

function invalid(message: string): never {
  throw new MeshAuthorityContinuityErrorV1("VALIDATION_ERROR", message);
}

function conflict(message: string): never {
  throw new MeshAuthorityContinuityErrorV1("STATE_CONFLICT", message);
}

function rejected(message: string): never {
  throw new MeshAuthorityContinuityErrorV1("EVIDENCE_REJECTED", message);
}

function ineligible(message: string): never {
  throw new MeshAuthorityContinuityErrorV1("SUCCESSOR_INELIGIBLE", message);
}

function notReady(message: string): never {
  throw new MeshAuthorityContinuityErrorV1("TRANSITION_NOT_READY", message);
}
