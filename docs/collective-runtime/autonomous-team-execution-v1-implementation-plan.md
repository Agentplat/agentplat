# Autonomous Team Execution and Causal Replanning V1 implementation plan

Status: implemented

## Product outcome

Allow an activated ad hoc team to execute its position dependency graph across
portable-agent sessions, exchange durable result references, and recover from
one failed or unsafe member without introducing a central scheduler or shared
team authority.

## Public package shape

`@agentplat/collective-runtime/team-execution` contains:

- strict policy, scope, command, dispatch, artifact, result, position, state,
  recovery, epoch-history and handoff contracts;
- canonical content addressing and exact, prototype-safe validators;
- a deterministic reducer for start, prepare, settle, expiry, cancellation and
  rebind transitions;
- a compare-and-swap runtime with prepared-dispatch idempotency;
- a reference-only artifact availability port;
- a portable-agent executor adapter; and
- adapters into the existing team-reconfiguration flow.

The package contains no provider SDK, transport, signer, global task graph,
tool executor, credential store or action-authority gateway.

## Execution algorithm

1. Start from one exact active `TeamProposalV1` and
   `JointWorkContractV1`.
2. Mark positions without dependencies ready and leave all successors blocked.
3. Persist a content-addressed dispatch before invoking an external member.
   Replaying the same command returns the same dispatch.
4. Require every dependency artifact to be locally available before execution.
5. Execute through a bound portable-agent session, which retains responsibility
   for pre-step, post-output and pre-action controls.
6. Publish durable content references before committing a result; raw provider
   output never enters team state.
7. Unlock successors only after all dependency positions complete.
8. Complete the execution only after every position completes under local
   artifact and control policy.

## Causal recovery

A failed or unsafe result closes the current epoch with an exact recovery
signal naming the position, member, binding, dispatch result and joint
contract. The adapter projects this signal into the existing bounded
team-reconfiguration runtime.

After a replacement proposal is activated with individual Work Contracts, a
rebind advances both team and execution epochs. The reducer retains only the
completed subgraph that is independent of the failed position. The failed
position and every causal successor return to ready or blocked state. Artifacts
outside the retained closed subgraph cannot cross the epoch boundary.

## Compatibility and deployment

- additive opt-in package subpath;
- no Mesh wire, Work Contract, portable-agent or provider API changes;
- no team-level assignment or effect authority;
- browser-safe, provider-neutral implementation;
- in-memory ports only for local composition and deterministic simulation; and
- durable compare-and-swap state plus durable artifact storage required in
  production.

## Completion criteria

- dependency readiness and artifact closure are deterministic;
- a dispatch is persisted before external execution and is replay-idempotent;
- progress cannot bypass the configured control disposition;
- only durable artifact references enter state;
- failure and timeout identify the exact causal member and result;
- replacement advances epochs and invalidates the failed downstream closure;
- state handoff preserves exact predecessor continuity; and
- build, public types, unit, terminology, catalog and packed-consumer checks
  pass.
