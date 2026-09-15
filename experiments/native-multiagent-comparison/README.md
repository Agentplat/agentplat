# Agent Rooms vs native Agent Teams on Terminal-Bench 2.0

Integración experimental dentro de AgentPlat: tareas oficiales, dos equipos de Claude Code y medición reconciliable.
El experimento propone 12 intentos y conserva todos los fallos.
La entrega incluye comandos y un notebook con tres secciones; no contiene resultados de modelos.
La campaña permanece cerrada hasta aprobar los controles y los dos pilotos técnicos pagos.

## Estado y alcance

- **Implementado:** adaptador Harbor, puente `RoomService`/`AgentProvider`, controlador PTY, presupuesto compartido, manifiestos, exportación/importación y notebooks.
- **Verificado localmente:** contratos de software, compilación del puente, notebooks vacíos y ZIP. Ver [readiness.md](readiness.md).
- **Bloqueo observado:** APT devolvió `Hash Sum mismatch` en los controles originales. Se conservan los cuatro intentos en [validation/local-controls.json](validation/local-controls.json).
- **Pendiente:** Linux AMD64 nativo, instalación completa y un piloto pago por sistema que pruebe compañeros reales, contabilidad y finalización. No se ejecutaron llamadas a modelos para esta contribución.

Esto compara Claude Code + **AgentPlat Agent Rooms** contra Claude Code + **Agent Teams**. No evalúa Mesh, Morphogenesis, persistencia ni colaboración humana. Es un estudio descriptivo de dos tareas, no una presentación al leaderboard.

## Preparación sin gasto de modelos

Desde la raíz del repo, Node 24.18.0 y pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm --filter @agentplat/rooms... build
npm ci --prefix experiments/native-multiagent-comparison/runtime --ignore-scripts --workspaces=false
pnpm exec tsc -p experiments/native-multiagent-comparison/runtime/tsconfig.json
cd experiments/native-multiagent-comparison
uv sync --frozen --python 3.13
uv run python -m native_eval prepare
uv run python -m unittest discover -s tests -v
node --test tests/rooms.test.mjs
uv run python -m native_eval plan .runs/study
uv run python -m native_eval export .runs/study .runs/empty-study.zip
```

`prepare` descarga solamente los archivos oficiales fijados y el runtime; no ejecuta agentes. `export` ejecuta el notebook y muestra el SHA-256 del ZIP. Con cero intentos, los reportes dicen **sin resultados**. Docker y las descargas necesitan red, aunque estas operaciones no usan APIs de modelos.

Para repetir los controles originales en entornos descartables:

```sh
uv run python -m native_eval controls .runs/controls-01
```

Oracle ejecuta la solución oficial escrita; `nop` no realiza acciones. Ambos invocan el verificador original. Un reward cero sin tests ejecutados no es un control negativo válido. No se arreglan imágenes ni verificadores para hacer pasar estos controles.

### Comprobación de procesos Linux sin inferencia

Desde el directorio del experimento, con la imagen oficial disponible localmente:

```sh
docker run --rm --platform linux/amd64 --network none --cpus 1 --memory 2g \
  --mount "type=bind,source=$PWD,target=/review,readonly" -w /review \
  -e PYTHONDONTWRITEBYTECODE=1 \
  alexgshaw/multi-source-data-merger@sha256:8b32782078ff7383a1b4e5d3cecca8ce287e30f50bb4c0e5db009a18064e666e \
  python3 -m unittest discover -s tests -p test_processes.py -v
```

Comprueba cierre normal/cancelación, descendientes separados y huérfanos, rechazo de limpieza sin evidencia y lanzamiento por ruta absoluta con HOME aislado. Usa un ejecutable de prueba, sin instalar Claude ni modificar tareas. En macOS estas tres pruebas se omiten en la suite host y se ejecutan mediante este comando Linux.

## Operación paga posterior

El ejecutor usa **su propia cuenta Anthropic**, con `ANTHROPIC_API_KEY` en su entorno. No introducir la clave en argumentos, archivos del repo ni mensajes. Los siguientes comandos son instrucciones de uso; no se ejecutaron para la contribución. Los presupuestos son variables explícitas elegidas por el ejecutor, sin valor predeterminado.

Requisitos: Linux AMD64 nativo, Docker, controles válidos, y acceso desde los contenedores al gateway del host. En Linux, pasar a `--gateway-host` una IP del host accesible desde la red de Docker; `host.docker.internal` solo funciona si el daemon lo resuelve. Usar un host dedicado al estudio.

```sh
uv run python -m native_eval pilot .runs/pilot-rooms --arm agentplat --budget-usd "$PILOT_BUDGET_USD" --gateway-host "$DOCKER_HOST_ADDRESS"
uv run python -m native_eval pilot .runs/pilot-teams --arm agent-teams --budget-usd "$PILOT_BUDGET_USD" --gateway-host "$DOCKER_HOST_ADDRESS"
uv run python -m native_eval run .runs/study --budget-usd "$CAMPAIGN_BUDGET_USD" --trial-budget-usd "$TRIAL_BUDGET_USD" --validation .runs/controls-01/validation.json --pilots .runs/pilot-rooms .runs/pilot-teams --gateway-host "$DOCKER_HOST_ADDRESS"
```

Los pilotos usan `log-summary-date-ranges`, fuera del conjunto evaluado. La autorización de campaña debe cubrir 12 presupuestos iguales por equipo. Cada equipo comparte su presupuesto entre todos los participantes. La reserva conservadora puede requerir hasta USD 6,12288 por llamada concurrente, además del gasto acumulado; ver el [contrato de presupuesto](protocol.md#3-contabilidad-y-límites). Esto no es un gasto predeterminado. El CLI se detiene ante incidentes y nunca repite un slot existente. Una campaña interrumpida queda incompleta: conservarla y documentar cualquier nueva campaña antes de ejecutarla.

## Compartir y analizar desde otra cuenta

```sh
uv run python -m native_eval export .runs/study .runs/study.zip
uv run python -m native_eval import /ruta/study.zip .runs/imported --sha256 "$ZIP_SHA256"
NATIVE_EVAL_BUNDLE=.runs/imported uv run jupyter nbconvert --to notebook --execute notebooks/study.ipynb --output-dir .runs/notebook-output
```

El receptor necesita el repo y sus dependencias, **ninguna credencial del ejecutor**. El notebook también se abre en Jupyter con `NATIVE_EVAL_BUNDLE` apuntando al directorio importado. El ZIP contiene manifiestos, `runs.csv`, llamadas, eventos, incidentes, ATIF operativo sin contenido y HTML; los registros originales quedan locales. El SHA del ZIP debe enviarse por un canal confiable; los hashes prueban integridad, no autoría. No se publica automáticamente en Hugging Face.

## Mapa mínimo

| Archivo | Responsabilidad |
|---|---|
| `native_eval/study.py`, `benchmark.lock.json`, `schedule.json` | Archivos fijados, hashes y orden |
| `native_eval/__main__.py` | Configuración nativa de Harbor y puertas de ejecución |
| `native_eval/agent.py` | Reutilizar instalación de Claude Code de Harbor |
| `native_eval/controller.py`, `runtime/rooms.ts`, `runtime/mcp.ts` | PTY, sesiones, hooks y coordinación |
| `native_eval/gateway.py` | Reservas concurrentes y consumo del proveedor |
| `native_eval/results.py`, `native_eval/bundle.py` | Reconciliación, exportación y análisis |
| `notebooks/` | Integridad, comparación y coordinación |

[Protocolo](protocol.md) · [Prompts](prompts.md) · [Reutilización y Ponytail](reuse-review.md) · [Procedencia HF](references.md)
