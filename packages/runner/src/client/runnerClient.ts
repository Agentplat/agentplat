import type { HubMessage, JsonValue, RunnerRegistration } from "../index.js";
// Event handlers use method variance to accept DOM and Node WebSocket event shapes.
type SocketListener<T> = { handle(event: T): void }["handle"];
export interface RunnerSocket {
  readonly readyState: number;
  onopen: SocketListener<unknown> | null;
  onclose: SocketListener<unknown> | null;
  onerror: SocketListener<unknown> | null;
  onmessage: SocketListener<{ data: unknown }> | null;
  send(data: string): void;
  close(): void;
}
export interface RunnerClientOptions extends RunnerRegistration {
  url: string;
  tenantId: string;
  token: string;
  /** Inject a WebSocket implementation for Node versions without a global WebSocket. */
  socketFactory?: (url: string) => RunnerSocket;
  onError?: (error: unknown) => void;
}
export class AgentPlatRunnerClient {
  private handlers = new Map<
    string,
    (payload: JsonValue) => Promise<JsonValue>
  >();
  private socket?: RunnerSocket;
  private stopped = true;
  private attempts = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private active = 0;
  constructor(private options: RunnerClientOptions) {
    if (
      !Number.isInteger(options.concurrencyLimit) ||
      options.concurrencyLimit < 1
    )
      throw new TypeError("Invalid concurrencyLimit");
  }
  registerHandler(
    action: string,
    handler: (payload: JsonValue) => Promise<JsonValue>,
  ): this {
    this.handlers.set(action, handler);
    return this;
  }
  connect(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }
  disconnect(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
  }
  private open(): void {
    if (this.stopped) return;
    try {
      const url = new URL(this.options.url);
      url.searchParams.set("tenantId", this.options.tenantId);
      url.searchParams.set("token", this.options.token);
      const socket = (
        this.options.socketFactory ??
        ((address) => {
          const runtime = globalThis as unknown as {
            WebSocket: new (url: string) => RunnerSocket;
          };
          return new runtime.WebSocket(address);
        })
      )(url.toString());
      this.socket = socket;
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            type: "register",
            runner: {
              runnerId: this.options.runnerId,
              name: this.options.name,
              capabilities: this.options.capabilities,
              concurrencyLimit: this.options.concurrencyLimit,
            },
          }),
        );
      socket.onmessage = (event) => {
        try {
          void this.message(
            socket,
            JSON.parse(String(event.data)) as HubMessage,
          ).catch((e) => this.options.onError?.(e));
        } catch (e) {
          this.options.onError?.(e);
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (this.socket === socket) this.schedule();
      };
    } catch (error) {
      this.options.onError?.(error);
      this.schedule();
    }
  }
  private schedule(): void {
    if (this.stopped) return;
    const delay = Math.min(30_000, 500 * 2 ** Math.min(this.attempts++, 6));
    this.timer = setTimeout(
      () => this.open(),
      delay + Math.random() * delay * 0.2,
    );
  }
  private async message(
    socket: RunnerSocket,
    message: HubMessage,
  ): Promise<void> {
    if (message.type === "registered") {
      this.attempts = 0;
      return;
    }
    if (message.type === "ping") {
      socket.send(JSON.stringify({ type: "pong" }));
      return;
    }
    if (message.type !== "task") return;
    const task = message.task;
    const reply = (value: object) => {
      if (socket === this.socket && socket.readyState === 1)
        socket.send(
          JSON.stringify({ taskId: task.id, leaseId: task.leaseId, ...value }),
        );
    };
    if (this.active >= this.options.concurrencyLimit) {
      reply({ type: "failed", error: "Local concurrency limit reached" });
      return;
    }
    this.active++;
    try {
      const handler = this.handlers.get(task.action);
      if (!handler) throw new Error(`No handler for ${task.action}`);
      const result = await handler(task.payload);
      reply({ type: "completed", result });
    } catch (error) {
      reply({
        type: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.active--;
    }
  }
}
