import { getChatGPTUser } from "../../chatgpt-auth";
import { workspaceDatabase } from "../../workspace-database";
import { MAX_WORKSPACE_BYTES } from "../../workspace-schema";
import { WorkspaceError, workspaceStore } from "../../workspace-store";

function failure(error: unknown) {
  if (error instanceof WorkspaceError) return Response.json({ error: error.message }, { status: error.status });
  throw error;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to sync this workspace." }, { status: 401 });
  try {
    const snapshot = await workspaceStore(await workspaceDatabase(), user.userId).read();
    const etag = `"${snapshot.updatedAt}"`;
    const headers = { etag, "cache-control": "private, no-cache" };
    if (snapshot.workspace && request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return Response.json({ ...snapshot, user: { displayName: user.displayName, email: user.email } }, { headers });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to sync this workspace." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_WORKSPACE_BYTES) return Response.json({ error: "Workspace is too large." }, { status: 413 });
  const payload = await request.json().catch(() => null);
  if (!payload || !Number.isSafeInteger(payload.expectedUpdatedAt) || payload.expectedUpdatedAt < 0) {
    return Response.json({ error: "The workspace revision is required. Reload the app before saving." }, { status: 400 });
  }
  try {
    const { updatedAt } = await workspaceStore(await workspaceDatabase(), user.userId).write(payload.workspace, payload.expectedUpdatedAt);
    return Response.json({ updatedAt });
  } catch (error) { return failure(error); }
}
