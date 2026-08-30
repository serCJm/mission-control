import { getChatGPTUser } from "../../chatgpt-auth";
import { normalizeArea } from "../../area-schema.mjs";
import { normalizeProjectNotes } from "../../project-note-schema.mjs";
import { isPlannerDeadline, normalizePlanner } from "../../planner-schema.mjs";
import { normalizeRoutines } from "../../routine-schema.mjs";
import { isTaskStatus, normalizeTaskNotes } from "../../task-schema.mjs";
import { normalizeWeeklyReview } from "../../workspace-guidance.mjs";
import { getD1 } from "../../../db";

type AreaIconName = "target" | "trend" | "sprout" | "people" | "briefcase" | "heart" | "home" | "book" | "calendar" | "clock" | "star" | "flag" | "wallet" | "chart" | "dumbbell" | "music" | "camera" | "plane" | "car" | "utensils" | "leaf" | "paw" | "globe" | "palette";
type Area = { id: string; name: string; icon: AreaIconName };
type ProjectNote = { id: string; title: string; body: string; pinned: boolean; createdAt: number; updatedAt: number };
type Project = { id: string; areaId: string; name: string; outcome: string; notes: ProjectNote[] };
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
  areaBlockRules: Array<{ id: string; areaId: string; weekdays: number[]; effectiveOn: string; endsOn?: string; startTime: string; endTime: string; fill: "sage" | "sky" | "sand" | "rose" | "lilac" | "slate" }>;
  areaBlockExceptions: Array<{ id: string; ruleId: string; occurrenceDate: string; kind: "skip" | "override"; date?: string; startTime?: string; endTime?: string }>;
  blockItems: Array<{ id: string; ruleId: string; occurrenceDate: string; kind: "task" | "routine"; itemId: string }>;
};
type Workspace = { areas: Area[]; projects: Project[]; tasks: Task[]; routines: Routine[]; planner: Planner; weeklyReview: WeeklyReview };

const MAX_WORKSPACE_BYTES = 2_000_000;
let developmentSchemaInitialization: Promise<void> | undefined;

function isText(value: unknown, maxLength = 20_000): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function optionalText(value: unknown, maxLength = 20_000) {
  return value === undefined || isText(value, maxLength);
}

function normalizeWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.areas) || !Array.isArray(candidate.projects) || !Array.isArray(candidate.tasks) || !Array.isArray(candidate.routines)) return null;

  const areas = candidate.areas.map((area) => {
    if (!area || typeof area !== "object") return null;
    const item = area as Record<string, unknown>;
    if (!isText(item.id, 200) || !isText(item.name, 500)) return null;
    return normalizeArea(item);
  }).filter(Boolean) as Area[];
  const projects = candidate.projects.map((project) => {
    if (!project || typeof project !== "object") return null;
    const item = project as Record<string, unknown>;
    const notes = normalizeProjectNotes(item.notes);
    if (!isText(item.id, 200) || !isText(item.areaId, 200) || !isText(item.name, 500) || !isText(item.outcome) || notes === null) return null;
    return { id: item.id, areaId: item.areaId, name: item.name, outcome: item.outcome, notes };
  }).filter(Boolean) as Project[];
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

function unauthorized() {
  return Response.json({ error: "Sign in with ChatGPT to sync this workspace." }, { status: 401 });
}

async function workspaceDatabase() {
  const database = getD1();
  if (process.env.NODE_ENV === "development") {
    developmentSchemaInitialization ??= database.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
        user_id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`).run().then(() => undefined).catch((error: unknown) => {
        developmentSchemaInitialization = undefined;
        throw error;
      });
    await developmentSchemaInitialization;
  }
  return database;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();

  const database = await workspaceDatabase();
  const row = await database
    .prepare("SELECT data, updated_at AS updatedAt FROM workspaces WHERE user_id = ?")
    .bind(user.userId)
    .first<{ data: string; updatedAt: number }>();

  if (!row) {
    return Response.json({ workspace: null, updatedAt: 0, user: { displayName: user.displayName, email: user.email } });
  }

  const etag = `"${row.updatedAt}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag, "cache-control": "private, no-cache" } });
  }

  let workspace: Workspace | null = null;
  try {
    workspace = normalizeWorkspace(JSON.parse(row.data) as unknown);
  } catch { /* Invalid JSON is reported without modifying the saved row. */ }

  if (workspace) {
    return Response.json(
      { workspace, updatedAt: row.updatedAt, user: { displayName: user.displayName, email: user.email } },
      { headers: { etag, "cache-control": "private, no-cache" } },
    );
  }

  return Response.json({ error: "The saved workspace uses an incompatible data format and must be recovered before it can be loaded." }, { status: 409 });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WORKSPACE_BYTES) return Response.json({ error: "Workspace is too large." }, { status: 413 });

  const payload = (await request.json()) as { workspace?: unknown };
  const workspace = normalizeWorkspace(payload.workspace);
  if (!workspace) return Response.json({ error: "A valid workspace is required." }, { status: 400 });

  const data = JSON.stringify(workspace);
  if (new TextEncoder().encode(data).byteLength > MAX_WORKSPACE_BYTES) {
    return Response.json({ error: "Workspace is too large." }, { status: 413 });
  }

  const updatedAt = Date.now();
  await (await workspaceDatabase())
    .prepare(`INSERT INTO workspaces (user_id, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .bind(user.userId, data, updatedAt)
    .run();

  return Response.json({ updatedAt });
}
