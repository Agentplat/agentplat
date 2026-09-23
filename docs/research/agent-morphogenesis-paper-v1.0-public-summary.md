# Agent Morphogenesis: resultados y límites del paper v1.0

Esta página resume qué evidencia presenta el preprint v1.0 *Governed Agent Morphogenesis: Runtime Organizational Reconfiguration with Bounded Authority and Causal Continuity*, y qué conclusiones no permite extraer. Los resultados y la traza ampliada se publican en la rama de código fuente junto con los artefactos de investigación. El protocolo coordina cambios organizacionales entre subsistemas con autoridad propia; la cabeza de Morphogenesis registra una sucesión aceptada, pero no convierte esos cambios en una transacción global atómica.

## Resultados principales

La evaluación de misión comparó cuatro condiciones sobre ocho fases de trabajo, cuatro formas de demanda y tres escenarios de fallo. Se ejecutaron 32 semillas por celda de demanda/fallo, emparejadas entre condiciones: **1.536 ejecuciones** en 48 celdas de diseño.

| Condición | Informes correctos | Reservas duplicadas | Unidades medias de rol por fase |
| --- | ---: | ---: | ---: |
| Organización fija | 384/384 | 0 | 12,0 |
| Adaptación mínima | 320/384 | 192 | 12,0 |
| Workflow durable | 384/384 | 0 | 9,5 |
| Morphogenesis | 384/384 | 0 | 9,5 |

Los dos controladores durables coincidieron en los resultados correctos y las reservas. Cuando la reconciliación estuvo temporalmente indisponible, ambos bloquearon el avance afectado y completaron los informes después de recuperarla. La adaptación mínima reintentó con identidades nuevas: produjo reservas duplicadas y, en 64 casos de demanda decreciente, agotó el presupuesto antes de completar el informe.

Esto respalda la utilidad de controles durables frente a la adaptación mínima ensayada; **no muestra superioridad única de Morphogenesis frente a un workflow durable competente**. La ventaja de reservar capacidad depende de la forma de demanda: una previsión falsa también puede hacer que la adaptación consuma más recursos que la organización fija.

## Qué pasa con una propuesta perdedora

En la traza de competencia, dos propuestas aprobadas activan sus Teams y obtienen efectos de Work antes de intentar avanzar desde la misma época. Solo una gana la comparación y actualiza la cabeza de Morphogenesis. El efecto de la otra sigue siendo real: el sistema recupera operaciones con sus IDs originales, cerca la autoridad de Work, espera a que el trabajo admitido termine, desconecta o retira los recursos y libera el presupuesto. Después registra un recibo terminal separado como `superseded`; no emite un recibo de activación normal para la perdedora.

La secuencia muestra por qué “una sola cabeza ganadora” no significa “una única transición atómica”. Un efecto con resultado desconocido debe reconciliarse con el propietario; un timeout no demuestra que la operación no ocurrió. Si no se puede determinar el estado, el avance se detiene.

## Alcance y supuestos de la evidencia

- La matriz de misión es una evaluación local, determinista y de grilla finita con catálogo pequeño, autoridades de prueba y fallos prescritos. Sus 1.536 ejecuciones no son 1.536 pruebas independientes de seguridad general.
- La matriz de autoridad probó nueve casos prescritos en cuatro controladores. Los rechazos observados no estiman probabilidades de ataque; las propuestas no las generó un LLM.
- El modelo TLA+ exploró dos propuestas, un predecesor, una identidad de efecto y como máximo un trabajo admitido por propuesta. Encontró 260 estados distintos bajo sus supuestos de equidad y produjo contraejemplos para variantes debilitadas. No es una prueba de refinamiento del runtime TypeScript ni una demostración irrestricta.
- La seguridad condicional depende de que cada propietario autentique y valide alcance, época, mandato, recursos y cercas al admitir sus efectos; de IDs durables e idempotentes; de almacenamiento con CAS; y de manejo de tiempo/expiración declarado. Si falta disponibilidad del propietario o su estado es indeterminado, la seguridad puede requerir bloquear el progreso.
- No se evaluaron calidad de propuestas LLM, despliegue multi-tenant, dominios físicos independientes, carga de producción prolongada ni economía típica. Los resultados no prueban mejora organizacional, optimalidad global ni preparación general para producción.

## Reproducir y consultar

El artefacto congelado v0.5 contiene los datos, scripts y verificadores que sustentan los resultados retenidos en el preprint v1.0: [manuscrito](./morphogenesis-paper-v0.5/manuscript.md), [índice](./morphogenesis-paper-v0.5/README.md). La [especificación V1](../specification/agent-morphogenesis-v1.md) define el perfil base; los perfiles V2–V8 son extensiones optativas con sus propios límites y evidencia.
