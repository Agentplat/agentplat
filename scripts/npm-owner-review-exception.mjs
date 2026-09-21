import assert from "node:assert/strict";

// Historical Beta 8 exception plus standing owner authorization (2026-09-21).
// Only owner-initiated runs may be approved automatically; other runs retain review.
export const NPM_OWNER_REVIEW_EXCEPTION = Object.freeze({
  releaseVersion: "0.3.0-beta.8",
  ownerLogin: "douglas-grishen",
  ownerId: 207043696,
  standingMode: "owner-initiated",
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
  if (ownerReviewVersion === expected.standingMode)
    return ownerReviewLogin === expected.ownerLogin &&
      typeof releaseVersion === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseVersion) &&
      ["all", "public-consumer"].includes(scope) && ["next", "latest"].includes(distTag);
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
    "Owner review exception must match the standing owner policy or historical Beta 8 approval",
  );
  if (ownerReviewVersion === NPM_OWNER_REVIEW_EXCEPTION.standingMode) return;
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

export function canOwnerApproveRelease({ actor, triggeringActor, viewer }) {
  return [actor, triggeringActor, viewer].every(person =>
    person?.login === NPM_OWNER_REVIEW_EXCEPTION.ownerLogin &&
    person?.id === NPM_OWNER_REVIEW_EXCEPTION.ownerId);
}
