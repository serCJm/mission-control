export const REVIEW_STEP_COUNT = 5;

export function currentWeekKey(date = new Date(), timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const weekday = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - weekday);
  const weekYear = localDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((localDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export function emptyWeeklyReview(weekKey) {
  return { weekKey, completedSteps: [], intention: "" };
}

export function normalizeWeeklyReview(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.weekKey !== "string" || !/^\d{4}-W\d{2}$/.test(value.weekKey)) return null;
  if (!Array.isArray(value.completedSteps) || typeof value.intention !== "string" || value.intention.length > 2_000) return null;
  const completedSteps = [...new Set(value.completedSteps)];
  if (completedSteps.some((step) => !Number.isInteger(step) || step < 0 || step >= REVIEW_STEP_COUNT)) return null;
  return { weekKey: value.weekKey, completedSteps, intention: value.intention };
}
