import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { changedAreaPatch, normalizeArea } from "../app/area-schema.mjs";
import { normalizeProjectNotes, sortProjectNotes } from "../app/project-note-schema.mjs";
import { CALENDAR_BLOCK_FILLS, DEFAULT_AREA_CALENDAR_BLOCK_FILL, DEFAULT_STANDALONE_CALENDAR_BLOCK_FILL, isFinalRoutineSessionStatus, materializeCalendarBlocks, normalizePlanner, parsePlannerCandidate, placePlannerBlockItem, plannerAfterOccurrenceDelete, plannerAfterOccurrenceUpdate, plannerAfterOneTimeRuleEdit, plannerAfterRuleDelete, plannerBlockItems, plannerBlockTarget } from "../app/planner-schema.mjs";
import { normalizeRoutine, reconcileRoutine, routineDateKey } from "../app/routine-schema.mjs";
import { createStarterWorkspace } from "../app/starter-workspace.mjs";
import { isTaskSort, sortTasks } from "../app/task-sorting.mjs";
import { isTaskStatus, normalizeTaskNotes, taskPlacementForDestination } from "../app/task-schema.mjs";
import { currentWeekKey, emptyWeeklyReview, normalizeWeeklyReview } from "../app/workspace-guidance.mjs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const presence = readFileSync(new URL("../app/presence.tsx", import.meta.url), "utf8");
const plannerView = readFileSync(new URL("../app/planner.tsx", import.meta.url), "utf8");
const plannerStyles = readFileSync(new URL("../app/planner.css", import.meta.url), "utf8");
const motionStyles = readFileSync(new URL("../app/motion.css", import.meta.url), "utf8");
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
  return { blockRules: [{ id: "trading-mwf", kind: "area", areaId: "trading", weekdays: [1, 3, 5], effectiveOn: "2026-08-24", startTime: "10:00", endTime: "12:00", fill: "sage" }], blockExceptions: [], blockItems };
}

const plannerMaps = [new Set(["trading", "family"]), new Map([["task-1", "trading"], ["task-2", "trading"], ["task-3", "trading"], ["task-4", "trading"], ["task-family", "family"]]), new Map([["routine-1", "trading"]])];

test("keeps the starter planner valid", () => {
  const workspace = createStarterWorkspace();
  assert.ok(normalizePlanner(
    workspace.planner,
    new Set(workspace.areas.map((area) => area.id)),
    new Map(workspace.tasks.filter((task) => task.areaId).map((task) => [task.id, task.areaId])),
    new Map(workspace.routines.map((routine) => [routine.id, routine.areaId])),
  ));
});

test("rejects the obsolete area-block planner shape", () => {
  assert.equal(normalizePlanner({ areaBlockRules: [], areaBlockExceptions: [], blockItems: [] }, ...plannerMaps), null);
});

test("stores an ordered This block list against the original occurrence", () => {
  const source = plannerFixture([{ id: "one", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-1" }, { id: "two", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "routine", itemId: "routine-1" }]);
  const normalized = normalizePlanner(source, ...plannerMaps);
  assert.ok(normalized);
  const occurrence = materializeCalendarBlocks(normalized, ["2026-08-26"])[0];
  assert.deepEqual(plannerBlockItems(normalized, occurrence).map((item) => item.id), ["one", "two"]);
});

test("validates schedule fills and applies them to every occurrence", () => {
  assert.deepEqual(CALENDAR_BLOCK_FILLS, ["sage", "sky", "sand", "rose", "lilac", "slate"]);
  assert.equal(DEFAULT_AREA_CALENDAR_BLOCK_FILL, "sage");
  assert.equal(DEFAULT_STANDALONE_CALENDAR_BLOCK_FILL, "slate");

  const defaultFill = normalizePlanner(plannerFixture(), ...plannerMaps);
  assert.ok(defaultFill);
  assert.equal(defaultFill.blockRules[0].fill, "sage");

  const missingFill = plannerFixture();
  delete missingFill.blockRules[0].fill;
  assert.equal(normalizePlanner(missingFill, ...plannerMaps), null);

  const source = plannerFixture();
  source.blockRules[0].fill = "rose";
  const normalized = normalizePlanner(source, ...plannerMaps);
  assert.ok(normalized);
  assert.deepEqual(materializeCalendarBlocks(normalized, ["2026-08-26", "2026-08-28"]).map((occurrence) => occurrence.fill), ["rose", "rose"]);

  source.blockExceptions = [
    { id: "visible-source", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "13:00", endTime: "15:00" },
    { id: "off-week", ruleId: "trading-mwf", occurrenceDate: "2026-08-28", kind: "override", date: "2026-09-03", startTime: "13:00", endTime: "15:00" },
  ];
  const moved = normalizePlanner(source, ...plannerMaps);
  assert.ok(moved);
  assert.equal(materializeCalendarBlocks(moved, ["2026-08-26", "2026-08-27"])[0].fill, "rose");
  assert.equal(materializeCalendarBlocks(moved, ["2026-09-03"])[0].fill, "rose");

  source.blockRules[0].fill = "neon";
  assert.equal(normalizePlanner(source, ...plannerMaps), null);
});

test("fill-only occurrence edits continue following the recurring rule", () => {
  const source = plannerFixture();
  const occurrence = materializeCalendarBlocks(source, ["2026-08-26"])[0];
  const fillOnly = plannerAfterOccurrenceUpdate(source, occurrence, occurrence.sourceDate, "10:00", "12:00", "sky", "calendar-block-exception-1770000000000-abc12");
  assert.equal(fillOnly.blockRules[0].fill, "sky");
  assert.deepEqual(fillOnly.blockExceptions, []);

  const moved = structuredClone(source);
  moved.blockExceptions = [{ id: "existing-move", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "13:00", endTime: "15:00" }];
  const movedOccurrence = materializeCalendarBlocks(moved, ["2026-08-27"])[0];
  const restored = plannerAfterOccurrenceUpdate(moved, movedOccurrence, movedOccurrence.sourceDate, "10:00", "12:00", "rose", "unused");
  assert.equal(restored.blockRules[0].fill, "rose");
  assert.deepEqual(restored.blockExceptions, []);
});

test("occurrence edits materialize changed times and preserve independent exceptions", () => {
  const source = plannerFixture([
    { id: "target-queue", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-1" },
    { id: "later-queue", ruleId: "trading-mwf", occurrenceDate: "2026-08-28", kind: "task", itemId: "task-2" },
    { id: "unrelated-queue", ruleId: "family-thursday", occurrenceDate: "2026-08-27", kind: "task", itemId: "task-family" },
  ]);
  source.blockRules.push({ id: "family-thursday", kind: "area", areaId: "family", weekdays: [4], effectiveOn: "2026-08-24", startTime: "15:00", endTime: "17:00", fill: "sage" });
  source.blockExceptions = [{ id: "later-move", ruleId: "trading-mwf", occurrenceDate: "2026-08-28", kind: "override", date: "2026-08-29", startTime: "14:00", endTime: "16:00" }];
  const occurrence = materializeCalendarBlocks(source, ["2026-08-26"])[0];
  const updated = plannerAfterOccurrenceUpdate(source, occurrence, "2026-08-26", "13:00", "15:00", "sky", "changed-time");

  assert.deepEqual(updated.blockExceptions, [
    source.blockExceptions[0],
    { id: "changed-time", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-26", startTime: "13:00", endTime: "15:00" },
  ]);
  assert.deepEqual(updated.blockItems, source.blockItems);
  assert.deepEqual(materializeCalendarBlocks(updated, ["2026-08-26"])[0], {
    id: "trading-mwf:2026-08-26", ruleId: "trading-mwf", sourceDate: "2026-08-26", kind: "area", areaId: "trading", date: "2026-08-26", startTime: "13:00", endTime: "15:00", fill: "sky", exception: true,
  });
});

test("stores named standalone blocks without area work", () => {
  const source = plannerFixture();
  source.blockRules.push({ id: "driving", kind: "standalone", title: "  Driving  ", weekdays: [3], effectiveOn: "2026-08-24", startTime: "08:00", endTime: "09:00", fill: "slate" });
  const normalized = normalizePlanner(source, ...plannerMaps);
  assert.ok(normalized);
  assert.deepEqual(normalized.blockRules[1], { id: "driving", kind: "standalone", title: "Driving", weekdays: [3], effectiveOn: "2026-08-24", startTime: "08:00", endTime: "09:00", fill: "slate" });
  const occurrence = materializeCalendarBlocks(normalized, ["2026-08-26"])[0];
  assert.equal(occurrence.kind, "standalone");
  assert.equal(occurrence.title, "Driving");
  assert.equal(placePlannerBlockItem(normalized, occurrence, "task", "task-1", "blocked").status, "unavailable");
  assert.equal(plannerBlockTarget(normalized, "trading", "2026-08-26", 8 * 60 + 30)?.occurrence.ruleId, "trading-mwf");

  const mixedIdentity = plannerFixture();
  mixedIdentity.blockRules[0] = { ...mixedIdentity.blockRules[0], title: "Driving" };
  assert.equal(normalizePlanner(mixedIdentity, ...plannerMaps), null);
  const blankTitle = plannerFixture();
  blankTitle.blockRules[0] = { id: "blank", kind: "standalone", title: "   ", weekdays: [3], effectiveOn: "2026-08-24", startTime: "08:00", endTime: "09:00", fill: "slate" };
  assert.equal(normalizePlanner(blankTitle, ...plannerMaps), null);

  const crossKindOverlap = plannerFixture();
  crossKindOverlap.blockRules.push({ id: "break", kind: "standalone", title: "Break", weekdays: [3], effectiveOn: "2026-08-24", startTime: "11:45", endTime: "12:30", fill: "slate" });
  assert.equal(normalizePlanner(crossKindOverlap, ...plannerMaps), null);
});

test("rejects task and routine work attached to standalone blocks", () => {
  for (const blockItem of [
    { id: "task", ruleId: "break", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-1" },
    { id: "routine", ruleId: "break", occurrenceDate: "2026-08-26", kind: "routine", itemId: "routine-1" },
  ]) {
    const source = plannerFixture([blockItem]);
    source.blockRules = [{ id: "break", kind: "standalone", title: "Break", weekdays: [3], effectiveOn: "2026-08-24", startTime: "08:00", endTime: "09:00", fill: "slate" }];
    assert.equal(normalizePlanner(source, ...plannerMaps), null);
  }
});

test("materializes a moved standalone override whose source is outside the viewed week", () => {
  const source = {
    blockRules: [{ id: "appointment", kind: "standalone", title: "Appointment", weekdays: [1], effectiveOn: "2026-08-24", startTime: "08:00", endTime: "09:00", fill: "slate" }],
    blockExceptions: [{ id: "move", ruleId: "appointment", occurrenceDate: "2026-08-24", kind: "override", date: "2026-09-03", startTime: "14:15", endTime: "15:45" }],
    blockItems: [],
  };
  const occurrence = materializeCalendarBlocks(source, ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"])
    .find((item) => item.sourceDate === "2026-08-24");
  assert.ok(occurrence);
  assert.deepEqual(
    { kind: occurrence.kind, title: occurrence.title, date: occurrence.date, startTime: occurrence.startTime, endTime: occurrence.endTime },
    { kind: "standalone", title: "Appointment", date: "2026-09-03", startTime: "14:15", endTime: "15:45" },
  );
});

test("rejects standalone override collisions with normal and overridden blocks", () => {
  const normalCollision = plannerFixture();
  normalCollision.blockRules.push({ id: "break", kind: "standalone", title: "Break", weekdays: [2], effectiveOn: "2026-08-24", startTime: "08:00", endTime: "09:00", fill: "slate" });
  normalCollision.blockExceptions = [{ id: "move-break", ruleId: "break", occurrenceDate: "2026-08-25", kind: "override", date: "2026-08-26", startTime: "11:00", endTime: "12:30" }];
  assert.equal(normalizePlanner(normalCollision, ...plannerMaps), null);

  const overrideCollision = plannerFixture();
  overrideCollision.blockRules.push({ id: "break", kind: "standalone", title: "Break", weekdays: [2], effectiveOn: "2026-08-24", startTime: "08:00", endTime: "09:00", fill: "slate" });
  overrideCollision.blockExceptions = [
    { id: "move-area", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "10:00", endTime: "12:00" },
    { id: "move-break", ruleId: "break", occurrenceDate: "2026-08-25", kind: "override", date: "2026-08-27", startTime: "11:45", endTime: "12:30" },
  ];
  assert.equal(normalizePlanner(overrideCollision, ...plannerMaps), null);
});

test("updates and deletes recurring standalone occurrences without losing identity", () => {
  const recurringRule = { id: "driving", kind: "standalone", title: "Driving", weekdays: [3], effectiveOn: "2026-08-24", startTime: "08:00", endTime: "09:00", fill: "slate" };
  const unrelatedRule = { id: "meal", kind: "standalone", title: "Meal", weekdays: [4], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "13:00", fill: "sand" };
  const unrelatedException = { id: "meal-move", ruleId: "meal", occurrenceDate: "2026-08-27", kind: "override", date: "2026-08-27", startTime: "12:30", endTime: "13:30" };
  const source = { blockRules: [recurringRule, unrelatedRule], blockExceptions: [unrelatedException], blockItems: [] };
  const occurrence = materializeCalendarBlocks(source, ["2026-08-26"])[0];
  const updated = plannerAfterOccurrenceUpdate(source, occurrence, "2026-08-27", "14:00", "15:00", "rose", "driving-move");

  assert.deepEqual(updated.blockRules[0], { ...recurringRule, fill: "rose" });
  assert.deepEqual(updated.blockExceptions, [
    unrelatedException,
    { id: "driving-move", ruleId: "driving", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "14:00", endTime: "15:00" },
  ]);

  const movedOccurrence = materializeCalendarBlocks(updated, ["2026-08-27"]).find((item) => item.ruleId === "driving");
  assert.ok(movedOccurrence);
  assert.equal(movedOccurrence.kind, "standalone");
  assert.equal(movedOccurrence.title, "Driving");
  assert.deepEqual(plannerAfterOccurrenceDelete(updated, movedOccurrence, "unused"), {
    blockRules: updated.blockRules,
    blockExceptions: [unrelatedException, { id: "driving-move", ruleId: "driving", occurrenceDate: "2026-08-26", kind: "skip" }],
    blockItems: [],
  });
  assert.deepEqual(plannerAfterRuleDelete(updated, "driving"), {
    blockRules: [unrelatedRule],
    blockExceptions: [unrelatedException],
    blockItems: [],
  });
});

test("updates and deletes a one-time standalone block as one complete record", () => {
  const oneTimeRule = { id: "appointment", kind: "standalone", title: "Appointment", weekdays: [3], effectiveOn: "2026-08-26", endsOn: "2026-08-26", startTime: "09:00", endTime: "10:00", fill: "slate" };
  const unrelatedRule = { id: "meal", kind: "standalone", title: "Meal", weekdays: [4], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "13:00", fill: "sand" };
  const unrelatedException = { id: "meal-skip", ruleId: "meal", occurrenceDate: "2026-08-27", kind: "skip" };
  const source = { blockRules: [oneTimeRule, unrelatedRule], blockExceptions: [unrelatedException], blockItems: [] };
  const occurrence = materializeCalendarBlocks(source, ["2026-08-26"])[0];
  const updated = plannerAfterOccurrenceUpdate(source, occurrence, "2026-08-27", "15:00", "16:30", "lilac", "appointment-move");

  assert.deepEqual(updated.blockRules[0], { ...oneTimeRule, fill: "lilac" });
  const movedOccurrence = materializeCalendarBlocks(updated, ["2026-08-27"]).find((item) => item.ruleId === "appointment");
  assert.ok(movedOccurrence);
  assert.deepEqual({ kind: movedOccurrence.kind, title: movedOccurrence.title }, { kind: "standalone", title: "Appointment" });
  const expectedRemoval = { blockRules: [unrelatedRule], blockExceptions: [unrelatedException], blockItems: [] };
  assert.deepEqual(plannerAfterOccurrenceDelete(updated, movedOccurrence, "unused"), expectedRemoval);
  assert.deepEqual(plannerAfterRuleDelete(updated, "appointment"), expectedRemoval);
});

test("rebases one-time rule details onto a moved occurrence and remaps queued work", () => {
  const previousRule = { id: "trading-once", kind: "area", areaId: "trading", weekdays: [3], effectiveOn: "2026-08-26", endsOn: "2026-08-26", startTime: "09:00", endTime: "10:00", fill: "sage" };
  const unrelatedRule = { id: "family-once", kind: "area", areaId: "family", weekdays: [4], effectiveOn: "2026-08-27", endsOn: "2026-08-27", startTime: "12:00", endTime: "13:00", fill: "sand" };
  const unrelatedException = { id: "family-move", ruleId: "family-once", occurrenceDate: "2026-08-27", kind: "override", date: "2026-08-28", startTime: "12:00", endTime: "13:00" };
  const unrelatedItem = { id: "family-task", ruleId: "family-once", occurrenceDate: "2026-08-27", kind: "task", itemId: "task-family" };
  const source = {
    blockRules: [previousRule, unrelatedRule],
    blockExceptions: [
      { id: "trading-move", ruleId: "trading-once", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-28", startTime: "14:00", endTime: "15:00" },
      unrelatedException,
    ],
    blockItems: [
      { id: "trading-task", ruleId: "trading-once", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-1" },
      unrelatedItem,
    ],
  };
  const editedRule = { ...previousRule, weekdays: [6], effectiveOn: "2026-08-29", endsOn: "2026-08-29", startTime: "15:30", endTime: "17:00", fill: "rose" };
  const rebased = plannerAfterOneTimeRuleEdit(source, previousRule, editedRule);

  assert.deepEqual(rebased.blockRules, [editedRule, unrelatedRule]);
  assert.deepEqual(rebased.blockExceptions, [unrelatedException]);
  assert.deepEqual(rebased.blockItems, [
    { ...source.blockItems[0], occurrenceDate: "2026-08-29" },
    unrelatedItem,
  ]);
  const normalized = normalizePlanner(rebased, ...plannerMaps);
  assert.ok(normalized);
  assert.deepEqual(materializeCalendarBlocks(normalized, ["2026-08-28", "2026-08-29"]).filter((item) => item.ruleId === "trading-once").map(({ date, startTime, endTime }) => ({ date, startTime, endTime })), [
    { date: "2026-08-29", startTime: "15:30", endTime: "17:00" },
  ]);
});

test("fill-only edits preserve an already moved occurrence", () => {
  const source = plannerFixture();
  const existingMove = { id: "existing-move", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "13:00", endTime: "15:00" };
  source.blockExceptions = [existingMove];
  const occurrence = materializeCalendarBlocks(source, ["2026-08-27"])[0];
  const updated = plannerAfterOccurrenceUpdate(source, occurrence, occurrence.date, occurrence.startTime, occurrence.endTime, "rose", "unused");

  assert.equal(updated.blockRules[0].fill, "rose");
  assert.deepEqual(updated.blockExceptions, [existingMove]);
});

test("targets the active area block before the next matching block", () => {
  const source = plannerFixture();
  source.blockRules.push({ id: "family-thursday", kind: "area", areaId: "family", weekdays: [4], effectiveOn: "2026-08-24", startTime: "14:00", endTime: "16:00", fill: "sage" });
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

test("materializes one-time blocks only on their selected date", () => {
  const source = plannerFixture();
  source.blockRules = [{ ...source.blockRules[0], weekdays: [3], effectiveOn: "2026-08-26", endsOn: "2026-08-26" }];
  const normalized = normalizePlanner(source, ...plannerMaps);
  assert.ok(normalized);
  assert.equal(normalized.blockRules[0].endsOn, "2026-08-26");
  assert.deepEqual(materializeCalendarBlocks(normalized, ["2026-08-26", "2026-09-02"]).map((item) => item.date), ["2026-08-26"]);

  const invalidWork = plannerFixture([{ id: "later", ruleId: "trading-mwf", occurrenceDate: "2026-09-02", kind: "task", itemId: "task-1" }]);
  invalidWork.blockRules = source.blockRules;
  assert.equal(normalizePlanner(invalidWork, ...plannerMaps), null);
});

test("allows matching one-time slots on different dates without hiding real conflicts", () => {
  const separateDates = plannerFixture();
  separateDates.blockRules = [
    { id: "first", kind: "area", areaId: "trading", weekdays: [3], effectiveOn: "2026-08-26", endsOn: "2026-08-26", startTime: "10:00", endTime: "12:00", fill: "sage" },
    { id: "second", kind: "area", areaId: "trading", weekdays: [3], effectiveOn: "2026-09-02", endsOn: "2026-09-02", startTime: "10:00", endTime: "12:00", fill: "sage" },
  ];
  assert.ok(normalizePlanner(separateDates, ...plannerMaps));

  const sameDate = structuredClone(separateDates);
  sameDate.blockRules[1] = { ...sameDate.blockRules[1], effectiveOn: "2026-08-26", endsOn: "2026-08-26" };
  assert.equal(normalizePlanner(sameDate, ...plannerMaps), null);
});

test("adds and caps ordered block queue work without duplicates", () => {
  const occurrence = materializeCalendarBlocks(plannerFixture(), ["2026-08-26"])[0];
  const first = placePlannerBlockItem(plannerFixture(), occurrence, "task", "task-1", "one");
  const second = placePlannerBlockItem(first.planner, occurrence, "task", "task-2", "two");
  assert.deepEqual(plannerBlockItems(second.planner, occurrence).map((item) => item.itemId), ["task-1", "task-2"]);
  assert.equal(placePlannerBlockItem(second.planner, occurrence, "task", "task-2", "duplicate").status, "exists");
  const third = placePlannerBlockItem(second.planner, occurrence, "task", "task-3", "three");
  assert.equal(placePlannerBlockItem(third.planner, occurrence, "task", "task-4", "four").status, "full");
});

test("does not queue a date-scoped routine twice on the same actual date", () => {
  const source = plannerFixture();
  source.blockRules.push({ id: "trading-later", kind: "area", areaId: "trading", weekdays: [3], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "14:00", fill: "sage" });
  const occurrences = materializeCalendarBlocks(source, ["2026-08-26"]);
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
  source.blockRules.push({ id: "trading-friday-later", kind: "area", areaId: "trading", weekdays: [5], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "14:00", fill: "sage" });
  source.blockExceptions = [
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
  source.blockRules.push({ id: "trading-thursday", kind: "area", areaId: "trading", weekdays: [4], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "14:00", fill: "sage" });
  source.blockExceptions = [{ id: "move-wed", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "10:00", endTime: "12:00" }];
  source.blockItems = [
    { id: "overridden", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "routine", itemId: "routine-1" },
    { id: "normal", ruleId: "trading-thursday", occurrenceDate: "2026-08-27", kind: "routine", itemId: "routine-1" },
  ];
  assert.equal(normalizePlanner(source, ...plannerMaps), null);
});

test("rejects overlapping independent overrides on one date and accepts adjacency", () => {
  const source = plannerFixture();
  source.blockRules.push({ id: "trading-friday-later", kind: "area", areaId: "trading", weekdays: [5], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "14:00", fill: "sage" });
  const first = { id: "move-wed", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "10:00", endTime: "12:00" };
  const overlapping = { id: "move-fri", ruleId: "trading-friday-later", occurrenceDate: "2026-08-28", kind: "override", date: "2026-08-27", startTime: "11:45", endTime: "13:00" };
  assert.equal(normalizePlanner({ ...source, blockExceptions: [first, overlapping] }, ...plannerMaps), null);

  const adjacent = { ...overlapping, startTime: "12:00", endTime: "14:00" };
  assert.ok(normalizePlanner({ ...source, blockExceptions: [first, adjacent] }, ...plannerMaps));
});

test("parses planner candidate IDs at only the first colon", () => {
  assert.deepEqual(parsePlannerCandidate("task:external:42"), { kind: "task", itemId: "external:42" });
  assert.deepEqual(parsePlannerCandidate("routine:morning:review"), { kind: "routine", itemId: "morning:review" });
  assert.equal(parsePlannerCandidate("invalid:value"), null);
  assert.equal(parsePlannerCandidate("task:"), null);
});

test("rejects overlapping same-area planner rules and overrides while allowing adjacency", () => {
  const recurringOverlap = plannerFixture();
  recurringOverlap.blockRules.push({ id: "trading-overlap", kind: "area", areaId: "trading", weekdays: [3], effectiveOn: "2026-08-24", startTime: "11:45", endTime: "13:00", fill: "sage" });
  assert.equal(normalizePlanner(recurringOverlap, ...plannerMaps), null);

  const crossAreaOverlap = plannerFixture();
  crossAreaOverlap.blockRules.push({ id: "family-overlap", kind: "area", areaId: "family", weekdays: [3], effectiveOn: "2026-08-24", startTime: "11:45", endTime: "13:00", fill: "sage" });
  assert.equal(normalizePlanner(crossAreaOverlap, ...plannerMaps), null);

  const adjacent = plannerFixture();
  adjacent.blockRules.push({ id: "trading-adjacent", kind: "area", areaId: "trading", weekdays: [3], effectiveOn: "2026-08-24", startTime: "12:00", endTime: "13:00", fill: "sage" });
  assert.ok(normalizePlanner(adjacent, ...plannerMaps));

  const overrideOverlap = plannerFixture();
  overrideOverlap.blockRules.push({ id: "family-thursday", kind: "area", areaId: "family", weekdays: [4], effectiveOn: "2026-08-24", startTime: "15:00", endTime: "17:00", fill: "sage" });
  overrideOverlap.blockExceptions = [{ id: "move", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "14:00", endTime: "16:00" }];
  assert.equal(normalizePlanner(overrideOverlap, ...plannerMaps), null);
});

test("allows the same area to have multiple non-overlapping blocks on one day", () => {
  const source = plannerFixture();
  source.blockRules[0] = { ...source.blockRules[0], weekdays: [3], startTime: "07:00", endTime: "10:00" };
  source.blockRules.push({ id: "trading-afternoon", kind: "area", areaId: "trading", weekdays: [3], effectiveOn: "2026-08-24", startTime: "16:00", endTime: "18:00", fill: "sage" });
  const normalized = normalizePlanner(source, ...plannerMaps);
  assert.ok(normalized);
  assert.deepEqual(materializeCalendarBlocks(normalized, ["2026-08-26"]).map(({ areaId, startTime, endTime }) => ({ areaId, startTime, endTime })), [
    { areaId: "trading", startTime: "07:00", endTime: "10:00" },
    { areaId: "trading", startTime: "16:00", endTime: "18:00" },
  ]);
});

test("rejects duplicate, cross-area, skipped, or overfull block work", () => {
  const item = (id, itemId = "task-1") => ({ id, ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId });
  assert.equal(normalizePlanner(plannerFixture([item("one"), item("two")]), ...plannerMaps), null);
  assert.equal(normalizePlanner(plannerFixture([item("one"), item("two", "task-2"), item("three", "task-3"), item("four", "task-4")]), ...plannerMaps), null);
  assert.equal(normalizePlanner(plannerFixture([item("one", "missing")]), ...plannerMaps), null);
  const skipped = plannerFixture([item("one")]);
  skipped.blockExceptions = [{ id: "skip", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "skip" }];
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
  source.blockExceptions = [{ id: "move", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "13:00", endTime: "15:00" }];
  const normalized = normalizePlanner(source, ...plannerMaps);
  assert.ok(normalized);
  const occurrence = materializeCalendarBlocks(normalized, ["2026-08-27"])[0];
  assert.equal(occurrence.sourceDate, "2026-08-26");
  const placed = placePlannerBlockItem(normalized, occurrence, "task", "task-1", "placed");
  assert.equal(placed.status, "added");
  assert.equal(placed.planner.blockItems[0].occurrenceDate, "2026-08-26");
  assert.deepEqual(plannerBlockItems(placed.planner, occurrence).map((item) => item.id), ["placed"]);
});

test("deletes only the requested occurrence or the complete requested rule", () => {
  const recurring = plannerFixture([
    { id: "target", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "task", itemId: "task-1" },
    { id: "later", ruleId: "trading-mwf", occurrenceDate: "2026-08-28", kind: "task", itemId: "task-2" },
  ]);
  recurring.blockExceptions = [
    { id: "target-move", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "10:00", endTime: "12:00" },
    { id: "later-move", ruleId: "trading-mwf", occurrenceDate: "2026-08-28", kind: "override", date: "2026-08-29", startTime: "10:00", endTime: "12:00" },
  ];
  const unrelatedRule = { id: "family-thursday", kind: "area", areaId: "family", weekdays: [4], effectiveOn: "2026-08-24", startTime: "15:00", endTime: "17:00", fill: "sage" };
  const unrelatedException = { id: "family-move", ruleId: "family-thursday", occurrenceDate: "2026-08-27", kind: "override", date: "2026-08-28", startTime: "15:00", endTime: "17:00" };
  const unrelatedItem = { id: "family-item", ruleId: "family-thursday", occurrenceDate: "2026-08-27", kind: "task", itemId: "task-family" };
  recurring.blockRules.push(unrelatedRule);
  recurring.blockExceptions.push(unrelatedException);
  recurring.blockItems.push(unrelatedItem);
  const occurrence = materializeCalendarBlocks(recurring, ["2026-08-27"])[0];
  const oneOccurrenceDeleted = plannerAfterOccurrenceDelete(recurring, occurrence, "new-skip");
  assert.deepEqual(oneOccurrenceDeleted.blockRules, recurring.blockRules);
  assert.deepEqual(oneOccurrenceDeleted.blockExceptions, [
    recurring.blockExceptions[1],
    unrelatedException,
    { id: "target-move", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "skip" },
  ]);
  assert.deepEqual(oneOccurrenceDeleted.blockItems, [recurring.blockItems[1], unrelatedItem]);

  const normalOccurrence = materializeCalendarBlocks(recurring, ["2026-09-02"])[0];
  const generatedSkipId = "calendar-block-exception-1770000000000-abc12";
  const normalOccurrenceDeleted = plannerAfterOccurrenceDelete(recurring, normalOccurrence, generatedSkipId);
  assert.deepEqual(normalOccurrenceDeleted.blockRules, recurring.blockRules);
  assert.deepEqual(normalOccurrenceDeleted.blockExceptions, [
    ...recurring.blockExceptions,
    { id: generatedSkipId, ruleId: "trading-mwf", occurrenceDate: "2026-09-02", kind: "skip" },
  ]);
  assert.deepEqual(normalOccurrenceDeleted.blockItems, recurring.blockItems);

  const oneTime = structuredClone(recurring);
  oneTime.blockRules[0] = { ...oneTime.blockRules[0], weekdays: [3], effectiveOn: "2026-08-26", endsOn: "2026-08-26" };
  oneTime.blockExceptions = [{ id: "move", ruleId: "trading-mwf", occurrenceDate: "2026-08-26", kind: "override", date: "2026-08-27", startTime: "10:00", endTime: "12:00" }, unrelatedException];
  oneTime.blockItems = [oneTime.blockItems[0], unrelatedItem];
  const oneTimeOccurrence = materializeCalendarBlocks(oneTime, ["2026-08-27"])[0];
  assert.deepEqual(plannerAfterOccurrenceDelete(oneTime, oneTimeOccurrence, "unused"), { blockRules: [unrelatedRule], blockExceptions: [unrelatedException], blockItems: [unrelatedItem] });
  assert.deepEqual(plannerAfterRuleDelete(recurring, "trading-mwf"), { blockRules: [unrelatedRule], blockExceptions: [unrelatedException], blockItems: [unrelatedItem] });
});

test("only finalized routine sessions complete planner work", () => {
  assert.equal(isFinalRoutineSessionStatus("pending"), false);
  for (const status of ["completed", "skipped", "missed"]) assert.equal(isFinalRoutineSessionStatus(status), true);
});

test("presence lazily renders openings and retains committed exit content", () => {
  assert.match(presence, /children: \(\) => ReactElement<PresenceChildProps>/);
  assert.match(presence, /const visibleChild = show \? children\(\) : null/);
  assert.match(presence, /if \(show && visibleChild\) retainedChild\.current = visibleChild/);
  assert.match(presence, /return \(\) => window\.clearTimeout\(timeout\)/);
  assert.match(presence, /retainedChild\.current = null/);
  assert.match(presence, /"data-motion-state": show \? "open" : "closed"/);
  assert.match(presence, /"aria-hidden": show \? child\.props\["aria-hidden"\] : true/);
  assert.match(presence, /inert: show \? child\.props\.inert : true/);
  assert.doesNotMatch(presence, /requestAnimationFrame|setVisibleChild|setMounted/);
  for (const source of [page, plannerView]) assert.doesNotMatch(source, /<Presence\b[^>]*>\s*<(?!\{)/);
});

test("task note close restores focus outside an exiting planning panel", () => {
  assert.match(page, /editButtonRef\?: Ref<HTMLButtonElement>/);
  assert.match(page, /const taskEditButton = useRef<HTMLButtonElement>\(null\)/);
  assert.match(page, /editButtonRef=\{taskEditButton\}/);
  assert.match(page, /function closeNotes\(\) \{\s*commitNotes\(\);\s*const returnTarget = taskEditing \? noteButton\.current : taskEditButton\.current;\s*returnTarget\?\.focus\(\);\s*setNotesOpen\(false\);/);
  assert.doesNotMatch(page, /returnFocus/);
});

test("reduced motion disables the planner workbench transition", () => {
  assert.match(plannerStyles, /@media\(prefers-reduced-motion:reduce\)\{[^}]*\.planner-page\.workbench-closed \.planner-workbench[^}]*\{transition:none\}/);
  assert.match(motionStyles, /\.planner-calendar-block:not\(\.moving\):not\(\.resizing\):hover/);
  assert.doesNotMatch(motionStyles, /\.planner-area-block/);
});

test("workbench exits cancel opening focus and keep hidden content inert", () => {
  assert.match(plannerView, /let frame: number \| undefined/);
  assert.match(plannerView, /frame = requestAnimationFrame\(\(\) => \{/);
  assert.match(plannerView, /workbenchVisible && workbench && !workbench\.hasAttribute\("inert"\)/);
  assert.match(plannerView, /if \(frame !== undefined\) cancelAnimationFrame\(frame\)/);
  assert.match(plannerView, /aria-hidden=\{!workbenchVisible\} inert=\{!workbenchVisible\}/);
});

test("unbounded task lists avoid block-size collapse motion", () => {
  assert.match(page, /<Presence show=\{isExpanded\} className="motion-panel">\{\(\) => <div className="project-task-preview"/);
  assert.match(page, /<Presence show=\{showCompleted\} className="motion-panel">\{\(\) => <div className="completed-archive-tasks"/);
  assert.doesNotMatch(page, /<Presence show=\{isExpanded\} className="motion-collapse">\{\(\) => <div className="project-task-preview"/);
  assert.doesNotMatch(page, /<Presence show=\{showCompleted\} className="motion-collapse">\{\(\) => <div className="completed-archive-tasks"/);
});

test("navigation wires native view transitions through the guarded coordinator", () => {
  assert.match(page, /import \{ createNavigationTransition \} from "\.\/navigation-transition\.mjs"/);
  assert.match(page, /const navigationTransition = useRef\(createNavigationTransition\(\)\)\.current/);
  assert.match(page, /unchanged: selectionKey\(selection\) === selectionKey\(next\)/);
  assert.match(page, /reducedMotion: window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(page, /const transition = document\.startViewTransition\(\(\) => flushSync\(update\)\)/);
  assert.match(page, /transition\.ready\.catch\(\(error: unknown\) => \{[\s\S]*?error instanceof DOMException && error\.name === "AbortError"/);
  assert.match(page, /typeof document\.startViewTransition === "function"[\s\S]*?\? startNavigationViewTransition/);
  assert.doesNotMatch(page, /ViewTransitionDocument|transitionDocument/);
});

test("routine form versions reset only when editor or creator forms close", () => {
  assert.match(page, /const \[editorFormVersion, setEditorFormVersion\] = useState\(0\)/);
  assert.match(page, /function closeEditor\(\) \{\s*setEditing\(false\);\s*setEditorFormVersion\(\(version\) => version \+ 1\);/);
  assert.match(page, /onClick=\{\(\) => editing \? closeEditor\(\) : setEditing\(true\)\}/);
  assert.match(page, /<RoutineForm key=\{editorFormVersion\} routine=\{routine\} onCancel=\{closeEditor\} onSave=\{\(draft\) => \{ management\.updateRoutine\(routine\.id, draft\); closeEditor\(\); \}\}/);
  assert.match(page, /const \[creatorFormVersion, setCreatorFormVersion\] = useState\(0\)/);
  assert.match(page, /function closeCreator\(\) \{\s*setCreating\(false\);\s*setCreatorFormVersion\(\(version\) => version \+ 1\);/);
  assert.match(page, /<RoutineForm key=\{creatorFormVersion\} onCancel=\{closeCreator\} onSave=\{\(draft\) => \{ addRoutine\(area\.id, draft\); closeCreator\(\); \}\}/);
  assert.match(page, /aria-expanded=\{reviewOpen\} onClick=\{\(\) => setReviewOpen\(\(open\) => !open\)\}/);
  assert.match(page, /aria-expanded=\{vacationOpen\} onClick=\{\(\) => setVacationOpen\(\(open\) => !open\)\}/);
  assert.doesNotMatch(page, /setReviewOpen\(false\)|setVacationOpen\(false\).*setEditing\(false\)/);
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

test("an unreadable local workspace blocks starter upload when the server is empty", () => {
  const recoveryGuard = page.indexOf('if (!payload.workspace && unreadableLocalWorkspace)');
  const starterSelection = page.indexOf("const loadedWorkspace =", recoveryGuard);
  assert.ok(recoveryGuard >= 0 && starterSelection > recoveryGuard);
  assert.match(page, /const savedWorkspaces = \[[\s\S]*?localStorage\.getItem\(WORKSPACE_STORAGE_KEY\),[\s\S]*?localStorage\.getItem\("bearing-workspace-v2"\),[\s\S]*?\]\.filter\(\(saved\): saved is string => saved !== null\)/);
  assert.match(page, /for \(const saved of savedWorkspaces\) \{[\s\S]*?const parsed = normalizeClientWorkspace\(JSON\.parse\(saved\) as unknown\);[\s\S]*?if \(!parsed\) continue;[\s\S]*?localWorkspace = parsed;[\s\S]*?break;/);
  assert.match(page, /unreadableLocalWorkspace = savedWorkspaces\.length > 0 && !localWorkspace/);
  assert.doesNotMatch(page, /localStorage\.getItem\(WORKSPACE_STORAGE_KEY\) \?\?/);
  assert.match(page, /if \(!payload\.workspace && unreadableLocalWorkspace\) throw new Error\("The local workspace needs recovery\."\)/);
});

test("client and server require the same continuous-execution workspace shape", () => {
  assert.match(page, /blockItems: \[\]/);
  assert.match(route, /blockItems: Array/);
  assert.match(page, /workspace\.planner\.blockRules\.filter\(\(rule\) => rule\.kind === "area"\)\.length/);
  assert.doesNotMatch(page, /focusTaskIds|currentAreaId/);
  assert.doesNotMatch(route, /focusTaskIds|currentAreaId/);
});

test("calendar owns This block and derives Now from its first unfinished item", () => {
  assert.match(plannerView, /This block already has three items/);
  assert.match(plannerView, /const nowItemId = occurrenceActive \? blockItems\.find/);
  assert.match(plannerView, /Add to queue/);
  assert.doesNotMatch(plannerView, /nowLabel|addLabel|onSchedule|onNow/);
  assert.match(plannerView, /placePlannerBlockItem/);
  assert.match(plannerView, /standaloneOccurrenceAt\(over\.date, over\.minutes\) \? "No-area blocks cannot hold tasks or routines" : "Drop a task inside a time block for its area"/);
  assert.match(plannerView, /standaloneOccurrenceAt\(over\.date, over\.minutes\) \? "No-area blocks cannot hold tasks or routines" : "Drop a routine inside a time block for its area"/);
  assert.match(plannerView, /onTaskChange\(itemId, \{ someday: undefined, waiting: undefined \}\)/);
  assert.match(plannerView, /Waiting/);
  assert.match(plannerView, /Resume/);
  assert.match(plannerView, /TouchSensor/);
  assert.match(plannerView, /KeyboardSensor/);
  assert.match(plannerView, /Add to block/);
  assert.match(plannerView, /active \? "active" : ""/);
  assert.match(plannerView, /function visiblePlannerBlockItemCount/);
  assert.match(plannerView, /const compact = height < 90/);
  assert.match(plannerView, /className="planner-block-overflow" aria-label=\{`\$\{overflow\} more queued`\}/);
  assert.match(plannerView, />One time<\/button>/);
  assert.match(plannerView, />Repeats weekly<\/button>/);
  assert.match(plannerView, /frequency === "once" \? \{ endsOn: date \} : \{\}/);
  assert.match(plannerView, /function ScheduleOverview/);
  assert.match(plannerView, /function BlockFillPicker/);
  assert.match(plannerView, /All blocks in schedule/);
  assert.match(plannerView, /className="planner-editor-title-row"><h2>\{area\.name\} time block<\/h2><BlockFillPicker value=\{fill\} onChange=\{setFill\} repeating=\{recurring\} \/>/);
  assert.match(plannerView, /className="planner-editor-title-row"><h2>\{rule \? existingOneTimeBlock/);
  assert.doesNotMatch(plannerView, /className="planner-fill-picker"|<strong>Block fill<\/strong>/);
  assert.match(plannerView, /className=\{`planner-fill-menu fill-\$\{value\}`\}/);
  assert.match(plannerView, /<summary aria-label=\{`Choose block fill\. \$\{CALENDAR_BLOCK_FILL_LABELS\[value\]\} selected\. \$\{scope\}`\}/);
  assert.match(plannerView, /className=\{`planner-fill-option fill-\$\{option\.value\}`\}/);
  assert.match(plannerView, /pickerRef\.current\?\.removeAttribute\("open"\)/);
  assert.doesNotMatch(plannerView, /<select value=\{value\} aria-label=\{`Block fill/);
  assert.match(plannerView, /planner-calendar-block fill-\$\{occurrence\.fill\}/);
  assert.match(plannerView, /plannerAfterOccurrenceUpdate\(planner, occurrence, date, startTime, endTime, fill/);
  assert.match(plannerView, /const scheduleEditorRule = editingRule && editingOneTimeOverride \? \{[\s\S]*?effectiveOn: editingOneTimeOverride\.date,[\s\S]*?startTime: editingOneTimeOverride\.startTime,[\s\S]*?endTime: editingOneTimeOverride\.endTime/);
  assert.match(plannerView, /plannerAfterOneTimeRuleEdit\(planner, editingRule, rule\)/);
  assert.match(plannerView, /planner-schedule-row-icon fill-\$\{rule\.fill\}/);
  assert.match(plannerView, /const exceptionsByOccurrence = useMemo\(\(\) => new Map\(exceptions\.map/);
  assert.match(plannerView, /const orderedRules = useMemo\(\(\) => \[\.\.\.rules\]\.sort/);
  assert.match(plannerView, /const scheduleRules = useMemo\(\(\) => scheduleArea \? planner\.blockRules\.filter/);
  assert.match(plannerView, /const WORKBENCH_DATE_FORMATTER = new Intl\.DateTimeFormat/);
  assert.match(plannerView, /return WORKBENCH_DATE_FORMATTER\.format/);
  assert.doesNotMatch(plannerView, /exceptions\.find\(\(item\) => item\.ruleId === rule\.id/);
  assert.match(plannerView, /const skipped = exception\?\.kind === "skip"/);
  assert.match(plannerView, /Skipped · edit to restore/);
  assert.match(plannerView, /oneTime && !skipped \? onEditOccurrence\(plannerOccurrenceId\(rule\.id, rule\.effectiveOn\), date\) : onEditSeries\(rule\.id\)/);
  assert.match(plannerView, /restoringSkippedOneTime/);
  assert.match(plannerView, /item\.kind === "skip" && item\.occurrenceDate === editingRule\?\.effectiveOn/);
  assert.match(plannerView, /kind: "schedule"; areaId: string/);
  assert.match(plannerView, /aria-label="Open area workspace"/);
  assert.match(plannerView, /aria-label="Open project workspace"/);
  assert.match(plannerView, /aria-label=\{areaCreatorOpen \? "Close new area form" : "New area"\}/);
  assert.match(plannerView, /<WorkspaceIcon \/><\/button>/);
  assert.doesNotMatch(plannerView, /SettingsIcon|Area settings|Project settings|areaCreatorOpen \? "Cancel" : "New"/);
  assert.match(plannerView, /<CalendarIcon \/>View schedule/);
  assert.match(plannerView, /<PlusIcon \/>New block/);
  assert.match(plannerView, /Delete this block only/);
  assert.match(plannerView, /Delete repeating schedule/);
  assert.match(plannerView, /Confirm delete repeating schedule/);
  assert.match(plannerView, /Confirm this block only/);
  assert.match(plannerView, /function deleteOccurrence/);
  assert.match(plannerView, /plannerAfterOccurrenceDelete/);
  assert.match(plannerView, /focusAfterDelete/);
  assert.match(plannerView, /\.planner-schedule-empty \.planner-schedule-new/);
  assert.match(plannerView, /className="planner-schedule-new planner-button-with-icon" onClick=\{onAdd\}><PlusIcon \/>New block<\/button><\/div>/);
  assert.doesNotMatch(plannerView, />Manage(?:\s|<)/);
  assert.doesNotMatch(plannerView, /Edit block settings|Skip this block|<EditIcon \/>Edit block|View \{selectedArea\.name\} schedule/);
  assert.doesNotMatch(plannerView, /area management view/);
  assert.doesNotMatch(plannerView, /into an \$\{area\?\.name \?\? "area"\} block|area block queue/);
  assert.match(plannerView, /previousEditorOpen/);
  assert.match(plannerView, /const FOCUSABLE_SELECTOR = 'button:not\(:disabled\), summary, select:not\(:disabled\), input:not\(:disabled\):not\(\[type="hidden"\]\), \[tabindex\]:not\(\[tabindex="-1"\]\):not\(:disabled\)'/);
  assert.match(plannerView, /function focusableElements\(container: ParentNode \| null\)/);
  assert.match(plannerView, /ancestor\.tagName === "DETAILS" && !ancestor\.hasAttribute\("open"\) && !\(element\.tagName === "SUMMARY" && element\.parentElement === ancestor\)/);
  assert.match(plannerView, /target = focusableElements\(workbench\?\.querySelector<HTMLElement>\('\.planner-editor'\) \?\? null\)\[0\]/);
  assert.match(plannerView, /const focusable = focusableElements\(workbench\)/);
  assert.match(plannerView, /const areaSelect = workbench\?\.querySelector<HTMLElement>\('#planner-area-select'\)/);
  assert.match(plannerView, /target = areaSelect && focusable\.includes\(areaSelect\) \? areaSelect : focusable\[0\]/);
  assert.doesNotMatch(plannerView, /#planner-area-select, button:not\(:disabled\)/);
  assert.match(plannerView, /planner-context-card/);
  assert.match(plannerView, /\[\['work', 'Tasks', projectTasks\.length\], \['backlog', 'Backlog', backlogTasks\.length\], \['waiting', 'Waiting', waitingTasks\.length\], \['routines', 'Routines', selectedAreaRoutines\.length\]\]/);
  for (const label of ["Tasks", "Backlog", "Waiting", "Routines"]) assert.match(plannerView, new RegExp(`\\['[^']+', '${label}',`));
  assert.match(plannerView, /function QueueIcon/);
  assert.match(plannerView, /aria-label=\{`\$\{label\}: \$\{count\} \$\{count === 1 \? "item" : "items"\}`\}/);
  assert.match(plannerView, /className="planner-queue-label" aria-hidden="true">\{label\}<\/span>/);
  assert.match(plannerView, /Time blocks can touch, but they cannot overlap/);
  assert.match(plannerView, /occurrence\.kind === "area" \? \{ selectedAreaId: occurrence\.areaId, selectedProjectId: "" \} : \{\}/);
  assert.match(plannerView, /function StandaloneOccurrenceEditor/);
  assert.match(plannerView, /<legend>Connect to<\/legend>/);
  assert.match(plannerView, />No area<\/button>/);
  for (const suggestion of ["Driving", "Break", "Meal", "Appointment", "Buffer"]) assert.match(plannerView, new RegExp(`"${suggestion}"`));
  assert.match(plannerView, /Protected time only—no tasks or routines\./);
  assert.doesNotMatch(plannerView, /planner-create-first-block/);
  assert.doesNotMatch(plannerView, /setEditor\(\{ kind: "series", areaId: selectedArea\.id \}\)/);
  assert.match(plannerView, /That routine is already scheduled in another block on this date/);
  assert.match(plannerView, /That item is already in this block/);
  assert.match(plannerView, /function DeadlineEditor/);
  assert.match(plannerView, /onClick=\{\(\) => openDeadlineTask\(task, date\)\}/);
  assert.doesNotMatch(plannerView, /onClick=\{\(\) => openTargetForArea\(task\.areaId\)\}/);
  assert.match(plannerView, /planner-schedule-overview/);
  assert.doesNotMatch(plannerView, /planner-context-area-icon|renderAreaIcon/);
  assert.match(plannerStyles, /\.planner-calendar-block\.active\{/);
  assert.match(plannerStyles, /\.planner-editor-title-row\{[^}]*align-items:center/);
  assert.doesNotMatch(plannerStyles, /\.planner-fill-picker\{/);
  assert.match(plannerStyles, /\.fill-rose\{/);
  assert.match(plannerStyles, /\.fill-lilac\{/);
  assert.match(plannerStyles, /\.planner-fill-menu>summary:focus-visible\{/);
  assert.match(plannerStyles, /\.planner-fill-palette\{/);
  assert.match(plannerStyles, /\.planner-fill-option\[aria-pressed="true"\]\{/);
  assert.doesNotMatch(plannerStyles, /planner-fill-control/);
  assert.doesNotMatch(plannerStyles, /planner-fill-choice/);
  assert.match(plannerStyles, /\.planner-calendar-block\.compact \.planner-block-copy\{display:flex;/);
  assert.match(plannerStyles, /\.planner-block-overflow\{/);
  assert.match(plannerStyles, /\.planner-frequency button\[aria-pressed="true"\]/);
  assert.match(plannerStyles, /\.planner-context-card\{display:grid;/);
  assert.match(plannerStyles, /\.planner-queue-tabs\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(plannerStyles, /\.planner-queue-icon svg\{width:19px;height:19px/);
  assert.match(plannerStyles, /\.planner-schedule-row\{/);
  assert.doesNotMatch(plannerStyles, /planner-schedule-overview-link/);
  assert.match(plannerStyles, /\.planner-context-label \.planner-label-action\{min-width:44px;min-height:44px/);
  assert.match(plannerStyles, /\.planner-queue-content\{display:grid;align-content:start;min-height:170px\}/);
  assert.match(plannerView, /planner-toolbar-actions"><button type="button" className="planner-global-new planner-button-with-icon"/);
  assert.match(plannerView, /<PlusIcon \/><span>New block<\/span>/);
  assert.doesNotMatch(plannerView, /Return to today/);
  assert.match(plannerView, /className="planner-calendar-top"/);
  assert.match(plannerStyles, /grid-template-rows:minmax\(82px,auto\) minmax\(0,1fr\)/);
  assert.match(plannerStyles, /\.planner-calendar-top\{[^}]*overflow-y:scroll;[^}]*scrollbar-gutter:stable/);
  assert.match(plannerStyles, /\.planner-calendar-body\{[^}]*scrollbar-gutter:stable/);
  assert.match(plannerStyles, /\.planner-day-head\{display:flex;/);
  assert.match(plannerStyles, /prefers-reduced-motion:reduce/);
  assert.match(route, /effectiveOn: string; endsOn\?: string;/);
  assert.match(route, /fill: "sage" \| "sky" \| "sand" \| "rose" \| "lilac" \| "slate"/);
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

test("server-renders a lightweight sync gate", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Mission Control/);
  assert.match(html, /Loading your workspace/);
  assert.match(html, /Connecting to your saved Mission Control data/);
  assert.ok(Buffer.byteLength(html) < 20_000, "the loading response should not contain the hidden workspace UI");
  assert.doesNotMatch(html, /Workbench queues|All projects|as="font"|\/Users\//);
});
