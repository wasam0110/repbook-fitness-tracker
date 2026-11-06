import {
  estimateWorkoutCalories,
  type SetRecord,
  type WorkoutEntry,
  type WorkoutSession,
  type BodyWeightEntry,
  type AthleteProfile,
} from "@shared/tracker";
import { filterExercisesByCategories, getBodyWeightKgAtOrBefore, getPreviousPerformance } from "@/lib/tracker-utils";
import type { ExerciseOption } from "@/lib/tracker-utils";
import { formatDate, formatNumber, formatWeight, todayAsLocalDate } from "@/lib/tracker-utils";
import { Minus, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  exercises: ExerciseOption[];
  workouts: WorkoutSession[];
  weighIns: BodyWeightEntry[];
  athleteProfile: AthleteProfile | null;
  existing?: WorkoutSession | null;
  onSave: (session: WorkoutSession) => void;
  onClose: () => void;
  onAddExercise: () => void;
};

function createSet(unit: "kg" | "lb"): SetRecord {
  return { id: crypto.randomUUID(), weight: 0, reps: 8, unit };
}

export default function WorkoutComposer({ exercises, workouts, weighIns, athleteProfile, existing, onSave, onClose, onAddExercise }: Props) {
  const [date, setDate] = useState(existing?.date ?? todayAsLocalDate());
  const [note, setNote] = useState(existing?.note ?? "");
  const [unit, setUnit] = useState<"kg" | "lb">(existing?.entries[0]?.sets[0]?.unit ?? "kg");
  const [activityType, setActivityType] = useState<"strength" | "cardio">(existing?.activityType ?? "strength");
  const [durationMinutes, setDurationMinutes] = useState(existing?.durationMinutes?.toString() ?? "");
  const [steps, setSteps] = useState(existing?.steps?.toString() ?? "");
  const [effort, setEffort] = useState<"moderate" | "vigorous">(existing?.effort ?? "moderate");
  const [selectedExercise, setSelectedExercise] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [entries, setEntries] = useState<WorkoutEntry[]>(existing?.entries ?? []);
  const [error, setError] = useState("");

  const previousByExercise = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getPreviousPerformance>>();
    for (const entry of entries) {
      map.set(entry.exerciseId, getPreviousPerformance(entry.exerciseId, workouts, date, existing?.id));
    }
    return map;
  }, [date, entries, existing?.id, workouts]);
  const bodyWeightKg = useMemo(
    () => getBodyWeightKgAtOrBefore(date, weighIns, athleteProfile?.weightKg ?? null),
    [athleteProfile?.weightKg, date, weighIns],
  );
  const hasDatedWeighIn = useMemo(() => getBodyWeightKgAtOrBefore(date, weighIns) !== null, [date, weighIns]);
  const parsedDuration = durationMinutes === "" ? null : Number(durationMinutes);
  const parsedSteps = steps === "" ? null : Number(steps);
  const exerciseCategories = useMemo(
    () => [...new Set(exercises.map(exercise => exercise.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [exercises],
  );
  const visibleExercises = useMemo(
    () => filterExercisesByCategories(exercises, selectedCategories),
    [exercises, selectedCategories],
  );
  const calorieEstimate = estimateWorkoutCalories({
    bodyWeightKg,
    durationMinutes: parsedDuration,
    activityType,
    effort,
    ageYears: athleteProfile?.ageYears ?? null,
    heightCm: athleteProfile?.heightCm ?? null,
    steps: parsedSteps !== null && Number.isInteger(parsedSteps) && parsedSteps >= 0 ? parsedSteps : null,
  });

  function addExercise() {
    const selected = exercises.find(exercise => exercise.id === selectedExercise);
    if (!selected) return;
    setEntries(current => [
      ...current,
      {
        id: crypto.randomUUID(),
        exerciseId: selected.id,
        exerciseName: selected.name,
        sets: [createSet(unit)],
      },
    ]);
    setSelectedExercise("");
    setError("");
  }

  function updateSet(entryId: string, setId: string, field: "weight" | "reps", value: number) {
    setEntries(current => current.map(entry => entry.id !== entryId ? entry : {
      ...entry,
      sets: entry.sets.map(set => set.id !== setId ? set : { ...set, [field]: value }),
    }));
  }

  function addSet(entryId: string) {
    setEntries(current => current.map(entry => entry.id !== entryId ? entry : {
      ...entry,
      sets: [...entry.sets, createSet(unit)],
    }));
  }

  function removeSet(entryId: string, setId: string) {
    setEntries(current => current.map(entry => entry.id !== entryId ? entry : {
      ...entry,
      sets: entry.sets.length <= 1 ? entry.sets : entry.sets.filter(set => set.id !== setId),
    }));
  }

  function toggleCategory(category: string) {
    setSelectedCategories(current => current.includes(category)
      ? current.filter(item => item !== category)
      : [...current, category]);
    setSelectedExercise("");
  }

  function clearCategoryFilter() {
    setSelectedCategories([]);
    setSelectedExercise("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activityType === "strength" && !entries.length) {
      setError("Add at least one exercise to this strength workout.");
      return;
    }
    const now = new Date().toISOString();
    onSave({
      id: existing?.id ?? crypto.randomUUID(),
      date,
      note: note.trim(),
      activityType,
      durationMinutes: parsedDuration && Number.isInteger(parsedDuration) ? parsedDuration : null,
      steps: activityType === "cardio" && parsedSteps !== null && Number.isInteger(parsedSteps) ? parsedSteps : null,
      effort,
      bodyWeightKgUsed: calorieEstimate === null ? null : bodyWeightKg,
      calorieEstimateKcal: calorieEstimate,
      entries,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal-sheet workout-modal" role="dialog" aria-modal="true" aria-labelledby="workout-title">
        <header className="modal-header">
          <div>
            <div className="eyebrow">TRAINING LOG</div>
            <h2 id="workout-title">{existing ? "Edit workout" : "Log a workout"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close workout form"><X size={19} /></button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="workout-meta-row">
            <label className="field-block">
              <span>Workout date</span>
              <input type="date" value={date} onChange={event => setDate(event.target.value)} required />
            </label>
            <label className="field-block">
              <span>Session type</span>
              <select value={activityType} onChange={event => setActivityType(event.target.value as "strength" | "cardio")}>
                <option value="strength">Strength training</option>
                <option value="cardio">Cardio / steps</option>
              </select>
            </label>
          </div>
          {activityType === "strength" && <div className="session-unit-row field-block">
            <span>Weight unit</span>
            <div className="unit-switch" role="group" aria-label="Weight unit">
              {(["kg", "lb"] as const).map(value => (
                <button key={value} type="button" className={unit === value ? "selected" : ""} onClick={() => setUnit(value)}>{value}</button>
              ))}
            </div>
          </div>}
          <div className={`session-meta-grid ${activityType === "cardio" ? "cardio-meta" : "strength-meta"}`}>
            <label className="field-block">
              <span>Duration <small>minutes, for calorie estimate</small></span>
              <input type="number" min="1" max="1440" step="1" value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} placeholder="e.g. 45" />
            </label>
            <label className="field-block">
              <span>Effort</span>
              <select value={effort} onChange={event => setEffort(event.target.value as "moderate" | "vigorous")}>
                <option value="moderate">Moderate</option>
                <option value="vigorous">Vigorous</option>
              </select>
            </label>
            {activityType === "cardio" && <label className="field-block">
              <span>Steps <small>optional</small></span>
              <input type="number" min="0" max="200000" step="1" value={steps} onChange={event => setSteps(event.target.value)} placeholder="e.g. 5,000" />
            </label>}
          </div>
          <p className="calorie-estimate-note" role="status">
            {calorieEstimate !== null
              ? <>Rough estimate: <strong>about {calorieEstimate} kcal</strong> using {formatNumber(bodyWeightKg ?? 0)} kg {hasDatedWeighIn ? "dated body weight" : "profile weight"}. Profile age selects the 60+ activity table when applicable; height, steps, and duration can approximate walking pace. Not a measured calorie count.</>
              : "Calories need a duration and body weight. A dated weigh-in is preferred; profile weight is the fallback. For cardio, steps, height, and duration can approximate walking pace."}
          </p>
          <label className="field-block note-field">
            <span>Session note <small>optional</small></span>
            <input value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="A quick note about the session" />
          </label>

          <div className="composer-section-heading">
            <div><span className="eyebrow">THE WORK</span><h3>{activityType === "cardio" ? "Optional exercises & sets" : "Exercises & sets"}</h3></div>
            <button className="text-action" type="button" onClick={onAddExercise}><Plus size={16} /> New exercise</button>
          </div>
          {exerciseCategories.length > 1 && <fieldset className="exercise-category-filter">
            <legend>FILTER BY MUSCLE GROUP</legend>
            <div className="exercise-category-chips">
              <button type="button" className={`exercise-category-chip ${selectedCategories.length === 0 ? "selected" : ""}`} aria-pressed={selectedCategories.length === 0} onClick={clearCategoryFilter}>All</button>
              {exerciseCategories.map(category => <button
                key={category}
                type="button"
                className={`exercise-category-chip ${selectedCategories.includes(category) ? "selected" : ""}`}
                aria-pressed={selectedCategories.includes(category)}
                onClick={() => toggleCategory(category)}
              >{category}</button>)}
            </div>
            {selectedCategories.length > 0 && <p className="exercise-category-count">Showing {visibleExercises.length} of {exercises.length} exercises</p>}
          </fieldset>}
          <div className="exercise-picker-row">
            <select value={selectedExercise} onChange={event => setSelectedExercise(event.target.value)} aria-label="Choose exercise">
              <option value="">Choose an exercise…</option>
              {visibleExercises.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name} · {exercise.category}</option>)}
            </select>
            <button className="button button-secondary" type="button" onClick={addExercise} disabled={!selectedExercise}><Plus size={17} /> Add</button>
          </div>

          {entries.length === 0 ? (
            <div className="composer-empty"><span className="empty-mark">+</span><p>{activityType === "cardio" ? "Your cardio session can be saved with steps and duration alone." : "Pick an exercise above to start your log."}</p></div>
          ) : (
            <div className="composer-exercises">
              {entries.map((entry, index) => {
                const previous = previousByExercise.get(entry.exerciseId);
                return (
                  <article className="composer-exercise" key={entry.id}>
                    <header className="composer-exercise-head">
                      <div className="exercise-number">{String(index + 1).padStart(2, "0")}</div>
                      <div className="composer-exercise-name"><h4>{entry.exerciseName}</h4>
                        {previous ? <p className="last-time-note">{previous.label} · {formatDate(previous.session.date, { month: "short", day: "numeric" })}: {previous.exercise.sets.map(set => `${formatWeight(set.weight, set.unit)} × ${set.reps}`).join(" · ")}</p> : <p className="last-time-note quiet">First time logged — make it count.</p>}
                      </div>
                      <button className="icon-button small-icon" type="button" onClick={() => setEntries(current => current.filter(item => item.id !== entry.id))} aria-label={`Remove ${entry.exerciseName}`}><X size={17} /></button>
                    </header>
                    <div className="set-table-head"><span>SET</span><span>WEIGHT</span><span>REPS</span><span /></div>
                    <div className="set-rows">
                      {entry.sets.map((set, setIndex) => (
                        <div className="set-row" key={set.id}>
                          <span className="set-index">{String(setIndex + 1).padStart(2, "0")}</span>
                          <label className="set-input"><input type="number" min="0" max="2000" step="0.5" value={set.weight} onChange={event => updateSet(entry.id, set.id, "weight", Number(event.target.value))} aria-label={`Set ${setIndex + 1} weight`} /><span>{set.unit}</span></label>
                          <label className="set-input reps-input"><input type="number" min="0" max="1000" step="1" value={set.reps} onChange={event => updateSet(entry.id, set.id, "reps", Number(event.target.value))} aria-label={`Set ${setIndex + 1} reps`} /></label>
                          <button className="icon-button small-icon" type="button" onClick={() => removeSet(entry.id, set.id)} disabled={entry.sets.length <= 1} aria-label="Remove set"><Minus size={16} /></button>
                        </div>
                      ))}
                    </div>
                    <button className="add-set-button" type="button" onClick={() => addSet(entry.id)}><Plus size={14} /> Add set</button>
                  </article>
                );
              })}
            </div>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal-footer">
            <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={activityType === "strength" && !entries.length}><span>{existing ? "Save changes" : "Save workout"}</span><span aria-hidden="true">↗</span></button>
          </footer>
        </form>
      </section>
    </div>
  );
}
