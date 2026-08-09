import type {
  CertifiedMissionContextResolutionV1,
  MissionContextFusionRepositoryV1,
  MissionContextFusionSaveResultV1,
} from "./mission-context-fusion-contracts.js";
import { validateCertifiedMissionContextResolutionV1 } from "./mission-context-fusion-runtime.js";

export class InMemoryMissionContextFusionRepositoryV1
  implements MissionContextFusionRepositoryV1
{
  readonly #records = new Map<string, CertifiedMissionContextResolutionV1>();
  readonly #heads = new Map<string, string>();

  constructor(readonly crypto?: Crypto) {}

  async head(input: {
    readonly tenantId: string;
    readonly missionIntentId: string;
    readonly contextSubjectDigest: string;
  }): Promise<CertifiedMissionContextResolutionV1 | null> {
    const digest = this.#heads.get(key(input));
    return digest ? this.#records.get(digest) ?? null : null;
  }

  async get(
    resolutionDigest: string,
  ): Promise<CertifiedMissionContextResolutionV1 | null> {
    return this.#records.get(resolutionDigest) ?? null;
  }

  async save(input: {
    readonly resolution: CertifiedMissionContextResolutionV1;
    readonly expectedHeadDigest: string | null;
  }): Promise<MissionContextFusionSaveResultV1> {
    const resolution = await validateCertifiedMissionContextResolutionV1(
      input.resolution,
      this.crypto,
    );
    const current = this.#heads.get(key(resolution)) ?? null;
    const retained = this.#records.get(resolution.resolutionDigest);
    if (retained)
      return JSON.stringify(retained) === JSON.stringify(resolution)
        ? "duplicate"
        : "conflict";
    if (current !== input.expectedHeadDigest) return "stale_head";
    if (resolution.previousResolutionDigest !== current) return "conflict";
    this.#records.set(resolution.resolutionDigest, resolution);
    this.#heads.set(key(resolution), resolution.resolutionDigest);
    return "stored";
  }
}

function key(input: {
  readonly tenantId?: string;
  readonly missionIntentId?: string;
  readonly contextSubjectDigest: string;
  readonly scope?: { readonly tenantId: string; readonly missionIntentId: string };
}): string {
  const tenantId = input.tenantId ?? input.scope?.tenantId;
  const missionIntentId = input.missionIntentId ?? input.scope?.missionIntentId;
  if (!tenantId || !missionIntentId)
    throw new TypeError("mission context repository key is incomplete");
  return `${tenantId}\u0000${missionIntentId}\u0000${input.contextSubjectDigest}`;
}
