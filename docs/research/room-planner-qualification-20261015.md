# Calificación del AgentPlat Planner — 15 de octubre de 2026

Resultado: **apto para un piloto controlado sobre evidencia suministrada**. Esta decisión no autoriza publicación ni despliegue y no establece fiabilidad general, investigación web abierta ni preparación operacional a escala.

## Candidato y método

- Cohorte de fuente: `3ebeb6f88e02620b27ed81da82c6f471c0e2adfd575368d31e452bbca417ddfa`, 25 paquetes; versiones declaradas 1.1.0. Estos bytes nuevos no se presentan como una versión ya publicada.
- HEAD de referencia: `0142d6e607eec75c0464c13949df8c2d95b48f1e`, con cambios locales. Los hashes de los tarballs y de cada archivo instalado fijan el contenido ejecutado; HEAD por sí solo no lo identifica.
- Consumidor `src/server/room-planner.ts`: `4933ed2656e5ecc4331c6dea698fb3f99aeb508f5ed251dfcb0ffe5159c06c9f`. Este archivo y la configuración del modelo no cambiaron entre desarrollo y holdout.
- Modelo: `gpt-6-luna`; mismo corpus por caso, roles, permisos sin escrituras externas, límite de salida de 3.000 tokens y presupuesto de USD 0,50 por variante/caso, dentro del tope global de USD 5.
- Tarifas Standard verificadas en [OpenAI Docs](https://developers.openai.com/api/docs/pricing): USD 0,10/M de entrada, 0,01/M de entrada cacheada, 0,125/M de escritura de caché y 0,50/M de salida. El gasto se calcula desde el uso informado por la API; no es una conciliación de factura.
- Las variantes legacy y selective reproducen las estrategias de sesión por turnos y selección individual con los adaptadores reales del consumidor. Planner ejecuta la composición durable real en PostgreSQL. Esto no compara la latencia de una interfaz desplegada.
- El evaluador comprueba hechos tipados y fuentes contra datos del corpus, no contra una autoevaluación del modelo. Cuando el usuario pide revisión independiente, exige evidencia de que un segundo especialista la realizó. Para Planner exige además el cierre gobernado y, al corregir, un único objetivo con una nueva versión de informe.

## Comparación final

Desarrollo: 6 casos, campaña `2026-10-16-7f9c850e`.

| Estrategia | Cumplimiento | Finalizaciones falsas | Llamadas | Costo USD | Mediana s |
|---|---:|---:|---:|---:|---:|
| legacy | 6/6 | 0 | 14 | 0.004733 | 14.21 |
| selective | 2/6 | 2 | 7 | 0.001861 | 4.98 |
| planner | 6/6 | 0 | 22 | 0.010470 | 24.55 |

Holdout: 4 casos nuevos, campaña `2026-10-16-41859e7f`. La lógica del producto quedó congelada antes de ejecutarlos.

| Estrategia | Cumplimiento | Finalizaciones falsas | Llamadas | Costo USD | Mediana s |
|---|---:|---:|---:|---:|---:|
| legacy | 4/4 | 0 | 10 | 0.002985 | 9.29 |
| selective | 1/4 | 0 | 5 | 0.001411 | 5.17 |
| planner | 4/4 | 0 | 17 | 0.009360 | 26.69 |

Las diferencias del routing selectivo se deben principalmente a la ausencia de una segunda revisión cuando se pidió explícitamente. No implican por sí mismas errores en los hechos calculados. El flujo legacy también puede satisfacer estos briefs mediante dos turnos; la evidencia no demuestra superioridad factual general del Planner. La coordinación durable añade costo y tiempo y debe reservarse para trabajo que necesita continuidad, seguimiento, versiones o revisión verificable.

## Fallo anterior y decisión del sucesor

El candidato anterior quedó **no apto**: en `blind-two-eligible` la recomendación y los hechos fueron correctos, pero la revisión rechazó enlaces junto a IDs de fuente. El motor conservó el objetivo en espera, sin autorizar un cierre. El [informe inicial](room-planner-qualification-20261015-initial-nogo.md), su manifiesto y el archivo `room-planner-qualification-nogo-d9d4d897.tar.gz` se preservan como diagnóstico.

El sucesor respeta el formato de citas pedido por el dueño y entrega los rechazos verificables al razonador. Una reparación automática debe producir trabajo y una nueva versión del informe; el mismo contenido no se vuelve a revisar para buscar otra respuesta. Tras tres versiones rechazadas se requiere intervención. Un resultado desconocido no dispara esa reparación. Una corrección del dueño que coincide con la revisión se reinterpreta contra el estado vigente, sin perderse ni superar un cambio de control.

El sucesor satisface las diez puertas de esta evaluación: contenido, fuentes, revisión ejecutada, cierre gobernado, continuidad de correcciones y respuesta directa cuando corresponde. La habilitación sigue limitada a un piloto controlado sobre evidencia suministrada; los flags de despliegue permanecen apagados.

La columna de finalizaciones falsas cuenta autoafirmaciones de completitud dentro del contenido generado; no significa que el motor haya autorizado ese objetivo como completado. Los informes revisados se evalúan sobre la versión canónica vinculada al recibo del revisor.

## Fallos encontrados y corregidos

1. Comparaciones por orden de propiedades rompían reintentos y reutilización tras JSONB: se reutiliza la comparación canónica existente y se prueba con PostgreSQL.
2. Consumo incompleto podía liberar reservas como si fuera cero; un sobrecosto con salida inválida podía no detener admisiones: ahora se requieren todos los campos y se prioriza el límite monetario.
3. Una interpretación vieja podía deshacer una pausa/reanudación: las decisiones se vinculan a las revisiones de objetivo y control suministradas al razonador.
4. Un Planner incierto bloqueaba menciones directas: el enrutamiento explícito puede continuar dentro del saldo y concurrencia disponibles.
5. El plan podía consumir todos los especialistas y dejar sin verificador: admisión de plan completo y hasta tres interpretaciones con feedback, cada una con reserva propia.
6. La salida para el usuario podía escapar del formato de la API: modo JSON, instrucciones de envoltura y reparación acotada de errores conocidos. Las llamadas ambiguas siguen sin repetirse.
7. Un wait interno podía detener una revisión ya lista: el motor continúa trabajo y verificación admitidos, mientras conserva las pausas del dueño y los bloqueos reales. La identidad de tareas cambiadas puede repararse con feedback y reservas nuevas, sin repetir el trabajo anterior.
8. Al verificador le faltaban requisitos originales y evidencia de ejecución: recibe pedido, correcciones del dueño y vínculo real con especialista, versión y recibo de revisión. Las propuestas internas no se registran como correcciones del dueño.

Los ensayos anteriores al candidato final fueron diagnósticos y se preservan aparte. El evaluador también se corrigió: normaliza etiquetas equivalentes de opciones y verifica revisión ejecutada. Los briefs finales hacen explícita la revisión por otro especialista para evitar confundir “revisado” con “actualizado”. Por esas modificaciones, no se interpreta la evolución de puntuaciones entre ensayos como una comparación experimental emparejada.

Las identidades tenant-globales de tareas, informes y mensajes ahora incluyen la Room. Las claves externas de modelo e investigación también incluyen tenant y dueño. Dos Rooms con nombres de objetivo/tarea idénticos se prueban en PostgreSQL. Los reintentos conservan su ruta original al activar/desactivar Planner y no generan una segunda ejecución.

## Verificación funcional del sucesor

Pasaron 66 pruebas dirigidas del motor, evaluación, adaptadores PostgreSQL y workflows, sin omisiones. También pasaron los contratos públicos TypeScript y los límites de arquitectura. En Grishen pasaron las dos integraciones con PostgreSQL, cuatro pruebas de política/evaluación, ocho regresiones PWA, el chequeo de tipos y el build de Next.js. Estos resultados comprueban comportamiento funcional y compatibilidad local; no sustituyen la comparación del modelo ni prueban escala de producción.

## Presupuesto y alcance de evidencia

Gasto de inferencia contabilizado de **todas** las corridas: **USD 0.217384 de USD 5.00**; reservas pendientes: USD 0.000000. El ledger persiste entre procesos y no reinicia la autorización al repetir un ensayo.

Las tablas muestran una ejecución por caso y variante del candidato seleccionado; existen corridas diagnósticas previas que no se agregan como estimación estadística. No se establece significación estadística. Las fuentes son briefs sintéticos controlados: no se evaluaron conectores web reales, autenticidad de fuentes externas, memoria entre tareas ni iniciativa espontánea. El caso de desacuerdo suministra la objeción en el brief. Las correcciones humanas fueron guionadas; no se midió tiempo humano ni rescates operativos. No hubo exposición a escrituras externas, por lo que cero efectos duplicados no estima una tasa de duplicación real. La recuperación, los límites, la concurrencia y el rechazo de resultados obsoletos tienen pruebas funcionales separadas. Los holdouts anteriores se conservan como diagnósticos; el conjunto de esta tabla usa casos nuevos, definidos antes de sus llamadas y posteriores a la reparación del candidato inicial.

## Artefactos y siguiente límite

- Manifiesto revisable: [candidato de fuente](../../config/room-planner-pilot-candidate-v1.json).
- Archivo local bajo `Admin/web/.agentplat-preview/room-planner-qualification-20261015.tar.gz`; SHA-256: `00cd81a2683e553892e20e8a25a9f78c553d6b313154c10fc6d574bca46c5864`. Incluye corpus, protocolos previos a llamadas, fuentes críticas del consumidor, trazas, respuestas, ledger y los tarballs exactos. `MANIFEST.json` permite verificar sus archivos.
- La auditoría aislada de los paquetes empacados inspeccionó 2144 archivos y pasó. La auditoría global del checkout conserva fallos por artefactos locales anteriores; esta calificación no los oculta ni los elimina. La auditoría de términos externos no se activó en el staging de paquetes.
- Para activar un piloto desplegado falta una cohorte publicada con versión nueva compatible, actualizar y verificar el lock del consumidor, conectar fuentes reales autorizadas y completar los controles de release. El flag permanece apagado por defecto.
