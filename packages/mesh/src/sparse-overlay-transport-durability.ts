import type { MeshJsonValue } from "@agentplat/mesh-protocol";
import type {
  MeshDurableLocalTransitionRepository,
  MeshDurablePeerSnapshot,
  MeshDurableScope,
} from "./durability.js";
import type {
  MeshSparseTransportStateV1,
  MeshSparseTransportStoreV1,
} from "./sparse-overlay-transport-contracts.js";

export const MESH_SPARSE_TRANSPORT_SNAPSHOT_FORMAT_V1 =
  "application/vnd.agentplat.mesh-sparse-transport.v1+json" as const;

/** Durable transport CAS adapter over a dedicated local-transition scope. */
export class MeshDurableSparseTransportStoreV1
  implements MeshSparseTransportStoreV1
{
  readonly #repository: MeshDurableLocalTransitionRepository;
  readonly #scope: MeshDurableScope;

  constructor(input: {
    readonly repository: MeshDurableLocalTransitionRepository;
    readonly scope: MeshDurableScope;
  }) {
    if (
      !input?.repository ||
      typeof input.repository.loadSnapshot !== "function" ||
      typeof input.repository.commitLocalTransition !== "function"
    )
      throw new TypeError("sparse transport durable repository is required");
    this.#repository = input.repository;
    this.#scope = normalizeScope(input.scope);
  }

  async load(overlayId: string): Promise<MeshSparseTransportStateV1 | undefined> {
    identifier(overlayId, "overlayId");
    const snapshot = await this.#repository.loadSnapshot(this.#scope);
    return snapshot ? decode(snapshot, overlayId) : undefined;
  }

  async compareAndSwap(input: {
    readonly overlayId: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: MeshSparseTransportStateV1["stateDigest"] | null;
    readonly next: MeshSparseTransportStateV1;
  }): Promise<boolean> {
    identifier(input?.overlayId, "overlayId");
    if (!input.next || input.next.overlayId !== input.overlayId)
      throw new TypeError("sparse transport next state binding is invalid");
    const snapshot = await this.#repository.loadSnapshot(this.#scope);
    const current = snapshot ? decode(snapshot, input.overlayId) : undefined;
    if (input.expectedRevision === null || input.expectedStateDigest === null) {
      if (
        input.expectedRevision !== null ||
        input.expectedStateDigest !== null ||
        current ||
        input.next.revision !== 0
      ) return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      current.stateDigest !== input.expectedStateDigest ||
      input.next.revision !== current.revision + 1
    ) {
      return false;
    }
    const transitionId = `sparse-transport.${input.next.revision}.${input.next.stateDigest.slice(7, 23)}`;
    const committed = await this.#repository.commitLocalTransition({
      scope: this.#scope,
      expectedSnapshotRevision: snapshot?.revision ?? 0,
      transitionId,
      nextState: json(input.next),
      nextStateDescriptor: {
        format: MESH_SPARSE_TRANSPORT_SNAPSHOT_FORMAT_V1,
        schemaVersion: 1,
      },
      journal: [{
        entryId: transitionId,
        kind: input.next.revision === 0
          ? "sparse.transport.initialized"
          : "sparse.transport.committed",
      }],
      outbox: [],
    });
    return committed.committed;
  }
}

function decode(
  snapshot: MeshDurablePeerSnapshot,
  overlayId: string,
): MeshSparseTransportStateV1 {
  if (
    snapshot.snapshotFormat !== MESH_SPARSE_TRANSPORT_SNAPSHOT_FORMAT_V1 ||
    snapshot.snapshotSchemaVersion !== 1 ||
    !snapshot.state ||
    typeof snapshot.state !== "object" ||
    Array.isArray(snapshot.state)
  )
    throw new TypeError("sparse transport durable snapshot is invalid");
  const state = snapshot.state as unknown as MeshSparseTransportStateV1;
  if (state.schemaVersion !== 1 || state.overlayId !== overlayId)
    throw new TypeError("sparse transport durable snapshot binding is invalid");
  return state;
}

function json(value: MeshSparseTransportStateV1): MeshJsonValue {
  return JSON.parse(JSON.stringify(value)) as MeshJsonValue;
}

function normalizeScope(scope: MeshDurableScope): MeshDurableScope {
  if (!scope || typeof scope !== "object")
    throw new TypeError("sparse transport durable scope is required");
  return Object.freeze({
    tenantId: identifier(scope.tenantId, "scope.tenantId"),
    meshId: identifier(scope.meshId, "scope.meshId"),
    peerId: identifier(scope.peerId, "scope.peerId"),
    instanceId: identifier(scope.instanceId, "scope.instanceId"),
  });
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}
