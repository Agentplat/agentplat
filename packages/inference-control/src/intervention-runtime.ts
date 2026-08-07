import { sha256Hex } from "./sha256.js";
import {
  HETEROGENEOUS_INFERENCE_INTERVENTION_STATE_FORMAT_V1,
  type InferenceInterventionAdapterV1,
  type InferenceInterventionAssessmentV1,
  type InferenceInterventionAssessorPortV1,
  type InferenceInterventionBindingV1,
  type InferenceInterventionInvocationV1,
  type InferenceInterventionModalityPartV1,
  type InferenceInterventionMonotonicAnchorV1,
  type InferenceInterventionOperationGateRequestV1,
  type InferenceInterventionOperationGateResultV1,
  type InferenceInterventionResultV1,
  type InferenceInterventionReconcileInputV1,
  type InferenceInterventionReconciliationPortV1,
  type InferenceInterventionSignalV1,
  type InferenceInterventionStateStoreV1,
  type InferenceInterventionStateV1,
  type InferenceInterventionTransformationPortV1,
  type RepresentationInterventionReceiptV1,
  type RepresentationInterventionSidecarPortV1,
} from "./intervention-contracts.js";
import {
  assertInferenceInterventionAdapterDescriptorV1,
  assertInferenceInterventionBindingV1,
  assertInferenceInterventionPolicyV1,
  createInferenceInterventionReconciliationRequestV1,
  createInferenceInterventionTransformationRequestV1,
  createRepresentationInterventionRequestV1,
  digestInferenceInterventionV1,
  verifyInferenceInterventionTransformationReceiptV1,
  verifyInferenceInterventionReconciliationReceiptV1,
  verifyRepresentationInterventionReceiptV1,
} from "./intervention-validation.js";

const encoder = new TextEncoder();
const digestText = (value: string) =>
  `sha256:${sha256Hex(encoder.encode(value))}`;
const keyFor = (b: InferenceInterventionBindingV1) =>
  `inference-intervention:${b.missionId}:${b.agentId}:${b.sessionId}:${b.roleId}:${b.modelOrAdapterId}`;
export const INFERENCE_INTERVENTION_PAYLOAD_LIMITS_V1 = Object.freeze({
  maximumInputBytes: 1_048_576,
  maximumContextItems: 64,
  maximumContextItemBytes: 262_144,
  maximumContextBytes: 2_097_152,
  maximumModalityParts: 32,
  maximumPayloadHandleBytes: 2_048,
  maximumRoleReinforcementBytes: 65_536,
  maximumReasonCodes: 32,
  maximumReasonCodeBytes: 256,
  maximumEvidenceDigests: 32,
  maximumOutputBytes: 4_194_304,
  maximumTokenBytes: 65_536,
  maximumTokenCount: 8_192,
});

export class InMemoryInferenceInterventionStateStoreV1
  implements
    InferenceInterventionStateStoreV1,
    InferenceInterventionMonotonicAnchorV1
{
  private readonly records = new Map<string, InferenceInterventionStateV1>();
  private readonly anchors = new Map<
    string,
    {
      revision: number;
      interventionsUsed: number;
      representationRequestsUsed: number;
    }
  >();
  async read(key: string) {
    return this.records.get(key) ?? null;
  }
  async readAnchor(key: string) {
    return this.anchors.get(key) ?? null;
  }
  async compareAndSet(change: {
    stateKey: string;
    expectedRevision: number | null;
    expectedStateDigest: string | null;
    next: InferenceInterventionStateV1;
  }) {
    const prior = this.records.get(change.stateKey) ?? null;
    if (
      (prior?.revision ?? null) !== change.expectedRevision ||
      (prior?.stateDigest ?? null) !== change.expectedStateDigest
    )
      return false;
    this.records.set(change.stateKey, change.next);
    this.anchors.set(change.stateKey, {
      revision: change.next.revision,
      interventionsUsed: change.next.interventionsUsed,
      representationRequestsUsed: change.next.representationRequestsUsed,
    });
    return true;
  }
}

export interface HeterogeneousInferenceInterventionRuntimeOptionsV1 {
  readonly binding: InferenceInterventionBindingV1;
  readonly policy: import("./intervention-contracts.js").InferenceInterventionPolicyV1;
  readonly adapter: InferenceInterventionAdapterV1;
  readonly assessors: readonly InferenceInterventionAssessorPortV1[];
  readonly store?: InferenceInterventionStateStoreV1;
  readonly monotonicAnchor?: InferenceInterventionMonotonicAnchorV1;
  readonly sidecar?: RepresentationInterventionSidecarPortV1;
  readonly transformer?: InferenceInterventionTransformationPortV1;
  readonly reconciler?: InferenceInterventionReconciliationPortV1;
}

type Plan = {
  assessments: InferenceInterventionAssessmentV1[];
  blocked: boolean;
  trigger: {
    signal: InferenceInterventionSignalV1;
    assessment: InferenceInterventionAssessmentV1;
  } | null;
  clear: number;
};

class SidecarAmbiguousError extends Error {
  constructor(readonly requestDigest: string) {
    super("representation_sidecar_ambiguous");
  }
}

export class HeterogeneousInferenceInterventionRuntimeV1 {
  readonly store: InferenceInterventionStateStoreV1;
  readonly monotonicAnchor: InferenceInterventionMonotonicAnchorV1;
  constructor(
    readonly options: HeterogeneousInferenceInterventionRuntimeOptionsV1,
  ) {
    assertInferenceInterventionBindingV1(options.binding);
    assertInferenceInterventionPolicyV1(options.policy);
    assertInferenceInterventionAdapterDescriptorV1(options.adapter.descriptor);
    this.store =
      options.store ?? new InMemoryInferenceInterventionStateStoreV1();
    this.monotonicAnchor =
      options.monotonicAnchor ??
      (this.store as unknown as InferenceInterventionMonotonicAnchorV1);
    if (typeof this.monotonicAnchor.readAnchor !== "function")
      throw new TypeError("external_monotonic_anchor_required");
    if (!options.assessors.length)
      throw new TypeError("at_least_one_assessor_required");
    for (const assessor of options.assessors)
      this.assertPort(
        assessor.assessorId,
        assessor.assessorVersion,
        assessor.assessorImplementationDigest,
        "assessor",
      );
    if (options.transformer)
      this.assertPort(
        options.transformer.transformerId,
        options.transformer.transformerVersion,
        options.transformer.transformerImplementationDigest,
        "transformer",
      );
    if (options.reconciler)
      this.assertPort(
        options.reconciler.reconcilerId,
        options.reconciler.reconcilerVersion,
        options.reconciler.reconcilerImplementationDigest,
        "reconciler",
      );
    const capabilities = new Set(options.adapter.descriptor.capabilities);
    for (const required of options.policy.requiredCapabilities)
      if (!capabilities.has(required))
        throw new TypeError(`required_capability_unavailable:${required}`);
    if (
      options.policy.requiredCapabilities.includes(
        "representation_intervention",
      ) &&
      !options.sidecar
    )
      throw new TypeError("required_representation_sidecar_unavailable");
  }

  async invoke(
    raw: Omit<
      InferenceInterventionInvocationV1,
      "binding" | "policy" | "inputDigest" | "executionDomain"
    >,
  ): Promise<InferenceInterventionResultV1> {
    const original = this.makeInvocation(raw, "inference");
    const needsRepresentation =
      original.requireRepresentationReceipt ||
      original.policy.requiredCapabilities.includes(
        "representation_intervention",
      );
    const reserved = await this.prepare(original, needsRepresentation);
    if ("result" in reserved) return reserved.result;
    const { prepared, plan } = reserved;
    let effective = original;
    let receipt: RepresentationInterventionReceiptV1 | null = null;
    const assessments = [...plan.assessments];
    try {
      if (plan.trigger) {
        effective = await this.transform(original, plan.trigger);
        const transformedPlan = await this.assessInvocation(effective);
        assessments.push(...transformedPlan.assessments);
        if (transformedPlan.blocked || transformedPlan.trigger)
          return this.finish(
            prepared,
            original,
            assessments,
            null,
            null,
            true,
            transformedPlan.trigger !== null,
            transformedPlan.clear,
          );
      }
      if (needsRepresentation)
        receipt = await this.requestRepresentation(effective);
      const providerResult = await this.options.adapter.invoke(effective);
      const output = providerResult.tokens
        ? await this.collectTokens(
            effective,
            providerResult.tokens,
            assessments,
          )
        : this.validateBufferedOutput(providerResult.output ?? "");
      const finalValues = await this.assess(effective, {
        kind: "output",
        content: output,
        contentDigest: digestText(output),
      });
      assessments.push(...finalValues);
      const finalOutcome = this.outcome(finalValues);
      if (finalOutcome.blocked || finalOutcome.intervened)
        return this.finish(
          prepared,
          original,
          assessments,
          null,
          receipt,
          true,
          finalOutcome.intervened,
          finalOutcome.clear,
        );
      return this.finish(
        prepared,
        original,
        assessments,
        output,
        receipt,
        false,
        false,
        finalOutcome.clear,
      );
    } catch (error) {
      if (error instanceof SidecarAmbiguousError) {
        await this.finishAmbiguous(
          prepared,
          original,
          assessments,
          error.requestDigest,
        );
        throw error;
      }
      const outcome = this.outcome(assessments);
      await this.finish(
        prepared,
        original,
        assessments,
        null,
        receipt,
        true,
        outcome.intervened,
        0,
      );
      throw error;
    }
  }

  async gateOperation(
    input: InferenceInterventionOperationGateRequestV1,
  ): Promise<InferenceInterventionOperationGateResultV1> {
    const capability = input.kind === "tool" ? "tool_gate" : "action_gate";
    if (!this.options.adapter.descriptor.capabilities.includes(capability))
      throw new TypeError(`${capability}_unavailable_before_dispatch`);
    const original = this.makeInvocation(
      {
        invocationId: input.operationId,
        step: input.step,
        logicalTimeMs: input.logicalTimeMs,
        input: input.payload,
        context: [],
        roleReinforcement: null,
        requireRepresentationReceipt: false,
      },
      input.kind,
    );
    const reserved = await this.prepare(original, false, input.kind);
    if ("result" in reserved)
      return {
        allowed: reserved.result.decision === "allowed",
        assessments: reserved.result.assessments,
        state: reserved.result.state,
      };
    const assessments = [...reserved.plan.assessments];
    // Operation gates never return a rewritten payload. Allowing after an
    // advisory rewrite could let the caller dispatch the original risky value.
    const blocked = reserved.plan.trigger !== null;
    const result = await this.finish(
      reserved.prepared,
      original,
      assessments,
      null,
      null,
      blocked,
      false,
      0,
    );
    return Object.freeze({
      allowed: result.decision === "allowed",
      assessments: result.assessments,
      state: result.state,
    });
  }

  async reconcile(
    input: InferenceInterventionReconcileInputV1,
  ): Promise<InferenceInterventionStateV1> {
    const port = this.options.reconciler;
    if (!port) throw new TypeError("reconciliation_port_required");
    const key = keyFor(this.options.binding);
    const prior = await this.store.read(key);
    const validationInvocation: InferenceInterventionInvocationV1 = {
      invocationId: input.invocationId,
      executionDomain: input.executionDomain,
      binding: this.options.binding,
      policy: this.options.policy,
      step: input.step,
      logicalTimeMs: input.logicalTimeMs,
      input: "",
      inputDigest: digestText(""),
      context: [],
      roleReinforcement: null,
      requireRepresentationReceipt: false,
    };
    await this.validateState(prior, validationInvocation);
    if (!prior?.unresolvedEffect) throw new TypeError("no_unresolved_effect");
    const effect = prior.unresolvedEffect;
    if (
      effect.invocationId !== input.invocationId ||
      effect.invocationDigest !== input.invocationDigest ||
      effect.executionDomain !== input.executionDomain ||
      effect.step !== input.step
    )
      throw new TypeError("reconciliation_invocation_mismatch");
    if (
      !Number.isSafeInteger(input.logicalTimeMs) ||
      input.logicalTimeMs < prior.logicalTimeHighWaterMs
    )
      throw new TypeError("reconciliation_logical_time_replay");
    const request = createInferenceInterventionReconciliationRequestV1({
      schemaVersion: 1,
      stateKey: key,
      bindingDigest: this.options.binding.bindingDigest,
      policyDigest: this.options.policy.policyDigest,
      invocationId: effect.invocationId,
      invocationDigest: effect.invocationDigest,
      executionDomain: effect.executionDomain,
      step: effect.step,
      unresolvedKind: effect.kind,
      sidecarRequestDigest: effect.sidecarRequestDigest,
      resolution: input.resolution,
      authorizationDigest: input.authorizationDigest,
      reconciledAtLogicalMs: input.logicalTimeMs,
    });
    const receipt = await port.reconcile(request);
    verifyInferenceInterventionReconciliationReceiptV1(request, receipt, port);
    const unsigned = {
      ...prior,
      revision: prior.revision + 1,
      logicalTimeHighWaterMs: input.logicalTimeMs,
      lastInvocationDigest: effect.invocationDigest,
      activeInvocation: null,
      lastInvocation: {
        invocationId: effect.invocationId,
        invocationDigest: effect.invocationDigest,
        executionDomain: effect.executionDomain,
        step: effect.step,
        decision: "blocked" as const,
        outputDigest: null,
      },
      unresolvedEffect: null,
    };
    const { stateDigest: _oldDigest, ...withoutDigest } = unsigned;
    const next = Object.freeze({
      ...withoutDigest,
      stateDigest: digestInferenceInterventionV1("state", withoutDigest),
    });
    if (!(await this.cas(prior, next)))
      throw new Error("reconciliation_state_commit_conflict");
    return next;
  }

  private async prepare(
    original: InferenceInterventionInvocationV1,
    representation: boolean,
    operationKind?: "tool" | "action",
  ): Promise<
    | { prepared: InferenceInterventionStateV1; plan: Plan }
    | { result: InferenceInterventionResultV1 }
  > {
    const key = keyFor(original.binding);
    for (
      let attempt = 0;
      attempt < original.policy.budget.maximumCasAttempts;
      attempt++
    ) {
      const prior = await this.store.read(key);
      await this.validateState(prior, original);
      const replay = this.replay(prior, original);
      if (replay) return { result: replay };
      if (prior?.unresolvedEffect)
        throw new TypeError("intervention_reconciliation_required");
      this.assertFresh(prior, original);
      const plan = operationKind
        ? await this.assessOperation(original, operationKind)
        : await this.assessInvocation(original);
      const unavailableModify =
        plan.trigger &&
        !operationKind &&
        (!this.options.transformer ||
          !this.options.adapter.descriptor.capabilities.includes(
            "trusted_transformation",
          ));
      const interventionUnavailable =
        plan.trigger &&
        ((prior?.interventionsUsed ?? 0) >=
          original.policy.budget.maximumInterventions ||
          (prior?.cooldownUntilLogicalMs ?? 0) > original.logicalTimeMs);
      const representationUnavailable =
        representation &&
        ((prior?.representationRequestsUsed ?? 0) >=
          original.policy.budget.maximumRepresentationRequests ||
          !this.options.sidecar ||
          !this.options.adapter.descriptor.capabilities.includes(
            "representation_intervention",
          ));
      if (
        plan.blocked ||
        unavailableModify ||
        interventionUnavailable ||
        representationUnavailable
      ) {
        const terminal = this.state(prior, original, 0, 0, plan.clear, null, {
          decision: "blocked",
          outputDigest: null,
        });
        if (await this.cas(prior, terminal))
          return {
            result: Object.freeze({
              decision: "blocked",
              output: null,
              outputDigest: null,
              receipt: null,
              assessments: Object.freeze(plan.assessments),
              state: terminal,
            }),
          };
        continue;
      }
      const prepared = this.state(
        prior,
        original,
        plan.trigger ? 1 : 0,
        representation ? 1 : 0,
        plan.clear,
        {
          invocationId: original.invocationId,
          invocationDigest: this.invocationDigest(original),
          executionDomain: original.executionDomain,
          step: original.step,
        },
        null,
      );
      if (await this.cas(prior, prepared)) return { prepared, plan };
    }
    throw new Error("inference_intervention_cas_retry_exhausted");
  }

  private async assessOperation(
    invocation: InferenceInterventionInvocationV1,
    kind: "tool" | "action",
  ): Promise<Plan> {
    const signal: InferenceInterventionSignalV1 = {
      kind,
      content: invocation.input,
      contentDigest: invocation.inputDigest,
    };
    const assessments = await this.assess(invocation, signal);
    const outcome = this.outcome(assessments);
    const assessment = assessments.find(
      (value) =>
        value.decision === "modify" ||
        value.riskBps >= invocation.policy.thresholds.interventionRiskBps,
    );
    return {
      assessments,
      blocked: outcome.blocked,
      trigger: assessment ? { signal, assessment } : null,
      clear: outcome.clear,
    };
  }

  private async transform(
    original: InferenceInterventionInvocationV1,
    trigger: NonNullable<Plan["trigger"]>,
  ) {
    const transformer = this.options.transformer!;
    const request = createInferenceInterventionTransformationRequestV1({
      schemaVersion: 1,
      bindingDigest: original.binding.bindingDigest,
      policyDigest: original.policy.policyDigest,
      inputDigest: original.inputDigest,
      signalDigest: trigger.signal.contentDigest,
      assessmentDigest: trigger.assessment.assessmentDigest,
    });
    const changed = await transformer.transform({
      request,
      source: original.input,
      context: original.context,
      modalityParts: original.modalityParts ?? [],
    });
    const effective: InferenceInterventionInvocationV1 = {
      ...original,
      input: changed.input,
      inputDigest: digestText(changed.input),
      context: changed.context ?? original.context,
      modalityParts: changed.modalityParts ?? original.modalityParts,
    };
    this.validatePayload(effective);
    verifyInferenceInterventionTransformationReceiptV1(
      request,
      changed.receipt,
      transformer,
      this.transformedManifestDigest(effective),
    );
    return effective;
  }

  private async assessInvocation(
    invocation: InferenceInterventionInvocationV1,
  ): Promise<Plan> {
    const signals: InferenceInterventionSignalV1[] = [
      {
        kind: "input",
        content: invocation.input,
        contentDigest: invocation.inputDigest,
      },
      ...invocation.context.map((content) => ({
        kind: "context" as const,
        content,
        contentDigest: digestText(content),
      })),
      ...(invocation.modalityParts ?? []).map((part) => ({
        kind: "multimodal_input" as const,
        content: part.payloadHandle ?? part.contentDigest,
        contentDigest: part.contentDigest,
      })),
    ];
    const assessments: InferenceInterventionAssessmentV1[] = [];
    let blocked = false,
      trigger: Plan["trigger"] = null,
      clear = 0;
    for (const signal of signals) {
      const values = await this.assess(invocation, signal);
      assessments.push(...values);
      const outcome = this.outcome(values);
      blocked ||= outcome.blocked;
      clear += outcome.clear;
      if (!trigger) {
        const assessment = values.find(
          (value) =>
            value.decision === "modify" ||
            value.riskBps >= invocation.policy.thresholds.interventionRiskBps,
        );
        if (assessment) trigger = { signal, assessment };
      }
    }
    return { assessments, blocked, trigger, clear };
  }

  private async collectTokens(
    invocation: InferenceInterventionInvocationV1,
    tokens: AsyncIterable<string>,
    assessments: InferenceInterventionAssessmentV1[],
  ) {
    if (
      !this.options.adapter.descriptor.capabilities.includes("token_assessment")
    )
      throw new TypeError("token_assessment_hook_unavailable_before_stream");
    let output = "",
      window = "",
      count = 0,
      totalTokens = 0,
      totalBytes = 0;
    const examine = async (kind: "token" | "window", content: string) => {
      const values = await this.assess(invocation, {
        kind,
        content,
        contentDigest: digestText(content),
      });
      assessments.push(...values);
      const outcome = this.outcome(values);
      if (outcome.blocked || outcome.intervened)
        throw new Error(`stream_${kind}_intervention_required`);
    };
    for await (const token of tokens) {
      const tokenBytes =
        typeof token === "string" ? encoder.encode(token).byteLength : -1;
      totalTokens++;
      totalBytes += Math.max(0, tokenBytes);
      if (
        tokenBytes < 0 ||
        tokenBytes >
          INFERENCE_INTERVENTION_PAYLOAD_LIMITS_V1.maximumTokenBytes ||
        totalTokens >
          INFERENCE_INTERVENTION_PAYLOAD_LIMITS_V1.maximumTokenCount ||
        totalBytes > INFERENCE_INTERVENTION_PAYLOAD_LIMITS_V1.maximumOutputBytes
      )
        throw new TypeError("stream_output_limits_exceeded");
      output += token;
      window += token;
      count++;
      await examine("token", token);
      if (count >= invocation.policy.maximumWindowTokens) {
        await examine("window", window);
        window = "";
        count = 0;
      }
    }
    if (window) await examine("window", window);
    return output;
  }
  private validateBufferedOutput(output: unknown): string {
    if (
      typeof output !== "string" ||
      encoder.encode(output).byteLength >
        INFERENCE_INTERVENTION_PAYLOAD_LIMITS_V1.maximumOutputBytes
    )
      throw new TypeError("buffered_output_limits_exceeded");
    return output;
  }

  private async requestRepresentation(
    invocation: InferenceInterventionInvocationV1,
  ) {
    const sidecar = this.options.sidecar!;
    const request = createRepresentationInterventionRequestV1({
      schemaVersion: 1,
      requestId: `${invocation.invocationId}:representation`,
      bindingDigest: invocation.binding.bindingDigest,
      policyDigest: invocation.policy.policyDigest,
      inputDigest: invocation.inputDigest,
      step: invocation.step,
      requestedAtLogicalMs: invocation.logicalTimeMs,
    });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new SidecarAmbiguousError(request.requestDigest));
          controller.abort("representation_sidecar_timeout");
        }, invocation.policy.sidecarTimeoutMs);
      });
      const receipt = await Promise.race([
        sidecar.intervene(request, { signal: controller.signal }),
        timeout,
      ]);
      if (timedOut) throw new SidecarAmbiguousError(request.requestDigest);
      try {
        verifyRepresentationInterventionReceiptV1(request, receipt, sidecar);
      } catch {
        throw new SidecarAmbiguousError(request.requestDigest);
      }
      if (receipt.result !== "applied")
        throw new Error("representation_intervention_not_applied");
      return receipt;
    } catch (error) {
      if (
        timedOut ||
        error instanceof SidecarAmbiguousError ||
        (error instanceof Error &&
          error.message === "representation_intervention_not_applied")
      )
        throw timedOut
          ? new SidecarAmbiguousError(request.requestDigest)
          : error;
      // A transport failure cannot prove whether a remote sidecar applied work.
      throw new SidecarAmbiguousError(request.requestDigest);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async finishAmbiguous(
    prepared: InferenceInterventionStateV1,
    original: InferenceInterventionInvocationV1,
    assessments: readonly InferenceInterventionAssessmentV1[],
    requestDigest: string,
  ) {
    const effect = {
      kind: "sidecar_ambiguous" as const,
      invocationId: original.invocationId,
      invocationDigest: this.invocationDigest(original),
      executionDomain: original.executionDomain,
      step: original.step,
      sidecarRequestDigest: requestDigest,
    };
    const terminal = this.state(
      prepared,
      original,
      0,
      0,
      0,
      null,
      { decision: "blocked", outputDigest: null },
      effect,
    );
    if (!(await this.cas(prepared, terminal)))
      throw new Error("terminal_state_commit_conflict");
    return Object.freeze({
      decision: "blocked" as const,
      output: null,
      outputDigest: null,
      receipt: null,
      assessments: Object.freeze([...assessments]),
      state: terminal,
    });
  }

  private async finish(
    prepared: InferenceInterventionStateV1,
    original: InferenceInterventionInvocationV1,
    assessments: readonly InferenceInterventionAssessmentV1[],
    output: string | null,
    receipt: RepresentationInterventionReceiptV1 | null,
    blocked: boolean,
    extraIntervention: boolean,
    clear: number,
  ): Promise<InferenceInterventionResultV1> {
    const canCount =
      extraIntervention &&
      prepared.interventionsUsed <
        original.policy.budget.maximumInterventions &&
      prepared.cooldownUntilLogicalMs <= original.logicalTimeMs;
    const terminal = this.state(
      prepared,
      original,
      canCount ? 1 : 0,
      0,
      clear,
      null,
      {
        decision: blocked ? "blocked" : "allowed",
        outputDigest: output === null ? null : digestText(output),
      },
    );
    if (!(await this.cas(prepared, terminal)))
      throw new Error("terminal_state_commit_conflict");
    return Object.freeze({
      decision: blocked ? "blocked" : "allowed",
      output: blocked ? null : output,
      outputDigest: blocked || output === null ? null : digestText(output),
      receipt,
      assessments: Object.freeze([...assessments]),
      state: terminal,
    });
  }

  private async assess(
    invocation: InferenceInterventionInvocationV1,
    signal: InferenceInterventionSignalV1,
  ) {
    const values = await Promise.all(
      this.options.assessors.map((port) =>
        port.assess({
          binding: invocation.binding,
          policy: invocation.policy,
          step: invocation.step,
          signal,
        }),
      ),
    );
    for (let i = 0; i < values.length; i++)
      this.verifyAssessment(values[i]!, this.options.assessors[i]!);
    return values;
  }
  private verifyAssessment(
    value: InferenceInterventionAssessmentV1,
    port: InferenceInterventionAssessorPortV1,
  ) {
    const limits = INFERENCE_INTERVENTION_PAYLOAD_LIMITS_V1;
    if (
      !value ||
      value.schemaVersion !== 1 ||
      value.assessorId !== port.assessorId ||
      value.assessorVersion !== port.assessorVersion ||
      value.assessorImplementationDigest !==
        port.assessorImplementationDigest ||
      !["allow", "modify", "block", "unavailable"].includes(value.decision) ||
      [value.riskBps, value.uncertaintyBps, value.roleCoherenceBps].some(
        (v) => !Number.isSafeInteger(v) || v < 0 || v > 10_000,
      ) ||
      value.reasonCodes.length > limits.maximumReasonCodes ||
      value.evidenceDigests.length > limits.maximumEvidenceDigests ||
      value.reasonCodes.some(
        (reason) =>
          typeof reason !== "string" ||
          reason.length === 0 ||
          encoder.encode(reason).byteLength > limits.maximumReasonCodeBytes ||
          /[\u0000-\u001f\u007f]/u.test(reason),
      ) ||
      value.evidenceDigests.some(
        (digest) => !/^sha256:[0-9a-f]{64}$/.test(digest),
      )
    )
      throw new TypeError("invalid_assessment");
    const { assessmentDigest, ...unsigned } = value;
    if (
      assessmentDigest !== digestInferenceInterventionV1("assessment", unsigned)
    )
      throw new TypeError("assessment_digest_mismatch");
  }
  private outcome(values: readonly InferenceInterventionAssessmentV1[]) {
    const t = this.options.policy.thresholds;
    return {
      blocked: values.some(
        (v) =>
          v.decision === "block" ||
          v.decision === "unavailable" ||
          v.riskBps >= t.blockRiskBps ||
          v.uncertaintyBps > t.maximumUncertaintyBps ||
          v.roleCoherenceBps < t.minimumRoleCoherenceBps,
      ),
      intervened: values.some(
        (v) => v.decision === "modify" || v.riskBps >= t.interventionRiskBps,
      ),
      clear: values.filter(
        (v) => v.decision === "allow" && v.riskBps < t.interventionRiskBps,
      ).length,
    };
  }

  private makeInvocation(
    raw: Omit<
      InferenceInterventionInvocationV1,
      "binding" | "policy" | "inputDigest" | "executionDomain"
    >,
    executionDomain: "inference" | "tool" | "action",
  ): InferenceInterventionInvocationV1 {
    const invocation = {
      ...raw,
      executionDomain,
      binding: this.options.binding,
      policy: this.options.policy,
      inputDigest: digestText(raw.input),
    };
    if (
      !Number.isSafeInteger(invocation.step) ||
      invocation.step < 1 ||
      invocation.step > invocation.policy.maximumStep ||
      !Number.isSafeInteger(invocation.logicalTimeMs) ||
      invocation.logicalTimeMs < 0 ||
      typeof invocation.invocationId !== "string" ||
      invocation.invocationId.length === 0
    )
      throw new TypeError("invalid_invocation_identity_or_step");
    this.validatePayload(invocation);
    return invocation;
  }
  private validatePayload(invocation: InferenceInterventionInvocationV1) {
    const limits = INFERENCE_INTERVENTION_PAYLOAD_LIMITS_V1;
    if (
      typeof invocation.input !== "string" ||
      encoder.encode(invocation.input).byteLength > limits.maximumInputBytes ||
      invocation.context.length > limits.maximumContextItems ||
      invocation.context.some(
        (item) =>
          typeof item !== "string" ||
          encoder.encode(item).byteLength > limits.maximumContextItemBytes,
      ) ||
      invocation.context.reduce(
        (sum, item) => sum + encoder.encode(item).byteLength,
        0,
      ) > limits.maximumContextBytes ||
      (invocation.modalityParts?.length ?? 0) > limits.maximumModalityParts ||
      (invocation.roleReinforcement !== null &&
        (typeof invocation.roleReinforcement !== "string" ||
          encoder.encode(invocation.roleReinforcement).byteLength >
            limits.maximumRoleReinforcementBytes))
    )
      throw new TypeError("inference_payload_limits_exceeded");
    for (const part of invocation.modalityParts ?? [])
      if (
        !["text", "image", "audio", "video", "sensor"].includes(part.kind) ||
        !/^sha256:[0-9a-f]{64}$/.test(part.contentDigest) ||
        (part.payloadHandle !== undefined &&
          (typeof part.payloadHandle !== "string" ||
            encoder.encode(part.payloadHandle).byteLength >
              limits.maximumPayloadHandleBytes ||
            /[\u0000-\u001f\u007f]/u.test(part.payloadHandle)))
      )
        throw new TypeError("invalid_multimodal_part");
  }
  private transformedManifestDigest(
    invocation: InferenceInterventionInvocationV1,
  ) {
    return digestInferenceInterventionV1("transformed-manifest", {
      inputDigest: invocation.inputDigest,
      contextDigests: invocation.context.map(digestText),
      modalities: (invocation.modalityParts ?? []).map(
        (part: InferenceInterventionModalityPartV1) => ({
          kind: part.kind,
          contentDigest: part.contentDigest,
          payloadHandleDigest:
            part.payloadHandle === undefined
              ? null
              : digestText(part.payloadHandle),
        }),
      ),
    });
  }
  private invocationDigest(i: InferenceInterventionInvocationV1) {
    return digestInferenceInterventionV1(`invocation-${i.executionDomain}`, {
      invocationId: i.invocationId,
      executionDomain: i.executionDomain,
      bindingDigest: i.binding.bindingDigest,
      policyDigest: i.policy.policyDigest,
      inputDigest: i.inputDigest,
      contextDigests: i.context.map(digestText),
      modalityManifestDigest: digestInferenceInterventionV1(
        "modalities",
        (i.modalityParts ?? []).map((p) => ({
          kind: p.kind,
          contentDigest: p.contentDigest,
          payloadHandleDigest:
            p.payloadHandle === undefined ? null : digestText(p.payloadHandle),
        })),
      ),
      roleReinforcementDigest:
        i.roleReinforcement === null ? null : digestText(i.roleReinforcement),
      step: i.step,
      logicalTimeMs: i.logicalTimeMs,
    });
  }

  private replay(
    prior: InferenceInterventionStateV1 | null,
    invocation: InferenceInterventionInvocationV1,
  ): InferenceInterventionResultV1 | null {
    const digest = this.invocationDigest(invocation);
    if (prior?.activeInvocation) {
      if (prior.activeInvocation.invocationId !== invocation.invocationId)
        throw new TypeError("inference_invocation_pending");
      if (
        prior.activeInvocation.invocationDigest !== digest ||
        prior.activeInvocation.step !== invocation.step ||
        prior.activeInvocation.executionDomain !== invocation.executionDomain
      )
        throw new TypeError("conflicting_invocation_id");
      return Object.freeze({
        decision: "blocked",
        output: null,
        outputDigest: null,
        receipt: null,
        assessments: Object.freeze([]),
        state: prior,
      });
    }
    if (prior?.lastInvocation?.invocationId === invocation.invocationId) {
      if (
        prior.lastInvocation.invocationDigest !== digest ||
        prior.lastInvocation.step !== invocation.step ||
        prior.lastInvocation.executionDomain !== invocation.executionDomain
      )
        throw new TypeError("conflicting_invocation_id");
      return Object.freeze({
        decision: prior.lastInvocation.decision,
        output: null,
        outputDigest: prior.lastInvocation.outputDigest,
        receipt: null,
        assessments: Object.freeze([]),
        state: prior,
      });
    }
    return null;
  }
  private assertFresh(
    prior: InferenceInterventionStateV1 | null,
    invocation: InferenceInterventionInvocationV1,
  ) {
    if (!prior) return;
    if (
      invocation.step <= prior.stepHighWater ||
      invocation.logicalTimeMs < prior.logicalTimeHighWaterMs
    )
      throw new TypeError("stale_step_or_logical_time_replay");
  }
  private async validateState(
    prior: InferenceInterventionStateV1 | null,
    invocation: InferenceInterventionInvocationV1,
  ) {
    const anchor = await this.monotonicAnchor.readAnchor(
      keyFor(invocation.binding),
    );
    if (!prior) {
      if (anchor) throw new TypeError("durable_state_missing_below_anchor");
      return;
    }
    const { stateDigest, ...unsigned } = prior;
    const integers = [
      prior.revision,
      prior.logicalTimeHighWaterMs,
      prior.stepHighWater,
      prior.fence,
      prior.interventionsUsed,
      prior.representationRequestsUsed,
      prior.cooldownUntilLogicalMs,
      prior.consecutiveClearAssessments,
    ];
    const stateShape = [
      "activeInvocation",
      "adapterDescriptorDigest",
      "bindingDigest",
      "consecutiveClearAssessments",
      "cooldownUntilLogicalMs",
      "fence",
      "format",
      "interventionsUsed",
      "lastInvocation",
      "lastInvocationDigest",
      "logicalTimeHighWaterMs",
      "policyDigest",
      "representationRequestsUsed",
      "revision",
      "schemaVersion",
      "stateDigest",
      "stateKey",
      "stepHighWater",
      "unresolvedEffect",
    ]
      .sort()
      .join("|");
    const validActive =
      prior.activeInvocation === null ||
      (Object.keys(prior.activeInvocation).sort().join("|") ===
        "executionDomain|invocationDigest|invocationId|step" &&
        typeof prior.activeInvocation.invocationId === "string" &&
        ["inference", "tool", "action"].includes(
          prior.activeInvocation.executionDomain,
        ) &&
        /^sha256:[0-9a-f]{64}$/.test(prior.activeInvocation.invocationDigest) &&
        Number.isSafeInteger(prior.activeInvocation.step) &&
        prior.activeInvocation.step >= 1);
    const validLast =
      prior.lastInvocation === null ||
      (Object.keys(prior.lastInvocation).sort().join("|") ===
        "decision|executionDomain|invocationDigest|invocationId|outputDigest|step" &&
        typeof prior.lastInvocation.invocationId === "string" &&
        ["inference", "tool", "action"].includes(
          prior.lastInvocation.executionDomain,
        ) &&
        /^sha256:[0-9a-f]{64}$/.test(prior.lastInvocation.invocationDigest) &&
        Number.isSafeInteger(prior.lastInvocation.step) &&
        prior.lastInvocation.step >= 1 &&
        ["allowed", "blocked"].includes(prior.lastInvocation.decision) &&
        (prior.lastInvocation.outputDigest === null ||
          /^sha256:[0-9a-f]{64}$/.test(prior.lastInvocation.outputDigest)));
    const validUnresolved =
      prior.unresolvedEffect === null ||
      (Object.keys(prior.unresolvedEffect).sort().join("|") ===
        "executionDomain|invocationDigest|invocationId|kind|sidecarRequestDigest|step" &&
        ["prepared_crash", "sidecar_ambiguous"].includes(
          prior.unresolvedEffect.kind,
        ) &&
        ["inference", "tool", "action"].includes(
          prior.unresolvedEffect.executionDomain,
        ) &&
        /^sha256:[0-9a-f]{64}$/.test(prior.unresolvedEffect.invocationDigest) &&
        (prior.unresolvedEffect.sidecarRequestDigest === null ||
          /^sha256:[0-9a-f]{64}$/.test(
            prior.unresolvedEffect.sidecarRequestDigest,
          )));
    const currentStep =
      prior.activeInvocation?.step ?? prior.lastInvocation?.step ?? 0;
    if (
      Object.keys(prior).sort().join("|") !== stateShape ||
      stateDigest !== digestInferenceInterventionV1("state", unsigned) ||
      prior.format !== HETEROGENEOUS_INFERENCE_INTERVENTION_STATE_FORMAT_V1 ||
      prior.schemaVersion !== 1 ||
      prior.stateKey !== keyFor(invocation.binding) ||
      prior.bindingDigest !== invocation.binding.bindingDigest ||
      prior.policyDigest !== invocation.policy.policyDigest ||
      prior.adapterDescriptorDigest !==
        this.options.adapter.descriptor.descriptorDigest ||
      prior.fence !== invocation.binding.fence ||
      integers.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      prior.revision < 1 ||
      !validActive ||
      !validLast ||
      !validUnresolved ||
      prior.stepHighWater !== currentStep ||
      prior.lastInvocationDigest !==
        (prior.lastInvocation?.invocationDigest ?? null) ||
      (prior.activeInvocation !== null) !==
        (prior.unresolvedEffect?.kind === "prepared_crash") ||
      prior.interventionsUsed > invocation.policy.budget.maximumInterventions ||
      prior.representationRequestsUsed >
        invocation.policy.budget.maximumRepresentationRequests ||
      (prior.activeInvocation !== null &&
        prior.lastInvocation !== null &&
        prior.activeInvocation.step <= prior.lastInvocation.step) ||
      (anchor !== null &&
        (prior.revision < anchor.revision ||
          prior.interventionsUsed < anchor.interventionsUsed ||
          prior.representationRequestsUsed < anchor.representationRequestsUsed))
    )
      throw new TypeError("invalid_durable_intervention_state");
  }
  private state(
    prior: InferenceInterventionStateV1 | null,
    i: InferenceInterventionInvocationV1,
    interventionDelta: number,
    representationDelta: number,
    clear: number,
    active: InferenceInterventionStateV1["activeInvocation"],
    terminal: {
      decision: "allowed" | "blocked";
      outputDigest: string | null;
    } | null,
    unresolved?: InferenceInterventionStateV1["unresolvedEffect"],
  ): InferenceInterventionStateV1 {
    const invocationDigest = this.invocationDigest(i);
    const unresolvedEffect =
      unresolved !== undefined
        ? unresolved
        : active
          ? {
              kind: "prepared_crash" as const,
              invocationId: active.invocationId,
              invocationDigest: active.invocationDigest,
              executionDomain: active.executionDomain,
              step: active.step,
              sidecarRequestDigest: null,
            }
          : terminal
            ? null
            : (prior?.unresolvedEffect ?? null);
    const unsigned = {
      format: HETEROGENEOUS_INFERENCE_INTERVENTION_STATE_FORMAT_V1,
      schemaVersion: 1 as const,
      stateKey: keyFor(i.binding),
      bindingDigest: i.binding.bindingDigest,
      policyDigest: i.policy.policyDigest,
      adapterDescriptorDigest: this.options.adapter.descriptor.descriptorDigest,
      revision: (prior?.revision ?? 0) + 1,
      logicalTimeHighWaterMs: Math.max(
        prior?.logicalTimeHighWaterMs ?? 0,
        i.logicalTimeMs,
      ),
      stepHighWater: Math.max(prior?.stepHighWater ?? 0, i.step),
      fence: i.binding.fence,
      interventionsUsed: (prior?.interventionsUsed ?? 0) + interventionDelta,
      representationRequestsUsed:
        (prior?.representationRequestsUsed ?? 0) + representationDelta,
      cooldownUntilLogicalMs: interventionDelta
        ? i.logicalTimeMs + i.policy.budget.cooldownLogicalMs
        : (prior?.cooldownUntilLogicalMs ?? 0),
      consecutiveClearAssessments: clear
        ? (prior?.consecutiveClearAssessments ?? 0) + clear
        : 0,
      lastInvocationDigest: terminal
        ? invocationDigest
        : (prior?.lastInvocationDigest ?? null),
      activeInvocation: active,
      lastInvocation: terminal
        ? {
            invocationId: i.invocationId,
            invocationDigest,
            executionDomain: i.executionDomain,
            step: i.step,
            decision: terminal.decision,
            outputDigest: terminal.outputDigest,
          }
        : (prior?.lastInvocation ?? null),
      unresolvedEffect,
    };
    return Object.freeze({
      ...unsigned,
      stateDigest: digestInferenceInterventionV1("state", unsigned),
    });
  }
  private cas(
    prior: InferenceInterventionStateV1 | null,
    next: InferenceInterventionStateV1,
  ) {
    return this.store.compareAndSet({
      stateKey: next.stateKey,
      expectedRevision: prior?.revision ?? null,
      expectedStateDigest: prior?.stateDigest ?? null,
      next,
    });
  }
  private assertPort(
    id: unknown,
    version: unknown,
    digest: unknown,
    kind: string,
  ) {
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      !Number.isSafeInteger(version) ||
      (version as number) < 1 ||
      typeof digest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(digest)
    )
      throw new TypeError(`invalid_${kind}_identity`);
  }
}
