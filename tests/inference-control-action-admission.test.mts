import { ActionAdmissionServiceV1, InMemoryActionAdmissionStoreV1,
  createActionAdmissionDispatcherV1, type ActionAdmissionRequestV1 }
  from '@agentplat/inference-control/action-admission';
import type { ActionDispatcher } from '@agentplat/inference-control/tools';
import { PostgresActionAdmissionStoreV1, runActionAdmissionMigrationsV1 }
  from '@agentplat/collective-control-postgres/action-admission';
declare const pool: ConstructorParameters<typeof PostgresActionAdmissionStoreV1>[0];
declare const downstream: ActionDispatcher;
declare const request: ActionAdmissionRequestV1;
const service = new ActionAdmissionServiceV1(new InMemoryActionAdmissionStoreV1());
void service.reserve(request);
void createActionAdmissionDispatcherV1({ service, downstream, quote: async () => request });
void new PostgresActionAdmissionStoreV1(pool, { tenantId: 'verified' });
void runActionAdmissionMigrationsV1(pool);
