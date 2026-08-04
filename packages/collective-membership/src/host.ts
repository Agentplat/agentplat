import type {
  CollectiveMembershipClientOptionsV1,
  CollectiveMembershipPeerHandleResultV1,
  CollectiveMembershipPeerOptionsV1,
} from "./contracts.js";
import { CollectiveMembershipClientV1 } from "./client.js";
import { CollectiveMembershipPeerV1 } from "./peer.js";

export class CollectiveMembershipHostV1 {
  readonly client: CollectiveMembershipClientV1;
  readonly peer: CollectiveMembershipPeerV1;

  constructor(input: {
    readonly client: CollectiveMembershipClientOptionsV1;
    readonly peer: CollectiveMembershipPeerOptionsV1;
  }) {
    assertSameScope(input.client.scope, input.peer.scope);
    if (
      input.client.registry !== input.peer.registry ||
      input.client.repository !== input.peer.repository
    )
      throw new TypeError("Membership client and peer must share state");
    this.client = new CollectiveMembershipClientV1(input.client);
    this.peer = new CollectiveMembershipPeerV1(input.peer);
  }

  handle(candidate: unknown): Promise<CollectiveMembershipPeerHandleResultV1> {
    return this.peer.handle(candidate);
  }
}

function assertSameScope(
  left: CollectiveMembershipClientOptionsV1["scope"],
  right: CollectiveMembershipPeerOptionsV1["scope"],
): void {
  if (
    left.tenantId !== right.tenantId ||
    left.meshId !== right.meshId ||
    left.peerId !== right.peerId ||
    left.instanceId !== right.instanceId ||
    left.policyDomainId !== right.policyDomainId
  )
    throw new TypeError("Membership client and peer scopes must match");
}
