import {
  formatJsonPath,
  isWellFormedUnicode,
  type StrictJsonLimits,
} from './strict-json.js';

export type CanonicalJsonResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly bytes: Uint8Array;
    }
  | {
      readonly ok: false;
      readonly code: 'invalid_json_value' | 'structural_limit_exceeded';
      readonly path: string;
    };

const utf8Encoder = new TextEncoder();

class CanonicalJsonFailure extends Error {
  constructor(
    readonly code: 'invalid_json_value' | 'structural_limit_exceeded',
    readonly path: string
  ) {
    super(code);
  }
}

export function canonicalizeJsonValue(
  input: unknown,
  limits: StrictJsonLimits,
  maximumOutputBytes: number
): CanonicalJsonResult {
  try {
    const serializer = new CanonicalJsonSerializer(limits, maximumOutputBytes);
    const value = serializer.serialize(input);
    const bytes = utf8Encoder.encode(value);
    if (bytes.byteLength > maximumOutputBytes) {
      return {
        ok: false,
        code: 'structural_limit_exceeded',
        path: '$',
      };
    }
    return { ok: true, value, bytes };
  } catch (error) {
    if (error instanceof CanonicalJsonFailure) {
      return {
        ok: false,
        code: error.code,
        path: error.path,
      };
    }
    return {
      ok: false,
      code: 'invalid_json_value',
      path: '$',
    };
  }
}

class CanonicalJsonSerializer {
  private totalObjectKeys = 0;
  private totalArrayItems = 0;
  private readonly ancestors = new Set<object>();

  constructor(
    private readonly limits: StrictJsonLimits,
    private readonly maximumOutputBytes: number
  ) {}

  serialize(input: unknown): string {
    return this.serializeValue(input, [], 0);
  }

  private serializeValue(
    value: unknown,
    path: readonly (string | number)[],
    depth: number
  ): string {
    if (value === null) return this.assertOutputSize('null', path);
    if (typeof value === 'boolean') {
      return this.assertOutputSize(value ? 'true' : 'false', path);
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return this.fail('invalid_json_value', path);
      }
      return this.assertOutputSize(JSON.stringify(value), path);
    }
    if (typeof value === 'string') {
      if (!isWellFormedUnicode(value)) {
        return this.fail('invalid_json_value', path);
      }
      if (
        utf8Encoder.encode(value).byteLength > this.limits.maximumStringBytes
      ) {
        return this.fail('structural_limit_exceeded', path);
      }
      return this.assertOutputSize(JSON.stringify(value), path);
    }
    if (typeof value !== 'object') {
      return this.fail('invalid_json_value', path);
    }
    if (this.ancestors.has(value)) {
      return this.fail('invalid_json_value', path);
    }
    const nextDepth = depth + 1;
    if (nextDepth > this.limits.maximumNestingDepth) {
      return this.fail('structural_limit_exceeded', path);
    }

    this.ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return this.serializeArray(value, path, nextDepth);
      }
      return this.serializeObject(value, path, nextDepth);
    } finally {
      this.ancestors.delete(value);
    }
  }

  private serializeArray(
    value: readonly unknown[],
    path: readonly (string | number)[],
    depth: number
  ): string {
    if (
      value.length > this.limits.maximumArrayItems ||
      this.totalArrayItems + value.length > this.limits.maximumTotalArrayItems
    ) {
      return this.fail('structural_limit_exceeded', path);
    }
    if (
      Object.getOwnPropertySymbols(value).length > 0 ||
      Object.getOwnPropertyNames(value).length !== value.length + 1
    ) {
      return this.fail('invalid_json_value', path);
    }
    this.totalArrayItems += value.length;
    const serialized: string[] = [];
    let outputBytes = 2;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return this.fail('invalid_json_value', [...path, index]);
      }
      const item = this.serializeValue(
        descriptor.value,
        [...path, index],
        depth
      );
      outputBytes +=
        (index === 0 ? 0 : 1) + utf8Encoder.encode(item).byteLength;
      if (outputBytes > this.maximumOutputBytes) {
        return this.fail('structural_limit_exceeded', path);
      }
      serialized.push(item);
    }
    return `[${serialized.join(',')}]`;
  }

  private serializeObject(
    value: object,
    path: readonly (string | number)[],
    depth: number
  ): string {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return this.fail('invalid_json_value', path);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      return this.fail('invalid_json_value', path);
    }

    const keys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).length !== keys.length) {
      return this.fail('invalid_json_value', path);
    }
    if (
      keys.length > this.limits.maximumObjectKeys ||
      this.totalObjectKeys + keys.length > this.limits.maximumTotalObjectKeys
    ) {
      return this.fail('structural_limit_exceeded', path);
    }
    this.totalObjectKeys += keys.length;
    keys.sort();

    const serialized: string[] = [];
    let outputBytes = 2;
    for (const key of keys) {
      const keyPath = [...path, key];
      if (
        !isWellFormedUnicode(key) ||
        utf8Encoder.encode(key).byteLength > this.limits.maximumStringBytes
      ) {
        return this.fail(
          isWellFormedUnicode(key)
            ? 'structural_limit_exceeded'
            : 'invalid_json_value',
          keyPath
        );
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return this.fail('invalid_json_value', keyPath);
      }
      const canonicalKey = JSON.stringify(key);
      const canonicalValue = this.serializeValue(
        descriptor.value,
        keyPath,
        depth
      );
      outputBytes +=
        (serialized.length === 0 ? 0 : 1) +
        utf8Encoder.encode(canonicalKey).byteLength +
        1 +
        utf8Encoder.encode(canonicalValue).byteLength;
      if (outputBytes > this.maximumOutputBytes) {
        return this.fail('structural_limit_exceeded', path);
      }
      serialized.push(`${canonicalKey}:${canonicalValue}`);
    }
    return `{${serialized.join(',')}}`;
  }

  private assertOutputSize(
    value: string,
    path: readonly (string | number)[]
  ): string {
    if (utf8Encoder.encode(value).byteLength > this.maximumOutputBytes) {
      return this.fail('structural_limit_exceeded', path);
    }
    return value;
  }

  private fail(
    code: 'invalid_json_value' | 'structural_limit_exceeded',
    path: readonly (string | number)[]
  ): never {
    throw new CanonicalJsonFailure(code, formatJsonPath(path));
  }
}
