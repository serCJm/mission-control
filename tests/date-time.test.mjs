import assert from "node:assert/strict";
import test from "node:test";
import { plannerDateKey } from "../app/planner-schema.mjs";
import { routineDateKey, routineDateParts } from "../app/routine-schema.mjs";
import { currentWeekKey } from "../app/workspace-guidance.mjs";

test("date keys remain local to each requested timezone across repeated calls", () => {
  const instant = new Date("2026-01-01T07:30:00Z");
  for (let pass = 0; pass < 3; pass++) {
    for (const [zone, expected] of [["America/Los_Angeles", "2025-12-31"], ["UTC", "2026-01-01"], ["Pacific/Kiritimati", "2026-01-01"]]) {
      assert.equal(plannerDateKey(instant, zone), expected);
      assert.equal(routineDateKey(instant, zone), expected);
    }
  }
  assert.equal(plannerDateKey(instant), "2025-12-31");
  assert.equal(routineDateKey(instant), "2025-12-31");
});

test("routine wall-clock parts follow daylight-saving transitions without retaining an offset", () => {
  const cases = [
    ["2026-03-08T09:59:00Z", { year: 2026, month: 3, day: 8, hour: 1, minute: 59, weekday: 0 }],
    ["2026-03-08T10:00:00Z", { year: 2026, month: 3, day: 8, hour: 3, minute: 0, weekday: 0 }],
    ["2026-11-01T08:59:00Z", { year: 2026, month: 11, day: 1, hour: 1, minute: 59, weekday: 0 }],
    ["2026-11-01T09:00:00Z", { year: 2026, month: 11, day: 1, hour: 1, minute: 0, weekday: 0 }],
    ["2026-11-02T08:00:00Z", { year: 2026, month: 11, day: 2, hour: 0, minute: 0, weekday: 1 }],
  ];
  for (const [instant, expected] of cases) {
    assert.deepEqual(routineDateParts(new Date(instant)), expected);
  }
});

test("timezone-specific week and leap-day boundaries remain intact", () => {
  const mondayUtc = new Date("2026-01-05T00:30:00Z");
  assert.equal(currentWeekKey(mondayUtc, "UTC"), "2026-W02");
  assert.equal(currentWeekKey(mondayUtc, "America/Los_Angeles"), "2026-W01");
  assert.equal(currentWeekKey(new Date("2021-01-01T12:00:00Z"), "UTC"), "2020-W53");
  const leapDay = new Date("2024-02-29T23:30:00Z");
  assert.equal(plannerDateKey(leapDay, "UTC"), "2024-02-29");
  assert.equal(routineDateKey(leapDay, "Pacific/Kiritimati"), "2024-03-01");
});

test("invalid dates and timezone identifiers continue to fail", () => {
  for (const fn of [plannerDateKey, routineDateKey, routineDateParts, currentWeekKey]) {
    assert.throws(() => fn(new Date("invalid"), "UTC"), RangeError);
    assert.throws(() => fn(new Date(), "Invalid/TimeZone"), RangeError);
  }
});
