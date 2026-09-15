# Protocolo v2: estudio descriptivo de 12 intentos

Se conserva el benchmark oficial y se compara únicamente la coordinación de dos equipos con el mismo motor.
La selección y el orden se fijan antes de observar resultados de modelos.
La calidad del resultado, el consumo y la validez del protocolo se reportan por separado.
Un incidente deja evidencia y detiene la campaña; no se reemplaza una corrida selectivamente.

## 1. Enmienda y selección

Esta versión reemplaza el diseño de 36 corridas A/B/C del commit `814965ffb79e1405730b212aeb37079a1acacf94`: elimina el brazo individual y reduce a dos tareas × dos sistemas × tres repeticiones. El documento anterior permanece en el historial Git. No existían resultados de ese diseño.

| Tarea oficial | Motivación previa | Límite agente | Recursos compartidos |
|---|---|---:|---|
| financial-document-processor | Archivos JPG/PDF, clasificación y CSV verificable | 1200 s | 1 CPU, 4096 MiB |
| multi-source-data-merger | JSON/CSV/Parquet, conflictos y salida verificable | 900 s | 1 CPU, 2048 MiB |

Commit Terminal-Bench 2.0: `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`. `benchmark.lock.json` contiene los hashes SHA-256 completos, blobs Git, modos y tamaños, más digests de imágenes Linux AMD64. Se comprueba cada archivo al preparar el cache. No se copian recetas, soluciones o datos de otras evaluaciones a los prompts.

`schedule.json` publica seis bloques tarea–repetición. `random.Random(20260910)` mezcla los bloques; la posición inicial alterna AgentPlat/Agent Teams, tres veces cada uno globalmente. Un trial a la vez, un intento por slot, reintentos Harbor en cero. Selección intencional de dos tareas de procesamiento de datos: no representa todo Terminal-Bench.

## 2. Tratamientos y constantes

- Harbor 0.20.0; Claude Code 2.1.236; Node del puente 24.18.0; Python host 3.13.
- API Anthropic estándar, `claude-sonnet-4-6`, esfuerzo `high`, sin fallback, sin tier rápido o regional con recargo. Se verifica cada respuesta efectiva.
- Un coordinador y dos trabajadores `worker-1`/`worker-2`, sin subdelegación.
- Agent Teams: compañeros nativos dentro del mismo proceso/contenedor. Crear agentes ordinarios no acredita este tratamiento.
- AgentPlat: `RoomService`, `InMemoryRoomRepository`, `DefaultAgentRuntime` y un `AgentProvider` hacia sesiones Claude Code persistentes. El coordinador decide la división; el puente no usa otro modelo.
- PTY interactiva en ambos brazos. No se acredita Agent Teams con `--print`.
- Herramientas de tarea nativas de Claude Code, con WebSearch deshabilitado en ambos brazos: su facturación adicional no entra en el contrato de tokens. En AgentPlat se deshabilitan las herramientas de coordinación nativas y se habilitan operaciones MCP de tareas, mensajes, estado, reporte y finalización.
- Hogar/configuración/sesión nuevos por trial; hogares separados por trabajador AgentPlat. No entran instrucciones, plugins o hooks de desarrollo, incluido Ponytail.
- Los trabajadores reciben la instrucción original; la asignación la decide el coordinador. En Agent Teams el coordinador transmite ese contexto usando las herramientas nativas: el piloto debe comprobarlo.
- Los cuerpos de mensajes se entregan solo al destinatario. El estado de tareas y sus artefactos de reporte son compartidos. `BoundedContextBuilder` tiene límites cero para transcript, artifacts y memory; el proveedor entrega solamente la asignación, evitando añadir contexto compartido implícito.
- Caché nativa de Claude Code sin calentamiento previo ni caché propia; se registran lecturas y escrituras de 5 minutos/1 hora. No se garantiza caché fría entre trials a nivel proveedor. Límite común de salida por llamada: 8192 tokens, parte explícita del tratamiento.
- El reloj comienza al entregar la instrucción (incluye coordinación inicial) y termina al detener el equipo. El coordinador llama `finish` y termina su turno. Se detienen procesos antes del verificador.

Las diferencias de contextos, prompts y herramientas son parte observable del tratamiento. No hay equivalencia garantizada entre el contexto nativo interno de Agent Teams y el contexto de Agent Rooms.

## 3. Contabilidad y límites

El gateway común mantiene la clave real fuera del contenedor. Antes de cada llamada reserva el costo máximo de la ventana completa de Sonnet 4.6 (1.000.000 tokens al precio mayor de caché, USD 6/millón), más la salida máxima solicitada (hasta 8192 tokens a USD 15/millón). [Count Tokens es aproximado](https://platform.claude.com/docs/en/build-with-claude/token-counting), por eso se evita usarlo como cota dura. Una llamada con máximo 8192 requiere USD 6,12288 disponibles para reserva; tres concurrentes requieren USD 18,36864, además del consumo ya liquidado. Son reservas temporales, no gasto previsto ni autorización predeterminada.

El ledger usa enteros nano-USD y exclusión mutua. Luego liquida el consumo real y libera el resto; una respuesta parcial conserva su reserva y cierra la admisión. Esta política conservadora puede detener un equipo con saldo positivo y se aplica por igual a ambos sistemas. Los límites y precios oficiales fijados son supuestos de la garantía; una discrepancia del proveedor invalida la corrida. Las consultas Count Tokens que realice Claude Code se transportan sin inferencia y no cuentan como pasos del modelo.

Los JSON/SSE originales se conservan localmente. Se reúnen fragmentos por ID de respuesta, herramientas por ID de invocación, sesiones por identidad. Los tokens de entrada, caché leída/escrita y salida se mantienen separados. El costo suma fallos y coordinación. Ausente significa desconocido; ningún conteo sale de caracteres.

Los pasos del modelo son IDs de respuestas únicos. `ATIF.total_steps` depende del documento: el ATIF conversacional de Harbor incluye mensajes/observaciones; el operativo depurado contiene un paso por respuesta observada. No se usan las estimaciones de costo del conversor de Harbor para la tabla reconciliada.

`reward` es el valor original del verificador. `protocol_ok` requiere trazas completas, tres participantes, versión/modelo/esfuerzo, finalización y controles. `success` requiere reward 1 y protocolo válido. Los fallos de instalación/verificador mantienen su reward original y el incidente correspondiente.

El protocolo no es una defensa contra un agente hostil con acceso root al entorno. La clave del proveedor permanece en el host, pero los hooks y registros del contenedor requieren inspección en el piloto. CPU/RAM se comparten mediante el entorno Harbor; Docker no demuestra por sí solo una cuota de disco efectiva. No aumentar recursos para salvar la comparación. Si el control de recursos, la PTY, los compañeros o la reconciliación no funcionan, detener y registrar el bloqueo.

## 4. Análisis y evidencia

Mostrar todos los intentos por tarea, incluyendo consumo de fallos y timeouts. Costo por éxito es indefinido si no hay éxitos o falta costo de algún intento. Comparar tiempo pareado solamente cuando ambos equipos tienen éxito, acompañándolo con la distribución completa. No probar superioridad general, equivalencia ni mecanismos causales con seis pares.

Los cuatro controles locales de esta contribución no son corridas del estudio ni resultados de modelos. Fallaron parcialmente por descargas APT con hashes inconsistentes. La campaña exige controles válidos y dos pilotos reales sobre `log-summary-date-ranges`, fuera de las tareas seleccionadas. Estos pilotos y cualquier publicación son posteriores a este PR.
