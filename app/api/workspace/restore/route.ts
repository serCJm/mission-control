import { getChatGPTUser } from "../../../chatgpt-auth";
import { currentWeekKey, emptyWeeklyReview } from "../../../workspace-guidance.mjs";
import { getD1 } from "../../../../db";
import { normalizeWorkspace } from "../route";

const TARGET_UPDATED_AT = 1_787_690_417_643;

function html(body: string, status = 200) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Restore workspace</title><style>body{font:16px system-ui;max-width:42rem;margin:5rem auto;padding:0 1.5rem;color:#173d33}button{min-height:44px;border:0;border-radius:8px;background:#173d33;color:white;padding:.75rem 1rem;font-weight:700}</style></head><body>${body}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return html("<h1>Sign in required</h1>", 401);
  return html("<h1>Restore the Health and RMT workspace</h1><p>This restores the Aug 25, 1:40 PM archive containing Trading, Personal growth, Family, Admin, Health, Crypto, and RMT. The current workspace will be archived first.</p><form method=\"post\"><button type=\"submit\">Restore Health and RMT workspace</button></form>");
}

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return html("<h1>Sign in required</h1>", 401);

  const database = getD1();
  const suffix = `:${user.userId}`;
  const archived = await database.prepare(`SELECT data
    FROM workspaces
    WHERE user_id LIKE 'archived:%'
      AND substr(user_id, -length(?)) = ?
      AND updated_at = ?
    LIMIT 1`).bind(suffix, suffix, TARGET_UPDATED_AT).first<{ data: string }>();

  if (!archived) return html("<h1>The selected archive was not found</h1>", 404);

  let candidate: unknown;
  try {
    candidate = JSON.parse(archived.data) as unknown;
  } catch {
    return html("<h1>The selected archive is not valid JSON</h1>", 422);
  }

  if (!candidate || typeof candidate !== "object") return html("<h1>The selected archive is invalid</h1>", 422);
  const legacy = candidate as Record<string, unknown>;
  const legacyAreas = Array.isArray(legacy.areas) ? legacy.areas : [];
  const firstAreaId = legacyAreas[0] && typeof legacyAreas[0] === "object"
    ? (legacyAreas[0] as Record<string, unknown>).id
    : undefined;
  const restored = normalizeWorkspace({
    ...legacy,
    routines: [],
    focusTaskIds: [],
    weeklyReview: emptyWeeklyReview(currentWeekKey()),
    currentAreaId: firstAreaId,
  });
  if (!restored) return html("<h1>The selected archive cannot be restored safely</h1>", 422);

  const now = Date.now();
  const currentArchiveId = `archived:${now}:${crypto.randomUUID()}:${user.userId}`;
  await database.batch([
    database.prepare("UPDATE workspaces SET user_id = ? WHERE user_id = ?").bind(currentArchiveId, user.userId),
    database.prepare("INSERT INTO workspaces (user_id, data, updated_at) VALUES (?, ?, ?)").bind(user.userId, JSON.stringify(restored), now),
  ]);

  return html(`<h1>Health and RMT workspace restored</h1><p>Recovered ${restored.areas.length} areas, ${restored.projects.length} projects, and ${restored.tasks.length} tasks.</p><p><a href="/">Return to Mission Control</a></p>`);
}
