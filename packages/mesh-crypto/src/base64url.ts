const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const base64UrlAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 3) {
    const first = bytes[offset];
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    encoded += base64UrlAlphabet[first >> 2];
    encoded += base64UrlAlphabet[((first & 0b11) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      encoded +=
        base64UrlAlphabet[((second & 0b1111) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) {
      encoded += base64UrlAlphabet[third & 0b111111];
    }
  }
  return encoded;
}

export function decodeBase64Url(
  value: string,
  expectedBytes: number
): Uint8Array | undefined {
  if (!base64UrlPattern.test(value)) return undefined;
  const remainder = value.length % 4;
  if (remainder === 1) return undefined;
  if (Math.floor((value.length * 6) / 8) !== expectedBytes) return undefined;

  const decoded = new Uint8Array(expectedBytes);
  let accumulator = 0;
  let availableBits = 0;
  let outputOffset = 0;
  for (const character of value) {
    const index = base64UrlAlphabet.indexOf(character);
    if (index < 0) return undefined;
    accumulator = (accumulator << 6) | index;
    availableBits += 6;
    if (availableBits >= 8) {
      availableBits -= 8;
      decoded[outputOffset] = (accumulator >> availableBits) & 0xff;
      outputOffset += 1;
      accumulator &= (1 << availableBits) - 1;
    }
  }
  if (outputOffset !== expectedBytes || accumulator !== 0) return undefined;
  return decoded;
}
