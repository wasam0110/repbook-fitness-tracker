import { X } from "lucide-react";
import { useState } from "react";

export type NewExercise = { id: string; name: string; category: string; equipment: string; createdAt: string; updatedAt: string; deletedAt: null };

type Props = { onSave: (exercise: NewExercise) => void; onClose: () => void };

const CATEGORIES = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Arms", "Forearms", "Quads", "Hamstrings", "Glutes", "Calves", "Legs", "Core", "Cardio", "Other"];
const EQUIPMENT = ["Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Kettlebell", "Other"];

export default function ExerciseDialog({ onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Chest");
  const [equipment, setEquipment] = useState("Barbell");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized) {
      setError("Give this exercise a name first.");
      return;
    }
    const now = new Date().toISOString();
    onSave({ id: crypto.randomUUID(), name: normalized, category, equipment, createdAt: now, updatedAt: now, deletedAt: null });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal-sheet exercise-modal" role="dialog" aria-modal="true" aria-labelledby="exercise-title">
        <header className="modal-header"><div><div className="eyebrow">EXERCISE LIBRARY</div><h2 id="exercise-title">Add an exercise</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        <form onSubmit={submit}>
          <label className="field-block"><span>Exercise name</span><input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Incline dumbbell press" maxLength={80} required /></label>
          <div className="form-two-col">
            <label className="field-block"><span>Muscle group</span><select value={category} onChange={event => setCategory(event.target.value)}>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="field-block"><span>Equipment</span><select value={equipment} onChange={event => setEquipment(event.target.value)}>{EQUIPMENT.map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal-footer"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Save exercise <span aria-hidden="true">↗</span></button></footer>
        </form>
      </section>
    </div>
  );
}
