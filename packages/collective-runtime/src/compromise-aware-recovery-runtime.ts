import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import {
  COMPROMISE_AWARE_RECOVERY_STATE_FORMAT_V1,
  type CompromiseRecoveryAnchorV1,
  type CompromiseRecoveryActivationV1,
  type CompromiseRecoveryExecutionGateV1,
  type CompromiseRecoveryExclusionReceiptV1,
  type CompromiseRecoveryFenceV1,
  type CompromiseRecoveryIncidentV1,
  type CompromiseRecoveryRestorationV1,
  type CompromiseRecoveryRuntimeOptionsV1,
  type CompromiseRecoveryStateV1,
  type CompromiseRecoverySupersessionV1,
  type CompromiseRecoveryVerdictCertificateV1,
  type CompromiseRecoveryRequestV1,
} from "./compromise-aware-recovery-contracts.js";
import {
  assertCompromiseRecoveryStateShapeV1,
  compromiseRecoveryDigestV1,
  sameCompromiseRecoveryScopeV1,
  validateCompromiseRecoveryPolicyV1,
  validateCompromiseRecoveryRequestV1,
  validateCompromiseRecoveryScopeV1,
  validateCompromiseRecoveryVerdictCertificateV1,
} from "./compromise-aware-recovery-validation.js";

type CompromiseRecoverySubmitInputV1 = Parameters<
  CompromiseAwareRecoveryRuntimeV1["submit"]
>[0];
type CompromiseRecoveryRunToTerminalInputV1 = Parameters<
  CompromiseAwareRecoveryRuntimeV1["runToTerminal"]
>[0];
type CompromiseRecoveryGateInputV1 = Parameters<
  CompromiseAwareRecoveryRuntimeV1["gateExecution"]
>[0];

interface CompromiseAwareRecoveryInvokersV1 {
  readonly scope: CompromiseRecoveryRuntimeOptionsV1["scope"];
  load(logicalTimeMs?: number): Promise<CompromiseRecoveryStateV1>;
  submit(input: CompromiseRecoverySubmitInputV1): Promise<CompromiseRecoveryStateV1>;
  runOnce(logicalTimeMs: number): Promise<CompromiseRecoveryStateV1>;
  runToTerminal(
    input: CompromiseRecoveryRunToTerminalInputV1,
  ): Promise<CompromiseRecoveryStateV1>;
  gateExecution(
    input: CompromiseRecoveryGateInputV1,
  ): Promise<CompromiseRecoveryExecutionGateV1>;
}

const compromiseAwareRecoveryInvokersV1 = new WeakMap<
  object,
  CompromiseAwareRecoveryInvokersV1
>();

/** Durable, replay-safe peer-local recovery saga. */
export class CompromiseAwareRecoveryRuntimeV1 {
  readonly #stateKey: string;
  readonly #anchorKey: string;
  readonly #policy: ReturnType<typeof validateCompromiseRecoveryPolicyV1>;
  readonly #scope: ReturnType<typeof validateCompromiseRecoveryScopeV1>;
  readonly #loadCurrent: CompromiseRecoveryRuntimeOptionsV1["store"]["loadCurrent"];
  readonly #save: CompromiseRecoveryRuntimeOptionsV1["store"]["save"];
  readonly #verify: CompromiseRecoveryRuntimeOptionsV1["verification"]["verify"];
  readonly #exclude: CompromiseRecoveryRuntimeOptionsV1["exclusion"]["exclude"];
  readonly #fence: CompromiseRecoveryRuntimeOptionsV1["fencing"]["fence"];
  readonly #activate: CompromiseRecoveryRuntimeOptionsV1["activation"]["activate"];
  readonly #restoreCheckpoint: CompromiseRecoveryRuntimeOptionsV1["restoration"]["restoreCheckpoint"];
  readonly #activateReauction: CompromiseRecoveryRuntimeOptionsV1["restoration"]["activateReauction"];
  readonly #requestReplanning: CompromiseRecoveryRuntimeOptionsV1["restoration"]["requestReplanning"];

  constructor(options: CompromiseRecoveryRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("compromise recovery options are required");
    const stateKey = options.stateKey;
    const anchorKey = options.anchorKey;
    const policy = options.policy;
    const scope = options.scope;
    const store = options.store;
    const verification = options.verification;
    const exclusion = options.exclusion;
    const fencing = options.fencing;
    const activation = options.activation;
    const restoration = options.restoration;
    const loadCurrent = store?.loadCurrent;
    const save = store?.save;
    const verify = verification?.verify;
    const exclude = exclusion?.exclude;
    const fence = fencing?.fence;
    const activate = activation?.activate;
    const restoreCheckpoint = restoration?.restoreCheckpoint;
    const activateReauction = restoration?.activateReauction;
    const requestReplanning = restoration?.requestReplanning;
    if (typeof loadCurrent !== "function" || typeof save !== "function")
      fail("atomic recovery state and anchor store is required");
    if (typeof verify !== "function") fail("verdict verification is required");
    if (typeof exclude !== "function") fail("sparse exclusion is required");
    if (typeof fence !== "function") fail("recovery fencing is required");
    if (typeof activate !== "function") fail("recovery activation is required");
    if (
      typeof restoreCheckpoint !== "function" ||
      typeof activateReauction !== "function" ||
      typeof requestReplanning !== "function"
    )
      fail("recovery restoration is required");
    this.#stateKey = stableIdentifier(stateKey, "stateKey");
    this.#anchorKey = stableIdentifier(anchorKey, "anchorKey");
    this.#policy = validateCompromiseRecoveryPolicyV1(
      structuredClone(policy),
    );
    this.#scope = validateCompromiseRecoveryScopeV1(structuredClone(scope));
    this.#loadCurrent = (input) => loadCurrent.call(store, input);
    this.#save = (input) => save.call(store, input);
    this.#verify = (input) => verify.call(verification, input);
    this.#exclude = (input) => exclude.call(exclusion, input);
    this.#fence = (input) => fence.call(fencing, input);
    this.#activate = (input) => activate.call(activation, input);
    this.#restoreCheckpoint = (input) =>
      restoreCheckpoint.call(restoration, input);
    this.#activateReauction = (input) =>
      activateReauction.call(restoration, input);
    this.#requestReplanning = (input) =>
      requestReplanning.call(restoration, input);
    const invokers: CompromiseAwareRecoveryInvokersV1 = Object.freeze({
      scope: this.#scope,
      load: (logicalTimeMs = 0) => this.#load(logicalTimeMs),
      submit: (input: CompromiseRecoverySubmitInputV1) => this.#submit(input),
      runOnce: (logicalTimeMs: number) => this.#runOnce(logicalTimeMs),
      runToTerminal: (input: CompromiseRecoveryRunToTerminalInputV1) =>
        this.#runToTerminal(input),
      gateExecution: (input: CompromiseRecoveryGateInputV1) =>
        this.#gateExecution(input),
    });
    compromiseAwareRecoveryInvokersV1.set(this, invokers);
  }

  async load(logicalTimeMs = 0): Promise<CompromiseRecoveryStateV1> {
    return invokeCompromiseAwareRecoveryLoadV1(this, logicalTimeMs);
  }

  async #load(logicalTimeMs = 0): Promise<CompromiseRecoveryStateV1> {
    logicalTime(logicalTimeMs);
    const current = await this.#loadCurrent({
      stateKey: this.#stateKey,
      anchorKey: this.#anchorKey,
    });
    const existing = current.state;
    if (!existing) {
      if (current.anchor)
        fail("recovery state is missing below its monotonic anchor");
      const initial = await buildState({
        stateKey: this.#stateKey,
        scope: this.#scope,
        policyDigest: this.#policy.policyDigest,
        revision: 0,
        logicalTimeHighWaterMs: logicalTimeMs,
        activeIncident: null,
        excludedPeerIds: [],
        excludedPeerIndexes: [],
        fenceHead: null,
        completedCertificateDigests: [],
        supersededCertificates: [],
        predecessorStateDigest: null,
      });
      if (
        await this.#save({
          state: initial,
          anchorKey: this.#anchorKey,
          expectedRevision: null,
          expectedStateDigest: null,
        })
      ) {
        return initial;
      }
      const raced = await this.#loadCurrent({
        stateKey: this.#stateKey,
        anchorKey: this.#anchorKey,
      });
      if (!raced.state) fail("recovery state initialization conflicted");
      return this.#assertCurrent(raced.state, raced.anchor);
    }
    return this.#assertCurrent(existing, current.anchor);
  }

  async submit(input: {
    readonly verdict: CompromiseRecoveryVerdictCertificateV1;
    readonly request: CompromiseRecoveryRequestV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryStateV1> {
    return invokeCompromiseAwareRecoverySubmitV1(this, input);
  }

  async #submit(
    input: CompromiseRecoverySubmitInputV1,
  ): Promise<CompromiseRecoveryStateV1> {
    const time = logicalTime(input.logicalTimeMs);
    const verdict = validateCompromiseRecoveryVerdictCertificateV1(
      input.verdict,
      this.#policy,
    );
    const request = validateCompromiseRecoveryRequestV1(
      input.request,
      this.#policy,
    );
    if (
      !sameCompromiseRecoveryScopeV1(verdict.scope, this.#scope) ||
      !sameCompromiseRecoveryScopeV1(request.scope, this.#scope)
    )
      fail("recovery scope binding is invalid");
    await assertDigest(
      "compromise-verdict",
      verdictBody(verdict),
      verdict.certificateDigest,
    );
    await assertDigest(
      "compromise-recovery-request",
      requestBody(request),
      request.requestDigest,
    );
    const retained = await this.#load(time);
    if (
      retained.completedCertificateDigests.includes(
        verdict.certificateDigest,
      ) ||
      retained.supersededCertificates.some(
        ({ supersededCertificateDigest }) =>
          supersededCertificateDigest === verdict.certificateDigest,
      ) ||
      retained.activeIncident?.supersedesCertificateDigests.includes(
        verdict.certificateDigest,
      )
    )
      return retained;
    if (
      retained.activeIncident?.verdict.certificateDigest ===
      verdict.certificateDigest
    ) {
      if (
        retained.activeIncident.request.requestDigest !== request.requestDigest
      )
        fail("recovery certificate is already bound to another request");
      return retained;
    }
    if (time < retained.logicalTimeHighWaterMs)
      fail("recovery submission logical time regressed");
    if (
      time < verdict.issuedAtLogicalMs ||
      time >= verdict.expiresAtLogicalMs ||
      time >= request.objectiveExpiresAtLogicalMs
    )
      fail("recovery submission is outside its validity window");
    this.#assertMayStartNewIncident(retained, verdict, request, time);
    if (
      !(await this.#verify({
        verdict,
        policyDigest: this.#policy.policyDigest,
        logicalTimeMs: time,
      }))
    )
      fail("recovery verdict verification failed");

    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#load(time);
      if (time < current.logicalTimeHighWaterMs)
        fail("recovery submission logical time regressed");
      if (
        current.completedCertificateDigests.includes(
          verdict.certificateDigest,
        ) ||
        current.supersededCertificates.some(
          ({ supersededCertificateDigest }) =>
            supersededCertificateDigest === verdict.certificateDigest,
        ) ||
        current.activeIncident?.supersedesCertificateDigests.includes(
          verdict.certificateDigest,
        )
      )
        return current;
      if (current.activeIncident) {
        if (
          current.activeIncident.verdict.certificateDigest ===
          verdict.certificateDigest
        ) {
          if (
            current.activeIncident.request.requestDigest !==
            request.requestDigest
          )
            fail("recovery certificate is already bound to another request");
          return current;
        }
        if (
          current.activeIncident.stage !== "completed" &&
          current.activeIncident.stage !== "blocked"
        )
          fail("another recovery incident is active");
      }
      // Re-evaluate these guards after every CAS reload: another writer may
      // have advanced the fence or consumed retained-identity capacity.
      this.#assertMayStartNewIncident(current, verdict, request, time);
      const incidentId = request.recoveryRequestId;
      const supersedesCertificateDigests =
        current.activeIncident?.stage === "blocked"
          ? Object.freeze([
              current.activeIncident.verdict.certificateDigest,
              ...current.activeIncident.supersedesCertificateDigests,
            ])
          : Object.freeze([]);
      const incident = await buildIncident({
        incidentId,
        verdict,
        request,
        stage: "certified",
        exclusion: null,
        fence: null,
        activation: null,
        restoration: null,
        supersedesCertificateDigests,
        failureCode: null,
        startedAtLogicalMs: time,
        updatedAtLogicalMs: time,
      });
      const next = await nextState(current, {
        logicalTimeHighWaterMs: time,
        activeIncident: incident,
      });
      if (await this.#commit(current, next)) return next;
    }
    fail("recovery submission CAS attempts exhausted");
  }

  async runOnce(logicalTimeMs: number): Promise<CompromiseRecoveryStateV1> {
    return invokeCompromiseAwareRecoveryRunOnceV1(this, logicalTimeMs);
  }

  async #runOnce(logicalTimeMs: number): Promise<CompromiseRecoveryStateV1> {
    const time = logicalTime(logicalTimeMs);
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#load(time);
      const incident = current.activeIncident;
      if (
        !incident ||
        incident.stage === "completed" ||
        incident.stage === "blocked"
      )
        return current;
      if (time < current.logicalTimeHighWaterMs)
        fail("recovery logical time regressed");
      if (
        time >= incident.verdict.expiresAtLogicalMs ||
        time >= incident.request.objectiveExpiresAtLogicalMs ||
        (incident.activation !== null &&
          time >= incident.activation.expiresAtLogicalMs)
      ) {
        const blocked = await buildIncident({
          ...incident,
          stage: "blocked",
          failureCode: "recovery_authorization_expired",
          updatedAtLogicalMs: time,
        });
        const next = await nextState(current, {
          logicalTimeHighWaterMs: time,
          activeIncident: blocked,
        });
        if (await this.#commit(current, next)) return next;
        continue;
      }

      const advanced = await this.#advanceIncident(
        incident,
        time,
        current.excludedPeerIds,
        current.excludedPeerIndexes,
      );
      const completed = advanced.stage === "completed";
      const next = await nextState(current, {
        logicalTimeHighWaterMs: time,
        activeIncident: advanced,
        ...(advanced.exclusion
          ? {
              excludedPeerIds: appendBounded(
                current.excludedPeerIds,
                advanced.verdict.subjectPeerId,
                this.#policy.maximumExcludedPeers,
              ),
              excludedPeerIndexes: appendBounded(
                current.excludedPeerIndexes,
                advanced.verdict.subjectPeerIndex,
                this.#policy.maximumExcludedPeers,
              ),
            }
          : {}),
        ...(advanced.fence ? { fenceHead: advanced.fence } : {}),
        ...(completed
          ? {
              completedCertificateDigests: appendBounded(
                current.completedCertificateDigests,
                advanced.verdict.certificateDigest,
                this.#policy.maximumCompletedCertificates,
              ),
              supersededCertificates: appendSupersessions(
                current.supersededCertificates,
                advanced.supersedesCertificateDigests,
                advanced.verdict.certificateDigest,
                this.#policy.maximumCompletedCertificates,
              ),
            }
          : {}),
      });
      if (await this.#commit(current, next)) return next;
    }
    fail("recovery advancement CAS attempts exhausted");
  }

  async runToTerminal(input: {
    readonly logicalTimeMs: number;
    readonly maximumSteps?: number;
  }): Promise<CompromiseRecoveryStateV1> {
    return invokeCompromiseAwareRecoveryRunToTerminalV1(this, input);
  }

  async #runToTerminal(
    input: CompromiseRecoveryRunToTerminalInputV1,
  ): Promise<CompromiseRecoveryStateV1> {
    const maximum = input.maximumSteps ?? this.#policy.maximumRunSteps;
    if (
      !Number.isSafeInteger(maximum) ||
      maximum < 1 ||
      maximum > this.#policy.maximumRunSteps
    )
      fail("recovery maximumSteps is invalid");
    let state = await this.#load(input.logicalTimeMs);
    for (let step = 0; step < maximum; step += 1) {
      if (
        !state.activeIncident ||
        state.activeIncident.stage === "completed" ||
        state.activeIncident.stage === "blocked"
      )
        return state;
      state = await this.#runOnce(input.logicalTimeMs);
    }
    return state;
  }

  #assertMayStartNewIncident(
    state: CompromiseRecoveryStateV1,
    verdict: CompromiseRecoveryVerdictCertificateV1,
    request: CompromiseRecoveryRequestV1,
    time: number,
  ): void {
    const retainedPeerPosition = state.excludedPeerIds.indexOf(
      verdict.subjectPeerId,
    );
    const retainedIndexPosition = state.excludedPeerIndexes.indexOf(
      verdict.subjectPeerIndex,
    );
    if (
      (retainedPeerPosition === -1) !== (retainedIndexPosition === -1) ||
      (retainedPeerPosition >= 0 &&
        retainedPeerPosition !== retainedIndexPosition)
    )
      fail("recovery subject identity conflicts with retained exclusion");
    if (
      state.activeIncident?.stage === "blocked" &&
      (state.activeIncident.verdict.subjectPeerId !== verdict.subjectPeerId ||
        state.activeIncident.verdict.subjectPeerIndex !==
          verdict.subjectPeerIndex)
    )
      fail("blocked recovery may only be superseded for the same subject");
    if (
      state.activeIncident?.supersedesCertificateDigests.includes(
        verdict.certificateDigest,
      )
    )
      fail("blocked recovery ancestor cannot become its own successor");
    if (
      state.fenceHead &&
      (request.priorAssignmentEpoch !== state.fenceHead.assignmentEpoch ||
        request.priorFencingToken !== state.fenceHead.fencingToken)
    )
      fail("recovery request does not continue the current fence head");
    if (
      request.takeoverProposals.some(
        ({ acceptedAtLogicalMs, proposedAssigneePeerId }) =>
          acceptedAtLogicalMs > time ||
          acceptedAtLogicalMs >= request.objectiveExpiresAtLogicalMs ||
          proposedAssigneePeerId === verdict.subjectPeerId ||
          state.excludedPeerIds.includes(proposedAssigneePeerId),
      ) ||
      request.eligibleWitnessPeerIds.some(
        (peerId) =>
          peerId === verdict.subjectPeerId ||
          state.excludedPeerIds.includes(peerId),
      ) ||
      verdict.independentWitnessPeerIds.some(
        (peerId) =>
          peerId === verdict.subjectPeerId ||
          state.excludedPeerIds.includes(peerId),
      )
    )
      fail("recovery request relies on a future or excluded peer");
    if (
      (!state.excludedPeerIds.includes(verdict.subjectPeerId) &&
        state.excludedPeerIds.length >= this.#policy.maximumExcludedPeers) ||
      (!state.excludedPeerIndexes.includes(verdict.subjectPeerIndex) &&
        state.excludedPeerIndexes.length >=
          this.#policy.maximumExcludedPeers) ||
      state.completedCertificateDigests.length +
        state.supersededCertificates.length +
        (state.activeIncident?.stage === "blocked"
          ? 2 + state.activeIncident.supersedesCertificateDigests.length
          : 1) >
        this.#policy.maximumCompletedCertificates
    )
      fail("recovery retained identity capacity is exhausted");
  }

  async gateExecution(input: {
    readonly peerId: string;
    readonly assignmentEpoch: number;
    readonly fencingToken: string;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryExecutionGateV1> {
    return invokeCompromiseAwareRecoveryGateExecutionV1(this, input);
  }

  async #gateExecution(
    input: CompromiseRecoveryGateInputV1,
  ): Promise<CompromiseRecoveryExecutionGateV1> {
    const time = logicalTime(input.logicalTimeMs);
    const state = await this.#load(time);
    if (time < state.logicalTimeHighWaterMs)
      return Object.freeze({
        allowed: false,
        reasonCode: "logical_time_regressed",
      });
    if (state.excludedPeerIds.includes(input.peerId))
      return Object.freeze({ allowed: false, reasonCode: "peer_excluded" });
    if (state.activeIncident?.stage === "blocked")
      return Object.freeze({ allowed: false, reasonCode: "recovery_blocked" });
    if (state.activeIncident && state.activeIncident.stage !== "completed")
      return Object.freeze({
        allowed: false,
        reasonCode: "recovery_in_progress",
      });
    if (!state.fenceHead)
      return Object.freeze({
        allowed: true,
        reasonCode: "no_recovery_fence",
      });
    return state.fenceHead.assignmentEpoch === input.assignmentEpoch &&
      state.fenceHead.fencingToken === input.fencingToken
      ? Object.freeze({ allowed: true, reasonCode: "current_fence" })
      : Object.freeze({ allowed: false, reasonCode: "assignment_fenced" });
  }

  async #advanceIncident(
    incident: CompromiseRecoveryIncidentV1,
    time: number,
    previouslyExcludedPeerIds: readonly string[],
    previouslyExcludedPeerIndexes: readonly number[],
  ): Promise<CompromiseRecoveryIncidentV1> {
    if (incident.stage === "certified") {
      const retainedPeerPosition = previouslyExcludedPeerIds.indexOf(
        incident.verdict.subjectPeerId,
      );
      if (
        retainedPeerPosition >= 0 &&
        previouslyExcludedPeerIndexes[retainedPeerPosition] ===
          incident.verdict.subjectPeerIndex
      )
        return buildIncident({
          ...incident,
          stage: "excluded",
          updatedAtLogicalMs: time,
        });
      const exclusion = await this.#exclude({
        operationId: operationId(incident, "exclude"),
        verdict: incident.verdict,
        logicalTimeMs: time,
      });
      await validateExclusion(exclusion, incident, time);
      return buildIncident({
        ...incident,
        stage: "excluded",
        exclusion,
        updatedAtLogicalMs: time,
      });
    }
    if (incident.stage === "excluded") {
      const fence = await this.#fence({
        operationId: operationId(incident, "fence"),
        verdict: incident.verdict,
        request: incident.request,
        logicalTimeMs: time,
      });
      await validateFence(fence, incident, time);
      return buildIncident({
        ...incident,
        stage: "fenced",
        fence,
        updatedAtLogicalMs: time,
      });
    }
    if (incident.stage === "fenced") {
      if (!incident.fence) fail("recovery fence is missing");
      const activation = await this.#activate({
        operationId: operationId(incident, "activate"),
        verdict: incident.verdict,
        request: incident.request,
        fence: incident.fence,
        logicalTimeMs: time,
      });
      await validateActivation(
        activation,
        incident,
        time,
        previouslyExcludedPeerIds,
      );
      return buildIncident({
        ...incident,
        stage: "recovery_activated",
        activation,
        updatedAtLogicalMs: time,
      });
    }
    if (incident.stage === "recovery_activated") {
      if (!incident.fence || !incident.activation)
        fail("recovery activation dependencies are missing");
      const operation = operationId(incident, "restore");
      const restoration =
        incident.activation.decision === "checkpoint" &&
        incident.activation.checkpointDigest
          ? await this.#restoreCheckpoint({
              operationId: operation,
              checkpointDigest: incident.activation.checkpointDigest,
              activation: incident.activation,
              fence: incident.fence,
              logicalTimeMs: time,
            })
          : incident.activation.decision === "reauction"
            ? await this.#activateReauction({
                operationId: operation,
                activation: incident.activation,
                fence: incident.fence,
                logicalTimeMs: time,
              })
            : await this.#requestReplanning({
                operationId: operation,
                activation: incident.activation,
                fence: incident.fence,
                logicalTimeMs: time,
              });
      await validateRestoration(
        restoration,
        incident.activation,
        operation,
        time,
      );
      return buildIncident({
        ...incident,
        stage: "completed",
        restoration,
        updatedAtLogicalMs: time,
      });
    }
    return incident;
  }

  async #assertCurrent(
    input: CompromiseRecoveryStateV1,
    anchor: CompromiseRecoveryAnchorV1 | null,
  ): Promise<CompromiseRecoveryStateV1> {
    const state = assertCompromiseRecoveryStateShapeV1(input);
    if (
      state.stateKey !== this.#stateKey ||
      state.policyDigest !== this.#policy.policyDigest ||
      !sameCompromiseRecoveryScopeV1(state.scope, this.#scope)
    )
      fail("recovery durable state binding is invalid");
    if (
      state.excludedPeerIds.length > this.#policy.maximumExcludedPeers ||
      state.excludedPeerIndexes.length > this.#policy.maximumExcludedPeers ||
      state.excludedPeerIds.length !== state.excludedPeerIndexes.length ||
      state.completedCertificateDigests.length >
        this.#policy.maximumCompletedCertificates ||
      state.supersededCertificates.length >
        this.#policy.maximumCompletedCertificates ||
      state.completedCertificateDigests.length +
        state.supersededCertificates.length >
        this.#policy.maximumCompletedCertificates ||
      new Set(state.excludedPeerIds).size !== state.excludedPeerIds.length ||
      new Set(state.excludedPeerIndexes).size !==
        state.excludedPeerIndexes.length
    )
      fail("recovery durable state bounds are invalid");
    const supersededDigests = state.supersededCertificates.map(
      ({ supersededCertificateDigest, supersedingCertificateDigest }) => {
        planningDigestValue(
          supersededCertificateDigest,
          "supersededCertificateDigest",
        );
        planningDigestValue(
          supersedingCertificateDigest,
          "supersedingCertificateDigest",
        );
        if (supersededCertificateDigest === supersedingCertificateDigest)
          fail("recovery certificate cannot supersede itself");
        return supersededCertificateDigest;
      },
    );
    if (
      new Set(supersededDigests).size !== supersededDigests.length ||
      supersededDigests.some((digest) =>
        state.completedCertificateDigests.includes(digest),
      ) ||
      state.supersededCertificates.some(
        ({ supersedingCertificateDigest }) =>
          !state.completedCertificateDigests.includes(
            supersedingCertificateDigest,
          ),
      )
    )
      fail("recovery terminal certificate disposition conflicts");
    state.excludedPeerIds.forEach((peerId) =>
      stableIdentifier(peerId, "excludedPeerId"),
    );
    if (
      state.excludedPeerIndexes.some(
        (peerIndex) => !Number.isSafeInteger(peerIndex) || peerIndex < 0,
      )
    )
      fail("recovery excluded peer index is invalid");
    if (
      state.activeIncident &&
      (!sameCompromiseRecoveryScopeV1(
        state.activeIncident.verdict.scope,
        this.#scope,
      ) ||
        !sameCompromiseRecoveryScopeV1(
          state.activeIncident.request.scope,
          this.#scope,
        ) ||
        state.activeIncident.updatedAtLogicalMs > state.logicalTimeHighWaterMs)
    )
      fail("recovery active incident binding is invalid");
    if (state.activeIncident) {
      if (
        !Array.isArray(state.activeIncident.supersedesCertificateDigests) ||
        state.activeIncident.supersedesCertificateDigests.length >
          this.#policy.maximumCompletedCertificates
      )
        fail("recovery incident supersession chain is invalid");
      state.activeIncident.supersedesCertificateDigests.forEach((digest) =>
        planningDigestValue(digest, "supersededCertificateDigest"),
      );
      if (
        new Set(state.activeIncident.supersedesCertificateDigests).size !==
          state.activeIncident.supersedesCertificateDigests.length ||
        state.activeIncident.supersedesCertificateDigests.includes(
          state.activeIncident.verdict.certificateDigest,
        )
      )
        fail("recovery incident supersession chain conflicts");
    }
    await assertDigest(
      "compromise-recovery-state",
      stateBody(state),
      state.stateDigest,
    );
    if (
      !anchor ||
      anchor.revision !== state.revision ||
      anchor.stateDigest !== state.stateDigest ||
      anchor.logicalTimeHighWaterMs !== state.logicalTimeHighWaterMs
    )
      fail("recovery state rollback detected");
    return state;
  }

  async #commit(
    current: CompromiseRecoveryStateV1,
    next: CompromiseRecoveryStateV1,
  ): Promise<boolean> {
    const saved = await this.#save({
      state: next,
      anchorKey: this.#anchorKey,
      expectedRevision: current.revision,
      expectedStateDigest: current.stateDigest,
    });
    return saved;
  }
}

export function isCompromiseAwareRecoveryRuntimeV1(
  value: unknown,
): value is CompromiseAwareRecoveryRuntimeV1 {
  return (
    !!value &&
    (typeof value === "object" || typeof value === "function") &&
    compromiseAwareRecoveryInvokersV1.has(value as object)
  );
}

export function compromiseAwareRecoveryScopeV1(
  runtime: CompromiseAwareRecoveryRuntimeV1,
): CompromiseRecoveryRuntimeOptionsV1["scope"] {
  return recoveryInvokers(runtime).scope;
}

export function invokeCompromiseAwareRecoveryLoadV1(
  runtime: CompromiseAwareRecoveryRuntimeV1,
  logicalTimeMs = 0,
): Promise<CompromiseRecoveryStateV1> {
  return recoveryInvokers(runtime).load(logicalTimeMs);
}

export function invokeCompromiseAwareRecoverySubmitV1(
  runtime: CompromiseAwareRecoveryRuntimeV1,
  input: CompromiseRecoverySubmitInputV1,
): Promise<CompromiseRecoveryStateV1> {
  return recoveryInvokers(runtime).submit(input);
}

export function invokeCompromiseAwareRecoveryRunOnceV1(
  runtime: CompromiseAwareRecoveryRuntimeV1,
  logicalTimeMs: number,
): Promise<CompromiseRecoveryStateV1> {
  return recoveryInvokers(runtime).runOnce(logicalTimeMs);
}

export function invokeCompromiseAwareRecoveryRunToTerminalV1(
  runtime: CompromiseAwareRecoveryRuntimeV1,
  input: CompromiseRecoveryRunToTerminalInputV1,
): Promise<CompromiseRecoveryStateV1> {
  return recoveryInvokers(runtime).runToTerminal(input);
}

export function invokeCompromiseAwareRecoveryGateExecutionV1(
  runtime: CompromiseAwareRecoveryRuntimeV1,
  input: CompromiseRecoveryGateInputV1,
): Promise<CompromiseRecoveryExecutionGateV1> {
  return recoveryInvokers(runtime).gateExecution(input);
}

function recoveryInvokers(
  runtime: CompromiseAwareRecoveryRuntimeV1,
): CompromiseAwareRecoveryInvokersV1 {
  const invokers = compromiseAwareRecoveryInvokersV1.get(runtime);
  if (!invokers)
    fail("concrete compromise-aware recovery runtime is required");
  return invokers;
}

async function buildIncident(
  input: Omit<CompromiseRecoveryIncidentV1, "incidentDigest">,
): Promise<CompromiseRecoveryIncidentV1> {
  return Object.freeze({
    ...input,
    incidentDigest: await compromiseRecoveryDigestV1(
      "compromise-recovery-incident",
      input,
    ),
  });
}

async function buildState(
  input: Omit<
    CompromiseRecoveryStateV1,
    "format" | "schemaVersion" | "stateDigest"
  >,
): Promise<CompromiseRecoveryStateV1> {
  const body = {
    format: COMPROMISE_AWARE_RECOVERY_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    ...input,
  };
  return Object.freeze({
    ...body,
    stateDigest: await compromiseRecoveryDigestV1(
      "compromise-recovery-state",
      body,
    ),
  });
}

async function nextState(
  current: CompromiseRecoveryStateV1,
  changes: Partial<
    Pick<
      CompromiseRecoveryStateV1,
      | "logicalTimeHighWaterMs"
      | "activeIncident"
      | "excludedPeerIds"
      | "excludedPeerIndexes"
      | "fenceHead"
      | "completedCertificateDigests"
      | "supersededCertificates"
    >
  >,
): Promise<CompromiseRecoveryStateV1> {
  if (current.revision === Number.MAX_SAFE_INTEGER)
    fail("recovery state revision is exhausted");
  return buildState({
    stateKey: current.stateKey,
    scope: current.scope,
    policyDigest: current.policyDigest,
    revision: current.revision + 1,
    logicalTimeHighWaterMs:
      changes.logicalTimeHighWaterMs ?? current.logicalTimeHighWaterMs,
    activeIncident: changes.activeIncident ?? current.activeIncident,
    excludedPeerIds: changes.excludedPeerIds ?? current.excludedPeerIds,
    excludedPeerIndexes:
      changes.excludedPeerIndexes ?? current.excludedPeerIndexes,
    fenceHead: changes.fenceHead ?? current.fenceHead,
    completedCertificateDigests:
      changes.completedCertificateDigests ??
      current.completedCertificateDigests,
    supersededCertificates:
      changes.supersededCertificates ?? current.supersededCertificates,
    predecessorStateDigest: current.stateDigest,
  });
}

async function validateExclusion(
  receipt: CompromiseRecoveryExclusionReceiptV1,
  incident: CompromiseRecoveryIncidentV1,
  time: number,
): Promise<void> {
  const appliedAt = logicalTime(receipt.appliedAtLogicalMs);
  if (
    receipt.operationId !== operationId(incident, "exclude") ||
    receipt.subjectPeerId !== incident.verdict.subjectPeerId ||
    receipt.subjectPeerIndex !== incident.verdict.subjectPeerIndex ||
    receipt.certificateDigest !== incident.verdict.certificateDigest ||
    appliedAt < incident.startedAtLogicalMs ||
    appliedAt > time ||
    !Number.isSafeInteger(receipt.resultingViewRevision) ||
    receipt.resultingViewRevision < 0 ||
    typeof receipt.resultingViewDigest !== "string" ||
    receipt.resultingViewDigest.length < 8
  )
    fail("sparse exclusion receipt binding is invalid");
  const lifecycleFields = [
    receipt.lifecycleRetirementDigest,
    receipt.membershipConfigurationDigest,
    receipt.membershipEpoch,
  ];
  if (lifecycleFields.some((value) => value !== undefined)) {
    if (lifecycleFields.some((value) => value === undefined))
      fail("recovery lifecycle exclusion receipt is incomplete");
    if (!/^sha256:[0-9a-f]{64}$/u.test(receipt.lifecycleRetirementDigest!))
      fail("lifecycleRetirementDigest is invalid");
    if (!/^sha256:[0-9a-f]{64}$/u.test(receipt.membershipConfigurationDigest!))
      fail("membershipConfigurationDigest is invalid");
    if (
      !Number.isSafeInteger(receipt.membershipEpoch) ||
      receipt.membershipEpoch! < 1
    )
      fail("membershipEpoch is invalid");
  }
  await assertDigest(
    "compromise-exclusion-receipt",
    receiptBody(receipt),
    receipt.receiptDigest,
  );
}

async function validateFence(
  fence: CompromiseRecoveryFenceV1,
  incident: CompromiseRecoveryIncidentV1,
  time: number,
): Promise<void> {
  const installedAt = logicalTime(fence.installedAtLogicalMs);
  if (
    fence.operationId !== operationId(incident, "fence") ||
    fence.workItemId !== incident.request.scope.workItemId ||
    fence.excludedPeerId !== incident.verdict.subjectPeerId ||
    fence.priorAssignmentEpoch !== incident.request.priorAssignmentEpoch ||
    fence.assignmentEpoch !== incident.request.proposedAssignmentEpoch ||
    fence.fencingToken === incident.request.priorFencingToken ||
    installedAt < incident.startedAtLogicalMs ||
    installedAt > time ||
    stableIdentifier(fence.fencingToken, "recovery fencingToken") !==
      fence.fencingToken
  )
    fail("recovery fence binding is invalid");
  await assertDigest(
    "compromise-recovery-fence",
    fenceBody(fence),
    fence.fenceDigest,
  );
}

async function validateActivation(
  activation: CompromiseRecoveryActivationV1,
  incident: CompromiseRecoveryIncidentV1,
  time: number,
  previouslyExcludedPeerIds: readonly string[],
): Promise<void> {
  const certifiedAt = logicalTime(activation.certifiedAtLogicalMs);
  const expiresAt = logicalTime(activation.expiresAtLogicalMs);
  stableIdentifier(activation.electionId, "recovery electionId");
  stableIdentifier(
    activation.selectedProposalId,
    "recovery selectedProposalId",
  );
  stableIdentifier(
    activation.selectedAssigneePeerId,
    "recovery selectedAssigneePeerId",
  );
  if (
    !Number.isSafeInteger(activation.electionRound) ||
    activation.electionRound < 0
  )
    fail("recovery election round is invalid");
  const selectedProposal = incident.request.takeoverProposals.find(
    ({ takeoverProposalId, proposedAssigneePeerId }) =>
      takeoverProposalId === activation.selectedProposalId &&
      proposedAssigneePeerId === activation.selectedAssigneePeerId,
  );
  if (
    activation.operationId !== operationId(incident, "activate") ||
    activation.selectedAssigneePeerId === incident.verdict.subjectPeerId ||
    previouslyExcludedPeerIds.includes(activation.selectedAssigneePeerId) ||
    !selectedProposal ||
    certifiedAt < incident.startedAtLogicalMs ||
    certifiedAt < selectedProposal.acceptedAtLogicalMs ||
    certifiedAt < (incident.fence?.installedAtLogicalMs ?? 0) ||
    certifiedAt > time ||
    expiresAt <= certifiedAt ||
    expiresAt <= time ||
    expiresAt > incident.request.objectiveExpiresAtLogicalMs ||
    activation.certifiedWitnessPeerIds.length <
      incident.request.recoveryWitnessThreshold ||
    new Set(activation.certifiedWitnessPeerIds).size !==
      activation.certifiedWitnessPeerIds.length ||
    activation.certifiedWitnessPeerIds.some(
      (peerId) => !incident.request.eligibleWitnessPeerIds.includes(peerId),
    ) ||
    (activation.decision === "checkpoint" &&
      (activation.checkpointDigest === null ||
        incident.request.checkpointDigest === null ||
        activation.checkpointDigest !== incident.request.checkpointDigest)) ||
    (activation.decision !== "checkpoint" &&
      activation.checkpointDigest !== null) ||
    (activation.decision !== "checkpoint" &&
      activation.decision !== incident.request.fallback)
  )
    fail("recovery activation binding is invalid");
  await assertDigest(
    "compromise-recovery-activation",
    activationBody(activation),
    activation.activationDigest,
  );
}

async function validateRestoration(
  restoration: CompromiseRecoveryRestorationV1,
  activation: CompromiseRecoveryActivationV1,
  operation: string,
  time: number,
): Promise<void> {
  const appliedAt = logicalTime(restoration.appliedAtLogicalMs);
  if (
    restoration.operationId !== operation ||
    restoration.mode !== activation.decision ||
    appliedAt < activation.certifiedAtLogicalMs ||
    appliedAt >= activation.expiresAtLogicalMs ||
    appliedAt > time ||
    !/^sha256:[0-9a-f]{64}$/u.test(restoration.artifactDigest)
  )
    fail("recovery restoration binding is invalid");
  await assertDigest(
    "compromise-recovery-restoration",
    restorationBody(restoration),
    restoration.restorationDigest,
  );
}

async function assertDigest(
  domain: string,
  body: unknown,
  expected: PlanningDigestV1,
): Promise<void> {
  if ((await compromiseRecoveryDigestV1(domain, body)) !== expected)
    fail(`${domain} digest is invalid`);
}

function verdictBody({
  certificateDigest: _,
  ...body
}: CompromiseRecoveryVerdictCertificateV1) {
  return body;
}
function requestBody({
  requestDigest: _,
  ...body
}: CompromiseRecoveryRequestV1) {
  return body;
}
function receiptBody({
  receiptDigest: _,
  ...body
}: CompromiseRecoveryExclusionReceiptV1) {
  return body;
}
function fenceBody({ fenceDigest: _, ...body }: CompromiseRecoveryFenceV1) {
  return body;
}
function activationBody({
  activationDigest: _,
  ...body
}: CompromiseRecoveryActivationV1) {
  return body;
}
function restorationBody({
  restorationDigest: _,
  ...body
}: CompromiseRecoveryRestorationV1) {
  return body;
}
function stateBody({ stateDigest: _, ...body }: CompromiseRecoveryStateV1) {
  return body;
}

function operationId(
  incident: CompromiseRecoveryIncidentV1,
  phase: "exclude" | "fence" | "activate" | "restore",
): string {
  // Content-bound identity prevents a reused human request ID from aliasing
  // an earlier external effect while remaining stable across saga retries.
  return `recovery.${incident.verdict.certificateDigest}.${incident.request.requestDigest}.${phase}`;
}

function appendBounded<T>(
  values: readonly T[],
  value: T,
  maximum: number,
): readonly T[] {
  if (values.includes(value)) return values;
  if (values.length >= maximum)
    fail("recovery retained identity capacity is exhausted");
  return Object.freeze([...values, value]);
}

function appendSupersessions(
  values: readonly CompromiseRecoverySupersessionV1[],
  supersededCertificateDigests: readonly PlanningDigestV1[],
  supersedingCertificateDigest: PlanningDigestV1,
  maximum: number,
): readonly CompromiseRecoverySupersessionV1[] {
  let result = values;
  for (const supersededCertificateDigest of supersededCertificateDigests) {
    const value = {
      supersededCertificateDigest,
      supersedingCertificateDigest,
    };
    const existing = result.find(
      (item) =>
        item.supersededCertificateDigest === supersededCertificateDigest,
    );
    if (existing) {
      if (
        existing.supersedingCertificateDigest !==
        value.supersedingCertificateDigest
      )
        fail("recovery supersession disposition conflicts");
      continue;
    }
    if (result.length >= maximum)
      fail("recovery retained identity capacity is exhausted");
    result = Object.freeze([...result, Object.freeze(value)]);
  }
  return result;
}

function planningDigestValue(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
}

function logicalTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    fail("recovery logical time is invalid");
  return value;
}

function stableIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  )
    fail(`${label} is invalid`);
  return value;
}

function fail(message: string): never {
  throw new TypeError(message);
}
