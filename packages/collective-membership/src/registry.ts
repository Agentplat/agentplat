import type { CollectiveQuorumMembershipBindingV1 } from "@agentplat/collective-quorum";
import type { MeshKeyRecord } from "@agentplat/mesh-crypto";
import type {
  CollectiveMembershipConfigurationV1,
  CollectiveMembershipKeyV1,
  CollectiveMembershipRegistryV1,
  CollectiveMembershipRepositoryV1,
} from "./contracts.js";
import { importCollectiveMembershipPublicKeyV1 } from "./crypto.js";
import { verifyCollectiveMembershipConfigurationV1 } from "./configuration.js";

/**
 * Synchronous verification projection backed by certified configuration
 * history. Removed and retiring keys remain resolvable only for their original
 * bounded validity interval so operations pinned to an older epoch can finish.
 */
export class InMemoryCollectiveMembershipRegistryV1 implements CollectiveMembershipRegistryV1 {
  readonly #configurations = new Map<
    number,
    CollectiveMembershipConfigurationV1
  >();
  readonly #keys = new Map<string, MeshKeyRecord>();
  readonly #keyDefinitions = new Map<string, CollectiveMembershipKeyV1>();

  private constructor(readonly crypto?: Crypto) {}

  static async create(input: {
    readonly configurations: readonly CollectiveMembershipConfigurationV1[];
    readonly crypto?: Crypto;
  }): Promise<InMemoryCollectiveMembershipRegistryV1> {
    if (!Array.isArray(input.configurations) || input.configurations.length < 1)
      throw new TypeError("membership configuration history is required");
    const registry = new InMemoryCollectiveMembershipRegistryV1(input.crypto);
    for (const configuration of [...input.configurations].sort(
      (left, right) => left.epoch - right.epoch,
    ))
      await registry.apply(configuration);
    return registry;
  }

  current(): CollectiveMembershipConfigurationV1 {
    const configuration = [...this.#configurations.values()].sort(
      (left, right) => right.epoch - left.epoch,
    )[0];
    if (!configuration) throw new Error("membership_configuration_unavailable");
    return configuration;
  }

  configuration(
    epoch: number,
  ): CollectiveMembershipConfigurationV1 | undefined {
    return this.#configurations.get(epoch);
  }

  instanceIds(peerId: string): readonly string[] {
    return Object.freeze(
      [
        ...new Set(
          [...this.#configurations.values()]
            .flatMap(({ members }) => members)
            .filter((member) => member.peerId === peerId)
            .map(({ instanceId }) => instanceId),
        ),
      ].sort(),
    );
  }

  binding(
    configuration: CollectiveMembershipConfigurationV1,
  ): CollectiveQuorumMembershipBindingV1 {
    return Object.freeze({
      epoch: configuration.epoch,
      configurationDigest: configuration.configurationDigest,
      memberPeerIds: Object.freeze(
        configuration.members.map(({ peerId }) => peerId),
      ),
      memberInstances: Object.freeze(
        configuration.members.map(({ peerId, instanceId }) =>
          Object.freeze({ peerId, instanceId }),
        ),
      ),
    });
  }

  async currentBinding(input: {
    readonly logicalTimeMs: number;
  }): Promise<CollectiveQuorumMembershipBindingV1 | null> {
    if (!Number.isSafeInteger(input.logicalTimeMs) || input.logicalTimeMs < 0)
      return null;
    const effective = [...this.#configurations.values()]
      .filter(
        (configuration) =>
          configuration.effectiveAtLogicalMs <= input.logicalTimeMs,
      )
      .sort((left, right) => right.epoch - left.epoch)[0];
    return effective ? this.binding(effective) : null;
  }

  async resolveBinding(input: {
    readonly epoch: number;
    readonly configurationDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveQuorumMembershipBindingV1 | null> {
    const configuration = this.#configurations.get(input.epoch);
    if (
      !configuration ||
      configuration.configurationDigest !== input.configurationDigest ||
      !Number.isSafeInteger(input.logicalTimeMs) ||
      input.logicalTimeMs < configuration.effectiveAtLogicalMs
    )
      return null;
    return this.binding(configuration);
  }

  resolve(input: {
    tenantId: string;
    meshId: string;
    peerId: string;
    keyId: string;
    algorithm: "Ed25519";
  }): MeshKeyRecord | undefined {
    return this.#keys.get(keyId(input));
  }

  async apply(
    configuration: CollectiveMembershipConfigurationV1,
  ): Promise<void> {
    const verified = await verifyCollectiveMembershipConfigurationV1(
      configuration,
      this.crypto,
    );
    if (!verified) throw new TypeError("invalid_membership_configuration");
    const existing = this.#configurations.get(verified.epoch);
    if (existing) {
      if (existing.configurationDigest !== verified.configurationDigest)
        throw new Error("membership_configuration_conflict");
      return;
    }
    const current =
      this.#configurations.size === 0 ? undefined : this.current();
    if (
      current &&
      (verified.epoch !== current.epoch + 1 ||
        verified.previousConfigurationDigest !== current.configurationDigest)
    )
      throw new Error("membership_configuration_gap");

    const imported = await Promise.all(
      verified.members.flatMap((member) =>
        member.keys.map(async (key) => ({
          mapKey: keyId({
            tenantId: verified.tenantId,
            meshId: verified.meshId,
            peerId: member.peerId,
            keyId: key.keyId,
            algorithm: key.algorithm,
          }),
          definition: key,
          record: Object.freeze({
            tenantId: verified.tenantId,
            meshId: verified.meshId,
            peerId: member.peerId,
            keyId: key.keyId,
            algorithm: key.algorithm,
            publicKey: await importCollectiveMembershipPublicKeyV1(
              key,
              this.crypto,
            ),
            validFrom: key.validFrom,
            validUntil: key.validUntil,
            status: "active" as const,
          }),
        })),
      ),
    );
    for (const entry of imported) {
      const prior = this.#keyDefinitions.get(entry.mapKey);
      if (prior && !validKeyRevision(prior, entry.definition))
        throw new Error("membership_key_conflict");
    }
    for (const entry of imported) {
      const prior = this.#keyDefinitions.get(entry.mapKey);
      if (!prior || prior.validUntil !== entry.definition.validUntil) {
        this.#keys.set(entry.mapKey, entry.record);
        this.#keyDefinitions.set(entry.mapKey, entry.definition);
      }
    }
    this.#configurations.set(verified.epoch, verified);
  }
}

function validKeyRevision(
  prior: CollectiveMembershipKeyV1,
  next: CollectiveMembershipKeyV1,
): boolean {
  return (
    prior.keyId === next.keyId &&
    prior.algorithm === next.algorithm &&
    prior.publicKey === next.publicKey &&
    prior.validFrom === next.validFrom &&
    Date.parse(next.validUntil) <= Date.parse(prior.validUntil)
  );
}

export async function restoreCollectiveMembershipRegistryV1(input: {
  readonly repository: CollectiveMembershipRepositoryV1;
  readonly crypto?: Crypto;
}): Promise<InMemoryCollectiveMembershipRegistryV1> {
  return InMemoryCollectiveMembershipRegistryV1.create({
    configurations: await input.repository.configurations(),
    crypto: input.crypto,
  });
}

function keyId(input: {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly keyId: string;
  readonly algorithm: string;
}): string {
  return JSON.stringify([
    input.tenantId,
    input.meshId,
    input.peerId,
    input.keyId,
    input.algorithm,
  ]);
}
