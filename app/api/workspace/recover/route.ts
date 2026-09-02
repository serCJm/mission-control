import { getChatGPTUser } from "../../../chatgpt-auth";
import { recoverCalendarBlockWorkspace } from "../../../workspace-recovery.mjs";
import { getD1 } from "../../../../db";
import { normalizeWorkspace } from "../route";

const RECOVERY_CONFIRMATION = "recover-calendar-block-schema";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to recover this workspace." }, { status: 401 });
  if (request.headers.get("x-recovery-confirmation") !== RECOVERY_CONFIRMATION) {
    return Response.json({ error: "Recovery confirmation is required." }, { status: 400 });
  }

  const database = getD1();
  const row = await database
    .prepare("SELECT data, updated_at AS updatedAt FROM workspaces WHERE user_id = ?")
    .bind(user.userId)
    .first<{ data: string; updatedAt: number }>();
  if (!row) return Response.json({ error: "No workspace was found." }, { status: 404 });

  let recovered: unknown;
  try {
    recovered = recoverCalendarBlockWorkspace(JSON.parse(row.data) as unknown);
  } catch {
    return Response.json({ error: "The saved workspace is not valid JSON." }, { status: 409 });
  }
  if (!recovered) return Response.json({ error: "The workspace does not match the recoverable format." }, { status: 409 });
  if (!normalizeWorkspace(recovered)) return Response.json({ error: "The recovered workspace would not pass current validation." }, { status: 409 });

  const recoveredData = JSON.stringify(recovered);
  const recoveredAt = Date.now();
  const archiveId = `archived:${recoveredAt}:${crypto.randomUUID()}:${user.userId}`;
  const results = await database.batch([
    database.prepare("INSERT INTO workspaces (user_id, data, updated_at) VALUES (?, ?, ?)")
      .bind(archiveId, row.data, row.updatedAt),
    database.prepare("UPDATE workspaces SET data = ?, updated_at = ? WHERE user_id = ? AND data = ?")
      .bind(recoveredData, recoveredAt, user.userId, row.data),
  ]);
  if ((results[1].meta.changes ?? 0) !== 1) {
    return Response.json({ error: "The workspace changed during recovery. Try again." }, { status: 409 });
  }

  const workspace = recovered as { areas?: unknown[]; projects?: unknown[]; tasks?: unknown[]; routines?: unknown[]; planner?: { blockRules?: unknown[]; blockExceptions?: unknown[]; blockItems?: unknown[] } };
  return Response.json({
    recoveredAt,
    archiveId,
    counts: {
      areas: workspace.areas?.length ?? 0,
      projects: workspace.projects?.length ?? 0,
      tasks: workspace.tasks?.length ?? 0,
      routines: workspace.routines?.length ?? 0,
      blockRules: workspace.planner?.blockRules?.length ?? 0,
      blockExceptions: workspace.planner?.blockExceptions?.length ?? 0,
      blockItems: workspace.planner?.blockItems?.length ?? 0,
    },
  });
}
