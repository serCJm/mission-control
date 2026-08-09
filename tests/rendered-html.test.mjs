import assert from "node:assert/strict";
import test from "node:test";
import { isTaskSort, sortTasks } from "../app/task-sorting.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("recognizes the supported saved task sort modes", () => {
  for (const sort of ["custom", "alphabetical", "dueDate", "priority"]) assert.equal(isTaskSort(sort), true);
  assert.equal(isTaskSort("manual"), false);
  assert.equal(isTaskSort(null), false);
});

test("sorts tasks without mutating their custom order", () => {
  const tasks = [
    { id: "b", title: "Bravo", done: false, dueDate: "2026-08-10", priority: "medium" },
    { id: "a", title: "alpha", done: false, dueDate: "2026-08-08", priority: "high" },
    { id: "n", title: "No metadata", done: false },
    { id: "d", title: "Aardvark done", done: true, dueDate: "2026-08-07", priority: "high" },
  ];

  assert.deepEqual(sortTasks(tasks, "custom").map((task) => task.id), ["b", "a", "n", "d"]);
  assert.deepEqual(sortTasks(tasks, "alphabetical").map((task) => task.id), ["a", "b", "n", "d"]);
  assert.deepEqual(sortTasks(tasks, "dueDate").map((task) => task.id), ["a", "b", "n", "d"]);
  assert.deepEqual(sortTasks(tasks, "priority").map((task) => task.id), ["a", "b", "n", "d"]);
  assert.deepEqual(tasks.map((task) => task.id), ["b", "a", "n", "d"]);
});

test("keeps equal computed values in stable custom order", () => {
  const tasks = [
    { id: "first", title: "Same", done: false, dueDate: "2026-08-08", priority: "high" },
    { id: "second", title: "Same", done: false, dueDate: "2026-08-08", priority: "high" },
    { id: "unset-1", title: "Unset", done: false },
    { id: "unset-2", title: "Unset", done: false },
  ];

  for (const sort of ["alphabetical", "dueDate", "priority"]) {
    assert.deepEqual(sortTasks(tasks, sort).map((task) => task.id), ["first", "second", "unset-1", "unset-2"]);
  }
});

test("server-renders alphabetical navigation and task organization controls", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Mission Control — Direct the work that matters<\/title>/i);

  const sidebar = html.match(/<aside[^>]*class="sidebar[^"]*"[^>]*>[\s\S]*?<\/aside>/i)?.[0];
  assert.ok(sidebar, "Expected the Mission Control sidebar to render");
  assert.doesNotMatch(sidebar, /draggable=|drag-handle|Drag to reorder/i);

  const areaPositions = ["Business &amp; life", "Family", "Personal growth", "Trading"].map((name) => sidebar.indexOf(name));
  assert.ok(areaPositions.every((position) => position >= 0));
  assert.deepEqual([...areaPositions].sort((a, b) => a - b), areaPositions);
  assert.ok(sidebar.indexOf("A-Setup Execution") < sidebar.indexOf("Market Replay Lab"));

  assert.match(html, /role="group" aria-label="Sort tasks"/i);
  assert.match(html, />Manual<\/button>/i);
  assert.match(html, />A–Z<\/button>/i);
  assert.match(html, />Due<\/button>/i);
  assert.match(html, />Priority<\/button>/i);
  assert.match(html, /type="date"/i);
  assert.match(html, /aria-label="Due date for /i);
  assert.match(html, /aria-label="Priority for /i);
});
