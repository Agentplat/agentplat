import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import {
  activateTeamTopologyTransformationV1,
  certifyTeamTopologyTransformationV1,
  type TeamTopologyStateV1,
  type TeamTopologyTransformationRequestV1,
} from "@agentplat/collective-runtime/team-topology-transformation";
import {
  createMorphogenesisOperatorStepReceiptV2,
  type MorphogenesisOperatorBoundaryPortV2,
  type MorphogenesisOperatorStepResolutionV2,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  type GovernedMissionLifecycleRuntimeV1,
} from "@agentplat/collective-runtime/mission-lifecycle";
import type {
  GovernedMissionRequestV1,
  GovernedMissionStateV1,
} from "@agentplat/collective-runtime/mission-lifecycle";

export class MorphogenesisOperatorBoundaryRouterV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  readonly #ports = new Map<
    string,
    MorphogenesisOperatorBoundaryPortV2
  >();
  constructor(
    registrations: readonly {
      readonly boundaries: readonly string[];
      readonly port: MorphogenesisOperatorBoundaryPortV2;
    }[],
  ) {
    for (const registration of registrations) {
      if (!registration.port) throw new TypeError("Morphogenesis boundary port is required");
      for (const boundary of registration.boundaries) {
        if (this.#ports.has(boundary))
          throw new TypeError("Morphogenesis boundary is registered more than once");
        this.#ports.set(boundary, registration.port);
      }
    }
  }
  execute(input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0]) {
    return this.#resolve(input.step.boundary).execute(input);
  }
  reconcile(input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0]) {
    return this.#resolve(input.step.boundary).reconcile(input);
  }
  #resolve(boundary: string) {
    const port = this.#ports.get(boundary);
    if (!port) throw new TypeError("Morphogenesis execution boundary is unavailable");
    return port;
  }
}

export interface MorphogenesisMissionWorkResolutionPortV2 {
  resolveMission(commandDigest: PlanningDigestV1): Promise<{
    readonly runtime: GovernedMissionLifecycleRuntimeV1;
    readonly request: GovernedMissionRequestV1;
    readonly morphogenesisAuthorizationDigest: PlanningDigestV1;
    readonly authorityFenceDigest: PlanningDigestV1;
  } | null>;
  resolveWorkReceipt(workContractDigest: PlanningDigestV1): Promise<{
    readonly commandDigest: PlanningDigestV1;
    readonly missionResultDigest: PlanningDigestV1;
    readonly workContractDigest: PlanningDigestV1;
    readonly workReceiptDigest: PlanningDigestV1;
    readonly issuedAtLogicalMs: number;
  } | null>;
}

/** Adapter that observes the nominal Mission Lifecycle outbox; it issues no Work authority itself. */
export class MissionWorkReassignmentMorphogenesisBoundaryV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  constructor(
    readonly resolution: MorphogenesisMissionWorkResolutionPortV2,
  ) {}
  execute(input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0]) {
    return this.#run(input, false);
  }
  reconcile(input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0]) {
    return this.#run(input, true);
  }
  async #run(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
    recover: boolean,
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    if (input.step.boundary !== "mission_work_reassignment")
      throw new TypeError("Morphogenesis Mission Work boundary is invalid");
    if (input.step.operation === "enact_work_reassignment") {
      const resolved = await this.resolution.resolveMission(
        input.step.targetDigest,
      );
      if (!resolved) return { status: "not_applied" };
      if (
        resolved.morphogenesisAuthorizationDigest !== input.authorizationDigest ||
        resolved.authorityFenceDigest !== input.authorityFenceDigest
      ) throw new TypeError("Morphogenesis Mission Work authority binding is invalid");
      const state = recover
        ? await resolved.runtime.recover(resolved.request)
        : await resolved.runtime.advance(resolved.request);
      const outbox = appliedWorkReassignment(
        state,
        input.step.targetDigest,
      );
      if (!outbox) return { status: "not_applied" };
      return appliedReceipt(
        input,
        outbox.resultDigest!,
        resolved.request.logicalTimeMs,
      );
    }
    if (input.step.operation !== "issue_successor_work_contract")
      throw new TypeError("Morphogenesis Mission Work operation is invalid");
    const receipt = await this.resolution.resolveWorkReceipt(
      input.step.targetDigest,
    );
    if (!receipt) return { status: "not_applied" };
    if (receipt.workContractDigest !== input.step.targetDigest)
      throw new TypeError("Morphogenesis successor Work receipt is substituted");
    return appliedReceipt(
      input,
      receipt.workReceiptDigest,
      receipt.issuedAtLogicalMs,
    );
  }
}

function appliedWorkReassignment(
  state: GovernedMissionStateV1,
  commandDigest: PlanningDigestV1,
) {
  return state.outbox.find(
    (entry) =>
      entry.action === "enact_work_reassignment" &&
      entry.status === "applied" &&
      entry.resultDigest !== null &&
      (entry.controlProposalDigest === commandDigest ||
        entry.intentDigest === commandDigest),
  );
}

function appliedReceipt(
  input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
  resultDigest: PlanningDigestV1,
  appliedAtLogicalMs: number,
): MorphogenesisOperatorStepResolutionV2 {
  return {
    status: "applied",
    receipt: createMorphogenesisOperatorStepReceiptV2({
      operationId: input.operationId,
      planDigest: input.plan.planDigest,
      stepId: input.step.stepId,
      stepDigest: input.step.stepDigest,
      boundary: input.step.boundary,
      resultDigest,
      appliedAtLogicalMs,
    }),
  };
}

export interface MorphogenesisTeamTopologyStateStoreV2 {
  load(topologyId: AgentPlatID): Promise<TeamTopologyStateV1 | null>;
  save(input: {
    readonly state: TeamTopologyStateV1;
    readonly expectedStateDigest: PlanningDigestV1;
  }): Promise<boolean>;
}

export interface MorphogenesisTeamTopologyRequestResolutionPortV2 {
  resolve(requestDigest: PlanningDigestV1): Promise<{
    readonly topologyId: AgentPlatID;
    readonly request: TeamTopologyTransformationRequestV1;
  } | null>;
}

export class InMemoryMorphogenesisTeamTopologyStateStoreV2
  implements MorphogenesisTeamTopologyStateStoreV2
{
  readonly #states = new Map<string, TeamTopologyStateV1>();
  constructor(states: readonly TeamTopologyStateV1[] = []) {
    for (const state of states)
      this.#states.set(state.topologyId, structuredClone(state));
  }
  async load(topologyId: AgentPlatID) {
    const state = this.#states.get(topologyId);
    return state ? Object.freeze(structuredClone(state)) : null;
  }
  async save(input: {
    readonly state: TeamTopologyStateV1;
    readonly expectedStateDigest: PlanningDigestV1;
  }) {
    const current = this.#states.get(input.state.topologyId);
    if (!current || current.stateDigest !== input.expectedStateDigest)
      return false;
    this.#states.set(input.state.topologyId, structuredClone(input.state));
    return true;
  }
}

/** Durable adapter from compiled Morphogenesis topology steps to the existing topology reducer. */
export class TeamTopologyMorphogenesisBoundaryV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  constructor(
    readonly options: {
      readonly store: MorphogenesisTeamTopologyStateStoreV2;
      readonly requests: MorphogenesisTeamTopologyRequestResolutionPortV2;
    },
  ) {}

  async execute(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    if (input.step.boundary !== "team_topology_transformation")
      throw new TypeError("Morphogenesis topology adapter boundary is invalid");
    const resolved = await this.#resolve(input.step.targetDigest);
    const current = await this.options.store.load(resolved.topologyId);
    if (!current) throw new TypeError("Morphogenesis topology state is unavailable");
    if (input.step.operation.startsWith("certify_")) {
      const retained = current.transformations.find(
        ({ transformationId }) =>
          transformationId === resolved.request.transformationId,
      );
      if (retained)
        return retained.status === "certified" || retained.status === "activated"
          ? this.#applied(input, retained.transformationDigest, resolved.request)
          : this.#indeterminate(retained.transformationDigest);
      const next = certifyTeamTopologyTransformationV1({
        state: current,
        request: resolved.request,
      });
      if (
        !(await this.options.store.save({
          state: next,
          expectedStateDigest: current.stateDigest,
        }))
      ) return this.reconcile(input);
      const transformation = next.transformations.find(
        ({ transformationId }) =>
          transformationId === resolved.request.transformationId,
      )!;
      return this.#applied(
        input,
        transformation.transformationDigest,
        resolved.request,
      );
    }
    if (!input.step.operation.startsWith("activate_"))
      throw new TypeError("Morphogenesis topology step operation is invalid");
    const retained = current.transformations.find(
      ({ transformationId }) =>
        transformationId === resolved.request.transformationId,
    );
    if (!retained) return { status: "not_applied" };
    if (retained.status === "activated")
      return this.#applied(input, current.stateDigest, resolved.request);
    if (retained.status !== "certified")
      return this.#indeterminate(retained.transformationDigest);
    const next = activateTeamTopologyTransformationV1({
      state: current,
      transformationId: retained.transformationId,
    });
    if (
      !(await this.options.store.save({
        state: next,
        expectedStateDigest: current.stateDigest,
      }))
    ) return this.reconcile(input);
    return this.#applied(input, next.stateDigest, resolved.request);
  }

  async reconcile(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0],
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    if (input.step.boundary !== "team_topology_transformation")
      throw new TypeError("Morphogenesis topology adapter boundary is invalid");
    const resolved = await this.#resolve(input.step.targetDigest);
    const current = await this.options.store.load(resolved.topologyId);
    if (!current) throw new TypeError("Morphogenesis topology state is unavailable");
    const retained = current.transformations.find(
      ({ transformationId }) =>
        transformationId === resolved.request.transformationId,
    );
    if (!retained) return { status: "not_applied" };
    if (input.step.operation.startsWith("certify_") &&
      (retained.status === "certified" || retained.status === "activated"))
      return this.#applied(input, retained.transformationDigest, resolved.request);
    if (input.step.operation.startsWith("activate_") && retained.status === "activated")
      return this.#applied(input, current.stateDigest, resolved.request);
    if (retained.status === "certified") return { status: "not_applied" };
    return this.#indeterminate(retained.transformationDigest);
  }

  async #resolve(requestDigest: PlanningDigestV1) {
    const resolved = await this.options.requests.resolve(requestDigest);
    if (!resolved || resolved.request.requestDigest !== requestDigest)
      throw new TypeError("Morphogenesis topology request is unavailable or substituted");
    return resolved;
  }

  #applied(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
    resultDigest: PlanningDigestV1,
    request: TeamTopologyTransformationRequestV1,
  ): MorphogenesisOperatorStepResolutionV2 {
    return {
      status: "applied",
      receipt: createMorphogenesisOperatorStepReceiptV2({
        operationId: input.operationId,
        planDigest: input.plan.planDigest,
        stepId: input.step.stepId,
        stepDigest: input.step.stepDigest,
        boundary: input.step.boundary,
        resultDigest,
        appliedAtLogicalMs: request.requestedAtLogicalMs,
      }),
    };
  }

  #indeterminate(evidenceDigest: PlanningDigestV1): MorphogenesisOperatorStepResolutionV2 {
    return { status: "indeterminate", evidenceDigest };
  }
}
