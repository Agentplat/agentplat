# Losing Morphogenesis Proposals and Partial Effects

When competing organizational changes touch independently governed subsystems, only one proposal may become the accepted successor. Effects from another proposal can still have occurred. Recovery must account for those effects instead of treating the losing proposal as if it never ran.

## The accepted head is not a global transaction

Agent Morphogenesis records an accepted organizational successor through its morphology head. Membership, Team, Work and other subsystems retain their own state and authority. Their effects and the head update do not share one global atomic commit.

Consider two proposals, A and B, approved against the same morphology epoch. Each activates a successor Team and obtains a Work assignment before attempting to advance the head. If A wins the predecessor compare-and-swap, B cannot also become the accepted successor. But B's already admitted Team and Work effects remain real until their owners reconcile and close them.

The right question is not only “Which proposal won?” It is also “What did each owner apply, what remains authorized, and what evidence records the resolution?”

## Follow the losing proposal's effects

For each proposal, keep its exact predecessor, decision, execution authorization, operator plan and stable operation identities connected to the owner receipts. When a proposal loses the head race:

1. Stop scheduling new effects for that proposal.
2. Reconcile every prepared operation with the subsystem that owns it. A timeout or lost acknowledgement does not establish that an effect failed.
3. Reuse the original operation identity while resolving an uncertain result. If the owner cannot determine the outcome, block advancement rather than retrying with a new identity.
4. Close the losing proposal's Work authority and account for work already admitted under it. Follow the owner's fencing and drain rules before detaching or retiring resources.
5. Release reservations when the applicable owner confirms they are no longer needed.
6. Record a terminal `superseded` outcome with the receipts and cleanup evidence. Do not record a normal activation receipt for the losing proposal.

These steps coordinate recovery; they do not promise that every effect can be undone. Compensation is owner-specific and may be partial. Already admitted work or irreversible external actions may remain consequential and require an explicit operational resolution.

## Inspect evidence by owner

An accepted morphology head shows which successor was recorded. It does not prove that all competing proposals had no effects. Review the records from each affected owner:

- The Morphogenesis store: predecessor, accepted successor and terminal proposal outcome.
- The decision and execution boundaries: exact proposal binding, scope, mandate and expiry.
- Team and Membership: activation, detachment, enrollment or retirement receipts.
- Work: assignment, fence, drain and completion or cancellation evidence.
- The operation journal: prepared identities, reconciled outcomes and compensation attempts.
- The budget owner: reservation and release receipts.

A receipt from one subsystem cannot certify another subsystem's transition. Preserve the links between each receipt and the proposal step it resolves.

## Evaluate correctness and usefulness separately

Test a bounded race with two proposals from the same predecessor. Inject a crash or lost acknowledgement after an owner applies an effect but before the controller records the response. Then verify that the winner is unique, the losing proposal stops, uncertain operations keep their original identities, authority is fenced before removal, and the terminal record reflects any partial cleanup.

Passing this scenario demonstrates behavior under that schedule and the configured owner contracts. It does not prove that a resulting organization performs better, that compensation is globally complete, or that all deployments satisfy the required owner assumptions. Measure mission outcomes separately from transition safety.

## Sources

- [Governed Agent Morphogenesis v1.0 results and evidence limits](../research/agent-morphogenesis-paper-v1.0-public-summary.md)
- [Agent Morphogenesis results and evidence limits](../research/agent-morphogenesis-paper-v1.0-public-summary.md)
- [Agent Morphogenesis V1 specification](../specification/agent-morphogenesis-v1.md)
- [Agent Morphogenesis V2 specification](../specification/agent-morphogenesis-v2.md)
