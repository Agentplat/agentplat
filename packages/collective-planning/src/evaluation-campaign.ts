import type { JsonValue } from "@agentplat/core";

import { deepFreezePlanning, digestPlanningJsonV1 } from "./canonical.js";
import type { PlanningDigestV1, PlanningJson } from "./contracts.js";
import {
  assertPlanningDigest,
  assertPlanningIdentifier,
  assertPlanningSafeInteger,
  assertPlanningToken,
} from "./validation.js";

export const COLLECTIVE_EVALUATION_CAMPAIGN_SCHEMA_VERSION_V1 = 1 as const;

export const COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1 =
  "beta3.paired-resilience.normative.v1" as const;
export const COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1 =
  "beta3.paired-resilience.preflight.v1" as const;

export type CollectiveEvaluationCampaignProfileV1 =
  | typeof COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1
  | typeof COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1;

export const COLLECTIVE_EVALUATION_CAMPAIGN_SCALES_V1 = Object.freeze([
  50, 100, 250, 500,
] as const);
export const COLLECTIVE_EVALUATION_CAMPAIGN_STRATA_V1 = Object.freeze([
  "nominal",
  "benign",
  "adversarial",
  "mixed",
] as const);
export const COLLECTIVE_EVALUATION_CAMPAIGN_RUNNERS_V1 = Object.freeze([
  "adaptive_collective",
  "centralized_planner",
] as const);

export type CollectiveEvaluationCampaignScaleV1 =
  (typeof COLLECTIVE_EVALUATION_CAMPAIGN_SCALES_V1)[number];
export type CollectiveEvaluationCampaignStratumV1 =
  (typeof COLLECTIVE_EVALUATION_CAMPAIGN_STRATA_V1)[number];
export type CollectiveEvaluationCampaignRunnerV1 =
  (typeof COLLECTIVE_EVALUATION_CAMPAIGN_RUNNERS_V1)[number];

export interface CollectiveEvaluationCampaignCellV1 {
  readonly schemaVersion: 1;
  readonly cellId: string;
  readonly peerCount: CollectiveEvaluationCampaignScaleV1;
  readonly stratum: CollectiveEvaluationCampaignStratumV1;
  readonly seed: number;
  /** Exact per-sample ceiling fixed by the registered scale row. */
  readonly maximumInteractions: number;
  /** Binds topology, scale budget, stratum and registered fault families. */
  readonly scaleConfigurationDigest: PlanningDigestV1;
  readonly adaptiveDefinitionDigest: PlanningDigestV1;
  readonly centralizedDefinitionDigest: PlanningDigestV1;
  readonly faultPlanDigest: PlanningDigestV1;
  readonly faultMatrixBindingDigest: PlanningDigestV1;
}

export interface CollectiveEvaluationCampaignRegistrationV1 {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly profile: CollectiveEvaluationCampaignProfileV1;
  readonly sourceDigest: PlanningDigestV1;
  readonly packageDigest: PlanningDigestV1;
  readonly fixtureManifestDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly environmentDigest: PlanningDigestV1;
  readonly observationPolicyDigest: PlanningDigestV1;
  readonly monitorDigest: PlanningDigestV1;
  readonly hiddenCanaryDigest: PlanningDigestV1;
  readonly runners: readonly ["adaptive_collective", "centralized_planner"];
  readonly maximumInteractions: number;
  readonly cells: readonly CollectiveEvaluationCampaignCellV1[];
  readonly registrationDigest: PlanningDigestV1;
}

export interface CollectiveEvaluationCampaignManifestEntryV1 {
  readonly schemaVersion: 1;
  readonly cellId: string;
  readonly status: "success" | "failure";
  readonly reasonCode: string | null;
  readonly adaptiveResultDigest: PlanningDigestV1 | null;
  readonly centralizedResultDigest: PlanningDigestV1 | null;
  readonly adaptiveTraceDigest: PlanningDigestV1 | null;
  readonly centralizedTraceDigest: PlanningDigestV1 | null;
  readonly adaptiveLedgerDigest: PlanningDigestV1 | null;
  readonly centralizedLedgerDigest: PlanningDigestV1 | null;
  readonly fairnessDigest: PlanningDigestV1 | null;
  readonly adaptiveCampaignEvidenceDigest: PlanningDigestV1 | null;
  readonly centralizedCampaignEvidenceDigest: PlanningDigestV1 | null;
}

export interface CollectiveEvaluationCampaignManifestV1 {
  readonly schemaVersion: 1;
  readonly registrationDigest: PlanningDigestV1;
  readonly entries: readonly CollectiveEvaluationCampaignManifestEntryV1[];
  readonly manifestDigest: PlanningDigestV1;
}

const registrationBodyKeys = [
  "schemaVersion",
  "campaignId",
  "profile",
  "sourceDigest",
  "packageDigest",
  "fixtureManifestDigest",
  "policyDigest",
  "environmentDigest",
  "observationPolicyDigest",
  "monitorDigest",
  "hiddenCanaryDigest",
  "runners",
  "maximumInteractions",
  "cells",
] as const;
const registrationKeys = [
  ...registrationBodyKeys,
  "registrationDigest",
] as const;
const cellKeys = [
  "schemaVersion",
  "cellId",
  "peerCount",
  "stratum",
  "seed",
  "maximumInteractions",
  "scaleConfigurationDigest",
  "adaptiveDefinitionDigest",
  "centralizedDefinitionDigest",
  "faultPlanDigest",
  "faultMatrixBindingDigest",
] as const;
const manifestEntryKeys = [
  "schemaVersion",
  "cellId",
  "status",
  "reasonCode",
  "adaptiveResultDigest",
  "centralizedResultDigest",
  "adaptiveTraceDigest",
  "centralizedTraceDigest",
  "adaptiveLedgerDigest",
  "centralizedLedgerDigest",
  "fairnessDigest",
  "adaptiveCampaignEvidenceDigest",
  "centralizedCampaignEvidenceDigest",
] as const;
const manifestBodyKeys = [
  "schemaVersion",
  "registrationDigest",
  "entries",
] as const;
const manifestKeys = [...manifestBodyKeys, "manifestDigest"] as const;

/** Returns the exact, ordered cell schedule admitted by one frozen profile. */
export function collectiveEvaluationCampaignProfileCellsV1(
  profile: CollectiveEvaluationCampaignProfileV1,
  campaignId: string,
): readonly Readonly<{
  cellId: string;
  peerCount: CollectiveEvaluationCampaignScaleV1;
  stratum: CollectiveEvaluationCampaignStratumV1;
  seed: number;
}>[] {
  assertPlanningIdentifier(campaignId, "campaignId");
  const profileValue = campaignProfile(profile);
  const cells = profileValue.scales.flatMap((peerCount) =>
    COLLECTIVE_EVALUATION_CAMPAIGN_STRATA_V1.flatMap((stratum) =>
      Array.from({ length: profileValue.seedCount(peerCount) }, (_, seed) =>
        Object.freeze({
          cellId: campaignCellIdV1(campaignId, peerCount, stratum, seed),
          peerCount,
          stratum,
          seed,
        }),
      ),
    ),
  );
  return Object.freeze(cells);
}

export function campaignCellIdV1(
  campaignId: string,
  peerCount: CollectiveEvaluationCampaignScaleV1,
  stratum: CollectiveEvaluationCampaignStratumV1,
  seed: number,
): string {
  assertPlanningIdentifier(campaignId, "campaignId");
  assertScale(peerCount);
  assertStratum(stratum);
  assertPlanningSafeInteger(seed, "seed", 0);
  return `campaign:${campaignId}:scale:${peerCount}:stratum:${stratum}:seed:${seed}`;
}

export function collectiveEvaluationCampaignRegistrationDigestV1(
  input: Omit<CollectiveEvaluationCampaignRegistrationV1, "registrationDigest">,
): PlanningDigestV1 {
  const body = normalizeRegistrationBody(input);
  return digest("evaluation-campaign-registration-v1", body);
}

export function createCollectiveEvaluationCampaignRegistrationV1(
  input: Omit<CollectiveEvaluationCampaignRegistrationV1, "registrationDigest">,
): CollectiveEvaluationCampaignRegistrationV1 {
  const body = normalizeRegistrationBody(input);
  return deepFreezePlanning({
    ...body,
    registrationDigest: collectiveEvaluationCampaignRegistrationDigestV1(body),
  });
}

export function validateCollectiveEvaluationCampaignRegistrationV1(
  input: unknown,
): CollectiveEvaluationCampaignRegistrationV1 {
  const value = ownRecord(input, registrationKeys, "campaign registration");
  const { registrationDigest, ...rawBody } = value;
  const body = normalizeRegistrationBody(rawBody);
  const expected = collectiveEvaluationCampaignRegistrationDigestV1(body);
  assertDigestEqual(registrationDigest, expected, "registrationDigest");
  return deepFreezePlanning({ ...body, registrationDigest: expected });
}

export function collectiveEvaluationCampaignManifestDigestV1(
  input: Omit<CollectiveEvaluationCampaignManifestV1, "manifestDigest">,
  registrationInput: CollectiveEvaluationCampaignRegistrationV1,
): PlanningDigestV1 {
  const registration =
    validateCollectiveEvaluationCampaignRegistrationV1(registrationInput);
  const body = normalizeManifestBody(input, registration);
  return digest("evaluation-campaign-manifest-v1", body);
}

export function createCollectiveEvaluationCampaignManifestV1(
  registrationInput: CollectiveEvaluationCampaignRegistrationV1,
  input: Omit<CollectiveEvaluationCampaignManifestV1, "manifestDigest">,
): CollectiveEvaluationCampaignManifestV1 {
  const registration =
    validateCollectiveEvaluationCampaignRegistrationV1(registrationInput);
  const body = normalizeManifestBody(input, registration);
  return deepFreezePlanning({
    ...body,
    manifestDigest: collectiveEvaluationCampaignManifestDigestV1(
      body,
      registration,
    ),
  });
}

export function validateCollectiveEvaluationCampaignManifestV1(
  input: unknown,
  registrationInput: CollectiveEvaluationCampaignRegistrationV1,
): CollectiveEvaluationCampaignManifestV1 {
  const registration =
    validateCollectiveEvaluationCampaignRegistrationV1(registrationInput);
  const value = ownRecord(input, manifestKeys, "campaign manifest");
  const { manifestDigest, ...rawBody } = value;
  const body = normalizeManifestBody(rawBody, registration);
  const expected = collectiveEvaluationCampaignManifestDigestV1(
    body,
    registration,
  );
  assertDigestEqual(manifestDigest, expected, "manifestDigest");
  return deepFreezePlanning({ ...body, manifestDigest: expected });
}

function normalizeRegistrationBody(
  input: unknown,
): Omit<CollectiveEvaluationCampaignRegistrationV1, "registrationDigest"> {
  const value = ownRecord(input, registrationBodyKeys, "campaign registration");
  if (
    value.schemaVersion !== COLLECTIVE_EVALUATION_CAMPAIGN_SCHEMA_VERSION_V1
  ) {
    throw new TypeError("campaign registration schema is invalid");
  }
  assertPlanningIdentifier(value.campaignId, "campaignId");
  const profile = campaignProfile(value.profile);
  const campaignId = value.campaignId as string;
  const cells = normalizeCells(value.cells, profile, campaignId);
  const maximumInteractions = value.maximumInteractions;
  assertPlanningSafeInteger(
    maximumInteractions,
    "maximumInteractions",
    1,
    5_000,
  );
  if (maximumInteractions > 5_000) {
    throw new TypeError("campaign maximumInteractions exceeds 5000");
  }
  const exactCampaignMaximum = Math.max(
    ...cells.map((cell) => cell.maximumInteractions),
  );
  if (maximumInteractions !== exactCampaignMaximum) {
    throw new TypeError(
      "campaign maximumInteractions does not match its maximum cell ceiling",
    );
  }
  const runners = normalizeRunners(value.runners);
  return deepFreezePlanning({
    schemaVersion: 1 as const,
    campaignId,
    profile: profile.name,
    sourceDigest: planningDigest(value.sourceDigest, "sourceDigest"),
    packageDigest: planningDigest(value.packageDigest, "packageDigest"),
    fixtureManifestDigest: planningDigest(
      value.fixtureManifestDigest,
      "fixtureManifestDigest",
    ),
    policyDigest: planningDigest(value.policyDigest, "policyDigest"),
    environmentDigest: planningDigest(
      value.environmentDigest,
      "environmentDigest",
    ),
    observationPolicyDigest: planningDigest(
      value.observationPolicyDigest,
      "observationPolicyDigest",
    ),
    monitorDigest: planningDigest(value.monitorDigest, "monitorDigest"),
    hiddenCanaryDigest: planningDigest(
      value.hiddenCanaryDigest,
      "hiddenCanaryDigest",
    ),
    runners,
    maximumInteractions,
    cells,
  });
}

function normalizeCells(
  input: unknown,
  profile: CampaignProfile,
  campaignId: string,
): readonly CollectiveEvaluationCampaignCellV1[] {
  const values = ownArray(input, profile.cellCount, "campaign cells");
  const expected = collectiveEvaluationCampaignProfileCellsV1(
    profile.name,
    campaignId,
  );
  if (values.length !== expected.length) {
    throw new TypeError("campaign cells do not match the frozen profile");
  }
  return deepFreezePlanning(
    values.map((raw, index) => {
      const value = ownRecord(raw, cellKeys, "campaign cell");
      const schedule = expected[index]!;
      if (value.schemaVersion !== 1) {
        throw new TypeError("campaign cell schema is invalid");
      }
      const peerCount = value.peerCount;
      const stratum = value.stratum;
      const seed = value.seed;
      assertScale(peerCount);
      assertStratum(stratum);
      assertPlanningSafeInteger(seed, "seed", 0);
      const expectedMaximumInteractions = maximumInteractionsForScale(peerCount);
      assertPlanningSafeInteger(
        value.maximumInteractions,
        "maximumInteractions",
        1,
        5_000,
      );
      if (
        value.cellId !== schedule.cellId ||
        peerCount !== schedule.peerCount ||
        stratum !== schedule.stratum ||
        seed !== schedule.seed
      ) {
        throw new TypeError("campaign cell order, identity or seed is invalid");
      }
      if (value.maximumInteractions !== expectedMaximumInteractions) {
        throw new TypeError(
          "campaign cell interaction ceiling does not match its scale",
        );
      }
      return {
        schemaVersion: 1 as const,
        cellId: schedule.cellId,
        peerCount,
        stratum,
        seed,
        maximumInteractions: expectedMaximumInteractions,
        scaleConfigurationDigest: planningDigest(
          value.scaleConfigurationDigest,
          "scaleConfigurationDigest",
        ),
        adaptiveDefinitionDigest: planningDigest(
          value.adaptiveDefinitionDigest,
          "adaptiveDefinitionDigest",
        ),
        centralizedDefinitionDigest: planningDigest(
          value.centralizedDefinitionDigest,
          "centralizedDefinitionDigest",
        ),
        faultPlanDigest: planningDigest(
          value.faultPlanDigest,
          "faultPlanDigest",
        ),
        faultMatrixBindingDigest: planningDigest(
          value.faultMatrixBindingDigest,
          "faultMatrixBindingDigest",
        ),
      };
    }),
  );
}

function normalizeManifestBody(
  input: unknown,
  registration: CollectiveEvaluationCampaignRegistrationV1,
): Omit<CollectiveEvaluationCampaignManifestV1, "manifestDigest"> {
  const value = ownRecord(input, manifestBodyKeys, "campaign manifest");
  if (value.schemaVersion !== 1) {
    throw new TypeError("campaign manifest schema is invalid");
  }
  assertDigestEqual(
    value.registrationDigest,
    registration.registrationDigest,
    "registrationDigest",
  );
  const rawEntries = ownArray(
    value.entries,
    registration.cells.length,
    "campaign manifest entries",
  );
  if (rawEntries.length !== registration.cells.length) {
    throw new TypeError("campaign manifest omits registered cells");
  }
  const entries = rawEntries.map((raw, index) =>
    normalizeManifestEntry(raw, registration.cells[index]!),
  );
  return deepFreezePlanning({
    schemaVersion: 1 as const,
    registrationDigest: registration.registrationDigest,
    entries,
  });
}

function normalizeManifestEntry(
  input: unknown,
  cell: CollectiveEvaluationCampaignCellV1,
): CollectiveEvaluationCampaignManifestEntryV1 {
  const value = ownRecord(input, manifestEntryKeys, "campaign manifest entry");
  if (value.schemaVersion !== 1 || value.cellId !== cell.cellId) {
    throw new TypeError(
      "campaign manifest entry substitutes a registered cell",
    );
  }
  if (value.status !== "success" && value.status !== "failure") {
    throw new TypeError("campaign manifest entry status is invalid");
  }
  const digests = [
    "adaptiveResultDigest",
    "centralizedResultDigest",
    "adaptiveTraceDigest",
    "centralizedTraceDigest",
    "adaptiveLedgerDigest",
    "centralizedLedgerDigest",
    "fairnessDigest",
    "adaptiveCampaignEvidenceDigest",
    "centralizedCampaignEvidenceDigest",
  ] as const;
  const status = value.status;
  const normalizedDigests = Object.fromEntries(
    digests.map((key) => [
      key,
      status === "success"
        ? planningDigest(value[key], key)
        : nullableDigest(value[key], key),
    ]),
  ) as Record<(typeof digests)[number], PlanningDigestV1 | null>;
  if (status === "success") {
    if (value.reasonCode !== null) {
      throw new TypeError("successful campaign entry has a reason code");
    }
  } else {
    if (value.reasonCode === null) {
      throw new TypeError("failed campaign entry omits reason code");
    }
    assertPlanningToken(value.reasonCode, "reasonCode");
    if (digests.some((key) => normalizedDigests[key] !== null)) {
      throw new TypeError("failed campaign entry contains success evidence");
    }
  }
  return deepFreezePlanning({
    schemaVersion: 1 as const,
    cellId: cell.cellId,
    status,
    reasonCode: value.reasonCode as string | null,
    ...normalizedDigests,
  });
}

interface CampaignProfile {
  readonly name: CollectiveEvaluationCampaignProfileV1;
  readonly scales: readonly CollectiveEvaluationCampaignScaleV1[];
  readonly seedCount: (scale: CollectiveEvaluationCampaignScaleV1) => number;
  readonly cellCount: number;
}

function campaignProfile(value: unknown): CampaignProfile {
  if (value === COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1) {
    return {
      name: value,
      scales: COLLECTIVE_EVALUATION_CAMPAIGN_SCALES_V1,
      seedCount: (scale) => (scale === 500 ? 30 : 10),
      cellCount: 240,
    };
  }
  if (value === COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1) {
    return {
      name: value,
      scales: [50],
      seedCount: () => 2,
      cellCount: 8,
    };
  }
  throw new TypeError("campaign profile is invalid");
}

function normalizeRunners(
  input: unknown,
): readonly ["adaptive_collective", "centralized_planner"] {
  const values = ownArray(input, 2, "campaign runners");
  if (
    values.length !== 2 ||
    values[0] !== "adaptive_collective" ||
    values[1] !== "centralized_planner"
  ) {
    throw new TypeError("campaign runner pair is invalid");
  }
  return Object.freeze(["adaptive_collective", "centralized_planner"]);
}

function assertScale(
  value: unknown,
): asserts value is CollectiveEvaluationCampaignScaleV1 {
  if (!COLLECTIVE_EVALUATION_CAMPAIGN_SCALES_V1.includes(value as never)) {
    throw new TypeError("campaign peerCount is invalid");
  }
}

function maximumInteractionsForScale(
  scale: CollectiveEvaluationCampaignScaleV1,
): number {
  switch (scale) {
    case 50:
      return 1_000;
    case 100:
      return 1_600;
    case 250:
      return 3_000;
    case 500:
      return 5_000;
  }
}

function assertStratum(
  value: unknown,
): asserts value is CollectiveEvaluationCampaignStratumV1 {
  if (!COLLECTIVE_EVALUATION_CAMPAIGN_STRATA_V1.includes(value as never)) {
    throw new TypeError("campaign stratum is invalid");
  }
}

function planningDigest(value: unknown, label: string): PlanningDigestV1 {
  assertPlanningDigest(value, label);
  return value as PlanningDigestV1;
}

function nullableDigest(
  value: unknown,
  label: string,
): PlanningDigestV1 | null {
  if (value === null) return null;
  return planningDigest(value, label);
}

function assertDigestEqual(
  value: unknown,
  expected: PlanningDigestV1,
  label: string,
): void {
  if (value !== expected) {
    throw new TypeError(`${label} does not bind the registered campaign`);
  }
}

function ownRecord(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Object.getOwnPropertySymbols(input).length !== 0
  ) {
    throw new TypeError(`${label} must be a plain record`);
  }
  const actual = Object.getOwnPropertyNames(input).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} keys are invalid`);
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label} must not contain accessors`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function ownArray(
  input: unknown,
  maximum: number,
  label: string,
): readonly unknown[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length > maximum ||
    Object.getOwnPropertySymbols(input).length !== 0
  ) {
    throw new TypeError(`${label} is invalid`);
  }
  const names = Object.getOwnPropertyNames(input);
  if (names.length !== input.length + 1 || !names.includes("length")) {
    throw new TypeError(`${label} must be dense`);
  }
  const result: unknown[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label} must not contain accessors`);
    }
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}

function digest(
  domain:
    "evaluation-campaign-registration-v1" | "evaluation-campaign-manifest-v1",
  value: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    domain,
    deepFreezePlanning(value) as unknown as JsonValue,
  );
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
