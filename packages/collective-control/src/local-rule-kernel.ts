import type { JsonValue } from "@agentplat/core";

import {
  CollectiveControlValidationError,
  deepFreezeCollective,
  digestCollectiveJsonV1,
} from "./canonical.js";
import type { CollectiveDigestV1 } from "./contracts.js";

export type LocalRuleScalarV1 = string | number | boolean | null;
export type LocalRuleExpressionV1 =
  | { readonly op: "fact"; readonly key: string }
  | { readonly op: "value"; readonly value: LocalRuleScalarV1 }
  | { readonly op: "not"; readonly value: LocalRuleExpressionV1 }
  | { readonly op: "and" | "or"; readonly values: readonly LocalRuleExpressionV1[] }
  | {
      readonly op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
      readonly left: LocalRuleExpressionV1;
      readonly right: LocalRuleExpressionV1;
    };

export interface LocalRuleDefinitionV1 {
  readonly schemaVersion: 1;
  readonly ruleId: string;
  readonly revision: number;
  readonly priority: number;
  readonly effect: "allow" | "deny" | "abstain";
  readonly reasonCode: string;
  readonly condition: LocalRuleExpressionV1;
  readonly protected: boolean;
  readonly ruleDigest: CollectiveDigestV1;
}

export interface LocalRulePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly maximumRules: number;
  readonly maximumExpressionDepth: number;
  readonly maximumExpressionNodes: number;
  readonly maximumChangesPerProposal: number;
  readonly maximumRetainedPrograms: number;
  readonly defaultEffect: "allow" | "deny" | "abstain";
  readonly requiredProtectedRuleIds: readonly string[];
  readonly policyDigest: CollectiveDigestV1;
}

export type LocalRuleInstructionV1 =
  | { readonly op: "push_fact"; readonly key: string }
  | { readonly op: "push_value"; readonly value: LocalRuleScalarV1 }
  | { readonly op: "not" }
  | { readonly op: "and" | "or"; readonly count: number }
  | { readonly op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" }
  | {
      readonly op: "emit";
      readonly ruleId: string;
      readonly priority: number;
      readonly effect: "allow" | "deny" | "abstain";
      readonly reasonCode: string;
    };

export interface CompiledLocalRuleProgramV1 {
  readonly schemaVersion: 1;
  readonly programId: string;
  readonly policyDigest: CollectiveDigestV1;
  readonly revision: number;
  readonly predecessorProgramDigest: CollectiveDigestV1 | null;
  readonly ruleDigests: readonly CollectiveDigestV1[];
  readonly instructions: readonly LocalRuleInstructionV1[];
  readonly protectedRuleIds: readonly string[];
  readonly programDigest: CollectiveDigestV1;
}

export interface LocalRuleEvolutionProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly policyDigest: CollectiveDigestV1;
  readonly predecessorProgramDigest: CollectiveDigestV1;
  readonly proposedProgram: CompiledLocalRuleProgramV1;
  readonly changedRuleIds: readonly string[];
  readonly proposerPeerId: string;
  readonly authorityDigest: CollectiveDigestV1;
  readonly proposedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly proposalDigest: CollectiveDigestV1;
}

export interface LocalRuleKernelStateV1 {
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly policyDigest: CollectiveDigestV1;
  readonly revision: number;
  readonly fence: number;
  readonly activeProgram: CompiledLocalRuleProgramV1;
  readonly retainedPrograms: readonly CompiledLocalRuleProgramV1[];
  readonly activatedProposalDigest: CollectiveDigestV1 | null;
  readonly certificationDigest: CollectiveDigestV1 | null;
  readonly logicalTimeHighWaterMs: number;
  readonly previousStateDigest: CollectiveDigestV1 | null;
  readonly stateDigest: CollectiveDigestV1;
}

export interface LocalRuleDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly programDigest: CollectiveDigestV1;
  readonly stateDigest: CollectiveDigestV1;
  readonly fence: number;
  readonly disposition: "allow" | "deny" | "abstain";
  readonly matchedRuleIds: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly factDigest: CollectiveDigestV1;
  readonly logicalTimeMs: number;
  readonly decisionDigest: CollectiveDigestV1;
}

export interface LocalRuleCertificationPortV1 {
  verify(input: {
    readonly proposal: LocalRuleEvolutionProposalV1;
    readonly certificationDigest: CollectiveDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface LocalRuleKernelStoreV1 {
  load(stateKey: string): Promise<LocalRuleKernelStateV1 | null>;
  save(state: LocalRuleKernelStateV1, expectedRevision: number | null): Promise<boolean>;
}

export class InMemoryLocalRuleKernelStoreV1 implements LocalRuleKernelStoreV1 {
  readonly #states = new Map<string, LocalRuleKernelStateV1>();
  async load(stateKey: string): Promise<LocalRuleKernelStateV1 | null> {
    return this.#states.get(stateKey) ?? null;
  }
  async save(state: LocalRuleKernelStateV1, expectedRevision: number | null): Promise<boolean> {
    const current = this.#states.get(state.stateKey);
    if (
      (expectedRevision === null && (current !== undefined || state.revision !== 1)) ||
      (expectedRevision !== null && (!current || current.revision !== expectedRevision || state.revision !== expectedRevision + 1))
    ) return false;
    this.#states.set(state.stateKey, state);
    return true;
  }
}

export class LocalRuleKernelV1 {
  readonly policy: LocalRulePolicyV1;
  readonly store: LocalRuleKernelStoreV1;
  readonly certification: LocalRuleCertificationPortV1;

  constructor(readonly options: {
    readonly stateKey: string;
    readonly policy: LocalRulePolicyV1;
    readonly store?: LocalRuleKernelStoreV1;
    readonly certification: LocalRuleCertificationPortV1;
    readonly maximumCommitAttempts?: number;
  }) {
    identifier(options.stateKey, "stateKey");
    this.policy = validateLocalRulePolicyV1(options.policy);
    this.store = options.store ?? new InMemoryLocalRuleKernelStoreV1();
    if (!options.certification || typeof options.certification.verify !== "function")
      fail("local rule certification port is required");
    this.certification = options.certification;
    integer(options.maximumCommitAttempts ?? 4, "maximumCommitAttempts", 1, 32);
  }

  async initialize(program: CompiledLocalRuleProgramV1): Promise<LocalRuleKernelStateV1> {
    const validated = validateCompiledLocalRuleProgramV1(program, this.policy);
    if (validated.revision !== 1 || validated.predecessorProgramDigest !== null)
      fail("local rule initial program lineage invalid");
    const state = createState({
      schemaVersion: 1,
      stateKey: this.options.stateKey,
      policyDigest: this.policy.policyDigest,
      revision: 1,
      fence: 1,
      activeProgram: validated,
      retainedPrograms: [validated],
      activatedProposalDigest: null,
      certificationDigest: null,
      logicalTimeHighWaterMs: 0,
      previousStateDigest: null,
    });
    if (!(await this.store.save(state, null))) fail("local rule kernel already initialized");
    return state;
  }

  async evaluate(input: {
    readonly decisionId: string;
    readonly facts: Readonly<Record<string, LocalRuleScalarV1>>;
    readonly logicalTimeMs: number;
  }): Promise<LocalRuleDecisionV1> {
    identifier(input.decisionId, "decisionId");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const state = await this.load();
    if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
      fail("local rule evaluation time below high-water mark");
    validateFacts(input.facts);
    const matches = executeProgram(state.activeProgram, input.facts);
    const winner = matches.sort((left, right) =>
      right.priority - left.priority || effectRank(right.effect) - effectRank(left.effect) || left.ruleId.localeCompare(right.ruleId),
    )[0];
    const disposition = winner?.effect ?? this.policy.defaultEffect;
    const reasonCodes = winner ? [winner.reasonCode] : ["local_rule_default_effect"];
    const factDigest = digestCollectiveJsonV1("local-rule-decision", {
      domain: "facts-v1",
      facts: input.facts,
    } as unknown as JsonValue);
    const body = {
      schemaVersion: 1 as const,
      decisionId: input.decisionId,
      programDigest: state.activeProgram.programDigest,
      stateDigest: state.stateDigest,
      fence: state.fence,
      disposition,
      matchedRuleIds: matches.map((item) => item.ruleId).sort(),
      reasonCodes,
      factDigest,
      logicalTimeMs: input.logicalTimeMs,
    };
    return deepFreezeCollective({
      ...body,
      decisionDigest: digestCollectiveJsonV1("local-rule-decision", body as unknown as JsonValue),
    });
  }

  async activate(input: {
    readonly proposal: LocalRuleEvolutionProposalV1;
    readonly certificationDigest: CollectiveDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<LocalRuleKernelStateV1> {
    const proposal = validateLocalRuleEvolutionProposalV1(input.proposal, this.policy);
    collectiveDigest(input.certificationDigest, "certificationDigest");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    if (input.logicalTimeMs > proposal.validUntilLogicalMs)
      fail("local rule proposal expired");
    if (!(await this.certification.verify({ proposal, certificationDigest: input.certificationDigest, logicalTimeMs: input.logicalTimeMs })))
      fail("local rule proposal certification invalid");
    const attempts = this.options.maximumCommitAttempts ?? 4;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = await this.load();
      if (current.activeProgram.programDigest !== proposal.predecessorProgramDigest)
        fail("local rule proposal predecessor is not current");
      if (input.logicalTimeMs < current.logicalTimeHighWaterMs)
        fail("local rule activation time below high-water mark");
      const next = createState({
        ...current,
        revision: current.revision + 1,
        fence: current.fence + 1,
        activeProgram: proposal.proposedProgram,
        retainedPrograms: [...current.retainedPrograms, proposal.proposedProgram].slice(-this.policy.maximumRetainedPrograms),
        activatedProposalDigest: proposal.proposalDigest,
        certificationDigest: input.certificationDigest,
        logicalTimeHighWaterMs: input.logicalTimeMs,
        previousStateDigest: current.stateDigest,
      });
      if (await this.store.save(next, current.revision)) return next;
    }
    fail("local rule activation commit attempts exhausted");
  }

  async rollback(input: {
    readonly targetProgramDigest: CollectiveDigestV1;
    readonly certificationDigest: CollectiveDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<LocalRuleKernelStateV1> {
    const current = await this.load();
    const target = current.retainedPrograms.find((program) => program.programDigest === input.targetProgramDigest);
    if (!target || target.programDigest === current.activeProgram.programDigest)
      fail("local rule rollback target unavailable");
    const proposal = createLocalRuleEvolutionProposalV1({
      proposalId: `rollback:${current.revision + 1}:${target.programId}`,
      policyDigest: this.policy.policyDigest,
      predecessorProgramDigest: current.activeProgram.programDigest,
      proposedProgram: cloneLocalRuleProgramRevision(
        target,
        current.activeProgram.revision + 1,
        current.activeProgram.programDigest,
      ),
      changedRuleIds: [...new Set([
        ...current.activeProgram.instructions
          .filter((item): item is Extract<LocalRuleInstructionV1, { op: "emit" }> => item.op === "emit")
          .map((item) => item.ruleId),
        ...target.instructions
          .filter((item): item is Extract<LocalRuleInstructionV1, { op: "emit" }> => item.op === "emit")
          .map((item) => item.ruleId),
      ])].sort(),
      proposerPeerId: "local-rule-kernel",
      authorityDigest: input.certificationDigest,
      proposedAtLogicalMs: input.logicalTimeMs,
      validUntilLogicalMs: input.logicalTimeMs,
    }, this.policy);
    return this.activate({ proposal, certificationDigest: input.certificationDigest, logicalTimeMs: input.logicalTimeMs });
  }

  async load(): Promise<LocalRuleKernelStateV1> {
    const state = await this.store.load(this.options.stateKey);
    if (!state) fail("local rule kernel is not initialized");
    const validated = validateLocalRuleKernelStateV1(state, this.policy);
    if (validated.stateKey !== this.options.stateKey) fail("local rule state key changed");
    return validated;
  }
}

export function validateLocalRuleKernelStateV1(
  input: LocalRuleKernelStateV1,
  policyInput: LocalRulePolicyV1,
): LocalRuleKernelStateV1 {
  const policy = validateLocalRulePolicyV1(policyInput);
  if (!input || input.schemaVersion !== 1) fail("local rule state schema invalid");
  identifier(input.stateKey, "stateKey");
  if (input.policyDigest !== policy.policyDigest) fail("local rule state policy binding invalid");
  integer(input.revision, "state revision", 1, Number.MAX_SAFE_INTEGER);
  integer(input.fence, "state fence", 1, Number.MAX_SAFE_INTEGER);
  integer(input.logicalTimeHighWaterMs, "logicalTimeHighWaterMs", 0, Number.MAX_SAFE_INTEGER);
  if (input.previousStateDigest !== null) collectiveDigest(input.previousStateDigest, "previousStateDigest");
  if ((input.revision === 1) !== (input.previousStateDigest === null)) fail("local rule state lineage invalid");
  const active = validateCompiledLocalRuleProgramV1(input.activeProgram, policy);
  if (input.retainedPrograms.length === 0 || input.retainedPrograms.length > policy.maximumRetainedPrograms)
    fail("local rule retained program capacity invalid");
  const retained = input.retainedPrograms.map((item) => validateCompiledLocalRuleProgramV1(item, policy));
  if (
    new Set(retained.map((item) => item.programDigest)).size !== retained.length ||
    !retained.some((item) => item.programDigest === active.programDigest)
  ) fail("local rule retained program lineage invalid");
  if ((input.activatedProposalDigest === null) !== (input.certificationDigest === null))
    fail("local rule activation certification binding incomplete");
  if (input.activatedProposalDigest !== null) collectiveDigest(input.activatedProposalDigest, "activatedProposalDigest");
  if (input.certificationDigest !== null) collectiveDigest(input.certificationDigest, "certificationDigest");
  const { stateDigest, ...body } = input;
  collectiveDigest(stateDigest, "stateDigest");
  if (digestCollectiveJsonV1("local-rule-state", body as unknown as JsonValue) !== stateDigest)
    fail("local rule state digest invalid");
  return deepFreezeCollective(structuredClone(input));
}

export function createLocalRulePolicyV1(
  input: Omit<LocalRulePolicyV1, "policyDigest">,
): LocalRulePolicyV1 {
  validatePolicyBody(input);
  const body = deepFreezeCollective(structuredClone(input));
  return deepFreezeCollective({
    ...body,
    policyDigest: digestCollectiveJsonV1("local-rule-policy", body as unknown as JsonValue),
  });
}

export function validateLocalRulePolicyV1(input: LocalRulePolicyV1): LocalRulePolicyV1 {
  const { policyDigest, ...body } = input;
  const rebuilt = createLocalRulePolicyV1(body);
  if (rebuilt.policyDigest !== policyDigest) fail("local rule policy digest invalid");
  return rebuilt;
}

export function createLocalRuleDefinitionV1(
  input: Omit<LocalRuleDefinitionV1, "ruleDigest">,
  policy: LocalRulePolicyV1,
): LocalRuleDefinitionV1 {
  validateRuleBody(input, policy);
  const body = deepFreezeCollective(structuredClone(input));
  return deepFreezeCollective({
    ...body,
    ruleDigest: digestCollectiveJsonV1("local-rule-definition", body as unknown as JsonValue),
  });
}

export function compileLocalRuleProgramV1(input: {
  readonly policy: LocalRulePolicyV1;
  readonly rules: readonly LocalRuleDefinitionV1[];
  readonly revision: number;
  readonly predecessorProgramDigest: CollectiveDigestV1 | null;
}): CompiledLocalRuleProgramV1 {
  const policy = validateLocalRulePolicyV1(input.policy);
  integer(input.revision, "program revision", 1, Number.MAX_SAFE_INTEGER);
  if ((input.revision === 1) !== (input.predecessorProgramDigest === null))
    fail("local rule program lineage invalid");
  if (input.predecessorProgramDigest !== null) collectiveDigest(input.predecessorProgramDigest, "predecessorProgramDigest");
  if (input.rules.length === 0 || input.rules.length > policy.maximumRules)
    fail("local rule program rule count invalid");
  const rules = input.rules.map((rule) => {
    const { ruleDigest, ...body } = rule;
    const rebuilt = createLocalRuleDefinitionV1(body, policy);
    if (rebuilt.ruleDigest !== ruleDigest) fail("local rule definition digest invalid");
    return rebuilt;
  }).sort((left, right) => right.priority - left.priority || left.ruleId.localeCompare(right.ruleId));
  if (new Set(rules.map((item) => item.ruleId)).size !== rules.length)
    fail("local rule identifier duplicated");
  for (const required of policy.requiredProtectedRuleIds)
    if (!rules.some((rule) => rule.ruleId === required && rule.protected))
      fail(`required protected local rule missing: ${required}`);
  const instructions: LocalRuleInstructionV1[] = [];
  for (const rule of rules) {
    compileExpression(rule.condition, instructions);
    instructions.push({
      op: "emit",
      ruleId: rule.ruleId,
      priority: rule.priority,
      effect: rule.effect,
      reasonCode: rule.reasonCode,
    });
  }
  const body = {
    schemaVersion: 1 as const,
    programId: "pending",
    policyDigest: policy.policyDigest,
    revision: input.revision,
    predecessorProgramDigest: input.predecessorProgramDigest,
    ruleDigests: rules.map((item) => item.ruleDigest),
    instructions,
    protectedRuleIds: rules.filter((item) => item.protected).map((item) => item.ruleId).sort(),
  };
  const programDigest = digestCollectiveJsonV1(
    "local-rule-program",
    { ...body, programId: null } as unknown as JsonValue,
  );
  const program = deepFreezeCollective({
    ...body,
    programId: `local-rule-program:${programDigest.slice(7, 47)}`,
    programDigest,
  });
  return program;
}

export function validateCompiledLocalRuleProgramV1(
  input: CompiledLocalRuleProgramV1,
  policy: LocalRulePolicyV1,
): CompiledLocalRuleProgramV1 {
  if (input.schemaVersion !== 1) fail("local rule program schema invalid");
  collectiveDigest(input.programDigest, "programDigest");
  if (input.policyDigest !== policy.policyDigest) fail("local rule program policy mismatch");
  integer(input.revision, "program revision", 1, Number.MAX_SAFE_INTEGER);
  if ((input.revision === 1) !== (input.predecessorProgramDigest === null))
    fail("local rule program lineage invalid");
  if (input.predecessorProgramDigest !== null)
    collectiveDigest(input.predecessorProgramDigest, "predecessorProgramDigest");
  if (!Array.isArray(input.ruleDigests) || input.ruleDigests.length === 0 || input.ruleDigests.length > policy.maximumRules)
    fail("local rule program rule digests invalid");
  input.ruleDigests.forEach((item) => collectiveDigest(item, "ruleDigest"));
  if (new Set(input.ruleDigests).size !== input.ruleDigests.length)
    fail("local rule program rule digest duplicated");
  canonicalIdentifiers(input.protectedRuleIds, "protectedRuleIds");
  validateProgramInstructions(input.instructions, input.ruleDigests.length, input.protectedRuleIds, policy);
  for (const required of policy.requiredProtectedRuleIds)
    if (!input.protectedRuleIds.includes(required)) fail("local rule program omits a required protected rule");
  const body = {
    schemaVersion: input.schemaVersion,
    programId: null,
    policyDigest: input.policyDigest,
    revision: input.revision,
    predecessorProgramDigest: input.predecessorProgramDigest,
    ruleDigests: input.ruleDigests,
    instructions: input.instructions,
    protectedRuleIds: input.protectedRuleIds,
  };
  const actual = digestCollectiveJsonV1("local-rule-program", body as unknown as JsonValue);
  if (actual !== input.programDigest || input.programId !== `local-rule-program:${actual.slice(7, 47)}`)
    fail("local rule program digest invalid");
  return deepFreezeCollective(structuredClone(input));
}

export function createLocalRuleEvolutionProposalV1(
  input: Omit<LocalRuleEvolutionProposalV1, "schemaVersion" | "proposalDigest">,
  policy: LocalRulePolicyV1,
): LocalRuleEvolutionProposalV1 {
  const body = { schemaVersion: 1 as const, ...input };
  validateProposalBody(body, policy);
  return deepFreezeCollective({
    ...body,
    proposalDigest: digestCollectiveJsonV1("local-rule-proposal", body as unknown as JsonValue),
  });
}

export function validateLocalRuleEvolutionProposalV1(
  input: LocalRuleEvolutionProposalV1,
  policy: LocalRulePolicyV1,
): LocalRuleEvolutionProposalV1 {
  const { proposalDigest, schemaVersion: _schemaVersion, ...body } = input;
  const rebuilt = createLocalRuleEvolutionProposalV1(body, policy);
  if (rebuilt.proposalDigest !== proposalDigest) fail("local rule proposal digest invalid");
  return rebuilt;
}

function cloneLocalRuleProgramRevision(
  source: CompiledLocalRuleProgramV1,
  revision: number,
  predecessorProgramDigest: CollectiveDigestV1,
): CompiledLocalRuleProgramV1 {
  const body = {
    schemaVersion: 1 as const,
    programId: "pending",
    policyDigest: source.policyDigest,
    revision,
    predecessorProgramDigest,
    ruleDigests: source.ruleDigests,
    instructions: source.instructions,
    protectedRuleIds: source.protectedRuleIds,
  };
  const programDigest = digestCollectiveJsonV1(
    "local-rule-program",
    { ...body, programId: null } as unknown as JsonValue,
  );
  return deepFreezeCollective({
    ...body,
    programId: `local-rule-program:${programDigest.slice(7, 47)}`,
    programDigest,
  });
}

function executeProgram(
  program: CompiledLocalRuleProgramV1,
  facts: Readonly<Record<string, LocalRuleScalarV1>>,
): { readonly ruleId: string; readonly priority: number; readonly effect: "allow" | "deny" | "abstain"; readonly reasonCode: string }[] {
  const stack: unknown[] = [];
  const matches: { ruleId: string; priority: number; effect: "allow" | "deny" | "abstain"; reasonCode: string }[] = [];
  for (const instruction of program.instructions) {
    switch (instruction.op) {
      case "push_fact": stack.push(facts[instruction.key] ?? null); break;
      case "push_value": stack.push(instruction.value); break;
      case "not": stack.push(!Boolean(stack.pop())); break;
      case "and": stack.push(popBoolean(stack, instruction.count).every(Boolean)); break;
      case "or": stack.push(popBoolean(stack, instruction.count).some(Boolean)); break;
      case "eq": binary(stack, (left, right) => left === right); break;
      case "neq": binary(stack, (left, right) => left !== right); break;
      case "gt": binary(stack, (left, right) => compare(left, right) > 0); break;
      case "gte": binary(stack, (left, right) => compare(left, right) >= 0); break;
      case "lt": binary(stack, (left, right) => compare(left, right) < 0); break;
      case "lte": binary(stack, (left, right) => compare(left, right) <= 0); break;
      case "emit":
        if (Boolean(stack.pop())) matches.push(instruction);
        break;
    }
  }
  if (stack.length !== 0) fail("local rule program stack did not terminate cleanly");
  return matches;
}

function compileExpression(expression: LocalRuleExpressionV1, instructions: LocalRuleInstructionV1[]): void {
  switch (expression.op) {
    case "fact": instructions.push({ op: "push_fact", key: expression.key }); break;
    case "value": instructions.push({ op: "push_value", value: expression.value }); break;
    case "not": compileExpression(expression.value, instructions); instructions.push({ op: "not" }); break;
    case "and":
    case "or":
      expression.values.forEach((item) => compileExpression(item, instructions));
      instructions.push({ op: expression.op, count: expression.values.length });
      break;
    default:
      compileExpression(expression.left, instructions);
      compileExpression(expression.right, instructions);
      instructions.push({ op: expression.op });
  }
}

function createState(
  input: Omit<LocalRuleKernelStateV1, "stateDigest">,
): LocalRuleKernelStateV1 {
  const { stateDigest: _staleStateDigest, ...body } = input as LocalRuleKernelStateV1;
  return deepFreezeCollective({
    ...body,
    stateDigest: digestCollectiveJsonV1("local-rule-state", body as unknown as JsonValue),
  });
}

function validatePolicyBody(input: Omit<LocalRulePolicyV1, "policyDigest">): void {
  if (input.schemaVersion !== 1) fail("local rule policy schema invalid");
  identifier(input.policyId, "policyId");
  integer(input.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  integer(input.maximumRules, "maximumRules", 1, 100_000);
  integer(input.maximumExpressionDepth, "maximumExpressionDepth", 1, 256);
  integer(input.maximumExpressionNodes, "maximumExpressionNodes", 1, 1_000_000);
  integer(input.maximumChangesPerProposal, "maximumChangesPerProposal", 1, 100_000);
  integer(input.maximumRetainedPrograms, "maximumRetainedPrograms", 2, 10_000);
  if (!["allow", "deny", "abstain"].includes(input.defaultEffect)) fail("local rule default effect invalid");
  canonicalIdentifiers(input.requiredProtectedRuleIds, "requiredProtectedRuleIds");
  if (input.requiredProtectedRuleIds.length > input.maximumRules)
    fail("required protected local rules exceed rule capacity");
}

function validateRuleBody(
  input: Omit<LocalRuleDefinitionV1, "ruleDigest">,
  policy: LocalRulePolicyV1,
): void {
  if (input.schemaVersion !== 1) fail("local rule schema invalid");
  identifier(input.ruleId, "ruleId");
  integer(input.revision, "rule revision", 1, Number.MAX_SAFE_INTEGER);
  integer(input.priority, "rule priority", 0, 1_000_000);
  if (!["allow", "deny", "abstain"].includes(input.effect)) fail("local rule effect invalid");
  token(input.reasonCode, "reasonCode");
  if (typeof input.protected !== "boolean") fail("local rule protected flag invalid");
  let nodes = 0;
  const visit = (expression: LocalRuleExpressionV1, depth: number): void => {
    if (!expression || typeof expression !== "object") fail("local rule expression invalid");
    nodes += 1;
    if (depth > policy.maximumExpressionDepth || nodes > policy.maximumExpressionNodes)
      fail("local rule expression bounds exceeded");
    switch (expression.op) {
      case "fact": identifier(expression.key, "fact key"); break;
      case "value":
        if (expression.value !== null && !["string", "number", "boolean"].includes(typeof expression.value))
          fail("local rule literal invalid");
        if (typeof expression.value === "number" && !Number.isFinite(expression.value))
          fail("local rule numeric literal invalid");
        break;
      case "not": visit(expression.value, depth + 1); break;
      case "and":
      case "or":
        if (!Array.isArray(expression.values) || expression.values.length < 2)
          fail("local rule logical expression requires operands");
        expression.values.forEach((item) => visit(item, depth + 1));
        break;
      case "eq":
      case "neq":
      case "gt":
      case "gte":
      case "lt":
      case "lte":
        visit(expression.left, depth + 1);
        visit(expression.right, depth + 1);
        break;
      default:
        fail("local rule expression operation invalid");
    }
  };
  visit(input.condition, 1);
}

function validateProposalBody(
  input: Omit<LocalRuleEvolutionProposalV1, "proposalDigest">,
  policy: LocalRulePolicyV1,
): void {
  if (input.schemaVersion !== 1 || input.policyDigest !== policy.policyDigest)
    fail("local rule proposal policy binding invalid");
  identifier(input.proposalId, "proposalId");
  collectiveDigest(input.predecessorProgramDigest, "predecessorProgramDigest");
  validateCompiledLocalRuleProgramV1(input.proposedProgram, policy);
  if (input.proposedProgram.predecessorProgramDigest !== input.predecessorProgramDigest)
    fail("local rule proposal program lineage invalid");
  canonicalIdentifiers(input.changedRuleIds, "changedRuleIds");
  if (input.changedRuleIds.length > policy.maximumChangesPerProposal)
    fail("local rule proposal change capacity exceeded");
  for (const protectedRuleId of policy.requiredProtectedRuleIds)
    if (!input.proposedProgram.protectedRuleIds.includes(protectedRuleId))
      fail("local rule proposal removes a protected rule");
  identifier(input.proposerPeerId, "proposerPeerId");
  collectiveDigest(input.authorityDigest, "authorityDigest");
  integer(input.proposedAtLogicalMs, "proposedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER);
  integer(input.validUntilLogicalMs, "validUntilLogicalMs", input.proposedAtLogicalMs, Number.MAX_SAFE_INTEGER);
}

function validateFacts(facts: Readonly<Record<string, LocalRuleScalarV1>>): void {
  if (!facts || typeof facts !== "object" || Array.isArray(facts) || Object.keys(facts).length > 10_000)
    fail("local rule facts invalid");
  for (const [key, value] of Object.entries(facts)) {
    identifier(key, "fact key");
    if (value !== null && !["string", "number", "boolean"].includes(typeof value))
      fail("local rule fact value invalid");
    if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))))
      fail("local rule numeric fact invalid");
  }
}

function validateProgramInstructions(
  instructions: readonly LocalRuleInstructionV1[],
  expectedRuleCount: number,
  protectedRuleIds: readonly string[],
  policy: LocalRulePolicyV1,
): void {
  const maximumInstructions = Math.min(
    Number.MAX_SAFE_INTEGER,
    policy.maximumRules * (policy.maximumExpressionNodes + 1),
  );
  if (!Array.isArray(instructions) || instructions.length === 0 || instructions.length > maximumInstructions)
    fail("local rule program instruction capacity exceeded");
  let stackDepth = 0;
  let emittedRules = 0;
  const emittedRuleIds = new Set<string>();
  for (const instruction of instructions) {
    if (!instruction || typeof instruction !== "object") fail("local rule instruction invalid");
    switch (instruction.op) {
      case "push_fact":
        identifier(instruction.key, "fact key");
        stackDepth += 1;
        break;
      case "push_value":
        if (instruction.value !== null && !["string", "number", "boolean"].includes(typeof instruction.value))
          fail("local rule literal invalid");
        if (typeof instruction.value === "number" && !Number.isFinite(instruction.value))
          fail("local rule numeric literal invalid");
        stackDepth += 1;
        break;
      case "not":
        if (stackDepth < 1) fail("local rule program stack underflow");
        break;
      case "and":
      case "or":
        integer(instruction.count, "logical operand count", 2, policy.maximumExpressionNodes);
        if (stackDepth < instruction.count) fail("local rule program stack underflow");
        stackDepth = stackDepth - instruction.count + 1;
        break;
      case "eq":
      case "neq":
      case "gt":
      case "gte":
      case "lt":
      case "lte":
        if (stackDepth < 2) fail("local rule program stack underflow");
        stackDepth -= 1;
        break;
      case "emit":
        if (stackDepth !== 1) fail("local rule emit must terminate one expression");
        identifier(instruction.ruleId, "ruleId");
        if (emittedRuleIds.has(instruction.ruleId)) fail("local rule emit duplicated");
        emittedRuleIds.add(instruction.ruleId);
        integer(instruction.priority, "rule priority", 0, 1_000_000);
        if (!["allow", "deny", "abstain"].includes(instruction.effect)) fail("local rule effect invalid");
        token(instruction.reasonCode, "reasonCode");
        stackDepth = 0;
        emittedRules += 1;
        break;
      default:
        fail("local rule instruction operation invalid");
    }
  }
  if (stackDepth !== 0 || emittedRules !== expectedRuleCount)
    fail("local rule program does not terminate at every rule boundary");
  for (const protectedRuleId of protectedRuleIds)
    if (!emittedRuleIds.has(protectedRuleId)) fail("protected local rule has no instruction");
}

function popBoolean(stack: unknown[], count: number): unknown[] {
  if (stack.length < count) fail("local rule program stack underflow");
  return stack.splice(stack.length - count, count);
}

function binary(stack: unknown[], operation: (left: unknown, right: unknown) => boolean): void {
  if (stack.length < 2) fail("local rule program stack underflow");
  const right = stack.pop(), left = stack.pop();
  stack.push(operation(left, right));
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number")
    return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === "string" && typeof right === "string")
    return left < right ? -1 : left > right ? 1 : 0;
  return Number.NaN;
}

function effectRank(effect: "allow" | "deny" | "abstain"): number {
  return effect === "deny" ? 3 : effect === "abstain" ? 2 : 1;
}

function canonicalIdentifiers(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 100_000) fail(`${label} invalid`);
  values.forEach((item) => identifier(item, label));
  const canonical = [...new Set(values)].sort();
  if (canonical.length !== values.length || canonical.some((item, index) => item !== values[index]))
    fail(`${label} must be canonical`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value)) fail(`${label} invalid`);
}

function token(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(value)) fail(`${label} invalid`);
}

function collectiveDigest(value: unknown, label: string): asserts value is CollectiveDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) fail(`${label} invalid`);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) fail(`${label} invalid`);
  return value as number;
}

function fail(message: string): never {
  throw new CollectiveControlValidationError(message);
}
