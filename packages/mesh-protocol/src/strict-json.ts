export interface StrictJsonLimits {
  readonly maximumEnvelopeBytes: number;
  readonly maximumNestingDepth: number;
  readonly maximumTotalObjectKeys: number;
  readonly maximumObjectKeys: number;
  readonly maximumTotalArrayItems: number;
  readonly maximumArrayItems: number;
  readonly maximumStringBytes: number;
}

export type StrictJsonErrorCode =
  'invalid_json' | 'duplicate_object_key' | 'structural_limit_exceeded';

export type StrictJsonDocumentResult =
  | {
      readonly ok: true;
      readonly value: unknown;
      readonly payloadByteLength?: number;
    }
  | {
      readonly ok: false;
      readonly code: StrictJsonErrorCode;
      readonly path: string;
    };

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
});
const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const hexadecimalPattern = /^[0-9a-fA-F]{4}$/;

class StrictJsonFailure extends Error {
  constructor(
    readonly code: StrictJsonErrorCode,
    readonly path: string
  ) {
    super(code);
  }
}

export function parseStrictJsonDocument(
  input: string | Uint8Array,
  limits: StrictJsonLimits
): StrictJsonDocumentResult {
  let source: string;
  try {
    if (typeof input === 'string') {
      if (utf8Encoder.encode(input).byteLength > limits.maximumEnvelopeBytes) {
        return {
          ok: false,
          code: 'structural_limit_exceeded',
          path: '$',
        };
      }
      source = input;
    } else {
      if (input.byteLength > limits.maximumEnvelopeBytes) {
        return {
          ok: false,
          code: 'structural_limit_exceeded',
          path: '$',
        };
      }
      source = utf8Decoder.decode(input);
    }
  } catch {
    return {
      ok: false,
      code: 'invalid_json',
      path: '$',
    };
  }

  try {
    return new StrictJsonParser(source, limits).parse();
  } catch (error) {
    if (error instanceof StrictJsonFailure) {
      return {
        ok: false,
        code: error.code,
        path: error.path,
      };
    }
    return {
      ok: false,
      code: 'invalid_json',
      path: '$',
    };
  }
}

class StrictJsonParser {
  private index = 0;
  private totalObjectKeys = 0;
  private totalArrayItems = 0;
  private payloadByteLength: number | undefined;

  constructor(
    private readonly source: string,
    private readonly limits: StrictJsonLimits
  ) {}

  parse(): StrictJsonDocumentResult {
    this.skipWhitespace();
    const value = this.parseValue([], 0);
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      this.fail('invalid_json', []);
    }
    return {
      ok: true,
      value,
      ...(this.payloadByteLength === undefined
        ? {}
        : { payloadByteLength: this.payloadByteLength }),
    };
  }

  private parseValue(
    path: readonly (string | number)[],
    depth: number
  ): unknown {
    const character = this.source[this.index];
    if (character === '{') return this.parseObject(path, depth + 1);
    if (character === '[') return this.parseArray(path, depth + 1);
    if (character === '"') return this.parseString(path);
    if (character === 't') return this.parseLiteral('true', true, path);
    if (character === 'f') return this.parseLiteral('false', false, path);
    if (character === 'n') return this.parseLiteral('null', null, path);
    if (character === '-' || isDigit(character)) {
      return this.parseNumber(path);
    }
    return this.fail('invalid_json', path);
  }

  private parseObject(
    path: readonly (string | number)[],
    depth: number
  ): Record<string, unknown> {
    this.assertDepth(depth, path);
    this.index += 1;
    this.skipWhitespace();

    const result: Record<string, unknown> = Object.create(null);
    const keys = new Set<string>();
    let objectKeyCount = 0;
    if (this.source[this.index] === '}') {
      this.index += 1;
      return result;
    }

    while (this.index < this.source.length) {
      if (this.source[this.index] !== '"') {
        return this.fail('invalid_json', path);
      }
      const key = this.parseString(path);
      const keyPath = [...path, key];
      if (keys.has(key)) {
        return this.fail('duplicate_object_key', keyPath);
      }
      keys.add(key);
      objectKeyCount += 1;
      this.totalObjectKeys += 1;
      if (
        objectKeyCount > this.limits.maximumObjectKeys ||
        this.totalObjectKeys > this.limits.maximumTotalObjectKeys
      ) {
        return this.fail('structural_limit_exceeded', keyPath);
      }

      this.skipWhitespace();
      if (this.source[this.index] !== ':') {
        return this.fail('invalid_json', keyPath);
      }
      this.index += 1;
      this.skipWhitespace();
      const valueStart = this.index;
      result[key] = this.parseValue(keyPath, depth);
      const valueEnd = this.index;
      if (depth === 1 && key === 'payload') {
        this.payloadByteLength = utf8Encoder.encode(
          this.source.slice(valueStart, valueEnd)
        ).byteLength;
      }
      this.skipWhitespace();

      const delimiter = this.source[this.index];
      if (delimiter === '}') {
        this.index += 1;
        return result;
      }
      if (delimiter !== ',') {
        return this.fail('invalid_json', path);
      }
      this.index += 1;
      this.skipWhitespace();
    }
    return this.fail('invalid_json', path);
  }

  private parseArray(
    path: readonly (string | number)[],
    depth: number
  ): unknown[] {
    this.assertDepth(depth, path);
    this.index += 1;
    this.skipWhitespace();

    const result: unknown[] = [];
    if (this.source[this.index] === ']') {
      this.index += 1;
      return result;
    }

    while (this.index < this.source.length) {
      const itemPath = [...path, result.length];
      if (
        result.length + 1 > this.limits.maximumArrayItems ||
        this.totalArrayItems + 1 > this.limits.maximumTotalArrayItems
      ) {
        return this.fail('structural_limit_exceeded', itemPath);
      }
      this.totalArrayItems += 1;
      result.push(this.parseValue(itemPath, depth));
      this.skipWhitespace();

      const delimiter = this.source[this.index];
      if (delimiter === ']') {
        this.index += 1;
        return result;
      }
      if (delimiter !== ',') {
        return this.fail('invalid_json', path);
      }
      this.index += 1;
      this.skipWhitespace();
    }
    return this.fail('invalid_json', path);
  }

  private parseString(path: readonly (string | number)[]): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code === 0x22) {
        this.index += 1;
        const raw = this.source.slice(start, this.index);
        let value: string;
        try {
          value = JSON.parse(raw) as string;
        } catch {
          return this.fail('invalid_json', path);
        }
        if (
          !isWellFormedUnicode(value) ||
          utf8Encoder.encode(value).byteLength > this.limits.maximumStringBytes
        ) {
          return this.fail(
            isWellFormedUnicode(value)
              ? 'structural_limit_exceeded'
              : 'invalid_json',
            path
          );
        }
        return value;
      }
      if (code <= 0x1f) {
        return this.fail('invalid_json', path);
      }
      if (code === 0x5c) {
        this.index += 1;
        const escape = this.source[this.index];
        if (escape === 'u') {
          const hexadecimal = this.source.slice(this.index + 1, this.index + 5);
          if (!hexadecimalPattern.test(hexadecimal)) {
            return this.fail('invalid_json', path);
          }
          this.index += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escape ?? '')) {
          return this.fail('invalid_json', path);
        }
      }
      this.index += 1;
    }
    return this.fail('invalid_json', path);
  }

  private parseNumber(path: readonly (string | number)[]): number {
    numberPattern.lastIndex = this.index;
    const match = numberPattern.exec(this.source);
    if (!match) return this.fail('invalid_json', path);
    this.index = numberPattern.lastIndex;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      return this.fail('invalid_json', path);
    }
    return value;
  }

  private parseLiteral<T>(
    token: string,
    value: T,
    path: readonly (string | number)[]
  ): T {
    if (this.source.slice(this.index, this.index + token.length) !== token) {
      return this.fail('invalid_json', path);
    }
    this.index += token.length;
    return value;
  }

  private assertDepth(depth: number, path: readonly (string | number)[]): void {
    if (depth > this.limits.maximumNestingDepth) {
      this.fail('structural_limit_exceeded', path);
    }
  }

  private skipWhitespace(): void {
    while (
      this.source[this.index] === ' ' ||
      this.source[this.index] === '\n' ||
      this.source[this.index] === '\r' ||
      this.source[this.index] === '\t'
    ) {
      this.index += 1;
    }
  }

  private fail(
    code: StrictJsonErrorCode,
    path: readonly (string | number)[]
  ): never {
    throw new StrictJsonFailure(code, formatJsonPath(path));
  }
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9';
}

export function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) return false;
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

export function formatJsonPath(path: readonly (string | number)[]): string {
  let formatted = '$';
  for (const part of path) {
    formatted +=
      typeof part === 'number' ? `[${part}]` : `[${JSON.stringify(part)}]`;
    if (formatted.length > 256) return truncatePath(formatted);
  }
  return formatted;
}

function truncatePath(path: string): string {
  let end = 253;
  const finalCodeUnit = path.charCodeAt(end - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) end -= 1;
  return `${path.slice(0, end)}...`;
}
