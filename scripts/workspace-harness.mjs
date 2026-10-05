import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

// Exercise the real handlers against disposable D1 storage. Only the external
// authentication and database binding are replaced; no persisted workspace opens.
export async function createWorkspaceHarness() {
  const directory = await mkdtemp(join(tmpdir(), "focushq-workspace-harness-"));
  let runtime;
  const dispose = async () => {
    try { await runtime?.dispose(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  };
  try {
    const outfile = join(directory, "workspace.mjs");
    await build({
      stdin: {
        contents: 'export { GET, PUT } from "./app/api/workspace/route.ts"; export * from "./app/workspace-store.ts"; export * from "./app/workspace-schema.ts"; export { setContext } from "benchmark-context";',
        resolveDir: process.cwd(),
      },
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [{ name: "isolated-workspace-context", setup(builder) {
        builder.onResolve({ filter: /^(benchmark-context|\.\.\/\.\.\/(chatgpt-auth|workspace-database))$/ }, () => ({ path: "context", namespace: "benchmark" }));
        builder.onLoad({ filter: /.*/, namespace: "benchmark" }, () => ({ contents: `
          let database, user;
          export function setContext(nextDatabase, nextUser) { database = nextDatabase; user = nextUser; }
          export async function getChatGPTUser() { return user; }
          export async function workspaceDatabase() { return database; }
        ` }));
      } }],
    });
    const handlers = await import(pathToFileURL(outfile));
    runtime = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: "2026-08-01", d1Databases: ["DB"] });
    const database = await runtime.getD1Database("DB");
    await database.prepare("CREATE TABLE workspaces (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
    return { ...handlers, database, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
