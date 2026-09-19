# Morphogenesis paper — internal draft v0.1

El [manuscrito en inglés](manuscript.md) desarrolla una contribución de sistemas: transformación organizacional con autoridad acotada, continuidad causal y recuperación explícita.

El alcance principal es V1/V2. V3–V8 aparecen como extensiones. No se ejecutaron experimentos nuevos ni se modificaron contratos, código o registros de evidencia para elaborar este borrador.

## Archivos

- [Manuscrito](manuscript.md): abstract, antecedentes, modelo, protocolo, propiedades condicionales, implementación, evidencia preliminar, evaluación propuesta y referencias.
- [Matriz de afirmaciones y evidencia](evidence-matrix.md): procedencia, límites y trabajo necesario para sostener cada afirmación.
- [Bibliografía BibTeX](references.bib): referencias externas iniciales y software.

La figura está escrita en Mermaid dentro del manuscrito y es editable. El borrador está en Markdown: aún no tiene maquetación editorial ni un número de páginas verificado. El objetivo de 8–10 páginas deberá ajustarse al formato elegido.

## Decisiones editoriales adoptadas

1. Presentar una composición de mecanismos existentes y explicitar la contribución candidata, sin afirmar prioridad sobre toda la literatura.
2. Separar autorización de la transformación y autoridad de cada efecto.
3. No equiparar el CAS del morphology head con atomicidad distribuida: el código V1 activa el Team antes de actualizar ese head.
4. Describir los argumentos de seguridad como condicionales y pendientes de una correspondencia formal completa con el código.
5. Mantener las cifras históricas asociadas a sus propios commits y clases de evidencia.
6. No asignar autores, afiliaciones ni una conferencia sin confirmación de las personas responsables.

## Para la siguiente versión

- Completar la comparación con middleware organizacional, reconfiguración y verificación en runtime leyendo textos completos y versiones fijas.
- Convertir los predicados del modelo en obligaciones verificables para cada transición y adapter; revisar carreras entre activación de Team y commit de morfología.
- Congelar una revisión reproducible y verificar los bundles originales antes de promover cifras a resultados publicables.
- Implementar el harness comparativo, ejecutar un piloto y registrar tamaño muestral, fallos, exclusiones y análisis antes de la campaña confirmatoria.
- Confirmar autoría y formato de circulación; preparar PDF cuando el texto y la presentación editorial estén acordados.

Estos pendientes no impiden revisar el argumento completo de esta primera versión. Sí delimitan lo que falta para presentarla como paper empírico terminado.
