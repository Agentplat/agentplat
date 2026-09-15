# Contextos iniciales

Los textos ejecutables y hashables están en [prompts/agentplat.txt](prompts/agentplat.txt) y [prompts/agent-teams.txt](prompts/agent-teams.txt). La instrucción oficial de cada tarea se transmite sin editarla, como mensaje inicial; las reglas de coordinación van en `--append-system-prompt`.

Ambos equipos tienen tres participantes, modelo/esfuerzo fijados, herramientas de tarea de Claude Code y finalización explícita. El coordinador decide tareas y mensajes. La diferencia explícita es Agent Rooms + herramientas MCP frente a coordinación nativa Agent Teams.

Ponytail solo participa en el desarrollo de esta contribución. No se carga en los agentes evaluados. El fingerprint de campaña incluye ambos textos, implementación, versiones y archivos de configuración. Un cambio invalida los pilotos de esa versión.
