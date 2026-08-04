import type {
  PortableAgentAdapterManifestV1,
  PortableAgentAdapterNegotiationV1,
  PortableAgentAdapterRegistryPortV1,
  PortableAgentAdapterRequirementsV1,
  PortableAgentAdapterV1,
} from "./adapter-contracts.js";
import { PortableAgentErrorV1 } from "./adapter-errors.js";
import {
  cloneAndFreeze,
  identifier,
  normalizeAdapterManifestV1,
  normalizeAdapterRequirementsV1,
} from "./adapter-validation.js";

export interface RegisterPortableAgentAdapterInputV1 {
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly adapter: PortableAgentAdapterV1;
}

export interface RegisteredPortableAgentAdapterV1 {
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly adapter: PortableAgentAdapterV1;
}

/** Process-local registry with deterministic, explicit compatibility negotiation. */
export class PortableAgentAdapterRegistryV1 implements PortableAgentAdapterRegistryPortV1 {
  private readonly adapters = new Map<
    string,
    RegisteredPortableAgentAdapterV1
  >();

  register(input: RegisterPortableAgentAdapterInputV1): this {
    if (!input || typeof input !== "object") {
      throw new PortableAgentErrorV1(
        "VALIDATION_ERROR",
        "adapter registration is required",
      );
    }
    const manifest = normalizeAdapterManifestV1(input.manifest);
    if (!input.adapter || typeof input.adapter.step !== "function") {
      throw new PortableAgentErrorV1(
        "VALIDATION_ERROR",
        "adapter.step is required",
      );
    }
    if (
      manifest.supportsCheckpoint !==
      (typeof input.adapter.checkpoint === "function")
    ) {
      throw new PortableAgentErrorV1(
        "VALIDATION_ERROR",
        "adapter checkpoint implementation does not match its manifest",
      );
    }
    if (
      manifest.supportsRestore !==
      (typeof input.adapter.restore === "function")
    ) {
      throw new PortableAgentErrorV1(
        "VALIDATION_ERROR",
        "adapter restore implementation does not match its manifest",
      );
    }
    const key = adapterKey(manifest.adapterId, manifest.adapterVersion);
    if (this.adapters.has(key)) {
      throw new PortableAgentErrorV1(
        "CONFLICT",
        `adapter "${manifest.adapterId}" version "${manifest.adapterVersion}" is already registered`,
      );
    }
    this.adapters.set(key, Object.freeze({ manifest, adapter: input.adapter }));
    return this;
  }

  unregister(input: {
    readonly adapterId: string;
    readonly adapterVersion: string;
  }): boolean {
    return this.adapters.delete(
      adapterKey(
        identifier(input.adapterId, "adapterId"),
        version(input.adapterVersion),
      ),
    );
  }

  resolve(input: {
    readonly adapterId: string;
    readonly adapterVersion: string;
  }): RegisteredPortableAgentAdapterV1 | undefined {
    const registered = this.adapters.get(
      adapterKey(
        identifier(input.adapterId, "adapterId"),
        version(input.adapterVersion),
      ),
    );
    return registered === undefined
      ? undefined
      : Object.freeze({
          manifest: cloneAndFreeze(registered.manifest),
          adapter: registered.adapter,
        });
  }

  list(): readonly PortableAgentAdapterManifestV1[] {
    return Object.freeze(
      [...this.adapters.values()]
        .map(({ manifest }) => cloneAndFreeze(manifest))
        .sort((left, right) =>
          compareAscii(
            adapterKey(left.adapterId, left.adapterVersion),
            adapterKey(right.adapterId, right.adapterVersion),
          ),
        ),
    );
  }

  negotiate(
    manifestInput: PortableAgentAdapterManifestV1,
    requirementsInput: PortableAgentAdapterRequirementsV1,
  ): PortableAgentAdapterNegotiationV1 {
    const manifest = normalizeAdapterManifestV1(manifestInput);
    const requirements = normalizeAdapterRequirementsV1(requirementsInput);
    const missing: string[] = [];
    for (const kind of requirements.agentKinds ?? []) {
      if (!manifest.agentKinds.includes(kind))
        missing.push(`agent_kind:${kind}`);
    }
    for (const modality of requirements.inputModalities) {
      if (!manifest.inputModalities.includes(modality)) {
        missing.push(`input_modality:${modality}`);
      }
    }
    for (const modality of requirements.outputModalities) {
      if (!manifest.outputModalities.includes(modality)) {
        missing.push(`output_modality:${modality}`);
      }
    }
    if (!manifest.interactionModes.includes(requirements.interactionMode)) {
      missing.push(`interaction_mode:${requirements.interactionMode}`);
    }
    for (const point of requirements.controlPoints) {
      if (!manifest.controlPoints.includes(point)) {
        missing.push(`control_point:${point}`);
      }
    }
    if (requirements.requireCancellation && !manifest.supportsCancellation) {
      missing.push("capability:cancellation");
    }
    if (requirements.requireCheckpoint && !manifest.supportsCheckpoint) {
      missing.push("capability:checkpoint");
    }
    if (requirements.requireRestore && !manifest.supportsRestore) {
      missing.push("capability:restore");
    }
    missing.sort(compareAscii);
    return missing.length === 0
      ? Object.freeze({ accepted: true as const, manifest })
      : Object.freeze({
          accepted: false as const,
          manifest,
          missing: Object.freeze(missing),
        });
  }
}

function adapterKey(adapterId: string, adapterVersion: string): string {
  return `${adapterId}\u0000${adapterVersion}`;
}

function version(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > 128 ||
    input.trim() !== input ||
    /[\u0000-\u001f\u007f]/u.test(input)
  ) {
    throw new PortableAgentErrorV1(
      "VALIDATION_ERROR",
      "adapterVersion must be bounded text",
    );
  }
  return input;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
