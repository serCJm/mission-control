"use client";

import { type ReactNode, useState } from "react";
import { type PlannerProject, type PlannerTask } from "./planner";

export function BlockProjectWork({ projects, tasks, selectedTaskIds, full, onQueue, onCreateTask, onCreateProject, renderTask, renderProject }: {
  projects: PlannerProject[];
  tasks: PlannerTask[];
  selectedTaskIds: Set<string>;
  full: boolean;
  onQueue: (taskId: string) => void;
  onCreateTask: (title: string, projectId: string) => void;
  onCreateProject: (name: string) => string;
  renderTask: (taskId: string) => ReactNode;
  renderProject: (projectId: string) => ReactNode;
}) {
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const selectedProject = projects.find((project) => project.id === projectId);
  const visibleTasks = tasks.filter((task) => (!projectId || task.projectId === projectId) && (showFinished || task.status !== "done"));

  return <section className="block-project-work" aria-label="Projects and tasks in this area">
    <div className="block-work-heading"><h3>Projects & tasks</h3><button type="button" onClick={() => setShowProjectForm(!showProjectForm)} aria-expanded={showProjectForm}>{showProjectForm ? "Cancel" : "New project"}</button></div>
    {showProjectForm && <form className="block-work-create" onSubmit={(event) => { event.preventDefault(); if (!projectName.trim()) return; setProjectId(onCreateProject(projectName.trim())); setProjectName(""); setShowProjectForm(false); }}><input aria-label="New project name" placeholder="Project name" required maxLength={200} value={projectName} onChange={(event) => setProjectName(event.target.value)} /><button disabled={!projectName.trim()}>Create project</button></form>}
    <label className="planner-field"><span>Project</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects & area tasks</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    {selectedProject && <details className="planner-work-group"><summary>Project outcome & notes</summary>{renderProject(selectedProject.id)}</details>}
    <form className="block-work-create" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onCreateTask(title.trim(), projectId); setTitle(""); }}><input aria-label={`New task in ${selectedProject?.name ?? "this area"}`} placeholder={`Add a task${selectedProject ? " to this project" : " to this area"}…`} required maxLength={2000} value={title} onChange={(event) => setTitle(event.target.value)} /><button disabled={!title.trim()}>Add task</button></form>
    <div className="block-work-tasks">{visibleTasks.map((task) => <div className="block-work-task" key={task.id}>
      {renderTask(task.id)}
      <div className="block-work-task-footer"><small>{projects.find((project) => project.id === task.projectId)?.name ?? "Area task"}</small>{selectedTaskIds.has(task.id) ? <span>In this block</span> : task.status !== "done" && !task.waiting ? <button type="button" disabled={full} onClick={() => onQueue(task.id)} aria-label={`Choose ${task.title} for this block`}>Choose for block</button> : null}</div>
    </div>)}{!visibleTasks.length && <p className="planner-editor-empty">No open tasks here. Add the next useful action above.</p>}</div>
    <button type="button" className="block-work-finished" aria-pressed={showFinished} onClick={() => setShowFinished(!showFinished)}>{showFinished ? "Hide completed tasks" : "Show completed tasks"}</button>
  </section>;
}
