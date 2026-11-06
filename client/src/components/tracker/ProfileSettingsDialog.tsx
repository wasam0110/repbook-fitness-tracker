import { useEffect, useState, type FormEvent } from "react";
import { UserRound, X } from "lucide-react";
import { AthleteProfileSchema, type AthleteProfile } from "@shared/tracker";

type Props = {
  initialProfile: AthleteProfile | null;
  syncing: boolean;
  onSave: (profile: AthleteProfile) => Promise<void>;
  onClose: () => void;
  onSignOut: () => void;
};

function asInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ProfileSettingsDialog({ initialProfile, syncing, onSave, onClose, onSignOut }: Props) {
  const [weightKg, setWeightKg] = useState(asInput(initialProfile?.weightKg));
  const [heightCm, setHeightCm] = useState(asInput(initialProfile?.heightCm));
  const [ageYears, setAgeYears] = useState(asInput(initialProfile?.ageYears));
  const [editedFields, setEditedFields] = useState({ weight: false, height: false, age: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const profileWeight = initialProfile?.weightKg ?? null;
  const profileHeight = initialProfile?.heightCm ?? null;
  const profileAge = initialProfile?.ageYears ?? null;

  useEffect(() => {
    if (!editedFields.weight) setWeightKg(asInput(profileWeight));
    if (!editedFields.height) setHeightCm(asInput(profileHeight));
    if (!editedFields.age) setAgeYears(asInput(profileAge));
  }, [editedFields.age, editedFields.height, editedFields.weight, profileAge, profileHeight, profileWeight]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = AthleteProfileSchema.safeParse({
      weightKg: optionalNumber(weightKg),
      heightCm: optionalNumber(heightCm),
      ageYears: optionalNumber(ageYears),
      updatedAt: new Date().toISOString(),
    });
    if (!parsed.success) {
      setError("Check the values: weight, height, and age must be within the listed ranges.");
      return;
    }

    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      setError("Your profile could not be saved. It remains on this device; try again when connected.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal-sheet profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header className="modal-header">
          <div>
            <div className="eyebrow">ACCOUNT SETTINGS</div>
            <h2 id="profile-title">Your profile</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close profile settings"><X size={19} /></button>
        </header>
        <p className="profile-intro">Keep a few personal details with your account. They sync across devices and stay available in this browser when you are offline.</p>
        <form onSubmit={event => void submit(event)}>
          <div className="profile-fields">
            <label className="field-block">
              <span>Body weight <small>kg · optional</small></span>
              <input type="number" min="1" max="1000" step="0.1" inputMode="decimal" value={weightKg} onChange={event => { setEditedFields(current => ({ ...current, weight: true })); setWeightKg(event.target.value); }} placeholder="e.g. 82" />
            </label>
            <label className="field-block">
              <span>Height <small>cm · optional</small></span>
              <input type="number" min="50" max="300" step="0.1" inputMode="decimal" value={heightCm} onChange={event => { setEditedFields(current => ({ ...current, height: true })); setHeightCm(event.target.value); }} placeholder="e.g. 175" />
            </label>
            <label className="field-block profile-age-field">
              <span>Age <small>years · optional</small></span>
              <input type="number" min="1" max="120" step="1" inputMode="numeric" value={ageYears} onChange={event => { setEditedFields(current => ({ ...current, age: true })); setAgeYears(event.target.value); }} placeholder="e.g. 30" />
            </label>
          </div>
          <div className="profile-calorie-note">
            <strong>About calorie estimates</strong>
            <p>Profile weight is used only when there is no weigh-in dated on or before a workout. Age 60+ uses older-adult activity values. For adult cardio, height plus steps and duration can estimate walking pace; that distance is only a rough proxy. Height does not change strength estimates, and calories are not measured. Adult activity tables are not validated for people under 18.</p>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal-footer profile-modal-footer">
            <button className="button button-quiet profile-signout" type="button" onClick={onSignOut}><UserRound size={15} /> Sign out</button>
            <span className="profile-footer-spacer" />
            <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving || syncing}>{saving ? "Saving…" : syncing ? "Syncing…" : "Save profile"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
