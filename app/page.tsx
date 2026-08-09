"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { isTaskSort, sortTasks } from "./task-sorting.mjs";

type Area = { id: string; name: string; cue: string };
type Project = { id: string; areaId: string; name: string; outcome: string; notes: string };
type TaskPriority = "high" | "medium" | "low";
type TaskSort = "custom" | "alphabetical" | "dueDate" | "priority";
type Task = { id: string; title: string; areaId?: string; projectId?: string; done: boolean; createdAt: number; dueDate?: string; priority?: TaskPriority };
type Selection =
  | { kind: "today" | "inbox" | "review" }
  | { kind: "area"; id: string }
  | { kind: "project"; id: string };
type Workspace = { areas: Area[]; projects: Project[]; tasks: Task[]; reviewed: number[]; currentAreaId?: string };
type SyncState = "loading" | "saving" | "saved" | "error";
type Account = { displayName: string; email: string };
type EntityKind = "area" | "project" | "task";
type SortPreferences = Record<string, TaskSort>;
type DragItem = { kind: EntityKind; id: string; scope: string };
type ReorderProps = {
  descriptor: DragItem;
  onDragStart: (event: DragEvent<HTMLButtonElement>, item: DragItem) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>, item: DragItem) => void;
  onDrop: (event: DragEvent<HTMLElement>, item: DragItem) => void;
  onMove: (item: DragItem, delta: number) => void;
};

const seed: Workspace = {
  areas: [
    { id: "trading", name: "Trading", cue: "Protect capital" },
    { id: "growth", name: "Personal growth", cue: "Compound skill" },
    { id: "family", name: "Family", cue: "Be present" },
    { id: "life", name: "Business & life", cue: "Close loops" },
  ],
  projects: [
    { id: "execution", areaId: "trading", name: "A-Setup Execution", outcome: "Execute and review 20 valid trades while following defined risk rules.", notes: "Entries after the second impulse are consistently late.\n\nNext review: add MFE / MAE and compare first-hour results." },
    { id: "replay", areaId: "trading", name: "Market Replay Lab", outcome: "Complete 12 focused replay sessions and extract one rule refinement from each.", notes: "Replay Tuesday’s failed breakout. Capture the earliest invalidation signal." },
    { id: "practice", areaId: "growth", name: "Deliberate Practice", outcome: "Finish eight lessons and apply each idea in a focused practice session.", notes: "Short feedback loops beat longer passive study. Define success before the next session." },
    { id: "weekends", areaId: "family", name: "Present Weekends", outcome: "Plan and protect four device-light family blocks this month.", notes: "One anchor activity leaves enough room for spontaneity. Choose between the beach and a museum." },
    { id: "loops", areaId: "life", name: "Close the Loops", outcome: "Complete nagging administrative tasks in two weekly batches.", notes: "Keep the batch under 45 minutes. Stop when the timer ends." },
  ],
  tasks: [
    { id: "t1", title: "Mark pre-market levels and invalidation", areaId: "trading", projectId: "execution", done: false, createdAt: 1, dueDate: "2026-08-07", priority: "high" },
    { id: "t2", title: "Review yesterday’s AAPL trade", areaId: "trading", projectId: "execution", done: false, createdAt: 2, dueDate: "2026-08-08", priority: "medium" },
    { id: "t3", title: "Replay one failed-breakout setup", areaId: "trading", projectId: "replay", done: false, createdAt: 3, dueDate: "2026-08-10", priority: "high" },
    { id: "t4", title: "Complete deliberate-practice lesson", areaId: "growth", projectId: "practice", done: false, createdAt: 4, priority: "medium" },
    { id: "t5", title: "Plan a device-light Saturday", areaId: "family", projectId: "weekends", done: false, createdAt: 5, dueDate: "2026-08-09", priority: "low" },
    { id: "t6", title: "Send Q3 invoice", areaId: "life", projectId: "loops", done: false, createdAt: 6, dueDate: "2026-08-07", priority: "high" },
    { id: "i1", title: "Compare new broker fee schedule", done: false, createdAt: 7 },
    { id: "i2", title: "Book annual dental appointments", done: false, createdAt: 8, dueDate: "2026-08-15", priority: "low" },
  ],
  reviewed: [],
  currentAreaId: "trading",
};

const WORKSPACE_STORAGE_KEY = "mission-control-workspace-v1";
const TASK_SORT_STORAGE_KEY = "mission-control-task-sorts-v2";
const nameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const reviewSteps = [
  ["Notice what moved", "Look for evidence of practice, not just outcomes."],
  ["Process the inbox", "Give every loose task a home or let it go."],
  ["Prune the irrelevant", "Remove work that no longer earns attention."],
  ["Choose the week", "Name the few outcomes that would actually matter."],
  ["Protect some slack", "Leave room for what the plan cannot predict."],
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeClientWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Workspace>;
  if (!Array.isArray(candidate.areas) || !Array.isArray(candidate.projects) || !Array.isArray(candidate.tasks)) return null;
  const currentAreaId = candidate.areas.some((area) => area.id === candidate.currentAreaId) ? candidate.currentAreaId : candidate.areas[0]?.id;
  return { areas: candidate.areas, projects: candidate.projects, tasks: candidate.tasks, reviewed: Array.isArray(candidate.reviewed) ? candidate.reviewed : [], currentAreaId };
}

function reorderScoped<T extends { id: string }>(items: T[], scopeIds: string[], sourceId: string, targetId: string) {
  const from = scopeIds.indexOf(sourceId);
  const to = scopeIds.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return items;
  const nextIds = [...scopeIds];
  const [moved] = nextIds.splice(from, 1);
  nextIds.splice(to, 0, moved);
  const ordered = nextIds.map((id) => items.find((item) => item.id === id)).filter(Boolean) as T[];
  let index = 0;
  return items.map((item) => scopeIds.includes(item.id) ? ordered[index++] : item);
}

function taskScope(task: Task) {
  if (task.projectId) return `project:${task.projectId}`;
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

function dueLabel(value?: string) {
  if (!value) return "Add timing";
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

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>(seed);
  const [selection, setSelection] = useState<Selection>({ kind: "today" });
  const [capture, setCapture] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newProject, setNewProject] = useState("");
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [undoWorkspace, setUndoWorkspace] = useState<Workspace | null>(null);
  const [expandedAreas, setExpandedAreas] = useState<string[]>(seed.areas.map((area) => area.id));
  const [dragged, setDragged] = useState<DragItem | null>(null);
  const [taskSorts, setTaskSorts] = useState<SortPreferences>({});
  const [hydrated, setHydrated] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const lastSyncedWorkspace = useRef("");
  const lastServerUpdatedAt = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

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
      } catch { /* Fall back to the starter workspace. */ }
      setHydrated(true);

      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign("/signin-with-chatgpt?return_to=%2F");
          return;
        }
        if (!response.ok) throw new Error("Unable to load the synced workspace.");
        const payload = await response.json() as { workspace: Workspace | null; updatedAt: number; user: Account };
        if (!active) return;

        const nextWorkspace = normalizeClientWorkspace(payload.workspace) ?? localWorkspace;
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
      if (document.visibilityState !== "visible" || JSON.stringify(workspace) !== lastSyncedWorkspace.current) return;
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { workspace: Workspace | null; updatedAt: number };
        const synced = normalizeClientWorkspace(payload.workspace);
        if (!active || !synced || payload.updatedAt <= lastServerUpdatedAt.current) return;
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
    if (hydrated) localStorage.setItem(TASK_SORT_STORAGE_KEY, JSON.stringify(taskSorts));
  }, [hydrated, taskSorts]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => { setToast(""); setUndoWorkspace(null); }, 8000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const activeArea = selection.kind === "area"
    ? workspace.areas.find((area) => area.id === selection.id)
    : selection.kind === "project"
      ? workspace.areas.find((area) => area.id === workspace.projects.find((project) => project.id === selection.id)?.areaId)
      : undefined;
  const activeProject = selection.kind === "project" ? workspace.projects.find((project) => project.id === selection.id) : undefined;
  const inboxTasks = useMemo(() => workspace.tasks.filter((task) => !task.areaId && !task.projectId), [workspace.tasks]);
  const openTasks = useMemo(() => workspace.tasks.filter((task) => !task.done), [workspace.tasks]);
  const completeCount = workspace.tasks.filter((task) => task.done).length;
  const captureDestination = activeProject?.name ?? activeArea?.name ?? "Inbox";
  const sidebarAreas = useMemo(() => [...workspace.areas].sort((a, b) => nameCollator.compare(a.name, b.name)), [workspace.areas]);

  function taskSortFor(scope: string): TaskSort {
    return taskSorts[scope] ?? "custom";
  }

  function setTaskSort(scope: string, sort: TaskSort) {
    setTaskSorts((current) => ({ ...current, [scope]: sort }));
  }

  function setCurrentArea(id: string) {
    setWorkspace((current) => ({ ...current, currentAreaId: id }));
    setTaskSort("today", "custom");
    setToast(`${workspace.areas.find((area) => area.id === id)?.name ?? "Area"} is now in focus`);
  }

  function retrySync() {
    window.location.reload();
  }

  function toggleReviewed(index: number) {
    setWorkspace((current) => ({
      ...current,
      reviewed: current.reviewed.includes(index) ? current.reviewed.filter((item) => item !== index) : [...current.reviewed, index],
    }));
  }

  function navigate(next: Selection) {
    setSelection(next);
    setMobileMenu(false);
    setShowProjectForm(false);
  }

  function addTask(event: FormEvent) {
    event.preventDefault();
    const title = capture.trim();
    if (!title) return;
    const task: Task = {
      id: makeId("task"), title, done: false, createdAt: Date.now(),
      ...(activeArea ? { areaId: activeArea.id } : {}),
      ...(activeProject ? { projectId: activeProject.id } : {}),
    };
    setWorkspace((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setCapture("");
    setUndoWorkspace(null);
    setToast(`Added to ${captureDestination}`);
  }

  function addArea(event: FormEvent) {
    event.preventDefault();
    const name = newArea.trim();
    if (!name) return;
    const area = { id: makeId("area"), name, cue: "Define what matters" };
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
    const project = { id: makeId("project"), areaId: activeArea.id, name, outcome: "Define the outcome this project will create.", notes: "" };
    setWorkspace((current) => ({ ...current, projects: [...current.projects, project] }));
    setNewProject("");
    setShowProjectForm(false);
    navigate({ kind: "project", id: project.id });
  }

  function removeArea(areaId: string) {
    const area = workspace.areas.find((item) => item.id === areaId);
    const projectIds = workspace.projects.filter((project) => project.areaId === areaId).map((project) => project.id);
    setUndoWorkspace(workspace);
    setWorkspace((current) => ({
      ...current,
      areas: current.areas.filter((item) => item.id !== areaId),
      projects: current.projects.filter((project) => project.areaId !== areaId),
      tasks: current.tasks.filter((task) => task.areaId !== areaId && !projectIds.includes(task.projectId ?? "")),
      currentAreaId: current.currentAreaId === areaId ? current.areas.find((item) => item.id !== areaId)?.id : current.currentAreaId,
    }));
    navigate({ kind: "today" });
    setToast(`${area?.name ?? "Area"} removed`);
  }

  function removeProject(projectId: string) {
    const project = workspace.projects.find((item) => item.id === projectId);
    setUndoWorkspace(workspace);
    setWorkspace((current) => ({
      ...current,
      projects: current.projects.filter((item) => item.id !== projectId),
      tasks: current.tasks.filter((task) => task.projectId !== projectId),
    }));
    navigate(project ? { kind: "area", id: project.areaId } : { kind: "today" });
    setToast(`${project?.name ?? "Project"} removed`);
  }

  function toggleTask(id: string) {
    setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) }));
  }

  function moveTask(id: string, value: string) {
    setUndoWorkspace(null);
    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;
        if (value === "inbox") return { ...task, areaId: undefined, projectId: undefined };
        if (value.startsWith("area:")) return { ...task, areaId: value.slice(5), projectId: undefined };
        const project = current.projects.find((item) => item.id === value.slice(8));
        return project ? { ...task, areaId: project.areaId, projectId: project.id } : task;
      }),
    }));
    setToast("Task moved");
  }

  function renameArea(id: string, name: string) {
    setWorkspace((current) => ({ ...current, areas: current.areas.map((area) => area.id === id ? { ...area, name } : area) }));
    setToast("Area renamed");
  }

  function renameProject(id: string, name: string) {
    setWorkspace((current) => ({ ...current, projects: current.projects.map((project) => project.id === id ? { ...project, name } : project) }));
    setToast("Project renamed");
  }

  function renameTask(id: string, title: string) {
    setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, title } : task) }));
    setToast("Task renamed");
  }

  function updateTask(id: string, patch: Partial<Pick<Task, "dueDate" | "priority">>) {
    setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, ...patch } : task) }));
  }

  function updateProject(patch: Partial<Project>) {
    if (!activeProject) return;
    setWorkspace((current) => ({ ...current, projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, ...patch } : project) }));
  }

  function idsFor(item: DragItem, current = workspace) {
    if (item.kind === "area") return current.areas.map((area) => area.id);
    if (item.kind === "project") return current.projects.filter((project) => project.areaId === item.scope).map((project) => project.id);
    if (item.scope.startsWith("today:")) {
      const areaId = item.scope.slice(6);
      return current.tasks.filter((task) => task.areaId === areaId && !task.done).map((task) => task.id);
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
    setToast("Order updated");
  }

  function moveItem(item: DragItem, delta: number) {
    const ids = idsFor(item);
    const index = ids.indexOf(item.id);
    const target = ids[index + delta];
    if (target) reorderItem(item, { ...item, id: target });
  }

  function sortItems(kind: "area" | "project", scope: string) {
    setWorkspace((current) => {
      if (kind === "area") return { ...current, areas: [...current.areas].sort((a, b) => a.name.localeCompare(b.name)) };
      const scoped = current.projects.filter((project) => project.areaId === scope).sort((a, b) => a.name.localeCompare(b.name));
      let index = 0;
      return { ...current, projects: current.projects.map((project) => project.areaId === scope ? scoped[index++] : project) };
    });
    setToast("Sorted A–Z");
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
    event.preventDefault();
    if (dragged) reorderItem(dragged, item);
    setDragged(null);
  }

  function reorderProps(descriptor: DragItem): ReorderProps {
    return { descriptor, onDragStart: dragStart, onDragEnd: () => setDragged(null), onDragOver: dragOver, onDrop: drop, onMove: moveItem };
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
          <button className="close-menu" onClick={() => setMobileMenu(false)}>Close</button>
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
              <div className="area-row"><button className={`area-link ${selection.kind === "area" && selection.id === area.id ? "active" : ""}`} onClick={() => navigate({ kind: "area", id: area.id })}><span>{area.name}</span><small>{workspace.tasks.filter((task) => task.areaId === area.id && !task.done).length}</small></button>{areaProjects.length > 0 && <button className={`disclosure ${isOpen ? "expanded" : ""}`} onClick={() => setExpandedAreas((current) => current.includes(area.id) ? current.filter((id) => id !== area.id) : [...current, area.id])} aria-label={`${isOpen ? "Collapse" : "Expand"} ${area.name} projects`} aria-expanded={isOpen}><span /></button>}</div>
              {isOpen && areaProjects.length > 0 && <div className="project-links">{areaProjects.map((project) => {
                return <div key={project.id}><button className={selection.kind === "project" && selection.id === project.id ? "active" : ""} onClick={() => navigate({ kind: "project", id: project.id })}>{project.name}</button></div>;
              })}</div>}
            </div>;
          })}
        </nav>

        <button className={`review-link ${selection.kind === "review" ? "active" : ""}`} onClick={() => navigate({ kind: "review" })}><span>Weekly review</span><small>{workspace.reviewed.length}/5</small></button>
        <div className="sidebar-foot"><div><strong>Week {weekNumber(new Date())}</strong><span>{completeCount} tasks completed</span></div><p>Steady over busy.</p></div>
      </aside>

      {mobileMenu && <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="Close menu" />}

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu(true)}>Menu</button>
          <form className="quick-add" onSubmit={addTask} autoComplete="off">
            <label htmlFor="quick-task" className="sr-only">Add a task to {captureDestination}</label>
            <input id="quick-task" name="quick-task-new" value={capture} onChange={(event) => setCapture(event.target.value)} placeholder={`Add a task to ${captureDestination}…`} autoComplete="off" autoCorrect="off" spellCheck={false} />
            <button disabled={!capture.trim()}>Add task <span>to {captureDestination}</span></button>
          </form>
          <div className="sync-tools" title={account?.email}>{syncState === "error" ? <button className="sync-state error" onClick={retrySync}><i />Retry sync</button> : <span className={`sync-state ${syncState}`}><i />{syncState === "saving" ? "Saving" : "Synced"}</span>}<a href="/signout-with-chatgpt?return_to=%2F">{account?.displayName ?? "Account"}</a></div>
        </header>

        {selection.kind === "today" && <Today workspace={workspace} inboxTasks={inboxTasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} renameArea={renameArea} navigate={navigate} reorderProps={reorderProps} sortItems={sortItems} taskSort={taskSortFor("today")} setTaskSort={(sort) => setTaskSort("today", sort)} setCurrentArea={setCurrentArea} />}
        {selection.kind === "inbox" && <Inbox workspace={workspace} tasks={inboxTasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} moveTask={moveTask} reorderProps={reorderProps} taskSort={taskSortFor("inbox")} setTaskSort={(sort) => setTaskSort("inbox", sort)} />}
        {selection.kind === "area" && activeArea && <AreaView area={activeArea} projects={workspace.projects.filter((project) => project.areaId === activeArea.id)} tasks={contextualTasks} showProjectForm={showProjectForm} setShowProjectForm={setShowProjectForm} newProject={newProject} setNewProject={setNewProject} addProject={addProject} navigate={navigate} toggleTask={toggleTask} renameArea={renameArea} renameProject={renameProject} renameTask={renameTask} updateTask={updateTask} reorderProps={reorderProps} sortItems={sortItems} taskSort={taskSortFor(`area:${activeArea.id}`)} setTaskSort={(sort) => setTaskSort(`area:${activeArea.id}`, sort)} removeArea={removeArea} />}
        {selection.kind === "project" && activeProject && activeArea && <ProjectView project={activeProject} area={activeArea} tasks={contextualTasks} toggleTask={toggleTask} renameProject={renameProject} renameTask={renameTask} updateTask={updateTask} reorderProps={reorderProps} taskSort={taskSortFor(`project:${activeProject.id}`)} setTaskSort={(sort) => setTaskSort(`project:${activeProject.id}`, sort)} updateProject={updateProject} removeProject={removeProject} />}
        {selection.kind === "review" && <Review reviewed={workspace.reviewed} toggleReviewed={toggleReviewed} inboxCount={inboxTasks.length} />}
      </main>
      {toast && <div className="toast" role="status"><span>{toast}</span>{undoWorkspace && <button onClick={() => { setWorkspace(undoWorkspace); setUndoWorkspace(null); setToast("Restored"); }}>Undo removal</button>}</div>}
    </div>
  );
}

function LogoMark() {
  return <span className="brand-mark" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit-core" /><span className="orbit-signal" /></span>;
}

function DragHandle({ descriptor, onDragStart, onDragEnd, onMove, label }: ReorderProps & { label: string }) {
  return <div className="order-controls">
    <button className="drag-handle" draggable onDragStart={(event) => onDragStart(event, descriptor)} onDragEnd={onDragEnd} aria-label={`${label}. Drag to change order.`} title="Drag to reorder"><span /><span /><span /><span /></button>
    <div className="step-controls"><button onClick={() => onMove(descriptor, -1)} aria-label={`Move ${label.replace("Reorder ", "")} up`} title="Move up"><i /></button><button onClick={() => onMove(descriptor, 1)} aria-label={`Move ${label.replace("Reorder ", "")} down`} title="Move down"><i /></button></div>
  </div>;
}

function NameEditor({ value, onSave, label, large = false }: { value: string; onSave: (value: string) => void; label: string; large?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    if (!next) return;
    onSave(next);
    setEditing(false);
  }

  if (editing) return <form className={`name-editor editing ${large ? "large" : ""}`} onSubmit={submit}>
    <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={label} onKeyDown={(event) => { if (event.key === "Escape") { setDraft(value); setEditing(false); } }} />
    <button disabled={!draft.trim()}>Save</button><button type="button" onClick={() => { setDraft(value); setEditing(false); }}>Cancel</button>
  </form>;

  return <div className={`name-editor ${large ? "large" : ""}`}><span>{value}</span><button onClick={() => { setDraft(value); setEditing(true); }} aria-label={`Rename ${value}`}>Edit</button></div>;
}

function ListTools({ onSort, noun }: { onSort: () => void; noun: string }) {
  return <div className="list-tools"><span>Drag to order</span><button onClick={onSort}>Sort {noun} A–Z</button></div>;
}

function TaskSortControl({ value, onChange }: { value: TaskSort; onChange: (sort: TaskSort) => void }) {
  const options: Array<[TaskSort, string]> = [["custom", "Manual"], ["alphabetical", "A–Z"], ["dueDate", "Due"], ["priority", "Priority"]];
  return <div className="task-sort" role="group" aria-label="Sort tasks"><span>Order</span><div>{options.map(([sort, label]) => <button type="button" key={sort} className={value === sort ? "active" : ""} aria-pressed={value === sort} onClick={() => onChange(sort)}>{label}</button>)}</div></div>;
}

function TaskDetails({ task, updateTask }: { task: Task; updateTask: (id: string, patch: Partial<Pick<Task, "dueDate" | "priority">>) => void }) {
  const [editing, setEditing] = useState(false);
  const priority = task.priority ? `${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)} priority` : "Set priority";
  return <div className="task-planning">
    <button className={`task-plan-trigger ${task.priority ? `priority-${task.priority}` : ""}`} onClick={() => setEditing((value) => !value)} aria-expanded={editing}>
      <span>{dueLabel(task.dueDate)}</span><span>{priority}</span><strong>{editing ? "Close" : "Plan"}</strong>
    </button>
    <div className="task-details" hidden={!editing}>
      <label className="task-field"><span>Due</span><input type="date" value={task.dueDate ?? ""} onChange={(event) => updateTask(task.id, { dueDate: event.target.value || undefined })} aria-label={`Due date for ${task.title}`} /></label>
      <label className="task-field"><span>Priority</span><select value={task.priority ?? ""} onChange={(event) => updateTask(task.id, { priority: (event.target.value || undefined) as TaskPriority | undefined })} aria-label={`Priority for ${task.title}`}><option value="">None</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
      <button className="task-plan-done" onClick={() => setEditing(false)}>Done</button>
    </div>
  </div>;
}

function TaskRows({ tasks, toggleTask, renameTask, updateTask, reorderProps, empty, scope, taskSort }: { tasks: Task[]; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; updateTask: (id: string, patch: Partial<Pick<Task, "dueDate" | "priority">>) => void; reorderProps: (item: DragItem) => ReorderProps; empty: string; scope: string; taskSort: TaskSort }) {
  if (!tasks.length) return <div className="empty-state"><strong>Nothing waiting here.</strong><p>{empty}</p></div>;
  const customOrder = taskSort === "custom";
  return <div className="task-list">{sortTasks(tasks, taskSort).map((task: Task) => {
    const descriptor = { kind: "task" as const, id: task.id, scope };
    const reorder = reorderProps(descriptor);
    const reorderEvents = customOrder ? { onDragOver: (event: DragEvent<HTMLElement>) => reorder.onDragOver(event, descriptor), onDrop: (event: DragEvent<HTMLElement>) => reorder.onDrop(event, descriptor) } : {};
    return <div className={`task-row ${task.done ? "done" : ""} ${customOrder ? "custom-order" : "sorted-order"}`} key={task.id} {...reorderEvents}>
      {customOrder && <DragHandle {...reorder} label={`Reorder ${task.title}`} />}
      <label className="task-check"><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} /><span className="sr-only">Mark {task.title} {task.done ? "incomplete" : "complete"}</span></label>
      <div className="task-copy"><NameEditor value={task.title} onSave={(value) => renameTask(task.id, value)} label={`Task name for ${task.title}`} /><TaskDetails task={task} updateTask={updateTask} /></div>
    </div>;
  })}</div>;
}

function Today({ workspace, inboxTasks, toggleTask, renameTask, updateTask, renameArea, navigate, reorderProps, sortItems, taskSort, setTaskSort, setCurrentArea }: { workspace: Workspace; inboxTasks: Task[]; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; updateTask: (id: string, patch: Partial<Pick<Task, "dueDate" | "priority">>) => void; renameArea: (id: string, value: string) => void; navigate: (next: Selection) => void; reorderProps: (item: DragItem) => ReorderProps; sortItems: (kind: "area" | "project", scope: string) => void; taskSort: TaskSort; setTaskSort: (sort: TaskSort) => void; setCurrentArea: (id: string) => void }) {
  const currentArea = workspace.areas.find((area) => area.id === workspace.currentAreaId) ?? workspace.areas[0];
  const eligibleTasks = workspace.tasks.filter((task) => task.areaId === currentArea?.id && !task.done);
  const nextTasks = (taskSort === "custom" ? eligibleTasks : sortTasks(eligibleTasks, taskSort)).slice(0, 3) as Task[];
  const now = new Date();
  const dayName = new Intl.DateTimeFormat("en-US", { timeZone: PROJECT_TIME_ZONE, weekday: "long" }).format(now);
  const calendarDate = new Intl.DateTimeFormat("en-US", { timeZone: PROJECT_TIME_ZONE, month: "long", day: "numeric" }).format(now);
  return <div className="page today-page">
    <div className="page-heading"><div><h1>Choose what deserves today.</h1><p>A short field of meaningful work, with space left for reality.</p>{currentArea && <div className="current-area-summary"><span>Current area</span><strong>{currentArea.name}</strong><em>{currentArea.cue}</em></div>}</div><div className="date"><span>{dayName}</span><strong>{calendarDate}</strong></div></div>
    <div className="today-grid">
      <section className="work-queue"><div className="section-title"><div><h2>Focus three</h2><p className="section-note">The few actions in {currentArea?.name ?? "this area"} with the strongest consequence or feedback.</p></div><div className="section-actions"><span>{nextTasks.length}/3</span><TaskSortControl value={taskSort} onChange={setTaskSort} /></div></div><TaskRows tasks={nextTasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} reorderProps={reorderProps} scope={`today:${currentArea?.id ?? ""}`} taskSort={taskSort} empty="Add a task above, or leave the space open." />{eligibleTasks.length > nextTasks.length && <p className="queue-note">Showing {nextTasks.length} of {eligibleTasks.length} open tasks in {currentArea?.name}. Use Manual order to choose the three that lead.</p>}<p className="principle-note"><strong>Process over prediction.</strong> Judge the day by the practice, not the outcome.</p></section>
    </div>
    <section className="area-overview"><div className="section-title"><h2>Areas</h2><ListTools noun="areas" onSort={() => sortItems("area", "all")} /></div><div className="area-table">{workspace.areas.map((area) => {
      const descriptor = { kind: "area" as const, id: area.id, scope: "all" };
      const reorder = reorderProps(descriptor);
      const isCurrent = area.id === currentArea?.id;
      return <div className={`entity-row area-entity ${isCurrent ? "current" : ""}`} key={area.id} onDragOver={(event) => reorder.onDragOver(event, descriptor)} onDrop={(event) => reorder.onDrop(event, descriptor)}>
        <DragHandle {...reorder} label={`Reorder ${area.name}`} />
        <span className="area-initial">{area.name.charAt(0)}</span>
        <div className="entity-copy"><NameEditor value={area.name} onSave={(value) => renameArea(area.id, value)} label={`Area name for ${area.name}`} /><small>{area.cue}</small></div>
        <span className="area-count">{workspace.tasks.filter((task) => task.areaId === area.id && !task.done).length} open</span>
        <button className="focus-area-button" aria-pressed={isCurrent} onClick={() => setCurrentArea(area.id)}>{isCurrent ? "In focus" : "Focus"}</button>
        <button className="open-link" onClick={() => navigate({ kind: "area", id: area.id })}>Open</button>
      </div>;
    })}</div></section>
    {inboxTasks.length > 0 && <button className="inbox-callout" onClick={() => navigate({ kind: "inbox" })}><span><strong>{inboxTasks.length} items need a home</strong><small>Process your inbox while context is fresh.</small></span><span>Open inbox</span></button>}
  </div>;
}

function Inbox({ workspace, tasks, toggleTask, renameTask, updateTask, moveTask, reorderProps, taskSort, setTaskSort }: { workspace: Workspace; tasks: Task[]; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; updateTask: (id: string, patch: Partial<Pick<Task, "dueDate" | "priority">>) => void; moveTask: (id: string, value: string) => void; reorderProps: (item: DragItem) => ReorderProps; taskSort: TaskSort; setTaskSort: (sort: TaskSort) => void }) {
  const customOrder = taskSort === "custom";
  const orderedTasks = sortTasks(tasks, taskSort) as Task[];
  return <div className="page"><div className="page-heading"><div><h1>Inbox</h1><p>Capture first. Give each item a proper home when you are ready.</p></div><div className="quiet-count">{tasks.length}<span>unprocessed</span></div></div>
    <section className="inbox-workspace"><div className="section-title inbox-title"><h2>Unprocessed tasks</h2><TaskSortControl value={taskSort} onChange={setTaskSort} /></div>{orderedTasks.length ? orderedTasks.map((task) => {
      const descriptor = { kind: "task" as const, id: task.id, scope: "inbox" };
      const reorder = reorderProps(descriptor);
      const reorderEvents = customOrder ? { onDragOver: (event: DragEvent<HTMLElement>) => reorder.onDragOver(event, descriptor), onDrop: (event: DragEvent<HTMLElement>) => reorder.onDrop(event, descriptor) } : {};
      return <div className={`inbox-row ${task.done ? "done" : ""} ${customOrder ? "custom-order" : "sorted-order"}`} key={task.id} {...reorderEvents}>{customOrder && <DragHandle {...reorder} label={`Reorder ${task.title}`} />}<label className="task-check"><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} /><span className="sr-only">Complete {task.title}</span></label><div className="task-copy"><NameEditor value={task.title} onSave={(value) => renameTask(task.id, value)} label={`Task name for ${task.title}`} /><TaskDetails task={task} updateTask={updateTask} /></div><select className="move-task" defaultValue="inbox" onChange={(event) => moveTask(task.id, event.target.value)} aria-label={`Move ${task.title}`}><option value="inbox">Move to…</option>{workspace.areas.map((area) => <optgroup label={area.name} key={area.id}><option value={`area:${area.id}`}>{area.name} · no project</option>{workspace.projects.filter((project) => project.areaId === area.id).map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}</optgroup>)}</select></div>;
    }) : <div className="empty-state spacious"><strong>Your inbox is clear.</strong><p>New tasks added outside an area or project will land here.</p></div>}</section>
  </div>;
}

function AreaView({ area, projects, tasks, showProjectForm, setShowProjectForm, newProject, setNewProject, addProject, navigate, toggleTask, renameArea, renameProject, renameTask, updateTask, reorderProps, sortItems, taskSort, setTaskSort, removeArea }: { area: Area; projects: Project[]; tasks: Task[]; showProjectForm: boolean; setShowProjectForm: (value: boolean) => void; newProject: string; setNewProject: (value: string) => void; addProject: (event: FormEvent) => void; navigate: (next: Selection) => void; toggleTask: (id: string) => void; renameArea: (id: string, value: string) => void; renameProject: (id: string, value: string) => void; renameTask: (id: string, value: string) => void; updateTask: (id: string, patch: Partial<Pick<Task, "dueDate" | "priority">>) => void; reorderProps: (item: DragItem) => ReorderProps; sortItems: (kind: "area" | "project", scope: string) => void; taskSort: TaskSort; setTaskSort: (sort: TaskSort) => void; removeArea: (id: string) => void }) {
  const looseTasks = tasks.filter((task) => !task.projectId);
  return <div className="page"><div className="breadcrumb">Area</div><div className="page-heading"><div><NameEditor large value={area.name} onSave={(value) => renameArea(area.id, value)} label={`Area name for ${area.name}`} /><p>{area.cue}. Tasks added above will come directly here.</p></div><button className="secondary-button" onClick={() => setShowProjectForm(!showProjectForm)}>{showProjectForm ? "Cancel" : "New project"}</button></div>
    {showProjectForm && <form className="inline-create" onSubmit={addProject}><div><strong>Create a project in {area.name}</strong><span>Name a concrete body of work, not an ongoing responsibility.</span></div><input value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="Project name" aria-label="Project name" /><button disabled={!newProject.trim()}>Create project</button></form>}
    <section className="project-section"><div className="section-title"><h2>Projects <small>{projects.length} active</small></h2><ListTools noun="projects" onSort={() => sortItems("project", area.id)} /></div>{projects.length ? <div className="project-list">{projects.map((project) => {
      const descriptor = { kind: "project" as const, id: project.id, scope: area.id };
      const reorder = reorderProps(descriptor);
      return <div className="entity-row project-entity" key={project.id} onDragOver={(event) => reorder.onDragOver(event, descriptor)} onDrop={(event) => reorder.onDrop(event, descriptor)}><DragHandle {...reorder} label={`Reorder ${project.name}`} /><div className="entity-copy"><NameEditor value={project.name} onSave={(value) => renameProject(project.id, value)} label={`Project name for ${project.name}`} /><small>{project.outcome}</small></div><span>{tasks.filter((task) => task.projectId === project.id && !task.done).length} tasks</span><button className="open-link" onClick={() => navigate({ kind: "project", id: project.id })}>Open</button></div>;
    })}</div> : <div className="empty-state"><strong>No projects yet.</strong><p>Create one when this area has a finite outcome to move.</p></div>}</section>
    <section className="loose-tasks"><div className="section-title"><h2>Area tasks</h2><TaskSortControl value={taskSort} onChange={setTaskSort} /></div><TaskRows tasks={looseTasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} reorderProps={reorderProps} scope={`area:${area.id}`} taskSort={taskSort} empty="Tasks added here without a project will appear in this list." /></section>
    <div className="danger-zone"><div><strong>Remove this area</strong><p>This also removes its synced projects, tasks, and project notes.</p></div><button onClick={() => removeArea(area.id)}>Remove area</button></div>
  </div>;
}

function ProjectView({ project, area, tasks, toggleTask, renameProject, renameTask, updateTask, reorderProps, taskSort, setTaskSort, updateProject, removeProject }: { project: Project; area: Area; tasks: Task[]; toggleTask: (id: string) => void; renameProject: (id: string, value: string) => void; renameTask: (id: string, value: string) => void; updateTask: (id: string, patch: Partial<Pick<Task, "dueDate" | "priority">>) => void; reorderProps: (item: DragItem) => ReorderProps; taskSort: TaskSort; setTaskSort: (sort: TaskSort) => void; updateProject: (patch: Partial<Project>) => void; removeProject: (id: string) => void }) {
  return <div className="page"><div className="breadcrumb">{area.name} / Project</div><div className="page-heading project-heading"><div><NameEditor large value={project.name} onSave={(value) => renameProject(project.id, value)} label={`Project name for ${project.name}`} /><textarea className="outcome-editor" value={project.outcome} onChange={(event) => updateProject({ outcome: event.target.value })} aria-label="Project outcome" /></div><div className="quiet-count">{tasks.filter((task) => !task.done).length}<span>open tasks</span></div></div>
    <div className="project-workspace"><section className="project-tasks"><div className="section-title"><h2>Tasks</h2><TaskSortControl value={taskSort} onChange={setTaskSort} /></div><TaskRows tasks={tasks} toggleTask={toggleTask} renameTask={renameTask} updateTask={updateTask} reorderProps={reorderProps} scope={`project:${project.id}`} taskSort={taskSort} empty="Add the next concrete action using the field above." /></section>
    <section className="project-notes"><div className="section-title"><h2>Project notes</h2><span>Synced securely</span></div><textarea value={project.notes} onChange={(event) => updateProject({ notes: event.target.value })} placeholder="Keep decisions, references, observations, and useful context here…" aria-label={`Notes for ${project.name}`} /><p>Notes stay with this project—never in a disconnected pile.</p></section></div>
    <div className="danger-zone"><div><strong>Remove this project</strong><p>This also removes its synced tasks and notes.</p></div><button onClick={() => removeProject(project.id)}>Remove project</button></div>
  </div>;
}

function Review({ reviewed, toggleReviewed, inboxCount }: { reviewed: number[]; toggleReviewed: (index: number) => void; inboxCount: number }) {
  return <div className="page"><div className="page-heading"><div><h1>Reset your bearing.</h1><p>Make the system lighter before asking it to carry another week.</p></div><div className="quiet-count">{reviewed.length}/5<span>steps complete</span></div></div><div className="review-layout"><section className="review-steps">{reviewSteps.map(([title, copy], index) => <label aria-label={`${title}: ${index === 1 ? `${inboxCount} inbox items are waiting.` : copy}`} className={reviewed.includes(index) ? "complete" : ""} key={title}><input type="checkbox" checked={reviewed.includes(index)} onChange={() => toggleReviewed(index)} /><span><strong>{title}</strong><small>{index === 1 ? `${inboxCount} inbox items are waiting.` : copy}</small></span></label>)}</section><aside className="review-note"><span>Priority filter</span><h2>If this slips, what changes?</h2><dl><div><dt>Capital</dt><dd>Protect</dd></div><div><dt>Skills</dt><dd>Compound</dd></div><div><dt>Relationships</dt><dd>Be present</dd></div><div><dt>Everything else</dt><dd>Stay flexible</dd></div></dl><p>Consequences create priority. Urgency alone does not.</p></aside></div></div>;
}
