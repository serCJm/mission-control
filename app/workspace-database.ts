import { getD1 } from "../db";

let initialization: Promise<void> | undefined;

export async function workspaceDatabase() {
  const database = getD1();
  if (process.env.NODE_ENV === "development") {
    initialization ??= database.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      user_id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL
    )`).run().then(() => undefined).catch((error: unknown) => { initialization = undefined; throw error; });
    await initialization;
  }
  return database;
}
