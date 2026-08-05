# Continuous Role Alignment V1 acceptance checklist

## Architecture

- [x] Longitudinal state is distinct from one-shot inference assessments.
- [x] Existing runtime behavior remains opt-in and source compatible.
- [x] Pure contracts and Portable Agent integration use separate entry points.
- [x] No model-vendor SDK is imported.

## State and control

- [x] Policy, role and target bindings are canonical and digest-bound.
- [x] Scores use deterministic integer basis points.
- [x] Rolling coherence, breach counts and recovery hysteresis are retained.
- [x] The causal event tail is bounded while global counters and head advance.
- [x] Reinforcement, challenge, pause, realignment and denial are bounded.
- [x] Protected actions can fail closed while accumulated state is degraded.
- [x] Sticky states require explicit resume or an exact successor role.
- [x] State saves are expected-revision checked.

## Handoff

- [x] Export binds controller state to the exact checkpoint transfer digest.
- [x] Import verifies source session, agent, objective and role.
- [x] Rolling state, counters, retained event tail and causal head survive the
  handoff.
- [x] The target session and agent receive a new content-free role anchor.

## Security

- [x] Assessor results bind request, target, identity, version and lifetime.
- [x] Logical-time rollback fails closed.
- [x] State contains no raw prompt, output, action input or credentials.
- [x] Observer failure cannot change enforcement.
- [x] Size, count, TTL and evidence-reference ceilings are explicit.
- [x] Digest limitations and repository trust assumptions are documented.

## Verification

- [x] Pure reducer fixtures cover healthy, drift, challenge, pause, resume,
      realignment, role replacement and tampered state.
- [x] Portable runtime fixtures cover all three control points and withheld
      output/action behavior.
- [x] Checkpoint handoff fixtures preserve longitudinal state and reject
      transfer substitution.
- [x] Compile-time public contracts cover both new entry points.
- [x] Full workspace build, unit suite, public audit and pack smoke are green on
      the final commit.
