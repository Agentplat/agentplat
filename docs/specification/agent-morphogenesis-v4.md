# AgentPlat Agent Morphogenesis Collective Strategy Intelligence V4

**Defines:** additive, opt-in exchange and convergence of content-free strategy
outcome evidence between Agent Mesh peers. **Status:** source capability; no
production-scale, safety or organizational-improvement claim.

V4 extends V3 and reuses the existing Strategy Evidence Exchange and Strategy
Convergence primitives. It does not add remote execution or governance
authority.

## Evidence envelope

`MorphogenesisStrategyOutcomeAttestationV4` binds the exact V3 catalog,
strategy definition, Morphogenesis policy, blueprint catalog, proposal
generator, context class, selection, execution binding, outcome receipt,
measurement and feedback digests. Its inner Ed25519-signed attestation contains
only identifiers, digests, bounded metrics and disposition; prompts, reasoning,
credentials, code and private mission content are excluded.

Admission requires an exact local catalog and policy match, admitted tenant,
mesh, policy domain and context class, bounded TTL, valid epoch membership,
signature and local Trust eligibility. Duplicate streams are idempotent,
same-sequence conflicts are equivocation, and certification requires distinct
peers and independence groups.

## Agent Mesh and persistence

`createMorphogenesisStrategyCollectiveSyncAdapterV4` projects the signed inner
envelope into the existing authenticated causal Collective Sync domain.
`admitFromMesh` reconstructs the expected V4 binding from the receiving node's
local catalog and reapplies all local compatibility rules before delegating to
the Exchange. Transport authentication never grants strategy or execution
authority.

PostgreSQL stores Exchange and Convergence heads with revision CAS, state
digests and an external rollback witness. Replay remains deterministic and
out-of-order causal records are handled by the existing Exchange semantics.

## Collective priors and convergence

Collective certificates become bounded advisory priors. They expose neither
weights nor authorization and cannot modify the local learner. Robust lower
medians, minimum peer/group thresholds and local Trust reduce the influence of
outliers, replay, Sybil identities and collusion; they do not eliminate
coordinated compromise.

Convergence requires sustained compatible cycles. Partitions and recovery hold
the current state, unsafe evidence isolates, and near-leader diversity can
prevent herd adoption. An `adopt` or `isolate` result maps only to an inert V3
governance recommendation input.

## Authority and sovereignty

Every peer controls its own catalog, compatibility policy, Trust decision,
prior influence and governance route. A recommendation must still be reviewed
by a policy-authorized agent, person or quorum, followed by the ordinary V3
catalog transition and governed Morphogenesis execution. No human-only approval
requirement exists and no remote peer can approve on behalf of the local node.

## Evidence boundary

Deterministic tests establish source behavior: binding, signature projection,
compatibility, replay/equivocation controls, independence thresholds, robust
aggregation, partition/recovery holds, diversity preservation and durable CAS.
Real-world effectiveness requires separate preregistered operational evidence.
