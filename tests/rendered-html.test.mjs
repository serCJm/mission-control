import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { changedAreaPatch, normalizeArea } from "../app/area-schema.mjs";
import { normalizeProjectNotes, sortProjectNotes } from "../app/project-note-schema.mjs";
import { isFinalRoutineSessionStatus, materializeAreaBlocks, normalizePlanner, parsePlannerCandidate, placePlannerBlockItem, plannerBlockItems, plannerBlockTarget } from "../app/planner-schema.mjs";
import { normalizeRoutine, reconcileRoutine, routineDateKey } from "../app/routine-schema.mjs";
import { isTaskSort, sortTasks } from "../app/task-sorting.mjs";
import { isTaskStatus, normalizeTaskNotes, taskPlacementForDestination } from "../app/task-schema.mjs";
import { currentWeekKey, emptyWeeklyReview, normalizeWeeklyReview } from "../app/workspace-guidance.mjs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const plannerView = readFileSync(new URL("../app/planner.tsx", import.meta.url), "utf8");
const plannerStyles = readFileSync(new URL("../app/planner.css", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("keeps shared area, note, sort, and weekly-review contracts strict", () => {
  assert.deepEqual(normalizeArea({ id: "a", name: "Trading", cue: "legacy" }), { id: "a", name: "Trading", icon: "trend" });
  assert.deepEqual(changedAreaPatch({ name: "Trading", icon: "target" }, { name: "Trading", icon: "trend" }), { icon: "trend" });
  assert.equal(normalizeTaskNotes("context"), "context");
  assert.equal(normalizeTaskNotes("x".repeat(20_001)), null);
  assert.equal(isTaskStatus("todo"), true);
  assert.equal(isTaskStatus("next"), false);
  assert.equal(isTaskSort("priority"), true);
  assert.equal(currentWeekKey(new Date("2026-08-25T12:00:00-07:00")), "2026-W35");
  assert.deepEqual(emptyWeeklyReview("2026-W35"), { weekKey: "2026-W35", completedSteps: [], intention: "" });
  assert.deepEqual(normalizeWeeklyReview({ weekKey: "2026-W35", completedSteps: [0, 2, 2], intention: "Protect slack." }), { weekKey: "2026-W35", completedSteps: [0, 2], intention: "Protect slack." });
});

test("moves tasks through area and project backlogs without a focus destination", () => {
  const projects = [{ id: "execution", areaId: "trading" }];
  assert.deepEqual(taskPlacementForDestination("backlog:trading", projects), { areaId: "trading", projectId: undefined, someday: true, waiting: undefined, status: "todo" });
  assert.deepEqual(taskPlacementForDestination("waiting:trading", projects), { areaId: "trading", projectId: undefined, someday: undefined, waiting: true, status: "todo" });
  assert.deepEqual(taskPlacementForDestination("project:execution", projects), { areaId: "trading", projectId: "execution", someday: undefined, waiting: undefined, status: "todo" });
  assert.deepEqual(taskPlacementForDestination("project-waiting:execution", projects), { areaId: "trading", projectId: "execution", someday: undefined, waiting: true, status: "todo" });
  assert.equal(taskPlacementForDestination("area:trading", projects), null);
});

test("sorts tasks and project notes without mutating durable order", () => {
  const tasks = [{ id: "b", title: "Beta", status: "todo", createdAt: 2 }, { id: "a", title: "Alpha", status: "doing", createdAt: 1 }];
  assert.deepEqual(sortTasks(tasks, "alphabetical").map((task) => task.id), ["b", "a"]);
  assert.deepEqual(tasks.map((task) => task.id), ["b", "a"]);
  const notes = normalizeProjectNotes([{ id: "old", title: "", body: "Old", pinned: false, createdAt: 1, updatedAt: 1 }, { id: "pin", title: "Pinned", body: "", pinned: true, createdAt: 2, updatedAt: 2 }]);
  assert.ok(notes);
  assert.deepEqual(sortProjectNotes(notes).map((note) => note.id), ["pin", "old"]);
});

test("reconciles a routine session without creating overdue debt", () => {
  const routine = normalizeRoutine({ id: "review", areaId: "trading", name: "Review", weekdays: [3], allDay: true, expectedMinutes: 20, checklist: [], sessions: [], suspensions: [], scheduleEffectiveOn: "2026-08-26" });
  assert.ok(routine);
  const now = new Date("2026-08-26T18:30:00-07:00");
  const reconciled = reconcileRoutine(routine, now);
  assert.equal(routineDateKey(now), "2026-08-26");
  assert.equal(reconciled.sessions.at(-1)?.date, "2026-08-26");
});

function plannerFixture(blockItems = []) {
  return { areaBlockRules: [{ id: "trading-mwf", areaId: "trading", weekdays: [1, 3, 5], effectiveOn: "2026-08-24", startTime: "10:00", endTime: "12:00" }], areaBlockExceptions: [], blockItems };
}

const plannerMaps = [new Set(["trading", "family"]), new Map([["task-1", "trading"], ["task-2", "trading"], ["task-3", "trading"], ["task-4", "trading"], ["task-family", "family"]]), new Map([["routine-1", "trading"]])];

test("stores an ordered This block list against the original occurrence", () => {
  const source = plannerFixture([{ id: "one", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-1" }, { id: "two", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "routine", itemId: "routine-1" }]);
  const normalized = normalizePlanner(source, ...plannerMaps);
  assert.ok(normalized);
  const occurrence = materializeAreaBlocks(normalized, ["2026-08-26"])[0];
  assert.deepEqual(plannerBlockItems(normalized, occurrence).map((item) => item.id), ["one", "two"]);
});

test("targets the active area block before the next matching block", () => {
  const source = plannerFixture();
  source.areaBlockRules.push({ id: "family-thursday", areaId: "family", weekdays: [4], effectiveOn: "2026-08-24", startTime: "14:00", endTime: "16:00" });
  const active = plannerBlockTarget(source, "trading", "2026-08-26", 10 * 60 + 30);
  assert.equal(active?.active, true);
  assert.equal(active?.occurrence.date, "2026-08-26");
  const upcoming = plannerBlockTarget(source, "trading", "2026-08-26", 13 * 60);
  assert.equal(upcoming?.active, false);
  assert.equal(upcoming?.occurrence.date, "2026-08-28");
  const areaMismatch = plannerBlockTarget(source, "family", "2026-08-26", 10 * 60 + 30);
  assert.equal(areaMismatch?.active, false);
  assert.equal(areaMismatch?.occurrence.date, "2026-08-27");
});

test("adds and caps ordered block queue work without duplicates", () => {
  const occurrence = materializeAreaBlocks(plannerFixture(), ["2026-08-26"])[0];
  const first = placePlannerBlockItem(plannerFixture(), occurrence, "task", "task-1", "one");
  const second = placePlannerBlockItem(first.planner, occurrence, "task", "task-2", "two");
  assert.deepEqual(plannerBlockItems(second.planner, occurrence).map((item) => item.itemId), ["task-1", "task-2"]);
  assert.equal(placePlannerBlockItem(second.planner, occurrence, "task", "task-2", "duplicate").status, "exists");
  const third = placePlannerBlockItem(second.planner, occurrence, "task", "task-3", "three");
  assert.equal(placePlannerBlockItem(third.planner, occurrence, "task", "task-4", "four").status, "full");
});

test("does not queue a date-scoped routine twice on the same actual date", () => {
  const source = plannerFixture();
  source.areaBlockRules.push({ id: "trading-later", areaId: "trading", weekdays: [3], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "14:00" });
  const occurrences = materializeAreaBlocks(source, ["2026-08-26"]);
  const first = placePlannerBlockItem(source, occurrences[0], "routine", "routine-1", "first");
  assert.equal(first.status, "added");
  assert.equal(placePlannerBlockItem(first.planner, occurrences[1], "routine", "routine-1", "second").status, "exists");

  const duplicated = { ...source, blockItems: [
    { id: "first", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "routine", itemId: "routine-1" },
    { id: "second", ruleId: "trading-later", occurrenceDate: "2026-08-26", kind: "routine", itemId: "routine-1" },
  ] };
  assert.equal(normalizePlanner(duplicated, ...plannerMaps), null);
});

test("date-scoped routine uniqueness follows overrides onto their actual date", () => {
  const source = plannerFixture();
  source.areaBlockRules.push({ id: "trading-friday-later", areaId: "trading", weekdays: [5], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "14:00" });
  source.areaBlockExceptions = [
    { id: "move-wed", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "10:00", endTime: "12:00" },
    { id: "move-fri", ruleId: "trading-friday-later", occurrenceDate: "2026-08-28", kind: "override", date: "2026-08-27", startTime: "12:00", endTime: "14:00" },
  ];
  source.blockItems = [
    { id: "wed", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "routine", itemId: "routine-1" },
    { id: "fri", ruleId: "trading-friday-later", occurrenceDate: "2026-08-28", kind: "routine", itemId: "routine-1" },
  ];
  assert.equal(normalizePlanner(source, ...plannerMaps), null);
});

test("rejects a normal routine occurrence plus an override on the same actual date", () => {
  const source = plannerFixture();
  source.areaBlockRules.push({ id: "trading-thursday", areaId: "trading", weekdays: [4], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "14:00" });
  source.areaBlockExceptions = [{ id: "move-wed", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "10:00", endTime: "12:00" }];
  source.blockItems = [
    { id: "overridden", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "routine", itemId: "routine-1" },
    { id: "normal", ruleId: "trading-thursday", occurrenceDate: "2026-08-27", kind: "routine", itemId: "routine-1" },
  ];
  assert.equal(normalizePlanner(source, ...plannerMaps), null);
});

test("rejects overlapping independent overrides on one date and accepts adjacency", () => {
  const source = plannerFixture();
  source.areaBlockRules.push({ id: "trading-friday-later", areaId: "trading", weekdays: [5], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "14:00" });
  const first = { id: "move-wed", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "10:00", endTime: "12:00" };
  const overlapping = { id: "move-fri", ruleId: "trading-friday-later", occurrenceDate: "2026-08-28", kind: "override", date: "2026-08-27", startTime: "11:45", endTime: "13:00" };
  assert.equal(normalizePlanner({ ...source, areaBlockExceptions: [first, overlapping] }, ...plannerMaps), null);

  const adjacent = { ...overlapping, startTime: "12:00", endTime: "14:00" };
  assert.ok(normalizePlanner({ ...source, areaBlockExceptions: [first, adjacent] }, ...plannerMaps));
});

test("parses planner candidate IDs at only the first colon", () => {
  assert.deepEqual(parsePlannerCandidate("task:external:42"), { kind: "task", itemId: "external:42" });
  assert.deepEqual(parsePlannerCandidate("routine:morning:review"), { kind: "routine", itemId: "morning:review" });
  assert.equal(parsePlannerCandidate("invalid:value"), null);
  assert.equal(parsePlannerCandidate("task:"), null);
});

test("rejects overlapping planner rules and overrides while allowing adjacency", () => {
  const recurringOverlap = plannerFixture();
  recurringOverlap.areaBlockRules.push({ id: "family-overlap", areaId: "family", weekdays: [3], effectiveOn: "2026-08-24", startTime: "11:45", endTime: "13:00" });
  assert.equal(normalizePlanner(recurringOverlap, ...plannerMaps), null);

  const adjacent = plannerFixture();
  adjacent.areaBlockRules.push({ id: "family-adjacent", areaId: "family", weekdays: [3], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "13:00" });
  assert.ok(normalizePlanner(adjacent, ...plannerMaps));

  const overrideOverlap = plannerFixture();
  overrideOverlap.areaBlockRules.push({ id: "family-thursday", areaId: "family", weekdays: [4], effectiveOn: "2026-08-24", startTime: "15:00", endTime: "17:00" });
  overrideOverlap.areaBlockExceptions = [{ id: "move", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "14:00", endTime: "16:00" }];
  assert.equal(normalizePlanner(overrideOverlap, ...plannerMaps), null);
});

test("rejects duplicate, cross-area, skipped, or overfull block work", () => {
  const item = (id, itemId = "task-1") => ({ id, ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId });
  assert.equal(normalizePlanner(plannerFixture([item("one"), item("two")]), ...plannerMaps), null);
  assert.equal(normalizePlanner(plannerFixture([item("one"), item("two", "task-2"), item("three", "task-3"), item("four", "task-4")]), ...plannerMaps), null);
  assert.equal(normalizePlanner(plannerFixture([item("one", "missing")]), ...plannerMaps), null);
  const skipped = plannerFixture([item("one")]);
  skipped.areaBlockExceptions = [{ id: "skip", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "skip" }];
  assert.equal(normalizePlanner(skipped, ...plannerMaps), null);
  assert.equal(normalizePlanner(plannerFixture([item("wrong-area", "task-family")]), ...plannerMaps), null);
});

test("rejects an undo candidate when a freed block slot has been refilled", () => {
  const occupied = plannerFixture([
    { id: "one", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-1" },
    { id: "two", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-2" },
    { id: "three", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-3" },
  ]);
  const restoredCandidate = { ...occupied, blockItems: [...occupied.blockItems, { id: "saved", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-4" }] };
  assert.ok(normalizePlanner(occupied, ...plannerMaps));
  assert.equal(normalizePlanner(restoredCandidate, ...plannerMaps), null);
});

test("keeps override block work attached to its recurring source date", () => {
  const source = plannerFixture();
  source.areaBlockExceptions = [{ id: "move", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "13:00", endTime: "15:00" }];
  const normalized = normalizePlanner(source, ...plannerMaps);
  assert.ok(normalized);
  const occurrence = materializeAreaBlocks(normalized, ["2026-08-27"])[0];
  assert.equal(occurrence.sourceDate, "2026-08-26");
  const placed = placePlannerBlockItem(normalized, occurrence, "task", "task-1", "placed");
  assert.equal(placed.status, "added");
  assert.equal(placed.planner.blockItems[0].occurrenceDate, "2026-08-26");
  assert.deepEqual(plannerBlockItems(placed.planner, occurrence).map((item) => item.id), ["placed"]);
});

test("only finalized routine sessions complete planner work", () => {
  assert.equal(isFinalRoutineSessionStatus("pending"), false);
  for (const status of ["completed", "skipped", "missed"]) assert.equal(isFinalRoutineSessionStatus(status), true);
});

test("planner repairs preserve data and queue state", () => {
  assert.doesNotMatch(route, /archived:|resetIncompatibleWorkspace|UPDATE workspaces SET user_id/);
  assert.match(route, /incompatible data format/);
  assert.match(plannerView, /plannerBlockItemDone/);
  assert.match(plannerView, /someday: undefined, waiting: undefined/);
  assert.match(plannerView, /waiting: true, someday: undefined/);
  assert.match(plannerView, /planner-orphan-deadline \$\{inAreaBlock \? "in-block"/);
  assert.match(plannerView, /requestAnimationFrame/);
  assert.match(plannerView, /useMemo\(\(\) => selectedArea \? plannerBlockTarget/);
  assert.match(page, /blockItems: Array<\{ item: PlannerData\["blockItems"\]\[number\]; index: number \}>/);
  assert.match(page, /task\.status !== undo\.to\.status/);
  assert.match(page, /type MoveTaskUndo = \{[^}]*blockItems: PlannerBlockItemPosition\[\]/);
  assert.match(page, /planner: removesFromBlock \?/);
  assert.match(page, /\.\.\.savedItems/);
  assert.match(page, /item\.scope\.startsWith\("project-waiting:"\)/);
  assert.match(page, /scope=\{`project-waiting:\$\{project\.id\}`\}/);
  assert.match(page, /if \(!currentIds\.includes\(source\.id\) \|\| !currentIds\.includes\(target\.id\)\) return/);
  assert.match(page, /function plannerAfterBlockItemRestore/);
  assert.match(page, /return normalizePlanner\(/);
  assert.match(page, /const restored = workspaceAfterTaskDeleteUndo\(workspace, taskUndo\)/);
  assert.match(page, /const restored = workspaceAfterTaskMoveUndo\(workspace, moveTaskUndo\)/);
  assert.match(page, /if \(!restored\) \{[\s\S]*?setToast\("Undo unavailable"\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?setWorkspace\(restored\);/);
  assert.match(page, /sessions: \[\.\.\.reconciled\.sessions, \{ date, status, checklist:/);
});

test("client and server require the same continuous-execution workspace shape", () => {
  assert.match(page, /blockItems: \[\]/);
  assert.match(route, /blockItems: Array/);
  assert.doesNotMatch(page, /focusTaskIds|currentAreaId/);
  assert.doesNotMatch(route, /focusTaskIds|currentAreaId/);
});

test("calendar owns This block and derives Now from its first unfinished item", () => {
  assert.match(plannerView, /This block already has three items/);
  assert.match(plannerView, /const nowItemId = occurrenceActive \? blockItems\.find/);
  assert.match(plannerView, /Add to queue/);
  assert.doesNotMatch(plannerView, /nowLabel|addLabel|onSchedule|onNow/);
  assert.match(plannerView, /placePlannerBlockItem/);
  assert.match(plannerView, /onTaskChange\(itemId, \{ someday: undefined, waiting: undefined \}\)/);
  assert.match(plannerView, /Waiting/);
  assert.match(plannerView, /Resume/);
  assert.match(plannerView, /TouchSensor/);
  assert.match(plannerView, /KeyboardSensor/);
  assert.match(plannerView, /Add to block/);
  assert.match(plannerStyles, /prefers-reduced-motion:reduce/);
});

test("area, project, Today, and Review speak one execution language", () => {
  assert.match(page, /session=\{plannerSession\}/);
  assert.match(page, /className="topbar-nav"/);
  assert.match(page, /onCreateArea=\{createArea\}/);
  assert.match(page, /<h2>Area backlog<\/h2>/);
  assert.match(page, /Project waiting/);
  assert.match(page, /Areas carry the work/);
  assert.match(page, /onClick=\{\(\) => navigate\(\{ kind: "today" \}\)\}>Review area blocks/);
  assert.doesNotMatch(page, /kind: "planner"|Today’s focus|Choose focus|className=\{`sidebar|Areas and projects|sidebar-foot/);
});

test("server-renders the application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Mission Control/);
  assert.match(html, /Today/);
  assert.match(html, /Choose the work/);
  assert.doesNotMatch(html, /Areas and projects/);
  assert.doesNotMatch(html, />Planner</);
});
