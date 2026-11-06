import BodyWeightForm from "@/components/tracker/BodyWeightForm";
import AuthGate from "@/components/AuthGate";
import BodyMeasurementsPanel from "@/components/tracker/BodyMeasurementsPanel";
import ExerciseDialog, { type NewExercise } from "@/components/tracker/ExerciseDialog";
import ProgressPhotosPanel from "@/components/tracker/ProgressPhotosPanel";
import ProfileSettingsDialog from "@/components/tracker/ProfileSettingsDialog";
import WorkoutComposer from "@/components/tracker/WorkoutComposer";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTracker } from "@/lib/useTracker";
import { saveLocalProgressPhotoBlob } from "@/lib/local-data";
import { OwnerChangedError, runForActiveOwner } from "@/lib/owner-guard";
import { downloadCalorieSummaryCsv, openCalorieSummaryPdf } from "@/lib/calorie-export";
import { getExercises, getPreviousPerformance, formatDate, formatNumber, formatWeight, summarizeWorkoutCalories, todayAsLocalDate } from "@/lib/tracker-utils";
import { mergeTrackerSnapshots, TrackerSnapshotSchema, type AthleteProfile, type BodyWeightEntry, type MeasurementEntry, type ProgressPhoto, type WorkoutSession } from "@shared/tracker";
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, Check, ChevronRight, Cloud, Dumbbell, FileSpreadsheet, FileText, History, Home as HomeIcon, LoaderCircle, LogOut, Plus, Scale, TrendingUp, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Tab = "today" | "workouts" | "progress";

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><b /><em /></span>;
}

function SyncBadge({ status, offlineMode }: { status: "synced" | "syncing" | "offline" | "local"; offlineMode: boolean }) {
  if (offlineMode || status === "offline") return <span className="sync-badge offline"><WifiOff size={14} /> Saved offline</span>;
  if (status === "syncing") return <span className="sync-badge syncing"><LoaderCircle className="spin" size={14} /> Syncing</span>;
  if (status === "synced") return <span className="sync-badge synced"><Check size={14} /> Synced</span>;
  return <span className="sync-badge"><Cloud size={14} /> On this device</span>;
}

function mondayOf(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function kgValue(value: number, unit: "kg" | "lb", target: "kg" | "lb"): number {
  if (unit === target) return value;
  return unit === "lb" ? value * 0.45359237 : value / 0.45359237;
}

function recentLiftNames(workouts: WorkoutSession[]): { id: string; name: string; session: WorkoutSession }[] {
  const result = new Map<string, { id: string; name: string; session: WorkoutSession }>();
  for (const session of [...workouts].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const entry of session.entries) {
      if (!result.has(entry.exerciseId)) result.set(entry.exerciseId, { id: entry.exerciseId, name: entry.exerciseName, session });
    }
  }
  return [...result.values()].slice(0, 4);
}

function Brand() {
  return <div className="brand-lockup"><BrandMark /><span><strong>REPBOOK</strong><small>TRAINING JOURNAL</small></span></div>;
}

function EmptyPanel({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-panel"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function Home() {
  const auth = useAuth();
  const tracker = useTracker(auth.user, Boolean(auth.error), auth.refresh);
  const [tab, setTab] = useState<Tab>("today");
  const [showComposer, setShowComposer] = useState(false);
  const [editingSession, setEditingSession] = useState<WorkoutSession | null>(null);
  const [showExerciseDialog, setShowExerciseDialog] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [selectedLift, setSelectedLift] = useState("");
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const currentOwnerIdRef = useRef<string | null>(null);

  const profile = auth.user ? { userId: String(auth.user.id), name: auth.user.name || "Athlete" } : tracker.profile;
  const athleteProfile = tracker.snapshot.profile;
  currentOwnerIdRef.current = profile?.userId ?? null;
  const workouts = useMemo(() => tracker.snapshot.workouts.filter(item => !item.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)), [tracker.snapshot.workouts]);
  const weighIns = useMemo(() => tracker.snapshot.weighIns.filter(item => !item.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)), [tracker.snapshot.weighIns]);
  const measurements = useMemo(() => tracker.snapshot.measurements.filter(item => !item.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)), [tracker.snapshot.measurements]);
  const photos = useMemo(() => tracker.snapshot.photos.filter(item => !item.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)), [tracker.snapshot.photos]);
  const exercises = useMemo(() => getExercises(tracker.snapshot), [tracker.snapshot]);
  const todayDate = todayAsLocalDate();
  const weekStartDate = mondayOf(todayDate);
  const monthStartDate = `${todayDate.slice(0, 7)}-01`;
  const weeklyWorkouts = workouts.filter(item => item.date >= weekStartDate && item.date <= todayDate);
  const weeklyCalories = summarizeWorkoutCalories(workouts, weekStartDate, todayDate);
  const monthlyCalories = summarizeWorkoutCalories(workouts, monthStartDate, todayDate);
  const latestWeight = weighIns[0] ?? null;
  const previousWeight = weighIns[1] ?? null;
  const weightDelta = latestWeight && previousWeight
    ? kgValue(latestWeight.weight, latestWeight.unit, previousWeight.unit) - previousWeight.weight
    : null;
  const recentLifts = recentLiftNames(workouts);
  const chosenLift = selectedLift || recentLifts[0]?.id || exercises[0]?.id || "";
  const liftSeriesUnit = useMemo(() => {
    const mostRecentSession = workouts.find(session => session.entries.some(entry => entry.exerciseId === chosenLift));
    return mostRecentSession?.entries.find(entry => entry.exerciseId === chosenLift)?.sets[0]?.unit ?? "kg";
  }, [chosenLift, workouts]);
  const liftChartData = useMemo(() => [...workouts].reverse().flatMap(session => {
    const entry = session.entries.find(item => item.exerciseId === chosenLift);
    if (!entry) return [];
    const best = entry.sets.reduce((currentBest, candidate) =>
      kgValue(candidate.weight, candidate.unit, liftSeriesUnit) > kgValue(currentBest.weight, currentBest.unit, liftSeriesUnit)
        ? candidate
        : currentBest,
    entry.sets[0]);
    return [{
      date: session.date,
      label: formatDate(session.date, { month: "short", day: "numeric" }),
      weight: kgValue(best.weight, best.unit, liftSeriesUnit),
      unit: liftSeriesUnit,
      reps: best.reps,
    }];
  }), [chosenLift, liftSeriesUnit, workouts]);

  useEffect(() => {
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  if ((auth.loading || !tracker.ready || (auth.user && tracker.profile?.userId !== String(auth.user.id))) && !tracker.offlineMode) {
    return <main className="loading-screen"><Brand /><div className="loading-wheel"><LoaderCircle className="spin" size={24} /></div><p>Opening your training log…</p></main>;
  }

  if (auth.needsPasswordUpdate && auth.isAuthenticated) return <AuthGate auth={auth} forcePasswordUpdate />;

  if (!profile || (!auth.isAuthenticated && !tracker.offlineMode)) {
    return <AuthGate auth={auth} />;
  }

  const ownerUserId = profile.userId;

  function openNewWorkout() {
    setEditingSession(null);
    setShowComposer(true);
  }

  async function saveWorkout(session: WorkoutSession) {
    const workoutsNext = [...tracker.snapshot.workouts.filter(item => item.id !== session.id), session];
    const next = { ...tracker.snapshot, workouts: workoutsNext, updatedAt: new Date().toISOString() };
    await tracker.saveChanges(next);
    setShowComposer(false);
    setEditingSession(null);
    toast.success(editingSession ? "Workout updated" : "Workout saved", { description: "Your log is safe on this device and will sync when you're online." });
  }

  async function saveBodyWeight(entry: BodyWeightEntry) {
    const next = { ...tracker.snapshot, weighIns: [...tracker.snapshot.weighIns, entry], updatedAt: new Date().toISOString() };
    await tracker.saveChanges(next);
    toast.success("Weigh-in saved");
  }

  async function saveAthleteProfile(nextProfile: AthleteProfile) {
    const next = { ...tracker.snapshot, profile: nextProfile, updatedAt: new Date().toISOString() };
    await tracker.saveChanges(next);
    setShowProfileSettings(false);
    toast.success("Profile saved", { description: "Your details are stored locally and will sync with your account when connected." });
  }

  async function saveMeasurement(entry: MeasurementEntry) {
    const next = { ...tracker.snapshot, measurements: [...tracker.snapshot.measurements, entry], updatedAt: new Date().toISOString() };
    await tracker.saveChanges(next);
    toast.success("Measurement saved");
  }

  async function removeMeasurement(entry: MeasurementEntry) {
    if (!window.confirm(`Remove the ${entry.label} measurement from ${formatDate(entry.date)}?`)) return;
    const now = new Date().toISOString();
    const next = {
      ...tracker.snapshot,
      measurements: tracker.snapshot.measurements.map(item => item.id === entry.id ? { ...item, deletedAt: now, updatedAt: now } : item),
      updatedAt: now,
    };
    await tracker.saveChanges(next);
    toast.success("Measurement removed");
  }

  async function saveProgressPhoto(photo: ProgressPhoto, blob: Blob, expectedOwnerId: string) {
    let cachedOnDevice = true;
    try {
      await runForActiveOwner(expectedOwnerId, () => currentOwnerIdRef.current, () => saveLocalProgressPhotoBlob(expectedOwnerId, photo.id, blob));
    } catch (error) {
      if (error instanceof OwnerChangedError) throw error;
      cachedOnDevice = false;
    }
    const next = { ...tracker.snapshot, photos: [...tracker.snapshot.photos, photo], updatedAt: new Date().toISOString() };
    await runForActiveOwner(expectedOwnerId, () => currentOwnerIdRef.current, () => tracker.saveChanges(next, expectedOwnerId));
    if (!cachedOnDevice) {
      toast.message("Photo saved to your account", { description: "This browser could not keep an offline photo copy." });
    }
  }

  async function removeProgressPhoto(photo: ProgressPhoto) {
    const now = new Date().toISOString();
    const next = {
      ...tracker.snapshot,
      photos: tracker.snapshot.photos.map(item => item.id === photo.id ? { ...item, deletedAt: now, updatedAt: now } : item),
      updatedAt: now,
    };
    await tracker.saveChanges(next);
    toast.message("Photo removed from the timeline", { description: "Its private storage file will be deleted when the change syncs." });
  }

  async function saveExercise(exercise: NewExercise) {
    const next = { ...tracker.snapshot, exercises: [...tracker.snapshot.exercises.filter(item => item.id !== exercise.id), exercise], updatedAt: new Date().toISOString() };
    await tracker.saveChanges(next);
    setShowExerciseDialog(false);
    toast.success("Exercise added to your library");
  }

  async function removeWorkout(session: WorkoutSession) {
    if (!window.confirm(`Remove the ${formatDate(session.date)} workout from your history?`)) return;
    const now = new Date().toISOString();
    const next = { ...tracker.snapshot, workouts: tracker.snapshot.workouts.map(item => item.id === session.id ? { ...item, deletedAt: now, updatedAt: now } : item), updatedAt: now };
    await tracker.saveChanges(next);
    toast.success("Workout removed");
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ format: "repbook-backup", version: 1, exportedAt: new Date().toISOString(), data: tracker.snapshot }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `repbook-backup-${todayAsLocalDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("JSON backup downloaded");
  }

  function exportCalorieCsv(period: "week" | "month") {
    const startDate = period === "week" ? weekStartDate : monthStartDate;
    const summary = period === "week" ? weeklyCalories : monthlyCalories;
    downloadCalorieSummaryCsv({ period, startDate, endDate: todayDate, ...summary, workouts });
    toast.success(`${period === "week" ? "Weekly" : "Monthly"} calorie CSV downloaded`);
  }

  function exportCaloriePdf(period: "week" | "month") {
    const startDate = period === "week" ? weekStartDate : monthStartDate;
    const summary = period === "week" ? weeklyCalories : monthlyCalories;
    if (!openCalorieSummaryPdf({ period, startDate, endDate: todayDate, ...summary, workouts })) {
      toast.error("Allow pop-ups to open the printable calorie report.");
      return;
    }
    toast.message("Print dialog opened", { description: "Choose Save as PDF to download this summary." });
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as { data?: unknown };
      const parsed = TrackerSnapshotSchema.safeParse(raw?.data ?? raw);
      if (!parsed.success) throw new Error("That file does not look like a RepBook JSON backup.");
      const ownerPrefix = `users/${ownerUserId}/`;
      const accountPhotos = parsed.data.photos.filter(photo => photo.storageKey.startsWith(ownerPrefix));
      const omittedPhotoCount = parsed.data.photos.length - accountPhotos.length;
      const importable = { ...parsed.data, photos: accountPhotos };
      const merged = mergeTrackerSnapshots(tracker.snapshot, importable);
      await tracker.saveChanges({ ...merged, updatedAt: new Date().toISOString() });
      toast.success("Backup imported", { description: omittedPhotoCount ? `Tracker records were merged. ${omittedPhotoCount} photo record(s) from another account were skipped; download those photos separately before switching accounts.` : "Imported records were merged with your current log." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that backup file.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function logout() {
    try {
      if (auth.isAuthenticated) await auth.logout();
    } catch {
      toast.message("Signed out on this device", { description: "Your account session will close when the connection is restored." });
    } finally {
      tracker.signOutLocally();
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  const syncText = tracker.offlineMode ? "Offline mode" : tracker.syncStatus === "synced" ? "All changes saved" : tracker.syncStatus === "syncing" ? "Syncing changes" : "Device copy ready";

  return (
    <div className="app-shell">
      <aside className="desktop-rail">
        <Brand />
        <div className="rail-section-label">YOUR SPACE</div>
        <nav className="rail-nav" aria-label="Main navigation">
          <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><HomeIcon size={18} /><span>Overview</span></button>
          <button className={tab === "workouts" ? "active" : ""} onClick={() => setTab("workouts")}><History size={18} /><span>Workout log</span><i>{workouts.length}</i></button>
          <button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}><TrendingUp size={18} /><span>Stats</span></button>
        </nav>
        <div className="rail-spacer" />
        <div className="rail-quote"><span className="rail-quote-line" /><p>Numbers fade.<br /><strong>Your log remembers.</strong></p><small>REPBOOK FIELD NOTE 001</small></div>
        <div className="rail-profile"><div className="avatar-initial">{profile.name.trim().charAt(0).toUpperCase() || "A"}</div><div className="profile-copy"><strong>{profile.name}</strong><small>{tracker.offlineMode ? "Saved on this device" : "Personal training log"}</small></div><button className="rail-logout" onClick={() => void logout()} aria-label="Sign out"><LogOut size={16} /></button></div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="topbar-date"><span className="topbar-date-label">TRAINING JOURNAL</span><span>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></div>
          <div className="topbar-actions">
            <SyncBadge status={tracker.syncStatus} offlineMode={tracker.offlineMode} />
            {installPrompt && <button className="button button-install" onClick={() => void installApp()}>Install app</button>}
            <button className="top-icon-action" title="Export JSON backup" onClick={exportBackup}><ArrowDownToLine size={17} /><span>Backup</span></button>
            <button className="avatar-button" onClick={() => setShowProfileSettings(true)} title="Profile settings" aria-label="Open profile settings">{profile.name.trim().charAt(0).toUpperCase() || "A"}</button>
          </div>
        </header>

        <main className="content-wrap">
          {tracker.offlineMode && <div className="offline-banner"><WifiOff size={16} /><span>You're offline. New entries are saved on this device and will sync after you reconnect.</span></div>}
          {tab === "today" && <>
            <section className="page-heading"><div><div className="eyebrow">YOUR TRAINING JOURNAL</div><h1>Good work, {profile.name.split(" ")[0]}.</h1><p>Every rep is a receipt. Here's what's on record.</p></div><div className="page-index">VOL. 01 <span>—</span> TODAY</div></section>
            <section className="overview-top-grid">
              <article className="hero-card">
                <div className="hero-rule"><span>THE TRAINING LOG</span><span>{todayAsLocalDate().replaceAll("-", " / ")}</span></div>
                <div className="hero-copy"><p className="hero-kicker">DON'T GUESS WHAT YOU LIFTED.</p><h2>Last time is<br /><em>right here.</em></h2><p>Start a session. Your previous sets are waiting on the page.</p><button className="button button-accent" onClick={openNewWorkout}><Plus size={18} /> Log a workout <span aria-hidden="true">↗</span></button></div>
                <div className="hero-stamp"><span>RB</span><small>REPEAT<br />BETTER</small></div>
              </article>
              <div className="overview-side">
                <article className="stat-card stat-ink"><div className="stat-top"><span>THIS WEEK</span><CalendarDays size={17} /></div><strong>{String(weeklyWorkouts.length).padStart(2, "0")}</strong><p>workout{weeklyWorkouts.length === 1 ? "" : "s"} logged</p><div className="stat-bottom-line"><span>{weeklyWorkouts.length ? "Keep the rhythm." : "The page is yours."}</span><span>↗</span></div></article>
                <article className="stat-card stat-paper"><div className="stat-top"><span>LATEST WEIGH-IN</span><Scale size={17} /></div>{latestWeight ? <><strong>{formatNumber(latestWeight.weight)}<small> {latestWeight.unit}</small></strong><p>{formatDate(latestWeight.date, { month: "short", day: "numeric" })}{weightDelta !== null && <span className={weightDelta <= 0 ? "trend-down" : "trend-up"}> · {weightDelta > 0 ? "+" : ""}{formatNumber(weightDelta)} {previousWeight?.unit}</span>}</p></> : <><strong className="stat-empty">—</strong><p>Add your first weigh-in</p></>}<div className="stat-bottom-line"><button onClick={() => setTab("progress")}>View progress <span>↗</span></button><span className="stat-dot" /></div></article>
              </div>
            </section>

            <section className="overview-lower-grid">
              <article className="paper-panel recent-panel">
                <header className="panel-heading"><div><div className="eyebrow">THE ARCHIVE</div><h2>Recent workouts</h2></div><button className="text-action" onClick={() => setTab("workouts")}>Full log <ChevronRight size={16} /></button></header>
                {workouts.length ? <div className="recent-list">{workouts.slice(0, 3).map((session, index) => <button className="recent-row" key={session.id} onClick={() => { setEditingSession(session); setShowComposer(true); }}><span className="recent-index">{String(index + 1).padStart(2, "0")}</span><span className="recent-main"><strong>{session.entries.length ? <>{session.entries.map(entry => entry.exerciseName).slice(0, 2).join(" · ")}{session.entries.length > 2 ? ` +${session.entries.length - 2}` : ""}</> : session.activityType === "cardio" ? "Cardio session" : "Strength session"}</strong><small>{formatDate(session.date)}{session.note ? ` · ${session.note}` : ""}</small></span><span className="recent-count">{session.entries.reduce((sum, entry) => sum + entry.sets.length, 0)} SETS</span><ChevronRight size={16} /></button>)}</div> : <EmptyPanel icon={<Dumbbell size={20} />} title="Your first session starts here" body="Log a workout and this page will keep the details for next time." action={<button className="text-action" onClick={openNewWorkout}>Start a log <ChevronRight size={15} /></button>} />}
              </article>
              <article className="paper-panel last-time-panel">
                <header className="panel-heading"><div><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h2>Last time, you did…</h2></div><History size={18} className="heading-icon" /></header>
                {recentLifts.length ? <div className="last-time-list">{recentLifts.slice(0, 3).map(lift => {
                  const prior = getPreviousPerformance(lift.id, workouts, todayAsLocalDate());
                  return <div className="last-time-row" key={lift.id}><span className="last-time-bullet">↗</span><div><strong>{lift.name}</strong><small>{prior ? `${prior.label} · ${formatDate(prior.session.date, { month: "short", day: "numeric" })}` : formatDate(lift.session.date, { month: "short", day: "numeric" })}</small></div><span className="last-time-values">{prior ? prior.exercise.sets.map(set => `${formatNumber(set.weight)}×${set.reps}`).join(" / ") : lift.session.entries.find(entry => entry.exerciseId === lift.id)?.sets.map(set => `${formatNumber(set.weight)}×${set.reps}`).join(" / ")}</span></div>;
                })}</div> : <div className="quiet-note">Once you have a session in the book, your last numbers show up here.</div>}
                <div className="panel-footnote"><span /> LAST WEEK FIRST. MOST RECENT IF NONE.</div>
              </article>
            </section>

            <section className="paper-panel weigh-in-panel">
              <header className="panel-heading"><div><div className="eyebrow">BODY CHECK-IN</div><h2>Keep a steady measure.</h2></div><Scale size={18} className="heading-icon" /></header>
              <div className="weight-entry-layout"><div className="weight-intro"><p>One reading at a time. Your longer view is more useful than any single day.</p>{latestWeight && <div className="latest-weight-note"><span>LAST ENTRY</span><strong>{formatNumber(latestWeight.weight)} {latestWeight.unit}</strong><small>{formatDate(latestWeight.date)}</small></div>}</div><BodyWeightForm onSave={entry => void saveBodyWeight(entry)} /></div>
            </section>
            <div className="footer-note"><span className="footer-mark">RB</span><span>{syncText}</span><span>YOUR DATA, YOUR PACE.</span></div>
          </>}

          {tab === "workouts" && <>
            <section className="page-heading"><div><div className="eyebrow">THE ARCHIVE</div><h1>Workout log</h1><p>Every session. Every set. No second-guessing.</p></div><button className="button button-primary" onClick={openNewWorkout}><Plus size={17} /> Log workout</button></section>
            <section className="history-summary-row"><div><strong>{workouts.length.toString().padStart(2, "0")}</strong><span>sessions on record</span></div><div><strong>{workouts.reduce((sum, session) => sum + session.entries.reduce((entrySum, entry) => entrySum + entry.sets.length, 0), 0).toString().padStart(2, "0")}</strong><span>sets logged</span></div><div><strong>{new Set(workouts.flatMap(session => session.entries.map(entry => entry.exerciseId))).size.toString().padStart(2, "0")}</strong><span>exercises trained</span></div></section>
            {workouts.length ? <div className="history-list">{workouts.map(session => <article className="history-card" key={session.id}><header className="history-card-head"><div className="history-date-mark"><span>{new Date(`${session.date}T12:00:00`).toLocaleDateString(undefined, { day: "2-digit" })}</span><small>{new Date(`${session.date}T12:00:00`).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</small></div><div className="history-head-copy"><div className="eyebrow">{formatDate(session.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div><h2>{session.entries.length ? <>{session.entries.map(entry => entry.exerciseName).slice(0, 2).join(" · ")}{session.entries.length > 2 ? ` +${session.entries.length - 2}` : ""}</> : session.activityType === "cardio" ? "Cardio session" : "Strength session"}</h2>{session.note && <p>{session.note}</p>}</div><div className="history-card-actions"><span className="history-set-count">{session.entries.reduce((sum, entry) => sum + entry.sets.length, 0)} SETS</span><button className="text-action" onClick={() => { setEditingSession(session); setShowComposer(true); }}>Edit</button><button className="icon-button small-icon" onClick={() => void removeWorkout(session)} aria-label="Remove workout"><X size={17} /></button></div></header><div className="session-burn-summary"><span>{session.activityType === "cardio" ? "CARDIO" : "STRENGTH"}{session.durationMinutes ? ` · ${session.durationMinutes} MIN` : ""}{session.steps !== null && session.steps !== undefined ? ` · ${session.steps.toLocaleString()} STEPS` : ""}</span>{session.calorieEstimateKcal !== null && session.calorieEstimateKcal !== undefined && <strong>≈ {session.calorieEstimateKcal} kcal estimated</strong>}</div>{session.entries.length > 0 && <div className="history-exercises">{session.entries.map(entry => <div className="history-exercise-row" key={entry.id}><div className="history-exercise-name"><span className="exercise-tick" /><strong>{entry.exerciseName}</strong></div><div className="history-set-chips">{entry.sets.map((set, index) => <span key={set.id}><small>{String(index + 1).padStart(2, "0")}</small>{formatWeight(set.weight, set.unit)} <i>×</i> {set.reps}</span>)}</div></div>)}</div>}</article>)}</div> : <article className="paper-panel"><EmptyPanel icon={<History size={20} />} title="No workouts on record" body="Your sessions will be saved here, sorted by date." action={<button className="button button-primary" onClick={openNewWorkout}><Plus size={16} /> Log your first workout</button>} /></article>}
          </>}

          {tab === "progress" && <>
            <section className="page-heading"><div><div className="eyebrow">THE LONG VIEW</div><h1>Your stats, in ink.</h1><p>Weekly/monthly calorie estimates, body measures, workouts, and photos—kept in one timeline.</p></div><div className="page-index">BODY <span>+</span> PERFORMANCE</div></section>
            <section className="progress-overview-grid">
              <article className="progress-stat-card"><div className="eyebrow">LATEST BODY WEIGHT</div><strong>{latestWeight ? <>{formatNumber(latestWeight.weight)}<small> {latestWeight.unit}</small></> : "—"}</strong><p>{latestWeight ? `Recorded ${formatDate(latestWeight.date)}` : "Add a weigh-in to start the line."}</p></article>
              <article className="progress-stat-card accent-stat"><div className="eyebrow">WORKOUT SESSIONS</div><strong>{workouts.length.toString().padStart(2, "0")}</strong><p>Saved sessions to compare over time.</p></article>
              <article className="progress-stat-card"><div className="eyebrow">EXERCISES ON FILE</div><strong>{new Set(workouts.flatMap(session => session.entries.map(entry => entry.exerciseId))).size.toString().padStart(2, "0")}</strong><p>Movements you've recorded.</p></article>
            </section>
            <section className="calorie-summary-grid" aria-label="Estimated calorie summaries">
              <article className="calorie-summary-card">
                <div className="eyebrow">ESTIMATED CALORIES · THIS WEEK</div>
                <strong>{weeklyCalories.sessionCount ? <>≈ {formatNumber(weeklyCalories.totalKcal)}<small> kcal</small></> : "—"}</strong>
                <p>{weeklyCalories.sessionCount ? `From ${weeklyCalories.sessionCount} workout estimate${weeklyCalories.sessionCount === 1 ? "" : "s"} · Monday to today` : "No saved calorie estimates this week."}</p>
                <div className="calorie-summary-actions" aria-label="Export weekly calorie summary">
                  <button className="calorie-export-button" type="button" onClick={() => exportCalorieCsv("week")}><FileSpreadsheet size={13} /> CSV</button>
                  <button className="calorie-export-button" type="button" onClick={() => exportCaloriePdf("week")}><FileText size={13} /> PDF</button>
                </div>
              </article>
              <article className="calorie-summary-card calorie-summary-month">
                <div className="eyebrow">ESTIMATED CALORIES · THIS MONTH</div>
                <strong>{monthlyCalories.sessionCount ? <>≈ {formatNumber(monthlyCalories.totalKcal)}<small> kcal</small></> : "—"}</strong>
                <p>{monthlyCalories.sessionCount ? `From ${monthlyCalories.sessionCount} workout estimate${monthlyCalories.sessionCount === 1 ? "" : "s"} · month to date` : "No saved calorie estimates this month."}</p>
                <div className="calorie-summary-actions" aria-label="Export monthly calorie summary">
                  <button className="calorie-export-button" type="button" onClick={() => exportCalorieCsv("month")}><FileSpreadsheet size={13} /> CSV</button>
                  <button className="calorie-export-button" type="button" onClick={() => exportCaloriePdf("month")}><FileText size={13} /> PDF</button>
                </div>
              </article>
              <p className="calorie-summary-footnote">Approximate MET estimates only. A dated weigh-in is preferred; profile weight is the fallback. Age uses 60+ activity values where applicable; height plus steps can approximate walking pace.</p>
            </section>
            <section className="chart-grid">
              <article className="paper-panel chart-panel"><header className="panel-heading"><div><div className="eyebrow">BODY WEIGHT</div><h2>Trend over time</h2></div><span className="chart-tag">{latestWeight?.unit ?? "kg"}</span></header>{weighIns.length > 0 ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={[...weighIns].reverse().map(item => ({ ...item, displayWeight: kgValue(item.weight, item.unit, latestWeight?.unit ?? "kg"), label: formatDate(item.date, { month: "short", day: "numeric" }) }))} margin={{ top: 12, right: 10, left: -16, bottom: 0 }}><defs><linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d97706" stopOpacity={0.23} /><stop offset="95%" stopColor="#d97706" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#e7dfd1" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#82796e", fontSize: 11 }} minTickGap={24} /><YAxis domain={["dataMin - 2", "dataMax + 2"]} tickLine={false} axisLine={false} tick={{ fill: "#82796e", fontSize: 11 }} width={44} /><Tooltip formatter={(value: number) => [`${formatNumber(value)} ${latestWeight?.unit ?? "kg"}`, "Weight"]} contentStyle={{ borderRadius: 10, border: "1px solid #e7dfd1", background: "#fffcf5", fontSize: 12 }} /><Area type="monotone" dataKey="displayWeight" stroke="#d97706" strokeWidth={2.5} fill="url(#weightFill)" dot={{ r: 5, fill: "#d97706", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#d97706", stroke: "#fff" }} /></AreaChart></ResponsiveContainer></div> : <EmptyPanel icon={<Scale size={20} />} title={weighIns.length ? "One dot begins a line" : "Start with a weigh-in"} body="Add a dated weigh-in to see it plotted here; more readings will reveal the trend." />}<div className="chart-panel-foot"><span>{weighIns.length} reading{weighIns.length === 1 ? "" : "s"} logged</span>{weightDelta !== null && <span className={weightDelta <= 0 ? "trend-down" : "trend-up"}>{weightDelta > 0 ? "+" : ""}{formatNumber(weightDelta)} {previousWeight?.unit} since last entry</span>}</div></article>
              <article className="paper-panel chart-panel"><header className="panel-heading"><div><div className="eyebrow">LIFTING PERFORMANCE</div><h2>Best set over time</h2></div><span className="chart-tag">{liftSeriesUnit}</span></header><label className="chart-select-label">EXERCISE<select value={chosenLift} onChange={event => setSelectedLift(event.target.value)}><option value="">Choose an exercise</option>{exercises.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label>{chosenLift && liftChartData.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={liftChartData} margin={{ top: 12, right: 10, left: -16, bottom: 0 }}><CartesianGrid stroke="#e7dfd1" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#82796e", fontSize: 11 }} minTickGap={24} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#82796e", fontSize: 11 }} width={44} /><Tooltip formatter={(value: number, _name: string, item: any) => [`${formatWeight(value, item.payload.unit)} × ${item.payload.reps}`, "Best set"]} contentStyle={{ borderRadius: 10, border: "1px solid #e7dfd1", background: "#fffcf5", fontSize: 12 }} /><Line type="monotone" dataKey="weight" stroke="#292524" strokeWidth={2.5} dot={{ r: 4, fill: "#d97706", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></div> : <EmptyPanel icon={<TrendingUp size={20} />} title="No lift trend yet" body="Choose an exercise and log it in a few sessions to compare your strongest set." />}<div className="chart-panel-foot"><span>HEAVIEST SET EACH SESSION · SHOWN IN {liftSeriesUnit.toUpperCase()}</span><button className="text-action" onClick={openNewWorkout}>Add a session <ChevronRight size={15} /></button></div></article>
            </section>
            <section className="progress-lower-grid"><article className="paper-panel body-log-panel"><header className="panel-heading"><div><div className="eyebrow">BODY CHECK-IN</div><h2>Recent weigh-ins</h2></div><Scale size={18} className="heading-icon" /></header>{weighIns.length ? <div className="weigh-in-list">{weighIns.slice(0, 6).map((item, index) => <div className="weigh-in-row" key={item.id}><span className="weigh-in-index">{String(index + 1).padStart(2, "0")}</span><strong>{formatDate(item.date)}</strong><span>{formatWeight(item.weight, item.unit)}</span></div>)}</div> : <p className="quiet-note">No readings yet. Add a weigh-in below.</p>}<BodyWeightForm onSave={entry => void saveBodyWeight(entry)} /></article><article className="export-panel"><div className="eyebrow">KEEP YOUR OWN COPY</div><h2>Your data<br />travels with you.</h2><p>Export a JSON backup any time, or import one to merge it with this log.</p><div className="export-actions"><button className="button button-light" onClick={exportBackup}><ArrowDownToLine size={16} /> Export JSON</button><button className="button button-outline-light" onClick={() => importRef.current?.click()}><ArrowUpFromLine size={16} /> Import backup</button></div><div className="export-divider" /><small>Measurements are in the JSON backup. Photo files are account-stored; download them individually before switching accounts.</small></article></section>
            <section className="progress-media-grid">
              <BodyMeasurementsPanel entries={measurements} onSave={entry => saveMeasurement(entry)} onRemove={entry => void removeMeasurement(entry)} />
              <ProgressPhotosPanel userId={profile.userId} getActiveUserId={() => currentOwnerIdRef.current} photos={photos} offlineMode={tracker.offlineMode} canAccessAccountPhotos={auth.isAuthenticated} onSave={(photo, blob, expectedOwnerId) => saveProgressPhoto(photo, blob, expectedOwnerId)} onRemove={photo => void removeProgressPhoto(photo)} />
            </section>
          </>}

          <footer className="mobile-footer-note"><span>REPBOOK · TRAINING JOURNAL</span><span>{syncText}</span></footer>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Main navigation"><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><HomeIcon size={19} /><span>Today</span></button><button className={tab === "workouts" ? "active" : ""} onClick={() => setTab("workouts")}><History size={19} /><span>Log</span></button><button className="mobile-log-button" onClick={openNewWorkout} aria-label="Log workout"><Plus size={22} /></button><button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}><TrendingUp size={19} /><span>Stats</span></button><button onClick={exportBackup}><ArrowDownToLine size={19} /><span>Backup</span></button></nav>

      {showComposer && <WorkoutComposer exercises={exercises} workouts={workouts} weighIns={weighIns} athleteProfile={athleteProfile} existing={editingSession} onClose={() => { setShowComposer(false); setEditingSession(null); }} onSave={session => void saveWorkout(session)} onAddExercise={() => setShowExerciseDialog(true)} />}
      {showExerciseDialog && <ExerciseDialog onClose={() => setShowExerciseDialog(false)} onSave={exercise => void saveExercise(exercise)} />}
      {showProfileSettings && <ProfileSettingsDialog initialProfile={athleteProfile} syncing={tracker.syncStatus === "syncing"} onSave={saveAthleteProfile} onClose={() => setShowProfileSettings(false)} onSignOut={() => void logout()} />}
      <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={event => void importBackup(event.target.files?.[0])} />
    </div>
  );
}

export default Home;
