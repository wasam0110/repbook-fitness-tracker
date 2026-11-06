import { describe, expect, it } from "vitest";
import { buildCalorieSummaryCsv, buildPrintableCalorieReport, type CalorieExportReport } from "./calorie-export";
import type { WorkoutSession } from "@shared/tracker";

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "session-1",
    date: "2026-11-04",
    note: "",
    activityType: "strength",
    durationMinutes: 45,
    steps: null,
    effort: "moderate",
    bodyWeightKgUsed: 82,
    calorieEstimateKcal: 240,
    entries: [{
      id: "entry-1",
      exerciseId: "press",
      exerciseName: "Bench Press, Incline",
      sets: [{ id: "set-1", weight: 60, reps: 8, unit: "kg" }],
    }],
    createdAt: "2026-11-04T10:00:00.000Z",
    updatedAt: "2026-11-04T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function report(workouts: WorkoutSession[] = [session()]): CalorieExportReport {
  return {
    period: "week",
    startDate: "2026-11-02",
    endDate: "2026-11-08",
    totalKcal: 240,
    sessionCount: 1,
    workouts,
  };
}

describe("calorie summary exports", () => {
  it("creates an Excel-friendly CSV with period totals and per-workout details", () => {
    const csv = buildCalorieSummaryCsv(report());
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"summary","Week to date","2026-11-02","2026-11-08","240","1"');
    expect(csv).toContain('"workout","Week to date"');
    expect(csv).toContain('"Bench Press, Incline"');
    expect(csv).toContain('"240"');
  });

  it("neutralizes spreadsheet formula syntax in user-entered CSV fields", () => {
    const formulaName = session({
      entries: [{
        id: "entry-formula",
        exerciseId: "formula",
        exerciseName: "=HYPERLINK(\"https://example.invalid\")",
        sets: [{ id: "set-formula", weight: 10, reps: 5, unit: "kg" }],
      }],
    });
    expect(buildCalorieSummaryCsv(report([formulaName]))).toContain("'=HYPERLINK(");
  });

  it("excludes deleted, out-of-range, and unestimated workouts from export detail", () => {
    const csv = buildCalorieSummaryCsv(report([
      session(),
      session({ id: "deleted", deletedAt: "2026-11-05T10:00:00.000Z" }),
      session({ id: "outside", date: "2026-11-10" }),
      session({ id: "no-estimate", calorieEstimateKcal: null }),
    ]));
    expect(csv.match(/"workout"/g)).toHaveLength(1);
  });

  it("builds a printable report and escapes user-entered exercise text", () => {
    const unsafe = session({
      entries: [{
        id: "entry-xss",
        exerciseId: "xss",
        exerciseName: '<img src=x onerror="alert(1)">',
        sets: [{ id: "set-xss", weight: 10, reps: 5, unit: "kg" }],
      }],
    });
    const html = buildPrintableCalorieReport(report([unsafe]));
    expect(html).toContain("≈ 240 kcal");
    expect(html).toContain("2026-11-02 to 2026-11-08");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain('<img src=x');
  });

  it("renders a clean no-data message in an empty PDF report", () => {
    const html = buildPrintableCalorieReport({ ...report([]), totalKcal: 0, sessionCount: 0 });
    expect(html).toContain("No saved estimated-calorie workouts in this period.");
  });
});
