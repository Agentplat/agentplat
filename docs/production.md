# Production deployment

AgentPlat's maintainer reports that AgentPlat packages are already used in
production. This is a maintainer-reported deployment statement, not a published
customer study: package versions, workload, observation period and incident
metrics have not yet been recorded here. It does not expand the paper's evidence.

AgentPlat 1.4.0 is published on npm under `latest` across 70 packages. See the
[verified 1.4.0 distribution record](releases/1.4.0-distribution.md). The published
consumer checks demonstrate bounded integration, not production-scale validation.

## Supported application boundaries

Use the exported APIs under the [stability contract](stability.md). Start from
[persistent collaboration](getting-started/persistent-collaboration.md) and
[integration controls](getting-started/integration-controls.md). Reference demos
supply development defaults; applications must configure their actual host.

| Deployment concern | Application configuration and acceptance check |
| --- | --- |
| Runtime and installation | Use a Node version supported by every selected package and adapter; the release includes a Node 22 consumer check. Pin coordinated package versions and commit the lockfile. |
| Persistence | Choose durable PostgreSQL/Redis/Temporal adapters as applicable. Apply documented migrations, back up data and exercise restore before accepting production traffic. In-memory stores provide no restart durability. |
| Identity and authorization | Verify principals and tenant boundaries at ingress. Connect policy and approval checkpoints to the actual execution path; direct provider or handler calls do not inherit opt-in controls. |
| External effects | Supply idempotency keys, bounded retries and reconciliation for uncertain outcomes. Verify that restart after an effect does not duplicate the action. |
| Distributed work | Configure lease expiry, fencing and drain behavior in the owning adapters. Test interruption and recovery with the selected database and worker topology. |
| Operations | Collect structured errors and audit events, monitor backlog and failed/reconciling work, and define alerts, retention and operator recovery procedures. |
| Secrets and network | Supply credentials outside source, restrict database/tool access, and configure authenticated transport and peer key custody for Mesh. |
| Capacity | Measure latency, throughput and recovery on the intended workload. Local deterministic tests do not define a production capacity limit. |

## Adopting the current release

Select the exact 1.4.0 versions for the AgentPlat packages your application uses
and retain its lockfile. Review the [Planner migration guide](releases/room-planner-1.4.0-adoption.md)
and [persistent-memory consumer guide](getting-started/persistent-memory-consumer.md)
when enabling those optional profiles. Package installation does not apply schema
migrations or enable optional capabilities. Rehearse migration, backup/restore and
recovery on the application's own non-production environment before a separately
authorized production rollout.

## Migration from previews

The 1.0.0 candidate carries the beta.9 runtime improvements and release tooling;
it introduces the stability policy without intentionally changing runtime APIs.
It replaces the unpublished beta.10 candidate. The partially published beta.9
cohort is not a coordinated upgrade target.

Once publication is verified, select exact 1.0.0 versions for all @agentplat
packages your application uses and regenerate the lockfile. Compile the
application, run its integration tests and verify its actual adapters in staging.
Exercise restart, approval, failed external-effect and recovery paths before
rolling out. Preserve the old lockfile and deployment artifact for rollback;
restore data only under the adapter's documented migration/restore procedure.

Publication acceptance requires the complete 65-package release, registry
bytes/signatures/provenance/tag checks, and clean package consumers. Deployment
acceptance additionally depends on the application's configuration and workload.
The [component matrix](component-maturity.md) records the available evidence.
