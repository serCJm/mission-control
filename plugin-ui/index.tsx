import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
import type { Workspace } from "../app/workspace-schema";

const bridge = new App({ name: "Mission Control", version: "1.0.0" }, {});
type Snapshot = { workspace: Workspace | null; updatedAt: number };

function MissionControl() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [area, setArea] = useState("all");
  const [project, setProject] = useState("");
  const [title, setTitle] = useState("");
  const [showDone, setShowDone] = useState(false);

  function receive(result: { isError?: boolean; content?: unknown[]; structuredContent?: unknown }) {
    if (result.isError) {
      const message = (result.content as Array<{ text?: string }>)?.find((item) => item.text)?.text;
      throw new Error(message || "Unable to update your workspace. Refresh and try again.");
    }
    const data = result.structuredContent;
    if (data && typeof data === "object" && "workspace" in data && "updatedAt" in data && typeof data.updatedAt === "number") setSnapshot(data as Snapshot);
  }
  useEffect(() => {
    bridge.ontoolresult = (result) => { try { receive(result); } catch (error) { setError(String(error)); } };
    bridge.connect().then(async () => {
      setReady(true);
      receive(await bridge.callServerTool({ name: "get_workspace", arguments: {} }));
    }).catch(() => setError("Connect Mission Control in ChatGPT, then reopen this panel."));
  }, []);
  async function call(name: string, args: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try { receive(await bridge.callServerTool({ name, arguments: args })); return true; }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save. Refresh and try again."); return false; }
    finally { setBusy(false); }
  }
  const workspace = snapshot?.workspace;
  const projects = workspace?.projects.filter((item) => !item.completedAt && (area === "all" || item.areaId === area)) ?? [];
  const selectedProject = workspace?.projects.find((item) => item.id === project);
  const tasks = workspace?.tasks.filter((task) => (showDone || task.status !== "done") &&
    (area === "all" || (area === "inbox" ? !task.areaId : task.areaId === area)) && (!project || task.projectId === project)) ?? [];
  return <main>
    <header><div className="identity"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="1"/></svg><h1>Mission Control</h1></div><button className="quiet" onClick={() => bridge.openLink({ url: "https://focushq.work" }).catch(() => setError("Open focushq.work to use the full workspace."))}>Full workspace</button></header>
    <section className="toolbar" aria-label="Filter tasks">
      <label>Area<select value={area} onChange={(event) => { setArea(event.target.value); setProject(""); }}><option value="all">All areas</option><option value="inbox">Inbox</option>{workspace?.areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Project<select value={project} onChange={(event) => setProject(event.target.value)} disabled={area === "inbox"}><option value="">All projects</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="quiet" disabled={!ready || busy} onClick={() => void call("get_workspace")}>Refresh</button>
    </section>
    {error && <div className="error" role="alert">{error}</div>}
    {!snapshot && !error && <p role="status">Loading your workspace…</p>}
    {snapshot && !workspace && <p>Open the full workspace to set up Mission Control, then refresh here.</p>}
    {workspace && <>
      <div className="heading"><div><h2>{selectedProject?.name ?? (area === "inbox" ? "Inbox" : workspace.areas.find((item) => item.id === area)?.name ?? "Your tasks")}</h2><p>{selectedProject?.outcome || "Choose a few things that matter. Leave room for the rest."}</p></div><label className="check"><input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)}/>Show completed</label></div>
      <form onSubmit={async (event) => { event.preventDefault(); if (!title.trim() || busy) return; const saved = await call("create_task", { title: title.trim(), expectedUpdatedAt: snapshot.updatedAt, ...(area !== "all" && area !== "inbox" ? { areaId: area } : {}), ...(project ? { projectId: project } : {}) }); if (saved) setTitle(""); }}>
        <label className="sr-only" htmlFor="task-title">New task</label><input id="task-title" value={title} maxLength={2000} onChange={(event) => setTitle(event.target.value)} placeholder={area === "all" || area === "inbox" ? "Capture a task in your inbox" : "Add a concrete next action"}/><button disabled={busy || !ready || !title.trim()}>Add task</button>
      </form>
      <ul className="tasks">{tasks.map((task) => <li key={task.id}>
        <input type="checkbox" aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`} checked={task.status === "done"} disabled={busy || !ready} onChange={() => void call("update_task", { taskId: task.id, status: task.status === "done" ? "todo" : "done", expectedUpdatedAt: snapshot.updatedAt })}/>
        <div><span className={task.status === "done" ? "completed" : ""}>{task.title}</span><p>{[workspace.projects.find((item) => item.id === task.projectId)?.name ?? workspace.areas.find((item) => item.id === task.areaId)?.name ?? "Inbox", task.waiting ? "Waiting" : task.someday ? "Someday" : task.status === "doing" ? "In progress" : null, task.dueDate ? `Due ${task.dueDate}${task.dueTime ? ` at ${task.dueTime}` : ""}` : null, task.priority ? `${task.priority} priority` : null].filter(Boolean).join(" · ")}</p>{task.notes && <details><summary>Task notes</summary><p className="note">{task.notes}</p></details>}</div>
      </li>)}</ul>
      {!tasks.length && <div className="empty"><h3>{showDone ? "No tasks here yet" : "Nothing outstanding here"}</h3><p>Capture a next action above, or choose another area.</p></div>}
      {selectedProject && <section className="notes"><h2>Project notes</h2>{selectedProject.notes.length ? selectedProject.notes.map((note) => <details key={note.id}><summary>{note.title}</summary><p className="note">{note.body}</p></details>) : <p>No notes yet. Ask ChatGPT to save a reference, lesson, or next action to this project.</p>}</section>}
    </>}
    <footer>Calendar, routines, and weekly review are available in the full workspace.</footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<MissionControl/>);
