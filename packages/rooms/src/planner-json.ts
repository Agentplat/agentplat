import { AgentPlatError } from "@agentplat/core";

/** Canonical JSON comparison, independent of object key insertion order. */
export function canonicalPlannerJson(value: unknown): string {
  const seen = new Set<object>();
  let nodes = 0;
  const canonical = (v: unknown, depth: number): string => {
    if (++nodes > 1_000_000 || depth > 64)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Event JSON exceeds structural limits",
      );
    if (v === null || typeof v === "string" || typeof v === "boolean")
      return JSON.stringify(v);
    if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
    if (
      typeof v === "object" &&
      v &&
      (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype)
    ) {
      if (seen.has(v))
        throw new AgentPlatError("VALIDATION_ERROR", "Cyclic event JSON");
      seen.add(v);
      const result = Array.isArray(v)
        ? `[${v.map((x) => canonical(x, depth + 1)).join(",")}]`
        : `{${Object.keys(v)
            .sort()
            .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
            .map(
              (k) =>
                `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k], depth + 1)}`,
            )
            .join(",")}}`;
      seen.delete(v);
      return result;
    }
    throw new AgentPlatError("VALIDATION_ERROR", "Expected finite JSON data");
  };
  return canonical(value, 0);
}
