import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  activateTeamTopologyTransformationV1,
  certifyTeamTopologyTransformationV1,
  rollbackTeamTopologyTransformationV1,
  validateTeamTopologyStateV1,
  validateTeamTopologyTransformationRequestV1,
  type TeamTopologyStateV1,
  type TeamTopologyTransformationRequestV1,
} from "./team-topology-transformation.js";
import type {
  MorphogenesisOrganizationalBoundaryV7,
  MorphogenesisOrganizationalCompensationReceiptV7,
  MorphogenesisOrganizationalStepReceiptV7,
} from "./morphogenesis-organizational-evolution-runtime.js";
import type { WorkContractV1 } from "@agentplat/collective-control/mesh";
import type {
  ActionAuthorityResolver,
  ActionScope,
} from "@agentplat/inference-control/tools";
export interface MorphogenesisOrganizationalTopologyStatePortV7 {
  load(topologyId: string): Promise<TeamTopologyStateV1 | null>;
  save(input: {
    readonly state: TeamTopologyStateV1;
    readonly expectedStateDigest: PlanningDigestV1;
  }): Promise<boolean>;
}
export function createMorphogenesisOrganizationalDynamicTopologyBoundaryV7(input: {
  readonly topologyId: string;
  readonly states: MorphogenesisOrganizationalTopologyStatePortV7;
  readonly resolveRequest: (
    digest: PlanningDigestV1,
  ) => Promise<TeamTopologyTransformationRequestV1 | null>;
}): MorphogenesisOrganizationalBoundaryV7 {
  const apply = async (
    value: {
      readonly operationId: string;
      readonly plan: any;
      readonly step: any;
      readonly logicalTimeMs: number;
    },
    reconcile: boolean,
  ) => {
    if (
      value.step.authorityOwner !== "dynamic_topology" ||
      value.step.artifactKind !== "topology_request_v1"
    )
      fail("organizational topology step owner invalid");
    const request = await input.resolveRequest(value.step.artifactDigest);
    if (!request) fail("organizational topology request unavailable");
    const validated = validateTeamTopologyTransformationRequestV1(request);
    const current = await input.states.load(input.topologyId);
    if (!current) fail("organizational topology state unavailable");
    let next = validateTeamTopologyStateV1(current);
    const retained = next.transformations.find(
      (x) => x.transformationId === validated.transformationId,
    );
    if (retained?.status !== "activated") {
      if (reconcile && retained?.status !== "certified")
        fail("organizational topology reconciliation unavailable");
      if (!retained)
        next = certifyTeamTopologyTransformationV1({
          state: next,
          request: validated,
        });
      next = activateTeamTopologyTransformationV1({
        state: next,
        transformationId: validated.transformationId,
      });
      if (
        !(await input.states.save({
          state: next,
          expectedStateDigest: current.stateDigest,
        }))
      )
        fail("organizational topology CAS conflict");
    }
    return stepReceipt(
      value.operationId,
      value.plan.planDigest,
      value.step.stepDigest,
      next.stateDigest,
      value.logicalTimeMs,
    );
  };
  const compensate = async (value: {
    readonly operationId: string;
    readonly plan: any;
    readonly step: any;
    readonly receipt: MorphogenesisOrganizationalStepReceiptV7;
    readonly logicalTimeMs: number;
  }) => {
    const request = await input.resolveRequest(value.step.artifactDigest);
    if (!request)
      fail("organizational topology compensation request unavailable");
    const current = await input.states.load(input.topologyId);
    if (!current) fail("organizational topology state unavailable");
    const next = rollbackTeamTopologyTransformationV1({
      state: validateTeamTopologyStateV1(current),
      transformationId: request.transformationId,
    });
    if (
      !(await input.states.save({
        state: next,
        expectedStateDigest: current.stateDigest,
      }))
    )
      fail("organizational topology rollback CAS conflict");
    return compensationReceipt(
      value.operationId,
      value.plan.planDigest,
      value.receipt.receiptDigest,
      next.stateDigest,
      value.logicalTimeMs,
    );
  };
  return {
    apply: (v) => apply(v, false),
    reconcileApply: (v) => apply(v, true),
    compensate,
    reconcileCompensation: compensate,
  };
}
export function createMorphogenesisOrganizationalWorkBoundaryV7(input: {
  readonly resolveContract: (
    digest: PlanningDigestV1,
  ) => Promise<WorkContractV1 | null>;
  readonly apply: (value: {
    readonly operationId: string;
    readonly contract: WorkContractV1;
    readonly logicalTimeMs: number;
    readonly reconcile: boolean;
  }) => Promise<PlanningDigestV1>;
  readonly compensate: (value: {
    readonly operationId: string;
    readonly contract: WorkContractV1;
    readonly logicalTimeMs: number;
    readonly reconcile: boolean;
  }) => Promise<PlanningDigestV1>;
}): MorphogenesisOrganizationalBoundaryV7 {
  const contract = async (step: any) => {
    const value = await input.resolveContract(step.artifactDigest);
    if (
      step.authorityOwner !== "work" ||
      !value ||
      value.workContractDigest !== step.artifactDigest ||
      !["proposed", "active"].includes(value.status)
    )
      fail("organizational Work Contract invalid");
    return value;
  };
  const apply = async (v: any, reconcile: boolean) =>
    stepReceipt(
      v.operationId,
      v.plan.planDigest,
      v.step.stepDigest,
      await input.apply({
        operationId: v.operationId,
        contract: await contract(v.step),
        logicalTimeMs: v.logicalTimeMs,
        reconcile,
      }),
      v.logicalTimeMs,
    );
  const compensate = async (v: any, reconcile: boolean) =>
    compensationReceipt(
      v.operationId,
      v.plan.planDigest,
      v.receipt.receiptDigest,
      await input.compensate({
        operationId: v.operationId,
        contract: await contract(v.step),
        logicalTimeMs: v.logicalTimeMs,
        reconcile,
      }),
      v.logicalTimeMs,
    );
  return {
    apply: (v) => apply(v, false),
    reconcileApply: (v) => apply(v, true),
    compensate: (v) => compensate(v, false),
    reconcileCompensation: (v) => compensate(v, true),
  };
}
export function createMorphogenesisOrganizationalActionAuthorityBoundaryV7(input: {
  readonly resolver: ActionAuthorityResolver;
  readonly resolveScope: (stepDigest: PlanningDigestV1) => Promise<ActionScope>;
}): MorphogenesisOrganizationalBoundaryV7 {
  const apply = async (v: any) => {
    if (v.step.authorityOwner !== "action")
      fail("organizational Action owner invalid");
    const result = await input.resolver.resolve(
      await input.resolveScope(v.step.stepDigest),
      v.step.artifactDigest,
      v.logicalTimeMs,
    );
    if (
      result.status !== "current" ||
      result.actionDigest !== v.step.artifactDigest
    )
      fail("organizational Action Authority is not current");
    return stepReceipt(
      v.operationId,
      v.plan.planDigest,
      v.step.stepDigest,
      dg("morphogenesis-organizational-action-authority-evidence-v7", result),
      v.logicalTimeMs,
    );
  };
  const compensate = async (v: any) =>
    compensationReceipt(
      v.operationId,
      v.plan.planDigest,
      v.receipt.receiptDigest,
      dg("morphogenesis-organizational-action-authority-evidence-v7", {
        actionDigest: v.step.artifactDigest,
        noGrantCreated: true,
      }),
      v.logicalTimeMs,
    );
  return {
    apply,
    reconcileApply: apply,
    compensate,
    reconcileCompensation: compensate,
  };
}
function stepReceipt(
  operationId: string,
  planDigest: PlanningDigestV1,
  stepDigest: PlanningDigestV1,
  ownerReceiptDigest: PlanningDigestV1,
  appliedAtLogicalMs: number,
): MorphogenesisOrganizationalStepReceiptV7 {
  const b = {
    schemaVersion: 7 as const,
    operationId: operationId as never,
    planDigest,
    stepDigest,
    ownerReceiptDigest,
    appliedAtLogicalMs,
  };
  return Object.freeze({
    ...b,
    receiptDigest: dg("morphogenesis-organizational-step-receipt-v7", b),
  });
}
function compensationReceipt(
  operationId: string,
  planDigest: PlanningDigestV1,
  stepReceiptDigest: PlanningDigestV1,
  ownerReceiptDigest: PlanningDigestV1,
  compensatedAtLogicalMs: number,
): MorphogenesisOrganizationalCompensationReceiptV7 {
  const b = {
    schemaVersion: 7 as const,
    operationId: operationId as never,
    planDigest,
    stepReceiptDigest,
    ownerReceiptDigest,
    compensatedAtLogicalMs,
  };
  return Object.freeze({
    ...b,
    receiptDigest: dg(
      "morphogenesis-organizational-compensation-receipt-v7",
      b,
    ),
  });
}
function dg(d: string, v: unknown) {
  return digestPlanningJsonV1(d as never, v as PlanningJson);
}
function fail(m: string): never {
  throw new TypeError(m);
}
