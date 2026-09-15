# Estado de verificación

## Comprobado localmente

- Rama de contribución basada en `codex/native-multiagent-study-design`, cambios limitados a este experimento.
- Terminal-Bench 2.0 fijado al commit del registro: 40 archivos oficiales para dos tareas y el piloto técnico; hashes completos y orden de 12 slots publicados.
- Dependencias Python bloqueadas en `uv.lock`; SDK MCP y tipos en `runtime/package-lock.json`; paquetes AgentPlat compilados desde esta rama.
- Pruebas focalizadas de presupuesto concurrente, ausencia de datos, fragmentos duplicados, aislamiento de configuración, participantes, cancelación y ZIP. Un contrato integrado recorre RoomService y AgentProvider sin modelo.
- ZIP importado y tres notebooks ejecutados con HOME aislado y sin variables de credenciales del ejecutor.
- Gateway HTTP/SSE comprobado con upstream local de prueba (`tests/test_gateway.py`): reserva y liquidación, rechazos y errores del proveedor sin cerrar la admisión, y cierre de admisión ante precios fuera de contrato; cero llamadas al proveedor.
- Cancelación del grupo de procesos comprobada en un contenedor descartable de la imagen oficial de merger, sin instalar paquetes ni ejecutar un modelo.
- Tres notebooks ejecutados con cero intentos: muestran “sin resultados”. Ningún dataset o resultado científico inventado.

## Correcciones de la revisión del 14 de septiembre de 2026

- Se conserva la ruta absoluta del Claude instalado por Harbor al cambiar HOME/PATH.
- El controlador Linux usa `PR_SET_CHILD_SUBREAPER` y congela/detiene el árbol antes de terminar, incluyendo procesos con otro grupo y huérfanos. El adaptador exige una prueba de cierre; si falta o falla, descarta el entorno antes del verificador. Referencia: [contrato Linux](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html).
- Los hooks usan `agent_id`/miembros nativos antes de la sesión heredada. Una identidad ambigua no puede finalizar ni subdelegar. Las reservas de participantes se serializan. Referencia: [campos de hooks](https://code.claude.com/docs/en/hooks#common-input-fields).
- Pasos, llamadas y herramientas quedan en `null` cuando la contabilización es incompleta, incluidos logs ausentes y llamadas fallidas sin respuesta.
- Validación: 10 pruebas host pasan; las 3 pruebas específicas de Linux pasan por separado en la imagen oficial de merger, sin red, con 1 CPU y 2 GiB, sobre Docker AMD64 emulado. El ejecutable de prueba valida el controlador, no la compatibilidad real de Claude Code.
- No se repitieron los controles oficiales ni se ejecutaron pilotos pagos. Al cambiar el fingerprint, los planes y pruebas de habilitación anteriores no autorizan una campaña nueva.

El [prompt de revisión final](final-review-prompt.md) pide verificar el HEAD actual y las limitaciones pendientes sin gasto de modelos.

## Correcciones de la revisión del 15 de septiembre de 2026

- El gateway ya no cierra la admisión por errores previos a la reserva: los rechazos de validación/reserva y las respuestas de error del proveedor se liquidan en cero y responden 400 (los SDK no reintentan 400, eliminando la cascada de reintentos del 409 anterior). Count Tokens es transporte puro del status del proveedor, sin tocar el ledger. Solo el gasto en vuelo desconocido, un exceso liquidado o un precio fuera de contrato cierran la admisión.
- Guardas de precio: se rechaza la beta de contexto largo y se cierra la admisión si la respuesta reporta `service_tier` distinto de `standard` o más de 200.000 tokens de entrada (precio premium que la liquidación estándar subcontaría). Confirmar los precios vigentes en el piloto.
- La campaña es reanudable: `run` salta slots completados sin incidente; un timeout o llamada rechazada con contabilidad completa y verificador ejecutado es observación registrada, no detención. Un slot con incidente real sigue deteniendo la campaña y exige inspección humana.
- Nota: `validation/local-controls.json` conserva el esquema de una versión anterior de los controles (sin `implementation`); las puertas lo detectan y obligan a repetir controles con el fingerprint vigente.

## Controles oficiales: bloqueo externo conservado

Cuatro intentos en Docker Linux AMD64 emulado sobre macOS ARM64, sin modelos:

| Tarea | Control | Reward oficial | Evidencia |
|---|---|---:|---|
| financial-document-processor | oracle | 0 | 3/7 tests pasan; Tesseract no se instala por APT Hash Sum mismatch |
| financial-document-processor | nop | 0 | 0/7 tests pasan; control negativo ejecutado |
| multi-source-data-merger | oracle | 0 | Solución termina, pero el verificador no arranca por APT Hash Sum mismatch |
| multi-source-data-merger | nop | 0 | Verificador no arranca por APT Hash Sum mismatch |

[Registro verificable](validation/local-controls.json). Las tareas, límites y hashes no se alteraron para resolver el fallo. Conservar estos intentos; repetir controles en un host con descargas íntegras mediante un directorio nuevo, sin sustituir esta evidencia.

## Pendiente antes de habilitar la campaña

1. Controles válidos en Linux AMD64 nativo y comprobación de los recursos efectivos del entorno.
2. Piloto pago de cada brazo sobre `log-summary-date-ranges`, con presupuesto explícito. Debe observar las sesiones reales de los tres participantes, contexto inicial, mensajes, todas las llamadas y finalización automática.
3. Revisar que Claude Code 2.1.236 entregue hooks y transcript IDs compatibles: no basta con haber compilado el controlador. Si falta una identidad o consumo, el CLI rechaza la campaña.

No hay evidencia de rendimiento, ahorro de tokens o superioridad. No se usó ninguna API de modelos para probar el experimento. Los originales de las futuras corridas quedan locales y la publicación se decide después.
