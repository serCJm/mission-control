import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { plannerDateKey } from "../app/planner-schema.mjs";
import { routineDateKey, routineDateParts } from "../app/routine-schema.mjs";
import { currentWeekKey } from "../app/workspace-guidance.mjs";

// Fixed instants cover a date boundary and both daylight-saving transitions.
// This measures CPU work only; the browser benchmark measures user-visible latency.
const dates = ["2026-03-08T09:59:00Z", "2026-03-08T10:00:00Z", "2026-11-01T09:00:00Z", "2026-01-01T07:30:00Z"].map((value) => new Date(value));
const iterations = 2000;
const samples = 9;
const functions = { plannerDateKey, routineDateKey, routineDateParts, currentWeekKey };
const result = { date: new Date().toISOString(), node: process.version, iterations, samples, cases: {} };
let sink;

for (const [name, fn] of Object.entries(functions)) {
  for (let index = 0; index < 100; index++) sink = fn(dates[index % dates.length]);
  const timings = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    for (let index = 0; index < iterations; index++) sink = fn(dates[index % dates.length]);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  result.cases[name] = {
    medianMs: +timings[Math.floor(samples / 2)].toFixed(3),
    p95Ms: +timings.at(-1).toFixed(3),
    samplesMs: timings.map((value) => +value.toFixed(3)),
  };
}

result.lastValue = sink;
console.log(JSON.stringify(result, null, 2));
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + "\n");
