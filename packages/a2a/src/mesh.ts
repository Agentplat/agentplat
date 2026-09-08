import type { MeshAdmittedPeer } from "@agentplat/mesh";
import type {
  MeshDiscoveryState,
  MeshAssigneeAssignmentAuthorityProjection,
  MeshLeaseHeadProjection,
  MeshAssignmentFenceHeadProjection,
} from "@agentplat/mesh/coordination";
import type { A2AClientOptions } from "./client.js";
/** Read existing verified Mesh projections. This adapter cannot issue assignments or leases. */
export interface A2AMeshAuthorityReader {
  read(workItemId: string): Promise<
    | {
        admission: MeshAdmittedPeer;
        discovery: MeshDiscoveryState;
        assignment: MeshAssigneeAssignmentAuthorityProjection;
        lease: MeshLeaseHeadProjection;
        fence: MeshAssignmentFenceHeadProjection;
      }
    | undefined
  >;
}
/** Compose this gate with application policy when constructing the A2A client. */
export function createMeshA2AAuthorizer(options: {
  authority: A2AMeshAuthorityReader;
  policy: A2AClientOptions["authorize"];
  clock?: () => number;
}): A2AClientOptions["authorize"] {
  const read = options.authority.read.bind(options.authority),
    policy = options.policy,
    clock = options.clock ?? Date.now;
  return async (input) => {
    const binding = input.binding;
    if (
      !binding.workItemId ||
      !binding.peerId ||
      !binding.instanceId ||
      !binding.assignmentAuthorityId ||
      !binding.fencingToken
    )
      return false;
    const state = await read(binding.workItemId);
    if (!state) return false;
    const { admission, discovery, assignment, lease, fence } = state;
    const now = clock();
    if (
      !admission ||
      admission.peerId !== binding.peerId ||
      !admission.instanceIds.includes(binding.instanceId)
    )
      return false;
    if (input.operation === "send" && !(Date.parse(admission.validUntil) > now))
      return false;
    if (
      discovery.identity.tenantId !== input.principal.tenantId ||
      discovery.identity.peerId !== binding.peerId ||
      discovery.identity.instanceId !== binding.instanceId
    )
      return false;
    if (
      assignment.assigneePeerId !== binding.peerId ||
      assignment.workItemId !== binding.workItemId ||
      assignment.assignmentAuthorityId !== binding.assignmentAuthorityId ||
      assignment.fencingToken !== binding.fencingToken
    )
      return false;
    if (
      fence.assignmentAuthorityId !== assignment.assignmentAuthorityId ||
      fence.fencingToken !== assignment.fencingToken ||
      fence.assigneePeerId !== assignment.assigneePeerId ||
      fence.workItemId !== assignment.workItemId
    )
      return false;
    if (
      lease.assignmentAuthorityId !== assignment.assignmentAuthorityId ||
      lease.fencingToken !== assignment.fencingToken
    )
      return false;
    // Read/cancel can reconcile already-issued work after expiry; sends require a live fence.
    if (
      input.operation === "send" &&
      (fence.phase !== "active" ||
        lease.status !== "active" ||
        !(Date.parse(lease.currentLeaseExpiresAt) > now) ||
        !(Date.parse(assignment.workDeadline) > now))
    )
      return false;
    return policy(input);
  };
}
