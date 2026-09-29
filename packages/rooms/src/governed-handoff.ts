import { AgentPlatError } from "@agentplat/core";
import {
  governanceDigestV1,
  type AgentGovernanceStoreV1,
} from "./agent-governance.js";
import type { AgentContinuityEvidencePortV1 } from "./agent-continuity.js";
import type {
  AgentExecutionStoreV1,
  AgentExecutionControllerV1,
} from "./agent-execution.js";
import type { RoomHandoffStore, RoomHandoff } from "./room-handoff.js";
import type { RoomService } from "./service.js";
import type { AgentDefinitionRegistry } from "./agent-registry.js";
import type { PurposeRoomInputPortV1 } from "./coordination-execution.js";

/** Qualified revision selection for native Handoff intake; never execution authorization. */
export function createGovernedHandoffRevisionResolverV1(
  definitions: Pick<AgentDefinitionRegistry, "getRevision">,
  governance: Pick<AgentGovernanceStoreV1, "load">,
) {
  return {
    async resolvePublishedRevision(tenantId: string, revisionId: string) {
      const r = await definitions.getRevision(tenantId, revisionId),
        h = await governance.load(tenantId, r.definition.agentId);
      if (
        r.lifecycle.status !== "published" ||
        !h ||
        h.configuration.definitionRevisionId !== revisionId
      )
        deny();
      return r.definition;
    },
  };
}
/** Trusted source proof reads canonical Room/Handoff/task records and current source control. */
export function createRoomHandoffContinuityEvidenceV1(options: {
  handoffs: Pick<RoomHandoffStore, "load">;
  rooms: Pick<RoomService, "getRoomState">;
  execution: Pick<AgentExecutionStoreV1, "taskBinding">;
  sourceController(agentId: string): AgentExecutionControllerV1;
  align: AgentContinuityEvidencePortV1["verify"];
}): AgentContinuityEvidencePortV1 {
  return {
    async verify(input) {
      if (input.kind !== "handoff") deny();
      // An opaque reference is a JSON tuple, not an input certificate.
      let ref: unknown;
      try {
        ref = JSON.parse(input.reference);
      } catch {
        deny();
      }
      if (
        !Array.isArray(ref) ||
        ref.length !== 2 ||
        ref.some((x) => typeof x !== "string")
      )
        deny();
      const [roomId, handoffId] = ref as [string, string],
        t = input.parent.tenantId,
        h = await options.handoffs.load(t, roomId, handoffId);
      if (
        !h ||
        !["proposed", "accepted"].includes(h.status) ||
        h.sourceAgentRevisionId !==
          input.parent.configuration.definitionRevisionId ||
        h.targetAgentRevisionId !==
          input.child.configuration.definitionRevisionId
      )
        deny();
      const room = await options.rooms.getRoomState(t, roomId),
        run = room.runs.find(
          (r) =>
            r.id === h.sourceRunId &&
            r.taskId === h.sourceTaskId &&
            r.participantId === h.sourceParticipantId,
        ),
        task = room.tasks.find((x) => x.id === h.sourceTaskId),
        binding = await options.execution.taskBinding(
          t,
          roomId,
          h.sourceTaskId,
        );
      const source = room.participants.find(
          (p) => p.id === h.sourceParticipantId,
        ),
        target = room.participants.find((p) => p.id === h.targetParticipantId);
      if (
        !source ||
        !target ||
        (source.metadata?.agentId ?? source.id) !== input.parent.agentId ||
        (target.metadata?.agentId ?? target.id) !== input.child.agentId ||
        !run ||
        run.status !== "running" ||
        !task ||
        !binding ||
        binding.binding.agentId !== input.parent.agentId ||
        target.authorityLevel > h.authorityCeiling ||
        h.authorityCeiling > source.authorityLevel
      )
        deny();
      await options
        .sourceController(input.parent.agentId)
        .assertCurrent(binding.binding);
      const judgment = await options.align(input);
      const inceptionMessageId = await handoffInceptionMessageIdV1(h);
      return {
        ...judgment,
        permittedTools: [...task.toolIds],
        parentWork: binding.binding.purposeWork,
        delegation: {
          roomId,
          handoffId,
          sourceRunId: h.sourceRunId,
          sourceTaskId: h.sourceTaskId,
          targetParticipantId: h.targetParticipantId,
          inceptionMessageId,
          inceptionContentDigest: await handoffInceptionContentDigestV1(h),
        },
        evidenceDigest: await governanceDigestV1({
          domain: "agent-handoff-continuity-v1",
          handoff: JSON.parse(JSON.stringify(h)),
          sourceBinding: JSON.parse(JSON.stringify(binding)),
        }),
      };
    },
  };
}
/** A received purpose Handoff creates a durable message/inception only. */
export function withPurposeHandoffIntakeV1(
  base: PurposeRoomInputPortV1,
  options: {
    rooms: Pick<RoomService, "getRoomState" | "sendMessage">;
    handoffs: Pick<RoomHandoffStore, "load">;
  },
): PurposeRoomInputPortV1 {
  return {
    ...base,
    async submitHandoff(input) {
      const h = await options.handoffs.load(
        input.tenantId,
        input.roomId,
        input.handoffId,
      );
      if (!h || h.status !== "accepted") deny();
      const state = await options.rooms.getRoomState(
          input.tenantId,
          input.roomId,
        ),
        target = state.participants.find((p) => p.id === h.targetParticipantId);
      if (!target || (target.metadata?.agentId ?? target.id) !== input.agentId)
        deny();
      const id = await handoffInceptionMessageIdV1(h),
        content = handoffInceptionContentV1(h);
      let existing = state.messages.find((m) => m.id === id);
      if (!existing) {
        try {
          existing = await options.rooms.sendMessage(
            input.tenantId,
            input.roomId,
            {
              id,
              role: "agent",
              authorParticipantId: h.sourceParticipantId,
              content,
              metadata: { handoffId: h.handoffId, sourceRunId: h.sourceRunId },
            },
          );
        } catch (error) {
          existing = (
            await options.rooms.getRoomState(input.tenantId, input.roomId)
          ).messages.find((m) => m.id === id);
          if (!existing) throw error;
        }
      }
      if (
        existing.content !== content ||
        existing.authorParticipantId !== h.sourceParticipantId ||
        existing.metadata?.handoffId !== h.handoffId
      )
        deny();
      await base.submit({
        tenantId: input.tenantId,
        agentId: input.agentId,
        roomId: input.roomId,
        messageId: id,
      });
    },
  };
}
export function handoffInceptionMessageIdV1(
  h: Pick<RoomHandoff, "tenantId" | "roomId" | "handoffId">,
) {
  return governanceDigestV1({
    domain: "agent-handoff-inception-v1",
    tenantId: h.tenantId,
    roomId: h.roomId,
    handoffId: h.handoffId,
  });
}
function deny(): never {
  throw new AgentPlatError(
    "FORBIDDEN",
    "Governed Handoff source or target is unavailable",
  );
}

export function handoffInceptionContentV1(h: RoomHandoff) {
  return JSON.stringify({
    instruction: h.instruction,
    contextMessageIds: h.contextMessageIds,
    contextArtifactIds: h.contextArtifactIds,
    authorityCeiling: h.authorityCeiling,
  });
}
export function handoffInceptionContentDigestV1(h: RoomHandoff) {
  return governanceDigestV1({
    domain: "agent-handoff-content-v1",
    content: handoffInceptionContentV1(h),
  });
}
