# Prompt para revisión final independiente

Revisá el PR https://github.com/Agentplat/agentplat/pull/181 contra `codex/native-multiagent-study-design`, concentrándote en `experiments/native-multiagent-comparison`. Usá `harbor-evals-specialist`; si esta sesión no reconoce el rol, informalo y cargá explícitamente su definición en un subagente nuevo, sin afirmar activación nativa.

Primero verificá repositorio, rama, HEAD local/remoto y diff actual. Leé AGENTS.md, protocolo, README y readiness.md. No tomes los veredictos previos como evidencia.

Objetivo: contribuir una integración mínima y reproducible de Harbor que compare Claude Code coordinado por AgentPlat Agent Rooms frente a Agent Teams nativos, con dos tareas oficiales y tres repeticiones por sistema. Es descriptivo; no demuestra superioridad general ni mecanismos causales.

Revisá el flujo completo: tareas fijadas → instalación Harbor → PTY y tres participantes → presupuesto compartido → finalización y detención → verificador original → reconciliación/ATIF → ZIP y notebooks. Usá las versiones instaladas/fijadas y fuentes primarias; consultá Hugging Face para procedencia y reutilización, sin sustituir tareas oficiales por variantes.

Comprobá especialmente:

1. Ruta absoluta de Claude con HOME/PATH aislados.
2. Descendientes separados/huérfanos detenidos antes del verificador; destrucción del entorno si no puede demostrarse la limpieza.
3. Identidad con `agent_id`, sesión compartida y miembros nativos; rechazo de finalización/subdelegación por trabajadores o identidades ambiguas.
4. Métricas desconocidas como `null`, contabilización de todos los participantes/fallos/reintentos y deduplicación de streaming.
5. Integridad oficial, reservas concurrentes, credenciales fuera del ZIP, y puertas de controles/pilotos para el fingerprint vigente.

Ejecutá únicamente las comprobaciones focalizadas necesarias, incluyendo el comando Linux documentado. No ejecutes inferencia, pilotos pagos, HF Jobs, publicaciones, merge ni cambios al PR. No alteres archivos oficiales, recursos o tratamientos; `--print` no acredita Agent Teams.

Entregá una explicación simple del funcionamiento, hasta cinco hallazgos materiales con prioridad, archivo/línea, evidencia, impacto y arreglo mínimo. Distinguí fallos reproducidos de riesgos que necesitan un piloto real. Cerrá con un veredicto separado para contribución como borrador, preparación del piloto y campaña, indicando exactamente qué ejecutaste. Aplicá KISS/YAGNI: no sugieras frameworks ni más tests sin un riesgo concreto.
