export * from "./client/runnerClient.js";
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface RunnerRegistration {
  runnerId: string;
  name: string;
  capabilities: string[];
  concurrencyLimit: number;
}
export interface RunnerTask {
  id: string;
  tenantId: string;
  action: string;
  payload: JsonValue;
  requiredCapabilities: string[];
  status: "pending" | "leased" | "completed" | "failed" | "cancelled";
  assignedRunnerId: string | null;
  leaseId: string | null;
  leaseExpiresAt: string | null;
  retries: number;
  maxRetries: number;
  timeoutSeconds: number;
  result: JsonValue | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateRunnerTask {
  action: string;
  payload: JsonValue;
  requiredCapabilities?: string[];
  timeoutSeconds?: number;
  maxRetries?: number;
}
export interface RunnerRecord extends RunnerRegistration {
  tenantId: string;
  status: "online" | "offline";
  lastHeartbeat: string;
  metadata: JsonValue;
}
export type HubMessage =
  | { type: "registered" }
  | { type: "ping" }
  | { type: "task"; task: RunnerTask };
export type RunnerMessage =
  | { type: "register"; runner: RunnerRegistration }
  | { type: "pong" }
  | {
      type: "completed" | "failed";
      taskId: string;
      leaseId: string;
      result?: JsonValue;
      error?: string;
    };
