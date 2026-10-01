# Adopting AgentPlat 1.2.0

Status: published and verified on 2026-09-30. All 66 packages are available at
1.2.0 under latest; see the [distribution record](../releases/stable1-2-distribution-20260930.md).

1. Upgrade the AgentPlat packages your application uses together to 1.2.0 and keep
   a lockfile. Existing applications retain their configured behavior.
2. For standalone controlled actions, import the optional approval/admission/effect
   subpaths described in [the integration guide](../action-control/integration.md).
3. Back up before explicitly invoking the new PostgreSQL migration runners. Existing
   collective/Room migrations and historical data are not rewritten or enrolled.
4. Configure verified host identity, approvers, policy, clocks, trusted resource facts,
   quotes, all applicable accounts and persistent grant-to-approval mapping.
5. Route effects through the existing ActionGateway composed with admission and,
   where supported, destination-atomic conditional execution. Required controls must
   fail closed if storage, facts or capabilities are missing.
6. Verify suspension, exact review, resource changes, competing budgets, process loss
   and receipt-based reconciliation in the application's environment before enabling
   real actions. Unknown outcomes never automatically retry/refund.

For The Agent Control, the proposed dependency update after publication is:

```sh
npm install --save-exact @agentplat/inference-control@1.2.0 \
  @agentplat/collective-control-postgres@1.2.0
```

Keep MCP routing, connectors, UI, authentication implementation, secret custody,
commercial licensing and portal logic in ACL. AgentPlat supplies public mechanisms;
ACL owns their authenticated server integration. The installation need not depend
on a remote portal for action authorization.
