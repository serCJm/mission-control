"use client";

import { useEffect, useMemo, useState } from "react";

type Area = "Trading" | "Personal Growth" | "Family" | "Business / Chores" | "Buffer";
type Task = { id: number; title: string; area: Area; impact: string; done?: boolean };
type InboxItem = { id: number; text: string };

const areas: { name: Area; window: string; tone: string; detail: string }[] = [
  { name: "Trading", window: "08:00–11:00", tone: "amber", detail: "Execute + review" },
  { name: "Personal Growth", window: "11:30–13:00", tone: "blue", detail: "Deep study" },
  { name: "Family", window: "15:30–18:30", tone: "rose", detail: "Protected time" },
  { name: "Business / Chores", window: "13:30–15:00", tone: "green", detail: "Keep life moving" },
  { name: "Buffer", window: "18:30–19:30", tone: "slate", detail: "Absorb the unexpected" },
];

const seedTasks: Task[] = [
  { id: 1, title: "Mark pre-market levels and invalidation", area: "Trading", impact: "Protects capital" },
  { id: 2, title: "Review yesterday’s AAPL trade", area: "Trading", impact: "Builds skill" },
  { id: 3, title: "Replay one failed-breakout setup", area: "Trading", impact: "Builds skill" },
  { id: 4, title: "Complete deliberate-practice lesson", area: "Personal Growth", impact: "Compounds skill" },
  { id: 5, title: "Plan Saturday with Maya", area: "Family", impact: "Strengthens relationships" },
  { id: 6, title: "Send Q3 invoice", area: "Business / Chores", impact: "Protects cash flow" },
  { id: 7, title: "Replace hallway light", area: "Business / Chores", impact: "Reduces friction" },
];

const projects = [
  { area: "Trading", name: "A-Setup Execution", progress: 12, total: 20, goal: "Execute and thoroughly review 20 valid trades while following defined risk rules.", next: "Tag the next five reviews with entry-quality notes.", accent: "amber" },
  { area: "Trading", name: "Market Replay Lab", progress: 7, total: 12, goal: "Complete 12 focused replay sessions and extract one rule refinement from each.", next: "Replay Tuesday’s failed breakout.", accent: "amber" },
  { area: "Personal Growth", name: "Deliberate Practice", progress: 4, total: 8, goal: "Finish eight lessons and apply each idea in a 30-minute practice session.", next: "Lesson 5: tighter feedback loops.", accent: "blue" },
  { area: "Family", name: "Present Weekends", progress: 3, total: 4, goal: "Plan and protect four device-light family blocks this month.", next: "Agree on Saturday’s outing.", accent: "rose" },
  { area: "Business / Chores", name: "Close the Loops", progress: 9, total: 14, goal: "Complete 14 nagging administrative tasks in two weekly batches.", next: "Send the Q3 invoice.", accent: "green" },
];

const noteGroups = [
  { project: "A-Setup Execution", updated: "Today", references: ["Risk playbook · v3", "Screenshot library · 28 examples"], insights: ["Entries after the second impulse are consistently late.", "A smaller stop is not safer when structure is unclear."], actions: ["Add MFE/MAE to review template", "Compare first-hour vs afternoon results"] },
  { project: "Deliberate Practice", updated: "Yesterday", references: ["Peak · Anders Ericsson", "Practice log"], insights: ["Short feedback loops beat longer passive study."], actions: ["Define success before the next session"] },
  { project: "Present Weekends", updated: "Mon", references: ["Shared family ideas list"], insights: ["One anchor activity leaves enough room for spontaneity."], actions: ["Ask Maya to choose between beach and museum"] },
];

const nav = ["Today", "Projects", "Notes", "Weekly Review"] as const;
type View = (typeof nav)[number];

export default function Home() {
  const [view, setView] = useState<View>("Today");
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [selected, setSelected] = useState<number[]>([1, 2]);
  const [inbox, setInbox] = useState<InboxItem[]>([
    { id: 1, text: "Compare new broker fee schedule" },
    { id: 2, text: "Book annual dental appointments" },
    { id: 3, text: "Idea: Sunday meal-prep shortcut" },
  ]);
  const [capture, setCapture] = useState("");
  const [activeArea, setActiveArea] = useState<Area>("Trading");
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bearing-state-v1");
      if (saved) {
        const state = JSON.parse(saved);
        if (state.tasks) setTasks(state.tasks);
        if (state.selected) setSelected(state.selected);
        if (state.inbox) setInbox(state.inbox);
        if (state.reviewed) setReviewed(state.reviewed);
      }
    } catch { /* keep useful defaults */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem("bearing-state-v1", JSON.stringify({ tasks, selected, inbox, reviewed }));
  }, [hydrated, inbox, reviewed, selected, tasks]);

  const contextTasks = useMemo(() => tasks.filter((task) => task.area === activeArea), [activeArea, tasks]);

  function toggleSelected(id: number) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  }

  function addInbox(event: React.FormEvent) {
    event.preventDefault();
    const text = capture.trim();
    if (!text) return;
    setInbox((items) => [...items, { id: Date.now(), text }]);
    setCapture("");
  }

  const completed = tasks.filter((task) => task.done).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("Today")} aria-label="Bearing home">
          <span className="brand-mark">B</span><span>Bearing</span>
        </button>
        <nav aria-label="Main navigation">
          {nav.map((item) => <button key={item} className={view === item ? "nav-item active" : "nav-item"} onClick={() => setView(item)}><span className="nav-dot" />{item}</button>)}
        </nav>
        <div className="sidebar-foot">
          <div className="week-ring" aria-label={`${completed} tasks completed`}><span>{completed}</span><small>/ 7</small></div>
          <div><strong>Week 32</strong><span>Steady over busy</span></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">B</span><strong>Bearing</strong></div>
          <div className="date-lockup"><span>THU</span><strong>August 6</strong></div>
          <p className="mantra">Make the week answer to what matters.</p>
          <button className="capture-shortcut" onClick={() => document.getElementById("capture")?.focus()}>＋ Capture</button>
        </header>

        <div className="mobile-nav" aria-label="Mobile navigation">{nav.map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "Weekly Review" ? "Review" : item}</button>)}</div>

        {view === "Today" && <div className="page today-page">
          <section className="hero-row">
            <div><p className="eyebrow">TODAY’S BEARING</p><h1>Choose the work<br />that fits the moment.</h1></div>
            <div className="focus-stat"><span>2h 45m</span><p>protected focus left</p></div>
          </section>

          <section className="schedule-card">
            <div className="section-heading"><div><p className="eyebrow">AREA BLOCKS</p><h2>A broad shape for the day</h2></div><span>Context, not a cage</span></div>
            <div className="area-strip">
              {areas.map((area) => <button key={area.name} className={`area-block ${area.tone} ${activeArea === area.name ? "selected" : ""}`} onClick={() => setActiveArea(area.name)}>
                <span>{area.window}</span><strong>{area.name}</strong><small>{area.detail}</small>
              </button>)}
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="context-card panel">
              <div className="section-heading compact"><div><p className="eyebrow">START THE BLOCK</p><h2>{activeArea}</h2></div><span>{selected.length}/3 chosen</span></div>
              <p className="helper">Choose up to three tasks for the context you have now.</p>
              <div className="task-list">
                {contextTasks.length ? contextTasks.map((task) => {
                  const isChosen = selected.includes(task.id);
                  return <button key={task.id} className={`task-row ${isChosen ? "chosen" : ""}`} onClick={() => toggleSelected(task.id)} aria-pressed={isChosen}>
                    <span className="check">{isChosen ? "✓" : ""}</span><span><strong>{task.title}</strong><small>{task.impact}</small></span><span className="impact">{task.area === "Trading" ? "CAPITAL + SKILL" : task.area.toUpperCase()}</span>
                  </button>;
                }) : <div className="empty-state">No queued tasks. Keep this block open or use it as buffer.</div>}
              </div>
              {selected.length === 3 && <p className="limit-note">Three is enough. Finish or release one before adding another.</p>}
            </section>

            <section className="inbox-card panel">
              <div className="section-heading compact"><div><p className="eyebrow">PARKING LOT</p><h2>Inbox</h2></div><span>{inbox.length} unprocessed</span></div>
              <form onSubmit={addInbox} className="capture-form"><label htmlFor="capture" className="sr-only">Capture a task or idea</label><input id="capture" value={capture} onChange={(e) => setCapture(e.target.value)} placeholder="Capture a stray task or idea…" /><button aria-label="Add to inbox">↵</button></form>
              <ul className="inbox-list">{inbox.slice(-4).reverse().map((item) => <li key={item.id}><span>↗</span>{item.text}<button onClick={() => setInbox((items) => items.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${item.text}`}>×</button></li>)}</ul>
              <p className="inbox-hint">Capture now. Clarify during the weekly review.</p>
            </section>
          </div>

          <section className="principle-banner"><span>01</span><p><strong>Process over prediction.</strong> Judge the day by whether you followed the practice—not by a fragile outcome you couldn’t fully control.</p><button onClick={() => setView("Projects")}>See active goals →</button></section>
        </div>}

        {view === "Projects" && <div className="page">
          <div className="page-title"><div><p className="eyebrow">ACTIVE PROJECTS</p><h1>Keep the field small.</h1><p>One or two projects per area. Every goal describes a process you can control.</p></div><div className="count-card"><strong>5</strong><span>active projects</span><small>across 4 areas</small></div></div>
          <div className="project-grid">{projects.map((project) => <article className={`project-card ${project.accent}`} key={project.name}>
            <div className="project-meta"><span>{project.area}</span><span>{project.progress}/{project.total}</span></div><h2>{project.name}</h2><p className="goal-label">CONTROLLABLE GOAL</p><p className="goal-copy">“{project.goal}”</p>
            <div className="progress-track"><span style={{ width: `${project.progress / project.total * 100}%` }} /></div><div className="next-action"><span>NEXT ACTION</span><strong>{project.next}</strong></div>
          </article>)}</div>
          <div className="capacity-rule"><strong>The capacity rule</strong><p>If a new project matters more, pause an existing one first. WIP is a choice.</p><span>1–2 / area</span></div>
        </div>}

        {view === "Notes" && <div className="page">
          <div className="page-title"><div><p className="eyebrow">PROJECT MEMORY</p><h1>Notes that lead somewhere.</h1><p>References, insights, and actions stay attached to the work they serve.</p></div></div>
          <div className="notes-layout"><div className="note-index">{noteGroups.map((group, index) => <button key={group.project} className={index === 0 ? "active" : ""}><span>{String(index + 1).padStart(2, "0")}</span><strong>{group.project}</strong><small>Updated {group.updated}</small></button>)}</div>
          <article className="note-sheet"><div className="note-head"><div><span>TRADING · PROJECT NOTES</span><h2>{noteGroups[0].project}</h2></div><button aria-label="More note options">•••</button></div>
            <div className="note-section"><h3>References & resources <span>{noteGroups[0].references.length}</span></h3>{noteGroups[0].references.map((item) => <p key={item} className="resource-link">↗ {item}</p>)}</div>
            <div className="note-section"><h3>Insights <span>{noteGroups[0].insights.length}</span></h3>{noteGroups[0].insights.map((item) => <blockquote key={item}>{item}</blockquote>)}</div>
            <div className="note-section"><h3>Next actions <span>{noteGroups[0].actions.length}</span></h3>{noteGroups[0].actions.map((item) => <label className="note-action" key={item}><input type="checkbox" /> <span>{item}</span></label>)}</div>
          </article></div>
        </div>}

        {view === "Weekly Review" && <div className="page review-page">
          <div className="page-title"><div><p className="eyebrow">WEEKLY REVIEW · 20 MIN</p><h1>Clear the deck.<br />Reset your bearing.</h1><p>Make the system lighter before you ask it to carry another week.</p></div><div className="review-progress"><strong>{reviewed.length}/5</strong><span>review steps</span></div></div>
          <div className="review-grid"><section className="review-list">{[
            ["Assess progress", "Look for evidence of practice, not just outcomes."], ["Process the inbox", `Clarify or discard ${inbox.length} parked items.`], ["Prune the irrelevant", "Remove tasks and notes that no longer earn attention."], ["Adjust priorities", "Weigh consequences for capital, skills, and relationships."], ["Protect buffer", "Leave capacity for what the plan cannot predict."],
          ].map(([title, copy], index) => <button key={title} className={reviewed.includes(index) ? "complete" : ""} onClick={() => setReviewed((items) => items.includes(index) ? items.filter((i) => i !== index) : [...items, index])}><span className="review-check">{reviewed.includes(index) ? "✓" : index + 1}</span><span><strong>{title}</strong><small>{copy}</small></span><span>→</span></button>)}</section>
          <aside className="priority-card"><p className="eyebrow">PRIORITY FILTER</p><h2>If this slips,<br />what changes?</h2><div className="stakes"><span><i className="capital" />Capital<strong>High</strong></span><span><i className="skills" />Skills<strong>High</strong></span><span><i className="relations" />Relationships<strong>Protected</strong></span><span><i className="noise" />Everything else<strong>Flexible</strong></span></div><p>Consequences create priority. Urgency alone does not.</p></aside></div>
          {reviewed.length === 5 && <div className="review-complete"><span>✓</span><div><strong>The deck is clear.</strong><p>You’ve made room for the week to bend without breaking.</p></div><button onClick={() => { setReviewed([]); setView("Today"); }}>Begin the week →</button></div>}
        </div>}
      </main>
    </div>
  );
}
