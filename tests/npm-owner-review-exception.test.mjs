import test from "node:test";
import assert from "node:assert/strict";
import { assertStageReviewPolicy } from "../scripts/npm-owner-review-exception.mjs";
const fixture = () => ({
  manifest: { releaseVersion: "0.3.0-beta.8", scope: "all", distTag: "next" },
  environment: {
    AGENTPLAT_NPM_OWNER_REVIEW_VERSION: "0.3.0-beta.8",
    AGENTPLAT_NPM_OWNER_REVIEW_LOGIN: "douglas-grishen",
    GITHUB_ACTOR: "douglas-grishen",
    GITHUB_TRIGGERING_ACTOR: "douglas-grishen",
  },
});
test("owner exception accepts only the explicitly authorized release initiator", () => {
  assert.doesNotThrow(() => assertStageReviewPolicy(fixture()));
});
test("owner exception cannot authorize other versions, scopes, tags or actors", () => {
  for (const mutate of [
    (x) => (x.manifest.releaseVersion = "0.3.0-beta.9"),
    (x) => (x.manifest.releaseVersion = "0.3.0-beta.7"),
    (x) => (x.manifest.scope = "public-consumer"),
    (x) => (x.manifest.distTag = "latest"),
    (x) => (x.environment.GITHUB_ACTOR = "other"),
    (x) => (x.environment.GITHUB_TRIGGERING_ACTOR = "other"),
    (x) => delete x.environment.AGENTPLAT_NPM_OWNER_REVIEW_LOGIN,
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => assertStageReviewPolicy(value));
  }
});
test("ordinary independent review remains available without exception flags", () => {
  assert.doesNotThrow(() =>
    assertStageReviewPolicy({
      manifest: { releaseVersion: "1.0.0" },
      environment: {},
    }),
  );
});

test("empty GitHub variable expansions preserve ordinary review", () => {
  assert.doesNotThrow(() =>
    assertStageReviewPolicy({
      manifest: { releaseVersion: "1.0.0" },
      environment: {
        AGENTPLAT_NPM_OWNER_REVIEW_VERSION: "",
        AGENTPLAT_NPM_OWNER_REVIEW_LOGIN: "",
      },
    }),
  );
});
