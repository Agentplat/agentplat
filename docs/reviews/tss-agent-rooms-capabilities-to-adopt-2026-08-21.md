# Capacidades de `tss-svc-agent-rooms` que conviene incorporar a AgentPlat Agent Room

**Fecha:** 2026-08-21  
**Fuente analizada:** `tss-svc-agent-rooms` en `694dd87c613e`  
**AgentPlat comparado:** `dfa79b1566da`

## Respuesta corta

La versión actual de AgentPlat Agent Room tiene un dominio más sólido que TSS para tenancy, participantes, lifecycle, tareas, artefactos versionados, approvals, policies, memoria y persistencia transaccional. Sin embargo, `tss-svc-agent-rooms` tiene una capa de **colaboración viva** que AgentPlat Agent Room todavía no ofrece de forma integrada.

Lo más valioso para llevar a AgentPlat no es su modelo de datos ni su uso de Temporal. Son estas capacidades:

1. Room reactiva que recibe mensajes y coordina trabajo en segundo plano.
2. Routing híbrido: referencias deterministas, router LLM y participante predeterminado.
3. Worker session interrumpible con steering humano durante la ejecución.
4. Delegación agente-a-agente acotada y retorno automático al coordinator.
5. Supervisión de runs con recovery y mensajes de fallo comprensibles.
6. Registro versionado de definiciones de agente fijado por ejecución.
7. Proyección incremental de Room para UIs en tiempo real.
8. Planes mixtos agente/humano con replanning al completar trabajo humano.
9. Adaptadores provider-neutral de work management con outbox y reconciliación.
10. Knowledge bundles declarativos asociados a una revisión de agente.

Estas capacidades deberían entrar como extensiones opcionales alrededor de `@agentplat/rooms`, no mezclarse indiscriminadamente con `RoomService`.

## El vacío concreto en AgentPlat Agent Room

AgentPlat ya puede:

- crear una Room y administrar su lifecycle;
- agregar participantes humanos y agentes con authority, permissions y boundaries;
- registrar mensajes;
- crear tareas con dependencias, criterios de aceptación y nivel de acción;
- ejecutar una tarea asignada a un agente mediante Runtime;
- aplicar policy y approvals antes de ejecutar;
- producir artefactos versionados con provenance;
- construir contexto acotado y persistir su snapshot;
- guardar memoria tenant-scoped;
- confirmar estado y eventos en una misma transacción.

Pero el flujo debe ser dirigido explícitamente por la aplicación: registrar un mensaje no despierta una coordinación de Room, no decide qué participante debe responder, no mantiene un inbox durable, no permite steering de un run activo y no encadena delegaciones conversacionales.

En términos simples:

```text
AgentPlat actual:
  aplicación → sendMessage → createTask → runTask → revisar resultado

TSS:
  humano → mensaje → Room decide → Worker ejecuta → delega/termina/falla
                    ↑                         │
                    └──── steering humano ───┘
```

La oportunidad es agregar esa segunda semántica sin debilitar las garantías del primer modelo.

## Matriz de transferencia

| Capacidad TSS | ¿Existe hoy en AgentPlat Agent Room? | Recomendación | Prioridad |
| --- | --- | --- | --- |
| Inbox durable y coordinación reactiva | No integrada | Adoptar como runtime opcional | P0 |
| Routing por `@mentions` | No | Adoptar como estrategia determinista | P0 |
| Router LLM con fallback | No | Adoptar detrás de un port gobernado | P0 |
| Worker session interrumpible | Parcialmente en Runtime portátil, no en Room | Adaptar | P0 |
| Steering humano durante un run | No en `RoomService.runTask` | Adoptar con eventos y authority checks | P0 |
| Delegación agente-a-agente con hop cap | No en Room | Adoptar como protocolo tipado | P0 |
| Coordination agent y retorno de resultados | No | Adoptar como política de coordinación | P1 |
| Supervisión y recuperación de fallos | Parcial | Adaptar al lifecycle de `RoomRun` | P0 |
| Manifest registry versionado | Participant runtime embebido, sin registry de revisiones | Adoptar como boundary separado | P1 |
| Conjunto de participantes habilitados por Room | Participants existen | Extender con estado/capability de participación | P1 |
| Vista incremental con cursor | `listEvents`, sin proyección live completa | Adoptar | P1 |
| Status `busy/working` | Inferible, no materializado | Adoptar como read model, no como aggregate truth | P1 |
| Plan mixto agente/humano | Tareas y dependencias existen, no planner humano integrado | Adaptar | P1 |
| Replanning tras tarea humana | No integrado | Adoptar como trigger durable | P1 |
| Work-management adapters | No | Adoptar en paquete opcional | P1 |
| Knowledge bundles OKF | No como revisión de agente | Adoptar de forma provider-neutral | P2 |
| Herramienta estándar de emitir artefacto | Room crea artefactos, Runtime no tiene bridge estándar | Adoptar bridge | P1 |
| Memoria como tools `save/search` | Memoria existe en dominio | Adoptar sólo el bridge de tools | P2 |
| Conversación directa 1:1 | Sessions cubre parte del caso | No portar al core de Rooms | P3 |
| Servidor de imágenes local | No | Mantener como adapter de aplicación | P3 |
| Temporal workflows | No | Mantener como adapter, no volverlo requisito | — |

## Capacidades recomendadas en detalle

### 1. Agent Room Coordinator

#### Qué aporta TSS

Cada Room es una entidad activa con:

- inbox de mensajes;
- cola de routing jobs;
- run actualmente activo;
- continuidad entre mensajes;
- aceptación de mensajes mientras un worker ejecuta;
- rollover mediante `continueAsNew`.

#### Qué falta en AgentPlat

`RoomService` persiste comandos de dominio, pero no posee un loop reactivo que convierta eventos entrantes en trabajo coordinado. Esto obliga a cada aplicación a inventar su propio dispatcher.

#### Cómo incorporarlo

Crear un paquete opcional, por ejemplo `@agentplat/rooms-coordination`, con un contrato similar a:

```ts
interface RoomCoordinator {
  accept(command: RoomCoordinationCommand): Promise<CoordinationReceipt>;
  getStatus(tenantId: string, roomId: string): Promise<RoomCoordinationStatus>;
  steer(input: RoomRunSteer): Promise<SteerReceipt>;
}
```

El coordinator debe consumir y producir comandos mediante `RoomService`; no debe escribir tablas de Room por fuera del repository.

Debería poder ejecutarse sobre:

- memoria/local para tests;
- un worker con PostgreSQL/outbox;
- Temporal mediante un adapter;
- otro workflow engine sin cambiar el dominio.

#### Regla importante

El coordinator no debe convertirse en una segunda fuente de verdad. `RoomRun`, mensajes, tareas, handoffs y eventos permanecen en AgentPlat Agent Room.

### 2. Routing híbrido y gobernado

#### Qué aporta TSS

TSS usa un orden razonable:

1. una mención explícita decide de forma determinista;
2. si no hay mención, un router LLM elige entre agentes routable;
3. si no hay elección, responde el fallback/generalista;
4. agentes deshabilitados producen un status visible;
5. self-mentions se descartan.

Esto combina control humano, bajo costo y flexibilidad.

#### Cómo mejorarlo al llevarlo

Definir `RoomRoutingStrategy` como port y retornar una decisión tipada:

```ts
type RoomRoutingDecision =
  | { kind: 'dispatch'; participantIds: string[]; basis: 'mention' | 'router' }
  | { kind: 'wait_for_human'; reason: string }
  | { kind: 'complete'; reason: string }
  | { kind: 'deny'; policyDecisionId: string; reason: string };
```

La decisión debería incluir:

- revisión del conjunto de participantes elegibles;
- IDs de mensajes fuente;
- policy/authority decision;
- versión del router y del catálogo;
- correlation/run ID;
- rationale categórico o digest, no razonamiento oculto.

El parser de menciones y las reglas self-loop de TSS pueden portarse casi directamente como una estrategia determinista y bien testeada.

### 3. Worker session como unidad de ejecución conversacional

#### Qué aporta TSS

La worker session fija una definición de agente, arma transcript, ejecuta iteraciones de modelo/tools, recibe steering, acumula artefactos y termina con un resultado estructurado.

#### Qué debería adoptar AgentPlat

AgentPlat necesita una abstracción de worker session encima de `AgentRuntime`/Portable Agent Runtime y ligada a una Room:

```ts
interface RoomWorkerSession {
  roomId: string;
  runId: string;
  participantId: string;
  agentRevisionId: string;
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'canceled';
  iteration: number;
  maxIterations: number;
}
```

La revisión exacta de agente, tools, role, policy y contexto debe fijarse al crear la worker session. Los cambios posteriores no deben alterar silenciosamente una ejecución en curso.

No conviene portar el marcador textual `DONE:` como contrato canónico. Debe existir un resultado estructurado (`complete`, `delegate`, `ask_human`, `failed`), con un adapter de compatibilidad para modelos que sólo produzcan texto.

### 4. Steering humano durante la ejecución

#### Qué aporta TSS

Mientras el worker ejecuta, los mensajes humanos se registran y se reenvían como señales entre iteraciones. La Room sigue receptiva.

#### Por qué es valioso

Ésta es una diferencia importante entre “ejecutar una tarea” y colaborar en una Room. Permite corregir dirección sin cancelar y reiniciar todo el run.

#### Diseño recomendado

Agregar un comando `steerRoomRun` que:

- exige que el actor sea participante humano autorizado;
- persiste el mensaje antes de intentar entregarlo;
- liga el steer a `roomId`, `runId`, `participantId` y revisión esperada;
- emite `run_steer_requested`, `run_steer_delivered` o `run_steer_rejected`;
- se aplica únicamente en checkpoints declarados por el adapter;
- no amplía authority, tools ni policy del run;
- sobrevive a restart y puede reconciliar entrega.

Portable Agent Runtime ya ofrece pause/checkpoint/control primitives que pueden servir de base; falta el bridge explícito con Agent Room.

### 5. Delegación acotada y retorno al coordination agent

#### Qué aporta TSS

- Una respuesta de especialista vuelve a entrar en routing.
- El especialista puede mencionar a otro especialista.
- Si no delega, el resultado vuelve al coordination agent.
- Hay límite de saltos y bloqueo de self-delegation.
- El coordination agent integra resultados o formula una pregunta al humano.

#### Cómo incorporarlo correctamente

Esto debería mapearse a AgentPlat Handoff y tareas, no depender de texto libre:

```text
mensaje humano
  → routing decision
  → task/run del especialista
  → handoff result
  → coordination agent task/run
  → complete | next handoff | wait_for_human
```

Cada handoff debe contener sender, receiver, source task/run, contexto acotado, artifact refs, límite de autoridad, hop count y estado de aceptación.

La lógica de TSS es una excelente referencia de comportamiento, pero AgentPlat puede darle procedencia y recovery más fuertes.

### 6. Run supervisor y recovery visible

#### Qué aporta TSS

El supervisor observa simultáneamente el resultado del child workflow y mensajes nuevos. Convierte cadenas de errores en una descripción acotada, registra el fallo y entrega un failure report al coordination agent. Si falla el propio coordination agent, genera una respuesta humana de último recurso.

#### Qué conviene llevar

- timeouts por run;
- estado explícito `working`;
- fallo de especialista como evento y no como silencio;
- política de retry/reassignment/fallback;
- respuesta final comprensible;
- capacidad de seguir aceptando mensajes mientras el worker termina.

AgentPlat ya tiene estados y fencing de runs. Falta una política Room-level que decida qué hacer después de `task_run_failed`.

Debería agregarse un `RoomRunRecoveryPolicy` con decisiones tipadas como `retry`, `reassign`, `return_to_coordinator`, `wait_for_human` o `fail_room_work`, preservando el predecessor run.

### 7. Registro versionado de agentes

#### Qué aporta TSS

Los agentes son datos declarativos con:

- nombre y versión semver;
- instrucciones;
- runtime local o gateway;
- routing flags;
- tools separadas en contract/execution;
- memoria y artefactos habilitados;
- metadata de presentación;
- límites;
- knowledge bundle;
- lifecycle `draft/published/deprecated`.

La resolución por activity fija la versión en el historial del run.

#### Qué falta en AgentPlat Agent Room

`Participant.runtime` contiene configuración inline, pero no referencia obligatoriamente una revisión inmutable de definición. Esto es suficiente para quickstarts, no para un catálogo administrado y reproducible.

#### Propuesta

Introducir un boundary de `AgentDefinitionRegistry` reusable por Rooms y Runtime:

```ts
interface AgentDefinitionRevision {
  id: string;
  agentId: string;
  version: string;
  status: 'draft' | 'published' | 'deprecated';
  capabilities: string[];
  toolIds: string[];
  instructionRef: string;
  knowledgeRefs: string[];
  runtimeProfileRef: string;
  digest: string;
}
```

La Room participant membership debería fijar `agentId` y una policy de selección; cada run debe fijar `revisionId` y digest exactos.

El filesystem registry de TSS puede convertirse en un adapter de desarrollo. No debería ser la única implementación ni guardar lifecycle mutable en archivos laterales para producción.

### 8. Participantes habilitados y disponibilidad por Room

#### Qué aporta TSS

Una Room puede restringir qué agentes están habilitados. Drafts sólo se habilitan explícitamente; deprecated agents continúan donde ya estaban pero no entran en Rooms nuevas.

#### Cómo mapearlo

AgentPlat ya tiene participants, permissions y boundaries. Conviene agregar a la relación Room-participant:

- membership status: `invited | enabled | suspended | left`;
- routing eligibility;
- joined revision/policy;
- capability constraints dentro de la Room;
- `canReceiveHandoff` y carga/capacidad opcional.

Esto evita un campo paralelo `enabledAgents` y reutiliza la semántica de participants.

### 9. Read model incremental para interfaces vivas

#### Qué aporta TSS

`GET /view?after=cursor` combina:

- estado compacto de coordinación;
- eventos posteriores al cursor;
- tareas humanas;
- cursor de continuación.

El payload permanece acotado aun en Rooms largas.

#### Qué conviene adoptar

Agregar un read model separado del aggregate completo:

```ts
interface RoomLiveView {
  roomId: string;
  revision: number;
  coordination: {
    status: 'idle' | 'routing' | 'working' | 'waiting_for_human' | 'paused';
    activeRunIds: string[];
    activeParticipantIds: string[];
  };
  events: DomainEvent[];
  nextCursor: string;
  hasMore: boolean;
}
```

Debe incluir paginación real: TSS limita a 200 pero el cliente avanza al último evento recibido sin un `hasMore` explícito. AgentPlat puede ofrecer REST incremental y SSE sobre el mismo envelope versionado de `@agentplat/streaming`.

El estado `busy/working` debe ser una proyección derivada de runs/tasks, no una segunda verdad mutable.

### 10. Planes mixtos y human tasks

#### Qué aporta TSS

El planner produce pasos `agent` o `human`, dependencias, blocking, expected output y owner sugerido. Los pasos humanos se materializan en tareas durables y, al completarse, sus resultados vuelven a la Room para replanificar.

#### Qué puede reutilizar AgentPlat

`RoomTask` ya soporta dependencias y criterios, pero actualmente sólo los agentes son ejecutores. Conviene separar:

- **execution task:** trabajo ejecutado por un agente;
- **human contribution request:** input, decisión o acción requerida de una persona;
- **approval:** autorización/revisión formal, que no debe confundirse con trabajo humano genérico.

Propuesta de modelos:

```ts
type RoomWorkItem = AgentTask | HumanContributionRequest;

interface HumanContributionRequest {
  id: string;
  roomId: string;
  requestedBy: string;
  instruction: string;
  expectedOutput: string;
  dependencies: string[];
  blocking: boolean;
  assignedParticipantId?: string;
  status: 'requested' | 'in_progress' | 'completed' | 'canceled';
}
```

Completar un human contribution debe emitir un evento durable que el coordinator pueda transformar en `replan_requested`; el planner no debería reactivarse por polling implícito.

### 11. Work Management adapters

#### Qué aporta TSS

El núcleo usa IDs provider-neutral y adapta Asana. Tiene OAuth con PKCE/state, credenciales cifradas, context selection, un proyecto externo por Room/conexión, deliveries por tarea, leases, retries, estados, URLs y métricas.

#### Recomendación

Crear un paquete opcional como `@agentplat/work-management` con:

- `WorkManagementProvider`;
- `WorkContainerBinding` Room ↔ proyecto externo;
- `WorkItemDelivery` con estado e idempotency key;
- provider connection port, sin credenciales en el dominio;
- outbox worker y reconciliation;
- adapters separados, por ejemplo Asana/Todoist/Jira.

No conviene agregar OAuth o campos de Asana a `@agentplat/rooms`. Room sólo debe emitir la necesidad de sincronizar un work item.

### 12. Bridge estándar de artefactos

#### Qué aporta TSS

Un agente con `artifacts: true` recibe `emit_artifact`; los resultados vuelven desde el run y la UI puede abrir un canvas tipado.

#### Cómo mejorarlo en AgentPlat

Crear un tool bridge oficial que convierta una tool result en:

1. `Artifact` estable;
2. `ArtifactVersion` inmutable;
3. provenance ligada a run, messages, artifacts y memory del context snapshot;
4. estado `draft` o `pending_approval` según policy.

Esto evitaría que cada Runtime adapter invente cómo transformar output en artefactos de Room.

### 13. Knowledge bundles declarativos

#### Qué aporta TSS

Una definición de agente puede incluir documentos OKF tipados, limitados en cantidad/tamaño y expuestos mediante tools de list/read.

#### Recomendación

Adoptar el concepto, no necesariamente el formato embebido:

- knowledge refs content-addressed;
- versión y digest ligados a la revisión del agente;
- clasificación, tenant, provenance y policy de lectura;
- límite de tamaño/contexto;
- tools estándar `knowledge.list` y `knowledge.read`;
- el contenido sólo entra al contexto si es solicitado y permitido.

Embebido en JSON puede mantenerse para ejemplos; producción debería usar un store de conocimiento.

## Qué no deberíamos portar

### 1. Temporal dentro del dominio `@agentplat/rooms`

Temporal es una implementación útil de `RoomCoordinator`, pero convertirlo en dependencia del core rompería la portabilidad actual. Debe existir un paquete adapter separado.

### 2. PostgreSQL como log best-effort

AgentPlat ya hace mejor esto: la mutación y su evento durable se confirman juntos. No debe adoptarse el patrón TSS de continuar cuando falla el event append.

### 3. Memoria JSONL y scopes sin tenant

Sólo vale la UX de exponer memoria como tools. El store y las claves actuales de TSS no son trasladables.

### 4. Roles y autores suministrados por el cliente

AgentPlat debe derivar actor, participant y authority del boundary autenticado. No debe copiarse el body `{ role, author }` abierto.

### 5. Artefactos serializados dentro de eventos

AgentPlat ya posee artefactos/versiones/provenance como entidades. La tool TSS debe mapearse a ese modelo, no reemplazarlo.

### 6. `DONE:` y `@mention` como único protocolo entre agentes

Pueden permanecer como interfaz de compatibilidad para modelos, pero la coordinación durable debe almacenar resultados y handoffs tipados.

### 7. Hard delete de Rooms

AgentPlat debe conservar complete/archive y eventos append-only. Un reset conversacional puede crear una nueva Room o branch/subroom con vínculo al origen.

### 8. Status lines con errores de infraestructura completos

Los fallos deben ser visibles, pero redacted y clasificados. Detalles sensibles quedan en audit/observability con acceso adecuado.

## Propuesta de paquetes y ownership

```text
@agentplat/rooms
  lifecycle, participants, messages, tasks, human contributions,
  artifacts, approvals, policies, memory, runs, events

@agentplat/rooms-coordination              (nuevo, opcional)
  inbox, routing, coordination agent, worker sessions, delegation, steering, recovery

@agentplat/rooms-coordination-temporal     (nuevo adapter)
  workflows, signals, continue-as-new, activity bindings

@agentplat/agent-registry                  (nuevo o extensión de runtime)
  agent definitions, immutable revisions, lifecycle, digests

@agentplat/work-management                 (nuevo, opcional)
  provider-neutral external work synchronization

@agentplat/rooms-api
  commands + live view cursor + SSE

@agentplat/runtime / inference-control / tools
  model/tool execution, steering checkpoints, grants and effect fencing
```

Esta separación evita que una buena feature de TSS vuelva monolítico al dominio de Agent Room.

## Orden de implementación recomendado

### Incremento 1 — Routing determinista y live view

- Portar parser de menciones y reglas de arbiter.
- Añadir `RoomRoutingStrategy` y decisiones tipadas.
- Añadir read model incremental con cursor/`hasMore`.
- Probar aislamiento tenant, participantes elegibles y replay determinista.

**Valor:** UI colaborativa inmediata con bajo riesgo; no requiere Temporal.

### Incremento 2 — Worker session y steering

- Crear `RoomWorkerSession` fijando agent revision, context snapshot y policy revision.
- Bridge con Portable Agent Runtime.
- Persistir y entregar steers en checkpoints.
- Agregar supervisor y recovery policy.

**Valor:** colaboración humana durante ejecuciones largas.

### Incremento 3 — Handoffs y coordination agent

- Reemplazar delegación textual interna por AgentPlat Handoff.
- Implementar hop cap, self-delegation guard y retorno al coordination agent.
- Mantener adapters `@mention`/`DONE:` sólo en la frontera del modelo.

**Valor:** multiagente continuo con ownership y provenance.

### Incremento 4 — Agent registry versionado

- Extraer el modelo de manifiestos generalizable.
- Agregar revisiones inmutables, digest y lifecycle.
- Implementar filesystem adapter para desarrollo.
- Fijar revision ID en cada run/worker session/handoff.

**Valor:** reproducibilidad y administración real de agentes.

### Incremento 5 — Human contributions y work management

- Diferenciar contribución humana de approval.
- Agregar replanning trigger durable.
- Crear provider-neutral work-management boundary y Asana adapter.

**Valor:** colaboración fuera de la UI sin contaminar el core con un proveedor.

### Incremento 6 — Knowledge y artifact tool bridges

- Agregar tools gobernadas para knowledge, memory y artifact emission.
- Ligar resultados a context snapshot y provenance.

**Valor:** mejor ergonomía para construir agentes sobre Agent Room.

## Criterios de aceptación mínimos

Antes de declarar incorporada cada capacidad:

- todas las claves y consultas deben incluir tenant;
- cada comando debe ser idempotente o rechazar ausencia de operation ID si tiene efectos;
- state y domain event deben confirmarse en una transacción;
- la revisión del agente y de la policy debe quedar fijada en el run;
- una delegación no debe ampliar authority;
- steering debe preservar actor, source message y run revision;
- el coordinator debe recuperarse después de restart sin duplicar efectos;
- el cursor live debe soportar páginas completas, `hasMore` y replay;
- un adapter caído debe producir estado reconciliable, no pérdida silenciosa;
- los resultados deben clasificarse como comportamiento de software, no como evidencia de escala o seguridad de producción.

## Conclusión

`tss-svc-agent-rooms` contiene una capa que complementa genuinamente a AgentPlat: convierte una Room persistente en un espacio **activo**, capaz de escuchar, enrutar, ejecutar, aceptar steering, delegar, recuperar y volver al humano.

AgentPlat no debería copiar su aggregate, persistencia o límites de seguridad. Debería extraer sus mejores patrones operativos y reconstruirlos encima de las garantías actuales de Room:

```text
Lo que AgentPlat ya hace mejor
  tenancy + lifecycle + participants + policy + approvals
  + artifacts/versioning + memory + transactional events

Lo que vale traer de TSS
  reactive coordination + routing + worker sessions + steering
  + coordination agent/handoffs + recovery + live view
  + human work + external work adapters + agent revisions
```

El resultado sería una versión de AgentPlat Agent Room mucho más cercana a la experiencia prometida por el concepto: colaboración persistente y gobernada, no sólo un aggregate durable con operaciones explícitas.

## Referencias locales principales

### TSS

- `tss-svc-agent-rooms/src/runtime/workflows/room.workflow.ts`
- `tss-svc-agent-rooms/src/runtime/workflows/agent-seat.workflow.ts`
- `tss-svc-agent-rooms/src/runtime/workflows/orchestrator-seat.workflow.ts`
- `tss-svc-agent-rooms/src/runtime/workflows/seat-supervisor.ts`
- `tss-svc-agent-rooms/src/runtime/room/arbiter.ts`
- `tss-svc-agent-rooms/src/runtime/room/mentions.ts`
- `tss-svc-agent-rooms/src/runtime/room/policies.ts`
- `tss-svc-agent-rooms/src/registry/schema.ts`
- `tss-svc-agent-rooms/src/registry/admin.ts`
- `tss-svc-agent-rooms/src/runtime/api/rooms.routes.ts`
- `tss-svc-agent-rooms/src/runtime/work-management/`
- `tss-svc-agent-rooms/src/agents/kit/`

### AgentPlat

- `packages/rooms/src/models.ts`
- `packages/rooms/src/service.ts`
- `packages/rooms/src/context.ts`
- `packages/rooms/src/repository.ts`
- `packages/rooms-postgres/src/repository.ts`
- `packages/rooms-api/src/index.ts`
- `packages/runtime/src/`
- `packages/sessions/src/index.ts`
- `packages/collective-runtime/`
- `docs/specification/handoff-v1.md`
