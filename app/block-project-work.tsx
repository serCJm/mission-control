"use client";

import { type ReactNode, useId, useState } from "react";
import { type PlannerProject, type PlannerTask, type PlannerRoutineChoices } from "./planner";
import { RowActionMenu, CheckIcon, DeleteIcon, ReopenIcon, WaitIcon } from "./row-action-menu";
import { ContextSelect } from "./context-select";

export function BlockProjectWork({ areaName, projects, tasks, selectedTaskIds, full, onQueue, onTaskChange, onDeleteTask, onCreateTask, onCreateProject, onOpenTask, renderProject, routines }: {
  areaName: string;
  projects: PlannerProject[];
  tasks: PlannerTask[];
  selectedTaskIds: Set<string>;
  full: boolean;
  onQueue?: (taskId: string) => void;
  onTaskChange: (taskId: string, patch: Partial<Pick<PlannerTask, "status" | "waiting" | "someday">>) => void;
  onDeleteTask: (taskId: string) => void;
  onCreateTask: (title: string, projectId: string) => void;
  onCreateProject: (name: string) => string;
  onOpenTask: (task: PlannerTask) => void;
  renderProject: (projectId: string) => ReactNode;
  routines: PlannerRoutineChoices;
}) {
  const projectSelectId = useId();
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const [queue, setQueue] = useState("tasks");
  const selectedProject = projects.find((project) => project.id === projectId);
  const taskDestination = selectedProject?.name ?? `${areaName} backlog`;
  const scopedTasks = tasks.filter((task) => (!projectId || task.projectId === projectId) && (showFinished || task.status !== "done"));
  const queues = { all: scopedTasks, tasks: scopedTasks.filter((task) => task.projectId && !task.waiting), backlog: scopedTasks.filter((task) => !task.projectId && !task.waiting), waiting: scopedTasks.filter((task) => task.waiting) };
  const visibleTasks = queue === "routines" ? [] : queues[queue as keyof typeof queues];

  function renderTask(task: PlannerTask) {
    return <div className="planner-compact-source block-work-task" key={task.id}>
      <button type="button" className="block-task-open" onClick={() => onOpenTask(task)} aria-label={`Open ${task.title} in ${task.projectId ? "project" : "area"} workspace`}><span><strong>{task.title}</strong><small>{projects.find((project) => project.id === task.projectId)?.name ?? "Area task"}{task.status === "done" ? " · Completed" : task.waiting ? " · Waiting" : ""}{selectedTaskIds.has(task.id) && " · In this block"}</small></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 5 5 5-5 5" /></svg></button>
      <div className="planner-source-actions">{onQueue && !selectedTaskIds.has(task.id) && task.status !== "done" && !task.waiting ? <button type="button" className="planner-queue-button" disabled={full} onClick={() => onQueue(task.id)} aria-label={`Choose ${task.title} for this block`} title={full ? "This block already has three items" : "Add to block"}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h8M3.5 10h6M3.5 14.5h5M14 10.5v5M11.5 13h5" /></svg></button> : null}<div className="planner-row-actions"><RowActionMenu title={task.title}>{(choose) => <>
        <button type="button" role="menuitem" onClick={() => choose(() => onTaskChange(task.id, { status: task.status === "done" ? "todo" : "done", waiting: undefined }))}>{task.status === "done" ? <ReopenIcon /> : <CheckIcon />}<span>{task.status === "done" ? "Mark incomplete" : "Complete task"}</span></button>
        {task.status !== "done" && <button type="button" role="menuitem" onClick={() => choose(() => onTaskChange(task.id, { waiting: task.waiting ? undefined : true, someday: undefined }))}>{task.waiting ? <ReopenIcon /> : <WaitIcon />}<span>{task.waiting ? "Return to tasks" : "Move to Waiting"}</span></button>}
        <button type="button" role="menuitem" className="danger" onClick={() => choose(() => onDeleteTask(task.id))}><DeleteIcon /><span>Delete task</span></button>
      </>}</RowActionMenu></div></div>
    </div>;
  }

  return <section className="block-project-work" aria-label="Projects and tasks in this area">
    <div className="block-work-heading"><h3>Projects & tasks</h3><button type="button" className="block-project-create-toggle" onClick={() => setShowProjectForm(!showProjectForm)} aria-expanded={showProjectForm}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" /></svg><span>{showProjectForm ? "Cancel" : "New project"}</span></button></div>
    {showProjectForm && <form className="block-work-create" onSubmit={(event) => { event.preventDefault(); if (!projectName.trim()) return; setProjectId(onCreateProject(projectName.trim())); setProjectName(""); setShowProjectForm(false); }}><input aria-label="New project name" placeholder="Project name" required maxLength={200} value={projectName} onChange={(event) => setProjectName(event.target.value)} /><button disabled={!projectName.trim()}>Create project</button></form>}
    <div className="planner-field"><span>Project</span><ContextSelect id={projectSelectId} label="Project" value={projectId} onValueChange={setProjectId} options={[
      { value: "", label: "All projects & area tasks", icon: <QueueIcon queue="all" /> },
      ...projects.map((project) => ({ value: project.id, label: project.name, description: project.outcome, icon: <ProjectIcon /> })),
    ]} /></div>
    {selectedProject && <details className="planner-work-group"><summary>Project outcome & notes</summary>{renderProject(selectedProject.id)}</details>}
    <div className="block-work-filters">
      <nav className="planner-queue-tabs" aria-label="Area work queues">{[["all", "All", queues.all.length + routines.today.length], ["tasks", "Tasks", queues.tasks.length], ["backlog", "Backlog", queues.backlog.length], ["waiting", "Waiting", queues.waiting.length], ["routines", "Routines", routines.block.length]].map(([key, label, count]) => <button type="button" key={key} className={queue === key ? "active" : ""} aria-pressed={queue === key} onClick={() => setQueue(String(key))}><span className="planner-queue-icon"><QueueIcon queue={String(key)} /></span><span className="planner-queue-label">{label}</span><span className="planner-queue-count"><span>{count}</span></span></button>)}</nav>
      <button type="button" className="block-work-finished" role="switch" aria-checked={showFinished} onClick={() => setShowFinished(!showFinished)}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="m6.8 10 2.1 2.1 4.3-4.3" /></svg><span>Completed tasks</span><span className="block-work-switch" aria-hidden="true" /></button>
    </div>
    <div className="block-work-list">
    <form className="block-work-create block-task-create" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onCreateTask(title.trim(), projectId); setTitle(""); setQueue(projectId ? "tasks" : "backlog"); }}><input aria-label={`New task in ${taskDestination}`} placeholder={`Add to ${taskDestination}…`} required maxLength={2000} value={title} onChange={(event) => setTitle(event.target.value)} /><button type="submit" disabled={!title.trim()}>Add task</button></form>
    <div className="planner-queue-content">
      {visibleTasks.filter((task) => task.status !== "done").map(renderTask)}
      {queue === "all" && routines.today}
      {visibleTasks.filter((task) => task.status === "done").map(renderTask)}
      {queue === "routines" && (routines.block.length ? routines.block : <p className="planner-editor-empty">No routines left to add for this day.</p>)}
      {queue !== "routines" && !visibleTasks.length && (queue !== "all" || routines.today.length === 0) && <p className="planner-editor-empty">{queue === "all" ? "No tasks or routines here." : `No ${queue === "waiting" ? "waiting" : "open"} tasks here.`}</p>}
    </div>
    </div>
  </section>;
}

function ProjectIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 6a1.5 1.5 0 0 1 1.5-1.5h3.2l1.8 2h5a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 15 16H5a1.5 1.5 0 0 1-1.5-1.5Z" /></svg>;
}

function QueueIcon({ queue }: { queue: string }) {
  if (queue === "all") return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 5h8M8 10h8M8 15h8M4 5h.01M4 10h.01M4 15h.01" /></svg>;
  if (queue === "tasks") return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3.5" width="12" height="13" rx="2" /><path d="m6.8 8 1.3 1.3L10.5 7M7 13h6" /></svg>;
  if (queue === "backlog") return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5h12v11H4zM4 11h3l1.2 2h3.6l1.2-2h3" /></svg>;
  if (queue === "waiting") return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5v4l2.6 1.5" /></svg>;
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 8A5.8 5.8 0 0 0 5.4 6.1L4 8m0 0V4.5M4 8h3.5M4.5 12a5.8 5.8 0 0 0 10.1 1.9L16 12m0 0v3.5M16 12h-3.5" /></svg>;
}
