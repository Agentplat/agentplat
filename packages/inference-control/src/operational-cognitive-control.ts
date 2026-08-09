import type { JsonValue } from "@agentplat/core";

import {
  invokeAnytimeSemanticGuaranteeAppendV1,
  invokeSemanticHorizonControlV1,
  isAnytimeSemanticGuaranteeEngineV1,
  isSemanticHorizonControlV1,
  validateAnytimeSemanticGuaranteeV1,
  validateSemanticHorizonDecisionV1,
  type AnytimeSemanticGuaranteeEngineV1,
  type AnytimeSemanticGuaranteeV1,
  type SemanticHorizonControlPortV1,
  type SemanticHorizonDecisionV1,
} from "./anytime-semantic-guarantees.js";
import type { SemanticMetricSampleV1 } from "./semantic-metric-engine.js";
import type { SemanticMetricVectorV1 } from "./semantic-alignment-contracts.js";
import {
  ReferenceBlackBoxControllerV1,
  ReferenceRepresentationControllerV1,
  type BlackBoxContextItemV1,
  type BlackBoxControlPolicyV1,
  type BlackBoxControlReceiptV1,
  type RepresentationControlPolicyV1,
  type RepresentationControlReceiptV1,
} from "./reference-controllers.js";
import type {
  InferenceInterventionCheckpointGateRequestV1,
  InferenceInterventionOperationGateRequestV1,
  InferenceInterventionOperationGateResultV1,
} from "./intervention-contracts.js";
import { digestControlJsonV1 } from "./canonical.js";
import {
  InMemorySemanticHorizonBudgetStoreV1,
  SemanticHorizonBudgetLedgerV1,
  type SemanticHorizonBudgetMonotonicAnchorStoreV1,
  type SemanticHorizonBudgetStoreV1,
} from "./semantic-horizon-budget.js";
import {
  assertControlToken,
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from "./validation.js";

export const OPERATIONAL_COGNITIVE_CHECKPOINTS_V1 = Object.freeze([
  "pre_turn",
  "post_turn",
  "pre_tool",
  "pre_effect",
] as const);

export type OperationalCognitiveCheckpointV1 =
  (typeof OPERATIONAL_COGNITIVE_CHECKPOINTS_V1)[number];

export type OperationalCognitiveControlModeV1 =
  "black_box" | "representation_aware";

export type OperationalCognitiveObserverKindV1 =
  "coherence" | "objective_alignment" | "context_conflict" | "uncertainty";

export interface OperationalCognitiveObservationRequestV1 {
  readonly schemaVersion: 1;
  readonly controlId: string;
  readonly operationId: string;
  readonly checkpoint: OperationalCognitiveCheckpointV1;
  readonly bindingDigest: string;
  readonly sequence: number;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly material: string;
  readonly contextItemDigests: readonly string[];
  readonly allowedToolNames: readonly string[];
}

export interface OperationalCognitiveObserverResultV1 {
  readonly valueBasisPoints: number | null;
  readonly evidenceDigests: readonly string[];
  readonly reasonCodes: readonly string[];
}

export interface OperationalCognitiveObserverV1 {
  readonly observerId: string;
  readonly observerVersion: number;
  readonly observerImplementationDigest: string;
  readonly kind: OperationalCognitiveObserverKindV1;
  observe(
    request: OperationalCognitiveObservationRequestV1,
  ):
    | OperationalCognitiveObserverResultV1
    | Promise<OperationalCognitiveObserverResultV1>;
}

export interface OperationalCognitiveObserversV1 {
  readonly coherence: OperationalCognitiveObserverV1;
  readonly objective: OperationalCognitiveObserverV1;
  readonly context: OperationalCognitiveObserverV1;
  readonly uncertainty: OperationalCognitiveObserverV1;
}

export interface OperationalAnytimeGuaranteePortV1 {
  append(input: {
    readonly stateKey: string;
    readonly sample: SemanticMetricSampleV1;
  }): Promise<AnytimeSemanticGuaranteeV1>;
}

/** Narrow structural port implemented by HeterogeneousInferenceInterventionRuntimeV1. */
export interface OperationalInterventionPortV1 {
  gateCheckpoint(
    input: InferenceInterventionCheckpointGateRequestV1,
  ): Promise<InferenceInterventionOperationGateResultV1>;
  gateOperation(
    input: InferenceInterventionOperationGateRequestV1,
  ): Promise<InferenceInterventionOperationGateResultV1>;
}

export interface OperationalControlledInferenceRequestV1 {
  readonly operationId: string;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly input: string;
  readonly context: readonly BlackBoxContextItemV1[];
  readonly allowedToolNames: readonly string[];
  readonly roleReinforcement: string;
  readonly blackBoxReceipt: BlackBoxControlReceiptV1;
  readonly controlledActivation: readonly number[] | null;
  readonly representationReceipt: RepresentationControlReceiptV1 | null;
}

export interface OperationalInferencePortV1 {
  execute(request: OperationalControlledInferenceRequestV1): Promise<string>;
}

export interface OperationalObservationV1 {
  readonly schemaVersion: 1;
  readonly controlId: string;
  readonly operationId: string;
  readonly checkpoint: OperationalCognitiveCheckpointV1;
  readonly sequence: number;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly metrics: SemanticMetricVectorV1;
  readonly observerBindings: readonly {
    readonly observerId: string;
    readonly observerVersion: number;
    readonly observerImplementationDigest: string;
    readonly kind: OperationalCognitiveObserverKindV1;
  }[];
  readonly observerEvidenceDigests: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly observationDigest: string;
}

export interface OperationalObservationEmissionV1 {
  readonly schemaVersion: 1;
  readonly observation: OperationalObservationV1;
  readonly guarantee: AnytimeSemanticGuaranteeV1;
  readonly horizonDecision: SemanticHorizonDecisionV1;
}

export interface OperationalObservationSinkV1 {
  emit(emission: OperationalObservationEmissionV1): void | Promise<void>;
}

export interface OperationalRepresentationMaterialV1 {
  readonly activation: readonly number[];
  readonly activationDigest: string;
  readonly roleVector: readonly number[];
  readonly roleVectorDigest: string;
  readonly prohibitedVectors: readonly {
    readonly vectorDigest: string;
    readonly values: readonly number[];
  }[];
}

export interface OperationalTurnRequestV1 {
  readonly operationId: string;
  /** The post-turn observation uses observationSequence + 1. */
  readonly observationSequence: number;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly bindingDigest: string;
  readonly input: string;
  readonly context: readonly BlackBoxContextItemV1[];
  readonly requestedToolNames: readonly string[];
  readonly memoryQueryDigest: string | null;
  readonly representation: OperationalRepresentationMaterialV1 | null;
}

export type OperationalTurnStatusV1 =
  "completed" | "blocked" | "replan_required" | "safe_stopped";

export interface OperationalTurnResultV1 {
  readonly status: OperationalTurnStatusV1;
  readonly output: string | null;
  readonly horizonDecision: SemanticHorizonDecisionV1;
  readonly blackBoxReceipt: BlackBoxControlReceiptV1 | null;
  readonly representationReceipt: RepresentationControlReceiptV1 | null;
  readonly interventionStateDigest: string | null;
  readonly reasonCodes: readonly string[];
}

export interface OperationalBoundaryRequestV1 {
  readonly operationId: string;
  readonly observationSequence: number;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly bindingDigest: string;
  readonly payload: string;
  readonly contextItemDigests?: readonly string[];
  readonly allowedToolNames?: readonly string[];
}

export interface OperationalToolBoundaryRequestV1 extends OperationalBoundaryRequestV1 {
  readonly toolName: string;
}

export interface OperationalBoundaryResultV1<T> {
  readonly allowed: boolean;
  readonly value: T | null;
  readonly horizonDecision: SemanticHorizonDecisionV1;
  readonly interventionStateDigest: string | null;
  readonly reasonCodes: readonly string[];
}

/** Read-only recovery result for a pre-effect authorization already debited. */
export interface OperationalPreEffectReconciliationV1<T> {
  readonly authorized: boolean;
  readonly value: T | null;
}

export interface OperationalCognitiveControllerOptionsV1 {
  readonly controlId: string;
  readonly mode: OperationalCognitiveControlModeV1;
  readonly guaranteeStateKey: string;
  readonly blackBoxPolicy: BlackBoxControlPolicyV1;
  readonly representationPolicy?: RepresentationControlPolicyV1;
  readonly observers: OperationalCognitiveObserversV1;
  readonly intervention: OperationalInterventionPortV1;
  readonly guarantee: OperationalAnytimeGuaranteePortV1;
  readonly horizonControl: SemanticHorizonControlPortV1;
  /** Explicit repositories preserve consumed horizon across reconstruction. */
  readonly horizonBudgetStore?: SemanticHorizonBudgetStoreV1;
  readonly horizonBudgetMonotonicAnchor?: SemanticHorizonBudgetMonotonicAnchorStoreV1;
  readonly horizonBudgetStateKey?: string;
  readonly horizonBudgetMaximumCasAttempts?: number;
  readonly inference: OperationalInferencePortV1;
  readonly observationSink?: OperationalObservationSinkV1;
}

type Observed = {
  readonly emission: OperationalObservationEmissionV1;
  readonly blockingStatus: "replan_required" | "safe_stopped" | null;
};

interface OperationalCognitiveControllerInvokersV1 {
  runTurn(request: OperationalTurnRequestV1): Promise<OperationalTurnResultV1>;
  runPreTool<T>(
    request: OperationalToolBoundaryRequestV1,
    dispatch: () => T | Promise<T>,
  ): Promise<OperationalBoundaryResultV1<T>>;
  runPreEffect<T>(
    request: OperationalBoundaryRequestV1,
    commit: () => T | Promise<T>,
  ): Promise<OperationalBoundaryResultV1<T>>;
  reconcilePreEffect<T>(
    request: OperationalBoundaryRequestV1,
    commit: () => T | Promise<T>,
  ): Promise<OperationalPreEffectReconciliationV1<T>>;
}

const operationalCognitiveControllerInvokersV1 = new WeakMap<
  object,
  OperationalCognitiveControllerInvokersV1
>();
const operationalCognitiveConcreteSemanticBindingV1 = new WeakSet<object>();
const operationalCognitiveDurableHorizonBudgetBindingV1 = new WeakSet<object>();

/**
 * Executable, provider-neutral cognitive control loop. It composes the
 * package's existing reference controllers, intervention gates and anytime
 * guarantee engine; it does not create provider, tool or effect authority.
 */
export class OperationalCognitiveControllerV1 {
  readonly #blackBox: ReferenceBlackBoxControllerV1;
  readonly #representation: ReferenceRepresentationControllerV1 | null;
  readonly #appendGuarantee: OperationalAnytimeGuaranteePortV1["append"];
  readonly #decideHorizon: SemanticHorizonControlPortV1["decide"];
  readonly #gateCheckpoint: OperationalInterventionPortV1["gateCheckpoint"];
  readonly #gateOperation: OperationalInterventionPortV1["gateOperation"];
  readonly #observers: OperationalCognitiveObserversV1;
  readonly #observerBindings: OperationalObservationV1["observerBindings"];
  readonly #executeInference: OperationalInferencePortV1["execute"];
  readonly #emitObservation: OperationalObservationSinkV1["emit"] | null;
  readonly #horizonBudget: SemanticHorizonBudgetLedgerV1;

  constructor(readonly options: OperationalCognitiveControllerOptionsV1) {
    const guarantee = options.guarantee;
    const horizonControl = options.horizonControl;
    assertIdentifier(options.controlId, "controlId");
    assertIdentifier(options.guaranteeStateKey, "guaranteeStateKey");
    if (
      (options.horizonBudgetStateKey !== undefined ||
        options.horizonBudgetMonotonicAnchor !== undefined) &&
      options.horizonBudgetStore === undefined
    )
      throw new TypeError("operational_horizon_budget_store_required");
    if (
      options.horizonBudgetStore !== undefined &&
      options.horizonBudgetMonotonicAnchor === undefined
    )
      throw new TypeError(
        "operational_horizon_budget_monotonic_anchor_required",
      );
    const horizonBudgetStateKey =
      options.horizonBudgetStateKey ??
      `${options.guaranteeStateKey}:operational:${options.controlId}`;
    assertIdentifier(horizonBudgetStateKey, "horizonBudgetStateKey");
    const horizonBudgetStore =
      options.horizonBudgetStore ?? new InMemorySemanticHorizonBudgetStoreV1();
    this.#horizonBudget = new SemanticHorizonBudgetLedgerV1({
      stateKey: horizonBudgetStateKey,
      store: horizonBudgetStore,
      monotonicAnchor: options.horizonBudgetMonotonicAnchor,
      maximumCasAttempts: options.horizonBudgetMaximumCasAttempts,
    });
    if (
      !options.intervention ||
      typeof options.intervention.gateCheckpoint !== "function" ||
      typeof options.intervention.gateOperation !== "function"
    )
      throw new TypeError("operational_intervention_port_required");
    const intervention = options.intervention;
    this.#gateCheckpoint = intervention.gateCheckpoint.bind(intervention);
    this.#gateOperation = intervention.gateOperation.bind(intervention);
    if (!guarantee || typeof guarantee.append !== "function")
      throw new TypeError("operational_anytime_guarantee_port_required");
    if (!horizonControl || typeof horizonControl.decide !== "function")
      throw new TypeError("operational_horizon_control_port_required");
    const inference = options.inference;
    const executeInference = inference?.execute;
    if (!inference || typeof executeInference !== "function")
      throw new TypeError("operational_inference_port_required");
    const observationSink = options.observationSink;
    const emitObservation = observationSink?.emit;
    if (observationSink && typeof emitObservation !== "function")
      throw new TypeError("operational_observation_sink_invalid");
    const concreteGuarantee = isAnytimeSemanticGuaranteeEngineV1(guarantee);
    const structuralHorizonDecision =
      horizonControl.decide.bind(horizonControl);
    const concreteHorizon = isSemanticHorizonControlV1(horizonControl);
    this.#appendGuarantee = concreteGuarantee
      ? (input) =>
          invokeAnytimeSemanticGuaranteeAppendV1(
            guarantee as AnytimeSemanticGuaranteeEngineV1,
            input,
          )
      : guarantee.append.bind(guarantee);
    this.#decideHorizon = concreteHorizon
      ? (guarantee) => invokeSemanticHorizonControlV1(horizonControl, guarantee)
      : structuralHorizonDecision;
    this.#observers = captureOperationalObservers(options.observers);
    this.#observerBindings = deepFreeze(
      [
        this.#observers.coherence,
        this.#observers.objective,
        this.#observers.context,
        this.#observers.uncertainty,
      ].map(
        ({
          observerId,
          observerVersion,
          observerImplementationDigest,
          kind,
        }) => ({
          observerId,
          observerVersion,
          observerImplementationDigest,
          kind,
        }),
      ),
    );
    this.#executeInference = executeInference.bind(inference);
    this.#emitObservation = observationSink
      ? emitObservation!.bind(observationSink)
      : null;
    this.#blackBox = new ReferenceBlackBoxControllerV1(options.blackBoxPolicy);
    if (options.mode === "representation_aware") {
      if (!options.representationPolicy)
        throw new TypeError("operational_representation_policy_required");
      this.#representation = new ReferenceRepresentationControllerV1(
        options.representationPolicy,
      );
    } else if (options.mode === "black_box") {
      if (options.representationPolicy)
        throw new TypeError("operational_representation_policy_unexpected");
      this.#representation = null;
    } else throw new TypeError("operational_control_mode_invalid");
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        ...options,
        observers: this.#observers,
        guarantee,
        horizonControl,
        horizonBudgetStore,
        ...(options.horizonBudgetMonotonicAnchor
          ? {
              horizonBudgetMonotonicAnchor:
                options.horizonBudgetMonotonicAnchor,
            }
          : {}),
        horizonBudgetStateKey,
        inference: Object.freeze({ execute: this.#executeInference }),
        ...(this.#emitObservation
          ? {
              observationSink: Object.freeze({ emit: this.#emitObservation }),
            }
          : {}),
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    const invokers: OperationalCognitiveControllerInvokersV1 = Object.freeze({
      runTurn: (request: OperationalTurnRequestV1) => this.#runTurn(request),
      runPreTool: <T>(
        request: OperationalToolBoundaryRequestV1,
        dispatch: () => T | Promise<T>,
      ) => this.#runPreTool(request, dispatch),
      runPreEffect: <T>(
        request: OperationalBoundaryRequestV1,
        commit: () => T | Promise<T>,
      ) => this.#runPreEffect(request, commit),
      reconcilePreEffect: <T>(
        request: OperationalBoundaryRequestV1,
        commit: () => T | Promise<T>,
      ) => this.#reconcilePreEffect(request, commit),
    });
    operationalCognitiveControllerInvokersV1.set(this, invokers);
    if (concreteGuarantee && concreteHorizon)
      operationalCognitiveConcreteSemanticBindingV1.add(this);
    if (options.horizonBudgetStore && options.horizonBudgetMonotonicAnchor)
      operationalCognitiveDurableHorizonBudgetBindingV1.add(this);
    Object.defineProperties(this, {
      runTurn: immutableOperationalInvoker(invokers.runTurn),
      runPreTool: immutableOperationalInvoker(invokers.runPreTool),
      runPreEffect: immutableOperationalInvoker(invokers.runPreEffect),
    });
  }

  async runTurn(
    request: OperationalTurnRequestV1,
  ): Promise<OperationalTurnResultV1> {
    return invokeOperationalCognitiveRunTurnV1(this, request);
  }

  async #runTurn(
    request: OperationalTurnRequestV1,
  ): Promise<OperationalTurnResultV1> {
    validateTurnRequest(request, this.options.mode);
    const contextDigests = canonicalDigests(
      request.context.map((item) => item.contentDigest),
      "contextItemDigests",
    );
    const requestedTools = canonicalTokens(
      request.requestedToolNames,
      "requestedToolNames",
    );
    const pre = await this.#observe({
      operationId: request.operationId,
      checkpoint: "pre_turn",
      bindingDigest: request.bindingDigest,
      sequence: request.observationSequence,
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
      material: request.input,
      contextItemDigests: contextDigests,
      allowedToolNames: requestedTools,
    });
    if (pre.blockingStatus)
      return turnBlocked(
        pre.blockingStatus,
        pre.emission.horizonDecision,
        null,
        null,
        null,
      );

    const preGate = await this.#gateCheckpoint({
      operationId: `${request.operationId}:pre-turn`,
      kind: "input",
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
      payload: request.input,
    });
    if (!preGate.allowed)
      return turnBlocked(
        "blocked",
        pre.emission.horizonDecision,
        null,
        null,
        preGate.state.stateDigest,
        ["pre_turn_intervention_blocked"],
      );

    const blackBox = this.#blackBox.control({
      requestId: request.operationId,
      bindingDigest: request.bindingDigest,
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
      context: request.context,
      requestedToolNames: requestedTools,
      memoryQueryDigest: request.memoryQueryDigest,
    });
    if (blackBox.receipt.disposition === "abstain")
      return turnBlocked(
        "safe_stopped",
        pre.emission.horizonDecision,
        blackBox.receipt,
        null,
        preGate.state.stateDigest,
        blackBox.receipt.reasonCodes,
      );

    let controlledActivation: readonly number[] | null = null;
    let representationReceipt: RepresentationControlReceiptV1 | null = null;
    if (this.#representation) {
      const representation = request.representation!;
      const controlled = this.#representation.intervene({
        requestId: request.operationId,
        bindingDigest: request.bindingDigest,
        activation: representation.activation,
        activationDigest: representation.activationDigest,
        roleVector: representation.roleVector,
        roleVectorDigest: representation.roleVectorDigest,
        prohibitedVectors: representation.prohibitedVectors,
        step: request.step,
        logicalTimeMs: request.logicalTimeMs,
      });
      representationReceipt = controlled.receipt;
      if (controlled.receipt.result === "rejected")
        return turnBlocked(
          "safe_stopped",
          pre.emission.horizonDecision,
          blackBox.receipt,
          controlled.receipt,
          preGate.state.stateDigest,
          [controlled.receipt.reasonCode],
        );
      controlledActivation = controlled.activation;
    }

    if (
      !(await this.#horizonBudget.consume(pre.emission.horizonDecision, {
        consumptionId: request.operationId,
        bindingDigest: request.bindingDigest,
      }))
    )
      return turnBlocked(
        "replan_required",
        pre.emission.horizonDecision,
        blackBox.receipt,
        representationReceipt,
        preGate.state.stateDigest,
        ["semantic_horizon_exhausted"],
      );

    const output = await this.#executeInference({
      operationId: request.operationId,
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
      input: request.input,
      context: blackBox.context,
      allowedToolNames: blackBox.allowedToolNames,
      roleReinforcement: blackBox.roleReinforcement,
      blackBoxReceipt: blackBox.receipt,
      controlledActivation,
      representationReceipt,
    });
    if (typeof output !== "string")
      throw new TypeError("operational_inference_output_invalid");

    const post = await this.#observe({
      operationId: request.operationId,
      checkpoint: "post_turn",
      bindingDigest: request.bindingDigest,
      sequence: request.observationSequence + 1,
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
      material: output,
      contextItemDigests: blackBox.receipt.selectedItemDigests,
      allowedToolNames: blackBox.allowedToolNames,
    });
    const postGate = await this.#gateCheckpoint({
      operationId: `${request.operationId}:post-turn`,
      kind: "output",
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
      payload: output,
    });
    if (!postGate.allowed)
      return turnBlocked(
        "blocked",
        post.emission.horizonDecision,
        blackBox.receipt,
        representationReceipt,
        postGate.state.stateDigest,
        ["post_turn_intervention_blocked"],
      );
    if (post.blockingStatus)
      return turnBlocked(
        post.blockingStatus,
        post.emission.horizonDecision,
        blackBox.receipt,
        representationReceipt,
        postGate.state.stateDigest,
      );
    return deepFreeze({
      status: "completed",
      output,
      horizonDecision: post.emission.horizonDecision,
      blackBoxReceipt: blackBox.receipt,
      representationReceipt,
      interventionStateDigest: postGate.state.stateDigest,
      reasonCodes: post.emission.horizonDecision.reasonCodes,
    });
  }

  /** The tool callback is invoked only after the final pre-tool gate. */
  async runPreTool<T>(
    request: OperationalToolBoundaryRequestV1,
    dispatch: () => T | Promise<T>,
  ): Promise<OperationalBoundaryResultV1<T>> {
    return invokeOperationalCognitiveRunPreToolV1(this, request, dispatch);
  }

  async #runPreTool<T>(
    request: OperationalToolBoundaryRequestV1,
    dispatch: () => T | Promise<T>,
  ): Promise<OperationalBoundaryResultV1<T>> {
    canonicalTokens([request.toolName], "toolName");
    return this.#runBoundary(request, "pre_tool", "tool", dispatch);
  }

  /** The effect callback is invoked only after the final pre-effect gate. */
  async runPreEffect<T>(
    request: OperationalBoundaryRequestV1,
    commit: () => T | Promise<T>,
  ): Promise<OperationalBoundaryResultV1<T>> {
    return invokeOperationalCognitiveRunPreEffectV1(this, request, commit);
  }

  async #runPreEffect<T>(
    request: OperationalBoundaryRequestV1,
    commit: () => T | Promise<T>,
  ): Promise<OperationalBoundaryResultV1<T>> {
    return this.#runBoundary(request, "pre_effect", "action", commit);
  }

  async #reconcilePreEffect<T>(
    request: OperationalBoundaryRequestV1,
    commit: () => T | Promise<T>,
  ): Promise<OperationalPreEffectReconciliationV1<T>> {
    validateBoundaryRequest(request);
    if (typeof commit !== "function")
      throw new TypeError("operational_boundary_callback_required");
    const authorized = await this.#horizonBudget.reconcileConsumption({
      consumptionId: boundaryConsumptionId(request.operationId, "pre_effect"),
      bindingDigest: request.bindingDigest,
    });
    if (!authorized) return Object.freeze({ authorized: false, value: null });
    return Object.freeze({ authorized: true, value: await commit() });
  }

  async #runBoundary<T>(
    request: OperationalBoundaryRequestV1,
    checkpoint: "pre_tool" | "pre_effect",
    kind: "tool" | "action",
    execute: () => T | Promise<T>,
  ): Promise<OperationalBoundaryResultV1<T>> {
    validateBoundaryRequest(request);
    if (typeof execute !== "function")
      throw new TypeError("operational_boundary_callback_required");
    const observed = await this.#observe({
      operationId: request.operationId,
      checkpoint,
      bindingDigest: request.bindingDigest,
      sequence: request.observationSequence,
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
      material: request.payload,
      contextItemDigests: canonicalDigests(
        request.contextItemDigests ?? [],
        "contextItemDigests",
      ),
      allowedToolNames: canonicalTokens(
        request.allowedToolNames ?? [],
        "allowedToolNames",
      ),
    });
    if (observed.blockingStatus)
      return deepFreeze({
        allowed: false,
        value: null,
        horizonDecision: observed.emission.horizonDecision,
        interventionStateDigest: null,
        reasonCodes: observed.emission.horizonDecision.reasonCodes,
      });
    if (
      kind === "tool" &&
      !this.#blackBox.policy.allowedToolNames.includes(
        (request as OperationalToolBoundaryRequestV1).toolName,
      )
    )
      return deepFreeze({
        allowed: false,
        value: null,
        horizonDecision: observed.emission.horizonDecision,
        interventionStateDigest: null,
        reasonCodes: ["tool_not_authorized"],
      });
    const gate = await this.#gateOperation({
      operationId: request.operationId,
      kind,
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
      payload: request.payload,
    });
    if (!gate.allowed)
      return deepFreeze({
        allowed: false,
        value: null,
        horizonDecision: observed.emission.horizonDecision,
        interventionStateDigest: gate.state.stateDigest,
        reasonCodes: [`${checkpoint}_intervention_blocked`],
      });
    if (
      !(await this.#horizonBudget.consume(observed.emission.horizonDecision, {
        consumptionId: boundaryConsumptionId(request.operationId, checkpoint),
        bindingDigest: request.bindingDigest,
      }))
    )
      return deepFreeze({
        allowed: false,
        value: null,
        horizonDecision: observed.emission.horizonDecision,
        interventionStateDigest: gate.state.stateDigest,
        reasonCodes: ["semantic_horizon_exhausted"],
      });
    return Object.freeze({
      allowed: true,
      value: await execute(),
      horizonDecision: observed.emission.horizonDecision,
      interventionStateDigest: gate.state.stateDigest,
      reasonCodes: observed.emission.horizonDecision.reasonCodes,
    });
  }

  async #observe(
    request: Omit<
      OperationalCognitiveObservationRequestV1,
      "schemaVersion" | "controlId"
    >,
  ): Promise<Observed> {
    const full = deepFreeze({
      schemaVersion: 1 as const,
      controlId: this.options.controlId,
      ...request,
    });
    const [coherence, objective, context, uncertainty] = await Promise.all([
      this.#observers.coherence.observe(full),
      this.#observers.objective.observe(full),
      this.#observers.context.observe(full),
      this.#observers.uncertainty.observe(full),
    ]);
    const values = [coherence, objective, context, uncertainty] as const;
    for (const [index, value] of values.entries())
      validateObserverResult(value, `observerResult[${index}]`);
    const metrics = deepFreeze({
      roleCoherenceBps: coherence.valueBasisPoints,
      missionAlignmentBps: objective.valueBasisPoints,
      contextConflictBps: context.valueBasisPoints,
      uncertaintyBps: uncertainty.valueBasisPoints,
      courseActionDiversityBps: null,
      courseActionNoveltyBps: null,
    } satisfies SemanticMetricVectorV1);
    const observerEvidenceDigests = canonicalDigests(
      values.flatMap((value) => value.evidenceDigests),
      "observerEvidenceDigests",
    );
    const reasonCodes = canonicalTokens(
      values.flatMap((value) => value.reasonCodes),
      "reasonCodes",
    );
    const body = {
      schemaVersion: 1 as const,
      controlId: full.controlId,
      operationId: full.operationId,
      checkpoint: full.checkpoint,
      sequence: full.sequence,
      step: full.step,
      logicalTimeMs: full.logicalTimeMs,
      metrics,
      observerBindings: this.#observerBindings,
      observerEvidenceDigests,
      reasonCodes,
    };
    const observation = deepFreeze({
      ...body,
      observationDigest: digestControlJsonV1(
        "trace",
        body as unknown as JsonValue,
      ),
    });
    const guarantee = validateAnytimeSemanticGuaranteeV1(
      await this.#appendGuarantee({
        stateKey: this.options.guaranteeStateKey,
        sample: {
          sequence: observation.sequence,
          logicalTimeMs: observation.logicalTimeMs,
          metrics: observation.metrics,
          assessmentDigest: observation.observationDigest,
        },
      }),
    );
    const horizonDecision = validateSemanticHorizonDecisionV1(
      this.#decideHorizon(guarantee),
      guarantee,
    );
    await this.#horizonBudget.apply(guarantee, horizonDecision);
    const emission = deepFreeze({
      schemaVersion: 1 as const,
      observation,
      guarantee,
      horizonDecision,
    });
    await this.#emitObservation?.(emission);
    return {
      emission,
      blockingStatus:
        horizonDecision.directive === "safe_stop"
          ? "safe_stopped"
          : horizonDecision.directive === "replan"
            ? "replan_required"
            : null,
    };
  }
}

/**
 * Nominal runtime check for closed compositions. The module-private brand
 * prevents a structural object from replacing the operational control loop
 * with caller-authored success values.
 */
export function isOperationalCognitiveControllerV1(
  value: unknown,
): value is OperationalCognitiveControllerV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    operationalCognitiveControllerInvokersV1.has(value)
  );
}

/** True only when the controller captured the concrete statistical engine and horizon. */
export function isOperationalCognitiveControllerBoundToSemanticGuaranteesV1(
  value: unknown,
): value is OperationalCognitiveControllerV1 {
  return (
    isOperationalCognitiveControllerV1(value) &&
    operationalCognitiveConcreteSemanticBindingV1.has(value)
  );
}

/** True only when reconstruction can reuse an explicitly supplied budget store. */
export function isOperationalCognitiveControllerBoundToDurableHorizonBudgetV1(
  value: unknown,
): value is OperationalCognitiveControllerV1 {
  return (
    isOperationalCognitiveControllerV1(value) &&
    operationalCognitiveDurableHorizonBudgetBindingV1.has(value)
  );
}

/** Invokes the construction-time turn implementation, ignoring public overrides. */
export function invokeOperationalCognitiveRunTurnV1(
  controller: OperationalCognitiveControllerV1,
  request: OperationalTurnRequestV1,
): Promise<OperationalTurnResultV1> {
  return operationalInvokers(controller).runTurn(request);
}

/** Runs the pre-tool boundary through the library-owned controller closure. */
export function invokeOperationalCognitiveRunPreToolV1<T>(
  controller: OperationalCognitiveControllerV1,
  request: OperationalToolBoundaryRequestV1,
  dispatch: () => T | Promise<T>,
): Promise<OperationalBoundaryResultV1<T>> {
  return operationalInvokers(controller).runPreTool(request, dispatch);
}

/** Runs the pre-effect boundary through the library-owned controller closure. */
export function invokeOperationalCognitiveRunPreEffectV1<T>(
  controller: OperationalCognitiveControllerV1,
  request: OperationalBoundaryRequestV1,
  commit: () => T | Promise<T>,
): Promise<OperationalBoundaryResultV1<T>> {
  return operationalInvokers(controller).runPreEffect(request, commit);
}

/**
 * Replays only an already debited pre-effect authorization. It never observes,
 * appends a semantic sample, advances intervention state, or consumes again.
 */
export function reconcileOperationalCognitivePreEffectV1<T>(
  controller: OperationalCognitiveControllerV1,
  request: OperationalBoundaryRequestV1,
  commit: () => T | Promise<T>,
): Promise<OperationalPreEffectReconciliationV1<T>> {
  return operationalInvokers(controller).reconcilePreEffect(request, commit);
}

function operationalInvokers(
  controller: OperationalCognitiveControllerV1,
): OperationalCognitiveControllerInvokersV1 {
  const invokers =
    typeof controller === "object" && controller !== null
      ? operationalCognitiveControllerInvokersV1.get(controller)
      : undefined;
  if (!invokers)
    throw new TypeError(
      "concrete operational cognitive controller is required",
    );
  return invokers;
}

function immutableOperationalInvoker(value: unknown): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}

function turnBlocked(
  status: Exclude<OperationalTurnStatusV1, "completed">,
  horizonDecision: SemanticHorizonDecisionV1,
  blackBoxReceipt: BlackBoxControlReceiptV1 | null,
  representationReceipt: RepresentationControlReceiptV1 | null,
  interventionStateDigest: string | null,
  reasonCodes: readonly string[] = horizonDecision.reasonCodes,
): OperationalTurnResultV1 {
  return deepFreeze({
    status,
    output: null,
    horizonDecision,
    blackBoxReceipt,
    representationReceipt,
    interventionStateDigest,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  });
}

function captureOperationalObservers(
  observers: OperationalCognitiveObserversV1,
): OperationalCognitiveObserversV1 {
  const ids = new Set<string>();
  const capture = <K extends keyof OperationalCognitiveObserversV1>(
    key: K,
    kind: OperationalCognitiveObserverKindV1,
  ): OperationalCognitiveObserverV1 => {
    const observer = observers?.[key];
    const observerId = observer?.observerId;
    const observerVersion = observer?.observerVersion;
    const observerImplementationDigest = observer?.observerImplementationDigest;
    const actualKind = observer?.kind;
    const observe = observer?.observe;
    if (!observer || actualKind !== kind || typeof observe !== "function")
      throw new TypeError(`operational_${kind}_observer_required`);
    assertIdentifier(observerId, `${key}.observerId`);
    integer(
      observerVersion,
      `${key}.observerVersion`,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const normalizedVersion = observerVersion as number;
    assertDigest(
      observerImplementationDigest,
      `${key}.observerImplementationDigest`,
    );
    if (ids.has(observerId))
      throw new TypeError("operational_observer_id_duplicate");
    ids.add(observerId);
    const capturedObserve = observe.bind(
      observer,
    ) as OperationalCognitiveObserverV1["observe"];
    return Object.freeze({
      observerId,
      observerVersion: normalizedVersion,
      observerImplementationDigest,
      kind: actualKind,
      observe: capturedObserve,
    });
  };
  return Object.freeze({
    coherence: capture("coherence", "coherence"),
    objective: capture("objective", "objective_alignment"),
    context: capture("context", "context_conflict"),
    uncertainty: capture("uncertainty", "uncertainty"),
  });
}

function validateObserverResult(
  result: OperationalCognitiveObserverResultV1,
  label: string,
): void {
  if (!result || typeof result !== "object")
    throw new TypeError(`${label}_invalid`);
  if (result.valueBasisPoints !== null)
    integer(result.valueBasisPoints, `${label}.valueBasisPoints`, 0, 10_000);
  canonicalDigests(result.evidenceDigests, `${label}.evidenceDigests`);
  canonicalTokens(result.reasonCodes, `${label}.reasonCodes`);
}

function validateTurnRequest(
  request: OperationalTurnRequestV1,
  mode: OperationalCognitiveControlModeV1,
): void {
  validateBaseRequest(request);
  if (!Array.isArray(request.context))
    throw new TypeError("operational_context_invalid");
  if (!Array.isArray(request.requestedToolNames))
    throw new TypeError("operational_requested_tools_invalid");
  if (request.memoryQueryDigest !== null)
    assertDigest(request.memoryQueryDigest, "memoryQueryDigest");
  if (mode === "representation_aware" && !request.representation)
    throw new TypeError("operational_representation_material_required");
  if (mode === "black_box" && request.representation !== null)
    throw new TypeError("operational_representation_material_unexpected");
  if (request.observationSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError(
      "observationSequence cannot allocate post-turn sample",
    );
}

function validateBoundaryRequest(request: OperationalBoundaryRequestV1): void {
  validateBaseRequest(request);
  canonicalDigests(request.contextItemDigests ?? [], "contextItemDigests");
  canonicalTokens(request.allowedToolNames ?? [], "allowedToolNames");
}

function boundaryConsumptionId(
  operationId: string,
  checkpoint: "pre_tool" | "pre_effect",
): string {
  return `${operationId}:${checkpoint}`;
}

function validateBaseRequest(request: {
  readonly operationId: string;
  readonly observationSequence: number;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly bindingDigest: string;
  readonly input?: string;
  readonly payload?: string;
}): void {
  assertIdentifier(request.operationId, "operationId");
  integer(
    request.observationSequence,
    "observationSequence",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(request.step, "step", 0, Number.MAX_SAFE_INTEGER);
  integer(request.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  assertDigest(request.bindingDigest, "bindingDigest");
  const material = request.input ?? request.payload;
  if (typeof material !== "string")
    throw new TypeError("operational_material_invalid");
}

function canonicalDigests(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label}_invalid`);
  const canonical = [...new Set(values)].sort();
  for (const value of canonical) assertDigest(value, label);
  return Object.freeze(canonical);
}

function canonicalTokens(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label}_invalid`);
  const canonical = [...new Set(values)].sort();
  for (const value of canonical) assertControlToken(value, label);
  return Object.freeze(canonical);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): void {
  assertSafeInteger(value, label, minimum);
  if ((value as number) > maximum) throw new RangeError(`${label}_invalid`);
}
