import assert from "node:assert/strict";
import { createStarterWorkspace } from "../app/starter-workspace.mjs";
import { createWorkspaceHarness } from "./workspace-harness.mjs";

const argument = process.argv.find((value) => value.startsWith("--iterations="));
const iterations = Number(argument?.split("=")[1] ?? 60);
if (!Number.isInteger(iterations) || iterations < 10) throw new Error("--iterations must be an integer of at least 10");

const harness = await createWorkspaceHarness();

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction) => Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(3));
  return { medianMs: at(0.5), p95Ms: at(0.95) };
}

async function measure(action) {
  for (let index = 0; index < 10; index += 1) await action();
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await action();
    samples.push(performance.now() - started);
  }
  return summarize(samples);
}

function fixture(taskCount) {
  const workspace = createStarterWorkspace();
  for (const routine of workspace.routines) routine.scheduleEffectiveOn = "2026-01-01";
  for (const rule of workspace.planner.blockRules) rule.effectiveOn = "2026-01-01";
  workspace.weeklyReview.weekKey = "2026-W40";
  if (taskCount) {
    workspace.tasks = Array.from({ length: taskCount }, (_, index) => ({
      id: `benchmark-task-${index}`,
      title: `Review synthetic observation ${index}`,
      areaId: "trading",
      projectId: "execution",
      status: "todo",
      createdAt: index + 1,
      dueDate: "2026-10-05",
      dueTime: "09:30",
      notes: "Synthetic benchmark notes. ".repeat(20),
    }));
  }
  return workspace;
}

try {
  const { GET, workspaceStore, normalizeWorkspace, MAX_WORKSPACE_BYTES, setContext, database } = harness;

  const results = [];
  for (const [name, workspace] of [["starter", fixture()], ["large", fixture(2_000)]]) {
    const store = workspaceStore(database, name);
    const initial = await store.write(workspace, 0);
    const data = JSON.stringify(initial.workspace);
    assert.ok(Buffer.byteLength(data) <= MAX_WORKSPACE_BYTES);
    setContext(database, { userId: name, displayName: "Benchmark", email: "benchmark@example.test" });
    const fullRequest = new Request("https://benchmark.invalid/api/workspace");
    const conditionalRequest = new Request(fullRequest, { headers: { "if-none-match": `"${initial.updatedAt}"` } });
    let responseBytes = 0;
    const operations = {
      databaseRead: async () => {
        const row = await database.prepare("SELECT data, updated_at AS updatedAt FROM workspaces WHERE user_id = ?").bind(name).first();
        assert.equal(row.updatedAt, initial.updatedAt);
      },
      parseAndValidate: () => { assert.ok(normalizeWorkspace(JSON.parse(data))); },
      fullGet: async () => {
        const response = await GET(fullRequest);
        assert.equal(response.status, 200);
        responseBytes = (await response.arrayBuffer()).byteLength;
      },
      unchangedGet: async () => {
        const response = await GET(conditionalRequest);
        assert.equal(response.status, 304);
        assert.equal((await response.arrayBuffer()).byteLength, 0);
      },
    };
    const timings = {};
    for (const [operation, action] of Object.entries(operations)) timings[operation] = await measure(action);
    results.push({ name, tasks: workspace.tasks.length, storedBytes: Buffer.byteLength(data), responseBytes, timings });
  }
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    runtime: process.version,
    environment: "Node handler with in-memory Miniflare D1; excludes authentication, network and edge latency",
    iterations,
    warmups: 10,
    persistence: false,
    results,
  }, null, 2));
} finally {
  await harness.dispose();
}
