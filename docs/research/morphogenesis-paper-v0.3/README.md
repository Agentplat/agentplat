# Agent Morphogenesis paper - v0.3

Versión del 19 de septiembre de 2026. Conserva los borradores y bundles anteriores.
El manuscrito incorpora una segunda evaluación local con PostgreSQL, Team y Work.

## Entregables

- `manuscript.md`: paper con resultados y límites de ambas evaluaciones.
- `integration/`: propuestas, aprobaciones firmadas, estado de propietarios,
  trazas, resultados, entorno y manifiesto del nuevo experimento.
- `development-attempts/`: un intento fallido y tres ejecuciones intermedias;
  ninguno se suma al denominador de la ejecución retenida.
- `evidence-matrix.md`: correspondencia entre afirmaciones y comprobaciones.
- `next-work.md`: obligaciones que aún faltan para la publicación empírica fuerte.

PDF: `output/pdf/agent-morphogenesis-paper-v0.3.pdf`.
Bundle: `output/agent-morphogenesis-v0.3-artifact.zip`.
La versión v0.2 y sus once casos permanecen en su directorio original.

## Resultados nuevos

Dos propuestas distintas y aprobadas activaron dos Teams y dos contratos Work
antes del CAS; solo una confirmó la morfología. La limpieza explícita liberó el
Work y canceló el Team perdedor, pero la ejecución V1 quedó en
`committing_morphology`. El experimento conserva ese resultado, sin declararlo
recuperación terminal completa ni modificar el runtime para ocultarlo.

Un mandato Work vencido impidió la activación aunque la decisión organizacional
seguía vigente. Una promesa de trabajo previamente admitida permaneció en curso
después del fence; el adaptador de drenaje esperó su terminación, reconcilió la
operación original y completó el ciclo ganador.

## Reproducción

Desde un checkout del commit `e978544915a329387e13883fa352191f6993dcc7`, con
dependencias instaladas y los archivos de este artefacto superpuestos:

```sh
pnpm --filter @agentplat/collective-host-postgres... --filter @agentplat/collective-control-postgres... build
node experiments/morphogenesis-paper/integration/run-local.mjs /tmp/morphogenesis-integration-new
node experiments/morphogenesis-paper/integration/verify.mjs /tmp/morphogenesis-integration-new
MORPHOGENESIS_INTEGRATION_DIR=/tmp/morphogenesis-integration-new node --test experiments/morphogenesis-paper/integration/verify.test.mjs
node --test tests/morphogenesis.test.mjs tests/collective-control-actions.test.mjs tests/collective-control-mesh.test.mjs
python3 experiments/morphogenesis-paper/render.py v0.3
python3 experiments/morphogenesis-paper/package.py v0.3
```

`run-local.mjs` requiere Docker. Crea un contenedor PostgreSQL 18 aislado, expone
un puerto efímero solo en loopback y lo elimina al terminar. El runner también
acepta `MORPHOGENESIS_PG_PORT` si se suministra un PostgreSQL local dedicado.
Los datos de prueba viven en esquemas nuevos con nombres aleatorios. Los esquemas
se exportan como registros relevantes y se eliminan al terminar, incluso en error.
La imagen exacta utilizada queda registrada en `integration/environment.json`.

El renderer requiere Python/reportlab y las fuentes TTF documentadas en v0.2.
Verificar los bundles retenidos no necesita Docker ni servicios activos.

## Límites

Las observaciones de descubrimiento/membresía y las atestaciones son fixtures.
Las claves Ed25519 autentican aprobaciones del ensayo, no identidades humanas
reales. El store PostgreSQL de Team es un adaptador de prueba; los de Morphogenesis
y Collective Work son los de referencia. El witness es local al proceso.
Admisión y drenaje de la promesa son un adaptador de aplicación explícito, no una
prueba de ActionGateway o de proveedores externos. Se usan relojes controlados.
La ejecución local no mide utilidad organizacional ni fiabilidad de producción.
No se publicó ni depositó el manuscrito en servicios externos.
