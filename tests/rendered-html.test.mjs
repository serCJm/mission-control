import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { changedAreaPatch, normalizeArea } from "../app/area-schema.mjs";
import { openDateInputPicker } from "../app/task-date-control.mjs";
import { normalizeProjectNotes, sortProjectNotes } from "../app/project-note-schema.mjs";
import { isTaskSort, sortTasks } from "../app/task-sorting.mjs";
import { isTaskStatus, normalizeTaskNotes } from "../app/task-schema.mjs";
import { currentWeekKey, emptyWeeklyReview, normalizeFocusTaskIds, normalizeWeeklyReview } from "../app/workspace-guidance.mjs";

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

test("keeps deliberate focus to three eligible tasks in the current area", () => {
  const tasks = [
    { id: "a", areaId: "trading", status: "todo" },
    { id: "b", areaId: "trading", status: "doing" },
    { id: "done", areaId: "trading", status: "done" },
    { id: "later", areaId: "trading", status: "todo", someday: true },
    { id: "elsewhere", areaId: "family", status: "todo" },
  ];
  assert.deepEqual(normalizeFocusTaskIds(["b", "a"], tasks, "trading"), ["b", "a"]);
  assert.equal(normalizeFocusTaskIds(["done"], tasks, "trading"), null);
  assert.equal(normalizeFocusTaskIds(["later"], tasks, "trading"), null);
  assert.equal(normalizeFocusTaskIds(["elsewhere"], tasks, "trading"), null);
  assert.equal(normalizeFocusTaskIds(["a", "b", "a"], tasks, "trading"), null);
  assert.equal(normalizeFocusTaskIds(["a", "b", "done", "later"], tasks, "trading"), null);
});

test("stores weekly review progress against an ISO week", () => {
  assert.equal(currentWeekKey(new Date("2026-08-25T12:00:00-07:00"), "America/Los_Angeles"), "2026-W35");
  assert.deepEqual(emptyWeeklyReview("2026-W35"), { weekKey: "2026-W35", completedSteps: [], intention: "" });
  assert.deepEqual(normalizeWeeklyReview({ weekKey: "2026-W35", completedSteps: [0, 2, 2], intention: "Protect the mornings." }), { weekKey: "2026-W35", completedSteps: [0, 2], intention: "Protect the mornings." });
  assert.equal(normalizeWeeklyReview({ weekKey: "2026-35", completedSteps: [], intention: "" }), null);
  assert.equal(normalizeWeeklyReview({ weekKey: "2026-W35", completedSteps: [5], intention: "" }), null);
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

test("validates and sorts project note cards", () => {
  const notes = [
    { id: "older-pinned", title: "Pinned", body: "Keep close", pinned: true, createdAt: 1, updatedAt: 3 },
    { id: "recent", title: "Recent", body: "Latest", pinned: false, createdAt: 3, updatedAt: 9 },
    { id: "newer-pinned", title: "Pinned too", body: "Newer", pinned: true, createdAt: 2, updatedAt: 8 },
  ];
  assert.deepEqual(normalizeProjectNotes(notes), notes);
  assert.deepEqual(sortProjectNotes(notes).map((note) => note.id), ["newer-pinned", "older-pinned", "recent"]);
  assert.deepEqual(notes.map((note) => note.id), ["older-pinned", "recent", "newer-pinned"]);
  assert.equal(normalizeProjectNotes("legacy notes"), null);
  assert.equal(normalizeProjectNotes([{ ...notes[0], id: "duplicate" }, { ...notes[1], id: "duplicate" }]), null);
  assert.equal(normalizeProjectNotes([{ ...notes[0], title: "x".repeat(501) }]), null);
  assert.equal(normalizeProjectNotes([{ ...notes[0], body: "x".repeat(20_001) }]), null);
  assert.equal(normalizeProjectNotes([{ ...notes[0], pinned: "yes" }]), null);
  assert.equal(normalizeProjectNotes([{ ...notes[0], updatedAt: Number.NaN }]), null);
});

test("accepts only the three persisted task statuses", () => {
  for (const status of ["todo", "doing", "done"]) assert.equal(isTaskStatus(status), true);
  for (const status of ["open", "complete", false, undefined]) assert.equal(isTaskStatus(status), false);
});

test("sorts tasks without mutating their custom order", () => {
  const tasks = [
    { id: "b", title: "Bravo", status: "todo", dueDate: "2026-08-10", priority: "medium" },
    { id: "a", title: "alpha", status: "todo", dueDate: "2026-08-08", priority: "high" },
    { id: "n", title: "No metadata", status: "todo" },
    { id: "d", title: "Aardvark done", status: "done", dueDate: "2026-08-07", priority: "high" },
  ];

  assert.deepEqual(sortTasks(tasks, "custom").map((task) => task.id), ["b", "a", "n", "d"]);
  assert.deepEqual(sortTasks(tasks, "alphabetical").map((task) => task.id), ["a", "b", "n", "d"]);
  assert.deepEqual(sortTasks(tasks, "dueDate").map((task) => task.id), ["a", "b", "n", "d"]);
  assert.deepEqual(sortTasks(tasks, "priority").map((task) => task.id), ["a", "b", "n", "d"]);
  assert.deepEqual(tasks.map((task) => task.id), ["b", "a", "n", "d"]);
});

test("keeps equal computed values in stable custom order", () => {
  const tasks = [
    { id: "first", title: "Same", status: "todo", dueDate: "2026-08-08", priority: "high" },
    { id: "second", title: "Same", status: "todo", dueDate: "2026-08-08", priority: "high" },
    { id: "unset-1", title: "Unset", status: "todo" },
    { id: "unset-2", title: "Unset", status: "todo" },
  ];

  for (const sort of ["alphabetical", "dueDate", "priority"]) {
    assert.deepEqual(sortTasks(tasks, sort).map((task) => task.id), ["first", "second", "unset-1", "unset-2"]);
  }
});

test("ranks all three task statuses before applying computed sorts", () => {
  const tasks = [
    { id: "done", title: "Alpha", status: "done", dueDate: "2026-08-01", priority: "high" },
    { id: "doing", title: "Bravo", status: "doing", dueDate: "2026-08-02", priority: "medium" },
    { id: "todo", title: "Zulu", status: "todo", dueDate: "2026-08-03", priority: "low" },
  ];

  for (const sort of ["alphabetical", "dueDate", "priority"]) {
    assert.deepEqual(sortTasks(tasks, sort).map((task) => task.id), ["todo", "doing", "done"]);
  }
});

test("keeps task field sizing separate from checkbox sizing", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\s*([{},:;])\s*/g, "$1");
  assert.match(css, /\.task-check input,\.review-steps input\[type="checkbox"\]\{[^}]*width:18px/);
  assert.doesNotMatch(css, /\.task-row input,\.inbox-row input/);
  assert.match(css, /\.task-direct-control\.timing\{padding:0\}/);
  assert.match(css, /\.task-direct-trigger\{[^}]*height:100%/);
  assert.match(css, /\.timing \.task-direct-trigger\{[^}]*min-width:44px/);
  assert.match(css, /\.task-row\.custom-order\{grid-template-columns:12px 44px minmax\(0,1fr\);grid-template-areas:"reorder check copy"/);
  assert.match(css, /\.task-row>\.order-controls\{grid-area:reorder;position:relative;width:12px;height:44px;align-self:center/);
  assert.match(css, /\.task-row>\.order-controls \.drag-handle\{position:absolute;left:50%;top:0;width:24px;transform:translateX\(-50%\)/);
  assert.match(css, /\.task-row:has\(\.name-editor\.editing\)\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"copy";padding:18px 0\}/);
  assert.match(css, /\.task-row:has\(\.name-editor\.editing\)>\.order-controls,\.task-row:has\(\.name-editor\.editing\)>\.task-check\{display:none\}/);
  assert.match(css, /\.name-editor>button \.edit-label\{display:none\}/);
  assert.match(css, /\.task-note-preview\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
  assert.match(css, /\.task-note-editor\{[^}]*grid-column:1\/-1/);
  assert.match(css, /\.task-note-trigger\[aria-expanded="true"\]\{[^}]*background:var\(--forest\)/);
  assert.match(css, /\.task-note-trigger\{[^}]*display:grid;place-items:center[^}]*padding:0!important/);
  assert.match(css, /\.task-note-trigger svg\{transform:translateX\(1px\)\}/);
  assert.match(css, /\.area-choice\{max-width:calc\(\(100% - 8px\)\/2\)\}/);
  assert.match(css, /\.today-page \.today-grid\{margin-inline:-17px\}/);
  assert.match(css, /\.today-page \.work-queue\{border-right:0;border-left:0;border-radius:0\}/);
  assert.doesNotMatch(css, /\.task-row\.custom-order:has\(\.task-note-editor\)>\.order-controls/);
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

test("uses the shared project-note contract and removes the legacy textarea", () => {
  const route = readFileSync(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(route, /normalizeProjectNotes\(item\.notes\)/);
  assert.match(page, /const notes = normalizeProjectNotes\(project\.notes\)/);
  assert.match(page, /type ProjectNote = \{ id: string; title: string; body: string; pinned: boolean; createdAt: number; updatedAt: number \}/);
  assert.match(page, /notes: ProjectNote\[\]/);
  assert.doesNotMatch(page, /notes: string/);
  assert.doesNotMatch(page, /maxLength=\{200_000\}/);
});

test("renders an accessible responsive project note board", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\s*([{},:;])\s*/g, "$1");
  assert.match(page, /<div className="section-title project-notes-heading">[\s\S]*?<h2[^>]*>Notes<\/h2>[\s\S]*?<div className="project-notes-meta">[\s\S]*?<button[^>]*className=\{`[^`]*project-note-add-button[^`]*`\} onClick=\{\(\) => composing \? closeComposer\(\) : setComposing\(true\)\}/);
  assert.match(page, /function closeComposer\(\) \{\s*setComposing\(false\);\s*\}/);
  assert.match(page, /function cancelComposer\(\) \{\s*setComposing\(false\);\s*setTitle\(""\);\s*setBody\(""\);\s*\}/);
  assert.match(page, /<ProjectView key=\{activeProject\.id\}/);
  assert.match(page, /aria-label=\{composing \? "Close new note form" : "Add a note"\}/);
  assert.match(page, /aria-expanded=\{composing\}/);
  assert.doesNotMatch(page, /project-note-composer-trigger/);
  assert.match(page, /disabled=\{!canCreate\}/);
  assert.match(page, /className="notes-board"/);
  assert.match(page, /sortProjectNotes\(project\.notes\)/);
  assert.match(page, /aria-pressed=\{note\.pinned\}/);
  assert.match(page, /title="Delete note"/);
  assert.match(page, /setUndoWorkspace\(workspace\)[\s\S]*?Note removed/);
  assert.match(page, /openProjectNoteEditors\.current\.size > 0/);
  assert.match(page, /No notes yet\./);
  assert.match(css, /\.notes-board\{column-count:3;column-gap:12px\}/);
  assert.match(css, /@media\(max-width:920px\)\{\.notes-board\{column-count:2\}\}/);
  assert.match(css, /@media\(max-width:580px\)[^{]*\{[^}]*[\s\S]*?\.notes-board\{column-count:1\}/);
  assert.match(css, /\.note-icon-button\{width:44px;height:44px/);
});

test("uses the three-state task contract and project view controls", () => {
  const route = readFileSync(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(route, /isTaskStatus\(item\.status\)/);
  assert.doesNotMatch(route, /item\.done|done: boolean/);
  assert.match(page, /status: "todo"/);
  assert.match(page, /mission-control-project-view-v1/);
  assert.match(page, /aria-label="Project task view"/);
  assert.match(page, /label: "To do"/);
  assert.match(page, /label: "Doing"/);
  assert.match(page, /label: "Done"/);
  assert.match(page, /className="kanban-board"/);
  assert.match(css, /\.kanban-board\{[^}]*align-items:stretch/);
  assert.match(page, /aria-label={`Status for \$\{task\.title\}`}/);
  assert.match(page, /className="status-control-label"/);
  assert.match(css, /\.task-status-control select,[^}]*opacity:0/);
  assert.doesNotMatch(page, /task\.done|done: false|done: true/);
});

test("uses compact accessible actions for inline name editing", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /aria-label="Save" title="Save"><ConfirmIcon/);
  assert.doesNotMatch(page, /CancelIcon|aria-label="Cancel"|title="Cancel"/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\s*([{},:;])\s*/g, "$1");
  assert.match(css, /\.editor-action-icon\{width:13px;height:13px/);
  assert.match(css, /\.name-editor\.editing\{display:grid;grid-template-columns:minmax\(0,1fr\) 34px/);
});

test("inline editors cancel drafts with Escape", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function NameEditor[\s\S]*?onKeyDown=\{\(event\) => \{ if \(event\.key === "Escape"\) \{ event\.preventDefault\(\); cancel\(\); \} \}\}/);
  assert.match(page, /function NameEditor[\s\S]*?setDraft\(value\);[\s\S]*?onEditingChange\?\.\(false\)/);
  assert.match(page, /function AreaEditor[\s\S]*?onKeyDown=\{\(event\) => \{ if \(event\.key === "Escape"\) \{ event\.preventDefault\(\); cancel\(\); \} \}\}/);
  assert.match(page, /function AreaEditor[\s\S]*?setDraftName\(initial\.current\.name\);[\s\S]*?setDraftIcon\(initial\.current\.icon\);[\s\S]*?setEditing\(false\)/);
});

test("uses an accessible icon-only mobile menu trigger", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\s*([{},:;])\s*/g, "$1");
  assert.match(page, /className="menu-button"/);
  assert.match(page, /aria-label="Menu" title="Menu"><MenuIcon/);
  assert.doesNotMatch(page, /className="menu-button"[^>]*>Menu<\/button>/);
  assert.match(css, /\.topbar\{padding:8px 16px 8px 8px\}/);
});

test("uses a compact accessible task submit control on every view", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\s*([{},:;])\s*/g, "$1");
  assert.match(page, /aria-label=\{`Add task to \$\{captureDestination\}`\}/);
  assert.match(page, /<PlusIcon \/>/);
  assert.match(page, /title=\{`Add task to \$\{captureDestination\}`\}><PlusIcon \/>/);
  assert.doesNotMatch(page, /quick-add-copy|>Add task <span>/);
  assert.match(css, /\.quick-add button\{width:52px;display:grid;place-items:center/);
  assert.match(css, /\.quick-add-icon\{display:block/);
});

test("uses an icon-only color priority picker", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /className="priority-menu" role="menu"/);
  assert.match(page, /role="menuitemradio"/);
  assert.match(page, /<PriorityFlag priority=\{priority\}/);
  assert.doesNotMatch(page, /<select value=\{task\.priority/);
});

test("provides isolated identity and storage for local development", () => {
  const auth = readFileSync(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  const entrypoint = readFileSync(new URL("../docker/entrypoint.sh", import.meta.url), "utf8");
  assert.match(auth, /process\.env\.NODE_ENV !== "development"/);
  assert.match(auth, /userId: "local-development"/);
  assert.match(route, /process\.env\.NODE_ENV === "development"/);
  assert.match(route, /CREATE TABLE IF NOT EXISTS workspaces/);
  assert.doesNotMatch(vite, /host: "0\.0\.0\.0"/);
  assert.match(entrypoint, /rm -f \.vinext\/dev\/lock\.json/);
});

test("recovers from an incompatible saved workspace without a sync dead-end", () => {
  const route = readFileSync(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(route, /DELETE FROM workspaces WHERE user_id = \?/);
  assert.match(route, /UPDATE workspaces SET user_id = \? WHERE user_id = \?/);
  assert.match(route, /resetIncompatibleWorkspace: true/);
  assert.match(page, /payload\.resetIncompatibleWorkspace/);
  assert.match(page, /previous cloud workspace was archived/);
  assert.doesNotMatch(route, /The saved workspace is invalid/);
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

test("project board drops guard the task's exact current project before changing status", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /currentTask\.projectId !== expectedProjectId/);
  assert.match(page, /moveTaskToStatus\(dragged\.id, status, project\.id,/);
  assert.doesNotMatch(page, /dragged\.scope\.startsWith\(`project:\$\{project\.id\}:/);
});

test("project status scopes preserve project IDs containing colons", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const projectScope = item\.scope\.slice\("project:"\.length\)/);
  assert.match(page, /const statusDelimiter = projectScope\.lastIndexOf\(":"\)/);
  assert.match(page, /const projectId = projectScope\.slice\(0, statusDelimiter\)/);
  assert.doesNotMatch(page, /item\.scope\.split\(":"\)/);
});

test("status moves clear a pending removal undo before mutating the workspace", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function moveTaskToStatus[\s\S]*?setUndoWorkspace\(null\);[\s\S]*?setWorkspace\(\(current\) =>/);
  assert.match(page, /function StatusControl[\s\S]*?moveTaskToStatus\(task\.id, event\.target\.value as TaskStatus\)/);
  assert.match(page, /showStatus moveTaskToStatus=\{\(id, status\) => moveTaskToStatus\(id, status, project\.id\)\}/);
  assert.match(page, /<StatusControl task=\{task\} moveTaskToStatus=\{\(id, status\) => moveTaskToStatus\(id, status, project\.id\)\}/);
  assert.doesNotMatch(page, /updateTask\(task\.id, \{ status:/);
});

test("task undo restores only the removed task into the latest workspace", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /type TaskUndo = \{ task: Task; index: number \}/);
  assert.match(page, /function removeTask[\s\S]*?setUndoWorkspace\(null\);[\s\S]*?setTaskUndo\(index >= 0 \? \{ task: workspace\.tasks\[index\], index \} : null\)/);
  assert.match(page, /function undoRemoval[\s\S]*?if \(taskUndo\) \{[\s\S]*?setWorkspace\(\(current\) => \{[\s\S]*?const tasks = \[\.\.\.current\.tasks\];[\s\S]*?tasks\.splice[\s\S]*?return \{ \.\.\.current, tasks \}/);
  assert.match(page, /toast === "Task deleted" && taskUndo/);
  assert.doesNotMatch(page, /\(taskUndo \|\| undoWorkspace\) && <button onClick=\{undoRemoval\}>Undo<\/button>/);
});

test("a replacement task undo restarts the toast expiry timer", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const timeout = window\.setTimeout\(\(\) => \{ setToast\(""\); setUndoWorkspace\(null\); setTaskUndo\(null\); \}, 8000\);[\s\S]*?\}, \[toast, taskUndo\]\);/);
});

test("area and project task composers reset when entity identity changes", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<AreaView key=\{activeArea\.id\}/);
  assert.match(page, /<ProjectView key=\{activeProject\.id\}/);
});

test("project rows open without hijacking their edit or drag controls", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /className=\{`entity-row project-entity \$\{projectSort === "custom" \? "custom-order" : "sorted-order"\}`\}[\s\S]*?role="link"[\s\S]*?tabIndex=\{0\}/);
  assert.match(page, /closest\("button, input, textarea, select, a"\)/);
  assert.match(page, /event\.target === event\.currentTarget && \(event\.key === "Enter" \|\| event\.key === " "\)/);
  assert.doesNotMatch(page, /className="open-link" onClick=\{\(\) => navigate\(\{ kind: "project"/);
});

test("area projects disclose open tasks and can release them to the area", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /const \[expandedProjects, setExpandedProjects\] = useState<Set<string>>/);
  assert.match(page, /className="project-disclosure" aria-expanded=\{isExpanded\} aria-controls=\{taskListId\}/);
  assert.match(page, /task\.projectId === project\.id && task\.status !== "done"/);
  assert.match(page, /aria-label=\{`Move \$\{task\.title\} to area tasks`\} onClick=\{\(\) => moveTask\(task\.id, `area:\$\{area\.id\}`\)\}/);
  assert.match(css, /\.project-disclosure\{[^}]*align-self:center;justify-self:center/);
  assert.match(page, /task\.status === "doing" \? "Doing" : "Todo"/);
  assert.match(css, /\.project-task-preview-row\{grid-template-columns:48px minmax\(0,1fr\) auto;gap:9px\}/);
  assert.match(css, /\.project-task-status\{[^}]*background:#f0f2ee;[^}]*transform:scale\(\.625\)/);
  assert.match(css, /\.project-task-status\.status-doing\{[^}]*background:#edf2df/);
});

test("keeps completed project work in a collapsed archive outside the active board", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /PROJECT_STATUSES\.filter\(\(status\) => status\.value !== "done"\)/);
  assert.match(page, /const completedTasks = tasks\.filter\(\(task\) => task\.status === "done"\)/);
  assert.match(page, /className=\{`completed-archive/);
  assert.match(page, /onDrop=\{\(event\) => dropInStatus\(event, "done"\)\}/);
  assert.match(page, /aria-expanded=\{showCompleted\} aria-controls=\{`completed-\$\{project\.id\}`\}/);
  assert.match(css, /\.kanban-board\{display:grid;grid-template-columns:repeat\(2,minmax\(260px,1fr\)\)/);
  assert.match(css, /\.completed-archive\{margin-top:14px/);
});

test("area tasks can be deferred to a separate someday queue", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  assert.match(page, /const somedayTasks = tasks\.filter\(\(task\) => !task\.projectId && task\.someday\)/);
  assert.match(page, /<h2>Someday<\/h2>/);
  assert.match(page, /label: "Someday", action: \(id\) => updateTask\(id, \{ someday: true \}\)/);
  assert.match(page, /label: "Move to today’s focus", action: \(id\) => updateTask\(id, \{ someday: undefined \}\)/);
  assert.match(page, /task\.status !== "done" && !task\.someday/);
  assert.match(route, /const validSomeday = item\.someday === undefined \|\| typeof item\.someday === "boolean"/);
});

test("Someday tasks can be created directly from the area page", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function addSomedayTask\(areaId: string, title: string\)/);
  assert.match(page, /createdAt: Date\.now\(\), someday: true/);
  assert.match(page, /selection\.kind === "area" \? \{ someday: true \} : \{\}/);
  assert.match(page, /`\$\{activeArea\.name\} Someday`/);
  assert.match(page, /aria-label=\{showSomedayForm \? "Close new Someday task form" : "New Someday task"\}/);
  assert.match(page, /className="someday-create"/);
  assert.match(page, /addSomedayTask\(area\.id, title\)/);
});

test("area task composers enforce the workspace task-title limit", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  assert.match(page, /value=\{newFocusTask\} maxLength=\{2_000\}/);
  assert.match(page, /value=\{newSomedayTask\} maxLength=\{2_000\}/);
  assert.match(route, /isText\(item\.title, 2_000\)/);
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

test("server-renders alphabetical navigation and deliberate daily focus", async () => {
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

  assert.match(html, /<h2>Focus three<\/h2>/i);
  assert.match(html, /<button[^>]*class="focus-choose-button"[^>]*>Choose focus<\/button>/i);
  assert.match(html, />3<!-- -->\/3</i);
  assert.doesNotMatch(html, /<select[^>]*aria-label="Sort tasks"/i);
  assert.doesNotMatch(html, /class="step-controls"|title="Move up"|title="Move down"/i);
  assert.doesNotMatch(html, /type="date"|aria-label="Due date for |aria-label="Priority for /i);
  assert.doesNotMatch(html, /class="task-direct-control timing|class="task-direct-trigger"|class="task-direct-control priority|class="priority-swatch"/i);
  assert.match(html, /class="edit-icon"/i);
  assert.doesNotMatch(html, /class="task-direct-control task-note-trigger|aria-label="Add notes for |aria-controls="task-notes-/i);
  assert.match(html, /class="task-due-date">(?:Due |Overdue)/i);
  assert.match(html, /class="task-row[^"]*has-priority priority-high/i);
  assert.doesNotMatch(html, /task-plan-trigger|task-plan-done/i);

  const currentAreaPicker = html.match(/<section[^>]*class="current-area-picker"[^>]*>[\s\S]*?<\/section>/i)?.[0];
  assert.ok(currentAreaPicker, "Expected the current area picker to render");
  assert.match(currentAreaPicker, /aria-pressed="true"/i);
  assert.match(currentAreaPicker, /aria-label="Open Trading"/i);
  assert.doesNotMatch(currentAreaPicker, /Protect capital|Compound skill|Be present|Close loops/i);
  assert.equal((currentAreaPicker.match(/class="area-choice /g) ?? []).length, 4);
  assert.doesNotMatch(html, /class="area-overview|focus-area-button|Sort areas A–Z/i);
});
