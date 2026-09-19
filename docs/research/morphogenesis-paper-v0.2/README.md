# Agent Morphogenesis paper - v0.2

Revisión del 19 de septiembre de 2026. El borrador v0.1 permanece intacto.

- `manuscript.md`: paper en inglés, con autoría del PDF proporcionado.
- `references.bib`: bibliografía, incluidos JaCaMo, ParaMoise y Agent Rooms.
- `evidence-matrix.md`: afirmaciones, comprobaciones y límites.
- `source-register.md`: fuentes y profundidad de lectura.
- `pilot/`: once casos locales, registros de propietarios, journals y manifiesto.
- `development-attempts/`: intentos fallidos conservados y piloto previo.
- `figures/`: tres figuras vectoriales generadas por el renderer.

El PDF está en `output/pdf/agent-morphogenesis-paper-v0.2.pdf`.

## Cambios principales

Se precisa la contribución como protocolo de reconfiguración durante ejecución.
Agent Room aparece como contexto persistente de colaboración, con autoridad de
efectos separada. La comparación incluye antecedentes de reorganización durante
ejecución. El caso central distingue efectos aplicados y sucesor aceptado.
El piloto compara recuperación de identidad estable con un patrón durable y una
ablación que crea una identidad nueva. Se separan continuidad de evidencia,
trabajo y misión. Los resultados históricos conservan sus propias versiones.

## Alcance para circulación

Versión candidata a preprint de sistemas con piloto local reproducible. La
evaluación confirmatoria de utilidad, costos y cuatro condiciones está descrita
pero no ejecutada. No hay validación de producción, estudio con LLMs, prueba
formal integral ni superioridad demostrada sobre frameworks completos.
Los fallos iniciales del harness se conservan; no se presentan como éxitos.

Antes de enviar a una conferencia o revista: elegir formato y requisitos,
completar el estudio confirmatorio si el destino exige resultados de utilidad,
y depositar un release inmutable con DOI para el artefacto. Este trabajo no
publicó ni envió el manuscrito a servicios externos.

## Reproducir

Desde la raíz del repositorio, con las dependencias instaladas:

```sh
pnpm --filter @agentplat/collective-runtime... --filter @agentplat/rooms-mesh... --filter @agentplat/workflows-rooms... --filter @agentplat/collective-host... build
node experiments/morphogenesis-paper/run.mjs --output /tmp/morphogenesis-pilot-new
node experiments/morphogenesis-paper/verify.mjs /tmp/morphogenesis-pilot-new
MORPHOGENESIS_PILOT_DIR=/tmp/morphogenesis-pilot-new node --test experiments/morphogenesis-paper/verify.test.mjs
node --test tests/morphogenesis.test.mjs
python3 experiments/morphogenesis-paper/render.py
```

El renderer requiere Python, reportlab y fuentes Times New Roman/Arial de macOS;
admite `MORPHOGENESIS_FONT_DIR` para otra carpeta con esos archivos TTF.
Los directorios de resultados deben ser nuevos para preservar intentos previos.
