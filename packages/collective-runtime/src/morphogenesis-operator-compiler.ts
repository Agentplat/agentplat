import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  type MorphogenesisEffectClassV1,
  type MorphogenesisOperationV1,
  type MorphogenesisOperatorV1,
  type MorphogenesisPolicyRecordAnyV1,
} from "./morphogenesis-contracts.js";
import {
  validateMorphogenesisOperationV1,
  validateMorphogenesisPolicyAnyV1,
} from "./morphogenesis-validation.js";

export type MorphogenesisExecutionBoundaryV2 =
  | "agent_instantiation_profile"
  | "governed_agent_lifecycle"
  | "agent_attestation"
  | "team_formation"
  | "governed_role_realignment"
  | "mission_work_reassignment"
  | "team_execution_continuity"
  | "work_action_fence"
  | "team_topology_transformation";

export interface MorphogenesisCompiledStepV2 {
  readonly schemaVersion: 2;
  readonly stepId: AgentPlatID;
  readonly boundary: MorphogenesisExecutionBoundaryV2;
  readonly operation: string;
  readonly effectClass: MorphogenesisEffectClassV1;
  readonly dependsOnStepIds: readonly AgentPlatID[];
  readonly targetDigest: PlanningDigestV1;
  readonly compensation:
    | "none"
    | "terminate_unenrolled"
    | "restore_predecessor_before_commit"
    | "detach_successor";
  readonly stepDigest: PlanningDigestV1;
}

export interface MorphogenesisCompiledOperatorPlanV2 {
  readonly schemaVersion: 2;
  readonly planId: AgentPlatID;
  readonly operator: MorphogenesisOperatorV1;
  readonly operationDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly binding: MorphogenesisOperatorBindingV2;
  readonly bindingDigest: PlanningDigestV1;
  readonly compilerId: AgentPlatID;
  readonly compilerVersion: number;
  readonly compilerImplementationDigest: PlanningDigestV1;
  readonly steps: readonly MorphogenesisCompiledStepV2[];
  readonly compiledAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly planDigest: PlanningDigestV1;
}

export type MorphogenesisOperatorBindingV2 =
  | {
      readonly operator: "derive_agent";
      readonly profileDigest: PlanningDigestV1;
      readonly evolutionDigest: PlanningDigestV1;
      readonly attenuationDigest: PlanningDigestV1;
    }
  | {
      readonly operator: "realign_role";
      readonly roleRealignmentRequestDigest: PlanningDigestV1;
      readonly currentRoleBindingDigest: PlanningDigestV1;
    }
  | {
      readonly operator: "reassign_work";
      readonly missionLifecycleCommandDigest: PlanningDigestV1;
      readonly predecessorWorkContractDigest: PlanningDigestV1;
      readonly successorWorkContractDigest: PlanningDigestV1;
    }
  | {
      readonly operator: "replace_agent";
      readonly predecessorAgentDigest: PlanningDigestV1;
      readonly successorTargetDigest: PlanningDigestV1;
      readonly continuityPolicyDigest: PlanningDigestV1;
    }
  | {
      readonly operator: "suspend_agent";
      readonly agentDigest: PlanningDigestV1;
      readonly suspensionPolicyDigest: PlanningDigestV1;
    }
  | {
      readonly operator: "split_team" | "merge_teams" | "federate_teams";
      readonly transformationRequestDigest: PlanningDigestV1;
      readonly topologyPolicyDigest: PlanningDigestV1;
    };

export function compileMorphogenesisOperatorV2(input: {
  readonly planId: AgentPlatID;
  readonly operation: MorphogenesisOperationV1;
  readonly policy: MorphogenesisPolicyRecordAnyV1;
  readonly binding: MorphogenesisOperatorBindingV2;
  readonly compilerId: AgentPlatID;
  readonly compilerVersion: number;
  readonly compilerImplementationDigest: PlanningDigestV1;
  readonly compiledAtLogicalMs: number;
}): MorphogenesisCompiledOperatorPlanV2 {
  const policy = validateMorphogenesisPolicyAnyV1(input.policy);
  if (policy.schemaVersion !== 2)
    fail("advanced Morphogenesis compilation requires policy V2");
  const operation = validateMorphogenesisOperationV1(input.operation, policy);
  const binding = validateBinding(input.binding, operation.operator);
  const steps = compileSteps(operation, binding);
  validateStepDag(steps);
  const body = freeze({
    schemaVersion: 2 as const,
    planId: id(input.planId, "compiled Morphogenesis plan ID"),
    operator: operation.operator,
    operationDigest: operation.operationDigest,
    policyDigest: policy.policyDigest,
    binding,
    bindingDigest: digest("morphogenesis-operator-binding-v2", binding),
    compilerId: id(input.compilerId, "Morphogenesis compiler ID"),
    compilerVersion: positive(input.compilerVersion, "Morphogenesis compiler version"),
    compilerImplementationDigest: sha(
      input.compilerImplementationDigest,
      "Morphogenesis compiler implementation digest",
    ),
    steps,
    compiledAtLogicalMs: nonNegative(
      input.compiledAtLogicalMs,
      "Morphogenesis compilation time",
    ),
    advisoryOnly: true as const,
  });
  return freeze({
    ...body,
    planDigest: digest("morphogenesis-compiled-operator-plan-v2", body),
  });
}

export function validateMorphogenesisCompiledOperatorPlanV2(
  input: unknown,
  context: {
    readonly operation: MorphogenesisOperationV1;
    readonly policy: MorphogenesisPolicyRecordAnyV1;
    readonly binding: MorphogenesisOperatorBindingV2;
  },
): MorphogenesisCompiledOperatorPlanV2 {
  const value = exact(
    input,
    [
      "advisoryOnly",
      "bindingDigest",
      "binding",
      "compiledAtLogicalMs",
      "compilerId",
      "compilerImplementationDigest",
      "compilerVersion",
      "operationDigest",
      "operator",
      "planDigest",
      "planId",
      "policyDigest",
      "schemaVersion",
      "steps",
    ],
    "compiled Morphogenesis operator plan",
  );
  if (value.schemaVersion !== 2 || value.advisoryOnly !== true)
    fail("compiled Morphogenesis operator plan schema is invalid");
  const result = compileMorphogenesisOperatorV2({
    planId: value.planId as AgentPlatID,
    operation: context.operation,
    policy: context.policy,
    binding: context.binding,
    compilerId: value.compilerId as AgentPlatID,
    compilerVersion: value.compilerVersion as number,
    compilerImplementationDigest:
      value.compilerImplementationDigest as PlanningDigestV1,
    compiledAtLogicalMs: value.compiledAtLogicalMs as number,
  });
  if (JSON.stringify(value) !== JSON.stringify(result))
    fail("compiled Morphogenesis operator plan binding or digest is invalid");
  return result;
}

function compileSteps(
  operation: MorphogenesisOperationV1,
  binding: MorphogenesisOperatorBindingV2,
): readonly MorphogenesisCompiledStepV2[] {
  const target = (key: string): PlanningDigestV1 =>
    sha((binding as unknown as Record<string, unknown>)[key], `${key} digest`);
  const step = (
    suffix: string,
    boundary: MorphogenesisExecutionBoundaryV2,
    name: string,
    targetDigest: PlanningDigestV1,
    dependencies: readonly string[],
    effectClass: MorphogenesisEffectClassV1 = "protected_external",
    compensation: MorphogenesisCompiledStepV2["compensation"] = "none",
  ) => createStep(operation.operationId, suffix, boundary, name, targetDigest, dependencies, effectClass, compensation);
  switch (binding.operator) {
    case "derive_agent":
      return freeze([
        step("verify-profile", "agent_instantiation_profile", "verify_evolved_profile", target("profileDigest"), [], "internal"),
        step("create-enroll", "governed_agent_lifecycle", "create_and_enroll", target("evolutionDigest"), ["verify-profile"], "protected_external", "terminate_unenrolled"),
        step("attest", "agent_attestation", "attest_created_agent", target("attenuationDigest"), ["create-enroll"]),
        step("activate", "team_formation", "activate_successor_team", operation.targetReferenceDigest, ["attest"], "protected_external", "detach_successor"),
      ]);
    case "realign_role":
      return freeze([
        step("realign-role", "governed_role_realignment", "run_certified_role_realignment", target("roleRealignmentRequestDigest"), [], "protected_external", "restore_predecessor_before_commit"),
      ]);
    case "reassign_work":
      return freeze([
        step("enact-command", "mission_work_reassignment", "enact_work_reassignment", target("missionLifecycleCommandDigest"), [], "protected_external", "restore_predecessor_before_commit"),
        step("issue-work", "mission_work_reassignment", "issue_successor_work_contract", target("successorWorkContractDigest"), ["enact-command"]),
        step("fence-work", "work_action_fence", "fence_predecessor_work", target("predecessorWorkContractDigest"), ["issue-work"]),
      ]);
    case "replace_agent":
      return freeze([
        step("resolve-successor", "governed_agent_lifecycle", "resolve_or_create_successor", target("successorTargetDigest"), [], "protected_external", "terminate_unenrolled"),
        step("attest-successor", "agent_attestation", "attest_successor", target("successorTargetDigest"), ["resolve-successor"]),
        step("activate-successor", "team_formation", "activate_successor_team", operation.targetReferenceDigest, ["attest-successor"], "protected_external", "detach_successor"),
        step("checkpoint", "team_execution_continuity", "checkpoint_predecessor_work", target("continuityPolicyDigest"), ["activate-successor"]),
        step("fence-predecessor", "work_action_fence", "fence_predecessor_authority", target("predecessorAgentDigest"), ["checkpoint"]),
        step("drain-predecessor", "governed_agent_lifecycle", "drain_and_retire_predecessor", target("predecessorAgentDigest"), ["fence-predecessor"]),
      ]);
    case "suspend_agent":
      return freeze([
        step("checkpoint", "team_execution_continuity", "checkpoint_suspended_agent", target("suspensionPolicyDigest"), []),
        step("fence", "work_action_fence", "fence_suspended_agent", target("agentDigest"), ["checkpoint"]),
        step("suspend", "governed_agent_lifecycle", "suspend_agent_membership", target("agentDigest"), ["fence"]),
      ]);
    case "split_team":
    case "merge_teams":
    case "federate_teams":
      return freeze([
        step("certify-topology", "team_topology_transformation", `certify_${binding.operator}`, target("transformationRequestDigest"), [], "internal"),
        step("activate-topology", "team_topology_transformation", `activate_${binding.operator}`, target("transformationRequestDigest"), ["certify-topology"], "protected_external", "restore_predecessor_before_commit"),
      ]);
  }
}

function createStep(
  operationId: AgentPlatID,
  suffix: string,
  boundary: MorphogenesisExecutionBoundaryV2,
  operation: string,
  targetDigest: PlanningDigestV1,
  dependencies: readonly string[],
  effectClass: MorphogenesisEffectClassV1,
  compensation: MorphogenesisCompiledStepV2["compensation"],
): MorphogenesisCompiledStepV2 {
  const stepId = `${operationId}:${suffix}` as AgentPlatID;
  const body = freeze({
    schemaVersion: 2 as const,
    stepId,
    boundary,
    operation,
    effectClass,
    dependsOnStepIds: freeze(
      dependencies.map((dependency) => `${operationId}:${dependency}` as AgentPlatID),
    ),
    targetDigest,
    compensation,
  });
  return freeze({ ...body, stepDigest: digest("morphogenesis-compiled-step-v2", body) });
}

function validateBinding(
  input: MorphogenesisOperatorBindingV2,
  operator: MorphogenesisOperatorV1,
): MorphogenesisOperatorBindingV2 {
  if (!input || typeof input !== "object" || input.operator !== operator)
    fail("Morphogenesis operator binding does not match the operation");
  const expected =
    operator === "derive_agent"
      ? ["attenuationDigest", "evolutionDigest", "operator", "profileDigest"]
      : operator === "realign_role"
        ? ["currentRoleBindingDigest", "operator", "roleRealignmentRequestDigest"]
        : operator === "reassign_work"
          ? ["missionLifecycleCommandDigest", "operator", "predecessorWorkContractDigest", "successorWorkContractDigest"]
          : operator === "replace_agent"
            ? ["continuityPolicyDigest", "operator", "predecessorAgentDigest", "successorTargetDigest"]
            : operator === "suspend_agent"
              ? ["agentDigest", "operator", "suspensionPolicyDigest"]
              : ["operator", "topologyPolicyDigest", "transformationRequestDigest"];
  const value = exact(input, expected, "Morphogenesis operator binding");
  for (const [key, item] of Object.entries(value))
    if (key !== "operator") sha(item, `${key} digest`);
  return freeze(structuredClone(input));
}

function validateStepDag(steps: readonly MorphogenesisCompiledStepV2[]) {
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.stepId)) fail("compiled Morphogenesis step is duplicated");
    for (const dependency of step.dependsOnStepIds)
      if (!seen.has(dependency)) fail("compiled Morphogenesis step dependency is not prior");
    seen.add(step.stepId);
  }
}

function exact(input: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(`${label} is invalid`);
  const actual = Object.keys(input).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) fail(`${label} fields are invalid`);
  return input as Record<string, unknown>;
}
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown, label: string): AgentPlatID { if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${label} is invalid`); return value as AgentPlatID; }
function sha(value: unknown, label: string): PlanningDigestV1 { if (typeof value !== "string" || !DIGEST.test(value)) fail(`${label} is invalid`); return value as PlanningDigestV1; }
function positive(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${label} is invalid`); return value as number; }
function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`); return value as number; }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.getOwnPropertyNames(value)) freeze((value as Record<string, unknown>)[key]); } return value; }
function fail(message: string): never { throw new TypeError(message); }
