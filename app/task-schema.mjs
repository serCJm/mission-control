export function normalizeTaskNotes(value) {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.length <= 20_000 ? value : null;
}

export const TASK_STATUSES = ["todo", "doing", "done"];
export const TASK_STATUS_RANK = { todo: 0, doing: 1, done: 2 };

export function isTaskStatus(value) {
  return TASK_STATUSES.includes(value);
}
