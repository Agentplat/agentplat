# Calificación del AgentPlat Planner — 15 de octubre de 2026

Resultado: **no apto todavía para el piloto definido**. Esta decisión no autoriza publicación ni despliegue y no establece fiabilidad general, investigación web abierta ni preparación operacional a escala.

## Candidato y método

- Cohorte de fuente: `b42de0a3997c19e1708f0a4984a2cdb6ed4bca3aed7c40da78dc3933d41e5689`, 25 paquetes; versiones declaradas 1.1.0. Estos bytes nuevos no se presentan como una versión ya publicada.
- HEAD de referencia: `0142d6e607eec75c0464c13949df8c2d95b48f1e`, con cambios locales. Los hashes de los tarballs y de cada archivo instalado fijan el contenido ejecutado; HEAD por sí solo no lo identifica.
- Consumidor `src/server/room-planner.ts`: `f2eff807aa271465503f436a031bed5a0c7a53813b1ea4f8bc4590be27be2c8b`. Este archivo y la configuración del modelo no cambiaron entre desarrollo y holdout.
- Modelo: `gpt-6-luna`; mismo corpus por caso, roles, permisos sin escrituras externas, límite de salida de 3.000 tokens y presupuesto de USD 0,50 por variante/caso, dentro del tope global de USD 5.
- Tarifas Standard verificadas en [OpenAI Docs](https://developers.openai.com/api/docs/pricing): USD 0,10/M de entrada, 0,01/M de entrada cacheada, 0,125/M de escritura de caché y 0,50/M de salida. El gasto se calcula desde el uso informado por la API; no es una conciliación de factura.
- Las variantes legacy y selective reproducen las estrategias de sesión por turnos y selección individual con los adaptadores reales del consumidor. Planner ejecuta la composición durable real en PostgreSQL. Esto no compara la latencia de una interfaz desplegada.
- El evaluador comprueba hechos tipados y fuentes contra datos del corpus, no contra una autoevaluación del modelo. Cuando el usuario pide revisión independiente, exige evidencia de que un segundo especialista la realizó. Para Planner exige además el cierre gobernado y, al corregir, un único objetivo con una nueva versión de informe.

## Comparación final

Desarrollo: 6 casos, campaña `2026-10-15-2362a2f3`.

| Estrategia | Cumplimiento | Finalizaciones falsas | Llamadas | Costo USD | Mediana s |
|---|---:|---:|---:|---:|---:|
| legacy | 6/6 | 0 | 14 | 0.004299 | 8.64 |
| selective | 2/6 | 2 | 7 | 0.001814 | 4.74 |
| planner | 6/6 | 0 | 22 | 0.011038 | 27.18 |

Holdout: 4 casos nuevos, campaña `2026-10-15-e0e408d0`. La lógica del producto quedó congelada antes de ejecutarlos.

| Estrategia | Cumplimiento | Finalizaciones falsas | Llamadas | Costo USD | Mediana s |
|---|---:|---:|---:|---:|---:|
| legacy | 4/4 | 0 | 10 | 0.003235 | 9.66 |
| selective | 1/4 | 0 | 5 | 0.001601 | 6.87 |
| planner | 3/4 | 1 | 24 | 0.015015 | 30.56 |

Las diferencias del routing selectivo se deben principalmente a la ausencia de una segunda revisión cuando se pidió explícitamente. No implican por sí mismas errores en los hechos calculados. El flujo legacy también puede satisfacer estos briefs mediante dos turnos; la evidencia no demuestra superioridad factual general del Planner. La coordinación durable añade costo y tiempo y debe reservarse para trabajo que necesita continuidad, seguimiento, versiones o revisión verificable.

## Bloqueo observado y decisión

El holdout más reciente se conserva íntegro, incluso cuando falla. En `blind-two-eligible` la recomendación y todos los hechos fueron correctos, pero la revisión rechazó el uso de enlaces junto a los IDs de fuente. Hay una incoherencia entre el productor, que pide URLs, y el criterio de revisión que se interpretó como IDs sin enlaces. El motor dejó el objetivo en espera: no admitió un cierre sin revisión aprobada.

La columna de finalizaciones falsas cuenta autoafirmaciones de completitud dentro del contenido generado; no significa que el motor haya autorizado ese objetivo como completado. Esta diferencia impide confundir un buen texto con un resultado gobernado terminado.

Para levantar el bloqueo se necesita un contrato único de citas que respete el formato del dueño, validación determinista de las propiedades comprobables y una reparación acotada de resultados rechazados que produzca una nueva versión. El verificador semántico debe aportar juicio sobre el contenido, sin convertirse en la única fuente de verdad sobre formato, identidad o ejecución. Corresponde calificar ese sucesor con casos nuevos; el presente candidato permanece desactivado.

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

## Presupuesto y alcance de evidencia

Gasto de inferencia contabilizado de **todas** las corridas: **USD 0.186564 de USD 5.00**; reservas pendientes: USD 0.000000. El ledger persiste entre procesos y no reinicia la autorización al repetir un ensayo.

Las tablas muestran una ejecución por caso y variante del candidato seleccionado; existen corridas diagnósticas previas que no se agregan como estimación estadística. No se establece significación estadística. Las fuentes son briefs sintéticos controlados: no se evaluaron conectores web reales, autenticidad de fuentes externas, memoria entre tareas ni iniciativa espontánea. El caso de desacuerdo suministra la objeción en el brief. Las correcciones humanas fueron guionadas; no se midió tiempo humano ni rescates operativos. No hubo exposición a escrituras externas, por lo que cero efectos duplicados no estima una tasa de duplicación real. La recuperación, los límites, la concurrencia y el rechazo de resultados obsoletos tienen pruebas funcionales separadas. El primer holdout falló y se conservó como diagnóstico; el holdout de esta tabla es un conjunto nuevo, posterior a las correcciones de flujo.

## Artefactos y siguiente límite

- Manifiesto revisable: [candidato de fuente](../../config/room-planner-pilot-initial-nogo-v1.json).
- Archivo local bajo `Admin/web/.agentplat-preview/room-planner-qualification-nogo-d9d4d897.tar.gz`; SHA-256: `d9d4d897fe94d6003fc025fe46b157ab7b5b5b7e8bf40f7c00fa27df191548ba`. Incluye corpus, protocolos previos a llamadas, fuentes críticas del consumidor, trazas, respuestas, ledger y los tarballs exactos. `MANIFEST.json` permite verificar sus archivos.
- La auditoría aislada de los paquetes empacados inspeccionó 2144 archivos y pasó. La auditoría global del checkout conserva fallos por artefactos locales anteriores; esta calificación no los oculta ni los elimina. La auditoría de términos externos no se activó en el staging de paquetes.
- Para activar un piloto desplegado falta una cohorte publicada con versión nueva compatible, actualizar y verificar el lock del consumidor, conectar fuentes reales autorizadas y completar los controles de release. El flag permanece apagado por defecto.
