import assert from "node:assert/strict";
import test from "node:test";
import { plannerBlockTarget, plannerWeekday, shiftPlannerDate } from "../app/planner-schema.mjs";

function rule(id, date, fields = {}) {
  return { id, kind: "area", areaId: "trading", weekdays: [plannerWeekday(date)], effectiveOn: date, startTime: "10:00", endTime: "11:00", fill: "sage", ...fields };
}

function planner(blockRules, blockExceptions = []) {
  return { blockRules, blockExceptions, blockItems: [] };
}

test("finds the next block beyond 90 days for one-time and repeating schedules", () => {
  for (const fields of [{ endsOn: "2027-10-04" }, {}]) {
    const source = planner([rule("future", "2027-10-04", fields)]);
    const target = plannerBlockTarget(source, "trading", "2026-10-03", 12 * 60);
    assert.equal(target?.occurrence.date, "2027-10-04");
    assert.equal(target?.active, false);
  }
});

test("passes long runs of skipped occurrences and respects the schedule end", () => {
  const date = "2026-10-05";
  const skips = Array.from({ length: 20 }, (_, index) => ({ id: `skip-${index}`, ruleId: "weekly", occurrenceDate: shiftPlannerDate(date, index * 7), kind: "skip" }));
  const source = planner([rule("weekly", date)], skips);
  assert.equal(plannerBlockTarget(source, "trading", date, 9 * 60)?.occurrence.date, shiftPlannerDate(date, 20 * 7));
  source.blockRules[0].endsOn = shiftPlannerDate(date, 19 * 7);
  assert.equal(plannerBlockTarget(source, "trading", date, 9 * 60), null);
});

test("finds moved blocks before their source schedule starts and after it ends", () => {
  for (const sourceDate of ["2026-01-05", "2027-10-04"]) {
    const source = planner([rule("moved", sourceDate, { endsOn: sourceDate })], [{ id: "move", ruleId: "moved", occurrenceDate: sourceDate, kind: "override", date: "2026-10-03", startTime: "12:00", endTime: "13:00" }]);
    const active = plannerBlockTarget(source, "trading", "2026-10-03", 12 * 60);
    assert.equal(active?.active, true);
    assert.equal(active?.occurrence.sourceDate, sourceDate);
    assert.equal(active?.occurrence.date, "2026-10-03");
    assert.equal(plannerBlockTarget(source, "trading", "2026-10-03", 13 * 60), null);
  }
});

test("orders remaining weekdays and moved occurrences by their actual start", () => {
  const source = planner([
    rule("weekly", "2026-10-05", { weekdays: [5, 1, 3] }),
    rule("future", "2027-10-04", { endsOn: "2027-10-04" }),
    rule("family", "2026-10-05", { areaId: "family", startTime: "08:00", endTime: "09:00" }),
  ], [
    { id: "skip", ruleId: "weekly", occurrenceDate: "2026-10-05", kind: "skip" },
    { id: "move", ruleId: "future", occurrenceDate: "2027-10-04", kind: "override", date: "2026-10-06", startTime: "12:00", endTime: "13:00" },
  ]);
  const upcoming = plannerBlockTarget(source, "trading", "2026-10-05", 9 * 60);
  assert.equal(upcoming?.occurrence.ruleId, "future");
  assert.equal(upcoming?.occurrence.date, "2026-10-06");
  assert.equal(upcoming?.active, false);
  assert.equal(plannerBlockTarget(source, "trading", "2026-10-06", 13 * 60)?.occurrence.date, "2026-10-07");
  assert.equal(plannerBlockTarget(source, "missing", "2026-10-05", 9 * 60), null);
});
