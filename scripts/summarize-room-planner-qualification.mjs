import { readFile, writeFile, mkdir, cp, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const [webArg, developmentId, holdoutId] = process.argv.slice(2),
  root = process.cwd(),
  web = resolve(webArg ?? "");
if (
  !webArg ||
  ![developmentId, holdoutId].every((id) =>
    /^\d{4}-\d{2}-\d{2}-[a-z0-9]{8}$/.test(id ?? ""),
  )
)
  throw Error(
    "Usage: node scripts/summarize-room-planner-qualification.mjs GRISHEN_WEB DEVELOPMENT_ID HOLDOUT_ID",
  );
const preview = join(web, ".agentplat-preview"),
  campaigns = [];
for (const id of [developmentId, holdoutId]) {
  const dir = join(preview, "qualification", id),
    summary = JSON.parse(await readFile(join(dir, "summary.json"), "utf8")),
    details = JSON.parse(await readFile(join(dir, "details.json"), "utf8")),
    protocol = JSON.parse(await readFile(join(dir, "protocol.json"), "utf8")),
    cohort = JSON.parse(await readFile(join(dir, "cohort.json"), "utf8"));
  campaigns.push({ id, dir, summary, details, protocol, cohort });
}
const [development, holdout] = campaigns;
if (development.cohort.cohortDigest !== holdout.cohort.cohortDigest)
  throw Error("Candidate changed between development and holdout");
for (const path of [
  "src/server/room-planner.ts",
  "src/server/agent-runtime.ts",
  "src/server/planner-policy.mjs",
]) {
  if (
    development.protocol.consumer.find((f) => f.path === path)?.sha256 !==
    holdout.protocol.consumer.find((f) => f.path === path)?.sha256
  )
    throw Error("Product logic changed before holdout");
}
const budget = JSON.parse(
  await readFile(join(preview, "qualification-budget.json"), "utf8"),
);
const cost = budget.calls.reduce((n, c) => n + (c.costMicros ?? 0), 0),
  reserved = budget.calls
    .filter((c) => c.status !== "completed")
    .reduce((n, c) => n + c.upperMicros, 0);
if (cost + reserved > budget.limitMicros || budget.overrun)
  throw Error("Qualification budget boundary violated");
const gateRows = campaigns.flatMap((c) => c.summary.pilotGates ?? []);
const qualified =
  gateRows.length === 10 &&
  gateRows.every(
    (g) =>
      g.businessComplete &&
      g.governedComplete &&
      g.correctionContinuity &&
      g.directWhenRequested !== false,
  ) &&
  reserved === 0;
const sha = (value) => createHash("sha256").update(value).digest("hex"),
  cohort = holdout.cohort;
const stage = await mkdtemp(join(tmpdir(), "room-planner-evidence-")),
  archive = join(preview, "room-planner-qualification-20261015.tar.gz");
try {
  await mkdir(join(stage, "campaigns"));
  await mkdir(join(stage, "packages"));
  for (const c of campaigns)
    await cp(c.dir, join(stage, "campaigns", c.id), { recursive: true });
  for (const p of cohort.packages) {
    const bytes = await readFile(
      join(preview, "cohorts", cohort.cohortDigest, p.artifact),
    );
    if (sha(bytes) !== p.sha256)
      throw Error("Frozen package artifact mismatch");
    await writeFile(join(stage, "packages", p.artifact), bytes);
  }
  await writeFile(join(stage, "budget.json"), JSON.stringify(budget, null, 2));
  await writeFile(
    join(stage, "README.txt"),
    `Source qualification evidence, 2026-10-15.\nNo credentials are included. Sources and prompts are synthetic.\nCandidate digest: ${cohort.cohortDigest}\nCandidate distribution: source-only, not a published release.\nCampaigns include raw provider receipts, independently computed criteria, protocol and consumer snapshots.\nThe packages directory contains the exact locally qualified tarballs.\nNo external write effects, live web research or production-scale performance were qualified.\nBudget is shared across all diagnostic and final runs and must not be reset to rerun paid experiments.\n`,
  );
  execFileSync("python3", [
    "-c",
    `
import pathlib,hashlib,json,tarfile,gzip,sys,io
stage=pathlib.Path(sys.argv[1]);target=pathlib.Path(sys.argv[2]);entries=[]
for p in sorted(stage.rglob('*')):
 if p.is_file():entries.append({'path':str(p.relative_to(stage)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(stage/'MANIFEST.json').write_text(json.dumps(entries,indent=2))
with target.open('wb') as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as gz,tarfile.open(fileobj=gz,mode='w') as archive:
 for p in sorted(stage.rglob('*')):
  if not p.is_file():continue
  body=p.read_bytes();info=tarfile.TarInfo(str(p.relative_to(stage)));info.size=len(body);info.mode=0o644;info.mtime=0;archive.addfile(info,io.BytesIO(body))
`,
    stage,
    archive,
  ]);
} finally {
  await rm(stage, { recursive: true, force: true });
}
const archiveSha = sha(await readFile(archive));
await mkdir(join(root, "config"), { recursive: true });
const candidate = {
  schemaVersion: 1,
  profile: "agentplat-room-planner-source-pilot-v1",
  date: "2026-10-15",
  sourceHead: cohort.revision,
  dirtySource: cohort.dirty,
  cohortDigest: cohort.cohortDigest,
  distribution: "source-only",
  published: false,
  deploymentEnabled: false,
  qualifiedFor: qualified
    ? "controlled supplied-evidence pilot"
    : "not yet qualified",
  qualification: {
    developmentCampaignId: developmentId,
    holdoutCampaignId: holdoutId,
    sourceBoundary: holdout.summary.evidenceBoundary,
    archiveFile: "room-planner-qualification-20261015.tar.gz",
    archiveSha256: archiveSha,
    accountedCostMicros: cost,
    budgetLimitMicros: budget.limitMicros,
    reservedMicros: reserved,
  },
  packages: cohort.packages.map((p) => ({
    name: p.name,
    version: p.version,
    artifact: p.artifact,
    sha256: p.sha256,
  })),
};
await writeFile(
  join(root, "config/room-planner-pilot-candidate-v1.json"),
  JSON.stringify(candidate, null, 2) + "\n",
);
const median = (values) => {
  const a = values.toSorted((a, b) => a - b);
  return a.length % 2
    ? a[(a.length - 1) / 2]
    : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const table = (c) => {
  const rows = c.summary.metrics.rows;
  return [
    "| Estrategia | Cumplimiento | Finalizaciones falsas | Llamadas | Costo USD | Mediana s |",
    "|---|---:|---:|---:|---:|---:|",
    ...["legacy", "selective", "planner"].map((variant) => {
      const r = rows.filter((r) => r.variant === variant),
        calls = c.details.filter((d) => d.variant === variant).length;
      const callCount = budget.calls.filter(
        (call) => call.campaignId === c.id && call.variant === variant,
      ).length;
      return `| ${variant} | ${r.filter((r) => r.completed).length}/${calls} | ${r.filter((r) => r.falseCompletion).length} | ${callCount} | ${(r.reduce((n, r) => n + r.costMicros, 0) / 1e6).toFixed(6)} | ${(median(r.map((r) => r.durationMs)) / 1000).toFixed(2)} |`;
    }),
  ].join("\n");
};
const consumerHash = holdout.protocol.consumer.find(
  (f) => f.path === "src/server/room-planner.ts",
).sha256;
const report = `# Calificación del AgentPlat Planner — 15 de octubre de 2026

Resultado: **${qualified ? "apto para un piloto controlado sobre evidencia suministrada" : "no apto todavía para el piloto definido"}**. Esta decisión no autoriza publicación ni despliegue y no establece fiabilidad general, investigación web abierta ni preparación operacional a escala.

## Candidato y método

- Cohorte de fuente: \`${cohort.cohortDigest}\`, ${cohort.packages.length} paquetes; versiones declaradas ${[...new Set(cohort.packages.map((p) => p.version))].join(", ")}. Estos bytes nuevos no se presentan como una versión ya publicada.
- HEAD de referencia: \`${cohort.revision}\`, con cambios locales. Los hashes de los tarballs y de cada archivo instalado fijan el contenido ejecutado; HEAD por sí solo no lo identifica.
- Consumidor \`src/server/room-planner.ts\`: \`${consumerHash}\`. Este archivo y la configuración del modelo no cambiaron entre desarrollo y holdout.
- Modelo: \`${holdout.summary.model}\`; mismo corpus por caso, roles, permisos sin escrituras externas, límite de salida de 3.000 tokens y presupuesto de USD 0,50 por variante/caso, dentro del tope global de USD 5.
- Tarifas Standard verificadas en [OpenAI Docs](https://developers.openai.com/api/docs/pricing): USD 0,10/M de entrada, 0,01/M de entrada cacheada, 0,125/M de escritura de caché y 0,50/M de salida. El gasto se calcula desde el uso informado por la API; no es una conciliación de factura.
- Las variantes legacy y selective reproducen las estrategias de sesión por turnos y selección individual con los adaptadores reales del consumidor. Planner ejecuta la composición durable real en PostgreSQL. Esto no compara la latencia de una interfaz desplegada.
- El evaluador comprueba hechos tipados y fuentes contra datos del corpus, no contra una autoevaluación del modelo. Cuando el usuario pide revisión independiente, exige evidencia de que un segundo especialista la realizó. Para Planner exige además el cierre gobernado y, al corregir, un único objetivo con una nueva versión de informe.

## Comparación final

Desarrollo: ${development.details.filter((d) => d.variant === "planner").length} casos, campaña \`${development.id}\`.

${table(development)}

Holdout: ${holdout.details.filter((d) => d.variant === "planner").length} casos nuevos, campaña \`${holdout.id}\`. La lógica del producto quedó congelada antes de ejecutarlos.

${table(holdout)}

Las diferencias del routing selectivo se deben principalmente a la ausencia de una segunda revisión cuando se pidió explícitamente. No implican por sí mismas errores en los hechos calculados. El flujo legacy también puede satisfacer estos briefs mediante dos turnos; la evidencia no demuestra superioridad factual general del Planner. La coordinación durable añade costo y tiempo y debe reservarse para trabajo que necesita continuidad, seguimiento, versiones o revisión verificable.

## Fallo anterior y decisión del sucesor

El candidato anterior quedó **no apto**: en \`blind-two-eligible\` la recomendación y los hechos fueron correctos, pero la revisión rechazó enlaces junto a IDs de fuente. El motor conservó el objetivo en espera, sin autorizar un cierre. El [informe inicial](room-planner-qualification-20261015-initial-nogo.md), su manifiesto y el archivo \`room-planner-qualification-nogo-d9d4d897.tar.gz\` se preservan como diagnóstico.

El sucesor respeta el formato de citas pedido por el dueño y entrega los rechazos verificables al razonador. Una reparación automática debe producir trabajo y una nueva versión del informe; el mismo contenido no se vuelve a revisar para buscar otra respuesta. Tras tres versiones rechazadas se requiere intervención. Un resultado desconocido no dispara esa reparación. Una corrección del dueño que coincide con la revisión se reinterpreta contra el estado vigente, sin perderse ni superar un cambio de control.

${qualified ? "El sucesor satisface las diez puertas de esta evaluación: contenido, fuentes, revisión ejecutada, cierre gobernado, continuidad de correcciones y respuesta directa cuando corresponde. La habilitación sigue limitada a un piloto controlado sobre evidencia suministrada; los flags de despliegue permanecen apagados." : "El sucesor todavía no satisface todas las puertas. Sus resultados y bloqueos se conservan íntegros; no se habilita el piloto por una respuesta aparentemente correcta ni se flexibilizan los criterios para aprobarlo."}

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

Gasto de inferencia contabilizado de **todas** las corridas: **USD ${(cost / 1e6).toFixed(6)} de USD ${(budget.limitMicros / 1e6).toFixed(2)}**; reservas pendientes: USD ${(reserved / 1e6).toFixed(6)}. El ledger persiste entre procesos y no reinicia la autorización al repetir un ensayo.

Las tablas muestran una ejecución por caso y variante del candidato seleccionado; existen corridas diagnósticas previas que no se agregan como estimación estadística. No se establece significación estadística. Las fuentes son briefs sintéticos controlados: no se evaluaron conectores web reales, autenticidad de fuentes externas, memoria entre tareas ni iniciativa espontánea. El caso de desacuerdo suministra la objeción en el brief. Las correcciones humanas fueron guionadas; no se midió tiempo humano ni rescates operativos. No hubo exposición a escrituras externas, por lo que cero efectos duplicados no estima una tasa de duplicación real. La recuperación, los límites, la concurrencia y el rechazo de resultados obsoletos tienen pruebas funcionales separadas. Los holdouts anteriores se conservan como diagnósticos; el conjunto de esta tabla usa casos nuevos, definidos antes de sus llamadas y posteriores a la reparación del candidato inicial.

## Artefactos y siguiente límite

- Manifiesto revisable: [candidato de fuente](../../config/room-planner-pilot-candidate-v1.json).
- Archivo local bajo \`Admin/web/.agentplat-preview/room-planner-qualification-20261015.tar.gz\`; SHA-256: \`${archiveSha}\`. Incluye corpus, protocolos previos a llamadas, fuentes críticas del consumidor, trazas, respuestas, ledger y los tarballs exactos. \`MANIFEST.json\` permite verificar sus archivos.
- La auditoría aislada de los paquetes empacados inspeccionó ${cohort.audit?.scannedFiles ?? "los"} archivos y pasó. La auditoría global del checkout conserva fallos por artefactos locales anteriores; esta calificación no los oculta ni los elimina. La auditoría de términos externos no se activó en el staging de paquetes.
- Para activar un piloto desplegado falta una cohorte publicada con versión nueva compatible, actualizar y verificar el lock del consumidor, conectar fuentes reales autorizadas y completar los controles de release. El flag permanece apagado por defecto.
`;
await mkdir(join(root, "docs/research"), { recursive: true });
await writeFile(
  join(root, "docs/research/room-planner-qualification-20261015.md"),
  report,
);
console.log(
  JSON.stringify(
    {
      qualified,
      cohortDigest: cohort.cohortDigest,
      costUsd: cost / 1e6,
      archive,
      archiveSha256: archiveSha,
      report: "docs/research/room-planner-qualification-20261015.md",
    },
    null,
    2,
  ),
);
