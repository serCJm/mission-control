import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";
import { plannerOccurrenceId, plannerWeekday, shiftPlannerDate } from "../app/planner-schema.mjs";

const output = new URL(`../output/area-workbench-test-${process.pid}/`, import.meta.url);
let renderWorkbench;
const today = "2026-10-01";
beforeEach((t) => t.mock.timers.enable({ apis: ["Date"], now: new Date(`${today}T08:00:00-07:00`) }));
const rule = { id: "block", kind: "area", areaId: "trading", effectiveOn: today, endsOn: today, weekdays: [plannerWeekday(today)], startTime: "09:00", endTime: "10:00", fill: "sage" };

before(async () => {
  await mkdir(output, { recursive: true });
  await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import { Planner } from "./app/planner";
      import { BlockProjectWork } from "./app/block-project-work";
      const noop = () => {};
      const projects = [{ id: "execution", areaId: "trading", name: "Trading practice", outcome: "" }];
      const tasks = [{ id: "review", areaId: "trading", projectId: "execution", title: "Review trade journal", status: "todo" }, { id: "prepare", areaId: "trading", projectId: "execution", title: "Prepare execution notes", status: "todo" }];
      export function renderWorkbench(planner, session) {
        return renderToStaticMarkup(<Planner areas={[{ id: "trading", name: "Trading", icon: "trend" }]} projects={projects} tasks={tasks} routines={[]} planner={planner} session={session}
          onChange={noop} onTaskChange={noop} onRoutineSessionStatus={noop} onDeleteRoutine={noop} makeId={() => "new"} onNotice={noop} onEditorOpenChange={noop} onSessionChange={noop} onCreateArea={noop} onOpenArea={noop}
          renderWork={(areaId, selectedTaskIds, full, onQueue, onRelease, routines) => <BlockProjectWork projects={projects} tasks={tasks} selectedTaskIds={selectedTaskIds} full={full} onQueue={onQueue} routines={routines} onTaskChange={noop} onDeleteTask={noop} onCreateTask={noop} onCreateProject={() => "new"} onOpenTask={noop} renderProject={() => null} />} />);
      }
    ` },
    outfile: new URL("render.mjs", output).pathname,
    bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic",
  });
  ({ renderWorkbench } = await import(new URL("render.mjs", output)));
});
after(async () => { await rm(output, { recursive: true, force: true }); });

function render(blockRules = [], openOccurrenceId, blockExceptions = [], blockItems = [], sessionPatch = {}) {
  const html = renderWorkbench({ blockRules, blockExceptions, blockItems }, { anchorDate: today, selectedDate: today, selectedAreaId: "trading", selectedProjectId: "", queue: "work", workbenchOpen: true, openOccurrenceId, ...sessionPatch });
  return html.slice(html.indexOf('<aside id="planner-workbench"'), html.indexOf("</aside>"));
}

test("area work is available with no schedule or selected block", () => {
  for (const rules of [[], [rule]]) {
    const html = render(rules);
    assert.match(html, />Area management</);
    assert.match(html, /Projects &amp; tasks/);
    assert.match(html, /Review trade journal/);
    assert.match(html, /New task in this area/);
    assert.doesNotMatch(html, /Choose Review trade journal for this block|Choose up to 3 actions/);
    assert.doesNotMatch(html, /Schedule your areas/);
  }
});

test("a selected block adds focus controls within the area workbench", () => {
  const html = render([rule], plannerOccurrenceId(rule.id, today));
  assert.match(html, />Area management</);
  assert.match(html, /id="planner-area-select"/);
  assert.match(html, /Choose up to 3 actions/);
  assert.match(html, /Choose Review trade journal for this block/);
  assert.match(html, /aria-label="Schedule" title="Schedule" aria-expanded="false" aria-controls="planner-area-schedule"/);
  assert.match(html, /id="planner-area-schedule"[^>]*hidden=""[^>]*inert=""/);
  assert.match(html, />Back to area</);
  assert.equal((html.match(/Projects &amp; tasks/g) ?? []).length, 1);
});

test("queued tasks remain visible without a duplicate choose action", () => {
  const html = render([rule], plannerOccurrenceId(rule.id, today), [], [{ id: "item", ruleId: rule.id, occurrenceDate: today, kind: "task", itemId: "review" }]);
  assert.match(html, /In this block/);
  assert.doesNotMatch(html, /Choose Review trade journal for this block/);
});

test("past schedule history uses moved one-time dates", () => {
  const past = shiftPlannerDate(today, -7);
  const future = shiftPlannerDate(today, 7);
  const movedFromPast = { ...rule, effectiveOn: past, endsOn: past, weekdays: [plannerWeekday(past)] };
  const override = { id: "moved", ruleId: rule.id, occurrenceDate: past, kind: "override", date: future, startTime: "09:00", endTime: "10:00" };
  assert.match(render([movedFromPast]), /Show past blocks \(1\)/);
  assert.doesNotMatch(render([movedFromPast], undefined, [override]), /Show past blocks/);
  const movedToPast = { ...rule, effectiveOn: future, endsOn: future, weekdays: [plannerWeekday(future)] };
  assert.match(render([movedToPast], undefined, [{ ...override, occurrenceDate: future, date: past }]), /Show past blocks \(1\)/);
});

const queuedTask = { id: "item", ruleId: rule.id, occurrenceDate: today, kind: "task", itemId: "review" };

function duringBlock(t, time = "09:30") {
  t.mock.timers.setTime(new Date(`${today}T${time}:00-07:00`).valueOf());
}

test("future blocks stay inside Schedule and unscheduled areas stay quiet", () => {
  const html = render([rule]);
  const scheduleStart = html.indexOf('id="planner-area-schedule"');
  const scheduleEnd = html.indexOf('</section></div>', scheduleStart);
  const shortcut = html.indexOf('Next time block');
  assert.ok(shortcut > scheduleStart && shortcut < scheduleEnd);
  assert.doesNotMatch(html, /Happening now|Choose up to 3 actions/);
  assert.doesNotMatch(render(), /No time blocks scheduled|Happening now/);
});

test("an empty current block offers Choose work without opening a queue", (t) => {
  duringBlock(t);
  const html = render([rule]);
  assert.match(html, /Happening now/);
  assert.match(html, />Choose work</);
  assert.doesNotMatch(html, /Choose up to 3 actions|Choose Prepare execution notes for this block/);
});

test("current queued actions appear automatically with Now and add controls", (t) => {
  duringBlock(t);
  const html = render([rule], undefined, [], [queuedTask]);
  assert.match(html, /Choose up to 3 actions/);
  assert.match(html, />Now</);
  assert.ok(html.includes("1/3 selected"));
  assert.match(html, /Choose Prepare execution notes for this block/);
  assert.doesNotMatch(html, /planner-current-block/);
});

test("Back to area suppresses automatic context but explicit reopening wins", (t) => {
  duringBlock(t);
  const dismissed = { dismissedOccurrenceId: plannerOccurrenceId(rule.id, today) };
  const html = render([rule], undefined, [], [queuedTask], dismissed);
  assert.doesNotMatch(html, /Choose up to 3 actions|Choose Prepare execution notes for this block/);
  assert.match(html, /Happening now/);
  assert.match(html, />Open block</);
  assert.match(render([rule], dismissed.dismissedOccurrenceId, [], [queuedTask], dismissed), /Choose up to 3 actions/);
});

test("explicit future planning wins over an automatic current queue", (t) => {
  duringBlock(t);
  const futureDate = shiftPlannerDate(today, 1);
  const future = { ...rule, id: "future", effectiveOn: futureDate, endsOn: futureDate, weekdays: [plannerWeekday(futureDate)] };
  const html = render([rule, future], plannerOccurrenceId(future.id, futureDate), [], [queuedTask], { selectedDate: futureDate });
  assert.ok(html.includes("0/3 selected"));
  assert.match(html, /Choose Review trade journal for this block/);
  assert.doesNotMatch(html, />Now<|Happening now/);
});

test("automatic context follows the selected day and expires at the end boundary", (t) => {
  duringBlock(t, "09:00");
  assert.match(render([rule], undefined, [], [queuedTask]), /Choose up to 3 actions/);
  const tomorrow = shiftPlannerDate(today, 1);
  assert.doesNotMatch(render([rule], undefined, [], [queuedTask], { selectedDate: tomorrow }), /Choose up to 3 actions|Happening now/);
  const nextWeek = shiftPlannerDate(today, 7);
  assert.doesNotMatch(render([rule], undefined, [], [queuedTask], { anchorDate: nextWeek, selectedDate: nextWeek }), /Choose up to 3 actions|Happening now/);
  duringBlock(t, "10:00");
  assert.doesNotMatch(render([rule], undefined, [], [queuedTask]), /Choose up to 3 actions|Happening now/);
});

test("a new current block is not suppressed by dismissal of the previous block", (t) => {
  duringBlock(t);
  const html = render([rule], undefined, [], [queuedTask], { dismissedOccurrenceId: "older-block:2026-09-30" });
  assert.match(html, /Choose up to 3 actions/);
  assert.doesNotMatch(render([], undefined, [], [queuedTask]), /Choose up to 3 actions|Happening now/);
  const skipped = [{ id: "skip", ruleId: rule.id, occurrenceDate: today, kind: "skip" }];
  assert.doesNotMatch(render([rule], undefined, skipped, [queuedTask]), /Choose up to 3 actions|Happening now/);
});
