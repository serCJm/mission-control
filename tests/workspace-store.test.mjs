import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createStarterWorkspace } from "../app/starter-workspace.mjs";
import { createWorkspaceHarness } from "../scripts/workspace-harness.mjs";

let harness;
before(async () => { harness = await createWorkspaceHarness(); });
after(async () => { await harness?.dispose(); });

function signIn(userId) {
  harness.setContext(harness.database, userId ? { userId, displayName: userId, email: `${userId}@example.test` } : null);
}

function request(etag) {
  return new Request("https://example.test/api/workspace", { headers: etag ? { "if-none-match": etag } : {} });
}

test("GET authenticates before accessing the database and an empty workspace is never a 304", async () => {
  harness.setContext(undefined, null);
  assert.equal((await harness.GET(request('"0"'))).status, 401);
  signIn("empty");
  const response = await harness.GET(request('"0"'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), '"0"');
  assert.deepEqual(await response.json(), { workspace: null, updatedAt: 0, user: { displayName: "empty", email: "empty@example.test" } });
});

test("matching ETags have empty bodies; a successful update makes the old ETag stale", async () => {
  const store = harness.workspaceStore(harness.database, "updates");
  const initial = await store.write(createStarterWorkspace(), 0);
  signIn("updates");
  const first = await harness.GET(request());
  const etag = first.headers.get("etag");
  assert.equal(first.status, 200);
  assert.equal(etag, `"${initial.updatedAt}"`);
  assert.deepEqual((await first.json()).workspace, initial.workspace);
  const unchanged = await harness.GET(request(etag));
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("cache-control"), "private, no-cache");
  assert.equal(unchanged.headers.get("etag"), etag);
  assert.equal(await unchanged.text(), "");

  initial.workspace.weeklyReview.intention = "Updated through HTTP";
  const payload = { workspace: initial.workspace, expectedUpdatedAt: initial.updatedAt };
  const save = () => harness.PUT(new Request("https://example.test/api/workspace", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
  const saved = await save();
  assert.equal(saved.status, 200);
  const { updatedAt } = await saved.json();
  assert.ok(updatedAt > initial.updatedAt);
  assert.equal((await save()).status, 409);
  const refreshed = await harness.GET(request(etag));
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.headers.get("etag"), `"${updatedAt}"`);
  assert.equal((await refreshed.json()).workspace.weeklyReview.intention, "Updated through HTTP");
});

test("reads and conditional requests stay scoped to the authenticated account", async () => {
  const alice = createStarterWorkspace();
  const bob = createStarterWorkspace();
  alice.weeklyReview.intention = "Alice private notes";
  bob.weeklyReview.intention = "Bob private notes";
  await harness.database.prepare("INSERT INTO workspaces VALUES (?, ?, ?)").bind("alice", JSON.stringify(alice), 10).run();
  await harness.database.prepare("INSERT INTO workspaces VALUES (?, ?, ?)").bind("bob", JSON.stringify(bob), 20).run();
  signIn("alice");
  assert.equal((await (await harness.GET(request())).json()).workspace.weeklyReview.intention, "Alice private notes");
  signIn("bob");
  const response = await harness.GET(request('"10"'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).workspace.weeklyReview.intention, "Bob private notes");
  signIn("uninitialized");
  assert.equal((await (await harness.GET(request('"10"'))).json()).workspace, null);
});

test("malformed and obsolete persisted data return 409 even for matching ETags, preserving every byte", async () => {
  for (const [userId, original] of [["malformed", '{"valuable":'], ["obsolete", '{ "valuable": "original workspace" }']]) {
    const store = harness.workspaceStore(harness.database, userId);
    const initial = await store.write(createStarterWorkspace(), 0);
    signIn(userId);
    assert.equal((await harness.GET(request())).status, 200);
    // Simulate an external recovery/schema issue without changing the revision.
    await harness.database.prepare("UPDATE workspaces SET data = ? WHERE user_id = ?").bind(original, userId).run();
    for (const etag of [undefined, `"${initial.updatedAt}"`]) {
      const response = await harness.GET(request(etag));
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /needs recovery/);
    }
    const row = await harness.database.prepare("SELECT data, updated_at AS updatedAt FROM workspaces WHERE user_id = ?").bind(userId).first();
    assert.deepEqual(row, { data: original, updatedAt: initial.updatedAt });
  }
});
