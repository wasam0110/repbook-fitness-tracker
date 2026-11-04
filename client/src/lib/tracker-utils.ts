import type { BodyWeightEntry, TrackerSnapshot, WorkoutSession } from "@shared/tracker";

export type ExerciseOption = {
  id: string;
  name: string;
  category: string;
  equipment: string;
  isCustom?: boolean;
};

export const DEFAULT_EXERCISES: ExerciseOption[] = [
  { id: "default-bench-press", name: "Bench Press", category: "Chest", equipment: "Barbell" },
  { id: "default-squat", name: "Back Squat", category: "Legs", equipment: "Barbell" },
  { id: "default-deadlift", name: "Deadlift", category: "Back", equipment: "Barbell" },
  { id: "default-overhead-press", name: "Overhead Press", category: "Shoulders", equipment: "Barbell" },
  { id: "default-barbell-row", name: "Barbell Row", category: "Back", equipment: "Barbell" },
  { id: "default-lat-pulldown", name: "Lat Pulldown", category: "Back", equipment: "Cable" },
  { id: "default-dumbbell-press", name: "Dumbbell Press", category: "Chest", equipment: "Dumbbell" },
  { id: "default-leg-press", name: "Leg Press", category: "Legs", equipment: "Machine" },
  { id: "default-rdl", name: "Romanian Deadlift", category: "Legs", equipment: "Barbell" },
  { id: "default-lateral-raise", name: "Lateral Raise", category: "Shoulders", equipment: "Dumbbell" },
  { id: "default-pull-up", name: "Pull-up", category: "Back", equipment: "Bodyweight" },
  { id: "default-cable-row", name: "Seated Cable Row", category: "Back", equipment: "Cable" },
];

export function getExercises(snapshot: TrackerSnapshot): ExerciseOption[] {
  const custom = snapshot.exercises
    .filter(exercise => !exercise.deletedAt)
    .map(exercise => ({ ...exercise, isCustom: true }));
  const customIds = new Set(custom.map(exercise => exercise.id));
  return [...DEFAULT_EXERCISES.filter(exercise => !customIds.has(exercise.id)), ...custom].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function todayAsLocalDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.valueOf())) return date;
  return parsed.toLocaleDateString(undefined, options ?? { month: "short", day: "numeric", year: "numeric" });
}

export function formatWeight(weight: number, unit: "kg" | "lb"): string {
  return `${Number.isInteger(weight) ? weight : weight.toFixed(1)} ${unit}`;
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function getBodyWeightKgAtOrBefore(date: string, weighIns: BodyWeightEntry[]): number | null {
  const entry = [...weighIns]
    .filter(item => !item.deletedAt && item.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!entry) return null;
  return entry.unit === "kg" ? entry.weight : entry.weight * 0.45359237;
}

function weekStart(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  const day = (parsed.getDay() + 6) % 7;
  parsed.setDate(parsed.getDate() - day);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export type PreviousPerformance = {
  session: WorkoutSession;
  exercise: NonNullable<WorkoutSession["entries"][number]>;
  label: "Last week" | "Most recent";
};

export function getPreviousPerformance(
  exerciseId: string,
  workouts: WorkoutSession[],
  targetDate: string,
  excludedSessionId?: string,
): PreviousPerformance | null {
  const previous = workouts
    .filter(session =>
      !session.deletedAt &&
      session.id !== excludedSessionId &&
      session.date < targetDate &&
      session.entries.some(entry => entry.exerciseId === exerciseId),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

  const thisWeek = weekStart(targetDate);
  const lastWeekStart = addDays(thisWeek, -7);
  const lastWeek = previous.find(session => session.date >= lastWeekStart && session.date < thisWeek);
  const session = lastWeek ?? previous[0];
  if (!session) return null;
  const exercise = session.entries.find(entry => entry.exerciseId === exerciseId);
  return exercise ? { session, exercise, label: lastWeek ? "Last week" : "Most recent" } : null;
}
