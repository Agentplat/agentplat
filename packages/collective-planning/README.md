# `@agentplat/collective-planning`

Portable, provider-neutral contracts for forming and inspecting bounded local
mission plans. The root entry point is browser safe, has no import-time side
effects and depends only on `@agentplat/core` types.

## What this increment contains

- closed immutable mission-intent, observation, proposal, selection, decision,
  fragment, plan-view, adaptive-role and snapshot records;
- canonical bounded JSON and synchronous browser-safe SHA-256;
- domain-separated digests and deterministic proposal/fragment identifiers;
- strict validators that reject unknown fields, malformed Unicode, unsafe
  integers, invalid time intervals, digest mismatches and inconsistent graphs;
- constructors that validate and deeply freeze their result.

It does not contain a planning reducer, Mesh adapter, environment, evaluator or
model integration. A proposal, fragment, plan view or adaptive role binding is
evidence and coordination data; none of these records grants execution
authority.

## Minimal use

```ts
import {
  createPlanSelectionPolicyV1,
  validateMissionIntentV1,
} from "@agentplat/collective-planning";

const policy = createPlanSelectionPolicyV1({
  schemaVersion: 1,
  selectionPolicyId: "balanced-v1",
  revision: 1,
  scoringDimensions: [
    {
      schemaVersion: 1,
      dimension: "outcome_coverage",
      weight: 100,
      direction: "maximize",
    },
  ],
  hardConstraintKeys: ["authority_bounds"],
  acceptanceScoreThreshold: 80,
  challengeScoreThreshold: 50,
  tieBreakOrder: [
    "score",
    "requested_budget_units",
    "work_deadline",
    "proposed_at_logical_ms",
    "proposal_digest",
  ],
});

const intent = validateMissionIntentV1(inputFromATrustedBoundary);
```

All set-like arrays are encoded in ascending lexical order and contain no
duplicates. A validator returns a detached, deeply frozen value.

Fragment lifecycle is append-only. `fragmentRevision: 1` has a null
`previousStateDigest`; every later state revision retains the exact fragment ID
and proposal binding, names the preceding state digest and follows a permitted
status transition. A plan view retains that history, while selected heads,
budget reservations, Work mappings, roles and fragment high-waters bind only
the latest state revision.

Every latest fragment retains its exact planning reservation. Candidate budget
is reserved; active, projected, completed and failed work is committed;
cancelled or superseded work may be released only when no usage must be
retained. A Work mapping is valid only for a latest projected fragment whose
dependencies have latest state `completed`.

Observation values reject normalized authority, assignment, hidden-state and
future-schedule field aliases. This structural guard is defense in depth: only
an environment adapter and independent monitor can establish whether an
observation was genuinely visible and truthful. Records crossing a JavaScript
plugin boundary should be serialized data, not same-realm Proxy objects;
factories reject top-level accessor properties before reading their inputs.

`AdaptiveRoleBindingV1.planViewDigest` identifies the already-admitted plan
view from which the binding was derived. It is intentionally not the digest of
the later view that contains the binding, avoiding a circular content address.
