# Ponytail y revisión de simplificación

## Instalación verificada

Ponytail **4.10.0**, marketplace commit `e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156`. Comandos ejecutados:

```sh
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
```

Se revisaron sus hooks y se confiaron individualmente desde `/hooks`: `SessionStart`, `UserPromptSubmit`, `SubagentStart`. La pantalla mostró activos los tres hooks del plugin. Un hook modificado ajeno a Ponytail se dejó sin aprobar. No se envió ningún prompt de modelo desde esa sesión de CLI.

Backup previo local: `~/.codex/backups/agentplat-ponytail-20260914-200854/`. Contiene `manifest.json`, `rollback.md`, configuración Codex, hooks, configuración Git del repo y configuración de cuenta gh. Nunca se incorpora al repo. Para revertir la instalación: `codex plugin remove ponytail@ponytail`, `codex plugin marketplace remove ponytail`; restaurar los archivos según ese manifiesto preservando modificaciones posteriores. Los backups contienen configuración privada y mantienen permisos restrictivos.

Se aplicó [ponytail full](https://github.com/DietrichGebert/ponytail/blob/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156/skills/ponytail/SKILL.md) antes de implementar: buscar existentes → biblioteca estándar → capacidades nativas → dependencias instaladas → mínimo código propio. Es una revisión de desarrollo; sus instrucciones y hooks no entran en el benchmark.

## Necesidad → reutilización → diferencia mínima

| Necesidad | Componente reutilizado | Código propio necesario | Verificación |
|---|---|---|---|
| Jobs, trials y timeouts | Harbor Job.create / JobConfig | Orden de seis pares y puertas del estudio | Configuración y controles locales |
| Instalar Claude | Harbor ClaudeCode.setup/install | Versión fijada y runtime común | Compilación/importación; instalación completa pendiente por APT |
| Tareas y estados | RoomService / DefaultAgentRuntime / InMemoryRoomRepository | AgentProvider para sesiones PTY, destinatarios | Un contrato integrado de Rooms |
| MCP | SDK y Zod, mismas versiones que @agentplat/mcp-runtime | Cinco operaciones pequeñas | TypeScript y handshake SDK |
| Trazas | Conversor ClaudeCode de Harbor + Pydantic ATIF | Reconciliar IDs y consumo completo; depurar contenido | Contratos de duplicados y ausencias |
| Análisis | pandas, matplotlib, nbclient/nbconvert | Tres notebooks descriptivos | Ejecución vacía e importación independiente |
| ZIP y hashes | zipfile, tempfile, hashlib | Allowlist de datos operativos y manifiesto | Roundtrip y rechazo de ruta insegura |
| Presupuesto | httpx / stdlib ThreadingHTTPServer | Ledger común con reservas atómicas | Contrato concurrente y consumo desconocido |

`--max-budget-usd` de Claude Code se limita a `--print` y no demuestra un presupuesto agregado entre procesos. El runtime MCP general de AgentPlat expone más acciones, exige confirmaciones y no transporta destinatarios/asignaciones específicas de este tratamiento: se reutiliza su SDK, manteniendo RoomService como autoridad.

## Revisión del diff con ponytail-review

Aplicado el [alcance de ponytail-review](https://github.com/DietrichGebert/ponytail/blob/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156/skills/ponytail-review/SKILL.md): complejidad solamente. La revisión de corrección/seguridad se realizó por separado.

- **Aceptado:** eliminar el servidor MCP escrito a mano y reemplazarlo por el SDK existente en el repo: El adaptador SDK tiene 22 líneas; el diff final registra las líneas reales de la contribución, sin atribuir ahorro a cambios no medidos. Dos dependencias directas del experimento, versiones ya usadas por AgentPlat; ninguna dependencia nueva en la raíz.
- **Aceptado:** eliminar el conteo previo propio para reservar gasto: Count Tokens es aproximado. Una cota por ventana máxima reduce llamadas y mantiene reservas concurrentes conservadoras.
- **Aceptado:** un solo adaptador con brazo explícito; reutilizar instalación y conversión de Harbor; exportar con stdlib; omitir un nuevo servicio, base de datos, dashboard o framework de tests.
- **Rechazado:** copiar wrappers Cody/Mux completos; añaden comportamiento o dependencias fuera del tratamiento. Ver [references.md](references.md).
- **Rechazado:** borrar reservas concurrentes, comprobación de ausencias, cancelación o el control original: son requisitos del protocolo, no extensiones especulativas.

Las líneas finales y dependencias pueden verificarse en el diff del PR. No se afirma un porcentaje de ahorro ni una ventaja experimental derivada de usar Ponytail.

## Tamaño y cierre de revisión inicial (63d8fc3)

Diff frente a la rama de diseño: **+5902/-593 líneas**, incluidos documentación y locks. Medición del árbol final: 10 archivos Python/TypeScript de runtime, **1462 líneas**; tres archivos de pruebas, **224 líneas / 12 contratos**; dos lockfiles generados, **3329 líneas**. Ocho dependencias Python directas y dos dependencias Node directas, más tipos de desarrollo. No se cambian dependencias de la raíz.

Revisión final de complejidad: **Lean already. Ship.** No se proponen más recortes que comprometan los contratos aprobados. Esto se limita a complejidad; no habilita las corridas pagas.

La revisión local de corrección corrigió permisos `task.run`, reserva de trabajadores antes del await, identidad del coordinador antes de iniciar hooks, acceso a reportes desde el estado, cierre de llamadas en vuelo y confirmación de procesos detenidos. Se comprobaron por separado aislamiento, importación ZIP y evidencia faltante. La compatibilidad real con compañeros nativos queda sujeta al piloto indicado en `readiness.md`.

## Revisión correctiva del 14 de septiembre de 2026

- **Aceptado:** reemplazar el script de limpieza embebido en `agent.py` por una llamada al controlador; reutilizar una sola función de detención del árbol. Eliminar los archivos de PID/grupos que quedaron sin lectores.
- **Aceptado:** Linux `PR_SET_CHILD_SUBREAPER`, `ctypes` y procfs, sin dependencias nuevas. Un marcador de entorno no cubre descendientes lanzados con `env={}`; la prueba Linux conserva ese caso.
- **Aceptado:** extender los contratos existentes de identidad, entorno y datos ausentes; separar únicamente las tres comprobaciones Linux para ejecutarlas en la imagen oficial sin instalar Harbor ni paquetes extra.
- **Conservado:** presupuesto y PTY; no se adoptan los umbrales arbitrarios ni el cambio de tareas sugeridos por el provocador. El protocolo explicita la decisión que informa esta etapa descriptiva.

Las comprobaciones y límites de la revisión de corrección están en `readiness.md`. La revisión Ponytail del diff correctivo no encuentra otra capa que eliminar: no agrega servicios, dependencias, configuración de desarrollo ni cambios a APIs de AgentPlat. La contribución sigue como borrador hasta la validación técnica pendiente.

Medición frente a `63d8fc3`: los tres archivos de runtime modificados suman **+106/-72 líneas (neto +34)**; cero archivos de runtime y dependencias nuevos. Las pruebas Python pasan de 11 a 13 contratos (10 host y 3 Linux), reutilizando los existentes y sin otro framework.
