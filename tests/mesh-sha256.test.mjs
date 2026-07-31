import assert from "node:assert/strict";
import test from "node:test";

import { sha256Base64Url } from "../packages/mesh/dist/sha256.js";

const encoder = new TextEncoder();

test("sha256Base64Url matches known SHA-256 base64url vectors", () => {
  for (const [input, expected] of [
    ["", "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU"],
    ["abc", "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0"],
    [
      "The quick brown fox jumps over the lazy dog",
      "16j7swfXgJRpypq8sAguT41WUeRtPNt2LQLQvzfJ5ZI",
    ],
  ]) {
    assert.equal(sha256Base64Url(encoder.encode(input)), expected);
  }
});

test("sha256Base64Url covers padding boundaries, binary bytes and many blocks", () => {
  for (const [name, input, expected] of [
    [
      "55-byte padding boundary",
      new Uint8Array(55),
      "AneUZs3sFjgR0HiBXGM_IZAUEwgUSQAvJKo-gPC4jvc",
    ],
    [
      "56-byte padding boundary",
      new Uint8Array(56),
      "1IF6pUl2KOfHfmtgYQcEK7ujEwiIxfR6N15heb54n7s",
    ],
    [
      "one full block",
      new Uint8Array(64),
      "9aX9QtFqIDAnmO9u0wmXm0MAPSMg2fDo6pgxqSdZ-0s",
    ],
    [
      "high-bit bytes",
      Uint8Array.from([0, 127, 128, 255]),
      "iSc9L3C5MoW7fdtLzuhqU0fKcVk1Ljy90gwj6dHlB9M",
    ],
    [
      "two non-uniform blocks",
      Uint8Array.from({ length: 128 }, (_, index) => index),
      "Rx-5Q6ojxRH29y-NFlLZyIDPo5KtgFAxIFR3A-VqK-U",
    ],
    [
      "one million bytes",
      encoder.encode("a".repeat(1_000_000)),
      "zcduXJkU-5KBocfihNc-Z_GAmkiklyAOBG05zMcRLNA",
    ],
  ]) {
    assert.equal(sha256Base64Url(input), expected, name);
  }
});
