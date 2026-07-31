import type { JsonValue } from '@agentplat/core';
import type { ControlDigestDomainV1 } from './types.js';
import { sha256Hex } from './sha256.js';

const encoder = new TextEncoder();
const surrogate = /[\uD800-\uDFFF]/u;

function assertSafeString(value: string): void {
  if (surrogate.test(value)) {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (
          ++i >= value.length ||
          value.charCodeAt(i) < 0xdc00 ||
          value.charCodeAt(i) > 0xdfff
        )
          throw new TypeError('Unpaired surrogate is not canonical JSON');
      } else if (code >= 0xdc00 && code <= 0xdfff)
        throw new TypeError('Unpaired surrogate is not canonical JSON');
    }
  }
}

function canonical(value: unknown, seen: Set<object>): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      assertSafeString(value);
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value))
        throw new TypeError('Canonical JSON requires finite numbers');
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new TypeError('Canonical JSON contains a non-JSON value');
  }
  if (seen.has(value))
    throw new TypeError('Canonical JSON cannot contain cycles');
  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++)
      if (!Object.hasOwn(value, i))
        throw new TypeError('Canonical JSON cannot contain sparse arrays');
    result = `[${value.map((item) => canonical(item, seen)).join(',')}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError('Canonical JSON requires plain objects');
    if (Object.getOwnPropertySymbols(value).length)
      throw new TypeError('Canonical JSON cannot contain symbol keys');
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      assertSafeString(key);
      if (
        Object.getOwnPropertyDescriptor(value, key)?.get ||
        Object.getOwnPropertyDescriptor(value, key)?.set
      )
        throw new TypeError('Canonical JSON cannot contain accessors');
    }
    result = `{${keys.map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], seen)}`).join(',')}}`;
  }
  seen.delete(value);
  return result;
}

export function canonicalizeControlJsonV1(value: JsonValue): string {
  return canonical(value, new Set());
}
export function digestControlJsonV1(
  domain: ControlDigestDomainV1,
  value: JsonValue,
): string {
  return `sha256:${sha256Hex(encoder.encode(`agentplat.inference-control/${domain}/v1\0${canonicalizeControlJsonV1(value)}`))}`;
}
export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}
