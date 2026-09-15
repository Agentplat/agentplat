# Estado de verificación

## Comprobado localmente

- Rama de contribución basada en `codex/native-multiagent-study-design`, cambios limitados a este experimento.
- Terminal-Bench 2.0 fijado al commit del registro: 40 archivos oficiales para dos tareas y el piloto técnico; hashes completos y orden de 12 slots publicados.
- Dependencias Python bloqueadas en `uv.lock`; SDK MCP y tipos en `runtime/package-lock.json`; paquetes AgentPlat compilados desde esta rama.
- Pruebas focalizadas de presupuesto concurrente, ausencia de datos, fragmentos duplicados, aislamiento de configuración, participantes, cancelación y ZIP. Un contrato integrado recorre RoomService y AgentProvider sin modelo.
- ZIP importado y tres notebooks ejecutados con HOME aislado y sin variables de credenciales del ejecutor.
- Gateway HTTP/SSE comprobado con transporte upstream local de prueba: reserva máxima y liquidación; cero llamadas al proveedor.
- Cancelación del grupo de procesos comprobada en un contenedor descartable de la imagen oficial de merger, sin instalar paquetes ni ejecutar un modelo.
- Tres notebooks ejecutados con cero intentos: muestran “sin resultados”. Ningún dataset o resultado científico inventado.

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
