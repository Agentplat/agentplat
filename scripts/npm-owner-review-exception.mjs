import assert from "node:assert/strict";

// Explicit owner authorization for Beta 8 on 2026-09-12. A future release
// must restore independent review and remove the environment exception flags.
export const NPM_OWNER_REVIEW_EXCEPTION = Object.freeze({
  releaseVersion: "0.3.0-beta.8",
  ownerLogin: "douglas-grishen",
  scope: "all",
  distTag: "next",
});

export function matchesOwnerReviewException({
  releaseVersion,
  scope,
  distTag,
  ownerReviewVersion,
  ownerReviewLogin,
}) {
  const expected = NPM_OWNER_REVIEW_EXCEPTION;
  return (
    releaseVersion === expected.releaseVersion &&
    scope === expected.scope &&
    distTag === expected.distTag &&
    ownerReviewVersion === expected.releaseVersion &&
    ownerReviewLogin === expected.ownerLogin
  );
}

export function assertStageReviewPolicy({ manifest, environment }) {
  const ownerReviewVersion =
    environment.AGENTPLAT_NPM_OWNER_REVIEW_VERSION || undefined;
  const ownerReviewLogin =
    environment.AGENTPLAT_NPM_OWNER_REVIEW_LOGIN || undefined;
  if (ownerReviewVersion === undefined && ownerReviewLogin === undefined)
    return;
  assert.ok(
    matchesOwnerReviewException({
      releaseVersion: manifest.releaseVersion,
      scope: manifest.scope,
      distTag: manifest.distTag,
      ownerReviewVersion,
      ownerReviewLogin,
    }),
    "Owner review exception applies only to the approved Beta 8 all/next release",
  );
  assert.equal(
    environment.GITHUB_ACTOR,
    NPM_OWNER_REVIEW_EXCEPTION.ownerLogin,
    "Only the authorized owner may initiate this self-reviewed release",
  );
  if (environment.GITHUB_TRIGGERING_ACTOR !== undefined) {
    assert.equal(
      environment.GITHUB_TRIGGERING_ACTOR,
      NPM_OWNER_REVIEW_EXCEPTION.ownerLogin,
      "Only the authorized owner may rerun this self-reviewed release",
    );
  }
}
