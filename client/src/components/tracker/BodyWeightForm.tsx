import type { BodyWeightEntry } from "@shared/tracker";
import { todayAsLocalDate } from "@/lib/tracker-utils";
import { Plus } from "lucide-react";
import { useState } from "react";

type Props = { onSave: (entry: BodyWeightEntry) => void };

export default function BodyWeightForm({ onSave }: Props) {
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [date, setDate] = useState(todayAsLocalDate());
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0 || value > 1000) {
      setError("Enter a body weight greater than zero.");
      return;
    }
    const now = new Date().toISOString();
    onSave({
      id: crypto.randomUUID(), date, weight: value, unit, note: "",
      createdAt: now, updatedAt: now, deletedAt: null,
    });
    setWeight("");
    setDate(todayAsLocalDate());
    setError("");
  }

  return (
    <form className="weight-entry-form" onSubmit={submit}>
      <label className="field-block"><span>Date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label>
      <label className="field-block"><span>Body weight</span><div className="weight-input-wrap"><input inputMode="decimal" type="number" step="0.1" min="0.1" max="1000" placeholder="0.0" value={weight} onChange={event => setWeight(event.target.value)} required /><select value={unit} onChange={event => setUnit(event.target.value as "kg" | "lb")} aria-label="Body weight unit"><option value="kg">kg</option><option value="lb">lb</option></select></div></label>
      <button className="button button-primary weight-submit" type="submit"><Plus size={16} /> Add</button>
      {error && <p className="form-error weight-error" role="alert">{error}</p>}
    </form>
  );
}
