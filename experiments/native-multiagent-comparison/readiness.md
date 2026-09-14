# Readiness pending — do not execute yet

Every item below is a future requirement. Reviewing documentation and metadata
for the design does not satisfy these checks. No campaign results exist.

## Design review

- [ ] Federico confirms that the question and deliverables suit his presentation.
- [ ] Reviewers accept that C is Claude Code coordinated through Agent Rooms and
      does not measure specific Mesh, Morphogenesis, or human-approval mechanisms.
- [ ] Cost rules, replacements, mode deviations, and incomplete results are reviewed.
- [ ] Separate budgets are selected and authorized before incurring expenses.

## Future technical preparation

- [ ] The Terminal-Bench 2.0 distribution is identified; category and four tasks are verified.
- [ ] Complete file hashes and image digests are recorded; tool versions are pinned.
- [ ] Original verifiers work with official solutions in separate environments.
- [ ] Isolation prevents agents from accessing verifiers and reference solutions.
- [ ] A creates no subagents; B creates exactly two active native teammates.
- [ ] C actually uses AgentPlat for tasks/messages; the bridge does not solve the task.
- [ ] Every arm uses the same Claude Code version and effective model in every session.
- [ ] No nested agents, model fallbacks, or auxiliary calls outside policy occur.
- [ ] CPU/memory limits are aggregate limits including coordination, not per-worker limits.
- [ ] The controller needs neither a person nor an auxiliary model to drive the session.
- [ ] Completion signaling and team shutdown are verified; deliverables are frozen.
- [ ] Accounting covers all sessions, caching, retries, and in-flight requests.
- [ ] The aggregate monetary limit is tested; missing usage stops admission of new calls.
- [ ] Native logs and ATIF reconcile without counting streaming fragments as extra usage.
- [ ] All three technical pilots outside the evaluation set are completed and retained.

## Protocol freeze, before evaluation

- [ ] Every variable in protocol section 12 has been resolved.
- [ ] Prompts, the 36-slot schedule, network/cache policy, and analysis rules are saved.
- [ ] The manifest binds clean source, the protocol version, and adapter hashes.
- [ ] The final budget and availability or absence of a replacement reserve are recorded.
- [ ] Results on the four evaluation tasks have not been used to select configuration.
- [ ] Storage and retention of failures, attempts, and incidents are ready.

If any essential requirement remains unresolved, the study stays in preparation.
Treatment names must match the systems' actual behavior when evaluation begins.

[Back to protocol](protocol.md)
