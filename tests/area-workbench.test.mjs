import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";
import { plannerDateKey, plannerOccurrenceId, plannerWeekday, shiftPlannerDate } from "../app/planner-schema.mjs";

const output = new URL(`../output/area-workbench-test-${process.pid}/`, import.meta.url);
let renderWorkbench;
const today = plannerDateKey();
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
      const tasks = [{ id: "review", areaId: "trading", projectId: "execution", title: "Review trade journal", status: "todo" }];
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

function render(blockRules = [], openOccurrenceId, blockExceptions = [], blockItems = []) {
  return renderWorkbench({ blockRules, blockExceptions, blockItems }, { anchorDate: today, selectedDate: today, selectedAreaId: "trading", selectedProjectId: "", queue: "work", workbenchOpen: true, openOccurrenceId });
}

test("area work is available with no schedule or selected block", () => {
  for (const rules of [[], [rule]]) {
    const html = render(rules);
    assert.match(html, />Area management</);
    assert.match(html, /Projects &amp; tasks/);
    assert.match(html, /Review trade journal/);
    assert.match(html, /New task in this area/);
    assert.doesNotMatch(html, /Choose Review trade journal for this block|This block · choose/);
    assert.doesNotMatch(html, /Schedule your areas/);
  }
});

test("a selected block adds focus controls within the area workbench", () => {
  const html = render([rule], plannerOccurrenceId(rule.id, today));
  assert.match(html, />Area management</);
  assert.match(html, /id="planner-area-select"/);
  assert.match(html, /This block · choose up to 3/);
  assert.match(html, /Choose Review trade journal for this block/);
  assert.match(html, />Schedule</);
  assert.match(html, />All area work</);
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
