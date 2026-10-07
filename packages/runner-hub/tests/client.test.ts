import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentPlatRunnerClient } from "@agentplat/runner";
class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  message(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
function setup() {
  const sockets: FakeSocket[] = [];
  const client = new AgentPlatRunnerClient({
    url: "ws://localhost/ws/runners",
    token: "token",
    tenantId: "a",
    runnerId: "r",
    name: "Runner",
    capabilities: [],
    concurrencyLimit: 1,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });
  return { client, sockets };
}
afterEach(() => vi.useRealTimers());
describe("portable SDK", () => {
  it("reconnects with backoff, answers ping and stops reconnecting after disconnect", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { client, sockets } = setup();
    client.connect();
    sockets[0].onopen?.();
    expect(sockets[0].sent[0].type).toBe("register");
    sockets[0].message({ type: "registered" });
    sockets[0].message({ type: "ping" });
    expect(sockets[0].sent[1]).toEqual({ type: "pong" });
    sockets[0].close();
    await vi.advanceTimersByTimeAsync(499);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    sockets[1].close();
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
    client.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(3);
    vi.restoreAllMocks();
  });
  it("bounds local concurrency and never sends old results on a new socket", async () => {
    vi.useFakeTimers();
    const { client, sockets } = setup();
    let finish!: (value: null) => void;
    client.registerHandler(
      "execute",
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    client.connect();
    const task = {
      id: "one",
      leaseId: "lease1",
      action: "execute",
      payload: null,
    };
    sockets[0].message({ type: "task", task });
    sockets[0].message({ type: "task", task: { ...task, id: "two" } });
    expect(sockets[0].sent[0]).toMatchObject({ type: "failed", taskId: "two" });
    sockets[0].close();
    await vi.advanceTimersByTimeAsync(1000);
    finish(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(sockets[1].sent).toEqual([]);
    client.disconnect();
  });
});
