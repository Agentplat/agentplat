import type { JsonValue } from "@agentplat/core";

import type { WorkflowDigestV1 } from "./v1-contracts.js";

const encoder = new TextEncoder();

export class WorkflowValidationErrorV1 extends TypeError {
  readonly name = "WorkflowValidationErrorV1";
}

export function canonicalizeWorkflowJsonV1(value: JsonValue): string {
  return canonical(value, new Set(), 0, { nodes: 0 });
}

export function digestWorkflowJsonV1(
  domain: string,
  value: JsonValue,
): WorkflowDigestV1 {
  token(domain, "digest domain");
  const bytes = encoder.encode(
    `agentplat.workflows/${domain}/v1\0${canonicalizeWorkflowJsonV1(value)}`,
  );
  if (bytes.byteLength > 1_048_576)
    throw new WorkflowValidationErrorV1("workflow digest input is too large");
  return `sha256:${sha256Hex(bytes)}`;
}

export function deepFreezeWorkflowV1<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === "object" && !seen.has(value as object)) {
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreezeWorkflowV1(child, seen);
    Object.freeze(value);
  }
  return value;
}

export function cloneWorkflowV1<T>(value: T): T {
  return structuredClone(value);
}

function canonical(
  value: unknown,
  seen: Set<object>,
  depth: number,
  counters: { nodes: number },
): string {
  if (depth > 32)
    throw new WorkflowValidationErrorV1("workflow JSON maximum depth exceeded");
  counters.nodes += 1;
  if (counters.nodes > 16_384)
    throw new WorkflowValidationErrorV1("workflow JSON maximum nodes exceeded");
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    assertUnicode(value, "workflow JSON string");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new WorkflowValidationErrorV1(
        "workflow JSON numbers must be finite",
      );
    if (Number.isInteger(value) && !Number.isSafeInteger(value))
      throw new WorkflowValidationErrorV1(
        "workflow JSON integers must be safe",
      );
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (!value || typeof value !== "object")
    throw new WorkflowValidationErrorV1(
      "workflow value contains a non-JSON value",
    );
  if (seen.has(value))
    throw new WorkflowValidationErrorV1("workflow JSON may not contain cycles");
  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    if (value.length > 4_096)
      throw new WorkflowValidationErrorV1(
        "workflow JSON maximum array items exceeded",
      );
    const names = Object.getOwnPropertyNames(value);
    if (
      Object.getOwnPropertySymbols(value).length > 0 ||
      names.length !== value.length + 1 ||
      !names.includes("length")
    )
      throw new WorkflowValidationErrorV1(
        "workflow JSON arrays must be dense data arrays",
      );
    result = `[${value
      .map((child) => canonical(child, seen, depth + 1, counters))
      .join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new WorkflowValidationErrorV1(
        "workflow JSON requires plain objects",
      );
    const keys = Object.getOwnPropertyNames(value).sort();
    if (keys.length > 256 || Object.getOwnPropertySymbols(value).length > 0)
      throw new WorkflowValidationErrorV1(
        "workflow JSON object shape is invalid",
      );
    result = `{${keys
      .map((key) => {
        assertUnicode(key, "workflow JSON key");
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
          !descriptor ||
          !descriptor.enumerable ||
          descriptor.get ||
          descriptor.set
        )
          throw new WorkflowValidationErrorV1(
            "workflow JSON requires enumerable data properties",
          );
        return `${JSON.stringify(key)}:${canonical(
          (value as Record<string, unknown>)[key],
          seen,
          depth + 1,
          counters,
        )}`;
      })
      .join(",")}}`;
  }
  seen.delete(value);
  return result;
}

function token(value: string, label: string): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new WorkflowValidationErrorV1(`${label} is invalid`);
}

function assertUnicode(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      index += 1;
      if (
        index >= value.length ||
        value.charCodeAt(index) < 0xdc00 ||
        value.charCodeAt(index) > 0xdfff
      )
        throw new WorkflowValidationErrorV1(
          `${label} contains an unpaired surrogate`,
        );
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new WorkflowValidationErrorV1(
        `${label} contains an unpaired surrogate`,
      );
    }
  }
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotateRight = (value: number, count: number): number =>
  (value >>> count) | (value << (32 - count));

function sha256Hex(bytes: Uint8Array): string {
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(
    paddedLength - 8,
    Math.floor(bitLength / 0x1_0000_0000),
    false,
  );
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  let a = 0x6a09e667;
  let b = 0xbb67ae85;
  let c = 0x3c6ef372;
  let d = 0xa54ff53a;
  let e = 0x510e527f;
  let f = 0x9b05688c;
  let g = 0x1f83d9ab;
  let h = 0x5be0cd19;
  const words = new Uint32Array(64);
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index += 1)
      words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15];
      const y = words[index - 2];
      words[index] =
        ((rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3)) +
          words[index - 16] +
          (rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10)) +
          words[index - 7]) >>>
        0;
    }
    let aa = a;
    let bb = b;
    let cc = c;
    let dd = d;
    let ee = e;
    let ff = f;
    let gg = g;
    let hh = h;
    for (let index = 0; index < 64; index += 1) {
      const first =
        (hh +
          (rotateRight(ee, 6) ^ rotateRight(ee, 11) ^ rotateRight(ee, 25)) +
          ((ee & ff) ^ (~ee & gg)) +
          SHA256_CONSTANTS[index] +
          words[index]) >>>
        0;
      const second =
        ((rotateRight(aa, 2) ^ rotateRight(aa, 13) ^ rotateRight(aa, 22)) +
          ((aa & bb) ^ (aa & cc) ^ (bb & cc))) >>>
        0;
      hh = gg;
      gg = ff;
      ff = ee;
      ee = (dd + first) >>> 0;
      dd = cc;
      cc = bb;
      bb = aa;
      aa = (first + second) >>> 0;
    }
    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
    e = (e + ee) >>> 0;
    f = (f + ff) >>> 0;
    g = (g + gg) >>> 0;
    h = (h + hh) >>> 0;
  }
  return [a, b, c, d, e, f, g, h]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}
