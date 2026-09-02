import assert from "node:assert/strict";
import test from "node:test";
import { recoverCalendarBlockWorkspace } from "../app/workspace-recovery.mjs";

test("recovers legacy area calendar blocks without changing other workspace data", () => {
  const workspace = {
    areas: [{ id: "trading" }],
    marker: { untouched: true },
    planner: {
      areaBlockRules: [{ id: "rule-1", areaId: "trading", weekdays: [1], effectiveOn: "2026-08-31", startTime: "09:00", endTime: "10:00" }],
      areaBlockExceptions: [{ id: "exception-1", ruleId: "rule-1", occurrenceDate: "2026-08-31", kind: "skip" }],
      blockItems: [],
    },
  };

  const recovered = recoverCalendarBlockWorkspace(workspace);
  assert.deepEqual(recovered, {
    areas: workspace.areas,
    marker: workspace.marker,
    planner: {
      blockItems: [],
      blockRules: [{ id: "rule-1", areaId: "trading", weekdays: [1], effectiveOn: "2026-08-31", startTime: "09:00", endTime: "10:00", kind: "area", fill: "sage" }],
      blockExceptions: workspace.planner.areaBlockExceptions,
    },
  });
  assert.equal(workspace.planner.areaBlockRules[0].kind, undefined);
});

test("refuses current or unexpected planner formats", () => {
  assert.equal(recoverCalendarBlockWorkspace({ planner: { blockRules: [], blockExceptions: [], blockItems: [] } }), null);
  assert.equal(recoverCalendarBlockWorkspace({ planner: { areaBlockRules: [{ id: "bad" }], areaBlockExceptions: [], blockItems: [] } }), null);
});
