"use client";

import { DragEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AREA_ICON_OPTIONS, changedAreaPatch, normalizeArea } from "./area-schema.mjs";
import { openDateInputPicker } from "./task-date-control.mjs";
import { normalizeProjectNotes, sortProjectNotes } from "./project-note-schema.mjs";
import { currentRoutineSession, isRoutineSuspended, normalizeRoutines, reconcileRoutines, routineConsistency, routineDateKey, routineScheduleLabel, routineScheduleStartsOn, shiftRoutineDate } from "./routine-schema.mjs";
import { isTaskStatus, normalizeTaskNotes, taskPlacementForDestination } from "./task-schema.mjs";
import { isTaskSort, sortTasks } from "./task-sorting.mjs";
import { currentWeekKey, emptyWeeklyReview, normalizeFocusTaskIds, normalizeWeeklyReview, reconcileFocusTaskIdsAfterMove, restoreFocusTaskAfterMove } from "./workspace-guidance.mjs";

type AreaIconName = "target" | "trend" | "sprout" | "people" | "briefcase" | "heart" | "home" | "book" | "calendar" | "clock" | "star" | "flag" | "wallet" | "chart" | "dumbbell" | "music" | "camera" | "plane" | "car" | "utensils" | "leaf" | "paw" | "globe" | "palette";
type Area = { id: string; name: string; icon: AreaIconName };
type ProjectNote = { id: string; title: string; body: string; pinned: boolean; createdAt: number; updatedAt: number };
type Project = { id: string; areaId: string; name: string; outcome: string; notes: ProjectNote[] };
type TaskPriority = "high" | "medium" | "low";
type TaskStatus = "todo" | "doing" | "done";
type TaskSort = "custom" | "alphabetical" | "dueDate" | "priority";
type ProjectSort = "custom" | "alphabetical";
type ProjectViewMode = "list" | "board";
type Task = { id: string; title: string; areaId?: string; projectId?: string; status: TaskStatus; createdAt: number; dueDate?: string; priority?: TaskPriority; notes?: string; someday?: boolean; waiting?: boolean };
type RoutineStatus = "pending" | "completed" | "skipped" | "missed";
type RoutineChecklistItem = { id: string; text: string };
type RoutineSession = { date: string; status: RoutineStatus; checklist: Array<RoutineChecklistItem & { checked: boolean }>; updatedAt: number };
type RoutineSuspension = { id: string; kind: "pause" | "vacation"; startsOn: string; endsOn?: string };
type RoutineSchedule = { weekdays: number[]; allDay: boolean; windowStart?: string; windowEnd?: string };
type PendingRoutineSchedule = RoutineSchedule & { effectiveOn: string };
type Routine = RoutineSchedule & { id: string; areaId: string; name: string; expectedMinutes: number; scheduleEffectiveOn: string; checklist: RoutineChecklistItem[]; suspensions: RoutineSuspension[]; sessions: RoutineSession[]; pendingSchedule?: PendingRoutineSchedule };
type RoutineDraft = RoutineSchedule & { name: string; expectedMinutes: number; checklist: RoutineChecklistItem[] };
type TaskPatch = Partial<Pick<Task, "dueDate" | "priority" | "notes" | "status" | "someday" | "waiting">>;
type UpdateTask = (id: string, patch: TaskPatch) => void;
type RemoveTask = (id: string) => void;
type AddProjectTask = (projectId: string, areaId: string, status: TaskStatus, title: string) => void;
type Selection =
  | { kind: "today" | "inbox" | "review" }
  | { kind: "area"; id: string }
  | { kind: "project"; id: string };
type WeeklyReview = { weekKey: string; completedSteps: number[]; intention: string };
type Workspace = { areas: Area[]; projects: Project[]; tasks: Task[]; routines: Routine[]; focusTaskIds: string[]; weeklyReview: WeeklyReview; currentAreaId?: string };
type SyncState = "loading" | "saving" | "saved" | "error";
type Account = { displayName: string; email: string };
type EntityKind = "area" | "project" | "task";
type SortPreferences = Record<string, TaskSort>;
type DragItem = { kind: EntityKind; id: string; scope: string };
type TaskNoteEditorEvent = { taskId: string; open: boolean; draft?: string; saved?: string };
type TaskNoteEditorChange = (event: TaskNoteEditorEvent) => void;
type TaskUndo = { task: Task; index: number };
type TaskPlacement = Pick<Task, "areaId" | "projectId" | "someday" | "waiting">;
type MoveTaskUndo = { taskId: string; from: TaskPlacement; to: TaskPlacement; toast: string; focusIndex?: number };
type TaskMoveTarget = { value: string; label: string; kind: "focus" | "backlog" | "waiting" | "project" };
type ReorderProps = {
  descriptor: DragItem;
  onDragStart: (event: DragEvent<HTMLButtonElement>, item: DragItem) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>, item: DragItem) => void;
  onDrop: (event: DragEvent<HTMLElement>, item: DragItem) => void;
};

const seed: Workspace = {
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
  focusTaskIds: ["t1", "t2", "t3"],
  weeklyReview: emptyWeeklyReview(currentWeekKey()),
  currentAreaId: "trading",
};

const WORKSPACE_STORAGE_KEY = "mission-control-workspace-v1";
const TASK_SORT_STORAGE_KEY = "mission-control-task-sorts-v2";
const PROJECT_VIEW_STORAGE_KEY = "mission-control-project-view-v1";
const nameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const reviewSteps = [
  ["Notice what moved", "Look for evidence of practice, not just outcomes."],
  ["Process the inbox", "Give every loose task a home or let it go."],
  ["Prune the irrelevant", "Remove work that no longer earns attention."],
  ["Choose the week", "Name the few outcomes that would actually matter."],
  ["Protect some slack", "Leave room for what the plan cannot predict."],
];
const PROJECT_STATUSES: Array<{ value: TaskStatus; label: string; empty: string }> = [
  { value: "todo", label: "To do", empty: "Add the next concrete action when it becomes clear." },
  { value: "doing", label: "Doing", empty: "Start a task here when work is actively in progress." },
  { value: "done", label: "Done", empty: "Completed work will collect here." },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeClientWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Workspace>;
  if (!Array.isArray(candidate.areas) || !Array.isArray(candidate.projects) || !Array.isArray(candidate.tasks) || !Array.isArray(candidate.routines)) return null;
  const areas = candidate.areas.map(normalizeArea).filter(Boolean) as Area[];
  if (areas.length !== candidate.areas.length) return null;
  const projects = candidate.projects.map((project) => {
    if (!project || typeof project !== "object") return null;
    const notes = normalizeProjectNotes(project.notes);
    return notes === null ? null : { ...project, notes };
  });
  if (projects.some((project) => project === null)) return null;
  const currentAreaId = areas.some((area) => area.id === candidate.currentAreaId) ? candidate.currentAreaId : areas[0]?.id;
  const tasks = candidate.tasks.map((task) => {
    if (!isTaskStatus(task.status)) return null;
    const notes = normalizeTaskNotes(task.notes);
    const validQueues = (task.someday === undefined || typeof task.someday === "boolean")
      && (task.waiting === undefined || typeof task.waiting === "boolean")
      && !(task.someday && task.waiting);
    return notes === null || !validQueues ? null : { ...task, notes };
  });
  if (tasks.some((task) => task === null)) return null;
  const routines = normalizeRoutines(candidate.routines, new Set(areas.map((area) => area.id))) as Routine[] | null;
  if (routines === null) return null;
  const focusTaskIds = normalizeFocusTaskIds(candidate.focusTaskIds, tasks, currentAreaId);
  const weeklyReview = normalizeWeeklyReview(candidate.weeklyReview);
  if (focusTaskIds === null || weeklyReview === null) return null;
  return { areas, projects: projects as Project[], tasks: tasks as Task[], routines, focusTaskIds, weeklyReview, currentAreaId };
}

function reorderScoped<T extends { id: string }>(items: T[], scopeIds: string[], sourceId: string, targetId: string) {
  const from = scopeIds.indexOf(sourceId);
  const to = scopeIds.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return items;
  const nextIds = [...scopeIds];
  const [moved] = nextIds.splice(from, 1);
  nextIds.splice(to, 0, moved);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const scopeIdSet = new Set(scopeIds);
  const ordered = nextIds.map((id) => itemsById.get(id)).filter(Boolean) as T[];
  let index = 0;
  return items.map((item) => scopeIdSet.has(item.id) ? ordered[index++] : item);
}

function taskScope(task: Task) {
  if (task.projectId) return `project:${task.projectId}`;
  if (task.areaId && task.someday) return `backlog:${task.areaId}`;
  if (task.areaId && task.waiting) return `waiting:${task.areaId}`;
  if (task.areaId) return `area:${task.areaId}`;
  return "inbox";
}

const PROJECT_TIME_ZONE = "America/Los_Angeles";

function projectDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: PROJECT_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function weekNumber(date: Date) {
  const parts = projectDateParts(date);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function dueLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const today = projectDateParts(new Date());
  const due = Date.UTC(year, month - 1, day);
  const current = Date.UTC(today.year, today.month - 1, today.day);
  const distance = Math.round((due - current) / 86400000);
  if (distance < 0) return "Overdue";
  if (distance === 0) return "Due today";
  if (distance === 1) return "Due tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(due));
}

function routineSchedulesEqual(left: RoutineSchedule, right: RoutineSchedule) {
  return left.allDay === right.allDay
    && left.windowStart === right.windowStart
    && left.windowEnd === right.windowEnd
    && left.weekdays.length === right.weekdays.length
    && left.weekdays.every((day, index) => day === right.weekdays[index]);
}

function routineScheduleFrom(routine: Routine): RoutineSchedule {
  const source = routine.pendingSchedule ?? routine;
  return {
    weekdays: [...source.weekdays],
    allDay: source.allDay,
    ...(source.allDay ? {} : { windowStart: source.windowStart, windowEnd: source.windowEnd }),
  };
}

function mergePendingChecklist(session: RoutineSession, checklist: RoutineChecklistItem[]) {
  if (session.status !== "pending") return session;
  const checked = new Map(session.checklist.map((item) => [item.id, item.checked]));
  return { ...session, checklist: checklist.map((item) => ({ ...item, checked: checked.get(item.id) ?? false })) };
}

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>(() => ({ ...seed, routines: reconcileRoutines(seed.routines, new Date()) }));
  const [selection, setSelection] = useState<Selection>({ kind: "today" });
  const [capture, setCapture] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newProject, setNewProject] = useState("");
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [undoWorkspace, setUndoWorkspace] = useState<Workspace | null>(null);
  const [taskUndo, setTaskUndo] = useState<TaskUndo | null>(null);
  const [moveTaskUndo, setMoveTaskUndo] = useState<MoveTaskUndo | null>(null);
  const [expandedAreas, setExpandedAreas] = useState<string[]>(seed.areas.map((area) => area.id));
  const [dragged, setDragged] = useState<DragItem | null>(null);
  const [taskSorts, setTaskSorts] = useState<SortPreferences>({});
  const [projectView, setProjectView] = useState<ProjectViewMode>("list");
  const [hydrated, setHydrated] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [routineNow, setRoutineNow] = useState(() => new Date());
  const lastSyncedWorkspace = useRef("");
  const lastServerUpdatedAt = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const openTaskNoteEditors = useRef(new Set<string>());
  const openProjectNoteEditors = useRef(new Set<string>());
  const pendingTaskNoteCommits = useRef(new Map<string, string>());

  const handleTaskNoteEditorChange = useCallback(({ taskId, open, draft, saved }: TaskNoteEditorEvent) => {
    if (open) {
      openTaskNoteEditors.current.add(taskId);
      return;
    }
    if (draft !== undefined && saved !== undefined && draft !== saved) {
      pendingTaskNoteCommits.current.set(taskId, draft);
      queueMicrotask(() => {
        if (pendingTaskNoteCommits.current.get(taskId) !== draft) return;
        setWorkspace((current) => ({
          ...current,
          tasks: current.tasks.map((task) => task.id === taskId ? { ...task, notes: draft || undefined } : task),
        }));
      });
      return;
    }
    openTaskNoteEditors.current.delete(taskId);
  }, []);

  const handleProjectNoteEditorChange = useCallback((noteId: string, open: boolean) => {
    if (open) openProjectNoteEditors.current.add(noteId);
    else openProjectNoteEditors.current.delete(noteId);
  }, []);

  useEffect(() => {
    for (const [taskId, draft] of pendingTaskNoteCommits.current) {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task || (task.notes ?? "") === draft) {
        pendingTaskNoteCommits.current.delete(taskId);
        openTaskNoteEditors.current.delete(taskId);
      }
    }
  }, [workspace]);

  useEffect(() => {
    let active = true;

    async function loadWorkspace() {
      let localWorkspace = seed;
      try {
        const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? localStorage.getItem("bearing-workspace-v2");
        const parsed = saved ? normalizeClientWorkspace(JSON.parse(saved) as unknown) : null;
        if (parsed) localWorkspace = parsed;
        const savedSorts = localStorage.getItem(TASK_SORT_STORAGE_KEY);
        if (savedSorts) {
          const parsed = JSON.parse(savedSorts) as Record<string, unknown>;
          const validSorts = Object.fromEntries(Object.entries(parsed).filter(([, value]) => isTaskSort(value))) as SortPreferences;
          setTaskSorts(validSorts);
        }
        const savedProjectView = localStorage.getItem(PROJECT_VIEW_STORAGE_KEY);
        if (savedProjectView === "list" || savedProjectView === "board") setProjectView(savedProjectView);
      } catch { /* Fall back to the starter workspace. */ }
      setHydrated(true);

      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign("/signin-with-chatgpt?return_to=%2F");
          return;
        }
        if (!response.ok) throw new Error("Unable to load the synced workspace.");
        const payload = await response.json() as { workspace: Workspace | null; updatedAt: number; resetIncompatibleWorkspace?: boolean; user: Account };
        if (!active) return;

        const loadedWorkspace = normalizeClientWorkspace(payload.workspace) ?? localWorkspace;
        const nextWorkspace = { ...loadedWorkspace, routines: reconcileRoutines(loadedWorkspace.routines, new Date()) };
        if (!payload.workspace) {
          const createResponse = await fetch("/api/workspace", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspace: nextWorkspace }),
          });
          if (!createResponse.ok) throw new Error("Unable to create the synced workspace.");
          const created = await createResponse.json() as { updatedAt: number };
          payload.updatedAt = created.updatedAt;
        }
        if (!active) return;

        const serialized = JSON.stringify(nextWorkspace);
        lastSyncedWorkspace.current = serialized;
        lastServerUpdatedAt.current = payload.updatedAt;
        setWorkspace(nextWorkspace);
        setAccount(payload.user);
        setCloudReady(true);
        setSyncState("saved");
        if (payload.resetIncompatibleWorkspace) setToast("Started fresh after a saved-data format change. Your previous cloud workspace was archived.");
        localStorage.removeItem(WORKSPACE_STORAGE_KEY);
        localStorage.removeItem("bearing-workspace-v2");
      } catch {
        if (!active) return;
        setWorkspace(localWorkspace);
        setSyncState("error");
      }
    }

    void loadWorkspace();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!cloudReady) return;
    const serialized = JSON.stringify(workspace);
    if (serialized === lastSyncedWorkspace.current) return;

    setSyncState("saving");
    const timeout = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        const response = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace }),
        });
        if (response.status === 401) {
          window.location.assign("/signin-with-chatgpt?return_to=%2F");
          return;
        }
        if (!response.ok) throw new Error("Unable to save the workspace.");
        const payload = await response.json() as { updatedAt: number };
        lastSyncedWorkspace.current = serialized;
        lastServerUpdatedAt.current = payload.updatedAt;
        setSyncState("saved");
      }).catch(() => setSyncState("error"));
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [cloudReady, workspace]);

  useEffect(() => {
    if (!cloudReady) return;
    let active = true;

    async function refreshFromCloud() {
      if (document.visibilityState !== "visible" || openTaskNoteEditors.current.size > 0 || openProjectNoteEditors.current.size > 0 || JSON.stringify(workspace) !== lastSyncedWorkspace.current) return;
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { workspace: Workspace | null; updatedAt: number };
        const normalized = normalizeClientWorkspace(payload.workspace);
        const synced = normalized ? { ...normalized, routines: reconcileRoutines(normalized.routines, new Date()) } : null;
        if (!active || openTaskNoteEditors.current.size > 0 || openProjectNoteEditors.current.size > 0 || !synced || payload.updatedAt <= lastServerUpdatedAt.current) return;
        lastServerUpdatedAt.current = payload.updatedAt;
        lastSyncedWorkspace.current = JSON.stringify(synced);
        setWorkspace(synced);
        setToast("Updated from another device");
      } catch { /* Keep the last successfully synced workspace. */ }
    }

    window.addEventListener("focus", refreshFromCloud);
    document.addEventListener("visibilitychange", refreshFromCloud);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshFromCloud);
      document.removeEventListener("visibilitychange", refreshFromCloud);
    };
  }, [cloudReady, workspace]);

  useEffect(() => {
    let timeout = 0;
    const refresh = () => {
      const now = new Date();
      setRoutineNow(now);
      setWorkspace((current) => {
        const routines = reconcileRoutines(current.routines, now);
        return routines === current.routines ? current : { ...current, routines };
      });
    };
    const schedule = () => {
      const delay = 60_000 - (Date.now() % 60_000) + 25;
      timeout = window.setTimeout(() => { refresh(); schedule(); }, delay);
    };
    const refreshVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshVisible);
    schedule();
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(TASK_SORT_STORAGE_KEY, JSON.stringify(taskSorts));
  }, [hydrated, taskSorts]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(PROJECT_VIEW_STORAGE_KEY, projectView);
  }, [hydrated, projectView]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => { setToast(""); setUndoWorkspace(null); setTaskUndo(null); setMoveTaskUndo(null); }, 8000);
    return () => window.clearTimeout(timeout);
  }, [toast, taskUndo, moveTaskUndo]);

  const activeArea = selection.kind === "area"
    ? workspace.areas.find((area) => area.id === selection.id)
    : selection.kind === "project"
      ? workspace.areas.find((area) => area.id === workspace.projects.find((project) => project.id === selection.id)?.areaId)
      : undefined;
  const activeProject = selection.kind === "project" ? workspace.projects.find((project) => project.id === selection.id) : undefined;
  const inboxTasks = useMemo(() => workspace.tasks.filter((task) => !task.areaId && !task.projectId), [workspace.tasks]);
  const openTasks = useMemo(() => workspace.tasks.filter((task) => task.status !== "done"), [workspace.tasks]);
  const completeCount = workspace.tasks.filter((task) => task.status === "done").length;
  const reviewWeekKey = currentWeekKey(new Date(), PROJECT_TIME_ZONE);
  const currentReview = workspace.weeklyReview.weekKey === reviewWeekKey ? workspace.weeklyReview : emptyWeeklyReview(reviewWeekKey);
  const captureDestination = activeProject?.name ?? (selection.kind === "area" && activeArea ? `${activeArea.name} Backlog` : "Inbox");
  const sidebarAreas = useMemo(() => [...workspace.areas].sort((a, b) => nameCollator.compare(a.name, b.name)), [workspace.areas]);

  function taskSortFor(scope: string): TaskSort {
    return taskSorts[scope] ?? "custom";
  }

  function setTaskSort(scope: string, sort: TaskSort) {
    setTaskSorts((current) => ({ ...current, [scope]: sort }));
  }

  function setCurrentArea(id: string) {
    setWorkspace((current) => ({ ...current, currentAreaId: id, focusTaskIds: [] }));
    setToast(`${workspace.areas.find((area) => area.id === id)?.name ?? "Area"} is now in focus`);
  }

  function retrySync() {
    window.location.reload();
  }

  function toggleFocusTask(id: string) {
    setWorkspace((current) => ({
      ...current,
      focusTaskIds: current.focusTaskIds.includes(id)
        ? current.focusTaskIds.filter((taskId) => taskId !== id)
        : current.focusTaskIds.length < 3 ? [...current.focusTaskIds, id] : current.focusTaskIds,
    }));
  }

  function completeReviewStep(index: number, intention?: string) {
    setWorkspace((current) => {
      const review = current.weeklyReview.weekKey === reviewWeekKey ? current.weeklyReview : emptyWeeklyReview(reviewWeekKey);
      return {
        ...current,
        weeklyReview: {
          ...review,
          completedSteps: review.completedSteps.includes(index) ? review.completedSteps : [...review.completedSteps, index],
          intention: intention ?? review.intention,
        },
      };
    });
    setToast(index === 4 ? `Weekly brief saved for Week ${reviewWeekKey.slice(-2)}` : "Review step complete");
  }

  function navigate(next: Selection) {
    setSelection(next);
    setMobileMenu(false);
    setShowProjectForm(false);
  }

  function prependTask(task: Task, message: string) {
    setWorkspace((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setUndoWorkspace(null);
    setToast(message);
  }

  function addTask(event: FormEvent) {
    event.preventDefault();
    const title = capture.trim();
    if (!title) return;
    const task: Task = {
      id: makeId("task"), title, status: "todo", createdAt: Date.now(),
      ...(activeArea ? { areaId: activeArea.id } : {}),
      ...(activeProject ? { projectId: activeProject.id } : {}),
      ...(selection.kind === "area" ? { someday: true } : {}),
    };
    prependTask(task, `Added to ${captureDestination}`);
    setCapture("");
  }

  function addAreaTask(areaId: string, title: string) {
    const task: Task = { id: makeId("task"), title, areaId, status: "todo", createdAt: Date.now() };
    prependTask(task, "Added to today’s focus");
  }

  function addProjectTask(projectId: string, areaId: string, status: TaskStatus, title: string) {
    const task: Task = { id: makeId("task"), title, areaId, projectId, status, createdAt: Date.now() };
    prependTask(task, `Added to ${PROJECT_STATUSES.find((item) => item.value === status)?.label ?? "project"}`);
  }

  function addBacklogTask(areaId: string, title: string) {
    const task: Task = { id: makeId("task"), title, areaId, status: "todo", createdAt: Date.now(), someday: true };
    prependTask(task, "Added to Backlog");
  }

  function addWaitingTask(areaId: string, title: string) {
    const task: Task = { id: makeId("task"), title, areaId, status: "todo", createdAt: Date.now(), waiting: true };
    prependTask(task, "Added to Waiting");
  }

  function addArea(event: FormEvent) {
    event.preventDefault();
    const name = newArea.trim();
    if (!name) return;
    const area: Area = { id: makeId("area"), name, icon: "target" };
    setWorkspace((current) => ({ ...current, areas: [...current.areas, area], currentAreaId: current.currentAreaId ?? area.id }));
    setExpandedAreas((current) => [...current, area.id]);
    setNewArea("");
    setShowAreaForm(false);
    navigate({ kind: "area", id: area.id });
  }

  function addProject(event: FormEvent) {
    event.preventDefault();
    if (!activeArea) return;
    const name = newProject.trim();
    if (!name) return;
    const project = { id: makeId("project"), areaId: activeArea.id, name, outcome: "Define the outcome this project will create.", notes: [] };
    setWorkspace((current) => ({ ...current, projects: [...current.projects, project] }));
    setNewProject("");
    setShowProjectForm(false);
    navigate({ kind: "project", id: project.id });
  }

  function addRoutine(areaId: string, draft: RoutineDraft) {
    const routine: Routine = {
      id: makeId("routine"),
      areaId,
      name: draft.name,
      expectedMinutes: draft.expectedMinutes,
      weekdays: [...draft.weekdays].sort((a, b) => a - b),
      allDay: draft.allDay,
      ...(draft.allDay ? {} : { windowStart: draft.windowStart, windowEnd: draft.windowEnd }),
      scheduleEffectiveOn: routineScheduleStartsOn(draft, routineNow),
      checklist: draft.checklist,
      suspensions: [],
      sessions: [],
    };
    setUndoWorkspace(null);
    setTaskUndo(null);
    setWorkspace((current) => ({ ...current, routines: [...current.routines, ...reconcileRoutines([routine], routineNow)] }));
    setToast("Routine added");
  }

  function updateRoutine(routineId: string, draft: RoutineDraft) {
    const effectiveOn = shiftRoutineDate(routineDateKey(routineNow), 1);
    setUndoWorkspace(null);
    setTaskUndo(null);
    setWorkspace((current) => ({
      ...current,
      routines: current.routines.map((routine) => {
        if (routine.id !== routineId) return routine;
        const currentRoutine = reconcileRoutines([routine], routineNow)[0];
        const activeSchedule = routineScheduleFrom({ ...currentRoutine, pendingSchedule: undefined });
        const requestedSchedule: RoutineSchedule = {
          weekdays: [...draft.weekdays].sort((a, b) => a - b),
          allDay: draft.allDay,
          ...(draft.allDay ? {} : { windowStart: draft.windowStart, windowEnd: draft.windowEnd }),
        };
        const next: Routine = {
          ...currentRoutine,
          name: draft.name,
          expectedMinutes: draft.expectedMinutes,
          checklist: draft.checklist,
          sessions: currentRoutine.sessions.map((session) => mergePendingChecklist(session, draft.checklist)),
        };
        if (routineSchedulesEqual(activeSchedule, requestedSchedule)) delete next.pendingSchedule;
        else next.pendingSchedule = { ...requestedSchedule, effectiveOn };
        return next;
      }),
    }));
    setToast("Routine updated");
  }

  function removeRoutine(routineId: string) {
    const routine = workspace.routines.find((item) => item.id === routineId);
    setUndoWorkspace(workspace);
    setTaskUndo(null);
    setWorkspace((current) => ({ ...current, routines: current.routines.filter((item) => item.id !== routineId) }));
    setToast(`${routine?.name ?? "Routine"} removed`);
  }

  function setRoutineSessionStatus(routineId: string, status: "completed" | "skipped") {
    const now = routineNow;
    const today = routineDateKey(now);
    setWorkspace((current) => ({
      ...current,
      routines: current.routines.map((routine) => {
        if (routine.id !== routineId) return routine;
        const reconciled = reconcileRoutines([routine], now)[0];
        if (!currentRoutineSession(reconciled, now)) return reconciled;
        return {
          ...reconciled,
          sessions: reconciled.sessions.map((session) => session.date === today ? { ...session, status: session.status === status ? "pending" : status, updatedAt: now.getTime() } : session),
        };
      }),
    }));
    setToast(status === "completed" ? "Routine completed" : "Routine skipped");
  }

  function toggleRoutineChecklist(routineId: string, checklistId: string) {
    const today = routineDateKey(routineNow);
    setWorkspace((current) => ({
      ...current,
      routines: current.routines.map((routine) => routine.id === routineId ? {
        ...routine,
        sessions: routine.sessions.map((session) => session.date === today ? {
          ...session,
          checklist: session.checklist.map((item) => item.id === checklistId ? { ...item, checked: !item.checked } : item),
          updatedAt: routineNow.getTime(),
        } : session),
      } : routine),
    }));
  }

  function toggleRoutinePause(routineId: string) {
    const today = routineDateKey(routineNow);
    setWorkspace((current) => ({
      ...current,
      routines: current.routines.map((routine) => {
        if (routine.id !== routineId) return routine;
        const openPause = routine.suspensions.find((item) => item.kind === "pause" && !item.endsOn);
        if (openPause) {
          const suspensions = openPause.startsOn === today
            ? routine.suspensions.filter((item) => item.id !== openPause.id)
            : routine.suspensions.map((item) => item.id === openPause.id ? { ...item, endsOn: shiftRoutineDate(today, -1) } : item);
          return reconcileRoutines([{ ...routine, suspensions }], routineNow)[0];
        }
        return {
          ...routine,
          suspensions: [...routine.suspensions, { id: makeId("pause"), kind: "pause", startsOn: today }],
          sessions: routine.sessions.filter((session) => session.date !== today || session.status !== "pending"),
        };
      }),
    }));
    setToast(workspace.routines.find((routine) => routine.id === routineId)?.suspensions.some((item) => item.kind === "pause" && !item.endsOn) ? "Routine resumed" : "Routine paused");
  }

  function addRoutineVacation(routineId: string, startsOn: string, endsOn: string) {
    setWorkspace((current) => ({
      ...current,
      routines: current.routines.map((routine) => routine.id === routineId ? {
        ...routine,
        suspensions: [...routine.suspensions, { id: makeId("vacation"), kind: "vacation", startsOn, endsOn }],
        sessions: routine.sessions.filter((session) => session.status !== "pending" || session.date < startsOn || session.date > endsOn),
      } : routine),
    }));
    setToast("Vacation saved");
  }

  function removeRoutineVacation(routineId: string, suspensionId: string) {
    setWorkspace((current) => ({
      ...current,
      routines: current.routines.map((routine) => routine.id === routineId ? reconcileRoutines([{ ...routine, suspensions: routine.suspensions.filter((item) => item.id !== suspensionId) }], routineNow)[0] : routine),
    }));
    setToast("Vacation removed");
  }

  function removeArea(areaId: string) {
    const area = workspace.areas.find((item) => item.id === areaId);
    const projectIds = workspace.projects.filter((project) => project.areaId === areaId).map((project) => project.id);
    setUndoWorkspace(workspace);
    setTaskUndo(null);
    setWorkspace((current) => ({
      ...current,
      areas: current.areas.filter((item) => item.id !== areaId),
      projects: current.projects.filter((project) => project.areaId !== areaId),
      tasks: current.tasks.filter((task) => task.areaId !== areaId && !projectIds.includes(task.projectId ?? "")),
      routines: current.routines.filter((routine) => routine.areaId !== areaId),
      focusTaskIds: current.currentAreaId === areaId ? [] : current.focusTaskIds,
      currentAreaId: current.currentAreaId === areaId ? current.areas.find((item) => item.id !== areaId)?.id : current.currentAreaId,
    }));
    navigate({ kind: "today" });
    setToast(`${area?.name ?? "Area"} removed`);
  }

  function removeProject(projectId: string) {
    const project = workspace.projects.find((item) => item.id === projectId);
    setUndoWorkspace(workspace);
    setTaskUndo(null);
    setWorkspace((current) => ({
      ...current,
      projects: current.projects.filter((item) => item.id !== projectId),
      tasks: current.tasks.filter((task) => task.projectId !== projectId),
      focusTaskIds: current.focusTaskIds.filter((taskId) => current.tasks.some((task) => task.id === taskId && task.projectId !== projectId)),
    }));
    navigate(project ? { kind: "area", id: project.areaId } : { kind: "today" });
    setToast(`${project?.name ?? "Project"} removed`);
  }

  function removeTask(taskId: string) {
    const index = workspace.tasks.findIndex((task) => task.id === taskId);
    setUndoWorkspace(null);
    setTaskUndo(index >= 0 ? { task: workspace.tasks[index], index } : null);
    setMoveTaskUndo(null);
    setWorkspace((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== taskId), focusTaskIds: current.focusTaskIds.filter((id) => id !== taskId) }));
    setToast("Task deleted");
  }

  function undoRemoval() {
    if (taskUndo) {
      setWorkspace((current) => {
        if (current.tasks.some((task) => task.id === taskUndo.task.id)) return current;
        const tasks = [...current.tasks];
        tasks.splice(Math.min(taskUndo.index, tasks.length), 0, taskUndo.task);
        return { ...current, tasks };
      });
      setTaskUndo(null);
      setToast("Restored");
      return;
    }
    if (undoWorkspace) {
      setWorkspace(undoWorkspace);
      setUndoWorkspace(null);
      setToast("Restored");
      return;
    }
    if (moveTaskUndo) {
      const task = workspace.tasks.find((item) => item.id === moveTaskUndo.taskId);
      if (!task || task.areaId !== moveTaskUndo.to.areaId || task.projectId !== moveTaskUndo.to.projectId || task.someday !== moveTaskUndo.to.someday || task.waiting !== moveTaskUndo.to.waiting) {
        setMoveTaskUndo(null);
        setToast("Undo unavailable");
        return;
      }
      setWorkspace((current) => {
        const currentTask = current.tasks.find((item) => item.id === moveTaskUndo.taskId);
        if (!currentTask || currentTask.areaId !== moveTaskUndo.to.areaId || currentTask.projectId !== moveTaskUndo.to.projectId || currentTask.someday !== moveTaskUndo.to.someday || currentTask.waiting !== moveTaskUndo.to.waiting) return current;
        const tasks = current.tasks.map((item) => item.id === moveTaskUndo.taskId ? { ...item, ...moveTaskUndo.from } : item);
        const focusTaskIds = restoreFocusTaskAfterMove(current.focusTaskIds, moveTaskUndo.taskId, moveTaskUndo.focusIndex, tasks, current.currentAreaId);
        return { ...current, tasks, focusTaskIds };
      });
      setMoveTaskUndo(null);
      setToast("Restored");
    }
  }

  function toggleTask(id: string) {
    setWorkspace((current) => {
      const task = current.tasks.find((item) => item.id === id);
      const completing = task?.status !== "done";
      return {
        ...current,
        tasks: current.tasks.map((item) => item.id === id ? { ...item, status: item.status === "done" ? "todo" : "done" } : item),
        focusTaskIds: completing ? current.focusTaskIds.filter((taskId) => taskId !== id) : current.focusTaskIds,
      };
    });
  }

  function moveTaskToStatus(id: string, status: TaskStatus, expectedProjectId?: string, targetId?: string) {
    setUndoWorkspace(null);
    setMoveTaskUndo(null);
    setWorkspace((current) => {
      const currentTask = current.tasks.find((task) => task.id === id);
      if (!currentTask || (expectedProjectId !== undefined && currentTask.projectId !== expectedProjectId)) return current;
      const movedTasks = current.tasks.map((task) => task.id === id ? { ...task, status } : task);
      const focusTaskIds = status === "done" ? current.focusTaskIds.filter((taskId) => taskId !== id) : current.focusTaskIds;
      if (!targetId || targetId === id) return { ...current, tasks: movedTasks, focusTaskIds };
      const task = movedTasks.find((item) => item.id === id);
      if (!task?.projectId) return { ...current, tasks: movedTasks };
      const ids = movedTasks.filter((item) => item.projectId === task.projectId && item.status === status).map((item) => item.id);
      return { ...current, tasks: reorderScoped(movedTasks, ids, id, targetId), focusTaskIds };
    });
    const statusLabel = PROJECT_STATUSES.find((item) => item.value === status)?.label ?? status;
    setToast(`Moved to ${statusLabel}`);
  }

  function moveTask(id: string, value: string, destinationLabel?: string) {
    const task = workspace.tasks.find((item) => item.id === id);
    const to = taskPlacementForDestination(value, workspace.projects) as TaskPlacement | null;
    const resolvedLabel = value === "inbox"
      ? "Inbox"
      : value.startsWith("area:")
        ? workspace.areas.find((area) => area.id === value.slice(5))?.name
        : value.startsWith("backlog:")
          ? "Backlog"
          : value.startsWith("waiting:")
            ? "Waiting"
            : workspace.projects.find((project) => project.id === value.slice(8))?.name;
    const moveToast = `Moved to ${destinationLabel ?? resolvedLabel ?? "destination"}`;
    setUndoWorkspace(null);
    setTaskUndo(null);
    setMoveTaskUndo(task && to ? {
      taskId: id,
      from: { areaId: task.areaId, projectId: task.projectId, someday: task.someday, waiting: task.waiting },
      to,
      toast: moveToast,
      focusIndex: workspace.focusTaskIds.includes(id) ? workspace.focusTaskIds.indexOf(id) : undefined,
    } : null);
    setWorkspace((current) => {
      const tasks = current.tasks.map((task) => {
        if (task.id !== id) return task;
        return to ? { ...task, ...to } : task;
      });
      const focusTaskIds = reconcileFocusTaskIdsAfterMove(current.focusTaskIds, id, tasks, current.currentAreaId);
      return { ...current, tasks, focusTaskIds };
    });
    setToast(moveToast);
  }

  function updateArea(id: string, patch: Partial<Pick<Area, "name" | "icon">>) {
    setWorkspace((current) => ({ ...current, areas: current.areas.map((area) => area.id === id ? { ...area, ...patch } : area) }));
    setToast("Area updated");
  }

  function renameProject(id: string, name: string) {
    setWorkspace((current) => ({ ...current, projects: current.projects.map((project) => project.id === id ? { ...project, name } : project) }));
    setToast("Project renamed");
  }

  function renameTask(id: string, title: string) {
    setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, title } : task) }));
    setToast("Task renamed");
  }

  function updateTask(id: string, patch: TaskPatch) {
    setWorkspace((current) => {
      const tasks = current.tasks.map((task) => task.id === id ? { ...task, ...patch } : task);
      const focusTaskIds = normalizeFocusTaskIds(current.focusTaskIds, tasks, current.currentAreaId) ?? [];
      return { ...current, tasks, focusTaskIds };
    });
  }

  function updateProject(patch: Partial<Project>) {
    if (!activeProject) return;
    setWorkspace((current) => ({ ...current, projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, ...patch } : project) }));
  }

  function addProjectNote(title: string, body: string) {
    if (!activeProject || (!title.trim() && !body.trim())) return;
    const timestamp = Date.now();
    const note: ProjectNote = { id: makeId("note"), title, body, pinned: false, createdAt: timestamp, updatedAt: timestamp };
    setUndoWorkspace(null);
    setWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, notes: [...project.notes, note] } : project),
    }));
    setToast("Note added");
  }

  function updateProjectNote(noteId: string, patch: Partial<Pick<ProjectNote, "title" | "body" | "pinned">>) {
    if (!activeProject) return;
    const updatedAt = Date.now();
    setUndoWorkspace(null);
    setWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === activeProject.id ? {
        ...project,
        notes: project.notes.map((note) => note.id === noteId ? { ...note, ...patch, updatedAt } : note),
      } : project),
    }));
  }

  function removeProjectNote(noteId: string) {
    if (!activeProject) return;
    setUndoWorkspace(workspace);
    setTaskUndo(null);
    setWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, notes: project.notes.filter((note) => note.id !== noteId) } : project),
    }));
    setToast("Note removed");
  }

  function idsFor(item: DragItem, current = workspace) {
    if (item.kind === "area") return current.areas.map((area) => area.id);
    if (item.kind === "project") return current.projects.filter((project) => project.areaId === item.scope).map((project) => project.id);
    if (item.scope.startsWith("today:")) {
      const areaId = item.scope.slice(6);
      return current.tasks.filter((task) => task.areaId === areaId && task.status !== "done").map((task) => task.id);
    }
    if (item.scope.startsWith("project:")) {
      const projectScope = item.scope.slice("project:".length);
      const statusDelimiter = projectScope.lastIndexOf(":");
      if (statusDelimiter >= 0) {
        const projectId = projectScope.slice(0, statusDelimiter);
        const status = projectScope.slice(statusDelimiter + 1);
        if (!isTaskStatus(status)) return [];
        return current.tasks.filter((task) => task.projectId === projectId && task.status === status).map((task) => task.id);
      }
    }
    return current.tasks.filter((task) => taskScope(task) === item.scope).map((task) => task.id);
  }

  function reorderItem(source: DragItem, target: DragItem) {
    if (source.kind !== target.kind || source.scope !== target.scope) return;
    setWorkspace((current) => {
      const ids = idsFor(source, current);
      if (source.kind === "area") return { ...current, areas: reorderScoped(current.areas, ids, source.id, target.id) };
      if (source.kind === "project") return { ...current, projects: reorderScoped(current.projects, ids, source.id, target.id) };
      return { ...current, tasks: reorderScoped(current.tasks, ids, source.id, target.id) };
    });
    setToast("Sequence updated");
  }

  function dragStart(event: DragEvent<HTMLButtonElement>, item: DragItem) {
    setDragged(item);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  }

  function dragOver(event: DragEvent<HTMLElement>, item: DragItem) {
    if (dragged && dragged.kind === item.kind && dragged.scope === item.scope) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }

  function drop(event: DragEvent<HTMLElement>, item: DragItem) {
    if (!dragged) return;
    event.preventDefault();
    reorderItem(dragged, item);
    setDragged(null);
  }

  function reorderProps(descriptor: DragItem): ReorderProps {
    return { descriptor, onDragStart: dragStart, onDragEnd: () => setDragged(null), onDragOver: dragOver, onDrop: drop };
  }

  const contextualTasks = workspace.tasks.filter((task) => activeProject ? task.projectId === activeProject.id : activeArea ? task.areaId === activeArea.id : false);

  return (
    <div className="app-shell">
      {!cloudReady && <div className="sync-gate" role="status"><LogoMark /><h1>{syncState === "loading" ? "Loading your workspace…" : "Your workspace could not sync."}</h1><p>{syncState === "loading" ? "Connecting to your saved Mission Control data." : "Your device data is still untouched. Try the connection again."}</p>{syncState === "error" && <button onClick={retrySync}>Try again</button>}</div>}
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="brand-row">
          <button className="brand" onClick={() => navigate({ kind: "today" })} aria-label="Mission Control home">
            <LogoMark />
            <span className="brand-name"><strong>Mission</strong><span>Control</span></span>
          </button>
          <button className="close-menu" onClick={() => setMobileMenu(false)} aria-label="Close menu" title="Close menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg></button>
        </div>

        <nav className="primary-nav" aria-label="Workspace">
          <button className={selection.kind === "today" ? "active" : ""} onClick={() => navigate({ kind: "today" })}><span>Today</span><small>{openTasks.length}</small></button>
          <button className={selection.kind === "inbox" ? "active" : ""} onClick={() => navigate({ kind: "inbox" })}><span>Inbox</span><small>{inboxTasks.length}</small></button>
        </nav>

        <div className="tree-head"><span>Areas</span><button onClick={() => setShowAreaForm((value) => !value)}>{showAreaForm ? "Cancel" : "+ Add"}</button></div>
        {showAreaForm && <form className="rail-form" onSubmit={addArea}><input value={newArea} onChange={(event) => setNewArea(event.target.value)} placeholder="Area name" aria-label="New area name" /><button>Add</button></form>}
        <nav className="area-tree" aria-label="Areas and projects">
          {sidebarAreas.map((area) => {
            const areaProjects = workspace.projects.filter((project) => project.areaId === area.id).sort((a, b) => nameCollator.compare(a.name, b.name));
            const isOpen = expandedAreas.includes(area.id);
            return <div className="area-branch" key={area.id}>
              <div className="area-row"><button className={`area-link ${selection.kind === "area" && selection.id === area.id ? "active" : ""}`} onClick={() => navigate({ kind: "area", id: area.id })}><span>{area.name}</span><small>{workspace.tasks.filter((task) => task.areaId === area.id && task.status !== "done").length}</small></button>{areaProjects.length > 0 && <button className={`disclosure ${isOpen ? "expanded" : ""}`} onClick={() => setExpandedAreas((current) => current.includes(area.id) ? current.filter((id) => id !== area.id) : [...current, area.id])} aria-label={`${isOpen ? "Collapse" : "Expand"} ${area.name} projects`} aria-expanded={isOpen}><span /></button>}</div>
              {isOpen && areaProjects.length > 0 && <div className="project-links">{areaProjects.map((project) => {
                return <div key={project.id}><button className={selection.kind === "project" && selection.id === project.id ? "active" : ""} onClick={() => navigate({ kind: "project", id: project.id })}>{project.name}</button></div>;
              })}</div>}
            </div>;
          })}
        </nav>

        <button className={`review-link ${selection.kind === "review" ? "active" : ""}`} onClick={() => navigate({ kind: "review" })}><span>Weekly review</span><small>{currentReview.completedSteps.length}/5</small></button>
        <div className="sidebar-foot"><div><strong>Week {weekNumber(new Date())}</strong><span>{completeCount} tasks completed</span></div><p>Steady over busy.</p></div>
      </aside>

      {mobileMenu && <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="Close menu" />}

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu(true)} aria-label="Menu" title="Menu"><MenuIcon /></button>
          <form className="quick-add" onSubmit={addTask} autoComplete="off">
            <label htmlFor="quick-task" className="sr-only">Add a task to {captureDestination}</label>
            <input id="quick-task" name="quick-task-new" value={capture} onChange={(event) => setCapture(event.target.value)} placeholder={`Add a task to ${captureDestination}…`} autoComplete="off" autoCorrect="off" spellCheck={false} />
            <button disabled={!capture.trim()} aria-label={`Add task to ${captureDestination}`} title={`Add task to ${captureDestination}`}><PlusIcon /></button>
          </form>
          <div className="sync-tools" title={account?.email}>{syncState === "error" ? <button className="sync-state error" onClick={retrySync}><i />Retry sync</button> : <span className={`sync-state ${syncState}`}><i />{syncState === "saving" ? "Saving" : "Synced"}</span>}<a href="/signout-with-chatgpt?return_to=%2F">{account?.displayName ?? "Account"}</a></div>
        </header>

        {selection.kind === "today" && <Today key={workspace.currentAreaId ?? "today"} workspace={workspace} inboxTasks={inboxTasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={handleTaskNoteEditorChange} navigate={navigate} reorderProps={reorderProps} setCurrentArea={setCurrentArea} toggleFocusTask={toggleFocusTask} routineNow={routineNow} setRoutineSessionStatus={setRoutineSessionStatus} toggleRoutineChecklist={toggleRoutineChecklist} />}
        {selection.kind === "inbox" && <Inbox workspace={workspace} tasks={inboxTasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={handleTaskNoteEditorChange} moveTask={moveTask} reorderProps={reorderProps} taskSort={taskSortFor("inbox")} setTaskSort={(sort) => setTaskSort("inbox", sort)} />}
        {selection.kind === "area" && activeArea && <AreaView key={activeArea.id} area={activeArea} projects={workspace.projects.filter((project) => project.areaId === activeArea.id)} tasks={contextualTasks} routines={workspace.routines.filter((routine) => routine.areaId === activeArea.id)} showProjectForm={showProjectForm} setShowProjectForm={setShowProjectForm} newProject={newProject} setNewProject={setNewProject} addProject={addProject} addAreaTask={addAreaTask} addBacklogTask={addBacklogTask} addWaitingTask={addWaitingTask} addRoutine={addRoutine} updateRoutine={updateRoutine} removeRoutine={removeRoutine} setRoutineSessionStatus={setRoutineSessionStatus} toggleRoutineChecklist={toggleRoutineChecklist} toggleRoutinePause={toggleRoutinePause} addRoutineVacation={addRoutineVacation} removeRoutineVacation={removeRoutineVacation} routineNow={routineNow} navigate={navigate} toggleTask={toggleTask} updateArea={updateArea} renameProject={renameProject} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={handleTaskNoteEditorChange} moveTask={moveTask} reorderProps={reorderProps} focusSort={taskSortFor(`area:${activeArea.id}`)} setFocusSort={(sort) => setTaskSort(`area:${activeArea.id}`, sort)} backlogSort={taskSortFor(`backlog:${activeArea.id}`)} setBacklogSort={(sort) => setTaskSort(`backlog:${activeArea.id}`, sort)} waitingSort={taskSortFor(`waiting:${activeArea.id}`)} setWaitingSort={(sort) => setTaskSort(`waiting:${activeArea.id}`, sort)} removeArea={removeArea} />}
        {selection.kind === "project" && activeProject && activeArea && <ProjectView key={activeProject.id} project={activeProject} area={activeArea} tasks={contextualTasks} toggleTask={toggleTask} renameProject={renameProject} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} addProjectTask={addProjectTask} onTaskNoteEditorChange={handleTaskNoteEditorChange} reorderProps={reorderProps} taskSort={taskSortFor(`project:${activeProject.id}`)} setTaskSort={(sort) => setTaskSort(`project:${activeProject.id}`, sort)} updateProject={updateProject} addProjectNote={addProjectNote} updateProjectNote={updateProjectNote} removeProjectNote={removeProjectNote} onProjectNoteEditorChange={handleProjectNoteEditorChange} removeProject={removeProject} view={projectView} setView={setProjectView} dragged={dragged} moveTaskToStatus={moveTaskToStatus} moveTask={moveTask} setDragged={setDragged} navigate={navigate} />}
        {selection.kind === "review" && <Review key={currentReview.weekKey} workspace={workspace} review={currentReview} completeStep={completeReviewStep} navigate={navigate} />}
      </main>
      {toast && <div className="toast" role="status"><span>{toast}</span>{((toast === "Task deleted" && taskUndo) || (moveTaskUndo && toast === moveTaskUndo.toast) || undoWorkspace) && <button onClick={undoRemoval}>Undo</button>}</div>}
    </div>
  );
}

function LogoMark() {
  return <span className="brand-mark" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit-core" /><span className="orbit-signal" /></span>;
}

function MenuIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" /></svg>;
}

function PlusIcon() {
  return <svg className="quick-add-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4 6 0-.8 5 2.8 3v2H7v-2l2.8-3L9 4Zm3 10v6" /></svg>;
}

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5" /></svg>;
}

function AreaIcon({ icon }: { icon: AreaIconName }) {
  if (icon === "trend") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5 9 12l3.5 3.5L20 7m-5 0h5v5" /></svg>;
  if (icon === "sprout") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9m0 4c-4.2 0-7-2.5-7-6.5 4.2 0 7 2.5 7 6.5Zm0-4c3.8 0 6.5-2.2 6.5-5.8C14.7 3.2 12 5.4 12 9Z" /></svg>;
  if (icon === "people") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 19.5v-2.2a4.3 4.3 0 0 1 4.3-4.3h1.4a4.3 4.3 0 0 1 4.3 4.3v2.2m1-7.5h1.2a4 4 0 0 1 4 4v3.5" /></svg>;
  if (icon === "briefcase") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h16v10H4zM9 8.5V6h6v2.5M4 12h16m-9 0v2h2v-2" /></svg>;
  if (icon === "heart") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 5.8a4.4 4.4 0 0 0-6.2 0L12 7.7l-1.9-1.9a4.4 4.4 0 0 0-6.3 6.2L12 20l8.2-8a4.4 4.4 0 0 0 0-6.2Z" /></svg>;
  if (icon === "home") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 11 8.5-7 8.5 7M6 9v10h12V9m-8 10v-5h4v5" /></svg>;
  if (icon === "book") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22Zm16 0A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22Z" /></svg>;
  if (icon === "calendar") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14a2 2 0 0 1 2 2v13H3v-13a2 2 0 0 1 2-2ZM3 9h18M7 2v5m10-5v5" /></svg>;
  if (icon === "clock") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
  if (icon === "star") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" /></svg>;
  if (icon === "flag") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 1h11l-2 3 2 3H5" /></svg>;
  if (icon === "wallet") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h15a2 2 0 0 1 2 2V19H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h13M16 11h5v4h-5a2 2 0 0 1 0-4Z" /></svg>;
  if (icon === "chart") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m5 7H2" /></svg>;
  if (icon === "dumbbell") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8v8m-3-6v4m15-6v8m3-6v4M6 12h12M2 9h1m18 0h1M2 15h1m18 0h1" /></svg>;
  if (icon === "music") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12M9 9l10-2M6.5 21A2.5 2.5 0 1 0 6.5 16a2.5 2.5 0 0 0 0 5Zm10-2A2.5 2.5 0 1 0 16.5 14a2.5 2.5 0 0 0 0 5Z" /></svg>;
  if (icon === "camera") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4l1.5-2h7L17 7h4v12H3Z" /><circle cx="12" cy="13" r="4" /></svg>;
  if (icon === "plane") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2.5 14 8.5-2.5V5c0-1.7.4-3 1-3s1 1.3 1 3v6.5l8.5 2.5v2L13 15v4l2.5 2v1L12 21l-3.5 1v-1l2.5-2v-4l-8.5 1Z" /></svg>;
  if (icon === "car") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 15 1.5-6h13l1.5 6v4H4Zm2-6 2-4h8l2 4M7 19v2m10-2v2" /><circle cx="7" cy="15" r="1" /><circle cx="17" cy="15" r="1" /></svg>;
  if (icon === "utensils") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v7m-3-7v5a3 3 0 0 0 6 0V3M6 11v10m9-10V7a4 4 0 0 1 4-4v18" /></svg>;
  if (icon === "leaf") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4C10 4 5 8 5 14a5 5 0 0 0 5 5c6 0 10-5 10-15ZM4 21c2-5 6-8 12-12" /></svg>;
  if (icon === "paw") return <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16" rx="5" ry="4" /><circle cx="5.5" cy="10" r="2" /><circle cx="9.5" cy="6" r="2" /><circle cx="14.5" cy="6" r="2" /><circle cx="18.5" cy="10" r="2" /></svg>;
  if (icon === "globe") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>;
  if (icon === "palette") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h4a5 5 0 0 0 5-5c0-3.3-4-6-9-6Z" /><circle cx="7.5" cy="10" r=".8" /><circle cx="10" cy="6.8" r=".8" /><circle cx="15" cy="7" r=".8" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2.5V5m9.5 7H19M12 19v2.5M5 12H2.5" /></svg>;
}

function AreaIconPicker({ value, onChange }: { value: AreaIconName; onChange: (icon: AreaIconName) => void }) {
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent) {
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="area-icon-picker" ref={picker}>
    <button type="button" className="area-icon-trigger" aria-label="Choose area icon" title="Choose area icon" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="area-icon-trigger-preview"><AreaIcon icon={value} /></span>
    </button>
    {open && <div className="area-icon-popover" role="dialog" aria-label="Choose an area icon">
      <div className="area-icon-popover-heading">Choose an icon</div>
      <div className="area-icon-grid">{AREA_ICON_OPTIONS.map(([icon, label]) => <button type="button" key={icon} className={value === icon ? "active" : ""} aria-label={label} aria-pressed={value === icon} title={label} onClick={() => { onChange(icon as AreaIconName); setOpen(false); }}><AreaIcon icon={icon as AreaIconName} /></button>)}</div>
    </div>}
  </div>;
}

function OpenAreaIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10v10M19 5 8 16m-3-7v10h10" /></svg>;
}

function DragHandle({ descriptor, onDragStart, onDragEnd, label }: ReorderProps & { label: string }) {
  return <div className="order-controls">
    <button className="drag-handle" draggable onDragStart={(event) => onDragStart(event, descriptor)} onDragEnd={onDragEnd} aria-label={`${label}. Drag to move.`} title="Drag to move"><span /><span /><span /></button>
  </div>;
}

function EditIcon() {
  return <svg className="edit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4M5 19l2.8-.6L18.5 7.7a1.4 1.4 0 0 0 0-2l-.2-.2a1.4 1.4 0 0 0-2 0L5.6 16.2 5 19Z" /></svg>;
}

function ConfirmIcon() {
  return <svg className="editor-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}

function NameEditor({ value, onSave, label, large = false, iconOnly = false, onDelete, onEditingChange }: { value: string; onSave: (value: string) => void; label: string; large?: boolean; iconOnly?: boolean; onDelete?: () => void; onEditingChange?: (editing: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    if (!next) return;
    onSave(next);
    setEditing(false);
    onEditingChange?.(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
    onEditingChange?.(false);
  }

  if (editing) return <form className={`name-editor editing ${large ? "large" : ""}`} onSubmit={submit}>
    <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } }} aria-label={label} />
    <button disabled={!draft.trim()} aria-label="Save" title="Save"><ConfirmIcon /></button>
  </form>;

  return <div className={`name-editor ${large ? "large" : ""} ${iconOnly ? "icon-only" : ""}`}><span>{value}</span><button type="button" onClick={() => { setDraft(value); setEditing(true); onEditingChange?.(true); }} aria-label={`Edit ${value}`} title={`Edit ${value}`}><span className="edit-label">Edit</span><EditIcon /></button>{onDelete && <button type="button" className="name-delete-button" onClick={onDelete} aria-label={`Delete ${value}`} title={`Delete ${value}`}><DeleteIcon /></button>}</div>;
}

function AreaEditor({ area, onSave }: { area: Area; onSave: (patch: Partial<Pick<Area, "name" | "icon">>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(area.name);
  const [draftIcon, setDraftIcon] = useState<AreaIconName>(area.icon);
  const initial = useRef<Pick<Area, "name" | "icon">>({ name: area.name, icon: area.icon });

  function beginEditing() {
    initial.current = { name: area.name, icon: area.icon };
    setDraftName(area.name);
    setDraftIcon(area.icon);
    setEditing(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    const patch = changedAreaPatch(initial.current, { name, icon: draftIcon });
    if (Object.keys(patch).length) onSave(patch);
    setEditing(false);
  }

  function cancel() {
    setDraftName(initial.current.name);
    setDraftIcon(initial.current.icon);
    setEditing(false);
  }

  if (editing) return <form className="area-editor-form" onSubmit={submit}>
    <div className="area-editor-fields">
      <AreaIconPicker value={draftIcon} onChange={setDraftIcon} />
      <input value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } }} aria-label={`Area name for ${area.name}`} />
      <button className="area-editor-save" disabled={!draftName.trim()} aria-label="Save area changes" title="Save"><ConfirmIcon /></button>
    </div>
  </form>;

  return <div className="name-editor large area-editor-summary"><div className="area-editor-icon"><AreaIcon icon={area.icon} /></div><span>{area.name}</span><button onClick={beginEditing} aria-label={`Edit ${area.name}`}><span className="edit-label">Edit</span><EditIcon /></button></div>;
}

type SortOption<Value extends string> = readonly [Value, string];

const TASK_SORT_OPTIONS: Array<SortOption<TaskSort>> = [["custom", "Manual"], ["alphabetical", "A–Z"], ["dueDate", "Due"], ["priority", "Priority"]];
const PROJECT_SORT_OPTIONS: Array<SortOption<ProjectSort>> = [["custom", "Manual"], ["alphabetical", "A–Z"]];

function SortControl<Value extends string>({ value, onChange, options, ariaLabel }: { value: Value; onChange: (value: Value) => void; options: readonly SortOption<Value>[]; ariaLabel: string }) {
  const currentLabel = options.find(([sort]) => sort === value)?.[1] ?? options[0]?.[1] ?? "";
  return <label className="task-sort"><span className="task-sort-control">
    <svg className="task-sort-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h10M5 12h7M5 17h4m7-5v7m-3-3 3 3 3-3" /></svg>
    <span className="task-sort-value">{currentLabel}</span>
    <svg className="task-sort-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value as Value)}>{options.map(([sort, label]) => <option value={sort} key={sort}>{label}</option>)}</select>
  </span></label>;
}

function TaskSortControl({ value, onChange }: { value: TaskSort; onChange: (sort: TaskSort) => void }) {
  return <SortControl value={value} onChange={onChange} options={TASK_SORT_OPTIONS} ariaLabel="Sort tasks" />;
}

function ProjectSortControl({ value, onChange }: { value: ProjectSort; onChange: (sort: ProjectSort) => void }) {
  return <SortControl value={value} onChange={onChange} options={PROJECT_SORT_OPTIONS} ariaLabel="Sort projects" />;
}

function TaskDetails({ task, updateTask }: { task: Task; updateTask: (id: string, patch: Partial<Pick<Task, "dueDate" | "priority">>) => void }) {
  const dateInput = useRef<HTMLInputElement>(null);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const dueDateLabel = task.dueDate ? dueLabel(task.dueDate) : "";
  const priorityLabel = task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : "";

  function openDatePicker() {
    const input = dateInput.current;
    if (!input) return;
    openDateInputPicker(input);
  }

  return <>
    <div className={`task-direct-control timing ${task.dueDate ? "active" : ""}`} title={`${dueDateLabel || "Set timing"} for ${task.title}`}>
      <button type="button" className="task-direct-trigger" onClick={openDatePicker} aria-label={task.dueDate ? `Change due date for ${task.title}. ${dueDateLabel}.` : `Set due date for ${task.title}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /></svg>
        {task.dueDate && <span>{dueDateLabel}</span>}
      </button>
      <input ref={dateInput} className="task-date-input" type="date" tabIndex={-1} value={task.dueDate ?? ""} onChange={(event) => updateTask(task.id, { dueDate: event.target.value || undefined })} aria-label={`Due date for ${task.title}`} />
    </div>
    <div className={`task-direct-control priority priority-picker ${task.priority ? `active priority-${task.priority}` : "priority-none"}`}>
      <button type="button" className="priority-trigger" onClick={() => setPriorityOpen((open) => !open)} aria-expanded={priorityOpen} aria-haspopup="menu" aria-label={`${task.priority ? `${priorityLabel} priority` : "No priority"} for ${task.title}`} title={`${task.priority ? `${priorityLabel} priority` : "No priority"} for ${task.title}`}><PriorityFlag priority={task.priority} /></button>
      {priorityOpen && <div className="priority-menu" role="menu" aria-label={`Choose priority for ${task.title}`}>{([undefined, "low", "medium", "high"] as Array<TaskPriority | undefined>).map((priority) => {
        const label = priority ? `${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority` : "No priority";
        return <button type="button" role="menuitemradio" aria-checked={task.priority === priority} aria-label={label} title={label} className={`priority-option priority-${priority ?? "none"}`} key={priority ?? "none"} onClick={() => { updateTask(task.id, { priority }); setPriorityOpen(false); }}><PriorityFlag priority={priority} /></button>;
      })}</div>}
    </div>
  </>;
}

function PriorityFlag({ priority }: { priority?: TaskPriority }) {
  return <svg className="priority-flag" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4m0 1h10.5l-2 3 2 3H6" />{!priority && <path className="priority-slash" d="m4.5 19 14-14" />}</svg>;
}

function NoteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12a2 2 0 0 1 2 2v8.25a2 2 0 0 1-2 2h-6l-4.5 3v-3H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" /><path d="M8 9h8M8 12.5h5" /></svg>;
}

function TaskCopy({ task, renameTask, updateTask, removeTask, onTaskNoteEditorChange }: { task: Task; renameTask: (id: string, value: string) => void; updateTask: UpdateTask; removeTask: RemoveTask; onTaskNoteEditorChange: TaskNoteEditorChange }) {
  const [taskEditing, setTaskEditing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(task.notes ?? "");
  const noteButton = useRef<HTMLButtonElement>(null);
  const noteEditor = useRef<HTMLTextAreaElement>(null);
  const returnFocus = useRef(false);
  const notesDraftRef = useRef(notesDraft);
  const savedNotesRef = useRef(task.notes ?? "");
  const hasNotes = Boolean(task.notes?.trim());
  const dueDateLabel = task.dueDate ? dueLabel(task.dueDate) : "";
  const noteEditorId = `task-notes-${task.id}`;

  useEffect(() => {
    if (notesOpen) noteEditor.current?.focus();
    else if (returnFocus.current) {
      noteButton.current?.focus();
      returnFocus.current = false;
    }
  }, [notesOpen]);

  useEffect(() => {
    if (!notesOpen) return;
    onTaskNoteEditorChange({ taskId: task.id, open: true });
    return () => onTaskNoteEditorChange({ taskId: task.id, open: false, draft: notesDraftRef.current, saved: savedNotesRef.current });
  }, [notesOpen, onTaskNoteEditorChange, task.id]);

  function openNotes() {
    const notes = task.notes ?? "";
    notesDraftRef.current = notes;
    savedNotesRef.current = notes;
    setNotesDraft(notes);
    setNotesOpen(true);
  }

  function commitNotes() {
    const notes = notesDraftRef.current;
    if (notes === savedNotesRef.current) return;
    savedNotesRef.current = notes;
    updateTask(task.id, { notes: notes || undefined });
  }

  function closeNotes() {
    commitNotes();
    returnFocus.current = true;
    setNotesOpen(false);
  }

  return <div className="task-copy">
    <NameEditor iconOnly value={task.title} onSave={(value) => renameTask(task.id, value)} onDelete={() => removeTask(task.id)} label={`Task name for ${task.title}`} onEditingChange={setTaskEditing} />
    {(taskEditing || notesOpen) && <div className="task-planning" aria-label={`Timing, priority, and notes for ${task.title}`}>
      <TaskDetails task={task} updateTask={updateTask} />
      <button ref={noteButton} type="button" className={`task-direct-control task-note-trigger ${hasNotes ? "has-notes" : ""}`} onClick={() => notesOpen ? closeNotes() : openNotes()} aria-expanded={notesOpen} aria-controls={noteEditorId} aria-label={`${hasNotes ? "Edit" : "Add"} notes for ${task.title}`} title={`${hasNotes ? "Edit" : "Add"} notes for ${task.title}`}><NoteIcon /></button>
    </div>}
    {task.dueDate && <p className="task-due-date">{dueDateLabel === "Overdue" ? dueDateLabel : `Due ${dueDateLabel}`}</p>}
    {hasNotes && !notesOpen && <p className="task-note-preview">{task.notes?.replace(/\s+/g, " ").trim()}</p>}
    {notesOpen && <div className="task-note-editor" id={noteEditorId}>
      <div className="task-note-editor-heading"><span>Task notes</span><button type="button" onClick={closeNotes}>Close</button></div>
      <textarea ref={noteEditor} value={notesDraft} maxLength={20_000} onChange={(event) => { notesDraftRef.current = event.target.value; setNotesDraft(event.target.value); }} onBlur={commitNotes} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeNotes(); } }} placeholder="Add useful context, a decision, or what to remember next…" aria-label={`Notes for ${task.title}`} />
      <p>Autosaves with this task.</p>
    </div>}
  </div>;
}

function TaskMoveTargetIcon({ kind }: { kind: TaskMoveTarget["kind"] }) {
  if (kind === "focus") return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5" /><circle cx="8" cy="8" r="1.5" /></svg>;
  if (kind === "backlog") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10v3H3zM3 9.5h10v3H3z" /></svg>;
  if (kind === "waiting") return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5l2.25 1.25" /></svg>;
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h4l1.2 1.4h5.8v6.6h-11z" /></svg>;
}

function TaskMoveIcon() {
  return <svg className="task-move-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h6.5M7.5 2.5l2 2-2 2M3 11.5h6.5M7.5 9.5l2 2-2 2" /></svg>;
}

function TaskMoveMenu({ task, targets, moveTask, moveTaskToStatus, openBelow = false }: { task: Task; targets: TaskMoveTarget[]; moveTask: (id: string, value: string, destinationLabel?: string) => void; moveTaskToStatus?: (id: string, status: TaskStatus) => void; openBelow?: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = `task-move-menu-${task.id}`;
  const hasWorkflow = Boolean(moveTaskToStatus);

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu) return;
      const currentStatus = hasWorkflow ? menu.querySelector<HTMLButtonElement>('button[role="menuitemradio"][aria-checked="true"]:not(:disabled)') : null;
      (currentStatus ?? menu.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
    });
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, hasWorkflow]);

  const directTargets = targets.filter((target) => target.kind !== "project");
  const projectTargets = targets.filter((target) => target.kind === "project");
  const statusLabel = PROJECT_STATUSES.find((status) => status.value === task.status)?.label ?? task.status;
  function choose(target: TaskMoveTarget) {
    moveTask(task.id, target.value, target.label);
    setOpen(false);
  }

  function chooseStatus(status: TaskStatus) {
    if (status === task.status) {
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
      return;
    }
    moveTaskToStatus?.(task.id, status);
    setOpen(false);
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else if (currentIndex < 0) nextIndex = event.key === "ArrowUp" ? buttons.length - 1 : 0;
    else nextIndex = event.key === "ArrowDown" ? (currentIndex + 1) % buttons.length : (currentIndex - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[nextIndex].focus();
  }

  return <div className={`task-move-control ${hasWorkflow ? "has-workflow" : ""} ${openBelow ? "open-below" : ""}`}>
    <button ref={triggerRef} className="task-move-trigger" type="button" aria-expanded={open} aria-controls={menuId} aria-haspopup="menu" aria-label={`${hasWorkflow ? "Update workflow or move" : "Move"} ${task.title}`} title={hasWorkflow ? `Manage task · ${statusLabel}` : "Move task"} onClick={() => setOpen((current) => !current)}>
      <TaskMoveIcon />
      {!hasWorkflow && <><span>Move</span><svg className="task-move-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg></>}
    </button>
    {open && <div ref={menuRef} id={menuId} className="task-move-menu" role="menu" tabIndex={-1} aria-label={`Move ${task.title}`} onKeyDown={handleMenuKeyDown}>
      {hasWorkflow && <><span className="task-move-menu-label first">Workflow</span>{PROJECT_STATUSES.map((status) => <button type="button" role="menuitemradio" aria-checked={task.status === status.value} onClick={() => chooseStatus(status.value)} key={status.value}><span className={`task-workflow-option status-${status.value}`}><i /></span><span>{status.label}</span></button>)}</>}
      {directTargets.length > 0 && <span className={`task-move-menu-label ${hasWorkflow ? "" : "first"}`}>Move to</span>}
      {directTargets.map((target) => <button type="button" role="menuitem" onClick={() => choose(target)} key={target.value}><span className="task-move-target-icon"><TaskMoveTargetIcon kind={target.kind} /></span><span>{target.label}</span></button>)}
      {projectTargets.length > 0 && <><span className="task-move-menu-label">Projects</span>{projectTargets.map((target) => <button type="button" role="menuitem" onClick={() => choose(target)} key={target.value}><span className="task-move-target-icon"><TaskMoveTargetIcon kind={target.kind} /></span><span>{target.label}</span></button>)}</>}
    </div>}
  </div>;
}

function TaskRows({ tasks, toggleTask, renameTask, updateTask, removeTask, onTaskNoteEditorChange, reorderProps, empty, emptyTitle = "Nothing waiting here.", scope, taskSort, reorderable = true, moveTaskToStatus, taskAction, taskMoveTargets, moveTask }: { tasks: Task[]; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; updateTask: UpdateTask; removeTask: RemoveTask; onTaskNoteEditorChange: TaskNoteEditorChange; reorderProps: (item: DragItem) => ReorderProps; empty: string; emptyTitle?: string; scope: string; taskSort: TaskSort; reorderable?: boolean; moveTaskToStatus?: (id: string, status: TaskStatus) => void; taskAction?: { label: string; action: (id: string) => void }; taskMoveTargets?: TaskMoveTarget[]; moveTask?: (id: string, value: string, destinationLabel?: string) => void }) {
  if (!tasks.length) return <div className="empty-state"><strong>{emptyTitle}</strong><p>{empty}</p></div>;
  const customOrder = reorderable && taskSort === "custom";
  return <div className="task-list">{sortTasks(tasks, taskSort).map((task: Task) => {
    const descriptor = { kind: "task" as const, id: task.id, scope };
    const reorder = reorderProps(descriptor);
    const reorderEvents = customOrder ? { onDragOver: (event: DragEvent<HTMLElement>) => reorder.onDragOver(event, descriptor), onDrop: (event: DragEvent<HTMLElement>) => reorder.onDrop(event, descriptor) } : {};
    return <div className={`task-row ${task.status === "done" ? "done" : ""} ${moveTaskToStatus ? "with-status" : ""} ${taskAction || taskMoveTargets ? "with-action" : ""} ${customOrder ? "custom-order" : "sorted-order"} ${task.priority ? `has-priority priority-${task.priority}` : ""}`} key={task.id} {...reorderEvents}>
      {customOrder && <DragHandle {...reorder} label={`Reorder ${task.title}`} />}
      <label className="task-check"><input type="checkbox" checked={task.status === "done"} onChange={() => toggleTask(task.id)} /><span className="sr-only">Mark {task.title} {task.status === "done" ? "incomplete" : "complete"}</span></label>
      <TaskCopy task={task} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} />
      {taskAction && <button type="button" className="task-queue-action" onClick={() => taskAction.action(task.id)}>{taskAction.label}</button>}
      {taskMoveTargets && moveTask && <TaskMoveMenu task={task} targets={taskMoveTargets} moveTask={moveTask} moveTaskToStatus={moveTaskToStatus} openBelow={Boolean(moveTaskToStatus)} />}
    </div>;
  })}</div>;
}

const ROUTINE_DAY_OPTIONS = [[1, "M"], [2, "T"], [3, "W"], [4, "T"], [5, "F"], [6, "S"], [0, "S"]] as const;

function RoutineForm({ routine, onSave, onCancel }: { routine?: Routine; onSave: (draft: RoutineDraft) => void; onCancel: () => void }) {
  const initialSchedule = routine ? routineScheduleFrom(routine) : { weekdays: [1, 2, 3, 4, 5], allDay: true };
  const [name, setName] = useState(routine?.name ?? "");
  const [expectedMinutes, setExpectedMinutes] = useState(routine?.expectedMinutes ?? 20);
  const [weekdays, setWeekdays] = useState<number[]>(initialSchedule.weekdays);
  const [allDay, setAllDay] = useState(initialSchedule.allDay);
  const [windowStart, setWindowStart] = useState(initialSchedule.windowStart ?? "09:00");
  const [windowEnd, setWindowEnd] = useState(initialSchedule.windowEnd ?? "09:30");
  const [checklist, setChecklist] = useState<RoutineChecklistItem[]>(routine?.checklist ?? []);
  const canSave = name.trim().length > 0 && weekdays.length > 0 && expectedMinutes >= 1 && expectedMinutes <= 480 && (allDay || windowStart < windowEnd);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    onSave({ name: name.trim(), expectedMinutes, weekdays: [...weekdays].sort((a, b) => a - b), allDay, ...(allDay ? {} : { windowStart, windowEnd }), checklist: checklist.filter((item) => item.text.trim()).map((item) => ({ ...item, text: item.text.trim() })) });
  }

  return <form className="routine-form" onSubmit={submit}>
    <div className="routine-form-grid"><label className="routine-field routine-name-field"><span>Name</span><input value={name} maxLength={500} onChange={(event) => setName(event.target.value)} placeholder="Morning practice" /></label><label className="routine-field"><span>Expected duration</span><span className="routine-duration-input"><input type="number" min={1} max={480} value={expectedMinutes} onChange={(event) => setExpectedMinutes(Number(event.target.value))} /><i>min</i></span></label></div>
    <fieldset className="routine-days"><legend>Scheduled days</legend><div>{ROUTINE_DAY_OPTIONS.map(([day, label]) => <button type="button" key={day} aria-pressed={weekdays.includes(day)} aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]} onClick={() => setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])}>{label}</button>)}</div>{weekdays.length === 0 && <p role="alert">Choose at least one day.</p>}</fieldset>
    <fieldset className="routine-window"><legend>Scheduled window</legend><div className="routine-window-mode"><button type="button" aria-pressed={allDay} onClick={() => setAllDay(true)}>All day</button><button type="button" aria-pressed={!allDay} onClick={() => setAllDay(false)}>Set hours</button></div>{!allDay && <div className="routine-time-fields"><label><span>Opens</span><input type="time" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} /></label><span aria-hidden="true">to</span><label><span>Closes</span><input type="time" value={windowEnd} min={windowStart} onChange={(event) => setWindowEnd(event.target.value)} /></label></div>}{!allDay && windowStart >= windowEnd && <p role="alert">Closing time must be later the same day.</p>}</fieldset>
    <fieldset className="routine-checklist-editor"><legend>Checklist <span>optional</span></legend><div>{checklist.map((item, index) => <div className="routine-checklist-edit-row" key={item.id}><span aria-hidden="true" /><input value={item.text} maxLength={500} aria-label={`Checklist item ${index + 1}`} onChange={(event) => setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry))} placeholder="A short practice step" /><button type="button" onClick={() => setChecklist((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Remove checklist item ${index + 1}`}><DeleteIcon /></button></div>)}</div>{checklist.length < 20 && <button type="button" className="routine-add-step" onClick={() => setChecklist((current) => [...current, { id: makeId("routine-step"), text: "" }])}>+ Add checklist item</button>}</fieldset>
    <div className="routine-form-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit" disabled={!canSave}>{routine ? "Save routine" : "Create routine"}</button></div>
  </form>;
}

function routineStatusLabel(status: RoutineStatus) {
  return status === "completed" ? "Completed" : status.charAt(0).toUpperCase() + status.slice(1);
}

type RoutineCardActions = { setRoutineSessionStatus: (routineId: string, status: "completed" | "skipped") => void; toggleRoutineChecklist: (routineId: string, checklistId: string) => void };

function RoutineCard({ routine, now, actions, management }: { routine: Routine; now: Date; actions: RoutineCardActions; management?: { updateRoutine: (routineId: string, draft: RoutineDraft) => void; removeRoutine: (routineId: string) => void; toggleRoutinePause: (routineId: string) => void; addRoutineVacation: (routineId: string, startsOn: string, endsOn: string) => void; removeRoutineVacation: (routineId: string, suspensionId: string) => void } }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [vacationOpen, setVacationOpen] = useState(false);
  const today = routineDateKey(now);
  const [vacationStart, setVacationStart] = useState(today);
  const [vacationEnd, setVacationEnd] = useState(today);
  const session = currentRoutineSession(routine, now) as RoutineSession | null;
  const consistency = routineConsistency(routine);
  const paused = routine.suspensions.some((item) => item.kind === "pause" && !item.endsOn);
  const onVacation = !paused && isRoutineSuspended(routine, today);
  const state = paused ? "Paused" : onVacation ? "On vacation" : session ? routineStatusLabel(session.status) : "Not active now";
  const checklist = session?.checklist ?? routine.checklist.map((item) => ({ ...item, checked: false }));
  const history = [...routine.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const vacations = routine.suspensions.filter((item) => item.kind === "vacation" && (item.endsOn ?? item.startsOn) >= today);
  return <article className={`routine-card ${session ? "active-window" : ""} status-${session?.status ?? "idle"}`}>
    <div className="routine-card-main"><div className="routine-card-heading"><div><h3>{routine.name}</h3><p>{routineScheduleLabel(routine)} <span>·</span> {routine.expectedMinutes} min</p>{routine.pendingSchedule && <small>New schedule begins {routine.pendingSchedule.effectiveOn}</small>}</div><span className={`routine-state state-${session?.status ?? (paused || onVacation ? "suspended" : "idle")}`}><i />{state}</span></div>
    {checklist.length > 0 && <div className="routine-checklist" aria-label={`Checklist for ${routine.name}`}>{checklist.map((item) => session ? <label key={item.id}><input type="checkbox" checked={item.checked} onChange={() => actions.toggleRoutineChecklist(routine.id, item.id)} /><span>{item.text}</span></label> : <div key={item.id}><i aria-hidden="true" /><span>{item.text}</span></div>)}</div>}
    <div className="routine-card-foot"><span className="routine-consistency">{consistency.total ? <><strong>{consistency.completed} of {consistency.total}</strong> recent sessions</> : "No sessions yet"}</span><div className="routine-primary-actions">{session && <><button type="button" className="routine-complete" aria-pressed={session.status === "completed"} onClick={() => actions.setRoutineSessionStatus(routine.id, "completed")}>{session.status === "completed" ? "Completed" : "Complete"}</button><button type="button" aria-pressed={session.status === "skipped"} onClick={() => actions.setRoutineSessionStatus(routine.id, "skipped")}>{session.status === "skipped" ? "Skipped" : "Skip"}</button></>}<button type="button" aria-expanded={reviewOpen} onClick={() => setReviewOpen((open) => !open)}>{reviewOpen ? "Close review" : "Open review"}</button></div></div>
    {management && <div className="routine-management"><button type="button" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>{editing ? "Close editor" : "Edit"}</button><button type="button" onClick={() => management.toggleRoutinePause(routine.id)}>{paused ? "Resume" : "Pause"}</button><button type="button" aria-expanded={vacationOpen} onClick={() => setVacationOpen((open) => !open)}>Vacation</button><button type="button" className="routine-delete" onClick={() => management.removeRoutine(routine.id)}>Delete</button></div>}</div>
    {reviewOpen && <section className="routine-review" aria-label={`Recent sessions for ${routine.name}`}><div><h4>Recent sessions</h4><span>{consistency.total ? `${consistency.completed}/${consistency.total} complete` : "No history"}</span></div>{history.length ? <ol>{history.map((item) => { const checked = item.checklist.filter((step) => step.checked).length; return <li key={item.date}><time dateTime={item.date}>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${item.date}T00:00:00Z`))}</time><span className={`history-status status-${item.status}`}>{routineStatusLabel(item.status)}</span><small>{item.checklist.length ? `${checked}/${item.checklist.length} steps` : "No checklist"}</small></li>; })}</ol> : <p>No scheduled sessions have closed yet.</p>}</section>}
    {management && vacationOpen && <section className="routine-vacation-panel"><form onSubmit={(event) => { event.preventDefault(); if (vacationEnd < vacationStart) return; management.addRoutineVacation(routine.id, vacationStart, vacationEnd); setVacationOpen(false); }}><label><span>Vacation starts</span><input type="date" min={today} value={vacationStart} onChange={(event) => { setVacationStart(event.target.value); if (vacationEnd < event.target.value) setVacationEnd(event.target.value); }} /></label><label><span>Vacation ends</span><input type="date" min={vacationStart} value={vacationEnd} onChange={(event) => setVacationEnd(event.target.value)} /></label><button disabled={vacationEnd < vacationStart}>Save vacation</button></form>{vacations.length > 0 && <ul>{vacations.map((item) => <li key={item.id}><span>{item.startsOn === item.endsOn ? item.startsOn : `${item.startsOn} – ${item.endsOn}`}</span><button type="button" onClick={() => management.removeRoutineVacation(routine.id, item.id)}>Remove</button></li>)}</ul>}</section>}
    {management && editing && <RoutineForm routine={routine} onCancel={() => setEditing(false)} onSave={(draft) => { management.updateRoutine(routine.id, draft); setEditing(false); }} />}
  </article>;
}

function RoutinesSection({ area, routines, now, addRoutine, updateRoutine, removeRoutine, setRoutineSessionStatus, toggleRoutineChecklist, toggleRoutinePause, addRoutineVacation, removeRoutineVacation }: { area: Area; routines: Routine[]; now: Date; addRoutine: (areaId: string, draft: RoutineDraft) => void; updateRoutine: (routineId: string, draft: RoutineDraft) => void; removeRoutine: (routineId: string) => void; setRoutineSessionStatus: RoutineCardActions["setRoutineSessionStatus"]; toggleRoutineChecklist: RoutineCardActions["toggleRoutineChecklist"]; toggleRoutinePause: (routineId: string) => void; addRoutineVacation: (routineId: string, startsOn: string, endsOn: string) => void; removeRoutineVacation: (routineId: string, suspensionId: string) => void }) {
  const [creating, setCreating] = useState(false);
  const management = { updateRoutine, removeRoutine, toggleRoutinePause, addRoutineVacation, removeRoutineVacation };
  const actions = { setRoutineSessionStatus, toggleRoutineChecklist };
  return <section className="routine-section"><div className="section-title"><div><h2>Routines <small>{routines.length} active</small></h2><p className="section-note">Repeating practices create check-ins, never an overdue queue.</p></div><button type="button" className={`project-add-button ${creating ? "active" : ""}`} aria-label={creating ? "Close new routine form" : "New routine"} aria-expanded={creating} onClick={() => setCreating((open) => !open)}><PlusIcon /></button></div>{creating && <RoutineForm onCancel={() => setCreating(false)} onSave={(draft) => { addRoutine(area.id, draft); setCreating(false); }} />}{routines.length ? <div className="routine-list">{routines.map((routine) => <RoutineCard key={routine.id} routine={routine} now={now} actions={actions} management={management} />)}</div> : !creating && <div className="empty-state"><strong>No routines yet.</strong><p>Add a repeating practice when consistency matters more than a finish line.</p></div>}</section>;
}

function Today({ workspace, inboxTasks, toggleTask, renameTask, updateTask, removeTask, onTaskNoteEditorChange, navigate, reorderProps, setCurrentArea, toggleFocusTask, routineNow, setRoutineSessionStatus, toggleRoutineChecklist }: { workspace: Workspace; inboxTasks: Task[]; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; updateTask: UpdateTask; removeTask: RemoveTask; onTaskNoteEditorChange: TaskNoteEditorChange; navigate: (next: Selection) => void; reorderProps: (item: DragItem) => ReorderProps; setCurrentArea: (id: string) => void; toggleFocusTask: (id: string) => void; routineNow: Date; setRoutineSessionStatus: RoutineCardActions["setRoutineSessionStatus"]; toggleRoutineChecklist: RoutineCardActions["toggleRoutineChecklist"] }) {
  const currentArea = workspace.areas.find((area) => area.id === workspace.currentAreaId) ?? workspace.areas[0];
  const eligibleTasks = workspace.tasks.filter((task) => task.areaId === currentArea?.id && task.status !== "done" && !task.someday && !task.waiting);
  const focusedTasks = workspace.focusTaskIds.map((id) => eligibleTasks.find((task) => task.id === id)).filter(Boolean) as Task[];
  const [choosingFocus, setChoosingFocus] = useState(focusedTasks.length === 0);
  const now = routineNow;
  const activeRoutines = workspace.routines.filter((routine) => routine.areaId === currentArea?.id && currentRoutineSession(routine, now));
  const dayName = new Intl.DateTimeFormat("en-US", { timeZone: PROJECT_TIME_ZONE, weekday: "long" }).format(now);
  const calendarDate = new Intl.DateTimeFormat("en-US", { timeZone: PROJECT_TIME_ZONE, month: "long", day: "numeric" }).format(now);
  return <div className="page today-page">
    <div className="page-heading"><div><h1>Choose what deserves today.</h1><p>A short field of meaningful work, with space left for reality.</p></div><div className="date"><span>{dayName}</span><strong>{calendarDate}</strong></div></div>
    <section className="current-area-picker" aria-labelledby="current-area-title"><div className="current-area-heading"><h2 id="current-area-title">Current area</h2><p>Select an area to focus today.</p></div><div className="area-choices">{workspace.areas.map((area) => {
      const isCurrent = area.id === currentArea?.id;
      return <div className={`area-choice ${isCurrent ? "current" : ""}`} key={area.id}>
        <button className="area-choice-main" aria-pressed={isCurrent} onClick={() => setCurrentArea(area.id)}>
          <span className="area-choice-icon"><AreaIcon icon={area.icon} /></span>
          <strong>{area.name}</strong>
        </button>
        {isCurrent && <button className="area-choice-open" onClick={() => navigate({ kind: "area", id: area.id })} aria-label={`Open ${area.name}`} title={`Open ${area.name}`}><OpenAreaIcon /></button>}
      </div>;
    })}</div></section>
    <div className="today-grid">
      {activeRoutines.length > 0 && <section className="today-routines"><div className="section-title"><div><h2>Routines</h2><p className="section-note">Scheduled practices are tracked separately from consequential focus work.</p></div><span className="routine-due-count">{activeRoutines.length} open</span></div><div className="routine-list">{activeRoutines.map((routine) => <RoutineCard key={routine.id} routine={routine} now={now} actions={{ setRoutineSessionStatus, toggleRoutineChecklist }} />)}</div></section>}
      <section className="work-queue"><div className="section-title"><div><h2>Focus three</h2><p className="section-note">Choose up to three actions in {currentArea?.name ?? "this area"} with the strongest consequence or feedback.</p></div><div className="section-actions"><span>{focusedTasks.length}/3</span><button type="button" className="focus-choose-button" aria-expanded={choosingFocus} onClick={() => setChoosingFocus((open) => !open)}>{choosingFocus ? "Done" : "Choose focus"}</button></div></div>
      {choosingFocus && <div className="focus-chooser" aria-label={`Choose focus tasks from ${currentArea?.name ?? "the current area"}`}><div className="focus-chooser-heading"><strong>Open queue</strong><span>{eligibleTasks.length} available</span></div>{eligibleTasks.length ? <div className="focus-candidates">{eligibleTasks.map((task) => {
        const selected = workspace.focusTaskIds.includes(task.id);
        const project = workspace.projects.find((item) => item.id === task.projectId);
        return <button type="button" className={`focus-candidate ${selected ? "selected" : ""}`} aria-pressed={selected} disabled={!selected && focusedTasks.length >= 3} onClick={() => toggleFocusTask(task.id)} key={task.id}><span className="focus-candidate-check" aria-hidden="true">{selected && <ConfirmIcon />}</span><span><strong>{task.title}</strong><small>{project?.name ?? `${currentArea?.name ?? "Area"} task`}{task.priority ? ` · ${task.priority} priority` : ""}</small></span></button>;
      })}</div> : <div className="focus-chooser-empty">No open tasks are waiting in this area.</div>}</div>}
      <TaskRows tasks={focusedTasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} reorderProps={reorderProps} scope={`focus:${currentArea?.id ?? ""}`} taskSort="custom" reorderable={false} empty="Choose an open task from this area, or intentionally leave the space open." emptyTitle="Your focus is open." /><p className="principle-note"><strong>Process over prediction.</strong> Judge the day by the practice, not the outcome.</p></section>
    </div>
    {inboxTasks.length > 0 && <button className="inbox-callout" onClick={() => navigate({ kind: "inbox" })}><span><strong>{inboxTasks.length} items need a home</strong><small>Process your inbox while context is fresh.</small></span><span>Open inbox</span></button>}
  </div>;
}

function Inbox({ workspace, tasks, toggleTask, renameTask, updateTask, removeTask, onTaskNoteEditorChange, moveTask, reorderProps, taskSort, setTaskSort }: { workspace: Workspace; tasks: Task[]; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; updateTask: UpdateTask; removeTask: RemoveTask; onTaskNoteEditorChange: TaskNoteEditorChange; moveTask: (id: string, value: string) => void; reorderProps: (item: DragItem) => ReorderProps; taskSort: TaskSort; setTaskSort: (sort: TaskSort) => void }) {
  const customOrder = taskSort === "custom";
  const orderedTasks = sortTasks(tasks, taskSort) as Task[];
  return <div className="page"><div className="page-heading"><div><h1>Inbox</h1><p>Capture first. Give each item a proper home when you are ready.</p></div><div className="quiet-count">{tasks.length}<span>unprocessed</span></div></div>
    <section className="inbox-workspace"><div className="section-title inbox-title"><h2>Unprocessed tasks</h2><TaskSortControl value={taskSort} onChange={setTaskSort} /></div>{orderedTasks.length ? orderedTasks.map((task) => {
      const descriptor = { kind: "task" as const, id: task.id, scope: "inbox" };
      const reorder = reorderProps(descriptor);
      const reorderEvents = customOrder ? { onDragOver: (event: DragEvent<HTMLElement>) => reorder.onDragOver(event, descriptor), onDrop: (event: DragEvent<HTMLElement>) => reorder.onDrop(event, descriptor) } : {};
      return <div className={`inbox-row ${task.status === "done" ? "done" : ""} ${customOrder ? "custom-order" : "sorted-order"} ${task.priority ? `has-priority priority-${task.priority}` : ""}`} key={task.id} {...reorderEvents}>{customOrder && <DragHandle {...reorder} label={`Reorder ${task.title}`} />}<label className="task-check"><input type="checkbox" checked={task.status === "done"} onChange={() => toggleTask(task.id)} /><span className="sr-only">Complete {task.title}</span></label><TaskCopy task={task} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} /><select className="move-task" defaultValue="inbox" onChange={(event) => moveTask(task.id, event.target.value)} aria-label={`Move ${task.title}`}><option value="inbox">Move to…</option>{workspace.areas.map((area) => <optgroup label={area.name} key={area.id}><option value={`area:${area.id}`}>{area.name} · no project</option>{workspace.projects.filter((project) => project.areaId === area.id).map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}</optgroup>)}</select></div>;
    }) : <div className="empty-state spacious"><strong>Your inbox is clear.</strong><p>New tasks added outside an area or project will land here.</p></div>}</section>
  </div>;
}

function AreaTaskQueue({ label, description, tasks, area, projects, addTask, toggleTask, renameTask, updateTask, removeTask, onTaskNoteEditorChange, reorderProps, scope, taskSort, setTaskSort, empty, otherQueue, moveTask }: { label: "Backlog" | "Waiting"; description: string; tasks: Task[]; area: Area; projects: Project[]; addTask: (areaId: string, title: string) => void; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; updateTask: UpdateTask; removeTask: RemoveTask; onTaskNoteEditorChange: TaskNoteEditorChange; reorderProps: (item: DragItem) => ReorderProps; scope: string; taskSort: TaskSort; setTaskSort: (sort: TaskSort) => void; empty: string; otherQueue: TaskMoveTarget; moveTask: (id: string, value: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState("");
  const actionLabel = showForm ? `Close new ${label.toLowerCase()} task form` : `Add a task to ${label}`;
  return <section className="loose-tasks deferred-tasks"><div className="section-title"><div><h2>{label}</h2><p className="section-note">{description}</p></div><div className="section-header-actions"><TaskSortControl value={taskSort} onChange={setTaskSort} /><button type="button" className={`project-add-button ${showForm ? "active" : ""}`} onClick={() => setShowForm((current) => !current)} aria-label={actionLabel} title={actionLabel} aria-expanded={showForm}><PlusIcon /></button></div></div>
    {showForm && <form className="deferred-task-create" onSubmit={(event) => { event.preventDefault(); const title = newTask.trim(); if (!title) return; addTask(area.id, title); setNewTask(""); setShowForm(false); }}><input value={newTask} maxLength={2_000} onChange={(event) => setNewTask(event.target.value)} placeholder={`${label} task`} aria-label={`New ${label.toLowerCase()} task in ${area.name}`} /><button disabled={!newTask.trim()}>Add task</button></form>}
    <TaskRows tasks={tasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} reorderProps={reorderProps} scope={scope} taskSort={taskSort} empty={empty} taskMoveTargets={[{ value: `area:${area.id}`, label: "Today’s focus", kind: "focus" }, otherQueue, ...projects.map((project) => ({ value: `project:${project.id}`, label: project.name, kind: "project" as const }))]} moveTask={moveTask} /></section>;
}

function AreaView({ area, projects, tasks, routines, showProjectForm, setShowProjectForm, newProject, setNewProject, addProject, addAreaTask, addBacklogTask, addWaitingTask, addRoutine, updateRoutine, removeRoutine, setRoutineSessionStatus, toggleRoutineChecklist, toggleRoutinePause, addRoutineVacation, removeRoutineVacation, routineNow, navigate, toggleTask, updateArea, renameProject, renameTask, updateTask, removeTask, onTaskNoteEditorChange, moveTask, reorderProps, focusSort, setFocusSort, backlogSort, setBacklogSort, waitingSort, setWaitingSort, removeArea }: { area: Area; projects: Project[]; tasks: Task[]; routines: Routine[]; showProjectForm: boolean; setShowProjectForm: (value: boolean) => void; newProject: string; setNewProject: (value: string) => void; addProject: (event: FormEvent) => void; addAreaTask: (areaId: string, title: string) => void; addBacklogTask: (areaId: string, title: string) => void; addWaitingTask: (areaId: string, title: string) => void; addRoutine: (areaId: string, draft: RoutineDraft) => void; updateRoutine: (routineId: string, draft: RoutineDraft) => void; removeRoutine: (routineId: string) => void; setRoutineSessionStatus: RoutineCardActions["setRoutineSessionStatus"]; toggleRoutineChecklist: RoutineCardActions["toggleRoutineChecklist"]; toggleRoutinePause: (routineId: string) => void; addRoutineVacation: (routineId: string, startsOn: string, endsOn: string) => void; removeRoutineVacation: (routineId: string, suspensionId: string) => void; routineNow: Date; navigate: (next: Selection) => void; toggleTask: (id: string) => void; updateArea: (id: string, patch: Partial<Pick<Area, "name" | "icon">>) => void; renameProject: (id: string, value: string) => void; renameTask: (id: string, value: string) => void; updateTask: UpdateTask; removeTask: RemoveTask; onTaskNoteEditorChange: TaskNoteEditorChange; moveTask: (id: string, value: string) => void; reorderProps: (item: DragItem) => ReorderProps; focusSort: TaskSort; setFocusSort: (sort: TaskSort) => void; backlogSort: TaskSort; setBacklogSort: (sort: TaskSort) => void; waitingSort: TaskSort; setWaitingSort: (sort: TaskSort) => void; removeArea: (id: string) => void }) {
  const looseTasks = tasks.filter((task) => !task.projectId && !task.someday && !task.waiting);
  const backlogTasks = tasks.filter((task) => !task.projectId && task.someday && !task.waiting);
  const waitingTasks = tasks.filter((task) => !task.projectId && task.waiting);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const [showFocusForm, setShowFocusForm] = useState(false);
  const [newFocusTask, setNewFocusTask] = useState("");
  const [projectSort, setProjectSort] = useState<ProjectSort>("custom");
  const orderedProjects = projectSort === "alphabetical" ? [...projects].sort((a, b) => nameCollator.compare(a.name, b.name)) : projects;
  const toggleProject = (projectId: string) => setExpandedProjects((current) => {
    const next = new Set(current);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    return next;
  });
  return <div className="page"><div className="breadcrumb">Area</div><div className="page-heading area-page-heading"><div><AreaEditor key={area.id} area={area} onSave={(patch) => updateArea(area.id, patch)} /></div></div>
    <section className="loose-tasks focus-tasks"><div className="section-title"><div><h2>Today’s focus</h2><p className="section-note">Standalone tasks you intend to act on today.</p></div><div className="section-header-actions"><TaskSortControl value={focusSort} onChange={setFocusSort} /><button type="button" className={`project-add-button ${showFocusForm ? "active" : ""}`} onClick={() => setShowFocusForm(!showFocusForm)} aria-label={showFocusForm ? "Close new focus task form" : "Add a task to today’s focus"} title={showFocusForm ? "Close new focus task form" : "Add a task to today’s focus"} aria-expanded={showFocusForm}><PlusIcon /></button></div></div>
    {showFocusForm && <form className="focus-task-create" onSubmit={(event) => { event.preventDefault(); const title = newFocusTask.trim(); if (!title) return; addAreaTask(area.id, title); setNewFocusTask(""); setShowFocusForm(false); }}><input value={newFocusTask} maxLength={2_000} onChange={(event) => setNewFocusTask(event.target.value)} placeholder="Task for today" aria-label={`New task for today in ${area.name}`} /><button disabled={!newFocusTask.trim()}>Add task</button></form>}
    <TaskRows tasks={looseTasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} reorderProps={reorderProps} scope={`area:${area.id}`} taskSort={focusSort} emptyTitle="No tasks in focus today." empty={`Add one when something in ${area.name} deserves your attention today.`} taskAction={{ label: "Backlog", action: (id) => updateTask(id, { someday: true, waiting: undefined }) }} /></section>
    <RoutinesSection area={area} routines={routines} now={routineNow} addRoutine={addRoutine} updateRoutine={updateRoutine} removeRoutine={removeRoutine} setRoutineSessionStatus={setRoutineSessionStatus} toggleRoutineChecklist={toggleRoutineChecklist} toggleRoutinePause={toggleRoutinePause} addRoutineVacation={addRoutineVacation} removeRoutineVacation={removeRoutineVacation} />
    <section className="project-section"><div className="section-title project-section-title"><h2>Projects <small>{projects.length} active</small></h2><div className="section-header-actions"><ProjectSortControl value={projectSort} onChange={setProjectSort} /><button type="button" className={`project-add-button ${showProjectForm ? "active" : ""}`} onClick={() => setShowProjectForm(!showProjectForm)} aria-label={showProjectForm ? "Close new project form" : "New project"} title={showProjectForm ? "Close new project form" : "New project"} aria-expanded={showProjectForm}><PlusIcon /></button></div></div>
    {showProjectForm && <form className="inline-create" onSubmit={addProject}><div><strong>Create a project in {area.name}</strong><span>Name a concrete body of work, not an ongoing responsibility.</span></div><input value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="Project name" aria-label="Project name" /><button disabled={!newProject.trim()}>Create project</button></form>}
    {orderedProjects.length ? <div className="project-list">{orderedProjects.map((project) => {
      const descriptor = { kind: "project" as const, id: project.id, scope: area.id };
      const reorder = reorderProps(descriptor);
      const openProject = () => navigate({ kind: "project", id: project.id });
      const projectTasks = tasks.filter((task) => task.projectId === project.id && task.status !== "done");
      const doingTasks = projectTasks.filter((task) => task.status === "doing");
      const todoTasks = projectTasks.filter((task) => task.status === "todo");
      const orderedProjectTasks = [...doingTasks, ...todoTasks];
      const isExpanded = expandedProjects.has(project.id);
      const taskListId = `project-tasks-${project.id}`;
      return <div className={`project-summary ${isExpanded ? "expanded" : ""} ${projectSort === "custom" ? "custom-order" : "sorted-order"}`} key={project.id}>
        <div className={`entity-row project-entity ${projectSort === "custom" ? "custom-order" : "sorted-order"}`} role="link" tabIndex={0} aria-label={`Open ${project.name}`} onClick={(event) => { if (!(event.target as HTMLElement).closest("button, input, textarea, select, a")) openProject(); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openProject(); } }} {...(projectSort === "custom" ? { onDragOver: (event: DragEvent<HTMLElement>) => reorder.onDragOver(event, descriptor), onDrop: (event: DragEvent<HTMLElement>) => reorder.onDrop(event, descriptor) } : {})}>{projectSort === "custom" && <DragHandle {...reorder} label={`Reorder ${project.name}`} />}<div className="entity-copy"><NameEditor value={project.name} onSave={(value) => renameProject(project.id, value)} label={`Project name for ${project.name}`} /><small>{project.outcome}</small></div><span className="project-task-counts" aria-label={`${doingTasks.length} doing, ${todoTasks.length} todo`}><strong>{doingTasks.length} active</strong><i aria-hidden="true">·</i><span>{todoTasks.length} todo</span></span><button type="button" className="project-disclosure" aria-expanded={isExpanded} aria-controls={taskListId} onClick={() => toggleProject(project.id)} aria-label={`${isExpanded ? "Collapse" : "Expand"} tasks for ${project.name}`} title={`${isExpanded ? "Collapse" : "Expand"} tasks`}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8" /></svg></button></div>
        {isExpanded && <div className="project-task-preview" id={taskListId}>{orderedProjectTasks.length ? orderedProjectTasks.map((task) => <div className="project-task-preview-row" key={task.id}><span className={`project-task-status status-${task.status}`}>{task.status === "doing" ? "Doing" : "Todo"}</span><span className="project-task-title">{task.title}</span><button type="button" aria-label={`Move ${task.title} to area tasks`} onClick={() => moveTask(task.id, `area:${area.id}`)}><span>Move to area</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.5 8H3.5m3-3-3 3 3 3" /></svg></button></div>) : <p>No open tasks in this project.</p>}</div>}
      </div>;
    })}</div> : <div className="empty-state"><strong>No projects yet.</strong><p>Create one when this area has a finite outcome to move.</p></div>}</section>
    <AreaTaskQueue label="Backlog" description="Committed work that matters, but is not prioritized yet." tasks={backlogTasks} area={area} projects={projects} addTask={addBacklogTask} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} reorderProps={reorderProps} scope={`backlog:${area.id}`} taskSort={backlogSort} setTaskSort={setBacklogSort} empty="Move a task here when it needs to be done, but not now." otherQueue={{ value: `waiting:${area.id}`, label: "Waiting", kind: "waiting" }} moveTask={moveTask} />
    <AreaTaskQueue label="Waiting" description="Tasks blocked on a person, response, event, or other dependency." tasks={waitingTasks} area={area} projects={projects} addTask={addWaitingTask} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} reorderProps={reorderProps} scope={`waiting:${area.id}`} taskSort={waitingSort} setTaskSort={setWaitingSort} empty="Move a task here when the next step depends on someone or something else." otherQueue={{ value: `backlog:${area.id}`, label: "Backlog", kind: "backlog" }} moveTask={moveTask} />
    <div className="danger-zone"><div><strong>Remove this area</strong><p>This also removes its synced routines, projects, tasks, and all attached history.</p></div><button onClick={() => removeArea(area.id)}>Remove area</button></div>
  </div>;
}

function ProjectNoteCard({ note, updateNote, removeNote, onEditorChange }: { note: ProjectNote; updateNote: (noteId: string, patch: Partial<Pick<ProjectNote, "title" | "body" | "pinned">>) => void; removeNote: (noteId: string) => void; onEditorChange: (noteId: string, open: boolean) => void }) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) return;
    onEditorChange(note.id, true);
    return () => onEditorChange(note.id, false);
  }, [editing, note.id, onEditorChange]);

  function finishEditing() {
    setEditing(false);
  }

  return <article className={`project-note-card ${note.pinned ? "pinned" : ""} ${editing ? "editing" : ""}`}>
    <div className="project-note-actions">
      <button type="button" className="note-icon-button note-pin-button" aria-label={`${note.pinned ? "Unpin" : "Pin"} note${note.title ? ` ${note.title}` : ""}`} title={note.pinned ? "Unpin note" : "Pin note"} aria-pressed={note.pinned} onClick={() => updateNote(note.id, { pinned: !note.pinned })}><PinIcon /></button>
      <button type="button" className="note-icon-button note-delete-button" aria-label={`Delete note${note.title ? ` ${note.title}` : ""}`} title="Delete note" onClick={() => removeNote(note.id)}><DeleteIcon /></button>
    </div>
    {editing ? <div className="project-note-editor">
      <input value={note.title} maxLength={500} onChange={(event) => updateNote(note.id, { title: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); finishEditing(); } }} placeholder="Title" aria-label="Note title" />
      <textarea value={note.body} maxLength={20_000} onChange={(event) => updateNote(note.id, { body: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); finishEditing(); } }} placeholder="Write a note…" aria-label="Note body" />
      <div className="project-note-editor-foot"><span>Autosaves</span><button type="button" onClick={finishEditing}>Done</button></div>
    </div> : <button type="button" className="project-note-open" onClick={() => setEditing(true)} aria-label={`Edit note${note.title ? ` ${note.title}` : ""}`}>
      {note.title && <strong>{note.title}</strong>}
      {note.body ? <p>{note.body}</p> : <p className="note-empty-body">Add details…</p>}
    </button>}
  </article>;
}

function ProjectNotes({ project, addNote, updateNote, removeNote, onEditorChange }: { project: Project; addNote: (title: string, body: string) => void; updateNote: (noteId: string, patch: Partial<Pick<ProjectNote, "title" | "body" | "pinned">>) => void; removeNote: (noteId: string) => void; onEditorChange: (noteId: string, open: boolean) => void }) {
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const notes = sortProjectNotes(project.notes) as ProjectNote[];
  const canCreate = Boolean(title.trim() || body.trim());

  function cancelComposer() {
    setComposing(false);
    setTitle("");
    setBody("");
  }

  function closeComposer() {
    setComposing(false);
  }

  function createNote(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    addNote(title, body);
    cancelComposer();
  }

  return <section className="project-notes" aria-labelledby={`project-notes-${project.id}`}>
    <div className="section-title project-notes-heading"><div><h2 id={`project-notes-${project.id}`}>Notes</h2><p className="section-note">Keep decisions, references, observations, and useful context close to the work.</p></div><div className="project-notes-meta"><span>{notes.length} {notes.length === 1 ? "note" : "notes"}</span><button type="button" className={`project-add-button project-note-add-button ${composing ? "active" : ""}`} onClick={() => composing ? closeComposer() : setComposing(true)} aria-label={composing ? "Close new note form" : "Add a note"} title={composing ? "Close new note form" : "Add a note"} aria-expanded={composing}><PlusIcon /></button></div></div>
    {composing ? <form className="project-note-composer expanded" onSubmit={createNote}>
      <input value={title} maxLength={500} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelComposer(); } }} placeholder="Title" aria-label="New note title" />
      <textarea value={body} maxLength={20_000} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelComposer(); } }} placeholder="Write a note…" aria-label="New note body" />
      <div className="project-note-composer-actions"><button type="button" className="note-cancel-button" onClick={cancelComposer}>Cancel</button><button type="submit" className="note-create-button" disabled={!canCreate}>Create note</button></div>
    </form> : null}
    {notes.length ? <div className="notes-board">{notes.map((note) => <ProjectNoteCard key={note.id} note={note} updateNote={updateNote} removeNote={removeNote} onEditorChange={onEditorChange} />)}</div> : <div className="empty-state project-notes-empty"><strong>No notes yet.</strong><p>Add the first decision, observation, or reference for this project.</p></div>}
  </section>;
}

function ProjectStatusHeading({ group, headingClass, headingId, addingStatus, toggleStatusComposer }: { group: { value: TaskStatus; label: string; tasks: Task[] }; headingClass: string; headingId: string; addingStatus: TaskStatus | null; toggleStatusComposer: (status: TaskStatus) => void }) {
  const adding = addingStatus === group.value;
  return <div className={headingClass}><h3 id={headingId}>{group.label}</h3><div className="task-group-actions"><span>{group.tasks.length}</span><button type="button" className={`task-group-add-button ${adding ? "active" : ""}`} onClick={() => toggleStatusComposer(group.value)} aria-label={adding ? `Close new task form for ${group.label}` : `Add task to ${group.label}`} title={adding ? "Close" : `Add task to ${group.label}`} aria-expanded={adding}><PlusIcon /></button></div></div>;
}

function ProjectView({ project, area, tasks, toggleTask, renameProject, renameTask, updateTask, removeTask, addProjectTask, onTaskNoteEditorChange, reorderProps, taskSort, setTaskSort, updateProject, addProjectNote, updateProjectNote, removeProjectNote, onProjectNoteEditorChange, removeProject, view, setView, dragged, moveTaskToStatus, moveTask, setDragged, navigate }: { project: Project; area: Area; tasks: Task[]; toggleTask: (id: string) => void; renameProject: (id: string, value: string) => void; renameTask: (id: string, value: string) => void; updateTask: UpdateTask; removeTask: RemoveTask; addProjectTask: AddProjectTask; onTaskNoteEditorChange: TaskNoteEditorChange; reorderProps: (item: DragItem) => ReorderProps; taskSort: TaskSort; setTaskSort: (sort: TaskSort) => void; updateProject: (patch: Partial<Project>) => void; addProjectNote: (title: string, body: string) => void; updateProjectNote: (noteId: string, patch: Partial<Pick<ProjectNote, "title" | "body" | "pinned">>) => void; removeProjectNote: (noteId: string) => void; onProjectNoteEditorChange: (noteId: string, open: boolean) => void; removeProject: (id: string) => void; view: ProjectViewMode; setView: (view: ProjectViewMode) => void; dragged: DragItem | null; moveTaskToStatus: (id: string, status: TaskStatus, expectedProjectId?: string, targetId?: string) => void; moveTask: (id: string, value: string, destinationLabel?: string) => void; setDragged: (item: DragItem | null) => void; navigate: (selection: Selection) => void }) {
  const activeTaskGroups = PROJECT_STATUSES.filter((status) => status.value !== "done").map((status) => ({ ...status, tasks: tasks.filter((task) => task.status === status.value) }));
  const completedTasks = tasks.filter((task) => task.status === "done");
  const [showCompleted, setShowCompleted] = useState(false);
  const [addingStatus, setAddingStatus] = useState<TaskStatus | null>(null);
  const [newStatusTask, setNewStatusTask] = useState("");
  const moveTargets: TaskMoveTarget[] = [
    { value: `area:${area.id}`, label: "Today’s work", kind: "focus" },
    { value: `backlog:${area.id}`, label: "Backlog", kind: "backlog" },
    { value: `waiting:${area.id}`, label: "Waiting", kind: "waiting" },
  ];

  function toggleStatusComposer(status: TaskStatus) {
    setNewStatusTask("");
    setAddingStatus((current) => current === status ? null : status);
  }

  function submitStatusTask(event: FormEvent, status: TaskStatus) {
    event.preventDefault();
    const title = newStatusTask.trim();
    if (!title) return;
    addProjectTask(project.id, area.id, status, title);
    setNewStatusTask("");
    setAddingStatus(null);
  }

  function statusComposer(status: TaskStatus, label: string) {
    if (addingStatus !== status) return null;
    return <form className="task-group-create" onSubmit={(event) => submitStatusTask(event, status)}>
      <input value={newStatusTask} maxLength={500} onChange={(event) => setNewStatusTask(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setNewStatusTask(""); setAddingStatus(null); } }} placeholder={`Add to ${label}`} aria-label={`New task in ${label}`} />
      <button disabled={!newStatusTask.trim()}>Add task</button>
    </form>;
  }

  function dropInStatus(event: DragEvent<HTMLElement>, status: TaskStatus, targetId?: string) {
    if (dragged?.kind !== "task") return;
    event.preventDefault();
    event.stopPropagation();
    moveTaskToStatus(dragged.id, status, project.id, taskSort === "custom" ? targetId : undefined);
    setDragged(null);
  }

  return <div className="page project-page"><nav className="breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => navigate({ kind: "today" })}>Today</button><span aria-hidden="true">/</span><button type="button" onClick={() => navigate({ kind: "area", id: area.id })}>{area.name}</button><span aria-hidden="true">/</span><span aria-current="page">{project.name}</span></nav><div className="page-heading project-heading"><div><NameEditor large value={project.name} onSave={(value) => renameProject(project.id, value)} label={`Project name for ${project.name}`} /><textarea className="outcome-editor" value={project.outcome} onChange={(event) => updateProject({ outcome: event.target.value })} aria-label="Project outcome" /></div><div className="quiet-count">{tasks.filter((task) => task.status !== "done").length}<span>open tasks</span></div></div>
    <section className={`project-tasks project-view-${view}`}><div className="project-task-toolbar"><div><h2>Tasks</h2><div className="view-toggle" aria-label="Project task view"><button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>List</button><button type="button" className={view === "board" ? "active" : ""} aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button></div></div><TaskSortControl value={taskSort} onChange={setTaskSort} /></div>
      {view === "list" ? <div className="project-task-groups">{activeTaskGroups.map((group) => <section className={`task-group status-${group.value}`} key={group.value} aria-labelledby={`list-${project.id}-${group.value}`}><ProjectStatusHeading group={group} headingClass="task-group-heading" headingId={`list-${project.id}-${group.value}`} addingStatus={addingStatus} toggleStatusComposer={toggleStatusComposer} />{statusComposer(group.value, group.label)}<TaskRows tasks={group.tasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} reorderProps={reorderProps} scope={`project:${project.id}:${group.value}`} taskSort={taskSort} empty={group.empty} moveTaskToStatus={(id, status) => moveTaskToStatus(id, status, project.id)} taskMoveTargets={moveTargets} moveTask={moveTask} /></section>)}</div>
      : <div className="kanban-board">{activeTaskGroups.map((group) => <section className={`kanban-column status-${group.value}`} key={group.value} aria-labelledby={`board-${project.id}-${group.value}`} onDragOver={(event) => { if (dragged?.kind === "task") event.preventDefault(); }} onDrop={(event) => dropInStatus(event, group.value)}><ProjectStatusHeading group={group} headingClass="kanban-column-heading" headingId={`board-${project.id}-${group.value}`} addingStatus={addingStatus} toggleStatusComposer={toggleStatusComposer} />{statusComposer(group.value, group.label)}<div className="kanban-cards">{sortTasks(group.tasks, taskSort).map((task: Task) => {
        const descriptor = { kind: "task" as const, id: task.id, scope: `project:${project.id}:${group.value}` };
        const reorder = reorderProps(descriptor);
        return <article className={`kanban-card ${task.status === "done" ? "done" : ""} ${task.priority ? `has-priority priority-${task.priority}` : ""}`} key={task.id} onDragOver={(event) => { if (dragged?.kind === "task") event.preventDefault(); }} onDrop={(event) => dropInStatus(event, group.value, task.id)}>
          <div className="kanban-card-top">{taskSort === "custom" && <DragHandle {...reorder} label={`Move or reorder ${task.title}`} />}<div className="kanban-card-actions"><TaskMoveMenu task={task} targets={moveTargets} moveTask={moveTask} moveTaskToStatus={(id, status) => moveTaskToStatus(id, status, project.id)} openBelow /></div></div>
          <div className="kanban-card-body"><label className="task-check"><input type="checkbox" checked={task.status === "done"} onChange={() => toggleTask(task.id)} /><span className="sr-only">Mark {task.title} {task.status === "done" ? "incomplete" : "complete"}</span></label><TaskCopy task={task} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} /></div>
        </article>;
      })}{!group.tasks.length && <div className="kanban-empty"><strong>No tasks here.</strong><p>{group.empty}</p></div>}</div></section>)}</div>}
      <section className={`completed-archive ${showCompleted ? "expanded" : ""}`} aria-label="Completed tasks" onDragOver={(event) => { if (dragged?.kind === "task") event.preventDefault(); }} onDrop={(event) => dropInStatus(event, "done")}>
        <button type="button" className="completed-archive-toggle" aria-expanded={showCompleted} aria-controls={`completed-${project.id}`} onClick={() => setShowCompleted((current) => !current)}><span><strong>Completed</strong><small>{completedTasks.length ? "Archived from the active workflow" : "Check a task or drag it here"}</small></span><span className="completed-archive-count">{completedTasks.length}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8" /></svg></button>
        {showCompleted && <div className="completed-archive-tasks" id={`completed-${project.id}`}>{completedTasks.length ? <TaskRows tasks={completedTasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} removeTask={removeTask} onTaskNoteEditorChange={onTaskNoteEditorChange} reorderProps={reorderProps} scope={`project:${project.id}:done`} taskSort={taskSort} moveTaskToStatus={(id, status) => moveTaskToStatus(id, status, project.id)} taskMoveTargets={moveTargets} moveTask={moveTask} empty="Completed tasks collect here." /> : <p>Nothing completed yet.</p>}</div>}
      </section>
    </section>
    <ProjectNotes project={project} addNote={addProjectNote} updateNote={updateProjectNote} removeNote={removeProjectNote} onEditorChange={onProjectNoteEditorChange} />
    <div className="danger-zone"><div><strong>Remove this project</strong><p>This also removes its synced tasks and all attached notes.</p></div><button onClick={() => removeProject(project.id)}>Remove project</button></div>
  </div>;
}

function Review({ workspace, review, completeStep, navigate }: { workspace: Workspace; review: WeeklyReview; completeStep: (index: number, intention?: string) => void; navigate: (next: Selection) => void }) {
  const firstIncomplete = reviewSteps.findIndex((_, index) => !review.completedSteps.includes(index));
  const [activeStep, setActiveStep] = useState(firstIncomplete < 0 ? 4 : firstIncomplete);
  const [intention, setIntention] = useState(review.intention);
  const currentArea = workspace.areas.find((area) => area.id === workspace.currentAreaId) ?? workspace.areas[0];
  const focusTasks = workspace.focusTaskIds.map((id) => workspace.tasks.find((task) => task.id === id)).filter(Boolean) as Task[];
  const inboxCount = workspace.tasks.filter((task) => !task.areaId && !task.projectId && task.status !== "done").length;
  const completedCount = workspace.tasks.filter((task) => task.status === "done").length;
  const openCount = workspace.tasks.filter((task) => task.status !== "done").length;
  const backlogCount = workspace.tasks.filter((task) => task.someday && task.status !== "done").length;
  const waitingCount = workspace.tasks.filter((task) => task.waiting && task.status !== "done").length;
  const reviewComplete = review.completedSteps.length === reviewSteps.length;

  function finishStep(index: number, savedIntention?: string) {
    completeStep(index, savedIntention);
    setActiveStep(Math.min(index + 1, reviewSteps.length - 1));
  }

  if (reviewComplete) return <div className="page review-page"><div className="page-heading"><div><h1>Your bearing is set.</h1><p>The week has a direction, a short field of work, and room for reality.</p></div><div className="quiet-count">5/5<span>Week {review.weekKey.slice(-2)} complete</span></div></div><section className="weekly-brief"><div className="weekly-brief-heading"><div><h2>Week {review.weekKey.slice(-2)} brief</h2><p>Return here when the week gets noisy.</p></div><span>Saved</span></div><div className="weekly-brief-grid"><div><span>Current area</span><strong>{currentArea?.name ?? "Choose an area"}</strong></div><div><span>Focus three</span>{focusTasks.length ? <ol>{focusTasks.map((task) => <li key={task.id}>{task.title}</li>)}</ol> : <p>No focus selected.</p>}</div><div><span>Weekly intention</span><blockquote>{review.intention || "Keep enough space to respond well."}</blockquote></div></div><button type="button" onClick={() => navigate({ kind: "today" })}>Open Today</button></section></div>;

  const [stepTitle, stepCopy] = reviewSteps[activeStep];
  return <div className="page review-page"><div className="page-heading"><div><h1>Reset your bearing.</h1><p>Make the system lighter before asking it to carry another week.</p></div><div className="quiet-count">{review.completedSteps.length}/5<span>Week {review.weekKey.slice(-2)}</span></div></div><div className="guided-review"><nav className="review-progress" aria-label="Weekly review steps">{reviewSteps.map(([title, copy], index) => {
    const complete = review.completedSteps.includes(index);
    const available = complete || index <= Math.max(firstIncomplete, 0);
    return <button type="button" className={`${activeStep === index ? "active" : ""} ${complete ? "complete" : ""}`} disabled={!available} aria-current={activeStep === index ? "step" : undefined} onClick={() => setActiveStep(index)} key={title}><span>{complete ? <ConfirmIcon /> : index + 1}</span><span><strong>{title}</strong><small>{copy}</small></span></button>;
  })}</nav><section className="review-stage" aria-labelledby="review-stage-title"><div className="review-stage-heading"><span>Step {activeStep + 1} of 5</span><h2 id="review-stage-title">{stepTitle}</h2><p>{activeStep === 1 && inboxCount > 0 ? `${inboxCount} inbox ${inboxCount === 1 ? "item is" : "items are"} still waiting for a home.` : stepCopy}</p></div>
    {activeStep === 0 && <><div className="review-evidence"><div><strong>{completedCount}</strong><span>tasks completed</span></div><div><strong>{openCount}</strong><span>still open</span></div><div><strong>{workspace.projects.length}</strong><span>projects carrying work</span></div></div><p className="review-prompt">Notice the work that produced learning, protected something important, or changed what you will do next.</p><button type="button" className="review-primary" onClick={() => finishStep(0)}>I noticed what moved</button></>}
    {activeStep === 1 && <div className={`review-action-state ${inboxCount === 0 ? "ready" : "waiting"}`}><strong>{inboxCount === 0 ? "Your inbox is clear." : "Give every loose task a home—or let it go."}</strong><p>{inboxCount === 0 ? "The system is ready for the next decision." : "Return here when the inbox reaches zero."}</p>{inboxCount === 0 ? <button type="button" className="review-primary" onClick={() => finishStep(1)}>Continue</button> : <button type="button" className="review-primary" onClick={() => navigate({ kind: "inbox" })}>Process inbox</button>}</div>}
    {activeStep === 2 && <><div className="review-prune-summary"><div><span>Open work</span><strong>{openCount}</strong></div><div><span>Backlog</span><strong>{backlogCount}</strong></div><div><span>Waiting</span><strong>{waitingCount}</strong></div><div><span>Projects</span><strong>{workspace.projects.length}</strong></div></div><p className="review-prompt">Remove, defer, or narrow anything that no longer earns attention. Keep only work with real stakes or useful feedback.</p><div className="review-stage-actions">{currentArea && <button type="button" className="review-secondary" onClick={() => navigate({ kind: "area", id: currentArea.id })}>Open {currentArea.name}</button>}<button type="button" className="review-primary" onClick={() => finishStep(2)}>I pruned the queue</button></div></>}
    {activeStep === 3 && <div className={`review-focus-summary ${focusTasks.length ? "ready" : "waiting"}`}><span>Current area</span><h3>{currentArea?.name ?? "No area selected"}</h3>{focusTasks.length ? <ol>{focusTasks.map((task) => <li key={task.id}>{task.title}</li>)}</ol> : <p>Choose one to three tasks that will define a useful week.</p>}<div className="review-stage-actions"><button type="button" className="review-secondary" onClick={() => navigate({ kind: "today" })}>{focusTasks.length ? "Adjust focus" : "Choose focus"}</button>{focusTasks.length > 0 && <button type="button" className="review-primary" onClick={() => finishStep(3)}>Use this focus</button>}</div></div>}
    {activeStep === 4 && <><label className="review-intention"><span>Weekly intention</span><textarea value={intention} maxLength={2_000} onChange={(event) => setIntention(event.target.value)} placeholder="What will help you protect the work—and the space around it?" /><small>Leave buffer for surprises, market changes, relationships, and unfinished work.</small></label><button type="button" className="review-primary" disabled={!intention.trim()} onClick={() => finishStep(4, intention.trim())}>Complete weekly review</button></>}
  </section></div></div>;
}
