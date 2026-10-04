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
          renderWork={(areaId, selectedTaskIds, full, onQueue, onRelease, routines) => <BlockProjectWork areaName="Trading" projects={projects} tasks={tasks} selectedTaskIds={selectedTaskIds} full={full} onQueue={onQueue} routines={routines} onTaskChange={noop} onDeleteTask={noop} onCreateTask={noop} onCreateProject={() => "new"} onOpenTask={noop} renderProject={() => null} />} />);
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

test("area work is available with no schedule", () => {
  const html = render();
  assert.match(html, />Area management</);
  assert.match(html, /<section[^>]*aria-label="Projects and tasks in this area"/);
  assert.match(html, /<label[^>]*>Project<\/label>/);
  assert.match(html, /<button[^>]*aria-label="New project"/);
  assert.match(html, /Review trade journal/);
  assert.match(html, /New task in Trading backlog/);
  assert.doesNotMatch(html, /Choose Review trade journal for this block|Choose up to 3 actions/);
  assert.doesNotMatch(html, /Schedule your areas/);
});

test("a selected block adds focus controls within the area workbench", () => {
  const html = render([rule], plannerOccurrenceId(rule.id, today));
  assert.match(html, />Area management</);
  assert.match(html, /id="planner-area-select"/);
  assert.match(html, /Choose up to 3 actions/);
  assert.match(html, /Choose Review trade journal for this block/);
  assert.match(html, /aria-label="Schedule" title="Schedule" aria-expanded="false" aria-controls="planner-area-schedule"/);
  assert.match(html, /id="planner-area-schedule"[^>]*hidden=""[^>]*inert=""/);
  assert.doesNotMatch(html, /aria-label="Back to area"|aria-label="Return to (?:current|next) block"/);
  assert.match(html, /<button[^>]*aria-label="Block settings"[^>]*title="Block settings"/);
  assert.equal((html.match(/<section[^>]*aria-label="Projects and tasks in this area"/g) ?? []).length, 1);
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

test("the next block opens automatically and remains available inside Schedule", () => {
  const html = render([rule]);
  const scheduleStart = html.indexOf('id="planner-area-schedule"');
  const scheduleEnd = html.indexOf('</section></div>', scheduleStart);
  const shortcut = html.indexOf('Next time block');
  assert.ok(shortcut > scheduleStart && shortcut < scheduleEnd);
  assert.match(html, /Choose up to 3 actions/);
  assert.match(html, /Choose Review trade journal for this block/);
  assert.match(html, /<strong>Thu, Oct 1<\/strong>/);
  assert.doesNotMatch(html, /Happening now|>This block<|>Now</);
  assert.doesNotMatch(render(), /No time blocks scheduled|Happening now/);
});

test("an empty current block opens its queue and add controls automatically", (t) => {
  duringBlock(t);
  const html = render([rule]);
  assert.match(html, /<strong>Thu, Oct 1<\/strong>/);
  assert.match(html, /Choose up to 3 actions/);
  assert.ok(html.includes("0/3 selected"));
  assert.match(html, /Choose Prepare execution notes for this block/);
  assert.doesNotMatch(html, /Happening now|>Choose work<|planner-current-block/);
});

test("the active block wins over upcoming blocks and shows Now and add controls", (t) => {
  duringBlock(t);
  const tomorrow = shiftPlannerDate(today, 1);
  const future = { ...rule, id: "future", effectiveOn: tomorrow, endsOn: tomorrow, weekdays: [plannerWeekday(tomorrow)] };
  const html = render([future, rule], undefined, [], [queuedTask]);
  assert.match(html, /Choose up to 3 actions/);
  assert.match(html, /<strong>Thu, Oct 1<\/strong>/);
  assert.match(html, />Now</);
  assert.ok(html.includes("1/3 selected"));
  assert.match(html, /Choose Prepare execution notes for this block/);
  assert.doesNotMatch(html, /planner-current-block/);
});

test("clearing an explicit selection restores the automatic current block", (t) => {
  duringBlock(t);
  const tomorrow = shiftPlannerDate(today, 1);
  const future = { ...rule, id: "future", effectiveOn: tomorrow, endsOn: tomorrow, weekdays: [plannerWeekday(tomorrow)] };
  const selected = render([rule, future], plannerOccurrenceId(future.id, tomorrow), [], [queuedTask]);
  assert.match(selected, /aria-label="Return to current block"/);
  const automatic = render([rule, future], undefined, [], [queuedTask], { selectedDate: tomorrow });
  assert.match(automatic, /<strong>Thu, Oct 1<\/strong>/);
  assert.match(automatic, />Now</);
  assert.doesNotMatch(automatic, /aria-label="Return to current block"/);
});

test("explicit future planning wins over an automatic current queue", (t) => {
  duringBlock(t);
  const futureDate = shiftPlannerDate(today, 1);
  const future = { ...rule, id: "future", effectiveOn: futureDate, endsOn: futureDate, weekdays: [plannerWeekday(futureDate)] };
  const html = render([rule, future], plannerOccurrenceId(future.id, futureDate), [], [queuedTask], { selectedDate: futureDate });
  assert.ok(html.includes("0/3 selected"));
  assert.match(html, /<time[^>]*aria-label="Fri, Oct 2, /);
  assert.match(html, /<strong>Fri, Oct 2<\/strong>/);
  assert.match(html, /aria-label="Return to current block"/);
  assert.match(html, /Choose Review trade journal for this block/);
  assert.doesNotMatch(html, />Now<|Happening now/);
});

test("automatic current context ignores the displayed calendar day and week", (t) => {
  const tomorrow = shiftPlannerDate(today, 1);
  const nextWeek = shiftPlannerDate(today, 7);
  for (const items of [[], [queuedTask]]) {
    duringBlock(t, "09:00");
    assert.match(render([rule], undefined, [], items), /Choose up to 3 actions/);
    assert.match(render([rule], undefined, [], items, { selectedDate: tomorrow }), /Choose up to 3 actions/);
    assert.match(render([rule], undefined, [], items, { anchorDate: nextWeek, selectedDate: nextWeek }), /Choose up to 3 actions/);
  }
});

test("an upcoming block beyond the displayed week opens automatically", () => {
  const nextWeek = shiftPlannerDate(today, 7);
  const future = { ...rule, effectiveOn: nextWeek, endsOn: nextWeek, weekdays: [plannerWeekday(nextWeek)] };
  const html = render([future]);
  assert.match(html, /Choose up to 3 actions/);
  assert.match(html, /Choose Prepare execution notes for this block/);
  assert.match(html, /<strong>Thu, Oct 8<\/strong>/);
  assert.match(html, /<time[^>]*aria-label="Thu, Oct 8, /);
  assert.doesNotMatch(html, />Now<|aria-label="Return to next block"/);
});

test("an explicit later block can return to the next upcoming block", () => {
  const tomorrow = shiftPlannerDate(today, 1);
  const future = { ...rule, id: "future", effectiveOn: tomorrow, endsOn: tomorrow, weekdays: [plannerWeekday(tomorrow)] };
  const selected = render([rule, future], plannerOccurrenceId(future.id, tomorrow));
  assert.match(selected, /<strong>Fri, Oct 2<\/strong>/);
  assert.match(selected, /aria-label="Return to next block"/);
  const automatic = render([rule, future]);
  assert.match(automatic, /<strong>Thu, Oct 1<\/strong>/);
  assert.doesNotMatch(automatic, /aria-label="Return to next block"/);
});

test("the automatic queue rolls to the next block at the current block's end", (t) => {
  const tomorrow = shiftPlannerDate(today, 1);
  const future = { ...rule, id: "future", effectiveOn: tomorrow, endsOn: tomorrow, weekdays: [plannerWeekday(tomorrow)] };
  duringBlock(t, "10:00");
  const html = render([rule, future], undefined, [], [queuedTask]);
  assert.match(html, /<strong>Fri, Oct 2<\/strong>/);
  assert.ok(html.includes("0/3 selected"));
  assert.match(html, /Choose Review trade journal for this block/);
  assert.doesNotMatch(html, />Now</);
  assert.doesNotMatch(render([rule], undefined, [], [queuedTask]), /Choose up to 3 actions/);
});

test("an explicit past block can return to area work when no upcoming block exists", (t) => {
  duringBlock(t, "10:00");
  const html = render([rule], plannerOccurrenceId(rule.id, today));
  assert.match(html, /<strong>Thu, Oct 1<\/strong>/);
  assert.match(html, /aria-label="Back to area"/);
  assert.doesNotMatch(render([rule]), /Choose up to 3 actions/);
});

test("missing and skipped blocks do not create a queue", (t) => {
  duringBlock(t);
  const skipped = [{ id: "skip", ruleId: rule.id, occurrenceDate: today, kind: "skip" }];
  for (const items of [[], [queuedTask]]) {
    assert.doesNotMatch(render([], undefined, [], items), /Choose up to 3 actions|Happening now/);
    assert.doesNotMatch(render([rule], undefined, skipped, items), /Choose up to 3 actions|Happening now/);
  }
});
