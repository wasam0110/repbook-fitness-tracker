import { describe, expect, it } from "vitest";
import { getBodyWeightKgAtOrBefore } from "./tracker-utils";
import type { BodyWeightEntry } from "@shared/tracker";

function weighIn(id: string, date: string, weight: number, unit: "kg" | "lb" = "kg", deletedAt: string | null = null): BodyWeightEntry {
  return {
    id,
    date,
    weight,
    unit,
    note: "",
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    deletedAt,
  };
}

describe("getBodyWeightKgAtOrBefore", () => {
  it("uses the most recent non-deleted entry on or before the workout date", () => {
    const entries = [
      weighIn("older", "2026-10-01", 80),
      weighIn("newer", "2026-10-24", 82),
      weighIn("future", "2026-11-10", 83),
    ];
    expect(getBodyWeightKgAtOrBefore("2026-10-24", entries)).toBe(82);
  });

  it("converts pounds to kilograms and ignores deleted or future records", () => {
    expect(getBodyWeightKgAtOrBefore("2026-10-24", [
      weighIn("deleted", "2026-10-23", 180, "lb", "2026-10-25T10:00:00.000Z"),
      weighIn("future", "2026-10-25", 82),
      weighIn("pounds", "2026-10-24", 180, "lb"),
    ])).toBeCloseTo(81.6466, 3);
  });

  it("returns null when there is no prior weigh-in", () => {
    expect(getBodyWeightKgAtOrBefore("2026-10-23", [weighIn("future", "2026-10-24", 82)])).toBeNull();
  });
});
