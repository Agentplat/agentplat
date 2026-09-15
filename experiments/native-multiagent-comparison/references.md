# Procedencia y búsqueda de reutilización

Inspección del 14 de septiembre de 2026. Se buscaron implementaciones antes de extender el harness y nuevamente a pedido del usuario durante la implementación. No se incorporaron resultados externos al estudio.

## Fuentes oficiales

- [Registro Harbor](https://github.com/harbor-framework/harbor/blob/main/registry.json): Terminal-Bench 2.0, commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`.
- [Tarea financiera](https://github.com/harbor-framework/terminal-bench-2/tree/69671fbaac6d67a7ef0dfec016cc38a64ef7a77c/financial-document-processor) y [merger](https://github.com/harbor-framework/terminal-bench-2/tree/69671fbaac6d67a7ef0dfec016cc38a64ef7a77c/multi-source-data-merger).
- [Harbor agents](https://www.harborframework.com/docs/agents) y [ATIF](https://www.harborframework.com/docs/agents/trajectory-format). La interfaz de instalación y el conversor se inspeccionaron en la distribución instalada `harbor==0.20.0`; `main` tiene interfaces posteriores que no se presuponen disponibles.
- [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams): equipos nativos, contextos y limitaciones. Las afirmaciones de compatibilidad necesitan confirmación con Claude Code 2.1.236 en el piloto.
- [Count Tokens](https://platform.claude.com/docs/en/build-with-claude/token-counting) es aproximado: se reserva la ventana máxima del modelo para limitar gasto concurrente.
- [Sonnet 4.6](https://platform.claude.com/docs/en/models/sonnet-4-6/overview): modelo y precios estándar. USD/millón: entrada 3, salida 15, lectura caché 0.30, escritura 5 min 3.75, escritura 1 h 6. El gateway rechaza herramientas ejecutadas por el proveedor con facturación adicional. `WebSearch` se deshabilita por igual en ambos brazos.

## Hugging Face: código y ejecuciones reales inspeccionadas

El conector respondió `Tool dataset_search is disabled by server configuration`. Se usaron APIs públicas de HF, árboles de repositorios y archivos `resolve`, sin credenciales ni inference endpoints.

| Referencia | Hallazgo de código | Decisión |
|---|---|---|
| [Cody source](https://huggingface.co/datasets/cody-vi4/tbench-2-1-cody-opus48/tree/2a8fc2176a5787c3bad3f80dd1cfbe7035d99ae4/agent_source) | Dos clases de 94 y 64 líneas; `VanillaPlusV4` importa `VanillaPlusV3`, ausente del árbol publicado. Añade prompts, RAG opcional y reintentos heredados. | Sirve como referencia de subclasificación; copiarlo añadiría tratamientos ajenos y dependencias faltantes. No contiene controlador Agent Teams. |
| [harbor_multiturn](https://huggingface.co/anonymousee8/harbor_multiturn/blob/3c2ff727a8faeb1b57d4f466e5308d8347ae5789/src/harbor/agents/installed/claude_code.py) | Fork de 1077 líneas, `BaseInstalledAgent`/`ExecInput` y conversión propia de versiones anteriores. | Reutilizar directamente ClaudeCode del Harbor fijado evita mantener otro fork. |
| [Leaderboard: financial-document-processor](https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/blob/572b2614be2c0cb2527e14f5b1e4026f1072e6c1/submissions/terminal-bench/2.0/Mux__Claude-Opus-4.6/2026-02-09__01-47-04/financial-document-processor__4KQE34p/result.json) | Resultado público con el mismo commit y checksum de tarea `e8ee9e8948d949d0abe46d431736d1cf04e8aab76d98fc9c819fb26960ab1352`. Conserva `agent_result`, verifier, excepciones y tiempos Harbor. | Mantener ese esquema nativo; añadir únicamente metadatos propios del estudio. No usar su consumo o reward como observación de este experimento. |
| [Mux adapter](https://github.com/coder/mux/tree/main/benchmarks/terminal_bench) | Contabilidad de sesiones y prevención de doble conteo de hijos ya agregados por padres; contrato específico de Mux, más de 900 líneas. | Reutilizar el principio de reconciliación, no trasladar su runtime ni su formato de consumo a Claude Code. |
| [Harbor parity experiments](https://huggingface.co/datasets/harborframework/parity-experiments) | Referencias de comparación con verificadores originales. | Mantener oracle y nop; no crear verificadores del experimento. |
| [zai-org verified](https://huggingface.co/datasets/zai-org/terminal-bench-2-verified/blob/main/README.md) | Cambia imágenes, entorno e instrucciones, incluida una advertencia multimodal en financial-document-processor. | Excluido: no sustituye la distribución oficial fijada. |

La búsqueda no encontró en las implementaciones inspeccionadas un controlador de Agent Teams con reservas agregadas que se pueda importar directamente. Esto no afirma que no exista en otros repositorios. No se copiaron instrucciones de resolución ni trayectorias de estas tareas a los agentes evaluados.
