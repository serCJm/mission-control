import assert from "node:assert/strict";
import test from "node:test";
import { routineNeedsActionOn } from "../app/routine-schema.mjs";

const routine = { weekdays: [1, 2, 3, 4, 5], scheduleEffectiveOn: "2026-09-14", suspensions: [], sessions: [] };

test("routine choices respect the selected day's schedule and suspensions", () => {
  assert.equal(routineNeedsActionOn(routine, "2026-09-16"), true);
  assert.equal(routineNeedsActionOn(routine, "2026-09-19"), false);
  assert.equal(routineNeedsActionOn(routine, "2026-09-11"), false);
  assert.equal(routineNeedsActionOn({ ...routine, suspensions: [{ startsOn: "2026-09-16" }] }, "2026-09-16"), false);
  assert.equal(routineNeedsActionOn({ ...routine, suspensions: [{ startsOn: "2026-09-14", endsOn: "2026-09-15" }] }, "2026-09-16"), true);
  assert.equal(routineNeedsActionOn({ ...routine, pendingSchedule: { weekdays: [6], effectiveOn: "2026-09-16" } }, "2026-09-16"), false);
});

test("finished sessions disappear only for their own date", () => {
  for (const status of ["completed", "skipped", "missed"]) {
    const finished = { ...routine, sessions: [{ date: "2026-09-16", status }] };
    assert.equal(routineNeedsActionOn(finished, "2026-09-16"), false);
    assert.equal(routineNeedsActionOn(finished, "2026-09-17"), true);
  }
  assert.equal(routineNeedsActionOn({ ...routine, sessions: [{ date: "2026-09-16", status: "pending" }] }, "2026-09-16"), true);
});
