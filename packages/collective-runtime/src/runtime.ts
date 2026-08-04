import type { JsonObject, JsonValue, Metadata } from '@agentplat/core';
import type {
  AgentRunInput,
  AgentRunResult,
  AgentRuntime,
} from '@agentplat/runtime';

import type {
  Collective,
  CollectiveAgentDescriptor,
  CollectiveAgentRegistration,
  CollectiveAttemptSnapshot,
  CollectiveEvent,
  CollectiveEventListener,
  CollectiveEventType,
  CollectiveExecutionSnapshot,
  CollectiveFailure,
  CollectiveObjective,
  CollectivePlan,
  CollectivePolicies,
  CollectivePolicyDecision,
  CollectivePolicyLimits,
  CollectiveResultPolicyContext,
  CollectiveRunOptions,
  CollectiveStateStore,
  CollectiveWorkItem,
  CollectiveWorkResult,
  CollectiveWorkSnapshot,
  CreateCollectiveOptions,
} from './contracts.js';
import { CollectiveRuntimeError } from './errors.js';
import { InMemoryCollectiveStateStore } from './store.js';
import {
  assertStoredSnapshot,
  cloneAndFreeze,
  compareAscii,
  jsonByteLength,
  normalizeAgentRegistration,
  normalizeJson,
  normalizeMetadata,
  normalizeObjective,
  normalizePlan,
  normalizePolicies,
  requiredIdentifier,
} from './validation.js';

interface RegisteredAgent {
  readonly registration: CollectiveAgentRegistration;
  readonly descriptor: CollectiveAgentDescriptor;
}

interface MutableAttempt {
  attemptId: string;
  attemptNumber: number;
  agentId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  failure?: CollectiveFailure;
}

interface MutableWork {
  workItem: CollectiveWorkItem;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  attempts: MutableAttempt[];
  result?: CollectiveWorkResult;
  failure?: CollectiveFailure;
  completedAt?: string;
}

interface MutableExecution {
  schemaVersion: 1;
  collectiveId: string;
  tenantId: string;
  executionId: string;
  objective: CollectiveObjective;
  plan: CollectivePlan;
  policyId: string;
  policyLimits: CollectivePolicyLimits;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'canceled';
  revision: number;
  workItems: MutableWork[];
  events: CollectiveEvent[];
  metadata?: Metadata;
  failure?: CollectiveFailure;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface EventInput {
  readonly type: CollectiveEventType;
  readonly payload: JsonObject;
}

interface ActiveExecution {
  readonly controller: AbortController;
  readonly completed: Promise<void>;
  readonly complete: () => void;
}

type AttemptOutcome =
  | {
      readonly kind: 'completed';
      readonly workItemId: string;
      readonly attemptId: string;
      readonly agent: CollectiveAgentDescriptor;
      readonly result: CollectiveWorkResult;
    }
  | {
      readonly kind: 'failed';
      readonly workItemId: string;
      readonly attemptId: string;
      readonly failure: CollectiveFailure;
    }
  | {
      readonly kind: 'paused';
      readonly workItemId: string;
      readonly attemptId: string;
    };

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled']);

/** Create a provider-neutral collective over an existing AgentRuntime. */
export function createCollective(options: CreateCollectiveOptions): Collective {
  return new DefaultCollective(options);
}

class DefaultCollective implements Collective {
  readonly collectiveId: string;
  readonly objective: CollectiveObjective;

  private readonly runtime: AgentRuntime;
  private readonly tenant: CreateCollectiveOptions['tenant'];
  private readonly plan?: CollectivePlan;
  private readonly planner?: CreateCollectiveOptions['planner'];
  private readonly policies: CollectivePolicies;
  private readonly limits: CollectivePolicyLimits;
  private readonly policyId: string;
  private readonly stateStore: CollectiveStateStore;
  private readonly credentials?: Record<string, string>;
  private readonly runtimePolicies?: JsonObject;
  private readonly idGenerator: () => string;
  private readonly clock: () => Date;
  private readonly agents = new Map<string, RegisteredAgent>();
  private readonly listeners = new Set<CollectiveEventListener>();
  private readonly activeExecutions = new Map<string, ActiveExecution>();

  constructor(options: CreateCollectiveOptions) {
    if (!options || typeof options !== 'object') {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        'collective options are required'
      );
    }
    this.collectiveId = requiredIdentifier(
      options.collectiveId,
      'collectiveId'
    );
    this.objective = normalizeObjective(options.objective);
    const tenantId = requiredIdentifier(
      options.tenant?.tenantId,
      'tenant.tenantId'
    );
    this.tenant = cloneAndFreeze({ ...options.tenant, tenantId });
    if ((options.plan === undefined) === (options.planner === undefined)) {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        'configure exactly one of plan or planner'
      );
    }
    const normalized = normalizePolicies(options.policies);
    this.policies = options.policies ?? {};
    this.limits = normalized.limits;
    this.policyId = normalized.policyId;
    this.plan =
      options.plan === undefined
        ? undefined
        : normalizePlan(options.plan, this.limits);
    this.planner = options.planner;
    if (!options.runtime || typeof options.runtime.run !== 'function') {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        'runtime.run is required'
      );
    }
    this.runtime = options.runtime;
    this.stateStore = options.stateStore ?? new InMemoryCollectiveStateStore();
    this.credentials = options.credentials
      ? Object.freeze({ ...options.credentials })
      : undefined;
    this.runtimePolicies =
      options.runtimePolicies === undefined
        ? undefined
        : (normalizeJson(
            options.runtimePolicies,
            'runtimePolicies'
          ) as JsonObject);
    this.idGenerator = options.idGenerator ?? defaultIdGenerator;
    this.clock = options.clock ?? (() => new Date());
  }

  register(registration: CollectiveAgentRegistration): Collective {
    const normalized = normalizeAgentRegistration(
      registration,
      this.tenant.tenantId
    );
    const agentId = normalized.descriptor.agentId;
    if (this.agents.has(agentId)) {
      throw new CollectiveRuntimeError(
        'CONFLICT',
        `agent "${agentId}" is already registered`
      );
    }
    if (this.runtime.hasProvider?.(normalized.descriptor.platform) === false) {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        `no runtime provider is registered for platform "${normalized.descriptor.platform}"`
      );
    }
    const safeRegistration = cloneAndFreeze({
      ...normalized.registration,
      agent: structuredClone(normalized.registration.agent),
    });
    this.agents.set(agentId, {
      registration: safeRegistration,
      descriptor: normalized.descriptor,
    });
    return this;
  }

  unregister(agentId: string): boolean {
    return this.agents.delete(requiredIdentifier(agentId, 'agentId'));
  }

  listAgents(): readonly CollectiveAgentDescriptor[] {
    return Object.freeze(
      [...this.agents.values()]
        .map(({ descriptor }) => cloneAndFreeze(descriptor))
        .sort((left, right) => compareAscii(left.agentId, right.agentId))
    );
  }

  subscribe(listener: CollectiveEventListener): () => void {
    if (typeof listener !== 'function') {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        'event listener must be a function'
      );
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async run(
    options: CollectiveRunOptions = {}
  ): Promise<CollectiveExecutionSnapshot> {
    const executionId = requiredIdentifier(
      options.executionId ?? `execution:${this.idGenerator()}`,
      'executionId'
    );
    return this.exclusive(executionId, async (operationSignal) => {
      if ((await this.stateStore.load(executionId)) !== undefined) {
        throw new CollectiveRuntimeError(
          'CONFLICT',
          `execution "${executionId}" already exists`
        );
      }
      const plan = await this.resolvePlan();
      const createdAt = this.now();
      const execution: MutableExecution = {
        schemaVersion: 1,
        collectiveId: this.collectiveId,
        tenantId: this.tenant.tenantId,
        executionId,
        objective: this.objective,
        plan,
        policyId: this.policyId,
        policyLimits: this.limits,
        status: 'running',
        revision: 0,
        workItems: plan.workItems.map((workItem) => ({
          workItem,
          status: 'pending',
          attempts: [],
        })),
        events: [],
        ...(options.metadata === undefined
          ? {}
          : { metadata: normalizeMetadata(options.metadata, 'run.metadata') }),
        createdAt,
        updatedAt: createdAt,
      };
      const started = this.appendEvent(execution, {
        type: 'execution.started',
        payload: {
          workItemCount: plan.workItems.length,
          maximumConcurrentWorkItems: this.limits.maximumConcurrentWorkItems,
          policyId: this.policyId,
        },
      });
      await this.stateStore.save(this.snapshot(execution), null);
      this.emit(started);
      return this.continueExecution(
        execution,
        combineSignals(operationSignal, options.signal)
      );
    });
  }

  async resume(
    executionId: string,
    options: Pick<CollectiveRunOptions, 'signal'> = {}
  ): Promise<CollectiveExecutionSnapshot> {
    const normalizedId = requiredIdentifier(executionId, 'executionId');
    return this.exclusive(normalizedId, async (operationSignal) => {
      const execution = await this.loadMutable(normalizedId);
      if (TERMINAL_STATUSES.has(execution.status))
        return this.snapshot(execution);
      execution.status = 'running';
      await this.commit(execution, [
        {
          type: 'execution.resumed',
          payload: { previousRevision: execution.revision },
        },
      ]);
      return this.continueExecution(
        execution,
        combineSignals(operationSignal, options.signal)
      );
    });
  }

  async cancel(executionId: string): Promise<CollectiveExecutionSnapshot> {
    const normalizedId = requiredIdentifier(executionId, 'executionId');
    const active = this.activeExecutions.get(normalizedId);
    if (active) {
      active.controller.abort();
      await active.completed;
    }
    return this.exclusive(normalizedId, async () => {
      const execution = await this.loadMutable(normalizedId);
      if (TERMINAL_STATUSES.has(execution.status))
        return this.snapshot(execution);
      const now = this.now();
      for (const work of execution.workItems) {
        if (work.status === 'pending' || work.status === 'running') {
          work.status = 'canceled';
          const attempt = work.attempts.at(-1);
          if (attempt?.status === 'running') {
            attempt.status = 'failed';
            attempt.completedAt = now;
            attempt.failure = failure(
              'execution_canceled',
              'Execution was canceled'
            );
          }
        }
      }
      execution.status = 'canceled';
      execution.completedAt = now;
      await this.commit(execution, [
        { type: 'execution.canceled', payload: {} },
      ]);
      return this.snapshot(execution);
    });
  }

  async getExecution(
    executionId: string
  ): Promise<CollectiveExecutionSnapshot | undefined> {
    const normalizedId = requiredIdentifier(executionId, 'executionId');
    const snapshot = await this.stateStore.load(normalizedId);
    if (snapshot === undefined) return undefined;
    this.assertBinding(snapshot, normalizedId);
    return cloneAndFreeze(snapshot);
  }

  private async resolvePlan(): Promise<CollectivePlan> {
    if (this.plan) return this.plan;
    const planned = await this.planner!({
      collectiveId: this.collectiveId,
      tenant: this.tenant,
      objective: this.objective,
      agents: this.listAgents(),
    });
    return normalizePlan(planned, this.limits);
  }

  private async continueExecution(
    execution: MutableExecution,
    signal?: AbortSignal
  ): Promise<CollectiveExecutionSnapshot> {
    while (execution.status === 'running') {
      if (signal?.aborted) return this.pause(execution);

      const running = execution.workItems.filter(
        ({ status }) => status === 'running'
      );
      if (running.length > 0) {
        const outcomes = await Promise.all(
          running
            .slice(0, execution.policyLimits.maximumConcurrentWorkItems)
            .map((work) => this.executeAttempt(execution, work, signal))
        );
        for (const outcome of outcomes.sort(outcomeOrder)) {
          if (outcome.kind === 'paused') return this.pause(execution);
          await this.applyOutcome(execution, outcome);
        }
        continue;
      }

      const failed = execution.workItems.filter(
        ({ status }) => status === 'failed'
      );
      if (failed.length > 0) return this.failExecution(execution, failed);

      if (execution.workItems.every(({ status }) => status === 'completed')) {
        execution.status = 'completed';
        execution.completedAt = this.now();
        await this.commit(execution, [
          {
            type: 'execution.completed',
            payload: { workItemCount: execution.workItems.length },
          },
        ]);
        return this.snapshot(execution);
      }

      const ready = execution.workItems
        .filter(
          (work) =>
            work.status === 'pending' &&
            (work.workItem.dependsOn ?? []).every(
              (dependencyId) =>
                this.workById(execution, dependencyId).status === 'completed'
            )
        )
        .sort(workOrder)
        .slice(0, execution.policyLimits.maximumConcurrentWorkItems);

      if (ready.length === 0) {
        const blocked = execution.workItems
          .filter(({ status }) => status === 'pending')
          .sort(workOrder)[0];
        if (!blocked) {
          throw new CollectiveRuntimeError(
            'STATE_INVALID',
            'execution has no terminal, running or pending work'
          );
        }
        await this.failWork(
          execution,
          blocked,
          failure(
            'dependency_deadlock',
            'Work dependencies cannot make progress'
          )
        );
        continue;
      }

      for (const work of ready) {
        const agent = await this.selectAgent(execution, work);
        if (!agent) {
          await this.failWork(
            execution,
            work,
            failure(
              'no_eligible_agent',
              'No registered agent satisfies capabilities, role and policy'
            )
          );
          break;
        }
        await this.startAttempt(execution, work, agent.descriptor);
      }
    }
    return this.snapshot(execution);
  }

  private async selectAgent(
    execution: MutableExecution,
    work: MutableWork
  ): Promise<RegisteredAgent | undefined> {
    const triedAgents = new Set(
      work.attempts
        .filter(({ status }) => status === 'failed')
        .map(({ agentId }) => agentId)
    );
    const candidates = [...this.agents.values()]
      .filter(({ descriptor }) => {
        if (triedAgents.has(descriptor.agentId)) return false;
        if (
          !work.workItem.requiredCapabilityKeys.every((capability) =>
            descriptor.capabilityKeys.includes(capability)
          )
        ) {
          return false;
        }
        return (
          work.workItem.roleKey === undefined ||
          descriptor.roleKeys.includes(work.workItem.roleKey)
        );
      })
      .sort((left, right) => {
        const loadDifference =
          this.assignmentLoad(execution, left.descriptor.agentId) -
          this.assignmentLoad(execution, right.descriptor.agentId);
        if (loadDifference !== 0) return loadDifference;
        const priorityDifference =
          right.descriptor.priority - left.descriptor.priority;
        return priorityDifference === 0
          ? compareAscii(left.descriptor.agentId, right.descriptor.agentId)
          : priorityDifference;
      });

    for (const candidate of candidates) {
      if (!this.policies.authorizeAssignment) return candidate;
      const decision = await failClosedPolicy(() =>
        this.policies.authorizeAssignment!({
          collectiveId: this.collectiveId,
          executionId: execution.executionId,
          objective: execution.objective,
          workItem: work.workItem,
          agent: candidate.descriptor,
          attemptNumber: work.attempts.length + 1,
          dependencyResults: this.dependencyResults(execution, work.workItem),
        })
      );
      if (decision.allow) return candidate;
    }
    return undefined;
  }

  private async startAttempt(
    execution: MutableExecution,
    work: MutableWork,
    agent: CollectiveAgentDescriptor
  ): Promise<void> {
    const attemptNumber = work.attempts.length + 1;
    const attemptId = `${execution.executionId}:work:${work.workItem.workItemId}:attempt:${attemptNumber}`;
    work.status = 'running';
    work.attempts.push({
      attemptId,
      attemptNumber,
      agentId: agent.agentId,
      status: 'running',
      startedAt: this.now(),
    });
    await this.commit(execution, [
      {
        type: 'work.assigned',
        payload: {
          workItemId: work.workItem.workItemId,
          agentId: agent.agentId,
          attemptId,
          attemptNumber,
        },
      },
    ]);
  }

  private async executeAttempt(
    execution: MutableExecution,
    work: MutableWork,
    signal?: AbortSignal
  ): Promise<AttemptOutcome> {
    const attempt = work.attempts.at(-1)!;
    if (signal?.aborted) {
      return {
        kind: 'paused',
        workItemId: work.workItem.workItemId,
        attemptId: attempt.attemptId,
      };
    }
    const registered = this.agents.get(attempt.agentId);
    if (!registered) {
      return {
        kind: 'failed',
        workItemId: work.workItem.workItemId,
        attemptId: attempt.attemptId,
        failure: failure(
          'agent_unavailable',
          `Assigned agent "${attempt.agentId}" is no longer registered`
        ),
      };
    }
    try {
      const raw = await this.runtime.run(
        registered.registration.agent,
        this.agentInput(execution, work, attempt),
        {
          tenant: this.tenant,
          runId: attempt.attemptId,
          agentId: registered.descriptor.agentId,
          ...(signal === undefined ? {} : { signal }),
          ...(this.credentials === undefined
            ? {}
            : { credentials: this.credentials }),
          ...(this.runtimePolicies === undefined
            ? {}
            : { policies: this.runtimePolicies }),
          metadata: {
            collectiveId: this.collectiveId,
            objectiveId: execution.objective.objectiveId,
            executionId: execution.executionId,
            workItemId: work.workItem.workItemId,
            attemptNumber: attempt.attemptNumber,
          },
        }
      );
      if (signal?.aborted) {
        return {
          kind: 'paused',
          workItemId: work.workItem.workItemId,
          attemptId: attempt.attemptId,
        };
      }
      const normalized = this.normalizeResult(raw, execution.policyLimits);
      if ('failure' in normalized) {
        return {
          kind: 'failed',
          workItemId: work.workItem.workItemId,
          attemptId: attempt.attemptId,
          failure: normalized.failure,
        };
      }
      if (this.policies.authorizeResult) {
        const context: CollectiveResultPolicyContext = {
          collectiveId: this.collectiveId,
          executionId: execution.executionId,
          objective: execution.objective,
          workItem: work.workItem,
          agent: registered.descriptor,
          attemptNumber: attempt.attemptNumber,
          result: normalized.result,
        };
        const decision = await failClosedPolicy(() =>
          this.policies.authorizeResult!(context)
        );
        if (!decision.allow) {
          return {
            kind: 'failed',
            workItemId: work.workItem.workItemId,
            attemptId: attempt.attemptId,
            failure: failure(
              'result_policy_denied',
              decision.reason ?? 'Result policy denied acceptance'
            ),
          };
        }
      }
      return {
        kind: 'completed',
        workItemId: work.workItem.workItemId,
        attemptId: attempt.attemptId,
        agent: registered.descriptor,
        result: normalized.result,
      };
    } catch (error) {
      if (signal?.aborted) {
        return {
          kind: 'paused',
          workItemId: work.workItem.workItemId,
          attemptId: attempt.attemptId,
        };
      }
      return {
        kind: 'failed',
        workItemId: work.workItem.workItemId,
        attemptId: attempt.attemptId,
        failure: failure(
          'agent_runtime_error',
          safeMessage(error, 'Agent runtime failed')
        ),
      };
    }
  }

  private async applyOutcome(
    execution: MutableExecution,
    outcome: Exclude<AttemptOutcome, { kind: 'paused' }>
  ): Promise<void> {
    const work = this.workById(execution, outcome.workItemId);
    const attempt = work.attempts.at(-1);
    if (
      work.status !== 'running' ||
      !attempt ||
      attempt.status !== 'running' ||
      attempt.attemptId !== outcome.attemptId
    ) {
      throw new CollectiveRuntimeError(
        'STATE_INVALID',
        'attempt outcome does not match active work'
      );
    }
    const completedAt = this.now();
    attempt.completedAt = completedAt;
    if (outcome.kind === 'completed') {
      attempt.status = 'completed';
      work.status = 'completed';
      work.result = outcome.result;
      work.completedAt = completedAt;
      await this.commit(execution, [
        {
          type: 'work.completed',
          payload: {
            workItemId: work.workItem.workItemId,
            agentId: outcome.agent.agentId,
            attemptId: outcome.attemptId,
          },
        },
      ]);
      return;
    }
    attempt.status = 'failed';
    attempt.failure = outcome.failure;
    const events: EventInput[] = [
      {
        type: 'work.attempt_failed',
        payload: {
          workItemId: work.workItem.workItemId,
          agentId: attempt.agentId,
          attemptId: attempt.attemptId,
          failureCode: outcome.failure.code,
        },
      },
    ];
    if (
      work.attempts.length < execution.policyLimits.maximumAttemptsPerWorkItem
    ) {
      work.status = 'pending';
      events.push({
        type: 'work.replanned',
        payload: {
          workItemId: work.workItem.workItemId,
          previousAgentId: attempt.agentId,
          nextAttemptNumber: work.attempts.length + 1,
        },
      });
    } else {
      work.status = 'failed';
      work.failure = outcome.failure;
      events.push({
        type: 'work.failed',
        payload: {
          workItemId: work.workItem.workItemId,
          failureCode: outcome.failure.code,
        },
      });
    }
    await this.commit(execution, events);
  }

  private async failWork(
    execution: MutableExecution,
    work: MutableWork,
    workFailure: CollectiveFailure
  ): Promise<void> {
    work.status = 'failed';
    work.failure = workFailure;
    await this.commit(execution, [
      {
        type: 'work.failed',
        payload: {
          workItemId: work.workItem.workItemId,
          failureCode: workFailure.code,
        },
      },
    ]);
  }

  private async failExecution(
    execution: MutableExecution,
    failedWork: readonly MutableWork[]
  ): Promise<CollectiveExecutionSnapshot> {
    const completedAt = this.now();
    for (const work of execution.workItems) {
      if (work.status === 'pending') work.status = 'canceled';
    }
    execution.status = 'failed';
    execution.completedAt = completedAt;
    execution.failure = failure(
      'work_failed',
      `${failedWork.length} work item(s) failed`
    );
    await this.commit(execution, [
      {
        type: 'execution.failed',
        payload: {
          failedWorkItemIds: failedWork.map(
            ({ workItem }) => workItem.workItemId
          ),
        },
      },
    ]);
    return this.snapshot(execution);
  }

  private async pause(
    execution: MutableExecution
  ): Promise<CollectiveExecutionSnapshot> {
    if (execution.status !== 'paused') {
      execution.status = 'paused';
      await this.commit(execution, [
        {
          type: 'execution.paused',
          payload: {
            runningWorkItemIds: execution.workItems
              .filter(({ status }) => status === 'running')
              .map(({ workItem }) => workItem.workItemId),
          },
        },
      ]);
    }
    return this.snapshot(execution);
  }

  private agentInput(
    execution: MutableExecution,
    work: MutableWork,
    attempt: MutableAttempt
  ): AgentRunInput {
    const dependencies = Object.entries(
      this.dependencyResults(execution, work.workItem)
    ).map(([workItemId, result]) => ({
      workItemId,
      result: result as unknown as JsonObject,
    }));
    const input: JsonObject[] = [
      {
        kind: 'collective.objective',
        objectiveId: execution.objective.objectiveId,
        summary: execution.objective.summary,
        input: execution.objective.input ?? null,
        successCriteria: [...(execution.objective.successCriteria ?? [])],
      },
      {
        kind: 'collective.work',
        workItemId: work.workItem.workItemId,
        summary: work.workItem.summary,
        requiredCapabilityKeys: [...work.workItem.requiredCapabilityKeys],
        roleKey: work.workItem.roleKey ?? null,
        input: work.workItem.input ?? null,
      },
      {
        kind: 'collective.dependencies',
        results: dependencies,
      },
    ];
    return {
      input,
      mode: 'invoke',
      metadata: {
        collectiveId: this.collectiveId,
        objectiveId: execution.objective.objectiveId,
        executionId: execution.executionId,
        workItemId: work.workItem.workItemId,
        attemptId: attempt.attemptId,
        attemptNumber: attempt.attemptNumber,
      },
    };
  }

  private normalizeResult(
    raw: AgentRunResult,
    limits: CollectivePolicyLimits
  ):
    | { readonly result: CollectiveWorkResult }
    | { readonly failure: CollectiveFailure } {
    if (raw.status !== 'completed') {
      return {
        failure: failure(
          'agent_run_failed',
          raw.errorMessage ?? `Agent run ended with status "${raw.status}"`
        ),
      };
    }
    const normalized: CollectiveWorkResult = cloneAndFreeze({
      ...(raw.output === undefined ? {} : { output: raw.output }),
      ...(raw.result === undefined
        ? {}
        : { result: normalizeJson(raw.result, 'agent.result') as JsonObject }),
      ...(raw.metadata === undefined
        ? {}
        : { metadata: normalizeMetadata(raw.metadata, 'agent.metadata') }),
    });
    if (
      jsonByteLength(normalized as unknown as JsonValue) >
      limits.maximumResultBytes
    ) {
      return {
        failure: failure(
          'result_too_large',
          'Agent result exceeds policies.maximumResultBytes'
        ),
      };
    }
    return { result: normalized };
  }

  private dependencyResults(
    execution: MutableExecution,
    workItem: CollectiveWorkItem
  ): Readonly<Record<string, CollectiveWorkResult>> {
    const entries = (workItem.dependsOn ?? []).map((dependencyId) => {
      const dependency = this.workById(execution, dependencyId);
      if (
        dependency.status !== 'completed' ||
        dependency.result === undefined
      ) {
        throw new CollectiveRuntimeError(
          'STATE_INVALID',
          `dependency "${dependencyId}" is not complete`
        );
      }
      return [dependencyId, dependency.result] as const;
    });
    return cloneAndFreeze(Object.fromEntries(entries));
  }

  private assignmentLoad(execution: MutableExecution, agentId: string): number {
    return execution.workItems.reduce(
      (total, work) =>
        total +
        work.attempts.filter((attempt) => attempt.agentId === agentId).length,
      0
    );
  }

  private workById(
    execution: MutableExecution,
    workItemId: string
  ): MutableWork {
    const work = execution.workItems.find(
      (candidate) => candidate.workItem.workItemId === workItemId
    );
    if (!work) {
      throw new CollectiveRuntimeError(
        'STATE_INVALID',
        `work item "${workItemId}" is missing from execution`
      );
    }
    return work;
  }

  private async loadMutable(executionId: string): Promise<MutableExecution> {
    const snapshot = await this.stateStore.load(executionId);
    if (snapshot === undefined) {
      throw new CollectiveRuntimeError(
        'NOT_FOUND',
        `execution "${executionId}" was not found`
      );
    }
    this.assertBinding(snapshot, executionId);
    return structuredClone(snapshot) as MutableExecution;
  }

  private assertBinding(
    snapshot: CollectiveExecutionSnapshot,
    executionId: string
  ): void {
    assertStoredSnapshot(snapshot, {
      collectiveId: this.collectiveId,
      tenantId: this.tenant.tenantId,
      objectiveId: this.objective.objectiveId,
      policyId: this.policyId,
      executionId,
    });
  }

  private async commit(
    execution: MutableExecution,
    eventInputs: readonly EventInput[]
  ): Promise<void> {
    const expectedRevision = execution.revision;
    const events = eventInputs.map((input) =>
      this.appendEvent(execution, input)
    );
    execution.revision += 1;
    execution.updatedAt = this.now();
    await this.stateStore.save(this.snapshot(execution), expectedRevision);
    for (const event of events) this.emit(event);
  }

  private appendEvent(
    execution: MutableExecution,
    input: EventInput
  ): CollectiveEvent {
    const payload = normalizeJson(
      input.payload,
      `event.${input.type}.payload`
    ) as JsonObject;
    const event: CollectiveEvent = cloneAndFreeze({
      schemaVersion: 1,
      sequence: execution.events.length + 1,
      type: input.type,
      collectiveId: execution.collectiveId,
      executionId: execution.executionId,
      objectiveId: execution.objective.objectiveId,
      occurredAt: this.now(),
      payload,
    });
    execution.events.push(event);
    return event;
  }

  private emit(event: CollectiveEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Observability callbacks cannot mutate or fail execution state.
      }
    }
  }

  private snapshot(execution: MutableExecution): CollectiveExecutionSnapshot {
    return cloneAndFreeze(execution) as CollectiveExecutionSnapshot;
  }

  private now(): string {
    const value = this.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        'clock must return a valid Date'
      );
    }
    return value.toISOString();
  }

  private async exclusive<T>(
    executionId: string,
    operation: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    if (this.activeExecutions.has(executionId)) {
      throw new CollectiveRuntimeError(
        'EXECUTION_ACTIVE',
        `execution "${executionId}" is already active in this runtime`
      );
    }
    const controller = new AbortController();
    let complete!: () => void;
    const completed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const active = { controller, completed, complete };
    this.activeExecutions.set(executionId, active);
    try {
      return await operation(controller.signal);
    } finally {
      if (this.activeExecutions.get(executionId) === active) {
        this.activeExecutions.delete(executionId);
      }
      complete();
    }
  }
}

async function failClosedPolicy(
  evaluate: () => CollectivePolicyDecision | Promise<CollectivePolicyDecision>
): Promise<CollectivePolicyDecision> {
  try {
    const decision = await evaluate();
    if (
      !decision ||
      typeof decision !== 'object' ||
      typeof decision.allow !== 'boolean' ||
      (decision.reason !== undefined && typeof decision.reason !== 'string')
    ) {
      return Object.freeze({ allow: false, reason: 'policy_decision_invalid' });
    }
    return Object.freeze({
      allow: decision.allow,
      ...(decision.reason === undefined
        ? {}
        : { reason: decision.reason.slice(0, 1_024) }),
    });
  } catch {
    return Object.freeze({ allow: false, reason: 'policy_exception' });
  }
}

function failure(code: string, message: string): CollectiveFailure {
  const normalizedMessage = message.trim();
  return Object.freeze({
    code,
    message: (normalizedMessage || 'Execution failed').slice(0, 1_024),
  });
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function defaultIdGenerator(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      'idGenerator is required when crypto.randomUUID is unavailable'
    );
  }
  return globalThis.crypto.randomUUID();
}

function workOrder(left: MutableWork, right: MutableWork): number {
  return compareAscii(left.workItem.workItemId, right.workItem.workItemId);
}

function outcomeOrder(left: AttemptOutcome, right: AttemptOutcome): number {
  return compareAscii(left.workItemId, right.workItemId);
}

function combineSignals(
  operationSignal: AbortSignal,
  callerSignal?: AbortSignal
): AbortSignal {
  if (callerSignal === undefined) return operationSignal;
  return AbortSignal.any([operationSignal, callerSignal]);
}
