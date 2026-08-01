import {
  computeMeshDurableValueDigest,
  normalizeMeshDurableScope,
  verifyMeshDurableJournal,
  type MeshDurablePeerSnapshot,
  type MeshDurableRepository,
  type MeshDurableScope,
  type MeshDurableSnapshotCodecRegistry,
} from "@agentplat/mesh/durability";
import type {
  MeshJsonValue,
  SignedMeshEnvelope,
} from "@agentplat/mesh-protocol";

import type {
  MeshConformanceCaseResult,
  MeshConformanceFactoryContext,
} from "./contracts.js";
import {
  assertCondition,
  awaitConformanceOperation,
  runBoundedCase,
  runConformanceCleanup,
  runnerContext,
  type MeshConformanceRunnerOptions,
} from "./runner.js";

export type MeshDurabilityConformanceScenario =
  | "inbox_commit"
  | "inbox_conflict"
  | "atomic_transition"
  | "stale_claim"
  | "journal_chain"
  | "snapshot_migration";

export interface MeshDurabilityRepositoryConformanceAdapter {
  readonly repository: MeshDurableRepository;
  readonly scope: MeshDurableScope;
  readonly inboundEnvelopes: readonly [SignedMeshEnvelope, SignedMeshEnvelope];
  readonly conflictingInboundEnvelope: SignedMeshEnvelope;
  readonly outboundEnvelopes: readonly [SignedMeshEnvelope, SignedMeshEnvelope];
  /** Reopens the same durable scope through a distinct repository instance. */
  restartRepository(): MeshDurableRepository | Promise<MeshDurableRepository>;
  /** Advances the repository's trusted lease clock or waits for real expiry. */
  advanceTime?(milliseconds: number): void | Promise<void>;
  cleanup?(): void | Promise<void>;
}

export interface MeshDurabilitySnapshotConformanceAdapter {
  readonly registry: MeshDurableSnapshotCodecRegistry;
  readonly legacySnapshot: MeshDurablePeerSnapshot;
  readonly expectedState: MeshJsonValue;
  cleanup?(): void | Promise<void>;
}

export type MeshDurabilityConformanceAdapter =
  | MeshDurabilityRepositoryConformanceAdapter
  | MeshDurabilitySnapshotConformanceAdapter;

export type MeshDurabilityConformanceFactory = (
  scenario: MeshDurabilityConformanceScenario,
  context: MeshConformanceFactoryContext,
) =>
  MeshDurabilityConformanceAdapter | Promise<MeshDurabilityConformanceAdapter>;

export interface MeshDurabilityConformanceOptions extends MeshConformanceRunnerOptions {
  readonly factory: MeshDurabilityConformanceFactory;
  /** Must be explicit before a runner may mutate caller-owned fixtures. */
  readonly allowDestructiveTests?: boolean;
}

export async function runMeshDurabilityConformance(
  options: MeshDurabilityConformanceOptions,
): Promise<readonly MeshConformanceCaseResult[]> {
  const context = runnerContext(options);
  if (
    [
      "durability.inbox",
      "durability.atomic_transition",
      "durability.fenced_claims",
      "durability.journal_chain",
      "durability.snapshot_migration",
    ].some((capability) =>
      context.declaredCapabilities.has(
        capability as Parameters<typeof context.declaredCapabilities.has>[0],
      ),
    ) &&
    options.allowDestructiveTests !== true
  ) {
    throw new TypeError(
      "Mesh durability conformance requires destructive-test consent",
    );
  }

  return Object.freeze([
    await repositoryCase(
      options.factory,
      context,
      "durability.inbox.commit_receipt",
      "durability.inbox",
      "inbox_commit",
      verifyInboxCommit,
    ),
    await repositoryCase(
      options.factory,
      context,
      "durability.inbox.conflict",
      "durability.inbox",
      "inbox_conflict",
      verifyInboxConflict,
    ),
    await repositoryCase(
      options.factory,
      context,
      "durability.transition.atomic",
      "durability.atomic_transition",
      "atomic_transition",
      verifyAtomicTransition,
    ),
    await repositoryCase(
      options.factory,
      context,
      "durability.claim.stale_fenced",
      "durability.fenced_claims",
      "stale_claim",
      verifyStaleClaim,
    ),
    await repositoryCase(
      options.factory,
      context,
      "durability.journal.chain",
      "durability.journal_chain",
      "journal_chain",
      verifyJournalChain,
    ),
    await runBoundedCase({
      caseId: "durability.snapshot.migration",
      capability: "durability.snapshot_migration",
      context,
      run: (signal) =>
        withAdapter(
          options.factory,
          context,
          signal,
          "snapshot_migration",
          async (adapter) => {
            assertSnapshotAdapter(adapter);
            await verifySnapshotMigration(adapter);
          },
        ),
    }),
  ]);
}

async function repositoryCase(
  factory: MeshDurabilityConformanceFactory,
  context: ReturnType<typeof runnerContext>,
  caseId: string,
  capability: Parameters<typeof runBoundedCase>[0]["capability"],
  scenario: Exclude<MeshDurabilityConformanceScenario, "snapshot_migration">,
  verify: (
    adapter: MeshDurabilityRepositoryConformanceAdapter,
  ) => void | Promise<void>,
): Promise<MeshConformanceCaseResult> {
  return runBoundedCase({
    caseId,
    capability,
    context,
    run: (signal) =>
      withAdapter(factory, context, signal, scenario, async (adapter) => {
        assertRepositoryAdapter(adapter);
        await verify(adapter);
      }),
  });
}

async function verifyInboxCommit(
  adapter: MeshDurabilityRepositoryConformanceAdapter,
): Promise<void> {
  const received = await adapter.repository.receive({
    scope: adapter.scope,
    envelope: adapter.inboundEnvelopes[0],
  });
  assertCondition(received.accepted && received.duplicate === false);
  const restarted = await adapter.restartRepository();
  assertCondition(restarted !== adapter.repository);
  const claimed = await restarted.claimInbox({
    scope: adapter.scope,
    workerId: "commit-worker",
    limit: 16,
    leaseDurationMs: 30_000,
  });
  assertCondition(claimed.length === 1);
  assertCondition(
    claimed[0]!.messageId === adapter.inboundEnvelopes[0].messageId,
  );
}

async function verifyInboxConflict(
  adapter: MeshDurabilityRepositoryConformanceAdapter,
): Promise<void> {
  const original = adapter.inboundEnvelopes[0];
  const conflicting = adapter.conflictingInboundEnvelope;
  assertCondition(original.messageId === conflicting.messageId);
  assertCondition(
    (await computeMeshDurableValueDigest(
      original as unknown as MeshJsonValue,
    )) !==
      (await computeMeshDurableValueDigest(
        conflicting as unknown as MeshJsonValue,
      )),
  );
  const first = await adapter.repository.receive({
    scope: adapter.scope,
    envelope: original,
  });
  const second = await adapter.repository.receive({
    scope: adapter.scope,
    envelope: conflicting,
  });
  assertCondition(first.accepted);
  assertCondition(!second.accepted && second.code === "message_conflict");
}

async function verifyAtomicTransition(
  adapter: MeshDurabilityRepositoryConformanceAdapter,
): Promise<void> {
  await receivePair(adapter);
  const firstClaims = await claimInbox(adapter, "atomic-worker-a", 30_000);
  assertCondition(firstClaims.length === 2);
  const [first, second] = sortInboxClaims(firstClaims);
  const firstState = Object.freeze({ conformanceRevision: 1 });
  const firstCommit = await adapter.repository.commitInboxTransition({
    inbox: first,
    expectedSnapshotRevision: 0,
    transitionId: "conformance-atomic-1",
    outcome: "applied",
    nextState: firstState,
    nextStateDescriptor: {
      format: "application/vnd.agentplat.conformance-state+json",
      schemaVersion: 1,
    },
    journal: [
      { entryId: "conformance-journal-1", kind: "conformance.applied" },
    ],
    outbox: [
      {
        effectId: "conformance-shared-effect",
        envelope: adapter.outboundEnvelopes[0],
      },
    ],
  });
  assertCondition(firstCommit.committed);

  const conflictingCommit = await adapter.repository.commitInboxTransition({
    inbox: second,
    expectedSnapshotRevision: 1,
    transitionId: "conformance-atomic-2",
    outcome: "applied",
    nextState: { conformanceRevision: 2 },
    nextStateDescriptor: {
      format: "application/vnd.agentplat.conformance-state+json",
      schemaVersion: 1,
    },
    journal: [
      { entryId: "conformance-journal-2", kind: "conformance.applied" },
    ],
    outbox: [
      {
        effectId: "conformance-shared-effect",
        envelope: adapter.outboundEnvelopes[1],
      },
    ],
  });
  assertCondition(
    !conflictingCommit.committed &&
      conflictingCommit.code === "outbox_conflict",
  );

  const snapshot = await adapter.repository.loadSnapshot(adapter.scope);
  const journal = await adapter.repository.inspectJournal({
    scope: adapter.scope,
    limit: 16,
  });
  const outbox = await adapter.repository.claimOutbox({
    scope: adapter.scope,
    workerId: "atomic-outbox-worker",
    limit: 16,
    leaseDurationMs: 30_000,
  });
  assertCondition(snapshot?.revision === 1);
  assertCondition(
    (snapshot.state as { readonly conformanceRevision?: unknown })
      .conformanceRevision === 1,
  );
  assertCondition(journal.length === 1);
  assertCondition(outbox.length === 1);
  assertCondition(
    outbox[0]!.messageId === adapter.outboundEnvelopes[0].messageId,
  );
  assertCondition(
    await adapter.repository.abandonInbox({
      inbox: second,
      retryAfterMs: 1,
      reasonCode: "conformance_conflict",
    }),
  );
}

async function verifyStaleClaim(
  adapter: MeshDurabilityRepositoryConformanceAdapter,
): Promise<void> {
  assertCondition(typeof adapter.advanceTime === "function");
  await adapter.repository.receive({
    scope: adapter.scope,
    envelope: adapter.inboundEnvelopes[0],
  });
  const stale = (await claimInbox(adapter, "stale-worker", 10))[0];
  assertCondition(stale !== undefined);
  await adapter.advanceTime(11);
  const current = (await claimInbox(adapter, "current-worker", 30_000))[0];
  assertCondition(current !== undefined);
  assertCondition(current.claim!.generation > stale.claim!.generation);
  const staleCommit = await adapter.repository.commitInboxTransition({
    inbox: stale,
    expectedSnapshotRevision: 0,
    transitionId: "conformance-stale-transition",
    outcome: "applied",
    nextState: { claim: "stale" },
    journal: [],
    outbox: [],
  });
  assertCondition(!staleCommit.committed && staleCommit.code === "claim_lost");
  const currentCommit = await adapter.repository.commitInboxTransition({
    inbox: current,
    expectedSnapshotRevision: 0,
    transitionId: "conformance-current-transition",
    outcome: "applied",
    nextState: { claim: "current" },
    journal: [],
    outbox: [],
  });
  assertCondition(currentCommit.committed);
  const snapshot = await adapter.repository.loadSnapshot(adapter.scope);
  assertCondition(
    (snapshot?.state as { readonly claim?: unknown })?.claim === "current",
  );
}

async function verifyJournalChain(
  adapter: MeshDurabilityRepositoryConformanceAdapter,
): Promise<void> {
  await adapter.repository.receive({
    scope: adapter.scope,
    envelope: adapter.inboundEnvelopes[0],
  });
  const inbox = (await claimInbox(adapter, "journal-worker", 30_000))[0];
  assertCondition(inbox !== undefined);
  const committed = await adapter.repository.commitInboxTransition({
    inbox,
    expectedSnapshotRevision: 0,
    transitionId: "conformance-journal-transition",
    outcome: "applied",
    nextState: { journal: true },
    journal: [
      { entryId: "conformance-chain-a", kind: "conformance.a" },
      { entryId: "conformance-chain-b", kind: "conformance.b" },
    ],
    outbox: [],
  });
  assertCondition(committed.committed);
  const journal = await adapter.repository.inspectJournal({
    scope: adapter.scope,
    limit: 16,
  });
  assertCondition(journal.length === 2);
  const expectedHead = journal[1]!;
  const verification = {
    expectedHeadDigest: expectedHead.digest,
    expectedHeadSequence: expectedHead.sequence,
  };
  assertCondition(
    await verifyMeshDurableJournal({ entries: journal, ...verification }),
  );
  const mutated = journal.map((entry, index) =>
    index === 1 ? { ...entry, kind: "conformance.mutated" } : entry,
  );
  assertCondition(
    !(await verifyMeshDurableJournal({ entries: mutated, ...verification })),
  );
  assertCondition(
    !(await verifyMeshDurableJournal({
      entries: [journal[1]!, journal[0]!],
      ...verification,
    })),
  );
  assertCondition(
    !(await verifyMeshDurableJournal({
      entries: [journal[0]!],
      ...verification,
    })),
  );
}

async function verifySnapshotMigration(
  adapter: MeshDurabilitySnapshotConformanceAdapter,
): Promise<void> {
  const [first, second] = await Promise.all([
    adapter.registry.migrate(adapter.legacySnapshot),
    adapter.registry.migrate(structuredClone(adapter.legacySnapshot)),
  ]);
  assertCondition(first.stateDigest === second.stateDigest);
  assertCondition(
    first.stateDigest ===
      (await computeMeshDurableValueDigest(
        adapter.expectedState as MeshJsonValue,
      )),
  );
  const currentSnapshot = Object.freeze({
    ...adapter.legacySnapshot,
    schemaVersion: 2 as const,
    state: first.state,
    stateDigest: first.stateDigest,
    snapshotFormat: first.descriptor.format,
    snapshotSchemaVersion: first.descriptor.schemaVersion,
  });
  const decoded = await adapter.registry.decode(currentSnapshot);
  assertCondition(
    (await computeMeshDurableValueDigest(decoded as MeshJsonValue)) ===
      first.stateDigest,
  );
  const idempotent = await adapter.registry.migrate(currentSnapshot);
  assertCondition(idempotent.stateDigest === first.stateDigest);
  await expectFailure(() =>
    adapter.registry.decode({
      ...currentSnapshot,
      snapshotFormat: "application/vnd.agentplat.unknown+json",
    }),
  );
  await expectFailure(() =>
    adapter.registry.decode({
      ...currentSnapshot,
      stateDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    }),
  );
}

async function receivePair(
  adapter: MeshDurabilityRepositoryConformanceAdapter,
): Promise<void> {
  for (const envelope of adapter.inboundEnvelopes) {
    const result = await adapter.repository.receive({
      scope: adapter.scope,
      envelope,
    });
    assertCondition(result.accepted && !result.duplicate);
  }
}

function claimInbox(
  adapter: MeshDurabilityRepositoryConformanceAdapter,
  workerId: string,
  leaseDurationMs: number,
) {
  return adapter.repository.claimInbox({
    scope: adapter.scope,
    workerId,
    limit: 16,
    leaseDurationMs,
  });
}

function sortInboxClaims(
  claims: Awaited<ReturnType<MeshDurableRepository["claimInbox"]>>,
) {
  return [...claims].sort((left, right) =>
    left.messageId < right.messageId
      ? -1
      : left.messageId > right.messageId
        ? 1
        : 0,
  ) as [(typeof claims)[number], (typeof claims)[number]];
}

function assertRepositoryAdapter(
  adapter: MeshDurabilityConformanceAdapter,
): asserts adapter is MeshDurabilityRepositoryConformanceAdapter {
  if (
    !adapter ||
    typeof adapter !== "object" ||
    !("repository" in adapter) ||
    !adapter.repository ||
    typeof adapter.repository.receive !== "function" ||
    typeof adapter.restartRepository !== "function" ||
    !Array.isArray(adapter.inboundEnvelopes) ||
    adapter.inboundEnvelopes.length !== 2 ||
    !Array.isArray(adapter.outboundEnvelopes) ||
    adapter.outboundEnvelopes.length !== 2
  ) {
    throw new TypeError("Mesh durability repository adapter is invalid");
  }
  normalizeMeshDurableScope(adapter.scope);
}

function assertSnapshotAdapter(
  adapter: MeshDurabilityConformanceAdapter,
): asserts adapter is MeshDurabilitySnapshotConformanceAdapter {
  if (
    !adapter ||
    typeof adapter !== "object" ||
    !("registry" in adapter) ||
    !adapter.registry ||
    typeof adapter.registry.migrate !== "function" ||
    !adapter.legacySnapshot ||
    adapter.expectedState === undefined
  ) {
    throw new TypeError("Mesh durability snapshot adapter is invalid");
  }
}

async function withAdapter(
  factory: MeshDurabilityConformanceFactory,
  context: ReturnType<typeof runnerContext>,
  signal: AbortSignal,
  scenario: MeshDurabilityConformanceScenario,
  run: (adapter: MeshDurabilityConformanceAdapter) => void | Promise<void>,
): Promise<void> {
  const adapter = await awaitConformanceOperation(
    factory(scenario, Object.freeze({ seed: context.seed, signal })),
    signal,
  );
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Mesh durability conformance factory is invalid");
  }
  let failed: unknown;
  try {
    await awaitConformanceOperation(run(adapter), signal);
  } catch (error) {
    failed = error;
  }
  await runConformanceCleanup(
    adapter.cleanup?.bind(adapter),
    context.cleanupTimeoutMs,
    failed,
  );
  if (failed !== undefined) throw failed;
}

async function expectFailure(run: () => unknown | Promise<unknown>) {
  let failed = false;
  try {
    await run();
  } catch {
    failed = true;
  }
  assertCondition(failed);
}
