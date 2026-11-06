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
  activityType: z.enum(["strength", "cardio"]).default("strength"),
  durationMinutes: z.number().int().min(1).max(1440).nullable().default(null),
  steps: z.number().int().min(0).max(200000).nullable().default(null),
  effort: z.enum(["moderate", "vigorous"]).default("moderate"),
  bodyWeightKgUsed: z.number().min(1).max(1000).nullable().default(null),
  calorieEstimateKcal: z.number().int().min(0).max(250000).nullable().default(null),
  entries: z.array(WorkoutEntrySchema).max(100),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  deletedAt: isoTimestamp.nullable(),
}).superRefine((session, context) => {
  if (session.activityType === "strength" && session.entries.length === 0) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Strength sessions need at least one exercise." });
  }
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

export const AthleteProfileSchema = z.object({
  weightKg: z.number().min(1).max(1000).nullable(),
  heightCm: z.number().min(50).max(300).nullable(),
  ageYears: z.number().int().min(1).max(120).nullable(),
  updatedAt: isoTimestamp,
});

export const TrackerSnapshotSchema = z.object({
  exercises: z.array(ExerciseSchema).max(5000),
  workouts: z.array(WorkoutSessionSchema).max(20000),
  weighIns: z.array(BodyWeightEntrySchema).max(20000),
  measurements: z.array(MeasurementEntrySchema).max(20000).default([]),
  photos: z.array(ProgressPhotoSchema).max(5000).default([]),
  profile: AthleteProfileSchema.nullable().default(null),
  updatedAt: isoTimestamp,
});

export type SetRecord = z.infer<typeof SetRecordSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type WorkoutEntry = z.infer<typeof WorkoutEntrySchema>;
export type WorkoutSession = z.infer<typeof WorkoutSessionSchema>;
export type BodyWeightEntry = z.infer<typeof BodyWeightEntrySchema>;
export type MeasurementEntry = z.infer<typeof MeasurementEntrySchema>;
export type ProgressPhoto = z.infer<typeof ProgressPhotoSchema>;
export type AthleteProfile = z.infer<typeof AthleteProfileSchema>;
export type TrackerSnapshot = z.infer<typeof TrackerSnapshotSchema>;

export type WorkoutCalorieEstimateInput = {
  bodyWeightKg: number | null;
  durationMinutes: number | null;
  activityType: "strength" | "cardio";
  effort: "moderate" | "vigorous";
  ageYears?: number | null;
  heightCm?: number | null;
  steps?: number | null;
};

function walkingMet(ageYears: number | null | undefined, speedMph: number): number {
  if (ageYears !== null && ageYears !== undefined && ageYears >= 60) {
    if (speedMph < 1) return 3.0;
    if (speedMph < 2) return 4.0;
    if (speedMph < 2.8) return 4.5;
    if (speedMph < 3.3) return 5.3;
    if (speedMph < 4) return 6.0;
    if (speedMph < 4.5) return 7.3;
    return 9.0;
  }

  if (speedMph < 2) return 2.3;
  if (speedMph < 2.5) return 2.8;
  if (speedMph < 2.8) return 3.0;
  if (speedMph < 3.5) return 3.8;
  if (speedMph < 4) return 4.8;
  if (speedMph < 4.5) return 5.5;
  if (speedMph < 5) return 7.0;
  return 8.5;
}

/** Rough gross-energy estimate. Steps and height can approximate walking pace; neither makes this a measured calorie count. */
export function estimateWorkoutCalories(input: WorkoutCalorieEstimateInput): number | null {
  const { bodyWeightKg, durationMinutes, activityType, effort, ageYears, heightCm, steps } = input;
  if (bodyWeightKg === null || durationMinutes === null || !Number.isFinite(bodyWeightKg) || !Number.isFinite(durationMinutes) || bodyWeightKg <= 0 || durationMinutes <= 0) {
    return null;
  }

  const olderAdult = ageYears !== null && ageYears !== undefined && ageYears >= 60;
  const baselineMlKgMin = olderAdult ? 2.7 : 3.5;
  let mets: number;

  if (activityType === "strength") {
    // The Older Adult Compendium lists 4.3 MET60+ for multiple resistance exercises at varied resistance.
    mets = olderAdult ? 4.3 : effort === "moderate" ? 3.5 : 6.0;
  } else if (
    (ageYears === null || ageYears === undefined || ageYears >= 18) &&
    heightCm !== null && heightCm !== undefined && Number.isFinite(heightCm) && heightCm > 0 &&
    steps !== null && steps !== undefined && Number.isInteger(steps) && steps > 0
  ) {
    // A published walk-test app used 0.414 × height (m) as a rough distance-per-step proxy.
    // This approximates pace only; individual gait, terrain, and health conditions can differ.
    const estimatedStepMeters = heightCm / 100 * 0.414;
    const speedMph = steps * estimatedStepMeters / (durationMinutes / 60) / 1609.344;
    mets = walkingMet(ageYears, speedMph);
  } else if (olderAdult) {
    // Effort-based fallback approximates moderate/brisk older-adult walking when pace is unavailable.
    mets = effort === "moderate" ? 5.3 : 6.0;
  } else {
    mets = effort === "moderate" ? 4.0 : 7.0;
  }

  return Math.round((mets * baselineMlKgMin * bodyWeightKg / 200) * durationMinutes);
}

export function emptyTrackerSnapshot(): TrackerSnapshot {
  return {
    exercises: [],
    workouts: [],
    weighIns: [],
    measurements: [],
    photos: [],
    profile: null,
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

export function mergeAthleteProfiles(
  local: AthleteProfile | null,
  remote: AthleteProfile | null,
): AthleteProfile | null {
  if (!local) return remote;
  if (!remote) return local;
  return Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt) ? local : remote;
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
    profile: mergeAthleteProfiles(local.profile, remote.profile),
    updatedAt:
      Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt)
        ? local.updatedAt
        : remote.updatedAt,
  };
}
