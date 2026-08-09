# Collective capability baseline governance V1

Status: frozen source-development boundary.

Baseline ID: `agentplat-collective-capabilities-v1`.

## Fixed denominator

The current baseline contains exactly 11 closure objectives and 19 source
capabilities. Its machine-readable authority is
`config/collective-capability-baseline-v1.json`; the current-baseline pointer is
`config/collective-capability-baseline-current.json`.

Source completion is binary against that denominator:

- 11 of 11 objectives must be `closed`;
- 19 of 19 capabilities must be `implemented-and-integrated`;
- no P0, P1 or P2 source finding may remain open; and
- the public release gate must pass.

Production deployment, empirical performance, operational certification,
provider selection, cost validation and data/IP rights are tracked separately.
They cannot increase or decrease the source-development denominator.

## Finding classification

Every new finding must be assigned exactly one of these classes:

1. `existing-capability-defect`: a requirement in the frozen baseline is
   violated. Fix the defect under its existing capability ID; do not create a
   new objective.
2. `validation-evidence`: more evidence is needed for an existing capability.
   This affects confidence or attestation, not the capability denominator.
3. `deployment-operationalization`: a concrete provider, environment or
   operational control remains to be installed. Track it in readiness work.
4. `future-baseline-proposal`: the proposed behavior is genuinely outside V1.
   It has no effect on V1 completion unless the owner explicitly approves a
   new versioned baseline.

An auditor may report defects and evidence gaps. It may not add objectives,
change capability semantics or move external obligations into source scope.

## Change control

V1 is immutable. Adding, removing, renaming or semantically changing an
objective or capability requires all of the following:

1. a new manifest with a new baseline ID and version;
2. an explicit owner approval recorded in review history;
3. an updated current-baseline pointer;
4. a new frozen digest and verifier update; and
5. a migration note explaining whether V1 remains supported.

Changing the manifest digest without changing the baseline version is rejected
by `pnpm run verify:capability-baseline`.

## Terminal interpretation

Once the V1 source rule passes, development of the declared baseline is 100%
complete. Later evaluation may reveal a defect, but that defect remains attached
to an existing capability. It does not retroactively create a twelfth objective
or a twentieth V1 capability.

This implementation status is distinct from a signed source attestation. Until
the repository is frozen at a clean commit and all 19 receipts bind that exact
tree, the baseline records `pending-frozen-tree` for attestation.

The immutable baseline is not edited after signing. The separate
[source capability attestation runbook](./source-attestation-runbook-v1.md)
produces a commit-bound snapshot and signed evidence bundle using the evidence
paths in `config/collective-capability-evidence-v1.json`.

A stronger claim such as measured scale, operational security or production
readiness requires the separate evidence in the program readiness checklist.
