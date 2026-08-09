import assert from "node:assert/strict";

import {
  collectiveQuorumDigestV1,
  collectiveQuorumMessageIdV1,
} from "@agentplat/collective-quorum/crypto";

const value = { kind: "mission", revision: 1 };
const digest = await collectiveQuorumDigestV1(value);
const messageId = await collectiveQuorumMessageIdV1("mission", value);

assert.match(digest, /^sha256:[0-9a-f]{64}$/u);
assert.equal(messageId, `quorum.mission.${digest.slice("sha256:".length, 47)}`);
process.stdout.write(
  `${JSON.stringify({ status: "passed", profile: "collective-quorum-crypto" })}\n`,
);
