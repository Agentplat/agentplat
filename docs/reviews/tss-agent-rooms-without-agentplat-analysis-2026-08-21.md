# Análisis de la implementación TSS de Agent Rooms sin AgentPlat

**Fecha:** 2026-08-21  
**Alcance:** `tss-svc-agent-rooms`, `tss-svc-agents` y `template-project`  
**Objetivo:** reconstruir la solución actual, identificar fortalezas y problemas, y evaluar qué mejoraría al adoptar AgentPlat.

## Resumen ejecutivo

TSS construyó una implementación ambiciosa y funcionalmente rica de colaboración multiagente. La pieza central es un workflow durable por Room en Temporal, con agentes ejecutados en workflows hijos, routing por menciones o por LLM, eventos incrementales en PostgreSQL, catálogo de agentes basado en manifiestos, artefactos, memoria, planes y tareas humanas. `template-project` agrega un borde autenticado, una UI de Master Room y sincronización de contexto de proyecto. En paralelo, `tss-svc-agents` administra otra representación de agentes y sus runtimes por proveedor.

La dirección general es buena: separación entre coordinación durable y proyección de producto, límites de iteraciones y saltos, idempotencia parcial, catálogo versionado, BFF como borde de confianza, secretos resueltos en servidor y una experiencia de usuario integrada al proyecto.

El principal problema no es una decisión puntual sino la duplicación del dominio. Hoy existen dos catálogos incompatibles de agentes y varios contratos locales para Rooms, eventos, planes, artefactos, memoria, herramientas y ejecución. Esto ya produjo deriva entre repositorios y deja fuera capacidades centrales de gobernanza: participantes con identidad verificable, lifecycle explícito de Room, permisos y aprobaciones antes de efectos, handoffs tipados, artefactos versionados con procedencia, memoria tenant-scoped, transacciones estado-evento y una auditoría coherente.

La recomendación es **no reescribir Temporal ni los productos de TSS de una vez**. Conviene adoptar AgentPlat como dominio canónico y capa de contratos, mantener Temporal como adaptador de ejecución durable donde aporte valor, y migrar por estrangulamiento. `tss-svc-agents` puede seguir siendo el plano de administración de credenciales/configuración o converger gradualmente sobre los contratos de Runtime y Model de AgentPlat.

Hay tres acciones inmediatas antes de cualquier migración:

1. Rotar y eliminar del historial las credenciales de AgentPlat hardcodeadas en `template-project/services/marketing-go/a_local_defaults.go`, `a_worker_defaults.go` y `local_worker.go`.
2. Corregir el contrato incompatible de `projectId/subprojectId` entre `template-project` y los endpoints de mensajes/configuración de Rooms.
3. Restaurar la ejecución real de tests de `tss-svc-agent-rooms`; actualmente `npm test` compila pero falla antes de ejecutar tests por el glob entre comillas.

## Base de evidencia y límites

Se analizó el código local en estos commits:

| Repositorio | Commit | Último cambio observado |
| --- | --- | --- |
| `tss-svc-agent-rooms` | `694dd87c613e` | 2026-07-23, coordinación de tareas humanas del planner |
| `tss-svc-agents` | `ff58125deacf` | 2026-06-16, URL del importer |
| `template-project` | `eef57e3a11f0` | 2026-08-20, evidencia de captura de funnel overview |
| AgentPlat usado para el contraste | `dfa79b1566da` | 2026-08-20 |

Verificaciones ejecutadas:

- `tss-svc-agents`: `go test ./...` pasó.
- `template-project/apps/backoffice-bff`: 81 archivos y 676 tests pasaron.
- `tss-svc-agent-rooms`: TypeScript compiló como parte de `npm test`, pero Node no encontró `dist/src/**/__tests__/*.test.js`; por lo tanto, la suite no se ejecutó.

Este documento prueba estructura, contratos y comportamiento cubierto por tests. No prueba disponibilidad, seguridad, costo, latencia ni escala en producción. Las ventajas atribuidas a AgentPlat son capacidades presentes en sus APIs, documentación y tests; no implican validación automática del despliegue TSS.

## Qué construyeron

### Arquitectura reconstruida

```text
Backoffice React
  ├─ Master Room, threads, roster, goal, canvas, polling y tareas humanas
  └─ catálogo/pipeline de agentes
          │
          ▼
Backoffice BFF (identidad y tenant derivados)
  ├─ allowlist/proxy ───────────────► tss-svc-agent-rooms
  │                                  ├─ REST/Fastify
  │                                  ├─ Temporal: Room + agent seats
  │                                  ├─ manifiestos JSON de agentes
  │                                  ├─ LLM/OpenAI-compatible + gateway remoto
  │                                  ├─ herramientas builtin/HTTP
  │                                  ├─ PostgreSQL: eventos, planes, tareas
  │                                  └─ Asana como work-management adapter
  │
  └─ cliente de agentes ────────────► tss-svc-agents
                                     ├─ agentes abstractos
                                     ├─ operational agents por proveedor
                                     ├─ OpenAI/Gemini/Anthropic chat
                                     ├─ secret refs + AWS Secrets Manager
                                     ├─ importer de agentes locales
                                     └─ purchase runs con evidencia
```

### Responsabilidad real de cada repositorio

#### `tss-svc-agent-rooms`

- Modela una Room como workflow de entidad de larga duración en Temporal.
- Registra mensajes y enruta por `@mention`, router LLM o agente fallback.
- Ejecuta cada agente en un workflow hijo interrumpible, con límites de tiempo, iteraciones y saltos.
- Define agentes como manifiestos JSON versionados con instrucciones, tools, memoria y metadata.
- Proyecta eventos a PostgreSQL para polling incremental.
- Integra un orchestrator remoto, artefactos de canvas, planes mixtos y tareas humanas.
- Implementa conectores de work management con Asana como primer adaptador.

#### `tss-svc-agents`

- Separa identidad abstracta de agente y configuración operacional por proveedor.
- Aísla secretos mediante referencias y resolución en servidor.
- Expone CRUD, chat directo, importación idempotente de agentes locales y purchase runs.
- Mantiene un diseño Go por dominio, casos de uso e infraestructura.
- No participa actualmente en el runtime de Rooms: los Rooms usan su propio registro de manifiestos.

#### `template-project`

- Integra Master Room y subthreads en el workspace de proyectos.
- Usa un BFF con allowlist, propaga el tenant autenticado y oculta claves administrativas.
- Implementa polling incremental, roster, goal, planes, tareas humanas y render de artefactos.
- Sincroniza de forma best-effort contexto de proyectos hacia Rooms.
- Consume además `tss-svc-agents` para el pipeline/catálogo administrativo, creando una segunda experiencia de agentes.

## Qué hicieron bien

### 1. Durable execution bien separada de la experiencia de producto

Temporal conserva la coordinación y PostgreSQL alimenta la UI. El uso de workflows hijos para seats, timeouts, steering y `continueAsNew` demuestra buen entendimiento de procesos largos. La UI no conoce Temporal y sólo consume REST, lo que mantiene reemplazable el motor.

### 2. Varias defensas contra loops y ejecuciones descontroladas

Hay límites explícitos de iteraciones, saltos entre agentes, tamaño de mensajes, historia incluida y tiempo por seat. Se evitan self-mentions, se devuelve el control al conductor y se degrada el fallo de un especialista a una explicación para el humano.

### 3. Manifiestos de agentes estrictos y versionados

Los manifiestos separan contrato visible al modelo de implementación de la herramienta. Zod rechaza campos inesperados y credenciales embebidas en execution blocks. La versión resuelta por una activity queda fijada en el historial de Temporal, reduciendo cambios de comportamiento a mitad de una ejecución.

### 4. Buenas decisiones de borde en `template-project`

El navegador pasa por un BFF autenticado; las rutas hacia Rooms están allowlisted; el tenant proviene del contexto autenticado; la clave administrativa queda server-side; los nombres de imágenes se validan. Es una base razonable para un trust boundary de aplicación.

### 5. `tss-svc-agents` tiene una separación conceptual sana

La distinción `Agent` / `OperationalAgent` evita mezclar identidad lógica con proveedor, modelo y credenciales. Los secretos no se guardan en PostgreSQL y la suite completa pasa. El importer usa tokens hasheados, códigos de emparejamiento expirables e idempotencia por fingerprint.

### 6. El producto piensa en humanos dentro del loop

Planes con pasos humanos, estados durables y adapters de work management son superiores a una conversación puramente automática. La finalización vuelve a la Room y activa replanning, una dirección coherente con colaboración humano-agente persistente.

### 7. Lecturas incrementales y deduplicación parcial

El cursor global de eventos, páginas acotadas y claves de deduplicación por Room evitan releer logs completos y duplicar inserts ante retries de Temporal. Las herramientas reciben `toolCallId` y `correlationId`, útiles como base para idempotencia downstream.

## Qué está mal o incompleto

### Hallazgos críticos

#### C1. Credenciales reales hardcodeadas en el repositorio de plantilla

`template-project` contiene valores con formato de API key y tenant ID en tres archivos de defaults locales. Aunque fueran sólo de desarrollo o estuvieran revocados, deben tratarse como comprometidos: rotación inmediata, eliminación del código e historial, y secret scanning preventivo.

**Impacto:** acceso no autorizado, consumo/costo, fuga de datos tenant-scoped y propagación del secreto por clones o artefactos de build.

#### C2. Memoria compartida entre tenants

La clave de memoria de Room es `room:{roomId}` y la de agente es `agent:{seatType}`; ninguna incluye `tenantId`. La memoria `agent` queda compartida por nombre de agente entre todos los tenants del despliegue. El `ToolExecuteCtx` tampoco porta tenant. Además, la implementación es un único JSONL local, sin control transaccional ni protección de concurrencia.

**Impacto:** fuga directa de contexto entre tenants y comportamiento inconsistente entre réplicas.

#### C3. Contrato roto entre UI y Rooms para scope de proyecto

La UI envía `projectId` y opcionalmente `subprojectId` al configurar una Room y al enviar mensajes. Los JSON schemas de `/config` y `/messages` no declaran esos campos y usan `additionalProperties: false`. Las llamadas del flujo normal de Master Room pueden ser rechazadas con 400. A la vez, `projects-context-sync.ts` presupone endpoints `/v1/context/*` que no aparecen en el servidor analizado.

**Impacto:** la integración de contexto que los comentarios presentan como existente no es compatible con el servicio en este checkout.

#### C4. El servicio permite suplantar roles y autores

`POST /v1/rooms/:roomId/messages` acepta `role: human | agent | system` y un `author` arbitrario. El BFF reenvía el body sin normalizarlo. Un cliente autenticado podría publicar como sistema o como agente, activar routing y contaminar auditoría/procedencia.

**Impacto:** pérdida de integridad del transcript, prompt/control injection privilegiada y atribución falsa.

#### C5. La “product truth” puede perder eventos deliberadamente

El README llama a PostgreSQL “product truth”, pero los workflows tratan `appendEvent` como best-effort y continúan después de agotar retries. El evento puede quedar sólo en el estado/historial de Temporal y desaparecer de la vista de producto. Estado y evento no se confirman en una misma transacción.

**Impacto:** Rooms que avanzan sin registro completo, UI divergente, auditoría incompleta y recuperación ambigua.

### Hallazgos altos

#### H1. Dos fuentes de verdad para agentes

Rooms carga manifiestos desde archivos; `tss-svc-agents` persiste agentes y operational agents en PostgreSQL. Sus IDs, lifecycle, capacidades, modelos, instrucciones y estados no coinciden. `template-project` consume ambos catálogos. No existe sincronización o binding verificable entre una entrada administrativa y el seat que efectivamente corre.

**Consecuencia:** drift, agentes visibles pero no ejecutables en Rooms, instrucciones distintas y operaciones administrativas que no gobiernan el runtime real.

#### H2. Tenancy incompleta en Rooms y ausente en conversaciones directas

Rooms valida ownership en una tabla lateral, pero las claves primarias y relaciones internas no están tenant-qualified. Los workflow IDs tampoco incorporan tenant. Las rutas de conversaciones directas no resuelven ni verifican tenant y reutilizan `room_events` sin registrar ownership en `rooms`.

**Consecuencia:** aislamiento dependiente de disciplina de borde, colisiones globales de IDs y una superficie 1:1 sin tenant boundary.

#### H3. No hay permisos ni aprobación en el punto de efecto

Que un agente declare una tool equivale en la práctica a poder invocarla. Las tools HTTP llaman URLs del manifiesto; no hay policy decision por riesgo, actor, tenant, Room o acción, ni Action Grant de un solo uso. La aprobación humana existe como tarea de planner, no como barrera obligatoria antes del efecto externo.

**Consecuencia:** herramientas de escritura o compra pueden ejecutarse sin un control uniforme y auditable.

#### H4. Artefactos no son recursos durables de primera clase

Los artefactos viajan como JSON serializado dentro de eventos. No tienen identidad estable, versiones inmutables, procedencia estructurada, approvals asociados ni lifecycle propio en Rooms.

**Consecuencia:** difícil comparar revisiones, aprobar exactamente una versión o reconstruir qué input/run produjo el resultado.

#### H5. Planificación y handoffs son implícitos

El relevo entre especialistas se codifica como texto y `@mentions`; el handback al conductor también es un prompt textual. Los planes tienen pasos y dependencias, pero el traspaso no liga formalmente emisor, receptor, work source, contexto acotado, versión y aceptación de ownership.

**Consecuencia:** errores de atribución, contexto excesivo o insuficiente y recuperación difícil después de fallos.

#### H6. El borrado destruye el historial de producto

`DELETE /v1/rooms/:id` termina el workflow y elimina físicamente `room_events`. No hay lifecycle `active → paused → completed → archived` ni archivo inmutable por defecto.

**Consecuencia:** una acción de UI puede borrar evidencia material; recuperación y compliance quedan fuera del dominio.

### Hallazgos medios

#### M1. La suite de Rooms no se ejecuta con el comando documentado

El script usa `node --test 'dist/src/**/__tests__/*.test.js'`. Las comillas evitan expansión del shell y Node 24 no resuelve ese glob. Compilar no equivale a haber ejecutado las pruebas.

#### M2. No hay contrato API generado/compartido entre los tres repos

La plantilla redefine manualmente tipos de eventos, planes y agentes. La incompatibilidad de scope es un síntoma. Rooms tampoco publica un OpenAPI usado para generación de cliente o contract tests cross-repo.

#### M3. Polling reemplaza streaming aunque el dominio es interactivo

El polling incremental es válido como fallback, pero aumenta latencia/carga y obliga al cliente a reconciliar estados y cursores. No hay un stream normalizado, versionado y cancelable para runs o mensajes.

#### M4. Observabilidad y usage accounting son parciales

Hay logs, correlation IDs y métricas de work management, pero no un modelo uniforme de run, tokens, costo, finish reason, latency, tool decision, policy decision y outcome a través de proveedores.

#### M5. Algunas capacidades declaradas todavía no existen

El manifiesto acepta MCP, pero el executor responde que no está conectado. El gateway no soporta steering durante una ejecución. El código y el README deben distinguir con más rigor “schema aceptado”, “implementado” y “operacionalmente validado”.

#### M6. Riesgos operacionales de persistencia y migraciones

Rooms crea/altera schema en boot con un SQL monolítico, en vez de migraciones versionadas con checksum y rollback controlado. Varias entidades relacionadas usan IDs globales y no tenant-qualified foreign keys.

## Oportunidades de mejora sin adoptar todavía AgentPlat

1. Unificar el catálogo: hacer que Rooms resuelva una revisión inmutable de `tss-svc-agents`, o retirar uno de los dos registros.
2. Incorporar `tenantId`, `actorId`, `participantId` y `authority` en todos los contextos de ejecución, memoria, tools y workflow IDs.
3. Derivar `role` y `author` de la identidad autenticada; el cliente sólo debería enviar contenido y quizá un idempotency key.
4. Hacer transaccionales el cambio de estado y el evento durable, con outbox para publicación posterior.
5. Convertir artefactos en entidades versionadas e inmutables con provenance y approvals sobre una versión exacta.
6. Definir handoffs tipados y persistidos; mantener menciones sólo como UX.
7. Añadir policy evaluation y approval gates obligatorios en el punto previo al efecto.
8. Publicar OpenAPI/JSON Schema, generar el cliente de plantilla y ejecutar contract tests entre commits fijados.
9. Sustituir el JSONL de memoria por un store tenant-scoped y definir retención, clasificación y borrado.
10. Introducir migraciones versionadas, archival en lugar de hard delete, y reconciliación de eventos perdidos.
11. Añadir SSE versionado con polling como fallback.
12. Separar health de readiness: PostgreSQL, Temporal, registry y runtime/provider deberían tener checks explícitos.

## Qué sería mejor usando AgentPlat

### Comparación de capacidades

| Necesidad actual | Solución local | Con AgentPlat | Mejora concreta |
| --- | --- | --- | --- |
| Dominio de Room | Workflow + tipos TSS | `@agentplat/rooms` | Lifecycle, participantes, tareas, approvals, políticas y eventos bajo invariantes comunes |
| Persistencia | Schema de boot + eventos best-effort | `@agentplat/rooms-postgres` | Mutación y evento en una transacción; relaciones tenant-qualified; migraciones versionadas |
| API | Fastify ad hoc | `@agentplat/rooms-api` o adapter propio | Contrato estable e identidad tenant derivada por authenticator |
| Ejecución multi-proveedor | Implementaciones separadas en TS y Go | `@agentplat/runtime` + `@agentplat/model-*` | Contrato provider-neutral, cancelación, run IDs, usage y finish metadata |
| Sesiones multiagente | Routing propio dentro de Room | `@agentplat/sessions` cuando aplica | Eventos tipados, límites, stopping rules y fallback explícito para coordinación efímera |
| Herramientas | Manifest tool + builtin/HTTP | `@agentplat/tools`, MCP e Inference Control | Credenciales, identidad, policy y audit boundaries explícitos |
| Memoria | JSONL por `roomId` o nombre de agente | `@agentplat/memory` | Scopes tenant-aware y rechazo de acceso cross-tenant |
| Artefactos | JSON en eventos | Artefactos/versiones de Room | Dirección durable, provenance, revisión y aprobación exacta |
| Handoff | Texto y menciones | AgentPlat Handoff | Transferencia tipada, acotada, atribuible, versionada y auditable |
| Auditoría | Event log parcial | `@agentplat/audit` + eventos de Room | Redacción y registros append-only coherentes |
| Seguridad de inferencia | Límites de loops | `@agentplat/inference-control` | Gating antes de modelo, release y acción; controles fail-closed opt-in |
| Evolución colectiva | Conductor/router central | AgentPlat Collective Runtime | Misiones, planificación, equipos, recovery y ownership contracts cuando el caso lo requiera |

### Beneficios específicos para TSS

#### Una sola semántica de Agent Room

La UI, el BFF, el motor durable y el catálogo dejarían de inventar versiones distintas de Room, participant, task, artifact, approval y event. Esto reduce código de integración y drift, que ya es un defecto observable.

#### Tenancy como invariante, no como header de buena fe

AgentPlat propaga `tenantId` en servicios y repositorios, usa relaciones tenant-qualified y rechaza accesos cruzados. TSS seguiría usando su autenticación en el BFF, pero la identidad verificada se convertiría en `TenantContext` y permanecería hasta memoria, tools y persistencia.

#### Gobernanza real antes de efectos

Las policies y approvals de Room pueden decidir si un run o tool es permitido. Para acciones sensibles, Inference Control agrega controles de pre-step, post-output y pre-action; los Action Grants y run IDs permiten ligar autorización e idempotencia a una operación concreta.

#### Artefactos y decisiones verificables

En vez de un blob dentro del transcript, un funnel, reporte o storyboard puede tener ID estable, versiones append-only, provenance y aprobación. La UI puede abrir “la versión 3 aprobada”, no inferir el estado actual a partir de eventos libres.

#### Menos adaptadores duplicados

OpenAI-compatible, Anthropic y Gemini pueden entrar por adapters públicos. TSS conserva su resolución de secretos y sus endpoints específicos, pero deja de mantener contratos de ejecución diferentes en cada servicio.

#### Migración sin abandonar Temporal

AgentPlat no obliga a eliminar Temporal. Una arquitectura razonable es usar `RoomService` y PostgreSQL como dominio/product truth, y un adapter de ejecución que lance o señale workflows de Temporal. Temporal coordina trabajo largo; AgentPlat conserva invariantes, ownership, approvals, artifacts y audit.

### Lo que AgentPlat no resuelve automáticamente

- La autenticación corporativa y RBAC concretos de TSS.
- La topología, disponibilidad, costos y operación de Temporal/PostgreSQL/model providers.
- La seguridad de una tool downstream que ignora idempotencia o fencing.
- La calidad de prompts, agentes o resultados.
- La migración histórica y reconciliación de datos existentes.
- Validación de escala o performance del despliegue TSS.

AgentPlat está en developer preview; sus APIs pueden cambiar antes de la primera versión estable. La adopción debe fijar versiones, ejecutar conformance/contract tests y aislar adapters propios.

## Arquitectura objetivo recomendada

```text
Backoffice React
        │ SSE / REST, cliente generado
        ▼
TSS Backoffice BFF
  autentica usuario → deriva TenantContext + actor + permisos
        │
        ▼
TSS Agent Collaboration API
  ├─ AgentPlat RoomService
  ├─ AgentPlat policy / approvals / artifacts / handoffs
  ├─ PostgresRoomRepository + transactional outbox
  ├─ Runtime adapter registry
  │    ├─ modelos directos
  │    ├─ tss-svc-agents como control plane/config resolver
  │    └─ Temporal adapter para ejecuciones largas
  ├─ tenant-scoped Memory adapter
  ├─ governed Tool/MCP adapters
  └─ Audit sink
        │
        ├─ Temporal workflows (opcional, ejecución durable)
        ├─ proveedores LLM
        ├─ servicios TSS / commerce tools
        └─ Asana y otros work-management providers
```

En este diseño hay una sola fuente de verdad de colaboración: AgentPlat Agent Room. Temporal deja de ser simultáneamente aggregate, scheduler y fuente alternativa de transcript; pasa a ser un ejecutor durable detrás de un port.

## Plan de migración sugerido

### Fase 0 — Contención, 1–2 semanas

- Rotar secretos expuestos y activar secret scanning.
- Reparar el test runner de Rooms y agregar un test que falle si se ejecutan cero tests.
- Alinear `projectId/subprojectId` y crear contract tests UI ↔ BFF ↔ Rooms.
- Bloquear `role` y `author` provenientes del browser.
- Deshabilitar memoria `agent` hasta que sea tenant-scoped.

**Criterio de salida:** flujo Master Room probado end-to-end, cero secretos en git y atribución derivada del actor.

### Fase 1 — AgentPlat como modelo canónico, 2–4 semanas

- Introducir `@agentplat/rooms`, `@agentplat/rooms-postgres` y una facade compatible con las rutas actuales.
- Mapear Room, participant, message, task, artifact y approval.
- Hacer dual-write sólo con reconciliación y métricas; no declarar cutover por escritura exitosa aislada.
- Generar cliente o schemas compartidos para la plantilla.

**Criterio de salida:** equivalencia de proyecciones y tenant-isolation tests en una base descartable.

### Fase 2 — Ejecución y catálogo, 3–6 semanas

- Definir una identidad canónica de agente y revisiones inmutables.
- Adaptar `tss-svc-agents` como resolver/control plane o migrar sus operational agents al registry de Runtime.
- Envolver Temporal como `AgentProvider`/execution adapter y propagar `runId`, cancelación y tenant context.
- Sustituir tools ad hoc por registry/policy boundaries; exigir approvals para efectos sensibles.

**Criterio de salida:** el agente elegido en UI es exactamente el revisionado y ejecutado, con audit y usage.

### Fase 3 — Cutover de colaboración, 3–6 semanas

- Migrar eventos históricos a mensajes, artefactos/versiones, tareas y approvals.
- Cambiar lecturas de UI a la proyección AgentPlat y SSE versionado.
- Archivar, no borrar, Rooms cerradas.
- Retirar el aggregate duplicado de Temporal, manteniendo sólo workflows de ejecución necesarios.

**Criterio de salida:** no hay dos fuentes activas de Room o catálogo; rollback ensayado.

### Fase 4 — Capacidades avanzadas, según necesidad

- AgentPlat Handoff para ownership formal entre especialistas.
- Inference Control en operaciones de compra, publicación o mutación sensible.
- Collective Runtime para equipos dinámicos y recovery sólo donde el producto realmente lo necesite.
- Conformance levels: empezar por Level 1, luego Level 2; no reclamar Level 3/4 sin fixtures y evidencia.

## Priorización final

| Prioridad | Acción | Motivo |
| --- | --- | --- |
| P0 | Rotar secretos hardcodeados | Riesgo inmediato de seguridad |
| P0 | Corregir scope contract y test end-to-end | Flujo principal potencialmente roto |
| P0 | Tenant-scope de memoria y conversaciones | Riesgo de fuga cross-tenant |
| P0 | Derivar autor/rol del actor autenticado | Integridad y auditabilidad |
| P1 | Reparar suite de Rooms | No hay señal confiable de regresión |
| P1 | Unificar catálogo de agentes | Elimina la mayor fuente de drift |
| P1 | Estado + evento transaccionales | Evita pérdida silenciosa de product truth |
| P1 | Policies/approvals en action boundary | Reduce efectos no autorizados |
| P2 | Artefactos versionados + handoffs tipados | Mejora colaboración, revisión y recovery |
| P2 | SSE y usage accounting uniforme | Mejora UX y operación |
| P2 | Migraciones versionadas y archival | Mejora mantenibilidad y evidencia |

## Conclusión

TSS no construyó un prototipo trivial: resolvió durable orchestration, routing, manifests, UI, work management y varios problemas reales de operación. La solución muestra buenas intuiciones y una inversión considerable.

Sin embargo, al implementar el dominio completo por cuenta propia, terminó distribuyendo la semántica de Agent Rooms entre tres repositorios y dos catálogos de agentes. Los defectos más serios —scope incompatible, memoria no tenant-scoped, autoría suplantable, eventos best-effort y falta de approvals en el punto de efecto— son precisamente invariantes que conviene centralizar.

AgentPlat aportaría más valor como **núcleo de dominio y gobernanza** que como reemplazo total de infraestructura. La mejor ruta es conservar los componentes TSS valiosos —BFF, Temporal, UI, secret resolver, adapters de negocio— y reemplazar progresivamente los contratos duplicados por AgentPlat Agent Room, Runtime, Tools, Memory, Audit, Handoff y, sólo cuando corresponda, Collective Runtime e Inference Control.

## Referencias locales principales

### TSS

- `tss-svc-agent-rooms/README.md`
- `tss-svc-agent-rooms/src/runtime/workflows/room.workflow.ts`
- `tss-svc-agent-rooms/src/runtime/workflows/agent-seat.workflow.ts`
- `tss-svc-agent-rooms/src/runtime/api/rooms.routes.ts`
- `tss-svc-agent-rooms/src/runtime/api/conversations.routes.ts`
- `tss-svc-agent-rooms/src/runtime/db.ts`
- `tss-svc-agent-rooms/src/runtime/activities/memory-store.ts`
- `tss-svc-agent-rooms/src/agents/kit/memory-tools.ts`
- `tss-svc-agent-rooms/src/registry/schema.ts`
- `tss-svc-agents/README.md`
- `tss-svc-agents/openapi.yaml`
- `tss-svc-agents/internal/domain/entities/agent.go`
- `tss-svc-agents/internal/domain/entities/operational_agent.go`
- `tss-svc-agents/internal/application/usecases/agent_chat_usecase.go`
- `template-project/apps/backoffice-bff/src/routes/v1/agent-rooms.routes.ts`
- `template-project/apps/backoffice-bff/src/routes/v1/projects-context-sync.ts`
- `template-project/apps/backoffice/src/services/agent-rooms.service.ts`
- `template-project/apps/backoffice/src/components/projects/workspace/MasterRoomChatPanel.tsx`

### AgentPlat

- `docs/agent-rooms.md`
- `docs/specification/agentplat-spec-v1.md`
- `docs/specification/collaboration-protocol-v1.md`
- `docs/specification/handoff-v1.md`
- `docs/compatibility/agentplat-compatible.md`
- `packages/rooms/README.md`
- `packages/rooms-postgres/README.md`
- `packages/rooms-api/README.md`
- `packages/runtime/README.md`
- `packages/sessions/README.md`
- `packages/tools/README.md`
- `packages/memory/README.md`
- `packages/audit/README.md`
