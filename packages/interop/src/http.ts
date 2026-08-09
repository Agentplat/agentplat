import {
  type InteropEndpointManifestV1,
  type InteropRequestEnvelopeV1,
  type InteropResponseEnvelopeV1,
  type InteropTransportV1,
} from "./index.js";

/** Concrete JSON-over-HTTP transport with bounded response reads. */
export class HttpInteropTransportV1 implements InteropTransportV1 {
  readonly #baseUrl: URL;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #maximumResponseBytes: number;
  readonly #fetch: typeof fetch;
  constructor(
    readonly options: {
      readonly baseUrl: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly maximumResponseBytes?: number;
    },
  ) {
    this.#baseUrl = new URL(options.baseUrl);
    if (!["http:", "https:"].includes(this.#baseUrl.protocol))
      throw new TypeError("interop HTTP protocol is invalid");
    this.#headers = Object.freeze({ ...(options.headers ?? {}) });
    const maximumResponseBytes = options.maximumResponseBytes ?? 67_108_864;
    if (
      !Number.isSafeInteger(maximumResponseBytes) ||
      maximumResponseBytes < 1 ||
      maximumResponseBytes > 1_073_741_824
    )
      throw new RangeError("interop HTTP response limit is invalid");
    this.#maximumResponseBytes = maximumResponseBytes;
    this.#fetch = globalThis.fetch.bind(globalThis);
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        baseUrl: this.#baseUrl.toString(),
        headers: this.#headers,
        maximumResponseBytes: this.#maximumResponseBytes,
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }
  manifest(
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<InteropEndpointManifestV1> {
    return this.#request<InteropEndpointManifestV1>("manifest", {
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }
  exchange(
    request: InteropRequestEnvelopeV1,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<InteropResponseEnvelopeV1> {
    return this.#request<InteropResponseEnvelopeV1>("exchange", {
      method: "POST",
      ...(options.signal ? { signal: options.signal } : {}),
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  }
  async #request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.#fetch(new URL(path, this.#baseUrl), {
      ...init,
      headers: {
        ...this.#headers,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok)
      throw new Error(
        `interop HTTP request failed with status ${response.status}`,
      );
    const text = await boundedResponseText(
      response,
      this.#maximumResponseBytes,
    );
    return JSON.parse(text) as T;
  }
}

async function boundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maximumBytes)
    throw new RangeError("interop HTTP response exceeds configured limit");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("interop response limit exceeded");
      throw new RangeError("interop HTTP response exceeds configured limit");
    }
    output += decoder.decode(chunk.value, { stream: true });
  }
  return output + decoder.decode();
}
