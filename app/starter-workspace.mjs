import { plannerDateKey } from "./planner-schema.mjs";
import { routineDateKey } from "./routine-schema.mjs";
import { currentWeekKey, emptyWeeklyReview } from "./workspace-guidance.mjs";

export function createStarterWorkspace() {
  return {
    areas: [
      { id: "trading", name: "Trading", icon: "trend" },
      { id: "growth", name: "Personal growth", icon: "sprout" },
      { id: "family", name: "Family", icon: "people" },
      { id: "life", name: "Business & life", icon: "briefcase" },
    ],
    projects: [
      { id: "execution", areaId: "trading", name: "A-Setup Execution", outcome: "Execute and review 20 valid trades while following defined risk rules.", notes: [
        { id: "execution-observation", title: "Observation", body: "Entries after the second impulse are consistently late.", pinned: true, createdAt: 2, updatedAt: 2 },
        { id: "execution-review", title: "Next review", body: "Add MFE / MAE and compare first-hour results.", pinned: false, createdAt: 1, updatedAt: 1 },
      ] },
      { id: "replay", areaId: "trading", name: "Market Replay Lab", outcome: "Complete 12 focused replay sessions and extract one rule refinement from each.", notes: [{ id: "replay-next", title: "Next session", body: "Replay Tuesday’s failed breakout. Capture the earliest invalidation signal.", pinned: false, createdAt: 1, updatedAt: 1 }] },
      { id: "practice", areaId: "growth", name: "Deliberate Practice", outcome: "Finish eight lessons and apply each idea in a focused practice session.", notes: [{ id: "practice-loop", title: "Practice loop", body: "Short feedback loops beat longer passive study. Define success before the next session.", pinned: false, createdAt: 1, updatedAt: 1 }] },
      { id: "weekends", areaId: "family", name: "Present Weekends", outcome: "Plan and protect four device-light family blocks this month.", notes: [{ id: "weekends-plan", title: "Weekend shape", body: "One anchor activity leaves enough room for spontaneity. Choose between the beach and a museum.", pinned: false, createdAt: 1, updatedAt: 1 }] },
      { id: "loops", areaId: "life", name: "Close the Loops", outcome: "Complete nagging administrative tasks in two weekly batches.", notes: [{ id: "loops-boundary", title: "Boundary", body: "Keep the batch under 45 minutes. Stop when the timer ends.", pinned: true, createdAt: 1, updatedAt: 1 }] },
    ],
    tasks: [
      { id: "t1", title: "Mark pre-market levels and invalidation", areaId: "trading", projectId: "execution", status: "todo", createdAt: 1, dueDate: "2026-08-07", priority: "high" },
      { id: "t2", title: "Review yesterday’s AAPL trade", areaId: "trading", projectId: "execution", status: "doing", createdAt: 2, dueDate: "2026-08-08", priority: "medium" },
      { id: "t3", title: "Replay one failed-breakout setup", areaId: "trading", projectId: "replay", status: "todo", createdAt: 3, dueDate: "2026-08-10", priority: "high" },
      { id: "t4", title: "Complete deliberate-practice lesson", areaId: "growth", projectId: "practice", status: "todo", createdAt: 4, priority: "medium" },
      { id: "t5", title: "Plan a device-light Saturday", areaId: "family", projectId: "weekends", status: "todo", createdAt: 5, dueDate: "2026-08-09", priority: "low" },
      { id: "t6", title: "Send Q3 invoice", areaId: "life", projectId: "loops", status: "todo", createdAt: 6, dueDate: "2026-08-07", priority: "high" },
      { id: "i1", title: "Compare new broker fee schedule", status: "todo", createdAt: 7 },
      { id: "i2", title: "Book annual dental appointments", status: "todo", createdAt: 8, dueDate: "2026-08-15", priority: "low" },
    ],
    routines: [
      {
        id: "pre-market-routine",
        areaId: "trading",
        name: "Pre-market preparation",
        expectedMinutes: 20,
        weekdays: [1, 2, 3, 4, 5],
        allDay: true,
        scheduleEffectiveOn: routineDateKey(),
        checklist: [
          { id: "pre-market-levels", text: "Mark overnight levels" },
          { id: "pre-market-risk", text: "Define invalidation and maximum loss" },
          { id: "pre-market-scenarios", text: "Write the two highest-quality scenarios" },
        ],
        suspensions: [],
        sessions: [],
      },
      {
        id: "reading-routine",
        areaId: "growth",
        name: "Focused reading",
        expectedMinutes: 25,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        allDay: true,
        scheduleEffectiveOn: routineDateKey(),
        checklist: [{ id: "reading-note", text: "Capture one useful idea" }],
        suspensions: [],
        sessions: [],
      },
    ],
    planner: {
      areaBlockRules: [
        { id: "trading-mornings", areaId: "trading", weekdays: [1, 2, 3, 4, 5], effectiveOn: plannerDateKey(), startTime: "06:30", endTime: "09:30", fill: "sage" },
        { id: "growth-evenings", areaId: "growth", weekdays: [2, 4], effectiveOn: plannerDateKey(), startTime: "18:00", endTime: "19:00", fill: "sky" },
        { id: "family-weekend", areaId: "family", weekdays: [6], effectiveOn: plannerDateKey(), startTime: "10:00", endTime: "13:00", fill: "sand" },
        { id: "life-friday", areaId: "life", weekdays: [5], effectiveOn: plannerDateKey(), startTime: "14:00", endTime: "15:00", fill: "rose" },
      ],
      areaBlockExceptions: [],
      blockItems: [],
    },
    weeklyReview: emptyWeeklyReview(currentWeekKey()),
  };
}
