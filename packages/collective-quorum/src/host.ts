import { CollectivePeerNodeRuntimeV1 } from "@agentplat/collective-runtime/node";
import type {
  CollectivePeerNodeQuorumPortsV1,
  CollectiveQuorumClientOptionsV1,
  CollectiveQuorumPeerHandleResultV1,
  CollectiveQuorumPeerOptionsV1,
} from "./contracts.js";
import { CollectiveQuorumClientV1 } from "./client.js";
import { CollectivePeerNodeQuorumEvidenceV1 } from "./node-evidence.js";
import { CollectiveQuorumPeerV1 } from "./peer.js";

export interface CollectivePeerQuorumHostOptionsV1 {
  readonly client: CollectiveQuorumClientOptionsV1;
  readonly peer: Omit<CollectiveQuorumPeerOptionsV1, "evidence">;
  readonly createNode: (
    ports: CollectivePeerNodeQuorumPortsV1,
  ) => CollectivePeerNodeRuntimeV1;
}

/** One node plus its local acceptor endpoint; neither role is globally unique. */
export class CollectivePeerQuorumHostV1 {
  private constructor(
    readonly node: CollectivePeerNodeRuntimeV1,
    readonly quorumClient: CollectiveQuorumClientV1,
    readonly quorumPeer: CollectiveQuorumPeerV1,
    readonly quorumPorts: CollectivePeerNodeQuorumPortsV1,
  ) {}

  static create(
    options: CollectivePeerQuorumHostOptionsV1,
  ): CollectivePeerQuorumHostV1 {
    if (!options || typeof options.createNode !== "function")
      throw new TypeError("createNode is required");
    assertSameScope(options.client.scope, options.peer.scope);
    const client = new CollectiveQuorumClientV1(options.client);
    const ports = client.ports();
    const node = options.createNode(ports);
    if (!(node instanceof CollectivePeerNodeRuntimeV1))
      throw new TypeError("createNode must return CollectivePeerNodeRuntimeV1");
    const evidence = new CollectivePeerNodeQuorumEvidenceV1({
      scope: options.peer.scope,
      readState: async () => (await node.restore()).state,
    });
    const peer = new CollectiveQuorumPeerV1({ ...options.peer, evidence });
    return new CollectivePeerQuorumHostV1(node, client, peer, ports);
  }

  handleQuorum(
    candidate: unknown,
  ): Promise<CollectiveQuorumPeerHandleResultV1> {
    return this.quorumPeer.handle(candidate);
  }
}

function assertSameScope(
  left: CollectiveQuorumClientOptionsV1["scope"],
  right: CollectiveQuorumPeerOptionsV1["scope"],
): void {
  if (
    left.tenantId !== right.tenantId ||
    left.meshId !== right.meshId ||
    left.peerId !== right.peerId ||
    left.instanceId !== right.instanceId ||
    left.policyDomainId !== right.policyDomainId
  )
    throw new TypeError("Quorum client and peer scopes must match");
}
