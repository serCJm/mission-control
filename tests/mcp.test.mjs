import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { createStarterWorkspace } from '../app/starter-workspace.mjs';

let mf, db, workspaceStore, handleMcpRequest, UI_URI, MAX_MCP_REQUEST_BYTES;
const output = new URL(`../output/mcp-test-${process.pid}/`, import.meta.url);
before(async () => {
  await mkdir(output, { recursive: true });
  await build({ stdin: { contents: 'export * from "./app/mcp/server.ts"; export * from "./app/workspace-store.ts";', resolveDir: process.cwd() }, outfile: new URL('server.mjs', output).pathname, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
  ({ workspaceStore, handleMcpRequest, UI_URI, MAX_MCP_REQUEST_BYTES } = await import(new URL('server.mjs', output)));
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: '2026-08-01', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE workspaces (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
});
after(async () => { await mf?.dispose(); await rm(output, { recursive: true, force: true }); });
async function rpc(method, params = {}, user = 'alice') {
  const response = await handleMcpRequest(new Request('https://example.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), user ? async () => workspaceStore(db, user) : null, '<html>Mission Control</html>');
  return { status: response.status, body: await response.json() };
}
async function call(name, args = {}, user) { return (await rpc('tools/call', { name, arguments: args }, user)).body.result; }

test('discovery advertises sidebar and conversation extensions without private data', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, null);
  assert.equal(init.status, 200);
  assert.equal(init.body.result.serverInfo.name, 'mission-control');
  const { body } = await rpc('tools/list', {}, null);
  assert.equal(body.result.tools.length, 8);
  assert.deepEqual(body.result.tools.find((tool) => tool.name === 'save_workspace')._meta.ui.visibility, ['app']);
  const open = body.result.tools.find((tool) => tool.name === 'open_mission_control');
  assert.deepEqual(open._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
  assert.equal(open._meta.ui.resourceUri, UI_URI);
  assert.equal((await rpc('resources/read', { uri: UI_URI }, null)).body.result.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.equal((await rpc('tools/call', { name: 'get_workspace', arguments: {} }, null)).status, 401);
});

test('account isolation, capture, completion, validation, project notes, and conflicts', async () => {
  const alice = workspaceStore(db, 'alice');
  const initial = await alice.write(createStarterWorkspace(), 0);
  const bob = await call('get_workspace', {}, 'bob');
  assert.equal(bob.structuredContent.workspace, null);
  let state = (await call('create_task', { title: 'Review today', expectedUpdatedAt: initial.updatedAt })).structuredContent;
  const task = state.workspace.tasks.at(-1);
  assert.equal(task.title, 'Review today'); assert.equal(task.areaId, undefined);
  const stale = await call('update_task', { taskId: task.id, status: 'done', expectedUpdatedAt: initial.updatedAt });
  assert.equal(stale.isError, true);
  const badArea = await call('update_task', { taskId: task.id, areaId: 'missing', expectedUpdatedAt: state.updatedAt });
  assert.equal(badArea.isError, true);
  const badDeadline = await call('update_task', { taskId: task.id, dueTime: '25:80', expectedUpdatedAt: state.updatedAt });
  assert.equal(badDeadline.isError, true);
  const unknownInput = await call('update_task', { taskId: task.id, userId: 'bob', expectedUpdatedAt: state.updatedAt });
  assert.equal(unknownInput.isError, true);
  state = (await call('update_task', { taskId: task.id, status: 'done', projectId: 'execution', expectedUpdatedAt: state.updatedAt })).structuredContent;
  assert.equal(state.workspace.tasks.at(-1).status, 'done'); assert.equal(state.workspace.tasks.at(-1).areaId, 'trading');
  state = (await call('create_project', { areaId: 'family', name: 'Visit', outcome: 'Protect time together', expectedUpdatedAt: state.updatedAt })).structuredContent;
  const projectId = state.workspace.projects.at(-1).id;
  state = (await call('save_project_note', { projectId, title: 'Next actions', body: 'Choose a weekend', expectedUpdatedAt: state.updatedAt })).structuredContent;
  const noteId = state.workspace.projects.at(-1).notes[0].id;
  state = (await call('save_project_note', { projectId, noteId, title: 'Next actions', body: 'Choose two dates', expectedUpdatedAt: state.updatedAt })).structuredContent;
  assert.equal(state.workspace.projects.at(-1).notes.length, 1);
  state = (await call('update_project', { projectId, completed: true, expectedUpdatedAt: state.updatedAt })).structuredContent;
  assert.ok(state.workspace.projects.at(-1).completedAt);
  assert.equal((await call('get_workspace', {}, 'bob')).structuredContent.workspace, null);
  assert.deepEqual(state.workspace.routines, initial.workspace.routines);
  assert.deepEqual(state.workspace.planner, initial.workspace.planner);
});

test('atomic revisions protect against browser/plugin races and duplicate initialization', async () => {
  const store = workspaceStore(db, 'race');
  const initial = await store.write(createStarterWorkspace(), 0);
  await assert.rejects(store.write(createStarterWorkspace(), 0), /changed elsewhere/);
  const writes = await Promise.allSettled([store.write(initial.workspace, initial.updatedAt), store.write(initial.workspace, initial.updatedAt)]);
  assert.equal(writes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(writes.filter((result) => result.status === 'rejected').length, 1);
});

test('invalid persisted data remains byte-for-byte untouched', async () => {
  const original = '{"valuable":"unrecognized workspace"}';
  await db.prepare('INSERT INTO workspaces VALUES (?, ?, ?)').bind('recovery', original, 1).run();
  assert.equal((await call('get_workspace', {}, 'recovery')).isError, true);
  assert.equal((await call('create_task', { title: 'Do not reset', expectedUpdatedAt: 1 }, 'recovery')).isError, true);
  assert.equal((await call('save_workspace', { workspace: createStarterWorkspace(), expectedUpdatedAt: 1 }, 'recovery'))._meta.status, 409);
  assert.equal((await db.prepare('SELECT data FROM workspaces WHERE user_id = ?').bind('recovery').first()).data, original);
});

test('malformed and oversized requests fail cleanly', async () => {
  for (const [body, status] of [['{', 400], [' '.repeat(MAX_MCP_REQUEST_BYTES + 1), 413]]) {
    const response = await handleMcpRequest(new Request('https://example.test/mcp', { method: 'POST', body }), null, '');
    assert.equal(response.status, status);
  }
});


test('embedded full workspace saves all features with validation, account isolation, and revision protection', async () => {
  const workspace = createStarterWorkspace();
  // Exceeds the old 64 KiB tool limit while remaining a valid normal workspace.
  for (let i = 0; i < 5; i++) workspace.projects[0].notes.push({ id: `large-note-${i}`, title: `Notes ${i}`, body: 'a'.repeat(18000), pinned: false, createdAt: 1, updatedAt: 1 });
  const initial = await call('save_workspace', { workspace, expectedUpdatedAt: 0 }, 'embedded');
  assert.equal(initial.isError, undefined);
  let snapshot = (await call('get_workspace', {}, 'embedded')).structuredContent;
  assert.deepEqual(snapshot.workspace, workspace);
  assert.equal((await rpc('tools/call', { name: 'save_workspace', arguments: { workspace, expectedUpdatedAt: 0 } }, null)).status, 401);
  workspace.weeklyReview.intention = 'Protect focused work';
  workspace.areas[0].name = 'Updated area';
  const changed = await call('save_workspace', { workspace, expectedUpdatedAt: snapshot.updatedAt }, 'embedded');
  assert.ok(changed.structuredContent.updatedAt > snapshot.updatedAt);
  assert.equal((await call('save_workspace', { workspace, expectedUpdatedAt: snapshot.updatedAt }, 'embedded'))._meta.status, 409);
  assert.equal((await call('save_workspace', { workspace, expectedUpdatedAt: changed.structuredContent.updatedAt }, 'another-account'))._meta.status, 409);
  assert.equal((await call('save_workspace', { workspace: { tasks: [] }, expectedUpdatedAt: changed.structuredContent.updatedAt }, 'embedded'))._meta.status, 400);
  snapshot = (await call('get_workspace', {}, 'embedded')).structuredContent;
  assert.deepEqual(snapshot.workspace, workspace);
  assert.equal((await call('get_workspace', {}, 'another-account')).structuredContent.workspace, null);
});
