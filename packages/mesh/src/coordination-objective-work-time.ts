import { compareMeshTimestamps } from "@agentplat/mesh-protocol";

const rfc3339Pattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

export function logicalExpiry(
  validFrom: string,
  validUntil: string,
  verifiedAt: string,
  receivedAt: number,
):
  | { readonly ok: true; readonly at: number }
  | {
      readonly ok: false;
      readonly reason: "outside_window" | "logical_time_overflow";
    } {
  if (
    compare(verifiedAt, validFrom) < 0 ||
    compare(verifiedAt, validUntil) >= 0
  ) {
    return { ok: false, reason: "outside_window" };
  }
  const at = futureLogicalTime(validUntil, verifiedAt, receivedAt);
  return at === undefined
    ? { ok: false, reason: "logical_time_overflow" }
    : { ok: true, at };
}

export function logicalDeadline(
  deadline: string,
  verifiedAt: string,
  receivedAt: number,
): number | undefined {
  if (compare(verifiedAt, deadline) >= 0) return undefined;
  return futureLogicalTime(deadline, verifiedAt, receivedAt);
}

function futureLogicalTime(
  future: string,
  present: string,
  receivedAt: number,
): number | undefined {
  const remainingNanoseconds =
    timestampNanoseconds(future) - timestampNanoseconds(present);
  if (remainingNanoseconds <= 0n) return undefined;
  const remainingMilliseconds = (remainingNanoseconds + 999_999n) / 1_000_000n;
  if (
    remainingMilliseconds > BigInt(Number.MAX_SAFE_INTEGER) ||
    BigInt(receivedAt) + remainingMilliseconds > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return undefined;
  }
  return receivedAt + Number(remainingMilliseconds);
}

function timestampNanoseconds(value: string): bigint {
  const match = rfc3339Pattern.exec(value);
  if (!match) throw new TypeError("Invalid Mesh Objective timestamp");
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText = "",
    zone,
    offsetSign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const offsetMinutes =
    zone === "Z"
      ? 0
      : (Number(offsetHourText) * 60 + Number(offsetMinuteText)) *
        (offsetSign === "+" ? 1 : -1);
  const milliseconds =
    Date.UTC(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      Number(hourText),
      Number(minuteText),
      Number(secondText),
    ) -
    offsetMinutes * 60_000;
  return (
    BigInt(milliseconds) * 1_000_000n + BigInt(fractionText.padEnd(9, "0"))
  );
}

function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError("Invalid Mesh Objective timestamp");
  return result.value;
}
