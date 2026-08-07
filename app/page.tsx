"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Area = { id: string; name: string; cue: string };
type Project = { id: string; areaId: string; name: string; outcome: string; notes: string };
type Task = { id: string; title: string; areaId?: string; projectId?: string; done: boolean; createdAt: number };
type Selection =
  | { kind: "today" | "inbox" | "review" }
  | { kind: "area"; id: string }
  | { kind: "project"; id: string };
type Workspace = { areas: Area[]; projects: Project[]; tasks: Task[] };

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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bearing-workspace-v2");
      if (saved) setWorkspace(JSON.parse(saved));
    } catch { /* Use the useful starter workspace. */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem("bearing-workspace-v2", JSON.stringify(workspace));
  }, [hydrated, workspace]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => { setToast(""); setUndoWorkspace(null); }, 5000);
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

  function updateProject(patch: Partial<Project>) {
    if (!activeProject) return;
    setWorkspace((current) => ({ ...current, projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, ...patch } : project) }));
  }

  const contextualTasks = workspace.tasks.filter((task) => activeProject ? task.projectId === activeProject.id : activeArea ? task.areaId === activeArea.id : false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="brand-row">
          <button className="brand" onClick={() => navigate({ kind: "today" })} aria-label="Bearing home"><span className="brand-mark">B</span><span>Bearing</span></button>
          <button className="close-menu" onClick={() => setMobileMenu(false)}>Close</button>
        </div>

        <nav className="primary-nav" aria-label="Workspace">
          <button className={selection.kind === "today" ? "active" : ""} onClick={() => navigate({ kind: "today" })}><span>Today</span><small>{openTasks.length}</small></button>
          <button className={selection.kind === "inbox" ? "active" : ""} onClick={() => navigate({ kind: "inbox" })}><span>Inbox</span><small>{inboxTasks.length}</small></button>
        </nav>

        <div className="tree-head"><span>Areas</span><button onClick={() => setShowAreaForm((value) => !value)}>{showAreaForm ? "Cancel" : "Add area"}</button></div>
        {showAreaForm && <form className="rail-form" onSubmit={addArea}><input autoFocus value={newArea} onChange={(event) => setNewArea(event.target.value)} placeholder="Area name" aria-label="New area name" /><button>Add</button></form>}
        <nav className="area-tree" aria-label="Areas and projects">
          {workspace.areas.map((area) => {
            const areaProjects = workspace.projects.filter((project) => project.areaId === area.id);
            const isOpen = expandedAreas.includes(area.id);
            return <div className="area-branch" key={area.id}>
              <div className="area-row"><button className={`area-link ${selection.kind === "area" && selection.id === area.id ? "active" : ""}`} onClick={() => navigate({ kind: "area", id: area.id })}><span>{area.name}</span><small>{workspace.tasks.filter((task) => task.areaId === area.id && !task.done).length}</small></button>{areaProjects.length > 0 && <button className={`disclosure ${isOpen ? "expanded" : ""}`} onClick={() => setExpandedAreas((current) => current.includes(area.id) ? current.filter((id) => id !== area.id) : [...current, area.id])} aria-label={`${isOpen ? "Collapse" : "Expand"} ${area.name} projects`} aria-expanded={isOpen}><span /></button>}</div>
              {isOpen && areaProjects.length > 0 && <div className="project-links">{areaProjects.map((project) => <button key={project.id} className={selection.kind === "project" && selection.id === project.id ? "active" : ""} onClick={() => navigate({ kind: "project", id: project.id })}>{project.name}</button>)}</div>}
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

        {selection.kind === "today" && <Today workspace={workspace} inboxTasks={inboxTasks} toggleTask={toggleTask} navigate={navigate} />}
        {selection.kind === "inbox" && <Inbox workspace={workspace} tasks={inboxTasks} toggleTask={toggleTask} moveTask={moveTask} />}
        {selection.kind === "area" && activeArea && <AreaView area={activeArea} projects={workspace.projects.filter((project) => project.areaId === activeArea.id)} tasks={contextualTasks} showProjectForm={showProjectForm} setShowProjectForm={setShowProjectForm} newProject={newProject} setNewProject={setNewProject} addProject={addProject} navigate={navigate} toggleTask={toggleTask} removeArea={removeArea} />}
        {selection.kind === "project" && activeProject && activeArea && <ProjectView project={activeProject} area={activeArea} tasks={contextualTasks} toggleTask={toggleTask} updateProject={updateProject} removeProject={removeProject} />}
        {selection.kind === "review" && <Review reviewed={reviewed} setReviewed={setReviewed} inboxCount={inboxTasks.length} />}
      </main>
      {toast && <div className="toast" role="status"><span>{toast}</span>{undoWorkspace && <button onClick={() => { setWorkspace(undoWorkspace); setUndoWorkspace(null); setToast("Restored"); }}>Undo removal</button>}</div>}
    </div>
  );
}

function TaskRows({ tasks, toggleTask, empty }: { tasks: Task[]; toggleTask: (id: string) => void; empty: string }) {
  if (!tasks.length) return <div className="empty-state"><strong>Nothing waiting here.</strong><p>{empty}</p></div>;
  return <div className="task-list">{tasks.map((task) => <label className={`task-row ${task.done ? "done" : ""}`} key={task.id}><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} /><span>{task.title}</span></label>)}</div>;
}

function Today({ workspace, inboxTasks, toggleTask, navigate }: { workspace: Workspace; inboxTasks: Task[]; toggleTask: (id: string) => void; navigate: (next: Selection) => void }) {
  const nextTasks = workspace.tasks.filter((task) => task.areaId && !task.done).slice(0, 5);
  return <div className="page today-page">
    <div className="page-heading"><div><h1>Choose what deserves today.</h1><p>A short field of meaningful work, with space left for reality.</p></div><div className="date"><span>Thursday</span><strong>August 6</strong></div></div>
    <div className="today-grid">
      <section className="work-queue"><div className="section-title"><h2>Up next</h2><span>{nextTasks.length} open</span></div><TaskRows tasks={nextTasks} toggleTask={toggleTask} empty="Add a task above, or leave the space open." /></section>
      <aside className="day-brief"><blockquote>Process over prediction.</blockquote><p>Judge the day by whether you followed the practice—not by a fragile outcome you could not fully control.</p><div className="brief-rule"><strong>2h 45m</strong><span>protected focus remains</span></div></aside>
    </div>
    <section className="area-overview"><div className="section-title"><h2>Areas</h2><span>Work in its proper context</span></div><div className="area-table">{workspace.areas.map((area) => <button key={area.id} onClick={() => navigate({ kind: "area", id: area.id })}><span className="area-initial">{area.name.charAt(0)}</span><span><strong>{area.name}</strong><small>{area.cue}</small></span><span className="area-count">{workspace.tasks.filter((task) => task.areaId === area.id && !task.done).length} open</span></button>)}</div></section>
    {inboxTasks.length > 0 && <button className="inbox-callout" onClick={() => navigate({ kind: "inbox" })}><span><strong>{inboxTasks.length} items need a home</strong><small>Process your inbox while context is fresh.</small></span><span>Open inbox</span></button>}
  </div>;
}

function Inbox({ workspace, tasks, toggleTask, moveTask }: { workspace: Workspace; tasks: Task[]; toggleTask: (id: string) => void; moveTask: (id: string, value: string) => void }) {
  return <div className="page"><div className="page-heading"><div><h1>Inbox</h1><p>Capture first. Give each item a proper home when you are ready.</p></div><div className="quiet-count">{tasks.length}<span>unprocessed</span></div></div>
    <section className="inbox-workspace">{tasks.length ? tasks.map((task) => <div className="inbox-row" key={task.id}><label><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} /><span>{task.title}</span></label><select defaultValue="inbox" onChange={(event) => moveTask(task.id, event.target.value)} aria-label={`Move ${task.title}`}><option value="inbox">Move to…</option>{workspace.areas.map((area) => <optgroup label={area.name} key={area.id}><option value={`area:${area.id}`}>{area.name} · no project</option>{workspace.projects.filter((project) => project.areaId === area.id).map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}</optgroup>)}</select></div>) : <div className="empty-state spacious"><strong>Your inbox is clear.</strong><p>New tasks added outside an area or project will land here.</p></div>}</section>
  </div>;
}

function AreaView({ area, projects, tasks, showProjectForm, setShowProjectForm, newProject, setNewProject, addProject, navigate, toggleTask, removeArea }: { area: Area; projects: Project[]; tasks: Task[]; showProjectForm: boolean; setShowProjectForm: (value: boolean) => void; newProject: string; setNewProject: (value: string) => void; addProject: (event: FormEvent) => void; navigate: (next: Selection) => void; toggleTask: (id: string) => void; removeArea: (id: string) => void }) {
  return <div className="page"><div className="breadcrumb">Area</div><div className="page-heading"><div><h1>{area.name}</h1><p>{area.cue}. Tasks added above will come directly here.</p></div><button className="secondary-button" onClick={() => setShowProjectForm(!showProjectForm)}>{showProjectForm ? "Cancel" : "New project"}</button></div>
    {showProjectForm && <form className="inline-create" onSubmit={addProject}><div><strong>Create a project in {area.name}</strong><span>Name a concrete body of work, not an ongoing responsibility.</span></div><input autoFocus value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="Project name" aria-label="Project name" /><button disabled={!newProject.trim()}>Create project</button></form>}
    <section className="project-section"><div className="section-title"><h2>Projects</h2><span>{projects.length} active</span></div>{projects.length ? <div className="project-list">{projects.map((project) => <button key={project.id} onClick={() => navigate({ kind: "project", id: project.id })}><span><strong>{project.name}</strong><small>{project.outcome}</small></span><span>{tasks.filter((task) => task.projectId === project.id && !task.done).length} tasks</span></button>)}</div> : <div className="empty-state"><strong>No projects yet.</strong><p>Create one when this area has a finite outcome to move.</p></div>}</section>
    <section className="loose-tasks"><div className="section-title"><h2>Area tasks</h2><span>Not assigned to a project</span></div><TaskRows tasks={tasks.filter((task) => !task.projectId)} toggleTask={toggleTask} empty="Tasks added here without a project will appear in this list." /></section>
    <div className="danger-zone"><div><strong>Remove this area</strong><p>This also removes its projects, tasks, and project notes from this device.</p></div><button onClick={() => removeArea(area.id)}>Remove area</button></div>
  </div>;
}

function ProjectView({ project, area, tasks, toggleTask, updateProject, removeProject }: { project: Project; area: Area; tasks: Task[]; toggleTask: (id: string) => void; updateProject: (patch: Partial<Project>) => void; removeProject: (id: string) => void }) {
  return <div className="page"><div className="breadcrumb">{area.name} / Project</div><div className="page-heading project-heading"><div><h1>{project.name}</h1><textarea className="outcome-editor" value={project.outcome} onChange={(event) => updateProject({ outcome: event.target.value })} aria-label="Project outcome" /></div><div className="quiet-count">{tasks.filter((task) => !task.done).length}<span>open tasks</span></div></div>
    <div className="project-workspace"><section className="project-tasks"><div className="section-title"><h2>Tasks</h2><span>Add above to file here automatically</span></div><TaskRows tasks={tasks} toggleTask={toggleTask} empty="Add the next concrete action using the field above." /></section>
    <section className="project-notes"><div className="section-title"><h2>Project notes</h2><span>Saved on this device</span></div><textarea value={project.notes} onChange={(event) => updateProject({ notes: event.target.value })} placeholder="Keep decisions, references, observations, and useful context here…" aria-label={`Notes for ${project.name}`} /><p>Notes stay with this project—never in a disconnected pile.</p></section></div>
    <div className="danger-zone"><div><strong>Remove this project</strong><p>This also removes its tasks and notes from this device.</p></div><button onClick={() => removeProject(project.id)}>Remove project</button></div>
  </div>;
}

function Review({ reviewed, setReviewed, inboxCount }: { reviewed: number[]; setReviewed: React.Dispatch<React.SetStateAction<number[]>>; inboxCount: number }) {
  return <div className="page"><div className="page-heading"><div><h1>Reset your bearing.</h1><p>Make the system lighter before asking it to carry another week.</p></div><div className="quiet-count">{reviewed.length}/5<span>steps complete</span></div></div><div className="review-layout"><section className="review-steps">{reviewSteps.map(([title, copy], index) => <label className={reviewed.includes(index) ? "complete" : ""} key={title}><input type="checkbox" checked={reviewed.includes(index)} onChange={() => setReviewed((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items, index])} /><span><strong>{title}</strong><small>{index === 1 ? `${inboxCount} inbox items are waiting.` : copy}</small></span></label>)}</section><aside className="review-note"><span>Priority filter</span><h2>If this slips, what changes?</h2><dl><div><dt>Capital</dt><dd>Protect</dd></div><div><dt>Skills</dt><dd>Compound</dd></div><div><dt>Relationships</dt><dd>Be present</dd></div><div><dt>Everything else</dt><dd>Stay flexible</dd></div></dl><p>Consequences create priority. Urgency alone does not.</p></aside></div></div>;
}
