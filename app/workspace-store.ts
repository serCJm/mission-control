import type { getD1 } from "../db";
import { MAX_WORKSPACE_BYTES, normalizeWorkspace } from "./workspace-schema";

export class WorkspaceError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function workspaceStore(database: ReturnType<typeof getD1>, userId: string) {
  return {
    async read() {
      const row = await database.prepare("SELECT data, updated_at AS updatedAt FROM workspaces WHERE user_id = ?")
        .bind(userId).first<{ data: string; updatedAt: number }>();
      if (!row) return { workspace: null, updatedAt: 0 };
      let workspace = null;
      try { workspace = normalizeWorkspace(JSON.parse(row.data)); } catch { /* Preserve the original row. */ }
      if (!workspace) throw new WorkspaceError("The saved workspace uses an incompatible data format and needs recovery before it can be loaded or changed.", 409);
      return { workspace, updatedAt: row.updatedAt };
    },
    async write(value: unknown, expectedUpdatedAt: number) {
      const workspace = normalizeWorkspace(value);
      if (!workspace) throw new WorkspaceError("A valid workspace is required.", 400);
      const data = JSON.stringify(workspace);
      if (new TextEncoder().encode(data).byteLength > MAX_WORKSPACE_BYTES) throw new WorkspaceError("Workspace is too large.", 413);
      const updatedAt = Math.max(Date.now(), expectedUpdatedAt + 1);
      const result = expectedUpdatedAt === 0
        ? await database.prepare("INSERT INTO workspaces (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING")
          .bind(userId, data, updatedAt).run()
        : await database.prepare("UPDATE workspaces SET data = ?, updated_at = ? WHERE user_id = ? AND updated_at = ?")
          .bind(data, updatedAt, userId, expectedUpdatedAt).run();
      if (result.meta.changes !== 1) throw new WorkspaceError("Workspace changed elsewhere. Refresh it and apply your change again.", 409);
      return { workspace, updatedAt };
    },
  };
}
