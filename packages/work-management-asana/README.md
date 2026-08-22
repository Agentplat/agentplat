# @agentplat/work-management-asana

OAuth-backed Asana adapter for AgentPlat human contributions. It uses Asana
Custom External Data to persist the stable AgentPlat idempotency key, allowing
lookup and reconciliation after a process crash. External Asana completion is
only a projection and never completes an AgentPlat contribution automatically.

The adapter follows the official Asana
[Create a task](https://developers.asana.com/reference/createtask) and
[Custom External Data](https://developers.asana.com/docs/custom-external-data)
contracts. OAuth credentials and project access remain deployment concerns.

Run the opt-in sandbox scenario with a disposable project:

```sh
ASANA_ACCESS_TOKEN=... ASANA_PROJECT_GID=... pnpm test:sandbox
```

The scenario verifies project permissions, create, external-identity lookup,
update, and recovery after a simulated process crash. It intentionally leaves
one clearly labelled task in the selected project as validation evidence.

Repository maintainers can run the same check through the protected
`Agent Room Asana sandbox validation` workflow. Configure an `asana-sandbox`
environment with approval protection and the `ASANA_ACCESS_TOKEN` and
`ASANA_PROJECT_GID` secrets, then dispatch it for the exact `main` commit with
the `RUN_ASANA_SANDBOX` confirmation.
