# Agent Morphogenesis paper - v0.4

Versión preparada el 19 de septiembre de 2026. Integra el argumento revisado,
Agent Room, antecedentes primarios y tres clases de evidencia separadas:

1. Los once casos de frontera de v0.2.
2. La integración PostgreSQL/Team/Work de v0.3, incluida la ejecución perdedora
   que permanece pendiente después de limpiar sus efectos.
3. Una comparación de cuatro condiciones con 1.536 ejecuciones deterministas,
   precedida por un piloto separado y una congelación local de código y diseño.

## Entregables

- `manuscript.md`: fuente editable del paper en inglés.
- `registration.json`: código, entradas, presupuestos, semillas y análisis
  congelados antes de la evaluación; su digest está en el entorno de ejecución.
- `evaluation/`: los 1.536 casos, trazas, registros del runtime y manifiesto.
- `analysis/`: resultados del evaluador independiente, resúmenes y diferencias
  emparejadas, con su propio manifiesto y procedencia.
- `pilot/`, `pilot-analysis/`, `pilot-decision.md`: piloto excluido de la evaluación.
- `development-attempts/`: ejecuciones previas al cierre del instrumento.
- `evidence-matrix.md`: afirmaciones y límites de la evidencia.
- `completion-audit.md`: auditoría del objetivo y de los entregables.
- `figures/`: tres diagramas vectoriales y gráfico de resultados PNG/SVG/PDF.

PDF final: `output/pdf/agent-morphogenesis-paper-v0.4.pdf`.
Artefacto completo: `output/agent-morphogenesis-v0.4-artifact.zip`.

## Resultado principal

La organización fija, el workflow durable y Morphogenesis produjeron 384/384
informes correctos por condición. La adaptación mínima produjo 320/384, con
192 reservas duplicadas y 64 agotamientos del presupuesto de roles. Las dos
condiciones durables adaptativas tuvieron igual calidad y uso de reservas;
Morphogenesis no mostró superioridad en esas medidas. El gráfico y la tabla
presentan costos de persistencia y reservas junto con los resultados de tarea.

Estos resultados describen el conjunto sintético declarado. No miden calidad de
LLMs, ahorro monetario, inteligencia organizacional general ni fiabilidad de
producción. Los propietarios de tareas y algunas autoridades son fixtures. La
integración de Team/Work y Agent Room tiene evidencias y límites propios.

## Reproducir desde el código público

Requisitos: Node.js 22.13 o posterior y pnpm 11.25.0; la comprobación limpia
usó Node.js 24.20.0. Asegurar que `node --version` y el pnpm/Corepack activo
utilicen esa versión de Node. Un shim de Corepack asociado a Node 20 puede
fallar antes de instalar dependencias. La instalación offline necesita también
la caché de metadatos de pnpm; la comprobación final usó el comando online normal.

El [commit de referencia](https://github.com/Agentplat/agentplat/commit/e978544915a329387e13883fa352191f6993dcc7) está disponible públicamente.

```sh
git clone https://github.com/Agentplat/agentplat.git agentplat-paper
cd agentplat-paper
git checkout e978544915a329387e13883fa352191f6993dcc7
# Extraer el ZIP del artefacto sobre este checkout.
pnpm install --frozen-lockfile
pnpm --filter @agentplat/workflows-postgres... --filter @agentplat/collective-host-postgres... --filter @agentplat/collective-control-postgres... --filter @agentplat/rooms-mesh... --filter @agentplat/workflows-rooms... --filter @agentplat/runtime-mock... build
node experiments/morphogenesis-paper/missions/run-local.mjs /tmp/morphogenesis-missions-new docs/research/morphogenesis-paper-v0.4/registration.json
node experiments/morphogenesis-paper/missions/verify.mjs /tmp/morphogenesis-missions-new
python3 experiments/morphogenesis-paper/missions/oracle.py /tmp/morphogenesis-missions-new /tmp/morphogenesis-analysis-new
```

Los directorios de salida deben ser nuevos. `run-local.mjs` requiere Docker,
crea PostgreSQL en un puerto efímero de loopback y elimina el contenedor al
terminar. La imagen y versión ejecutadas se registran en `environment.json`.
La evaluación no necesita llaves de modelos ni servicios de pago.

Para verificar los resultados retenidos, sin iniciar servicios:

```sh
node experiments/morphogenesis-paper/verify.mjs docs/research/morphogenesis-paper-v0.2/pilot
node experiments/morphogenesis-paper/integration/verify.mjs docs/research/morphogenesis-paper-v0.3/integration
node experiments/morphogenesis-paper/missions/verify.mjs docs/research/morphogenesis-paper-v0.4/evaluation
MORPHOGENESIS_MISSION_DIR=docs/research/morphogenesis-paper-v0.4/evaluation node --test experiments/morphogenesis-paper/missions/verify.test.mjs
MORPHOGENESIS_MISSION_DIR=docs/research/morphogenesis-paper-v0.4/evaluation python3 experiments/morphogenesis-paper/missions/test_oracle.py
python3 experiments/morphogenesis-paper/missions/oracle.py docs/research/morphogenesis-paper-v0.4/evaluation /tmp/morphogenesis-analysis-check
```

El gráfico requiere matplotlib. El PDF requiere reportlab y las fuentes
Times New Roman, Arial y Arial Unicode TTF; `MORPHOGENESIS_FONT_DIR` permite
seleccionar su carpeta. Generación:

```sh
python3 experiments/morphogenesis-paper/plot-missions.py
python3 experiments/morphogenesis-paper/render.py v0.4
python3 experiments/morphogenesis-paper/package.py v0.4
```

## Estado de publicación

Manuscrito candidato a preprint de sistemas, con evidencia local reproducible y
límites declarados. El objetivo de preparación no publica ni envía documentos.
Elegir revista/conferencia, adaptar su plantilla, depositar un DOI y realizar
una replicación independiente son decisiones posteriores. Las versiones previas,
bundles históricos y configuración de staging permanecen intactos.
