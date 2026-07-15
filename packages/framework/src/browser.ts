import {
  createSessionEventReducer,
  exportSessionHistory,
  sessionMetrics,
  type MultiAgentSessionEvent,
  type SessionEventReducer,
  type SessionViewState,
  type SessionMetrics,
  type SessionMessage,
} from '@agentplat/sessions';
import {
  envelopeToEvent,
  subscribeAgentSse,
  type AgentSseEnvelope,
  type ParseAgentSseOptions,
} from '@agentplat/streaming';

export {
  createSessionEventReducer,
  exportSessionHistory,
  sessionMetrics,
  type MultiAgentSessionEvent,
  type SessionEventReducer,
  type SessionViewState,
  type SessionMetrics,
  type SessionMessage,
};
export {
  envelopeToEvent,
  subscribeAgentSse,
  type AgentSseEnvelope,
  type ParseAgentSseOptions,
};

/** Options for the browser-safe, framework-agnostic session stream controller. */
export interface SessionStreamControllerOptions {
  reducer?: SessionEventReducer;
  onState?(state: SessionViewState): void;
  onEvent?(event: MultiAgentSessionEvent): void;
  onMetrics?(metrics: SessionMetrics): void;
  onError?(error: unknown): void;
  /** Application-provided authenticated soft-stop action for a live session. */
  stop?(sessionId: string): Promise<void> | void;
  fetch?: typeof globalThis.fetch;
}

/** Controls one browser session stream without taking a React dependency. */
export interface SessionStreamController {
  readonly state: SessionViewState;
  consume(
    response: Response,
    options?: ParseAgentSseOptions<MultiAgentSessionEvent>
  ): Promise<void>;
  start(
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: ParseAgentSseOptions<MultiAgentSessionEvent>
  ): Promise<void>;
  abort(): void;
  /** Request a cooperative server-side stop; unlike abort(), it keeps SSE open. */
  stop(): Promise<boolean>;
  exportHistory(): SessionMessage[];
  reset(): void;
}

/**
 * Create a small controller that centralizes AbortController ownership, SSE
 * parsing and reducer dispatch. It is usable from React, Vue, Svelte or plain
 * browser code.
 */
export function createSessionStreamController(
  options: SessionStreamControllerOptions = {}
): SessionStreamController {
  const reducer = options.reducer ?? createSessionEventReducer();
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  let controller: AbortController | undefined;
  let state = reducer.initialState;

  const publish = (event: MultiAgentSessionEvent) => {
    state = reducer.reduce(state, event);
    options.onEvent?.(event);
    options.onState?.(state);
    options.onMetrics?.(state.metrics);
  };

  const consume = async (
    response: Response,
    parseOptions: ParseAgentSseOptions<MultiAgentSessionEvent> = {}
  ) => {
    try {
      await subscribeAgentSse<MultiAgentSessionEvent>(response, {
        ...parseOptions,
        signal: parseOptions.signal ?? controller?.signal,
        onEvent: (envelope) => publish(envelopeToEvent(envelope)),
      });
    } catch (error) {
      if (!controller?.signal.aborted) options.onError?.(error);
      throw error;
    }
  };

  return {
    get state() {
      return state;
    },
    consume,
    async start(input, init, parseOptions) {
      controller?.abort();
      controller = new AbortController();
      const response = await fetchImplementation(input, {
        ...init,
        signal: controller.signal,
      });
      await consume(response, parseOptions);
    },
    abort() {
      controller?.abort();
    },
    async stop() {
      if (!state.sessionId || !options.stop) return false;
      await options.stop(state.sessionId);
      return true;
    },
    exportHistory() {
      return exportSessionHistory(state);
    },
    reset() {
      controller?.abort();
      state = reducer.initialState;
      options.onState?.(state);
      options.onMetrics?.(state.metrics);
    },
  };
}
