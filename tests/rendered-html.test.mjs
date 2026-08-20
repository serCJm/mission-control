import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { changedAreaPatch, normalizeArea } from "../app/area-schema.mjs";
import { openDateInputPicker } from "../app/task-date-control.mjs";
import { isTaskSort, sortTasks } from "../app/task-sorting.mjs";
import { normalizeTaskNotes } from "../app/task-schema.mjs";

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

test("upgrades saved areas from before custom icons without losing identity", () => {
  assert.deepEqual(normalizeArea({ id: "trading", name: "Trading", cue: "Protect capital" }), { id: "trading", name: "Trading", icon: "trend" });
  assert.deepEqual(normalizeArea({ id: "custom", name: "Health", cue: "Define what matters" }), { id: "custom", name: "Health", icon: "target" });
  assert.deepEqual(normalizeArea({ id: "custom", name: "Health", icon: "heart" }), { id: "custom", name: "Health", icon: "heart" });
  assert.equal(normalizeArea({ id: "broken", name: "Broken" }), null);
});

test("saves only area fields changed during an edit", () => {
  const initial = { name: "Trading", icon: "trend" };
  assert.deepEqual(changedAreaPatch(initial, { name: "Trading systems", icon: "trend" }), { name: "Trading systems" });
  assert.deepEqual(changedAreaPatch(initial, { name: "Trading", icon: "target" }), { icon: "target" });
  assert.deepEqual(changedAreaPatch(initial, initial), {});
});

test("normalizes persisted task notes to the server contract", () => {
  assert.equal(normalizeTaskNotes("useful context"), "useful context");
  assert.equal(normalizeTaskNotes("x".repeat(20_000)), "x".repeat(20_000));
  assert.equal(normalizeTaskNotes(undefined), undefined);
  assert.equal(normalizeTaskNotes(42), null);
  assert.equal(normalizeTaskNotes({ text: "invalid" }), null);
  assert.equal(normalizeTaskNotes("x".repeat(20_001)), null);
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

test("keeps task field sizing separate from checkbox sizing", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\s*([{},:;])\s*/g, "$1");
  assert.match(css, /\.task-check input,\.review-steps input\[type="checkbox"\]\{[^}]*width:18px/);
  assert.doesNotMatch(css, /\.task-row input,\.inbox-row input/);
  assert.match(css, /\.task-direct-control\.timing\{padding:0\}/);
  assert.match(css, /\.task-direct-trigger\{[^}]*height:100%/);
  assert.match(css, /\.timing \.task-direct-trigger\{[^}]*min-width:44px/);
  assert.match(css, /\.task-row\.custom-order\{grid-template-areas:"check copy" "reorder copy"/);
  assert.match(css, /\.task-row>\.order-controls\{grid-area:reorder;width:44px;height:44px/);
  assert.match(css, /\.name-editor>button \.edit-label\{display:none\}/);
  assert.match(css, /\.task-note-preview\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
  assert.match(css, /\.task-note-editor\{[^}]*grid-column:1\/-1/);
  assert.match(css, /\.task-note-trigger\[aria-expanded="true"\]\{[^}]*background:var\(--forest\)/);
  assert.match(css, /\.task-row\.custom-order:has\(\.task-note-editor\)>\.order-controls\{[^}]*position:absolute[^}]*top:57px/);
  assert.match(css, /\.project-notes\{[^}]*min-height:0/);
});

test("uses the shared task-note contract on the client and server", () => {
  const route = readFileSync(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(route, /normalizeTaskNotes\(item\.notes\) !== null/);
  assert.match(page, /const notes = normalizeTaskNotes\(task\.notes\)/);
  assert.match(page, /notes === null \? null/);
  assert.match(page, /maxLength=\{20_000\}/);
  assert.match(page, /notes: notes \|\| undefined/);
  assert.match(page, /onBlur=\{commitNotes\}/);
  assert.doesNotMatch(page, /onChange=\{\(event\) => updateTask\(task\.id, \{ notes:/);
});

test("persists a dirty task-note draft when its row unmounts without blur", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /return \(\) => onTaskNoteEditorChange\(\{ taskId: task\.id, open: false, draft: notesDraftRef\.current, saved: savedNotesRef\.current \}\)/);
  assert.match(page, /if \(draft !== undefined && saved !== undefined && draft !== saved\)/);
  assert.match(page, /queueMicrotask\(\(\) => \{/);
  assert.match(page, /pendingTaskNoteCommits\.current\.get\(taskId\) !== draft/);
  assert.match(page, /notes: draft \|\| undefined/);
  assert.match(page, /if \(!task \|\| \(task\.notes \?\? ""\) === draft\)/);
});

test("row drops only intercept an active internal drag", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function drop[\s\S]*?if \(!dragged\) return;[\s\S]*?event\.preventDefault\(\);/);
});

test("opens the native date picker with browser fallbacks", () => {
  const supportedCalls = [];
  openDateInputPicker({ showPicker: () => supportedCalls.push("show"), click: () => supportedCalls.push("click"), focus: () => supportedCalls.push("focus") });
  assert.deepEqual(supportedCalls, ["show"]);

  const legacyCalls = [];
  openDateInputPicker({ click: () => legacyCalls.push("click"), focus: () => legacyCalls.push("focus") });
  assert.deepEqual(legacyCalls, ["click"]);

  const recoveryCalls = [];
  openDateInputPicker({ showPicker: () => { throw new Error("Picker unavailable"); }, click: () => recoveryCalls.push("click"), focus: () => recoveryCalls.push("focus") });
  assert.deepEqual(recoveryCalls, ["focus", "click"]);
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

  assert.match(html, /<select[^>]*aria-label="Sort tasks"/i);
  assert.match(html, /class="task-sort-control"/i);
  assert.match(html, /class="task-sort-value">Manual<\/span>/i);
  assert.match(html, /<option[^>]*>Manual<\/option>/i);
  assert.match(html, /<option[^>]*>A–Z<\/option>/i);
  assert.match(html, /<option[^>]*>Due<\/option>/i);
  assert.match(html, /<option[^>]*>Priority<\/option>/i);
  assert.doesNotMatch(html, /class="step-controls"|title="Move up"|title="Move down"/i);
  assert.match(html, /type="date"/i);
  assert.match(html, /aria-label="Due date for /i);
  assert.match(html, /aria-label="Priority for /i);
  assert.match(html, /class="task-direct-control timing/i);
  assert.match(html, /class="task-direct-trigger"/i);
  assert.match(html, /class="task-direct-control priority/i);
  assert.match(html, /class="priority-swatch"/i);
  assert.match(html, /class="edit-icon"/i);
  assert.match(html, /class="task-direct-control task-note-trigger/i);
  assert.match(html, /aria-label="Add notes for /i);
  assert.match(html, /aria-expanded="false"/i);
  assert.match(html, /aria-controls="task-notes-/i);
  assert.doesNotMatch(html, /task-plan-trigger|task-plan-done/i);

  const currentAreaPicker = html.match(/<section[^>]*class="current-area-picker"[^>]*>[\s\S]*?<\/section>/i)?.[0];
  assert.ok(currentAreaPicker, "Expected the current area picker to render");
  assert.match(currentAreaPicker, /aria-pressed="true"/i);
  assert.match(currentAreaPicker, /aria-label="Open Trading"/i);
  assert.doesNotMatch(currentAreaPicker, /Protect capital|Compound skill|Be present|Close loops/i);
  assert.equal((currentAreaPicker.match(/class="area-choice /g) ?? []).length, 4);
  assert.doesNotMatch(html, /class="area-overview|focus-area-button|Sort areas A–Z/i);
});
