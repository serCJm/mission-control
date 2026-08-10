import { getChatGPTUser } from "../../chatgpt-auth";
import { getD1 } from "../../../db";

const AREA_ICONS = ["target", "trend", "sprout", "people", "briefcase", "heart", "home", "book"] as const;
type AreaIconName = typeof AREA_ICONS[number];
type Area = { id: string; name: string; icon: AreaIconName };
type Project = { id: string; areaId: string; name: string; outcome: string; notes: string };
type Task = {
  id: string;
  title: string;
  areaId?: string;
  projectId?: string;
  done: boolean;
  createdAt: number;
  dueDate?: string;
  priority?: "high" | "medium" | "low";
};
type Workspace = { areas: Area[]; projects: Project[]; tasks: Task[]; reviewed: number[]; currentAreaId?: string };

const MAX_WORKSPACE_BYTES = 2_000_000;

function isText(value: unknown, maxLength = 20_000): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function optionalText(value: unknown, maxLength = 20_000) {
  return value === undefined || isText(value, maxLength);
}

function isAreaIcon(value: unknown): value is AreaIconName {
  return typeof value === "string" && (AREA_ICONS as readonly string[]).includes(value);
}

function normalizeWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.areas) || !Array.isArray(candidate.projects) || !Array.isArray(candidate.tasks)) return null;

  const areas = candidate.areas.filter((area): area is Area => {
    if (!area || typeof area !== "object") return false;
    const item = area as Record<string, unknown>;
    return isText(item.id, 200) && isText(item.name, 500) && isAreaIcon(item.icon);
  });
  const projects = candidate.projects.filter((project): project is Project => {
    if (!project || typeof project !== "object") return false;
    const item = project as Record<string, unknown>;
    return isText(item.id, 200) && isText(item.areaId, 200) && isText(item.name, 500) && isText(item.outcome) && isText(item.notes, 200_000);
  });
  const tasks = candidate.tasks.filter((task): task is Task => {
    if (!task || typeof task !== "object") return false;
    const item = task as Record<string, unknown>;
    const validPriority = item.priority === undefined || item.priority === "high" || item.priority === "medium" || item.priority === "low";
    return isText(item.id, 200) && isText(item.title, 2_000) && optionalText(item.areaId, 200) && optionalText(item.projectId, 200) && typeof item.done === "boolean" && typeof item.createdAt === "number" && Number.isFinite(item.createdAt) && optionalText(item.dueDate, 20) && validPriority;
  });

  if (areas.length !== candidate.areas.length || projects.length !== candidate.projects.length || tasks.length !== candidate.tasks.length) return null;
  const reviewed = Array.isArray(candidate.reviewed)
    ? candidate.reviewed.filter((step): step is number => Number.isInteger(step) && step >= 0 && step < 5)
    : [];
  const currentAreaId = isText(candidate.currentAreaId, 200) && areas.some((area) => area.id === candidate.currentAreaId)
    ? candidate.currentAreaId
    : areas[0]?.id;
  return { areas, projects, tasks, reviewed: [...new Set(reviewed)], currentAreaId };
}

function unauthorized() {
  return Response.json({ error: "Sign in with ChatGPT to sync this workspace." }, { status: 401 });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();

  const row = await getD1()
    .prepare("SELECT data, updated_at AS updatedAt FROM workspaces WHERE user_id = ?")
    .bind(user.userId)
    .first<{ data: string; updatedAt: number }>();

  if (!row) {
    return Response.json({ workspace: null, updatedAt: 0, user: { displayName: user.displayName, email: user.email } });
  }

  const workspace = normalizeWorkspace(JSON.parse(row.data) as unknown);
  if (!workspace) return Response.json({ error: "The saved workspace is invalid." }, { status: 500 });
  return Response.json({ workspace, updatedAt: row.updatedAt, user: { displayName: user.displayName, email: user.email } });
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
  await getD1()
    .prepare(`INSERT INTO workspaces (user_id, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .bind(user.userId, data, updatedAt)
    .run();

  return Response.json({ updatedAt });
}
