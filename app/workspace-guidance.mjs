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

export function normalizeFocusTaskIds(value, tasks, currentAreaId) {
  if (!Array.isArray(value) || value.length > 3 || value.some((id) => typeof id !== "string")) return null;
  const ids = [...new Set(value)];
  if (ids.length !== value.length) return null;
  const eligibleIds = new Set(tasks
    .filter((task) => task.areaId === currentAreaId && task.status !== "done" && !task.someday)
    .map((task) => task.id));
  return ids.every((id) => eligibleIds.has(id)) ? ids : null;
}

export function reconcileFocusTaskIdsAfterMove(focusTaskIds, movedTaskId, tasks, currentAreaId) {
  if (!focusTaskIds.includes(movedTaskId)) return focusTaskIds;
  return normalizeFocusTaskIds([movedTaskId], tasks, currentAreaId) ? focusTaskIds : focusTaskIds.filter((id) => id !== movedTaskId);
}

export function restoreFocusTaskAfterMove(focusTaskIds, movedTaskId, focusIndex, tasks, currentAreaId) {
  if (focusIndex === undefined || focusTaskIds.includes(movedTaskId) || focusTaskIds.length >= 3) return focusTaskIds;
  if (!normalizeFocusTaskIds([movedTaskId], tasks, currentAreaId)) return focusTaskIds;
  const restored = [...focusTaskIds];
  restored.splice(Math.min(focusIndex, restored.length), 0, movedTaskId);
  return restored;
}
