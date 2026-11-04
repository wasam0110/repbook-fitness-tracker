import { describe, expect, it } from "vitest";
import {
  emptyTrackerSnapshot,
  estimateWorkoutCalories,
  mergeTrackerSnapshots,
  TrackerSnapshotSchema,
  WorkoutSessionSchema,
  type MeasurementEntry,
  type ProgressPhoto,
  type WorkoutSession,
} from "./tracker";

function workout(id: string, updatedAt: string, deletedAt: string | null = null): WorkoutSession {
  return {
    id,
    date: "2026-10-23",
    note: "",
    activityType: "strength",
    durationMinutes: null,
    steps: null,
    effort: "moderate",
    bodyWeightKgUsed: null,
    calorieEstimateKcal: null,
    entries: [{
      id: `${id}-entry`,
      exerciseId: "default-bench-press",
      exerciseName: "Bench Press",
      sets: [{ id: `${id}-set`, weight: 50, reps: 8, unit: "kg" }],
    }],
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt,
    deletedAt,
  };
}

function measurement(id: string, updatedAt: string, deletedAt: string | null = null): MeasurementEntry {
  return {
    id,
    date: "2026-10-23",
    label: "Waist",
    value: 82,
    unit: "cm",
    note: "",
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt,
    deletedAt,
  };
}

function photo(id: string, updatedAt: string, deletedAt: string | null = null): ProgressPhoto {
  return {
    id,
    date: "2026-10-23",
    note: "Front view",
    storageKey: `repbook/users/41/${id}.jpg`,
    contentType: "image/jpeg",
    fileName: "front.jpg",
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt,
    deletedAt,
  };
}

describe("fitness snapshot sync", () => {
  it("keeps records created independently on either device", () => {
    const local = { ...emptyTrackerSnapshot(), workouts: [workout("local", "2026-10-24T10:00:00.000Z")] };
    const remote = { ...emptyTrackerSnapshot(), workouts: [workout("remote", "2026-10-24T11:00:00.000Z")] };
    const merged = mergeTrackerSnapshots(local, remote);

    expect(merged.workouts.map(session => session.id).sort()).toEqual(["local", "remote"]);
  });

  it("preserves the newest edit or deletion marker for the same record", () => {
    const active = workout("same", "2026-10-24T10:00:00.000Z");
    const deleted = workout("same", "2026-10-24T11:00:00.000Z", "2026-10-24T11:00:00.000Z");
    const merged = mergeTrackerSnapshots(
      { ...emptyTrackerSnapshot(), workouts: [active] },
      { ...emptyTrackerSnapshot(), workouts: [deleted] },
    );

    expect(merged.workouts).toHaveLength(1);
    expect(merged.workouts[0]?.deletedAt).toBe("2026-10-24T11:00:00.000Z");
  });

  it("merges body measurements and photo metadata independently by ID", () => {
    const local = {
      ...emptyTrackerSnapshot(),
      measurements: [measurement("waist", "2026-10-24T10:00:00.000Z")],
      photos: [photo("11111111-1111-4111-8111-111111111111", "2026-10-24T10:00:00.000Z")],
    };
    const remote = {
      ...emptyTrackerSnapshot(),
      measurements: [measurement("chest", "2026-10-24T11:00:00.000Z")],
      photos: [photo("22222222-2222-4222-8222-222222222222", "2026-10-24T11:00:00.000Z")],
    };
    const merged = mergeTrackerSnapshots(local, remote);

    expect(merged.measurements.map(item => item.id).sort()).toEqual(["chest", "waist"]);
    expect(merged.photos.map(item => item.id).sort()).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("defaults new collections and session fields when loading an older saved snapshot", () => {
    const legacyWorkout = {
      ...workout("legacy", "2026-10-24T10:00:00.000Z"),
      activityType: undefined,
      durationMinutes: undefined,
      steps: undefined,
      effort: undefined,
      bodyWeightKgUsed: undefined,
      calorieEstimateKcal: undefined,
    };
    const parsed = TrackerSnapshotSchema.parse({
      exercises: [],
      workouts: [legacyWorkout],
      weighIns: [],
      updatedAt: "2026-10-24T10:00:00.000Z",
    });
    expect(parsed.measurements).toEqual([]);
    expect(parsed.photos).toEqual([]);
    expect(parsed.workouts[0]).toMatchObject({
      activityType: "strength",
      durationMinutes: null,
      steps: null,
      effort: "moderate",
      bodyWeightKgUsed: null,
      calorieEstimateKcal: null,
    });
  });

  it("estimates gross calories from body weight, duration, activity, and effort", () => {
    expect(estimateWorkoutCalories(82, 30, "cardio", "moderate")).toBe(172);
    expect(estimateWorkoutCalories(82, 60, "strength", "vigorous")).toBe(517);
    expect(estimateWorkoutCalories(null, 30, "cardio", "moderate")).toBeNull();
    expect(estimateWorkoutCalories(82, null, "strength", "moderate")).toBeNull();
  });

  it("allows cardio-only sessions but rejects strength sessions without exercises", () => {
    const { entries: _entries, ...base } = workout("cardio", "2026-10-24T10:00:00.000Z");
    const cardio = WorkoutSessionSchema.safeParse({ ...base, activityType: "cardio", entries: [] });
    const strength = WorkoutSessionSchema.safeParse({ ...base, activityType: "strength", entries: [] });
    expect(cardio.success).toBe(true);
    expect(strength.success).toBe(false);
  });

  it("rejects malformed timestamps, impossible dates, and unsafe photo keys", () => {
    const invalid = {
      ...emptyTrackerSnapshot(),
      updatedAt: "not-a-date",
      workouts: [workout("bad-date", "2026-10-24T10:00:00.000Z")],
    };
    invalid.workouts[0]!.date = "2026-02-30";
    expect(TrackerSnapshotSchema.safeParse(invalid).success).toBe(false);
    expect(TrackerSnapshotSchema.safeParse({
      ...emptyTrackerSnapshot(),
      updatedAt: "2026-02-30T10:00:00.000Z",
    }).success).toBe(false);
    expect(TrackerSnapshotSchema.safeParse({
      ...emptyTrackerSnapshot(),
      photos: [photo("../../unsafe", "2026-10-24T10:00:00.000Z")],
    }).success).toBe(false);
  });
});
