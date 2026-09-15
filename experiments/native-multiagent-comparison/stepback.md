# Step-back: ¿estamos haciendo lo que queremos, de la forma más simple?

Documento para releer al inicio de cada sesión sobre este experimento. Cada pregunta tiene la respuesta honesta de hoy (2026-09-15, post-arreglos H1-H3/H5). Si una respuesta cambia, actualizarla acá.

## 1. ¿Qué queremos aprender, en una frase?

Si Claude Code coordinado por Agent Rooms de AgentPlat rinde distinto (calidad, costo, tiempo) que los Agent Teams nativos, en 2 tareas oficiales × 3 repeticiones por sistema, de forma auditable.

**¿Lo respondemos?** Todavía no: cero llamadas a modelos hasta hoy. Tenemos el instrumento, no la medición.

## 2. ¿El instrumento más simple posible ya existe?

Casi. Lo que hay es un adaptador Harbor + un controlador PTY + un gateway de presupuesto + reconciliación. Cada pieza existe por un riesgo concreto (fuga de credenciales, procesos zombis, costos fantasma, identidades falsas), no por especulación. La revisión del 15-09 no encontró abstracciones de sobra para borrar.

**Vigilar**: si una pieza nueva no responde a un riesgo con nombre, no entra (YAGNI). El controlador es la pieza más compleja; si el piloto muestra que Claude Code 2.1.236 no coopera con los hooks, la respuesta es simplificar el diseño, no agregar capas de compatibilidad.

## 3. ¿Qué está demostrado hoy sin gastar un dólar?

Integridad de tareas oficiales (hashes), aislamiento HOME/PATH, detención de procesos fail-closed (probado en la imagen oficial), gateway con reservas/liquidación y admisión que sobrevive errores transitorios (`tests/test_gateway.py`), reconciliación con `null`s honestos, ZIP sin credenciales, puertas que hoy rechazan la campaña. Todo con tests que corren en minutos.

## 4. ¿Qué es imposible saber sin el piloto pago?

- Que Agent Teams nativos realmente funcionen con este controlador (hooks con `agent_id`, layout de `config/teams/`, PTY+MCP de punta a punta).
- Que la contabilidad cierre contra la factura real (precios/tiers vigentes de sonnet-4-6).
- Cualquier número de rendimiento o costo.

**Regla**: no escribir más código para estos tres puntos antes del piloto. El piloto es el test.

## 5. ¿Cuál es el paso siguiente más barato que reduce más incertidumbre?

1. Controles oracle/nop en un host Linux AMD64 con APT sano (gratis, desbloquea todo).
2. Un piloto pago de UN brazo (`agent-teams`, el más incierto) sobre `log-summary-date-ranges` con presupuesto chico.
3. Recién después, el segundo piloto y la campaña.

## 6. ¿Dónde nos podríamos estar engañando?

- Confundir "los tests pasan" con "el experimento funciona": los tests prueban el software, no el fenómeno.
- Tratar `--print` o agentes ordinarios como evidencia de Agent Teams: no lo son (protocolo §2).
- Dejar que la campaña "casi completa" tiente a relajar una puerta: las puertas rechazan por diseño; si molestan, la respuesta es cumplirlas, no aflojarlas.
- Sumar robustez especulativa al gateway/controlador antes de ver fallar algo real en el piloto.

## Checklist para la próxima sesión

- [ ] ¿Cambió el fingerprint? Entonces los planes/controles/pilotos previos no valen (por diseño).
- [ ] ¿Hay resultados nuevos? Actualizar §1 y §3 con lo demostrado.
- [ ] ¿Se agregó código? Nombrar el riesgo concreto que lo justifica o borrarlo.
- [ ] ¿Sigue siendo cierto que la pieza más simple que responde la pregunta es esta?
