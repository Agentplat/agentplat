const SHA256_INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_ROUND_CONSTANTS = new Uint32Array([
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

const BASE64_URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Computes a SHA-256 digest and encodes it as unpadded base64url. */
export function sha256Base64Url(input: Uint8Array): string {
  const bitLength = input.byteLength * 8;
  const paddedLength = Math.ceil((input.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.byteLength] = 0x80;

  const lengthOffset = paddedLength - 8;
  const highBits = Math.floor(bitLength / 0x1_0000_0000);
  const lowBits = bitLength >>> 0;
  padded[lengthOffset] = highBits >>> 24;
  padded[lengthOffset + 1] = highBits >>> 16;
  padded[lengthOffset + 2] = highBits >>> 8;
  padded[lengthOffset + 3] = highBits;
  padded[lengthOffset + 4] = lowBits >>> 24;
  padded[lengthOffset + 5] = lowBits >>> 16;
  padded[lengthOffset + 6] = lowBits >>> 8;
  padded[lengthOffset + 7] = lowBits;

  const hash = new Uint32Array(SHA256_INITIAL_HASH);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byteOffset = offset + index * 4;
      words[index] =
        (padded[byteOffset] << 24) |
        (padded[byteOffset + 1] << 16) |
        (padded[byteOffset + 2] << 8) |
        padded[byteOffset + 3];
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 =
        ((previous15 >>> 7) | (previous15 << 25)) ^
        ((previous15 >>> 18) | (previous15 << 14)) ^
        (previous15 >>> 3);
      const sigma1 =
        ((previous2 >>> 17) | (previous2 << 15)) ^
        ((previous2 >>> 19) | (previous2 << 13)) ^
        (previous2 >>> 10);
      words[index] =
        (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const choice = (e & f) ^ (~e & g);
      const temp1 =
        (h + sum1 + choice + SHA256_ROUND_CONSTANTS[index] + words[index]) >>>
        0;
      const sum0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  for (let index = 0; index < hash.length; index += 1) {
    const word = hash[index];
    const byteOffset = index * 4;
    digest[byteOffset] = word >>> 24;
    digest[byteOffset + 1] = word >>> 16;
    digest[byteOffset + 2] = word >>> 8;
    digest[byteOffset + 3] = word;
  }
  return base64Url(digest);
}

function base64Url(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const value =
      (bytes[index] << 16) |
      ((bytes[index + 1] ?? 0) << 8) |
      (bytes[index + 2] ?? 0);
    encoded += BASE64_URL_ALPHABET[(value >>> 18) & 0x3f];
    encoded += BASE64_URL_ALPHABET[(value >>> 12) & 0x3f];
    if (index + 1 < bytes.length)
      encoded += BASE64_URL_ALPHABET[(value >>> 6) & 0x3f];
    if (index + 2 < bytes.length) encoded += BASE64_URL_ALPHABET[value & 0x3f];
  }
  return encoded;
}
