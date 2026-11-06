import type { WorkoutSession } from "@shared/tracker";

export type CalorieExportPeriod = "week" | "month";

export type CalorieExportReport = {
  period: CalorieExportPeriod;
  startDate: string;
  endDate: string;
  totalKcal: number;
  sessionCount: number;
  workouts: WorkoutSession[];
};

function reportSessions(report: CalorieExportReport): WorkoutSession[] {
  return report.workouts
    .filter(session =>
      !session.deletedAt &&
      session.calorieEstimateKcal !== null &&
      session.calorieEstimateKcal !== undefined &&
      session.date >= report.startDate &&
      session.date <= report.endDate,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function labelFor(period: CalorieExportPeriod): string {
  return period === "week" ? "Week to date" : "Month to date";
}

function exportFileName(report: CalorieExportReport): string {
  return `repbook-calories-${report.period}-${report.endDate}.csv`;
}

export function buildCalorieSummaryCsv(report: CalorieExportReport): string {
  const header = [
    "record_type",
    "period",
    "period_start",
    "period_end",
    "total_estimated_kcal",
    "estimated_session_count",
    "workout_date",
    "activity_type",
    "duration_minutes",
    "steps",
    "effort",
    "body_weight_kg_used",
    "estimated_calories_kcal",
    "exercises",
  ];
  const rows: (string | number | null | undefined)[][] = [
    header,
    ["summary", labelFor(report.period), report.startDate, report.endDate, report.totalKcal, report.sessionCount],
    ...reportSessions(report).map(session => [
      "workout",
      labelFor(report.period),
      report.startDate,
      report.endDate,
      "",
      "",
      session.date,
      session.activityType,
      session.durationMinutes,
      session.steps,
      session.effort,
      session.bodyWeightKgUsed,
      session.calorieEstimateKcal,
      session.entries.map(entry => entry.exerciseName).join("; "),
    ]),
  ];

  return `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function buildPrintableCalorieReport(report: CalorieExportReport): string {
  const sessions = reportSessions(report);
  const title = `RepBook ${labelFor(report.period)} calories`;
  const tableRows = sessions.length
    ? sessions.map(session => `<tr>
        <td>${escapeHtml(session.date)}</td>
        <td>${escapeHtml(session.activityType === "cardio" ? "Cardio" : "Strength")}${session.entries.length ? `<small>${escapeHtml(session.entries.map(entry => entry.exerciseName).join(" · "))}</small>` : ""}</td>
        <td>${escapeHtml(session.durationMinutes ?? "—")}</td>
        <td>${escapeHtml(session.steps === null || session.steps === undefined ? "—" : session.steps.toLocaleString())}</td>
        <td class="number">${escapeHtml(session.calorieEstimateKcal ?? "—")}</td>
      </tr>`).join("")
    : '<tr><td colspan="5" class="empty">No saved estimated-calorie workouts in this period.</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; color: #443a30; background: #f4ecde; font: 14px/1.5 Arial, sans-serif; }
    main { max-width: 1050px; margin: 0 auto; padding: 32px; background: #fffdf8; border: 1px solid #e2d4bf; border-radius: 16px; }
    .eyebrow { color: #8d785d; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 8px 0 4px; font: 500 28px/1.2 Georgia, serif; }
    .range { margin: 0; color: #897d6e; }
    .summary { display: flex; gap: 36px; margin: 24px 0; padding: 16px 0; border-block: 1px solid #e7dfd1; }
    .summary span { display: block; color: #897d6e; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .summary strong { display: block; margin-top: 3px; font: 500 24px Georgia, serif; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #eee7dd; text-align: left; vertical-align: top; }
    th { color: #8d785d; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    td small { display: block; margin-top: 3px; color: #897d6e; }
    .number { font-weight: 700; white-space: nowrap; }
    .empty { padding: 22px 8px; color: #897d6e; text-align: center; }
    .note { margin: 18px 0 0; color: #897d6e; font-size: 11px; }
    @media print { body { padding: 0; background: #fff; } main { max-width: none; padding: 0; border: 0; border-radius: 0; } }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">RepBook · Estimated calorie summary</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="range">${escapeHtml(report.startDate)} to ${escapeHtml(report.endDate)}</p>
    <section class="summary" aria-label="Summary totals">
      <div><span>Total estimated burn</span><strong>≈ ${escapeHtml(report.totalKcal.toLocaleString())} kcal</strong></div>
      <div><span>Workouts with an estimate</span><strong>${escapeHtml(report.sessionCount)}</strong></div>
    </section>
    <table>
      <thead><tr><th>Date</th><th>Workout</th><th>Duration (min)</th><th>Steps</th><th>Estimated kcal</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p class="note">Approximate estimates, not measured calorie expenditure. Previously saved workout estimates remain as logged; new estimates may use the profile age/height method.</p>
  </main>
</body>
</html>`;
}

export function downloadCalorieSummaryCsv(report: CalorieExportReport): void {
  const blob = new Blob([buildCalorieSummaryCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(report);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a printable report; the user can choose Save as PDF in the browser print dialog. */
export function openCalorieSummaryPdf(report: CalorieExportReport): boolean {
  if (typeof window === "undefined") return false;
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) return false;

  reportWindow.opener = null;
  reportWindow.document.open();
  reportWindow.document.write(buildPrintableCalorieReport(report));
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.setTimeout(() => reportWindow.print(), 300);
  return true;
}
