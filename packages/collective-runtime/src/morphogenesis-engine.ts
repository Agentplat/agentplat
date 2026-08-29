import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type { WorkflowDigestV1 } from "@agentplat/workflows";

import {
  assertMorphogenesisControlWindowAllowsV1,
  validateMorphogenesisControlWindowV1,
  type MorphogenesisControlWindowV1,
} from "./morphogenesis-control.js";
import type {
  MorphogenesisNeedV1,
  MorphogenesisPolicyRecordV1,
  MorphogenesisProposalV1,
  MorphologyComponentReferenceV1,
  MorphologySnapshotV1,
  MorphologySourceHeadV1,
  TargetMorphologyV1,
} from "./morphogenesis-contracts.js";
import {
  createMorphogenesisNeedV1,
  createMorphogenesisProposalV1,
  createMorphologySnapshotV1,
  validateMorphogenesisNeedV1,
  validateMorphogenesisPolicyV1,
  validateMorphologySnapshotV1,
  validateTargetMorphologyV1,
} from "./morphogenesis-validation.js";

export interface MorphologyRegisteredSourceV1 {
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly authenticationEvidenceDigest: PlanningDigestV1;
}

export interface MorphologySourceResolutionPortV1 {
  readonly registryId: AgentPlatID;
  readonly registryVersion: number;
  readonly registryDigest: PlanningDigestV1;
  resolve(
    head: MorphologySourceHeadV1,
  ): Promise<MorphologyRegisteredSourceV1 | null>;
}

export interface MorphologySourceCurrentnessPortV1 {
  admit(head: MorphologySourceHeadV1): Promise<boolean>;
}

export class InMemoryMorphologySourceCurrentnessPortV1
  implements MorphologySourceCurrentnessPortV1
{
  readonly #heads = new Map<
    string,
    { readonly revision: number; readonly recordDigest: PlanningDigestV1 }
  >();

  async admit(head: MorphologySourceHeadV1): Promise<boolean> {
    const key = `${head.sourceClass}:${head.sourceId}:${head.sourceVersion}:${head.sourceImplementationDigest}`;
    const current = this.#heads.get(key);
    if (
      current &&
      (head.sourceRevision < current.revision ||
        (head.sourceRevision === current.revision &&
          head.sourceRecordDigest !== current.recordDigest))
    )
      return false;
    if (!current || head.sourceRevision > current.revision)
      this.#heads.set(key, {
        revision: head.sourceRevision,
        recordDigest: head.sourceRecordDigest,
      });
    return true;
  }
}

export class MorphogenesisProposalEngineV1 {
  readonly #policy: MorphogenesisPolicyRecordV1;
  readonly #currentness: MorphologySourceCurrentnessPortV1;

  constructor(
    readonly options: {
      readonly policy: MorphogenesisPolicyRecordV1;
      readonly sourceResolution: MorphologySourceResolutionPortV1;
      readonly processDefinitionDigest: WorkflowDigestV1;
      readonly sourceCurrentness?: MorphologySourceCurrentnessPortV1;
    },
  ) {
    this.#policy = validateMorphogenesisPolicyV1(options.policy);
    this.#currentness =
      options.sourceCurrentness ??
      new InMemoryMorphologySourceCurrentnessPortV1();
    if (
      !options.sourceResolution ||
      typeof options.sourceResolution.resolve !== "function" ||
      !/^sha256:[0-9a-f]{64}$/u.test(options.processDefinitionDigest)
    )
      throw new TypeError(
        "morphology source-resolution and process-definition bindings are required",
      );
  }

  async observe(input: {
    readonly snapshotId: AgentPlatID;
    readonly scope: MorphologySnapshotV1["scope"];
    readonly morphologyEpoch: number;
    readonly previousMorphologyDigest: PlanningDigestV1 | null;
    readonly implementationDigest: PlanningDigestV1;
    readonly sourceHeads: readonly MorphologySourceHeadV1[];
    readonly components: readonly MorphologyComponentReferenceV1[];
    readonly population: MorphologySnapshotV1["population"];
    readonly resources: MorphologySnapshotV1["resources"];
    readonly observedAtLogicalMs: number;
    readonly logicalTimeHighWaterMs: number;
  }): Promise<MorphologySnapshotV1> {
    for (const head of input.sourceHeads) {
      const registered = await this.options.sourceResolution.resolve(head);
      if (
        !registered ||
        registered.sourceId !== head.sourceId ||
        registered.sourceVersion !== head.sourceVersion ||
        registered.sourceImplementationDigest !==
          head.sourceImplementationDigest ||
        registered.authenticationEvidenceDigest !==
          head.authenticationEvidenceDigest
      )
        throw new TypeError("morphology source authentication failed");
      if (!(await this.#currentness.admit(head)))
        throw new TypeError("morphology source rollback or equivocation detected");
    }
    return createMorphologySnapshotV1({
      ...input,
      policy: this.#policy,
    });
  }

  assess(input: {
    readonly snapshot: MorphologySnapshotV1;
    readonly needId: AgentPlatID;
    readonly reasonCode: MorphogenesisNeedV1["reasonCode"];
    readonly severityBps: number;
    readonly boundedViewDigest: PlanningDigestV1 | null;
    readonly candidateSearchLimit: number | null;
    readonly evidenceDigests: readonly PlanningDigestV1[];
    readonly detectedAtLogicalMs: number;
    readonly expiresAtLogicalMs: number;
  }): MorphogenesisNeedV1 {
    const snapshot = validateMorphologySnapshotV1(
      input.snapshot,
      this.#policy,
    );
    const admittedEvidence = new Set<PlanningDigestV1>();
    for (const head of snapshot.sourceHeads) {
      admittedEvidence.add(head.sourceHeadDigest);
      admittedEvidence.add(head.sourceRecordDigest);
      admittedEvidence.add(head.authenticationEvidenceDigest);
    }
    for (const component of snapshot.components) {
      admittedEvidence.add(component.componentDigest);
      admittedEvidence.add(component.recordDigest);
    }
    if (input.evidenceDigests.some((item) => !admittedEvidence.has(item)))
      throw new TypeError("morphogenesis need evidence is not source-bound");
    return createMorphogenesisNeedV1(
      {
        needId: input.needId,
        scopeDigest: snapshot.scope.scopeDigest,
        currentSnapshotDigest: snapshot.snapshotDigest,
        reasonCode: input.reasonCode,
        severityBps: input.severityBps,
        boundedViewDigest: input.boundedViewDigest,
        candidateSearchLimit: input.candidateSearchLimit,
        evidenceDigests: input.evidenceDigests,
        detectedAtLogicalMs: input.detectedAtLogicalMs,
        expiresAtLogicalMs: input.expiresAtLogicalMs,
      },
      this.#policy,
    );
  }

  propose(input: {
    readonly snapshot: MorphologySnapshotV1;
    readonly need: MorphogenesisNeedV1;
    readonly target: TargetMorphologyV1;
    readonly window: MorphogenesisControlWindowV1;
    readonly proposal: Omit<
      MorphogenesisProposalV1,
      "schemaVersion" | "proposalDigest" | "advisoryOnly"
    >;
  }): MorphogenesisProposalV1 {
    const snapshot = validateMorphologySnapshotV1(
      input.snapshot,
      this.#policy,
    );
    const need = validateMorphogenesisNeedV1(input.need, this.#policy);
    const target = validateTargetMorphologyV1(input.target, this.#policy);
    const window = validateMorphogenesisControlWindowV1(
      input.window,
      this.#policy,
    );
    if (
      window.scopeDigest !== snapshot.scope.scopeDigest ||
      window.currentMorphologyEpoch !== snapshot.morphologyEpoch
    )
      throw new TypeError("morphogenesis control window is stale or cross-scoped");
    assertMorphogenesisControlWindowAllowsV1({
      policy: this.#policy,
      window,
      need,
      logicalTimeMs: input.proposal.proposedAtLogicalMs,
    });
    if (
      input.proposal.processDefinitionDigest !==
      this.options.processDefinitionDigest
    )
      throw new TypeError(
        "morphogenesis proposal selected an unregistered process definition",
      );
    return createMorphogenesisProposalV1(input.proposal, {
      policy: this.#policy,
      snapshot,
      need,
      target,
    });
  }
}
