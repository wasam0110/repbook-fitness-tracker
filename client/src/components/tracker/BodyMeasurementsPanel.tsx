import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Ruler, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MeasurementEntry } from "@shared/tracker";
import { formatDate, formatNumber, todayAsLocalDate } from "@/lib/tracker-utils";

const BODY_AREAS = [
  "Neck",
  "Shoulders",
  "Chest",
  "Waist",
  "Hips",
  "Left arm",
  "Right arm",
  "Left thigh",
  "Right thigh",
  "Left calf",
  "Right calf",
] as const;
const CUSTOM_AREA = "__custom__";

function convertMeasurement(value: number, from: "cm" | "in", to: "cm" | "in"): number {
  if (from === to) return value;
  return from === "in" ? value * 2.54 : value / 2.54;
}

type Props = {
  entries: MeasurementEntry[];
  onSave: (entry: MeasurementEntry) => void | Promise<void>;
  onRemove: (entry: MeasurementEntry) => void;
};

export default function BodyMeasurementsPanel({ entries, onSave, onRemove }: Props) {
  const [area, setArea] = useState<string>("Waist");
  const [customArea, setCustomArea] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  const [date, setDate] = useState(todayAsLocalDate());
  const [note, setNote] = useState("");
  const [chartArea, setChartArea] = useState("Waist");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const chartOptions = useMemo(() => {
    const byLabel = new Map<string, string>();
    for (const label of [...BODY_AREAS, ...entries.map(entry => entry.label)]) {
      const key = label.trim().toLocaleLowerCase();
      if (key && !byLabel.has(key)) byLabel.set(key, label.trim());
    }
    return [...byLabel.values()];
  }, [entries]);

  useEffect(() => {
    if (entries.some(entry => entry.label.toLocaleLowerCase() === chartArea.toLocaleLowerCase())) return;
    if (entries[0]) setChartArea(entries[0].label);
  }, [entries, chartArea]);

  const matching = useMemo(() => entries
    .filter(entry => entry.label.toLocaleLowerCase() === chartArea.toLocaleLowerCase())
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt)), [entries, chartArea]);
  const chartUnit = matching.at(-1)?.unit ?? "cm";
  const chartData = matching.map(entry => ({
    date: entry.date,
    label: formatDate(entry.date, { month: "short", day: "numeric" }),
    value: convertMeasurement(entry.value, entry.unit, chartUnit),
  }));
  const currentArea = area === CUSTOM_AREA ? customArea.trim() : area;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericValue = Number(value);
    if (!currentArea) {
      setError("Choose an area or enter a custom label.");
      return;
    }
    if (!Number.isFinite(numericValue) || numericValue < 0.1 || numericValue > 1000) {
      setError("Enter a measurement greater than zero.");
      return;
    }

    const now = new Date().toISOString();
    setSaving(true);
    try {
      await onSave({
        id: crypto.randomUUID(),
        date,
        label: currentArea,
        value: numericValue,
        unit,
        note: note.trim(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      setValue("");
      setNote("");
      setDate(todayAsLocalDate());
      setError("");
      setChartArea(currentArea);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="paper-panel body-measurements-panel">
      <header className="panel-heading">
        <div><div className="eyebrow">BODY MEASUREMENTS</div><h2>A little more than the scale.</h2></div>
        <Ruler size={18} className="heading-icon" />
      </header>
      <p className="measurement-intro">Save dated readings in centimeters or inches. Custom labels work for any area you want to follow.</p>

      <form className="measurement-form" onSubmit={event => void submit(event)}>
        <label className="field-block"><span>Date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label>
        <label className="field-block"><span>Body area</span><select value={area} onChange={event => setArea(event.target.value)}>{BODY_AREAS.map(item => <option key={item} value={item}>{item}</option>)}<option value={CUSTOM_AREA}>Custom area…</option></select></label>
        {area === CUSTOM_AREA && <label className="field-block measurement-custom-area"><span>Custom label</span><input value={customArea} onChange={event => setCustomArea(event.target.value)} maxLength={64} placeholder="e.g. Upper arm" required /></label>}
        <label className="field-block"><span>Measurement</span><div className="measurement-value-wrap"><input inputMode="decimal" type="number" step="0.1" min="0.1" max="1000" placeholder="0.0" value={value} onChange={event => setValue(event.target.value)} required /><select value={unit} onChange={event => setUnit(event.target.value as "cm" | "in")} aria-label="Measurement unit"><option value="cm">cm</option><option value="in">in</option></select></div></label>
        <label className="field-block measurement-note"><span>Note <small>optional</small></span><input value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="Anything to remember?" /></label>
        <button className="button button-primary measurement-submit" type="submit" disabled={saving}>{saving ? "Saving…" : "+ Add measurement"}</button>
        {error && <p className="form-error measurement-error" role="alert">{error}</p>}
      </form>

      <div className="measurement-trend-block">
        <label className="chart-select-label">TREND<select value={chartArea} onChange={event => setChartArea(event.target.value)}>{chartOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        {chartData.length ? (
          <div className="chart-wrap measurement-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#e7dfd1" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#82796e", fontSize: 10 }} minTickGap={20} />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} tickLine={false} axisLine={false} tick={{ fill: "#82796e", fontSize: 10 }} width={40} />
                <Tooltip formatter={(amount: number) => [`${formatNumber(amount)} ${chartUnit}`, chartArea]} contentStyle={{ borderRadius: 10, border: "1px solid #e7dfd1", background: "#fffcf5", fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#d97706" strokeWidth={2.5} dot={{ r: 4, fill: "#d97706", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="measurement-empty"><Ruler size={18} /><span>{entries.length ? `No ${chartArea.toLowerCase()} readings yet.` : "Your measurements will build a trend here."}</span></div>
        )}
      </div>

      <div className="measurement-history-list">
        <div className="measurement-history-heading"><strong>Recent readings</strong><span>{entries.length} total</span></div>
        {entries.length ? entries.slice(0, 8).map(entry => (
          <div className="measurement-history-row" key={entry.id}>
            <span className="measurement-row-mark">{entry.label.slice(0, 1).toUpperCase()}</span>
            <span className="measurement-row-main"><strong>{entry.label}</strong><small>{formatDate(entry.date)}{entry.note ? ` · ${entry.note}` : ""}</small></span>
            <span className="measurement-row-value">{formatNumber(entry.value)} {entry.unit}</span>
            <button className="icon-button small-icon" type="button" onClick={() => onRemove(entry)} aria-label={`Remove ${entry.label} measurement from ${formatDate(entry.date)}`}><Trash2 size={14} /></button>
          </div>
        )) : <p className="quiet-note">No measurements yet. Start with whichever area matters to you.</p>}
      </div>
    </section>
  );
}
