import { z } from "zod";

const recordId = z.string().min(1).max(100);
const isoTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
  }, "Expected a valid ISO timestamp");
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "Expected a valid calendar date");

export const SetRecordSchema = z.object({
  id: recordId,
  weight: z.number().min(0).max(2000),
  reps: z.number().int().min(0).max(1000),
  unit: z.enum(["kg", "lb"]),
});

export const ExerciseSchema = z.object({
  id: recordId,
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(48),
  equipment: z.string().trim().max(60),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  deletedAt: isoTimestamp.nullable(),
});

export const WorkoutEntrySchema = z.object({
  id: recordId,
  exerciseId: recordId,
  exerciseName: z.string().trim().min(1).max(80),
  sets: z.array(SetRecordSchema).min(1).max(60),
});

export const WorkoutSessionSchema = z.object({
  id: recordId,
  date: calendarDate,
  note: z.string().max(500),
  entries: z.array(WorkoutEntrySchema).min(1).max(100),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  deletedAt: isoTimestamp.nullable(),
});

export const BodyWeightEntrySchema = z.object({
  id: recordId,
  date: calendarDate,
  weight: z.number().min(0).max(1000),
  unit: z.enum(["kg", "lb"]),
  note: z.string().max(300),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  deletedAt: isoTimestamp.nullable(),
});

export const MeasurementEntrySchema = z.object({
  id: recordId,
  date: calendarDate,
  label: z.string().trim().min(1).max(64),
  value: z.number().min(0.1).max(1000),
  unit: z.enum(["cm", "in"]),
  note: z.string().max(300),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  deletedAt: isoTimestamp.nullable(),
});

export const ProgressPhotoSchema = z.object({
  id: recordId,
  date: calendarDate,
  note: z.string().max(300),
  storageKey: z.string().max(256).regex(/^(?:users\/[0-9a-f-]{36}|repbook\/users\/\d+)\/[a-f0-9-]{36}\.jpg$/i),
  contentType: z.literal("image/jpeg"),
  fileName: z.string().trim().min(1).max(120),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  deletedAt: isoTimestamp.nullable(),
});

export const TrackerSnapshotSchema = z.object({
  exercises: z.array(ExerciseSchema).max(5000),
  workouts: z.array(WorkoutSessionSchema).max(20000),
  weighIns: z.array(BodyWeightEntrySchema).max(20000),
  measurements: z.array(MeasurementEntrySchema).max(20000).default([]),
  photos: z.array(ProgressPhotoSchema).max(5000).default([]),
  updatedAt: isoTimestamp,
});

export type SetRecord = z.infer<typeof SetRecordSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type WorkoutEntry = z.infer<typeof WorkoutEntrySchema>;
export type WorkoutSession = z.infer<typeof WorkoutSessionSchema>;
export type BodyWeightEntry = z.infer<typeof BodyWeightEntrySchema>;
export type MeasurementEntry = z.infer<typeof MeasurementEntrySchema>;
export type ProgressPhoto = z.infer<typeof ProgressPhotoSchema>;
export type TrackerSnapshot = z.infer<typeof TrackerSnapshotSchema>;

export function emptyTrackerSnapshot(): TrackerSnapshot {
  return {
    exercises: [],
    workouts: [],
    weighIns: [],
    measurements: [],
    photos: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function mergeRecords<T extends { id: string; updatedAt: string }>(
  localRecords: T[],
  remoteRecords: T[],
): T[] {
  const merged = new Map<string, T>();
  for (const record of [...localRecords, ...remoteRecords]) {
    const existing = merged.get(record.id);
    if (!existing || Date.parse(record.updatedAt) >= Date.parse(existing.updatedAt)) {
      merged.set(record.id, record);
    }
  }
  return [...merged.values()];
}

/** Merge append-oriented records by stable ID, retaining the newest version/tombstone. */
export function mergeTrackerSnapshots(
  local: TrackerSnapshot,
  remote: TrackerSnapshot,
): TrackerSnapshot {
  return {
    exercises: mergeRecords(local.exercises, remote.exercises),
    workouts: mergeRecords(local.workouts, remote.workouts),
    weighIns: mergeRecords(local.weighIns, remote.weighIns),
    measurements: mergeRecords(local.measurements, remote.measurements),
    photos: mergeRecords(local.photos, remote.photos),
    updatedAt:
      Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt)
        ? local.updatedAt
        : remote.updatedAt,
  };
}
