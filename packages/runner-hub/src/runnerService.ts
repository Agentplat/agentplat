import type { CreateRunnerTask } from "@agentplat/runner";
import type { RunnerRepository } from "./runnerRepo.js";
export function nonempty(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 256
  );
}
export function capabilities(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 128 && value.every(nonempty);
}
export class RunnerService {
  constructor(public readonly repository: RunnerRepository) {}
  async create(tenant: string, input: CreateRunnerTask) {
    if (
      !nonempty(tenant) ||
      !input ||
      !nonempty(input.action) ||
      input.payload === undefined ||
      !capabilities(input.requiredCapabilities ?? []) ||
      !Number.isInteger(input.timeoutSeconds ?? 60) ||
      (input.timeoutSeconds ?? 60) < 1 ||
      (input.timeoutSeconds ?? 60) > 86400 ||
      !Number.isInteger(input.maxRetries ?? 3) ||
      (input.maxRetries ?? 3) < 1 ||
      (input.maxRetries ?? 3) > 100
    )
      throw new TypeError("Invalid runner task");
    return this.repository.create(tenant, input);
  }
  get(tenant: string, id: string) {
    return this.repository.get(tenant, id);
  }
  list(tenant: string) {
    return this.repository.list(tenant);
  }
}
