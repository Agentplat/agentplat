import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** Derive metrics from recoverable traces. Verification must come from a domain assessor. */
export function evaluateRoomPlannerTraces(traces) {
  const variants = ["legacy", "selective", "planner"],
    groups = new Map();
  for (const t of traces) {
    if (
      !variants.includes(t.variant) ||
      typeof t.caseId !== "string" ||
      !Array.isArray(t.events) ||
      !Array.isArray(t.criteria) ||
      !t.criteria.length
    )
      throw Error("Invalid evaluation trace");
    const group = groups.get(t.caseId) ?? new Map();
    if (group.has(t.variant)) throw Error("Duplicate case/variant");
    group.set(t.variant, t);
    groups.set(t.caseId, group);
  }
  const rows = [];
  for (const [caseId, group] of groups) {
    if (group.size !== 3)
      throw Error("Each case needs legacy, selective and planner traces");
    const canonical = (value) =>
      Array.isArray(value)
        ? `[${value.map(canonical).join(",")}]`
        : value && typeof value === "object"
          ? `{${Object.keys(value)
              .sort()
              .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
              .join(",")}}`
          : JSON.stringify(value);
    const expected = canonical(group.get("legacy").configuration);
    for (const [variant, t] of group) {
      if (canonical(t.configuration) !== expected)
        throw Error("Compared configurations differ");
      if (
        JSON.stringify(t.criteria) !==
        JSON.stringify(group.get("legacy").criteria)
      )
        throw Error("Compared success criteria differ");
      const ids = new Set(),
        work = new Map(),
        effects = new Map();
      let costMicros = 0,
        inputTokens = 0,
        outputTokens = 0,
        humanInterventions = 0,
        claimed = false,
        start,
        finish,
        last = -Infinity;
      const verdicts = new Map();
      for (const e of t.events) {
        if (
          typeof e.id !== "string" ||
          ids.has(e.id) ||
          !Number.isFinite(e.atMs) ||
          e.atMs < last
        )
          throw Error("Invalid, repeated or reordered trace event");
        ids.add(e.id);
        last = e.atMs;
        if (e.kind === "started") start = e.atMs;
        else if (e.kind === "usage") {
          for (const key of ["costMicros", "inputTokens", "outputTokens"])
            if (!Number.isSafeInteger(e[key]) || e[key] < 0)
              throw Error("Missing cost or token evidence");
          costMicros += e.costMicros;
          inputTokens += e.inputTokens;
          outputTokens += e.outputTokens;
        } else if (e.kind === "human_intervention") humanInterventions++;
        else if (e.kind === "task_started") {
          if (!e.workKey || !e.attemptId)
            throw Error("Missing logical work identity");
          const attempts = work.get(e.workKey) ?? new Set();
          attempts.add(e.attemptId);
          work.set(e.workKey, attempts);
        } else if (e.kind === "effect_confirmed") {
          if (!e.operationId || !e.receiptId)
            throw Error("Missing effect identity");
          const receipts = effects.get(e.operationId) ?? new Set();
          receipts.add(e.receiptId);
          effects.set(e.operationId, receipts);
        } else if (e.kind === "criterion") {
          if (
            !t.criteria.includes(e.criterionId) ||
            !["met", "unmet", "unknown"].includes(e.verdict) ||
            !e.evidenceReference
          )
            throw Error("Unverifiable criterion verdict");
          verdicts.set(e.criterionId, e.verdict);
        } else if (e.kind === "completed") {
          claimed = true;
          finish = e.atMs;
        } else if (e.kind === "finished") finish = e.atMs;
        else throw Error("Unknown evaluation event");
      }
      if (start === undefined || finish === undefined || finish < start)
        throw Error("Incomplete timing evidence");
      const completed = t.criteria.every((id) => verdicts.get(id) === "met");
      rows.push({
        caseId,
        variant,
        completed,
        falseCompletion: claimed && !completed,
        humanInterventions,
        repeatedWorkAttempts: [...work.values()].reduce(
          (n, v) => n + Math.max(0, v.size - 1),
          0,
        ),
        duplicateEffects: [...effects.values()].reduce(
          (n, v) => n + Math.max(0, v.size - 1),
          0,
        ),
        durationMs: finish - start,
        costMicros,
        inputTokens,
        outputTokens,
      });
    }
  }
  return { schemaVersion: 1, rows };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.argv[2])
    throw Error("Usage: node scripts/evaluate-room-planner.mjs traces.json");
  console.log(
    JSON.stringify(
      evaluateRoomPlannerTraces(
        JSON.parse(await readFile(process.argv[2], "utf8")),
      ),
      null,
      2,
    ),
  );
}
