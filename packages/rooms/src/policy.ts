import { AgentPlatError } from '@agentplat/core';
import type { ActionLevel, Participant, Policy, RoomTask } from './models.js';

export interface PolicyDecision {
  allowed: boolean;
  approvalRequired: boolean;
  reason: string;
}

const privilegedLevels = new Set<ActionLevel>(['external_write']);

export class BasicPolicyEngine {
  evaluateTask(
    task: Pick<RoomTask, 'actionLevel' | 'toolIds' | 'approvalRequired'>,
    participant: Participant,
    policies: Policy[]
  ): PolicyDecision {
    const action = `task.run.${task.actionLevel}`;
    if (
      participant.boundaries.includes(action) ||
      participant.boundaries.includes('task.run') ||
      policies.some(
        (policy) =>
          policy.deniedActions.includes(action) ||
          policy.deniedActions.includes('task.run')
      )
    ) {
      return {
        allowed: false,
        approvalRequired: false,
        reason: `${action} is denied`,
      };
    }

    const toolsAllowed = task.toolIds.every(
      (toolId) =>
        participant.permissions.includes('*') ||
        participant.permissions.includes(`tool:${toolId}`) ||
        policies.some(
          (policy) =>
            policy.toolPermissions.includes('*') ||
            policy.toolPermissions.includes(toolId)
        )
    );
    if (!toolsAllowed) {
      return {
        allowed: false,
        approvalRequired: false,
        reason: 'One or more tools are not permitted',
      };
    }

    const explicitlyAllowed =
      participant.permissions.includes('*') ||
      participant.permissions.includes(action) ||
      participant.permissions.includes('task.run') ||
      policies.some(
        (policy) =>
          policy.allowedActions.includes(action) ||
          policy.allowedActions.includes('task.run')
      );
    const approvalRequired =
      task.approvalRequired ||
      policies.some(
        (policy) =>
          policy.requiredApprovals.includes(action) ||
          policy.requiredApprovals.includes('task.run')
      );

    if (privilegedLevels.has(task.actionLevel) && !explicitlyAllowed) {
      return {
        allowed: false,
        approvalRequired,
        reason: `${action} requires an explicit allow policy`,
      };
    }
    const platform = participant.runtime?.platform.trim().toLowerCase();
    if (
      platform &&
      !['mock', 'local'].includes(platform) &&
      !explicitlyAllowed
    ) {
      return {
        allowed: false,
        approvalRequired,
        reason: `Runtime \"${participant.runtime?.platform}\" requires an explicit allow policy`,
      };
    }
    return {
      allowed: true,
      approvalRequired,
      reason: 'Allowed by the basic policy',
    };
  }

  assertTaskAllowed(
    task: RoomTask,
    participant: Participant,
    policies: Policy[]
  ): void {
    const decision = this.evaluateTask(task, participant, policies);
    if (!decision.allowed) {
      throw new AgentPlatError('FORBIDDEN', decision.reason, {
        statusCode: 403,
      });
    }
    if (decision.approvalRequired) {
      throw new AgentPlatError(
        'FORBIDDEN',
        'Task execution requires a granted approval',
        { statusCode: 403 }
      );
    }
  }
}
