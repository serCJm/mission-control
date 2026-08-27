export function normalizeTaskNotes(value) {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.length <= 20_000 ? value : null;
}

export function taskPlacementForDestination(value, projects) {
  if (value === "inbox") return { areaId: undefined, projectId: undefined, someday: undefined, waiting: undefined, status: "todo" };
  if (value.startsWith("backlog:")) return { areaId: value.slice(8), projectId: undefined, someday: true, waiting: undefined, status: "todo" };
  if (value.startsWith("waiting:")) return { areaId: value.slice(8), projectId: undefined, someday: undefined, waiting: true, status: "todo" };
  if (value.startsWith("project-waiting:")) {
    const project = projects.find((item) => item.id === value.slice(16));
    return project ? { areaId: project.areaId, projectId: project.id, someday: undefined, waiting: true, status: "todo" } : null;
  }
  if (!value.startsWith("project:")) return null;
  const project = projects.find((item) => item.id === value.slice(8));
  return project ? { areaId: project.areaId, projectId: project.id, someday: undefined, waiting: undefined, status: "todo" } : null;
}

export const TASK_STATUSES = ["todo", "doing", "done"];
export const TASK_STATUS_RANK = { todo: 0, doing: 1, done: 2 };

export function isTaskStatus(value) {
  return TASK_STATUSES.includes(value);
}
