import { normalizeArea } from "./area-schema.mjs";
import { normalizeProject } from "./project-note-schema.mjs";
import { isPlannerDeadline, normalizePlanner } from "./planner-schema.mjs";
import { normalizeRoutines } from "./routine-schema.mjs";
import { isTaskStatus, normalizeTaskNotes } from "./task-schema.mjs";
import { normalizeWeeklyReview } from "./workspace-guidance.mjs";

type AreaIconName = "target" | "trend" | "sprout" | "people" | "briefcase" | "heart" | "home" | "book" | "calendar" | "clock" | "star" | "flag" | "wallet" | "chart" | "dumbbell" | "music" | "camera" | "plane" | "car" | "utensils" | "leaf" | "paw" | "globe" | "palette";
type Area = { id: string; name: string; icon: AreaIconName };
type ProjectNote = { id: string; title: string; body: string; pinned: boolean; createdAt: number; updatedAt: number };
type Project = { id: string; areaId: string; name: string; outcome: string; notes: ProjectNote[]; completedAt?: number };
type Task = {
  id: string;
  title: string;
  areaId?: string;
  projectId?: string;
  status: "todo" | "doing" | "done";
  createdAt: number;
  dueDate?: string;
  dueTime?: string;
  priority?: "high" | "medium" | "low";
  notes?: string;
  someday?: boolean;
  waiting?: boolean;
};
type WeeklyReview = { weekKey: string; completedSteps: number[]; intention: string };
type RoutineChecklistItem = { id: string; text: string };
type RoutineSession = { date: string; status: "pending" | "completed" | "skipped" | "missed"; checklist: Array<RoutineChecklistItem & { checked: boolean }>; updatedAt: number };
type RoutineSuspension = { id: string; kind: "pause" | "vacation"; startsOn: string; endsOn?: string };
type RoutineSchedule = { weekdays: number[]; allDay: boolean; windowStart?: string; windowEnd?: string; effectiveOn?: string };
type Routine = RoutineSchedule & { id: string; areaId: string; name: string; expectedMinutes: number; scheduleEffectiveOn: string; checklist: RoutineChecklistItem[]; suspensions: RoutineSuspension[]; sessions: RoutineSession[]; pendingSchedule?: RoutineSchedule };
type Planner = {
  blockRules: Array<({ id: string; kind: "area"; areaId: string } | { id: string; kind: "standalone"; title: string }) & { weekdays: number[]; effectiveOn: string; endsOn?: string; startTime: string; endTime: string; fill: "sage" | "sky" | "sand" | "rose" | "lilac" | "slate" }>;
  blockExceptions: Array<{ id: string; ruleId: string; occurrenceDate: string; kind: "skip" | "override"; date?: string; startTime?: string; endTime?: string }>;
  blockItems: Array<{ id: string; ruleId: string; occurrenceDate: string; kind: "task" | "routine"; itemId: string }>;
};
export type Workspace = { areas: Area[]; projects: Project[]; tasks: Task[]; routines: Routine[]; planner: Planner; weeklyReview: WeeklyReview };

export const MAX_WORKSPACE_BYTES = 2_000_000;

function isText(value: unknown, maxLength = 20_000): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function optionalText(value: unknown, maxLength = 20_000) {
  return value === undefined || isText(value, maxLength);
}

export function normalizeWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.areas) || !Array.isArray(candidate.projects) || !Array.isArray(candidate.tasks) || !Array.isArray(candidate.routines)) return null;

  const areas = candidate.areas.map((area) => {
    if (!area || typeof area !== "object") return null;
    const item = area as Record<string, unknown>;
    if (!isText(item.id, 200) || !isText(item.name, 500)) return null;
    return normalizeArea(item);
  }).filter(Boolean) as Area[];
  const projects = candidate.projects.map(normalizeProject).filter(Boolean) as Project[];
  const tasks = candidate.tasks.filter((task): task is Task => {
    if (!task || typeof task !== "object") return false;
    const item = task as Record<string, unknown>;
    const validPriority = item.priority === undefined || item.priority === "high" || item.priority === "medium" || item.priority === "low";
    const validNotes = normalizeTaskNotes(item.notes) !== null;
    const validSomeday = item.someday === undefined || typeof item.someday === "boolean";
    const validWaiting = item.waiting === undefined || typeof item.waiting === "boolean";
    const validQueueState = !(item.someday === true && item.waiting === true);
    const validDueTime = isPlannerDeadline(item.dueDate, item.dueTime);
    return isText(item.id, 200) && isText(item.title, 2_000) && optionalText(item.areaId, 200) && optionalText(item.projectId, 200) && isTaskStatus(item.status) && typeof item.createdAt === "number" && Number.isFinite(item.createdAt) && optionalText(item.dueDate, 20) && validDueTime && validPriority && validNotes && validSomeday && validWaiting && validQueueState;
  });
  const routines = normalizeRoutines(candidate.routines, new Set(areas.map((area) => area.id))) as Routine[] | null;
  const planner = normalizePlanner(
    candidate.planner,
    new Set(areas.map((area) => area.id)),
    new Map(tasks.filter((task) => task.areaId).map((task) => [task.id, task.areaId!])),
    new Map((routines ?? []).map((routine) => [routine.id, routine.areaId])),
  ) as Planner | null;

  if (areas.length !== candidate.areas.length || projects.length !== candidate.projects.length || tasks.length !== candidate.tasks.length || routines === null || planner === null) return null;
  const weeklyReview = normalizeWeeklyReview(candidate.weeklyReview);
  if (weeklyReview === null) return null;
  return { areas, projects, tasks, routines, planner, weeklyReview };
}

