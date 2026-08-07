"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Area = { id: string; name: string; cue: string };
type Project = { id: string; areaId: string; name: string; outcome: string; notes: string };
type Task = { id: string; title: string; areaId?: string; projectId?: string; done: boolean; createdAt: number };
type Selection =
  | { kind: "today" | "inbox" | "review" }
  | { kind: "area"; id: string }
  | { kind: "project"; id: string };
type Workspace = { areas: Area[]; projects: Project[]; tasks: Task[] };
type EntityKind = "area" | "project" | "task";
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
    { id: "weekends", areaId: "family", name: "Present Weekends", outcome: "Plan and protect four device-light family blocks this month.", notes: "One anchor activity leaves enough room for spontaneity. Ask Maya: beach or museum?" },
    { id: "loops", areaId: "life", name: "Close the Loops", outcome: "Complete nagging administrative tasks in two weekly batches.", notes: "Keep the batch under 45 minutes. Stop when the timer ends." },
  ],
  tasks: [
    { id: "t1", title: "Mark pre-market levels and invalidation", areaId: "trading", projectId: "execution", done: false, createdAt: 1 },
    { id: "t2", title: "Review yesterday’s AAPL trade", areaId: "trading", projectId: "execution", done: false, createdAt: 2 },
    { id: "t3", title: "Replay one failed-breakout setup", areaId: "trading", projectId: "replay", done: false, createdAt: 3 },
    { id: "t4", title: "Complete deliberate-practice lesson", areaId: "growth", projectId: "practice", done: false, createdAt: 4 },
    { id: "t5", title: "Plan Saturday with Maya", areaId: "family", projectId: "weekends", done: false, createdAt: 5 },
    { id: "t6", title: "Send Q3 invoice", areaId: "life", projectId: "loops", done: false, createdAt: 6 },
    { id: "i1", title: "Compare new broker fee schedule", done: false, createdAt: 7 },
    { id: "i2", title: "Book annual dental appointments", done: false, createdAt: 8 },
  ],
};

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

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>(seed);
  const [selection, setSelection] = useState<Selection>({ kind: "today" });
  const [capture, setCapture] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newProject, setNewProject] = useState("");
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [undoWorkspace, setUndoWorkspace] = useState<Workspace | null>(null);
  const [expandedAreas, setExpandedAreas] = useState<string[]>(seed.areas.map((area) => area.id));
  const [dragged, setDragged] = useState<DragItem | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem("mission-control-workspace-v1") ?? localStorage.getItem("bearing-workspace-v2");
        if (saved) setWorkspace(JSON.parse(saved));
      } catch { /* Use the useful starter workspace. */ }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem("mission-control-workspace-v1", JSON.stringify(workspace));
  }, [hydrated, workspace]);

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
    setWorkspace((current) => ({ ...current, areas: [...current.areas, area] }));
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
      areas: current.areas.filter((item) => item.id !== areaId),
      projects: current.projects.filter((project) => project.areaId !== areaId),
      tasks: current.tasks.filter((task) => task.areaId !== areaId && !projectIds.includes(task.projectId ?? "")),
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

  function updateProject(patch: Partial<Project>) {
    if (!activeProject) return;
    setWorkspace((current) => ({ ...current, projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, ...patch } : project) }));
  }

  function idsFor(item: DragItem, current = workspace) {
    if (item.kind === "area") return current.areas.map((area) => area.id);
    if (item.kind === "project") return current.projects.filter((project) => project.areaId === item.scope).map((project) => project.id);
    if (item.scope === "today") return current.tasks.filter((task) => task.areaId && !task.done).slice(0, 5).map((task) => task.id);
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

  function sortItems(kind: EntityKind, scope: string) {
    setWorkspace((current) => {
      if (kind === "area") return { ...current, areas: [...current.areas].sort((a, b) => a.name.localeCompare(b.name)) };
      if (kind === "project") {
        const scoped = current.projects.filter((project) => project.areaId === scope).sort((a, b) => a.name.localeCompare(b.name));
        let index = 0;
        return { ...current, projects: current.projects.map((project) => project.areaId === scope ? scoped[index++] : project) };
      }
      const scoped = current.tasks.filter((task) => taskScope(task) === scope).sort((a, b) => a.title.localeCompare(b.title));
      let index = 0;
      return { ...current, tasks: current.tasks.map((task) => taskScope(task) === scope ? scoped[index++] : task) };
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
          {workspace.areas.map((area) => {
            const areaProjects = workspace.projects.filter((project) => project.areaId === area.id);
            const isOpen = expandedAreas.includes(area.id);
            const descriptor = { kind: "area" as const, id: area.id, scope: "all" };
            return <div className={`area-branch ${dragged?.id === area.id ? "dragging" : ""}`} key={area.id} onDragOver={(event) => dragOver(event, descriptor)} onDrop={(event) => drop(event, descriptor)}>
              <div className="area-row"><DragHandle {...reorderProps(descriptor)} label={`Reorder ${area.name}`} compact /><button className={`area-link ${selection.kind === "area" && selection.id === area.id ? "active" : ""}`} onClick={() => navigate({ kind: "area", id: area.id })}><span>{area.name}</span><small>{workspace.tasks.filter((task) => task.areaId === area.id && !task.done).length}</small></button>{areaProjects.length > 0 && <button className={`disclosure ${isOpen ? "expanded" : ""}`} onClick={() => setExpandedAreas((current) => current.includes(area.id) ? current.filter((id) => id !== area.id) : [...current, area.id])} aria-label={`${isOpen ? "Collapse" : "Expand"} ${area.name} projects`} aria-expanded={isOpen}><span /></button>}</div>
              {isOpen && areaProjects.length > 0 && <div className="project-links">{areaProjects.map((project) => {
                const projectDescriptor = { kind: "project" as const, id: project.id, scope: area.id };
                return <div key={project.id} onDragOver={(event) => dragOver(event, projectDescriptor)} onDrop={(event) => drop(event, projectDescriptor)}><DragHandle {...reorderProps(projectDescriptor)} label={`Reorder ${project.name}`} compact /><button className={selection.kind === "project" && selection.id === project.id ? "active" : ""} onClick={() => navigate({ kind: "project", id: project.id })}>{project.name}</button></div>;
              })}</div>}
            </div>;
          })}
        </nav>

        <button className={`review-link ${selection.kind === "review" ? "active" : ""}`} onClick={() => navigate({ kind: "review" })}><span>Weekly review</span><small>{reviewed.length}/5</small></button>
        <div className="sidebar-foot"><div><strong>Week 32</strong><span>{completeCount} tasks completed</span></div><p>Steady over busy.</p></div>
      </aside>

      {mobileMenu && <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="Close menu" />}

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu(true)}>Menu</button>
          <form className="quick-add" onSubmit={addTask}>
            <label htmlFor="quick-task" className="sr-only">Add a task to {captureDestination}</label>
            <input id="quick-task" value={capture} onChange={(event) => setCapture(event.target.value)} placeholder={`Add a task to ${captureDestination}…`} />
            <button disabled={!capture.trim()}>Add task <span>to {captureDestination}</span></button>
          </form>
        </header>

        {selection.kind === "today" && <Today workspace={workspace} inboxTasks={inboxTasks} toggleTask={toggleTask} renameTask={renameTask} renameArea={renameArea} navigate={navigate} reorderProps={reorderProps} sortItems={sortItems} />}
        {selection.kind === "inbox" && <Inbox workspace={workspace} tasks={inboxTasks} toggleTask={toggleTask} renameTask={renameTask} moveTask={moveTask} reorderProps={reorderProps} sortItems={sortItems} />}
        {selection.kind === "area" && activeArea && <AreaView area={activeArea} projects={workspace.projects.filter((project) => project.areaId === activeArea.id)} tasks={contextualTasks} showProjectForm={showProjectForm} setShowProjectForm={setShowProjectForm} newProject={newProject} setNewProject={setNewProject} addProject={addProject} navigate={navigate} toggleTask={toggleTask} renameArea={renameArea} renameProject={renameProject} renameTask={renameTask} reorderProps={reorderProps} sortItems={sortItems} removeArea={removeArea} />}
        {selection.kind === "project" && activeProject && activeArea && <ProjectView project={activeProject} area={activeArea} tasks={contextualTasks} toggleTask={toggleTask} renameProject={renameProject} renameTask={renameTask} reorderProps={reorderProps} sortItems={sortItems} updateProject={updateProject} removeProject={removeProject} />}
        {selection.kind === "review" && <Review reviewed={reviewed} setReviewed={setReviewed} inboxCount={inboxTasks.length} />}
      </main>
      {toast && <div className="toast" role="status"><span>{toast}</span>{undoWorkspace && <button onClick={() => { setWorkspace(undoWorkspace); setUndoWorkspace(null); setToast("Restored"); }}>Undo removal</button>}</div>}
    </div>
  );
}

function LogoMark() {
  return <span className="brand-mark" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit-core" /><span className="orbit-signal" /></span>;
}

function DragHandle({ descriptor, onDragStart, onDragEnd, onMove, label, compact = false }: ReorderProps & { label: string; compact?: boolean }) {
  return <div className={`order-controls ${compact ? "compact" : ""}`}>
    <button className="drag-handle" draggable onDragStart={(event) => onDragStart(event, descriptor)} onDragEnd={onDragEnd} aria-label={`${label}. Drag to change order.`} title="Drag to reorder"><span /><span /><span /><span /></button>
    {!compact && <div className="step-controls"><button onClick={() => onMove(descriptor, -1)} aria-label={`Move ${label.replace("Reorder ", "")} up`} title="Move up"><i /></button><button onClick={() => onMove(descriptor, 1)} aria-label={`Move ${label.replace("Reorder ", "")} down`} title="Move down"><i /></button></div>}
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

function TaskRows({ tasks, toggleTask, renameTask, reorderProps, empty, scope }: { tasks: Task[]; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; reorderProps: (item: DragItem) => ReorderProps; empty: string; scope: string }) {
  if (!tasks.length) return <div className="empty-state"><strong>Nothing waiting here.</strong><p>{empty}</p></div>;
  return <div className="task-list">{tasks.map((task) => {
    const descriptor = { kind: "task" as const, id: task.id, scope };
    const reorder = reorderProps(descriptor);
    return <div className={`task-row ${task.done ? "done" : ""}`} key={task.id} onDragOver={(event) => reorder.onDragOver(event, descriptor)} onDrop={(event) => reorder.onDrop(event, descriptor)}>
      <DragHandle {...reorder} label={`Reorder ${task.title}`} />
      <label className="task-check"><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} /><span className="sr-only">Mark {task.title} {task.done ? "incomplete" : "complete"}</span></label>
      <NameEditor value={task.title} onSave={(value) => renameTask(task.id, value)} label={`Task name for ${task.title}`} />
    </div>;
  })}</div>;
}

function Today({ workspace, inboxTasks, toggleTask, renameTask, renameArea, navigate, reorderProps, sortItems }: { workspace: Workspace; inboxTasks: Task[]; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; renameArea: (id: string, value: string) => void; navigate: (next: Selection) => void; reorderProps: (item: DragItem) => ReorderProps; sortItems: (kind: EntityKind, scope: string) => void }) {
  const nextTasks = workspace.tasks.filter((task) => task.areaId && !task.done).slice(0, 5);
  return <div className="page today-page">
    <div className="page-heading"><div><h1>Choose what deserves today.</h1><p>A short field of meaningful work, with space left for reality.</p></div><div className="date"><span>Thursday</span><strong>August 6</strong></div></div>
    <div className="today-grid">
      <section className="work-queue"><div className="section-title"><h2>Up next</h2><span>{nextTasks.length} open</span></div><TaskRows tasks={nextTasks} toggleTask={toggleTask} renameTask={renameTask} reorderProps={reorderProps} scope="today" empty="Add a task above, or leave the space open." /></section>
      <aside className="day-brief"><blockquote>Process over prediction.</blockquote><p>Judge the day by whether you followed the practice—not by a fragile outcome you could not fully control.</p><div className="brief-rule"><strong>2h 45m</strong><span>protected focus remains</span></div></aside>
    </div>
    <section className="area-overview"><div className="section-title"><h2>Areas</h2><ListTools noun="areas" onSort={() => sortItems("area", "all")} /></div><div className="area-table">{workspace.areas.map((area) => {
      const descriptor = { kind: "area" as const, id: area.id, scope: "all" };
      const reorder = reorderProps(descriptor);
      return <div className="entity-row area-entity" key={area.id} onDragOver={(event) => reorder.onDragOver(event, descriptor)} onDrop={(event) => reorder.onDrop(event, descriptor)}>
        <DragHandle {...reorder} label={`Reorder ${area.name}`} />
        <span className="area-initial">{area.name.charAt(0)}</span>
        <div className="entity-copy"><NameEditor value={area.name} onSave={(value) => renameArea(area.id, value)} label={`Area name for ${area.name}`} /><small>{area.cue}</small></div>
        <span className="area-count">{workspace.tasks.filter((task) => task.areaId === area.id && !task.done).length} open</span>
        <button className="open-link" onClick={() => navigate({ kind: "area", id: area.id })}>Open</button>
      </div>;
    })}</div></section>
    {inboxTasks.length > 0 && <button className="inbox-callout" onClick={() => navigate({ kind: "inbox" })}><span><strong>{inboxTasks.length} items need a home</strong><small>Process your inbox while context is fresh.</small></span><span>Open inbox</span></button>}
  </div>;
}

function Inbox({ workspace, tasks, toggleTask, renameTask, moveTask, reorderProps, sortItems }: { workspace: Workspace; tasks: Task[]; toggleTask: (id: string) => void; renameTask: (id: string, value: string) => void; moveTask: (id: string, value: string) => void; reorderProps: (item: DragItem) => ReorderProps; sortItems: (kind: EntityKind, scope: string) => void }) {
  return <div className="page"><div className="page-heading"><div><h1>Inbox</h1><p>Capture first. Give each item a proper home when you are ready.</p></div><div className="quiet-count">{tasks.length}<span>unprocessed</span></div></div>
    <section className="inbox-workspace"><div className="section-title inbox-title"><h2>Unprocessed tasks</h2><ListTools noun="tasks" onSort={() => sortItems("task", "inbox")} /></div>{tasks.length ? tasks.map((task) => {
      const descriptor = { kind: "task" as const, id: task.id, scope: "inbox" };
      const reorder = reorderProps(descriptor);
      return <div className="inbox-row" key={task.id} onDragOver={(event) => reorder.onDragOver(event, descriptor)} onDrop={(event) => reorder.onDrop(event, descriptor)}><DragHandle {...reorder} label={`Reorder ${task.title}`} /><label className="task-check"><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} /><span className="sr-only">Complete {task.title}</span></label><NameEditor value={task.title} onSave={(value) => renameTask(task.id, value)} label={`Task name for ${task.title}`} /><select defaultValue="inbox" onChange={(event) => moveTask(task.id, event.target.value)} aria-label={`Move ${task.title}`}><option value="inbox">Move to…</option>{workspace.areas.map((area) => <optgroup label={area.name} key={area.id}><option value={`area:${area.id}`}>{area.name} · no project</option>{workspace.projects.filter((project) => project.areaId === area.id).map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}</optgroup>)}</select></div>;
    }) : <div className="empty-state spacious"><strong>Your inbox is clear.</strong><p>New tasks added outside an area or project will land here.</p></div>}</section>
  </div>;
}

function AreaView({ area, projects, tasks, showProjectForm, setShowProjectForm, newProject, setNewProject, addProject, navigate, toggleTask, renameArea, renameProject, renameTask, reorderProps, sortItems, removeArea }: { area: Area; projects: Project[]; tasks: Task[]; showProjectForm: boolean; setShowProjectForm: (value: boolean) => void; newProject: string; setNewProject: (value: string) => void; addProject: (event: FormEvent) => void; navigate: (next: Selection) => void; toggleTask: (id: string) => void; renameArea: (id: string, value: string) => void; renameProject: (id: string, value: string) => void; renameTask: (id: string, value: string) => void; reorderProps: (item: DragItem) => ReorderProps; sortItems: (kind: EntityKind, scope: string) => void; removeArea: (id: string) => void }) {
  const looseTasks = tasks.filter((task) => !task.projectId);
  return <div className="page"><div className="breadcrumb">Area</div><div className="page-heading"><div><NameEditor large value={area.name} onSave={(value) => renameArea(area.id, value)} label={`Area name for ${area.name}`} /><p>{area.cue}. Tasks added above will come directly here.</p></div><button className="secondary-button" onClick={() => setShowProjectForm(!showProjectForm)}>{showProjectForm ? "Cancel" : "New project"}</button></div>
    {showProjectForm && <form className="inline-create" onSubmit={addProject}><div><strong>Create a project in {area.name}</strong><span>Name a concrete body of work, not an ongoing responsibility.</span></div><input value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="Project name" aria-label="Project name" /><button disabled={!newProject.trim()}>Create project</button></form>}
    <section className="project-section"><div className="section-title"><h2>Projects <small>{projects.length} active</small></h2><ListTools noun="projects" onSort={() => sortItems("project", area.id)} /></div>{projects.length ? <div className="project-list">{projects.map((project) => {
      const descriptor = { kind: "project" as const, id: project.id, scope: area.id };
      const reorder = reorderProps(descriptor);
      return <div className="entity-row project-entity" key={project.id} onDragOver={(event) => reorder.onDragOver(event, descriptor)} onDrop={(event) => reorder.onDrop(event, descriptor)}><DragHandle {...reorder} label={`Reorder ${project.name}`} /><div className="entity-copy"><NameEditor value={project.name} onSave={(value) => renameProject(project.id, value)} label={`Project name for ${project.name}`} /><small>{project.outcome}</small></div><span>{tasks.filter((task) => task.projectId === project.id && !task.done).length} tasks</span><button className="open-link" onClick={() => navigate({ kind: "project", id: project.id })}>Open</button></div>;
    })}</div> : <div className="empty-state"><strong>No projects yet.</strong><p>Create one when this area has a finite outcome to move.</p></div>}</section>
    <section className="loose-tasks"><div className="section-title"><h2>Area tasks</h2><ListTools noun="tasks" onSort={() => sortItems("task", `area:${area.id}`)} /></div><TaskRows tasks={looseTasks} toggleTask={toggleTask} renameTask={renameTask} reorderProps={reorderProps} scope={`area:${area.id}`} empty="Tasks added here without a project will appear in this list." /></section>
    <div className="danger-zone"><div><strong>Remove this area</strong><p>This also removes its projects, tasks, and project notes from this device.</p></div><button onClick={() => removeArea(area.id)}>Remove area</button></div>
  </div>;
}

function ProjectView({ project, area, tasks, toggleTask, renameProject, renameTask, reorderProps, sortItems, updateProject, removeProject }: { project: Project; area: Area; tasks: Task[]; toggleTask: (id: string) => void; renameProject: (id: string, value: string) => void; renameTask: (id: string, value: string) => void; reorderProps: (item: DragItem) => ReorderProps; sortItems: (kind: EntityKind, scope: string) => void; updateProject: (patch: Partial<Project>) => void; removeProject: (id: string) => void }) {
  return <div className="page"><div className="breadcrumb">{area.name} / Project</div><div className="page-heading project-heading"><div><NameEditor large value={project.name} onSave={(value) => renameProject(project.id, value)} label={`Project name for ${project.name}`} /><textarea className="outcome-editor" value={project.outcome} onChange={(event) => updateProject({ outcome: event.target.value })} aria-label="Project outcome" /></div><div className="quiet-count">{tasks.filter((task) => !task.done).length}<span>open tasks</span></div></div>
    <div className="project-workspace"><section className="project-tasks"><div className="section-title"><h2>Tasks</h2><ListTools noun="tasks" onSort={() => sortItems("task", `project:${project.id}`)} /></div><TaskRows tasks={tasks} toggleTask={toggleTask} renameTask={renameTask} reorderProps={reorderProps} scope={`project:${project.id}`} empty="Add the next concrete action using the field above." /></section>
    <section className="project-notes"><div className="section-title"><h2>Project notes</h2><span>Saved on this device</span></div><textarea value={project.notes} onChange={(event) => updateProject({ notes: event.target.value })} placeholder="Keep decisions, references, observations, and useful context here…" aria-label={`Notes for ${project.name}`} /><p>Notes stay with this project—never in a disconnected pile.</p></section></div>
    <div className="danger-zone"><div><strong>Remove this project</strong><p>This also removes its tasks and notes from this device.</p></div><button onClick={() => removeProject(project.id)}>Remove project</button></div>
  </div>;
}

function Review({ reviewed, setReviewed, inboxCount }: { reviewed: number[]; setReviewed: React.Dispatch<React.SetStateAction<number[]>>; inboxCount: number }) {
  return <div className="page"><div className="page-heading"><div><h1>Reset your bearing.</h1><p>Make the system lighter before asking it to carry another week.</p></div><div className="quiet-count">{reviewed.length}/5<span>steps complete</span></div></div><div className="review-layout"><section className="review-steps">{reviewSteps.map(([title, copy], index) => <label aria-label={`${title}: ${index === 1 ? `${inboxCount} inbox items are waiting.` : copy}`} className={reviewed.includes(index) ? "complete" : ""} key={title}><input type="checkbox" checked={reviewed.includes(index)} onChange={() => setReviewed((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items, index])} /><span><strong>{title}</strong><small>{index === 1 ? `${inboxCount} inbox items are waiting.` : copy}</small></span></label>)}</section><aside className="review-note"><span>Priority filter</span><h2>If this slips, what changes?</h2><dl><div><dt>Capital</dt><dd>Protect</dd></div><div><dt>Skills</dt><dd>Compound</dd></div><div><dt>Relationships</dt><dd>Be present</dd></div><div><dt>Everything else</dt><dd>Stay flexible</dd></div></dl><p>Consequences create priority. Urgency alone does not.</p></aside></div></div>;
}
