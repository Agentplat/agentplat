import {
  TypeSafeClient,
  type Questions,
  type SystemOneRequest,
  type SystemOneResult,
} from '@typesafe-ai/sdk';
import type {
  ControlledAgentAssessmentRequestV1,
  ControlledAgentAssessorV1,
} from '@agentplat/inference-control/runtime';

export interface TypeSafeAssessmentIdentityV1 {
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
}

export interface TypeSafeDecisionClientOptionsV1 {
  /** Explicit secret. The adapter never reads process environment variables. */
  readonly apiKey: string;
  /** Explicit HTTPS API root; defaults to the TypeSafe hosted API. */
  readonly baseURL?: string;
  readonly model: string;
  readonly timeoutMs: number;
  /** Retries after the initial request; zero by default. */
  readonly maxRetries?: number;
  readonly maxRequestBytes?: number;
  readonly maxResponseBytes?: number;
  readonly maxConcurrentCalls?: number;
  /** Configure all three budget fields to reserve a conservative Jev call cost. */
  readonly maxSpendUsd?: number;
  readonly inputPriceUsdPerMillionTokens?: number;
  readonly maxInputTokensPerCall?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export interface TypeSafeDecisionRequestV1<Q extends Questions> {
  readonly state: SystemOneRequest<Q>['state'];
  readonly questions: Q;
}

/** Content-free evidence an application may retain in its own audit system. */
export interface TypeSafeAssessmentEvidenceV1 {
  readonly schemaVersion: 1;
  readonly status: 'completed' | 'failed';
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
  readonly runId: string;
  readonly checkpoint: ControlledAgentAssessmentRequestV1['checkpoint'];
  readonly targetDigest: string;
  readonly resolvedModel: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly elapsedMs: number;
  readonly spendReservedUsd: number | null;
  readonly disposition: 'allow' | 'deny' | 'abstain' | 'escalate' | null;
  readonly reasonCode: string | null;
  readonly failureCode: string | null;
}

export type TypeSafeAssessmentEvidenceSinkV1 = (
  evidence: TypeSafeAssessmentEvidenceV1,
) => void | Promise<void>;

export class TypeSafeDecisionClientV1 {
  readonly #client: TypeSafeClient;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #maxRequestBytes: number;
  readonly #maxConcurrentCalls: number;
  readonly #maxSpendUsd: number | undefined;
  readonly #maxInputTokensPerCall: number | undefined;
  readonly #maximumCallReservationUsd: number;
  #activeCalls = 0;
  #reservedSpendUsd = 0;

  constructor(options: TypeSafeDecisionClientOptionsV1) {
    validateClientOptions(options);
    const maxRetries = options.maxRetries ?? 0;
    this.#model = options.model;
    this.#timeoutMs = options.timeoutMs;
    this.#maxRequestBytes = options.maxRequestBytes ?? 262_144;
    this.#maxConcurrentCalls = options.maxConcurrentCalls ?? 4;
    this.#maxSpendUsd = options.maxSpendUsd;
    this.#maxInputTokensPerCall = options.maxInputTokensPerCall;
    this.#maximumCallReservationUsd =
      options.maxSpendUsd === undefined
        ? 0
        : ((options.maxInputTokensPerCall ?? 0) *
            (options.inputPriceUsdPerMillionTokens ?? 0) *
            (maxRetries + 1)) /
          1_000_000;
    const baseFetch = options.fetch ?? globalThis.fetch;
    this.#client = new TypeSafeClient({
      apiKey: options.apiKey,
      baseURL: options.baseURL ?? 'https://api.typesafe.ai',
      defaultModel: options.model,
      timeout: options.timeoutMs,
      retry: {
        maxRetries,
        backoffInitialMs: Math.min(500, options.timeoutMs),
        backoffMaxMs: Math.min(5_000, options.timeoutMs),
        maxRetryAfterMs: options.timeoutMs,
      },
      logLevel: 'off',
      fetch: createBoundedFetch(baseFetch, options.maxResponseBytes ?? 262_144),
    });
  }

  async evaluate<Q extends Questions>(
    request: TypeSafeDecisionRequestV1<Q>,
    signal?: AbortSignal,
  ): Promise<SystemOneResult<Q>> {
    let encodedRequest: string;
    try {
      encodedRequest = JSON.stringify({
        state: request.state,
        questions: request.questions,
        model: this.#model,
      });
    } catch {
      throw new TypeError('typesafe_request_not_json_serializable');
    }
    const encodedRequestBytes = new TextEncoder().encode(encodedRequest).byteLength;
    if (encodedRequestBytes > this.#maxRequestBytes)
      throw new TypeError('typesafe_request_exceeds_limit');
    if (
      this.#maxInputTokensPerCall !== undefined &&
      encodedRequestBytes > this.#maxInputTokensPerCall
    )
      throw new TypeError('typesafe_request_exceeds_spend_bound');
    const normalized = JSON.parse(encodedRequest) as TypeSafeDecisionRequestV1<Q>;
    if (
      !Object.hasOwn(normalized, 'state') ||
      !normalized.questions ||
      typeof normalized.questions !== 'object' ||
      Array.isArray(normalized.questions) ||
      Object.keys(normalized.questions).length === 0
    )
      throw new TypeError('invalid_typesafe_request');
    if (this.#activeCalls >= this.#maxConcurrentCalls)
      throw new Error('typesafe_concurrency_limit');
    if (
      this.#maxSpendUsd !== undefined &&
      this.#reservedSpendUsd + this.#maximumCallReservationUsd > this.#maxSpendUsd
    )
      throw new Error('typesafe_spend_limit');
    if (this.#maxSpendUsd !== undefined)
      this.#reservedSpendUsd += this.#maximumCallReservationUsd;
    this.#activeCalls += 1;
    const timeoutController = new AbortController();
    const abortFromCaller = () => timeoutController.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(
      () => timeoutController.abort(new Error('assessor_timeout')),
      this.#timeoutMs,
    );
    try {
      return await this.#client.systemOne(
        { ...normalized, model: this.#model },
        { timeout: this.#timeoutMs, signal: timeoutController.signal },
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
      this.#activeCalls -= 1;
    }
  }

  /** Conservative amount reserved across attempted calls; failed calls are not refunded. */
  get reservedSpendUsd(): number | null {
    return this.#maxSpendUsd === undefined ? null : this.#reservedSpendUsd;
  }
}

export interface TypeSafeAssessorOptionsV1<Q extends Questions>
  extends TypeSafeDecisionClientOptionsV1, TypeSafeAssessmentIdentityV1 {
  readonly buildRequest: (
    request: ControlledAgentAssessmentRequestV1,
  ) => SystemOneRequest<Q>;
  readonly mapResult: (
    result: SystemOneResult<Q>,
    request: ControlledAgentAssessmentRequestV1,
  ) => {
    readonly disposition: 'allow' | 'deny' | 'abstain' | 'escalate';
    readonly reasonCode: string;
  };
  /** Called after mapping succeeds; sink failures reject the assessment. */
  readonly evidenceSink?: TypeSafeAssessmentEvidenceSinkV1;
}

/**
 * Optional Jev-backed assessor. Application code owns question construction,
 * state projection and the policy mapping from model output to disposition.
 */
export class TypeSafeAssessorV1<Q extends Questions>
  implements ControlledAgentAssessorV1
{
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
  readonly #client: TypeSafeDecisionClientV1;
  readonly #buildRequest: TypeSafeAssessorOptionsV1<Q>['buildRequest'];
  readonly #mapResult: TypeSafeAssessorOptionsV1<Q>['mapResult'];
  readonly #evidenceSink: TypeSafeAssessmentEvidenceSinkV1 | undefined;

  constructor(options: TypeSafeAssessorOptionsV1<Q>) {
    assertNonEmpty(options.assessorId, 'assessorId');
    assertPositiveInteger(options.assessorVersion, 'assessorVersion');
    assertDigest(options.assessorBindingDigest, 'assessorBindingDigest');
    validateClientOptions(options);

    this.assessorId = options.assessorId;
    this.assessorVersion = options.assessorVersion;
    this.assessorBindingDigest = options.assessorBindingDigest;
    this.#buildRequest = options.buildRequest;
    this.#mapResult = options.mapResult;
    this.#evidenceSink = options.evidenceSink;
    this.#client = new TypeSafeDecisionClientV1(options);
  }

  async assess(request: ControlledAgentAssessmentRequestV1) {
    const assessmentStartedAt = performance.now();
    let result: SystemOneResult<Q> | undefined;
    let mapped: ReturnType<TypeSafeAssessorOptionsV1<Q>['mapResult']> | undefined;
    try {
      const prepared = this.#buildRequest(request);
      if (!prepared || typeof prepared !== 'object' || !('state' in prepared) || !('questions' in prepared))
        throw new TypeError('invalid_typesafe_request');
      result = await this.#client.evaluate(prepared);
      mapped = this.#mapResult(result, request);
      if (
        !mapped ||
        !['allow', 'deny', 'abstain', 'escalate'].includes(mapped.disposition) ||
        typeof mapped.reasonCode !== 'string' ||
        mapped.reasonCode.trim().length === 0
      )
        throw new TypeError('invalid_typesafe_assessment_mapping');
    } catch (error) {
      if (this.#evidenceSink) {
        try {
          await this.#evidenceSink(Object.freeze({
            schemaVersion: 1,
            status: 'failed',
            assessorId: this.assessorId,
            assessorVersion: this.assessorVersion,
            assessorBindingDigest: this.assessorBindingDigest,
            runId: request.runId,
            checkpoint: request.checkpoint,
            targetDigest: request.targetDigest,
            resolvedModel: result?.model ?? null,
            inputTokens: result?.usage.input_tokens ?? null,
            outputTokens: result?.usage.output_tokens ?? null,
            elapsedMs: Math.round(performance.now() - assessmentStartedAt),
            spendReservedUsd: this.#client.reservedSpendUsd,
            disposition: null,
            reasonCode: null,
            failureCode: assessmentFailureCode(error),
          }));
        } catch (sinkError) {
          throw new AggregateError([error, sinkError], 'assessment_and_evidence_recording_failed');
        }
      }
      throw error;
    }
    if (this.#evidenceSink) {
      await this.#evidenceSink(Object.freeze({
        schemaVersion: 1,
        status: 'completed',
        assessorId: this.assessorId,
        assessorVersion: this.assessorVersion,
        assessorBindingDigest: this.assessorBindingDigest,
        runId: request.runId,
        checkpoint: request.checkpoint,
        targetDigest: request.targetDigest,
        resolvedModel: result.model,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        elapsedMs: Math.round(performance.now() - assessmentStartedAt),
        spendReservedUsd: this.#client.reservedSpendUsd,
        disposition: mapped.disposition,
        reasonCode: mapped.reasonCode,
        failureCode: null,
      }));
    }
    return Object.freeze({
      disposition: mapped.disposition,
      reasonCode: mapped.reasonCode,
    });
  }
}

function assessmentFailureCode(error: unknown): string {
  if (error instanceof TypeError) return 'assessment_validation_failed';
  if (!(error instanceof Error)) return 'assessment_failed';
  switch (error.name) {
    case 'AuthenticationError': return 'provider_auth_failed';
    case 'RateLimitError': return 'provider_rate_limited';
    case 'APITimeoutError': return 'provider_timeout';
    case 'APIConnectionError': return 'provider_unavailable';
    case 'APIError': return 'provider_request_failed';
    default: return 'assessment_failed';
  }
}

export function createTypeSafeAssessorV1<Q extends Questions>(
  options: TypeSafeAssessorOptionsV1<Q>,
): ControlledAgentAssessorV1 {
  return new TypeSafeAssessorV1(options);
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`invalid_${label}`);
}

function validateClientOptions(options: TypeSafeDecisionClientOptionsV1): void {
  assertNonEmpty(options.apiKey, 'apiKey');
  assertNonEmpty(options.model, 'model');
  if (options.baseURL !== undefined) {
    let parsed: URL;
    try {
      parsed = new URL(options.baseURL);
    } catch {
      throw new TypeError('invalid_baseURL');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
      throw new TypeError('invalid_baseURL');
  }
  assertPositiveInteger(options.timeoutMs, 'timeoutMs');
  if (options.timeoutMs > 60_000) throw new TypeError('timeoutMs_exceeds_limit');
  const maxRetries = options.maxRetries ?? 0;
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 2)
    throw new TypeError('invalid_maxRetries');
  validateByteLimit(options.maxRequestBytes ?? 262_144, 'maxRequestBytes');
  validateByteLimit(options.maxResponseBytes ?? 262_144, 'maxResponseBytes');
  const maxConcurrentCalls = options.maxConcurrentCalls ?? 4;
  if (!Number.isSafeInteger(maxConcurrentCalls) || maxConcurrentCalls < 1 || maxConcurrentCalls > 16)
    throw new TypeError('invalid_maxConcurrentCalls');
  const budgetFields = [
    options.maxSpendUsd,
    options.inputPriceUsdPerMillionTokens,
    options.maxInputTokensPerCall,
  ];
  const hasBudgetFields = budgetFields.some((value) => value !== undefined);
  if (hasBudgetFields && budgetFields.some((value) => value === undefined))
    throw new TypeError('incomplete_spend_budget');
  if (hasBudgetFields) {
    if (!options.model.startsWith('jev-'))
      throw new TypeError('spend_budget_only_supported_for_jev');
    const [maxSpendUsd, inputPrice, maxTokens] = budgetFields as [number, number, number];
    if (!Number.isFinite(maxSpendUsd) || maxSpendUsd <= 0)
      throw new TypeError('invalid_maxSpendUsd');
    if (!Number.isFinite(inputPrice) || inputPrice <= 0)
      throw new TypeError('invalid_inputPriceUsdPerMillionTokens');
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 128_000)
      throw new TypeError('invalid_maxInputTokensPerCall');
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`invalid_${label}`);
}

function assertDigest(value: string, label: string): void {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value))
    throw new TypeError(`invalid_${label}`);
}

function validateByteLimit(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_048_576)
    throw new TypeError(`invalid_${label}`);
}

function createBoundedFetch(
  fetchImplementation: typeof globalThis.fetch,
  maximumResponseBytes: number,
): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetchImplementation(input, init);
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maximumResponseBytes) {
      await response.body?.cancel();
      throw new Error('typesafe_response_exceeds_limit');
    }
    if (!response.body) return response;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maximumResponseBytes) {
          await reader.cancel();
          throw new Error('typesafe_response_exceeds_limit');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
