import { describe, expect, it } from "vitest";
import { getBodyWeightKgAtOrBefore, summarizeWorkoutCalories } from "./tracker-utils";
import type { BodyWeightEntry, WorkoutSession } from "@shared/tracker";

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

function workout(id: string, date: string, calories: number | null, deletedAt: string | null = null): WorkoutSession {
  return {
    id,
    date,
    note: "",
    activityType: "cardio",
    durationMinutes: 30,
    steps: 5000,
    effort: "moderate",
    bodyWeightKgUsed: 82,
    calorieEstimateKcal: calories,
    entries: [],
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

  it("uses the profile weight only when no dated weigh-in exists", () => {
    expect(getBodyWeightKgAtOrBefore("2026-10-23", [weighIn("future", "2026-10-24", 82)], 79.5)).toBe(79.5);
    expect(getBodyWeightKgAtOrBefore("2026-10-24", [weighIn("today", "2026-10-24", 82)], 79.5)).toBe(82);
  });
});

describe("summarizeWorkoutCalories", () => {
  const sessions = [
    workout("start", "2026-11-02", 180),
    workout("today", "2026-11-04", 220),
    workout("no-estimate", "2026-11-04", null),
    workout("future", "2026-11-05", 300),
    workout("deleted", "2026-11-03", 150, "2026-11-04T10:00:00.000Z"),
    workout("last-month", "2026-10-31", 100),
  ];

  it("sums only saved estimates in the inclusive requested period", () => {
    expect(summarizeWorkoutCalories(sessions, "2026-11-02", "2026-11-04")).toEqual({
      totalKcal: 400,
      sessionCount: 2,
    });
  });

  it("returns zero and no sessions when the period contains no estimates", () => {
    expect(summarizeWorkoutCalories(sessions, "2026-11-06", "2026-11-30")).toEqual({
      totalKcal: 0,
      sessionCount: 0,
    });
  });
});
