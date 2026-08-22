import type {
  HumanContributionRequest,
  WorkManagementProvider,
} from "@agentplat/rooms";

/** OAuth, project and transport dependencies for the optional Asana adapter. */
export interface AsanaWorkManagementProviderOptions {
  projectGid: string;
  accessToken(): Promise<string>;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

/** Projects AgentPlat human contributions into idempotent Asana tasks. */
export class AsanaWorkManagementProvider implements WorkManagementProvider {
  readonly providerId = "asana";
  private readonly fetch: typeof globalThis.fetch;
  private readonly baseUrl: string;
  constructor(private readonly options: AsanaWorkManagementProviderOptions) {
    if (!options.projectGid.trim())
      throw new TypeError("Asana projectGid is required");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.baseUrl = withoutTrailingSlashes(
      options.baseUrl ?? "https://app.asana.com/api/1.0",
    );
  }
  async lookupContributionTask(input: { idempotencyKey: string }) {
    const data = await this.request(
      "GET",
      `/tasks/external:${encodeURIComponent(input.idempotencyKey)}?opt_fields=gid,permalink_url,external`,
      undefined,
      true,
    );
    return data ? external(data) : null;
  }
  async createContributionTask(input: {
    contribution: HumanContributionRequest;
    idempotencyKey: string;
  }) {
    const data = await this.request("POST", "/tasks", {
      data: {
        name: input.contribution.instruction.slice(0, 255),
        notes: notes(input.contribution),
        projects: [this.options.projectGid],
        external: {
          gid: input.idempotencyKey,
          data: JSON.stringify({
            tenantId: input.contribution.tenantId,
            roomId: input.contribution.roomId,
            contributionId: input.contribution.contributionId,
          }),
        },
      },
    });
    return external(data!);
  }
  async updateContributionTask(input: {
    externalId: string;
    contribution: HumanContributionRequest;
    idempotencyKey: string;
  }) {
    await this.request(
      "PUT",
      `/tasks/${encodeURIComponent(input.externalId)}`,
      {
        data: {
          name: input.contribution.instruction.slice(0, 255),
          notes: notes(input.contribution),
          external: {
            gid: input.idempotencyKey,
            data: JSON.stringify({
              contributionId: input.contribution.contributionId,
              revision: input.contribution.revision,
            }),
          },
        },
      },
    );
  }
  private async request(
    method: string,
    path: string,
    body?: unknown,
    allowNotFound = false,
  ): Promise<Record<string, unknown> | null> {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.options.accessToken()}`,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok)
      throw new Error(`Asana API request failed (${response.status})`);
    const payload = (await response.json()) as {
      data?: Record<string, unknown>;
    };
    if (!payload.data) throw new Error("Asana API response is missing data");
    return payload.data;
  }
}

function external(data: Record<string, unknown>) {
  if (typeof data.gid !== "string" || !data.gid)
    throw new Error("Asana task gid is missing");
  return {
    externalId: data.gid,
    externalUrl:
      typeof data.permalink_url === "string" ? data.permalink_url : undefined,
  };
}
function notes(contribution: HumanContributionRequest) {
  return [
    contribution.expectedOutput,
    contribution.deadline ? `Deadline: ${contribution.deadline}` : "",
    `AgentPlat contribution: ${contribution.contributionId}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function withoutTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}
