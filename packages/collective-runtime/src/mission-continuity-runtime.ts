import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  MissionContinuityActionV1,
  MissionContinuityAuthorityPortV1,
  MissionContinuityAuthorityV1,
  MissionContinuityAvailabilityCertificateV1,
  MissionContinuityAvailabilityPortV1,
  MissionContinuityCheckpointRequestV1,
  MissionContinuityCheckpointV1,
  MissionContinuityMonotonicAnchorV1,
  MissionContinuityOperationV1,
  MissionContinuityPortV1,
  MissionContinuityReplicateRequestV1,
  MissionContinuityRepositoryV1,
  MissionContinuityRestorePortV1,
  MissionContinuityRuntimeOptionsV1,
  MissionContinuitySnapshotRequestV1,
  MissionContinuitySnapshotV1,
  MissionContinuityStateV1,
  MissionContinuityStoreV1,
  MissionContinuityTakeoverRequestV1,
  MissionContinuityTakeoverResultV1,
} from "./mission-continuity-contracts.js";
import {
  createMissionContinuityAvailabilityCertificateV1,
  createMissionContinuityCheckpointV1,
  createMissionContinuitySnapshotV1,
  createMissionContinuityStateV1,
  missionContinuityDigestV1,
  missionContinuityOperationInputDigestV1,
  validateMissionContinuityAuthorityV1,
  validateMissionContinuityAvailabilityCertificateV1,
  validateMissionContinuityCheckpointV1,
  validateMissionContinuitySnapshotV1,
  validateMissionContinuityStateV1,
} from "./mission-continuity-validation.js";
import type { GovernedMissionStateV1 } from "./mission-lifecycle-contracts.js";
import { validateGovernedMissionStateV1 } from "./mission-lifecycle-validation.js";

/**
 * Durable replication coordinator for the governed mission lifecycle. It only
 * copies validated state and never invokes lifecycle effect ports.
 */
export class MissionContinuityRuntimeV1 implements MissionContinuityPortV1 {
  readonly #options: MissionContinuityRuntimeOptionsV1;
  readonly #anchor: MissionContinuityMonotonicAnchorV1;
  readonly #maximumCommitAttempts: number;
  readonly #maximumOperations: number;

  constructor(options: MissionContinuityRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("mission continuity options are required");
    id(options.stateKey, "continuity state key");
    id(options.missionStateKey, "mission state key");
    sha(options.scopeDigest, "continuity scope digest");
    sha(options.policyDigest, "continuity policy digest");
    if (
      !options.source ||
      typeof options.source.load !== "function" ||
      !options.restore ||
      typeof options.restore.load !== "function" ||
      typeof options.restore.restore !== "function" ||
      !options.authority ||
      typeof options.authority.current !== "function" ||
      !options.availability ||
      typeof options.availability.certify !== "function" ||
      typeof options.availability.verify !== "function" ||
      !repository(options.repository) ||
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      fail("mission continuity ports are required");
    this.#maximumCommitAttempts = bounded(
      options.maximumCommitAttempts ?? 8,
      1,
      64,
      "maximum commit attempts",
    );
    this.#maximumOperations = bounded(
      options.maximumOperations ?? 256,
      4,
      1024,
      "maximum operations",
    );
    this.#anchor =
      options.monotonicAnchor ??
      (options.store as MissionContinuityStoreV1 &
        MissionContinuityMonotonicAnchorV1);
    if (typeof this.#anchor.readAnchor !== "function")
      fail("external monotonic anchor is required");
    this.#options = options;
  }

  async loadState(): Promise<MissionContinuityStateV1> {
    const value = await this.#options.store.load(this.#options.stateKey);
    return this.#currentState(value);
  }

  async snapshot(
    request: MissionContinuitySnapshotRequestV1,
  ): Promise<MissionContinuitySnapshotV1> {
    requestShape(request, [
      "checkpointId",
      "expectedMissionStateDigest",
      "logicalTimeMs",
      "operationId",
      "snapshotId",
    ]);
    const operationId = id(request.operationId, "snapshot operation ID");
    const snapshotId = id(request.snapshotId, "snapshot ID");
    const checkpointId = id(request.checkpointId, "checkpoint ID");
    const expectedStateDigest = sha(
      request.expectedMissionStateDigest,
      "expected mission state digest",
    );
    const logicalTimeMs = logical(request.logicalTimeMs);
    const receipt = (await this.loadState()).outbox.find(
      (entry) => entry.operationId === operationId,
    );
    if (receipt?.status === "applied") {
      if (receipt.action !== "snapshot")
        fail("mission continuity operation ID equivocation detected");
      const prior = this.#snapshot(
        await this.#options.repository.getSnapshot(receipt.artifactDigest!),
      );
      if (
        prior.snapshotId !== snapshotId ||
        prior.checkpointId !== checkpointId ||
        prior.missionStateDigest !== expectedStateDigest ||
        prior.createdAtLogicalMs !== logicalTimeMs
      )
        fail("mission continuity operation ID equivocation detected");
      return prior;
    }
    const authority = await this.#current(logicalTimeMs);
    const missionValue = await this.#options.source.load(
      this.#options.missionStateKey,
    );
    if (!missionValue) fail("mission state is unavailable for snapshot");
    const missionState = this.#missionState(missionValue);
    if (missionState.stateDigest !== expectedStateDigest)
      fail("mission state changed before snapshot");

    const before = await this.loadState();
    this.#assertStableAuthority(before, authority);
    const snapshot = createMissionContinuitySnapshotV1({
      schemaVersion: 1,
      snapshotId,
      checkpointId,
      missionState,
      missionStateDigest: missionState.stateDigest,
      predecessorCheckpointDigest: before.checkpointHeadDigest,
      policyDigest: this.#options.policyDigest,
      authority,
      createdAtLogicalMs: logicalTimeMs,
    });
    const inputDigest = this.#input(
      "snapshot",
      operationId,
      snapshot.snapshotDigest,
    );
    const prepared = await this.#prepare({
      action: "snapshot",
      operationId,
      inputDigest,
      logicalTimeMs,
      authority,
      expectedHead: snapshot.predecessorCheckpointDigest,
      allowAuthorityTransition: false,
    });
    if (prepared.operation.status === "applied")
      return this.#snapshot(
        await this.#options.repository.getSnapshot(
          prepared.operation.artifactDigest!,
        ),
      );

    const byIdValue =
      await this.#options.repository.getSnapshotById(snapshotId);
    if (byIdValue) {
      const byId = this.#snapshot(byIdValue);
      if (byId.snapshotDigest !== snapshot.snapshotDigest)
        fail("mission continuity snapshot ID equivocation detected");
    } else {
      await this.#options.repository.putSnapshot(snapshot);
    }
    await this.#assertSameCurrent(authority, logicalTimeMs);
    await this.#apply(
      operationId,
      inputDigest,
      snapshot.snapshotDigest,
      logicalTimeMs,
      {},
    );
    return snapshot;
  }

  async replicate(
    request: MissionContinuityReplicateRequestV1,
  ): Promise<MissionContinuityAvailabilityCertificateV1> {
    requestShape(request, ["logicalTimeMs", "operationId", "snapshotDigest"]);
    const operationId = id(request.operationId, "replication operation ID");
    const snapshotDigest = sha(request.snapshotDigest, "snapshot digest");
    const logicalTimeMs = logical(request.logicalTimeMs);
    const snapshot = this.#snapshot(
      await this.#options.repository.getSnapshot(snapshotDigest),
    );
    if (snapshot.snapshotDigest !== snapshotDigest)
      fail("mission continuity snapshot lookup is conflicting");
    this.#assertSnapshotBindings(snapshot);
    const authority = await this.#current(logicalTimeMs);
    if (!sameAuthority(authority, snapshot.authority))
      fail("mission continuity snapshot authority is stale");
    const inputDigest = this.#input("replicate", operationId, snapshotDigest);
    const prepared = await this.#prepare({
      action: "replicate",
      operationId,
      inputDigest,
      logicalTimeMs,
      authority,
      expectedHead: snapshot.predecessorCheckpointDigest,
      allowAuthorityTransition: false,
    });
    if (prepared.operation.status === "applied")
      return this.#certificate(
        await this.#options.repository.getCertificate(
          prepared.operation.artifactDigest!,
        ),
      );

    const existingValue =
      await this.#options.repository.getCertificateForCheckpoint(
        snapshot.checkpointDigest,
      );
    const certificate = existingValue
      ? this.#certificate(existingValue)
      : this.#certificate(
          await this.#options.availability.certify({
            operationId,
            checkpointDigest: snapshot.checkpointDigest,
            snapshotDigest,
            authority,
            logicalTimeMs,
          }),
        );
    if (
      certificate.checkpointDigest !== snapshot.checkpointDigest ||
      certificate.authorityDigest !== authority.authorityDigest ||
      certificate.certifiedAtLogicalMs < snapshot.createdAtLogicalMs ||
      certificate.certifiedAtLogicalMs > logicalTimeMs
    )
      fail("mission continuity availability certificate is conflicting");
    await this.#assertAvailable(
      snapshot,
      certificate,
      authority,
      logicalTimeMs,
    );
    if (!existingValue)
      await this.#options.repository.putCertificate(certificate);
    await this.#assertSameCurrent(authority, logicalTimeMs);
    await this.#apply(
      operationId,
      inputDigest,
      certificate.certificateDigest,
      logicalTimeMs,
      {},
    );
    return certificate;
  }

  async checkpoint(
    request: MissionContinuityCheckpointRequestV1,
  ): Promise<MissionContinuityCheckpointV1> {
    requestShape(request, [
      "certificateDigest",
      "logicalTimeMs",
      "operationId",
      "snapshotDigest",
    ]);
    const operationId = id(request.operationId, "checkpoint operation ID");
    const snapshotDigest = sha(request.snapshotDigest, "snapshot digest");
    const certificateDigest = sha(
      request.certificateDigest,
      "certificate digest",
    );
    const logicalTimeMs = logical(request.logicalTimeMs);
    const snapshot = this.#snapshot(
      await this.#options.repository.getSnapshot(snapshotDigest),
    );
    const certificate = this.#certificate(
      await this.#options.repository.getCertificate(certificateDigest),
    );
    this.#assertSnapshotBindings(snapshot);
    const authority = await this.#current(logicalTimeMs);
    if (!sameAuthority(authority, snapshot.authority))
      fail("mission continuity checkpoint authority is stale");
    await this.#assertAvailable(
      snapshot,
      certificate,
      authority,
      logicalTimeMs,
    );
    const checkpoint = createMissionContinuityCheckpointV1({
      schemaVersion: 1,
      checkpointId: snapshot.checkpointId,
      snapshotDigest: snapshot.snapshotDigest,
      missionStateDigest: snapshot.missionStateDigest,
      missionStateRevision: snapshot.missionState.revision,
      missionStateKey: snapshot.missionState.stateKey,
      scopeDigest: snapshot.missionState.scope.scopeDigest,
      policyDigest: snapshot.policyDigest,
      authority: snapshot.authority,
      predecessorCheckpointDigest: snapshot.predecessorCheckpointDigest,
      createdAtLogicalMs: snapshot.createdAtLogicalMs,
      availability: certificate,
    });
    const inputArtifact = missionContinuityDigestV1(
      "mission-continuity-checkpoint-request",
      { snapshotDigest, certificateDigest },
    );
    const inputDigest = this.#input("checkpoint", operationId, inputArtifact);
    const prepared = await this.#prepare({
      action: "checkpoint",
      operationId,
      inputDigest,
      logicalTimeMs,
      authority,
      expectedHead: checkpoint.predecessorCheckpointDigest,
      allowAuthorityTransition: false,
    });
    if (prepared.operation.status === "applied")
      return this.#checkpoint(
        await this.#options.repository.getCheckpoint(
          prepared.operation.artifactDigest!,
        ),
      );
    const byIdValue = await this.#options.repository.getCheckpointById(
      checkpoint.checkpointId,
    );
    if (byIdValue) {
      const byId = this.#checkpoint(byIdValue);
      if (byId.checkpointDigest !== checkpoint.checkpointDigest)
        fail("mission continuity checkpoint ID equivocation detected");
    } else {
      await this.#options.repository.putCheckpoint(checkpoint);
    }
    await this.#assertSameCurrent(authority, logicalTimeMs);
    await this.#apply(
      operationId,
      inputDigest,
      checkpoint.checkpointDigest,
      logicalTimeMs,
      { checkpointHeadDigest: checkpoint.checkpointDigest },
    );
    return checkpoint;
  }

  async takeover(
    request: MissionContinuityTakeoverRequestV1,
  ): Promise<MissionContinuityTakeoverResultV1> {
    requestShape(request, ["checkpointDigest", "logicalTimeMs", "operationId"]);
    const operationId = id(request.operationId, "takeover operation ID");
    const checkpointDigest = sha(request.checkpointDigest, "checkpoint digest");
    const logicalTimeMs = logical(request.logicalTimeMs);
    const checkpoint = this.#checkpoint(
      await this.#options.repository.getCheckpoint(checkpointDigest),
    );
    const snapshot = this.#snapshot(
      await this.#options.repository.getSnapshot(checkpoint.snapshotDigest),
    );
    this.#assertCheckpointSnapshot(checkpoint, snapshot);
    const authority = await this.#current(logicalTimeMs);
    if (
      authority.generation <= checkpoint.authority.generation ||
      authority.authorityDigest === checkpoint.authority.authorityDigest ||
      authority.resumeCheckpointDigest !== checkpointDigest ||
      !sameMissionAuthority(authority, checkpoint.authority)
    )
      fail("mission continuity takeover authority is stale or unauthorized");
    await this.#assertAvailable(
      snapshot,
      checkpoint.availability,
      checkpoint.authority,
      logicalTimeMs,
    );
    const takeoverBinding = missionContinuityDigestV1(
      "mission-continuity-takeover-request",
      {
        checkpointDigest,
        authorityDigest: authority.authorityDigest,
      },
    );
    const inputDigest = this.#input("takeover", operationId, takeoverBinding);
    const prepared = await this.#prepare({
      action: "takeover",
      operationId,
      inputDigest,
      logicalTimeMs,
      authority,
      expectedHead: checkpointDigest,
      allowAuthorityTransition: true,
    });
    if (prepared.operation.status !== "applied") {
      await this.#restore(snapshot.missionState, checkpoint, authority);
      await this.#assertSameCurrent(authority, logicalTimeMs);
      await this.#apply(
        operationId,
        inputDigest,
        snapshot.missionStateDigest,
        logicalTimeMs,
        {
          authority,
          checkpointHeadDigest: checkpointDigest,
          restoredMissionStateDigest: snapshot.missionStateDigest,
        },
      );
    }
    const continuityState = await this.loadState();
    const restoredValue = await this.#options.restore.load(
      this.#options.missionStateKey,
    );
    if (!restoredValue) fail("restored mission state is unavailable");
    const missionState = this.#missionState(restoredValue);
    if (
      missionState.stateDigest !== snapshot.missionStateDigest ||
      continuityState.restoredMissionStateDigest !== missionState.stateDigest ||
      continuityState.checkpointHeadDigest !== checkpointDigest ||
      !continuityState.authority ||
      !sameAuthority(continuityState.authority, authority)
    )
      fail("mission continuity takeover receipt is conflicting");
    return Object.freeze({
      continuityState,
      missionState,
      pendingOperationPreserved: missionState.pendingOperation !== null,
      appliedOperationCount: missionState.outbox.filter(
        (entry) => entry.status === "applied",
      ).length,
    });
  }

  async #restore(
    missionState: GovernedMissionStateV1,
    checkpoint: MissionContinuityCheckpointV1,
    authority: MissionContinuityAuthorityV1,
  ): Promise<void> {
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const currentValue = await this.#options.restore.load(
        this.#options.missionStateKey,
      );
      if (currentValue) {
        const current = this.#missionState(currentValue);
        if (current.stateDigest === missionState.stateDigest) return;
        if (current.revision > missionState.revision)
          fail("mission continuity restore rollback detected");
        if (current.revision === missionState.revision)
          fail("mission continuity restore equivocation detected");
        if (
          await this.#options.restore.restore({
            state: missionState,
            expectedRevision: current.revision,
            expectedStateDigest: current.stateDigest,
            checkpointDigest: checkpoint.checkpointDigest,
            authority,
          })
        )
          return;
      } else if (
        await this.#options.restore.restore({
          state: missionState,
          expectedRevision: null,
          expectedStateDigest: null,
          checkpointDigest: checkpoint.checkpointDigest,
          authority,
        })
      )
        return;
    }
    throw new Error("mission_continuity_restore_commit_conflict");
  }

  async #prepare(input: {
    readonly action: MissionContinuityActionV1;
    readonly operationId: string;
    readonly inputDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
    readonly authority: MissionContinuityAuthorityV1;
    readonly expectedHead: PlanningDigestV1 | null;
    readonly allowAuthorityTransition: boolean;
  }): Promise<{
    readonly state: MissionContinuityStateV1;
    readonly operation: MissionContinuityOperationV1;
  }> {
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const loaded = await this.#options.store.load(this.#options.stateKey);
      const state = await this.#currentState(loaded);
      this.#logical(state, input.logicalTimeMs);
      const existing = state.outbox.find(
        (entry) => entry.operationId === input.operationId,
      );
      if (existing) {
        if (
          existing.action !== input.action ||
          existing.inputDigest !== input.inputDigest
        )
          fail("mission continuity operation ID equivocation detected");
        return { state, operation: existing };
      }
      if (state.pendingOperation)
        fail("mission continuity has another prepared operation");
      if (state.outbox.length >= this.#maximumOperations)
        fail("mission continuity operation budget is exhausted");
      if (
        input.action === "takeover"
          ? state.checkpointHeadDigest !== null &&
            state.checkpointHeadDigest !== input.expectedHead
          : state.checkpointHeadDigest !== input.expectedHead
      )
        fail("mission continuity checkpoint lineage changed");
      if (input.allowAuthorityTransition) {
        if (
          state.authority &&
          (!sameMissionAuthority(state.authority, input.authority) ||
            input.authority.generation <= state.authority.generation)
        )
          fail("mission continuity takeover authority transition is invalid");
      } else {
        this.#assertStableAuthority(state, input.authority);
      }
      const operation: MissionContinuityOperationV1 = Object.freeze({
        operationId: input.operationId,
        action: input.action,
        inputDigest: input.inputDigest,
        preparedAtLogicalMs: input.logicalTimeMs,
        status: "prepared",
        artifactDigest: null,
      });
      const next = this.#next(state, input.logicalTimeMs, {
        authority: state.authority ?? input.authority,
        pendingOperation: operation,
        outbox: [...state.outbox, operation],
      });
      if (await this.#save(loaded ? state : null, next))
        return { state: next, operation };
    }
    throw new Error("mission_continuity_prepare_commit_conflict");
  }

  async #apply(
    operationId: string,
    inputDigest: PlanningDigestV1,
    artifactDigest: PlanningDigestV1,
    logicalTimeMs: number,
    update: Partial<MissionContinuityStateV1>,
  ): Promise<MissionContinuityStateV1> {
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const value = await this.#options.store.load(this.#options.stateKey);
      if (!value) fail("mission continuity prepared state is unavailable");
      const state = await this.#currentState(value);
      this.#logical(state, logicalTimeMs);
      const existing = state.outbox.find(
        (entry) => entry.operationId === operationId,
      );
      if (!existing || existing.inputDigest !== inputDigest)
        fail("mission continuity prepared operation is conflicting");
      if (existing.status === "applied") {
        if (existing.artifactDigest !== artifactDigest)
          fail("mission continuity applied operation is conflicting");
        return state;
      }
      if (state.pendingOperation?.operationId !== operationId)
        fail("mission continuity prepared operation is not current");
      const applied: MissionContinuityOperationV1 = Object.freeze({
        ...existing,
        status: "applied",
        artifactDigest,
      });
      const next = this.#next(state, logicalTimeMs, {
        ...update,
        pendingOperation: null,
        outbox: state.outbox.map((entry) =>
          entry.operationId === operationId ? applied : entry,
        ),
      });
      if (await this.#save(state, next)) return next;
    }
    throw new Error("mission_continuity_apply_commit_conflict");
  }

  #initial(): MissionContinuityStateV1 {
    return createMissionContinuityStateV1({
      stateKey: this.#options.stateKey,
      missionStateKey: this.#options.missionStateKey,
      scopeDigest: this.#options.scopeDigest,
      policyDigest: this.#options.policyDigest,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      authority: null,
      checkpointHeadDigest: null,
      restoredMissionStateDigest: null,
      pendingOperation: null,
      outbox: [],
      predecessorStateDigest: null,
    });
  }

  #next(
    state: MissionContinuityStateV1,
    logicalTimeMs: number,
    update: Partial<MissionContinuityStateV1>,
  ): MissionContinuityStateV1 {
    return createMissionContinuityStateV1({
      stateKey: state.stateKey,
      missionStateKey: state.missionStateKey,
      scopeDigest: state.scopeDigest,
      policyDigest: state.policyDigest,
      revision: state.revision + 1,
      logicalTimeHighWaterMs: logicalTimeMs,
      authority: update.authority ?? state.authority,
      checkpointHeadDigest:
        update.checkpointHeadDigest === undefined
          ? state.checkpointHeadDigest
          : update.checkpointHeadDigest,
      restoredMissionStateDigest:
        update.restoredMissionStateDigest === undefined
          ? state.restoredMissionStateDigest
          : update.restoredMissionStateDigest,
      pendingOperation:
        update.pendingOperation === undefined
          ? state.pendingOperation
          : update.pendingOperation,
      outbox: update.outbox ?? state.outbox,
      predecessorStateDigest: state.stateDigest,
    });
  }

  async #save(
    previous: MissionContinuityStateV1 | null,
    state: MissionContinuityStateV1,
  ): Promise<boolean> {
    return this.#options.store.save({
      state,
      expectedRevision: previous?.revision ?? null,
      expectedStateDigest: previous?.stateDigest ?? null,
    });
  }

  #state(value: unknown): MissionContinuityStateV1 {
    const state = validateMissionContinuityStateV1(value);
    if (
      state.stateKey !== this.#options.stateKey ||
      state.missionStateKey !== this.#options.missionStateKey ||
      state.scopeDigest !== this.#options.scopeDigest ||
      state.policyDigest !== this.#options.policyDigest ||
      state.outbox.length > this.#maximumOperations
    )
      fail("mission continuity stored state binding is invalid");
    return state;
  }

  async #currentState(
    value: MissionContinuityStateV1 | null,
  ): Promise<MissionContinuityStateV1> {
    const anchor = await this.#anchor.readAnchor(this.#options.stateKey);
    if (!value) {
      if (anchor) fail("mission continuity state rollback detected");
      return this.#initial();
    }
    const state = this.#state(value);
    if (
      anchor &&
      (state.revision < anchor.revision ||
        state.logicalTimeHighWaterMs < anchor.logicalTimeHighWaterMs ||
        (state.revision === anchor.revision &&
          state.stateDigest !== anchor.stateDigest))
    )
      fail("mission continuity state rollback or equivocation detected");
    return state;
  }

  #missionState(value: unknown): GovernedMissionStateV1 {
    const state = validateGovernedMissionStateV1(value);
    if (
      state.stateKey !== this.#options.missionStateKey ||
      state.scope.scopeDigest !== this.#options.scopeDigest ||
      state.policyDigest !== this.#options.policyDigest
    )
      fail("mission continuity lifecycle state binding is invalid");
    return state;
  }

  #snapshot(value: unknown): MissionContinuitySnapshotV1 {
    if (!value) fail("mission continuity snapshot is unavailable");
    return validateMissionContinuitySnapshotV1(value);
  }
  #certificate(value: unknown): MissionContinuityAvailabilityCertificateV1 {
    if (!value) fail("mission continuity certificate is unavailable");
    return validateMissionContinuityAvailabilityCertificateV1(value);
  }
  #checkpoint(value: unknown): MissionContinuityCheckpointV1 {
    if (!value) fail("mission continuity checkpoint is unavailable");
    return validateMissionContinuityCheckpointV1(value);
  }

  #assertSnapshotBindings(snapshot: MissionContinuitySnapshotV1): void {
    if (
      snapshot.missionState.stateKey !== this.#options.missionStateKey ||
      snapshot.missionState.scope.scopeDigest !== this.#options.scopeDigest ||
      snapshot.policyDigest !== this.#options.policyDigest ||
      snapshot.missionStateDigest !== snapshot.missionState.stateDigest
    )
      fail("mission continuity snapshot binding is invalid");
  }

  #assertCheckpointSnapshot(
    checkpoint: MissionContinuityCheckpointV1,
    snapshot: MissionContinuitySnapshotV1,
  ): void {
    this.#assertSnapshotBindings(snapshot);
    if (
      checkpoint.checkpointDigest !== snapshot.checkpointDigest ||
      checkpoint.checkpointId !== snapshot.checkpointId ||
      checkpoint.snapshotDigest !== snapshot.snapshotDigest ||
      checkpoint.missionStateDigest !== snapshot.missionStateDigest ||
      checkpoint.missionStateRevision !== snapshot.missionState.revision ||
      checkpoint.missionStateKey !== snapshot.missionState.stateKey ||
      checkpoint.scopeDigest !== snapshot.missionState.scope.scopeDigest ||
      checkpoint.policyDigest !== snapshot.policyDigest ||
      checkpoint.predecessorCheckpointDigest !==
        snapshot.predecessorCheckpointDigest ||
      !sameAuthority(checkpoint.authority, snapshot.authority)
    )
      fail("mission continuity checkpoint and snapshot conflict");
  }

  async #current(logicalTimeMs: number): Promise<MissionContinuityAuthorityV1> {
    const decision = await this.#options.authority.current({
      scopeDigest: this.#options.scopeDigest,
      policyDigest: this.#options.policyDigest,
      logicalTimeMs,
    });
    if (
      !decision ||
      decision.current !== true ||
      decision.reasonCode !== "current"
    )
      fail("mission continuity authority is unavailable");
    const authority = validateMissionContinuityAuthorityV1(decision.authority);
    if (
      authority.scopeDigest !== this.#options.scopeDigest ||
      authority.policyDigest !== this.#options.policyDigest ||
      logicalTimeMs >= authority.validUntilLogicalMs
    )
      fail("mission continuity authority is stale or out of scope");
    return authority;
  }

  async #assertSameCurrent(
    expected: MissionContinuityAuthorityV1,
    logicalTimeMs: number,
  ): Promise<void> {
    if (!sameAuthority(expected, await this.#current(logicalTimeMs)))
      fail("mission continuity authority changed during operation");
  }

  #assertStableAuthority(
    state: MissionContinuityStateV1,
    authority: MissionContinuityAuthorityV1,
  ): void {
    if (state.authority && !sameAuthority(state.authority, authority))
      fail("mission continuity authority changed without takeover");
  }

  async #assertAvailable(
    snapshot: MissionContinuitySnapshotV1,
    certificate: MissionContinuityAvailabilityCertificateV1,
    authority: MissionContinuityAuthorityV1,
    logicalTimeMs: number,
  ): Promise<void> {
    if (
      certificate.checkpointDigest !== snapshot.checkpointDigest ||
      certificate.authorityDigest !== authority.authorityDigest ||
      certificate.certifiedAtLogicalMs < snapshot.createdAtLogicalMs ||
      certificate.certifiedAtLogicalMs > logicalTimeMs ||
      !(await this.#options.availability.verify({
        checkpointDigest: snapshot.checkpointDigest,
        snapshotDigest: snapshot.snapshotDigest,
        certificate,
        authority,
        logicalTimeMs,
      }))
    )
      fail("mission continuity checkpoint availability is invalid");
  }

  #input(
    action: MissionContinuityActionV1,
    operationId: string,
    artifactDigest: PlanningDigestV1,
  ): PlanningDigestV1 {
    return missionContinuityOperationInputDigestV1({
      action,
      operationId,
      artifactDigest,
      scopeDigest: this.#options.scopeDigest,
      policyDigest: this.#options.policyDigest,
    });
  }

  #logical(state: MissionContinuityStateV1, value: number): void {
    if (value < state.logicalTimeHighWaterMs)
      fail("mission continuity logical time rollback detected");
  }
}

/** Deterministic local/test CAS implementation. */
export class InMemoryMissionContinuityStoreV1
  implements MissionContinuityStoreV1, MissionContinuityMonotonicAnchorV1
{
  #state: MissionContinuityStateV1 | null = null;
  #anchor: {
    readonly revision: number;
    readonly logicalTimeHighWaterMs: number;
    readonly stateDigest: PlanningDigestV1;
  } | null = null;
  async load(): Promise<MissionContinuityStateV1 | null> {
    return this.#state;
  }
  async readAnchor(): Promise<{
    readonly revision: number;
    readonly logicalTimeHighWaterMs: number;
    readonly stateDigest: PlanningDigestV1;
  } | null> {
    return this.#anchor;
  }
  async save(input: {
    readonly state: MissionContinuityStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    if (
      this.#state === null
        ? input.expectedRevision !== null ||
          input.expectedStateDigest !== null ||
          input.state.revision !== 1
        : input.expectedRevision !== this.#state.revision ||
          input.expectedStateDigest !== this.#state.stateDigest ||
          input.state.revision !== this.#state.revision + 1
    )
      return false;
    this.#state = validateMissionContinuityStateV1(input.state);
    this.#anchor = Object.freeze({
      revision: this.#state.revision,
      logicalTimeHighWaterMs: this.#state.logicalTimeHighWaterMs,
      stateDigest: this.#state.stateDigest,
    });
    return true;
  }
}

export class InMemoryMissionContinuityRepositoryV1 implements MissionContinuityRepositoryV1 {
  readonly #snapshots = new Map<
    PlanningDigestV1,
    MissionContinuitySnapshotV1
  >();
  readonly #snapshotIds = new Map<string, PlanningDigestV1>();
  readonly #certificates = new Map<
    PlanningDigestV1,
    MissionContinuityAvailabilityCertificateV1
  >();
  readonly #checkpointCertificates = new Map<
    PlanningDigestV1,
    PlanningDigestV1
  >();
  readonly #checkpoints = new Map<
    PlanningDigestV1,
    MissionContinuityCheckpointV1
  >();
  readonly #checkpointIds = new Map<string, PlanningDigestV1>();

  async getSnapshot(digest: PlanningDigestV1) {
    return this.#snapshots.get(digest) ?? null;
  }
  async getSnapshotById(id: string) {
    const digest = this.#snapshotIds.get(id);
    return digest ? (this.#snapshots.get(digest) ?? null) : null;
  }
  async putSnapshot(input: MissionContinuitySnapshotV1): Promise<void> {
    const value = validateMissionContinuitySnapshotV1(input);
    const byId = this.#snapshotIds.get(value.snapshotId);
    if (byId && byId !== value.snapshotDigest)
      fail("mission continuity snapshot ID equivocation detected");
    const byDigest = this.#snapshots.get(value.snapshotDigest);
    if (byDigest && byDigest.snapshotId !== value.snapshotId)
      fail("mission continuity snapshot digest conflict detected");
    this.#snapshots.set(value.snapshotDigest, value);
    this.#snapshotIds.set(value.snapshotId, value.snapshotDigest);
  }
  async getCertificate(digest: PlanningDigestV1) {
    return this.#certificates.get(digest) ?? null;
  }
  async getCertificateForCheckpoint(digest: PlanningDigestV1) {
    const certificate = this.#checkpointCertificates.get(digest);
    return certificate ? (this.#certificates.get(certificate) ?? null) : null;
  }
  async putCertificate(
    input: MissionContinuityAvailabilityCertificateV1,
  ): Promise<void> {
    const value = validateMissionContinuityAvailabilityCertificateV1(input);
    const existing = this.#checkpointCertificates.get(value.checkpointDigest);
    if (existing && existing !== value.certificateDigest)
      fail("mission continuity availability equivocation detected");
    this.#certificates.set(value.certificateDigest, value);
    this.#checkpointCertificates.set(
      value.checkpointDigest,
      value.certificateDigest,
    );
  }
  async getCheckpoint(digest: PlanningDigestV1) {
    return this.#checkpoints.get(digest) ?? null;
  }
  async getCheckpointById(id: string) {
    const digest = this.#checkpointIds.get(id);
    return digest ? (this.#checkpoints.get(digest) ?? null) : null;
  }
  async putCheckpoint(input: MissionContinuityCheckpointV1): Promise<void> {
    const value = validateMissionContinuityCheckpointV1(input);
    const byId = this.#checkpointIds.get(value.checkpointId);
    if (byId && byId !== value.checkpointDigest)
      fail("mission continuity checkpoint ID equivocation detected");
    this.#checkpoints.set(value.checkpointDigest, value);
    this.#checkpointIds.set(value.checkpointId, value.checkpointDigest);
  }
}

export class InMemoryMissionContinuityAuthorityPortV1 implements MissionContinuityAuthorityPortV1 {
  #authority: MissionContinuityAuthorityV1 | null;
  constructor(authority: MissionContinuityAuthorityV1 | null) {
    this.#authority = authority
      ? validateMissionContinuityAuthorityV1(authority)
      : null;
  }
  set(authority: MissionContinuityAuthorityV1 | null): void {
    this.#authority = authority
      ? validateMissionContinuityAuthorityV1(authority)
      : null;
  }
  async current(input: {
    readonly scopeDigest: PlanningDigestV1;
    readonly policyDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }) {
    const authority = this.#authority;
    if (
      !authority ||
      authority.scopeDigest !== input.scopeDigest ||
      authority.policyDigest !== input.policyDigest ||
      input.logicalTimeMs >= authority.validUntilLogicalMs
    )
      return {
        current: false as const,
        reasonCode: "unavailable",
        authority,
      };
    return {
      current: true as const,
      reasonCode: "current" as const,
      authority,
    };
  }
}

export class InMemoryMissionContinuityAvailabilityPortV1 implements MissionContinuityAvailabilityPortV1 {
  readonly #replicaIds: readonly string[];
  readonly #threshold: number;
  constructor(replicaIds: readonly string[], threshold: number) {
    if (!Array.isArray(replicaIds) || replicaIds.length < 1)
      fail("availability replicas are required");
    this.#replicaIds = Object.freeze(
      replicaIds.map((entry) => id(entry, "replica ID")),
    );
    this.#threshold = bounded(
      threshold,
      1,
      this.#replicaIds.length,
      "availability threshold",
    );
  }
  async certify(input: {
    readonly checkpointDigest: PlanningDigestV1;
    readonly authority: MissionContinuityAuthorityV1;
    readonly logicalTimeMs: number;
  }) {
    return createMissionContinuityAvailabilityCertificateV1({
      schemaVersion: 1,
      checkpointDigest: input.checkpointDigest,
      authorityDigest: input.authority.authorityDigest,
      availableReplicaIds: this.#replicaIds,
      threshold: this.#threshold,
      certifiedAtLogicalMs: input.logicalTimeMs,
    });
  }
  async verify(input: {
    readonly checkpointDigest: PlanningDigestV1;
    readonly certificate: MissionContinuityAvailabilityCertificateV1;
    readonly authority: MissionContinuityAuthorityV1;
  }): Promise<boolean> {
    try {
      const certificate = validateMissionContinuityAvailabilityCertificateV1(
        input.certificate,
      );
      return (
        certificate.checkpointDigest === input.checkpointDigest &&
        certificate.authorityDigest === input.authority.authorityDigest &&
        certificate.threshold <= certificate.availableReplicaIds.length
      );
    } catch {
      return false;
    }
  }
}

/** Restore adapter used by deterministic tests; production uses a durable CAS. */
export class InMemoryMissionContinuityRestorePortV1 implements MissionContinuityRestorePortV1 {
  #state: GovernedMissionStateV1 | null = null;
  async load(): Promise<GovernedMissionStateV1 | null> {
    return this.#state;
  }
  async restore(input: {
    readonly state: GovernedMissionStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    if (
      this.#state === null
        ? input.expectedRevision !== null || input.expectedStateDigest !== null
        : input.expectedRevision !== this.#state.revision ||
          input.expectedStateDigest !== this.#state.stateDigest
    )
      return false;
    this.#state = validateGovernedMissionStateV1(input.state);
    return true;
  }
}

function sameMissionAuthority(
  left: MissionContinuityAuthorityV1,
  right: MissionContinuityAuthorityV1,
): boolean {
  return (
    left.authorityId === right.authorityId &&
    left.authorityEpoch === right.authorityEpoch &&
    left.fencingToken === right.fencingToken &&
    left.scopeDigest === right.scopeDigest &&
    left.policyDigest === right.policyDigest
  );
}
function sameAuthority(
  left: MissionContinuityAuthorityV1,
  right: MissionContinuityAuthorityV1,
): boolean {
  return left.authorityDigest === right.authorityDigest;
}
function repository(value: MissionContinuityRepositoryV1): boolean {
  return Boolean(
    value &&
    typeof value.getSnapshot === "function" &&
    typeof value.getSnapshotById === "function" &&
    typeof value.putSnapshot === "function" &&
    typeof value.getCertificate === "function" &&
    typeof value.getCertificateForCheckpoint === "function" &&
    typeof value.putCertificate === "function" &&
    typeof value.getCheckpoint === "function" &&
    typeof value.getCheckpointById === "function" &&
    typeof value.putCheckpoint === "function",
  );
}
function requestShape(input: unknown, keys: readonly string[]): void {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("mission continuity request is invalid");
  const actual = Object.keys(input).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail("mission continuity request shape is invalid");
}
function id(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(value)
  )
    fail(`${label} is invalid`);
  return value;
}
function sha(value: unknown, label: string): PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
  return value as PlanningDigestV1;
}
function logical(value: unknown): number {
  return bounded(value, 0, Number.MAX_SAFE_INTEGER, "logical time");
}
function bounded(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    fail(`${label} is invalid`);
  return value as number;
}
function fail(message: string): never {
  throw new TypeError(message);
}
