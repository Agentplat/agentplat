import type {
  AgentRegistry,
  AgentRegistryEntry,
  RegistryPrincipal,
  AgentSearchQuery,
} from "@agentplat/agent-registry";
import {
  createCapabilityStateCandidateV1,
  createCapabilityStateFusionRequestV1,
  type CapabilityStateFusionPortV1,
  type CapabilityStateFusionScopeV1,
} from "@agentplat/collective-runtime/capability-state";
import { createMorphogenesisProposalV1 } from "@agentplat/collective-runtime/morphogenesis";
import { type PlanningDigestV1 } from "@agentplat/collective-planning";
import type { A2AStateStore } from "./contracts.js";
import { a2aScope } from "./contracts.js";
import { json, digest } from "./internal.js";
export interface RegistryMorphogenesisSelection {
  requestId: string;
  scope: CapabilityStateFusionScopeV1;
  requirements: AgentSearchQuery;
  evidenceDigest: string | null;
  candidates: {
    entryId: string;
    revision: number;
    candidateDigest: string;
    agentId: string;
  }[];
  uncovered: boolean;
  incomplete: boolean;
  nextCursor?: string;
  selectionDigest: PlanningDigestV1;
  grantsAuthority: false;
}
/** Search and evaluate through Capability State Fusion; the remote endpoint is represented by a local adapter agent. */
export async function selectMorphogenesisRegistryCandidates(options: {
  principal: RegistryPrincipal;
  registry: AgentRegistry;
  requirements: AgentSearchQuery;
  requestId: string;
  scope: CapabilityStateFusionScopeV1;
  logicalTimeMs: number;
  fusion: CapabilityStateFusionPortV1;
  resolveHost(
    entry: AgentRegistryEntry,
  ): Promise<
    { peerId: string; instanceId: string; agentId: string } | undefined
  >;
}): Promise<RegistryMorphogenesisSelection> {
  if (options.principal.tenantId !== options.scope.tenantId)
    throw new Error("tenant_mismatch");
  const search = await options.registry.search(
    options.principal,
    options.requirements,
  );
  const mapped = [];
  for (const match of search.candidates) {
    if (!match.eligible) continue;
    const host = await options.resolveHost(match.entry);
    if (!host) continue;
    const candidate = createCapabilityStateCandidateV1({
      schemaVersion: 1,
      candidateId: match.entry.entryId,
      kind: "local_agent",
      ...host,
      requiredCapabilityKeys: options.requirements.capabilities,
      advertisedCapabilityKeys: match.entry.capabilities,
      sourceEvidenceDigest: `sha256:${digest({ domain: "registry-candidate", entry: match.entry })}`,
      sourceRecordId: match.entry.entryId,
      sourceRevision: match.entry.revision,
    });
    mapped.push({ entry: match.entry, candidate });
  }
  let candidates: RegistryMorphogenesisSelection["candidates"] = [];
  let evidenceDigest: string | null = null;
  if (mapped.length) {
    const request = createCapabilityStateFusionRequestV1({
      schemaVersion: 1,
      requestId: options.requestId,
      operation: "offer_recipient",
      scope: options.scope,
      logicalTimeMs: options.logicalTimeMs,
      requiredCapabilityKeys: options.requirements.capabilities,
      candidates: mapped.map((m) => m.candidate),
    });
    const decision = await options.fusion.evaluate(request);
    if (
      decision.requestDigest !== request.requestDigest ||
      decision.expiresAtLogicalMs <= options.logicalTimeMs
    )
      throw new Error("invalid_fusion_decision");
    evidenceDigest = decision.decisionDigest;
    for (const m of mapped) {
      if (
        !decision.candidates.some(
          (c) =>
            c.candidateDigest === m.candidate.candidateDigest &&
            c.disposition === "eligible",
        )
      )
        continue;
      await options.registry.resolve(
        options.principal,
        m.entry.entryId,
        m.entry.revision,
        options.requirements,
      );
      candidates.push({
        entryId: m.entry.entryId,
        revision: m.entry.revision,
        candidateDigest: m.candidate.candidateDigest,
        agentId: m.candidate.agentId!,
      });
    }
  }
  const body = {
    requestId: options.requestId,
    scope: structuredClone(options.scope),
    requirements: structuredClone(options.requirements),
    evidenceDigest,
    candidates,
    uncovered: candidates.length === 0 && !search.nextCursor,
    incomplete: !!search.nextCursor,
    nextCursor: search.nextCursor,
    grantsAuthority: false as const,
  };
  return {
    ...body,
    selectionDigest: `sha256:${digest({ domain: "registry-selection", ...body })}`,
  };
}
/** Materialize a canonical advisory proposal. Existing governance/owners perform admission later. */
export async function proposeRegistryMorphogenesis(options: {
  principal: RegistryPrincipal;
  missionId: string;
  selection: RegistryMorphogenesisSelection;
  store: A2AStateStore;
  compile(selection: RegistryMorphogenesisSelection): Promise<{
    input: Parameters<typeof createMorphogenesisProposalV1>[0];
    context: Parameters<typeof createMorphogenesisProposalV1>[1];
  }>;
}) {
  const selection = structuredClone(options.selection);
  const { selectionDigest, ...selectionBody } = selection;
  if (
    selectionDigest !==
      `sha256:${digest({ domain: "registry-selection", ...selectionBody })}` ||
    selection.grantsAuthority !== false ||
    selection.scope.tenantId !== options.principal.tenantId
  )
    throw new Error("invalid_registry_selection");
  const scope = a2aScope(
    options.principal,
    options.missionId,
    "morphogenesis_registry",
  );
  if (!selection.candidates.length) {
    await options.store.compareAndSet(
      scope,
      selection.selectionDigest,
      null,
      json({ selection, proposal: null, grantsAuthority: false }),
    );
    return { selection, proposal: null, grantsAuthority: false as const };
  }
  const compiled = await options.compile(selection);
  if (
    !compiled.context.need.evidenceDigests.includes(
      selection.selectionDigest,
    ) ||
    compiled.context.snapshot.scope.tenantId !== options.principal.tenantId
  )
    throw new Error("selection_evidence_not_bound");
  if (
    compiled.context.snapshot.scope.missionId !== options.missionId ||
    compiled.input.operations.some(
      (operation) => operation.operator !== "recruit_existing",
    ) ||
    compiled.context.target.estimatedNewAgents !== 0
  )
    throw new Error("registry_proposal_must_recruit");
  for (const key of [
    "tenantId",
    "meshId",
    "policyDomainId",
    "missionIntentId",
    "objectiveId",
  ] as const) {
    if (compiled.context.snapshot.scope[key] !== selection.scope[key])
      throw new Error("selection_scope_mismatch");
  }
  const proposal = createMorphogenesisProposalV1(
    compiled.input,
    compiled.context,
  );
  const result = { selection, proposal, grantsAuthority: false as const };
  if (
    !(await options.store.compareAndSet(
      scope,
      selection.selectionDigest,
      null,
      json(result),
    ))
  ) {
    const existing = await options.store.get(scope, selection.selectionDigest);
    if (JSON.stringify(existing?.value) !== JSON.stringify(json(result)))
      throw new Error("proposal_conflict");
  }
  return result;
}

import {
  createMorphogenesisCandidateSearchResultV1,
  createMorphogenesisExistingCandidateV1,
  type MorphogenesisCandidateDiscoveryPortV1,
  type MorphogenesisCandidateSearchRequestV1,
  type MorphogenesisExistingCandidateV1,
} from "@agentplat/collective-runtime/morphogenesis";
/** Existing Morphogenesis execution discovery port, with a declared bounded registry view. */
export function createRegistryMorphogenesisDiscovery(options: {
  principal: RegistryPrincipal;
  registry: AgentRegistry;
  scopeDigest: PlanningDigestV1;
  viewId: string;
  viewDigest: PlanningDigestV1;
  /** Resolve local adapter identity, lineage and current membership through existing owners. */
  evaluate(
    entry: AgentRegistryEntry,
    request: MorphogenesisCandidateSearchRequestV1,
  ): Promise<
    | Omit<
        MorphogenesisExistingCandidateV1,
        | "schemaVersion"
        | "candidateDigest"
        | "candidateId"
        | "capabilityKeys"
        | "sourceEvidenceDigest"
      >
    | undefined
  >;
}): MorphogenesisCandidateDiscoveryPortV1 {
  const principal = structuredClone(options.principal),
    scopeDigest = options.scopeDigest,
    viewId = options.viewId,
    viewDigest = options.viewDigest,
    evaluate = options.evaluate;
  return {
    async search(request) {
      if (
        request.scopeDigest !== scopeDigest ||
        request.viewId !== viewId ||
        request.viewDigest !== viewDigest
      )
        throw new Error("registry_view_mismatch");
      const search = await options.registry.search(principal, {
        capabilities: [...request.requiredCapabilityKeys],
        limit: Math.min(request.searchLimit, 200),
      });
      const candidates = [];
      for (const match of search.candidates) {
        if (!match.eligible) continue;
        const evaluated = await evaluate(match.entry, request);
        if (!evaluated) continue;
        await options.registry.resolve(
          principal,
          match.entry.entryId,
          match.entry.revision,
          { capabilities: [...request.requiredCapabilityKeys] },
        );
        candidates.push(
          createMorphogenesisExistingCandidateV1({
            ...evaluated,
            candidateId: match.entry.entryId,
            capabilityKeys: match.entry.capabilities,
            sourceEvidenceDigest: `sha256:${digest({ domain: "registry-candidate", entry: match.entry })}`,
          }),
        );
      }
      return createMorphogenesisCandidateSearchResultV1(
        {
          requestDigest: request.requestDigest,
          status: search.nextCursor
            ? "incomplete_bounded_view"
            : candidates.length
              ? "eligible_candidates"
              : "no_eligible_candidate_in_bounded_view",
          completeWithinDeclaredView: !search.nextCursor,
          searchedCandidateCount: search.candidates.length,
          candidates: search.nextCursor ? [] : candidates,
          observedAtLogicalMs: request.requestedAtLogicalMs,
        },
        request,
      );
    },
  };
}
