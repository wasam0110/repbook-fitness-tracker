import { describe, expect, it } from "vitest";
import {
  emptyTrackerSnapshot,
  mergeTrackerSnapshots,
  TrackerSnapshotSchema,
  type MeasurementEntry,
  type ProgressPhoto,
  type WorkoutSession,
} from "./tracker";

function workout(id: string, updatedAt: string, deletedAt: string | null = null): WorkoutSession {
  return {
    id,
    date: "2026-10-23",
    note: "",
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

  it("defaults new collections when loading an older saved snapshot", () => {
    const parsed = TrackerSnapshotSchema.parse({
      exercises: [],
      workouts: [],
      weighIns: [],
      updatedAt: "2026-10-24T10:00:00.000Z",
    });
    expect(parsed.measurements).toEqual([]);
    expect(parsed.photos).toEqual([]);
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
