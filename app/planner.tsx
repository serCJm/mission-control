"use client";

import { DndContext, type DragEndEvent, type DragStartEvent, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { areaBlockConflict, formatPlannerTime, isPlannerCalendarTime, isPlannerDate, materializeAreaBlocks, MIN_AREA_BLOCK_MINUTES, normalizePlanner, PLANNER_END_MINUTES, PLANNER_START_MINUTES, PLANNER_TIME_ZONE, plannerDateKey, plannerMinutes, plannerTime, plannerWeekDates, plannerWeekday, recurringAreaBlockRulesConflict, shiftPlannerDate } from "./planner-schema.mjs";

export type PlannerArea = { id: string; name: string; icon: string };
export type PlannerProject = { id: string; areaId: string; name: string; outcome: string };
export type PlannerTask = { id: string; title: string; areaId?: string; projectId?: string; status: "todo" | "doing" | "done"; dueDate?: string; dueTime?: string; priority?: "low" | "medium" | "high"; someday?: boolean; waiting?: boolean };
export type AreaBlockRule = { id: string; areaId: string; weekdays: number[]; effectiveOn: string; startTime: string; endTime: string };
export type AreaBlockException = { id: string; ruleId: string; occurrenceDate: string; kind: "skip" | "override"; date?: string; startTime?: string; endTime?: string };
export type ProjectSession = { id: string; projectId: string; ruleId: string; occurrenceDate: string; startOffsetMinutes: number; durationMinutes: number };
export type PlannerData = { areaBlockRules: AreaBlockRule[]; areaBlockExceptions: AreaBlockException[]; projectSessions: ProjectSession[] };
type AreaOccurrence = { id: string; ruleId: string; sourceDate: string; areaId: string; date: string; startTime: string; endTime: string; exception: boolean };

type PlannerProps = {
  areas: PlannerArea[];
  projects: PlannerProject[];
  tasks: PlannerTask[];
  planner: PlannerData;
  focusTaskIds: string[];
  currentAreaId?: string;
  onChange: (planner: PlannerData) => void;
  onTaskChange: (taskId: string, patch: Pick<PlannerTask, "dueDate" | "dueTime">) => void;
  makeId: (prefix: string) => string;
  renderAreaIcon: (icon: string) => ReactNode;
  onNotice: (message: string) => void;
  onEditorOpenChange: (open: boolean) => void;
};
type PlannerDragData = { kind?: string; areaId?: string; projectId?: string; taskId?: string; occurrence?: AreaOccurrence };

const START_HOUR = PLANNER_START_MINUTES / 60;
const END_HOUR = PLANNER_END_MINUTES / 60;
const CALENDAR_START = plannerTime(PLANNER_START_MINUTES);
const CALENDAR_END = plannerTime(PLANNER_END_MINUTES);
const PIXELS_PER_MINUTE = 1;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function resizedAreaBlockEnd(startTime: string, endTime: string, deltaMinutes: number) {
  const startMinutes = plannerMinutes(startTime);
  return Math.max(startMinutes + MIN_AREA_BLOCK_MINUTES, Math.min(END_HOUR * 60, plannerMinutes(endTime) + deltaMinutes));
}

function formatWeekRange(dates: string[]) {
  const format = (value: string, includeYear = false) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(includeYear ? { year: "numeric" } : {}) }).format(new Date(`${value}T00:00:00Z`));
  return `${format(dates[0])} – ${format(dates[6], true)}`;
}

function formatDateNumber(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function formatBlockTime(value: string) {
  const minutes = plannerMinutes(value);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour < 12 ? "a" : "p"}`;
}

function taskPlanningLabel(task: PlannerTask) {
  if (task.priority) return `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`;
  if (task.status === "doing") return "In progress";
  if (task.dueDate) return `Due ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${task.dueDate}T00:00:00Z`))}`;
  return "Ready when needed";
}

function AreaDragItem({ area, selected, renderAreaIcon, onSelect, onConfigure }: { area: PlannerArea; selected: boolean; renderAreaIcon: PlannerProps["renderAreaIcon"]; onSelect: () => void; onConfigure: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `area:${area.id}`, data: { kind: "area", areaId: area.id } });
  return <div className={`planner-source ${selected ? "selected" : ""} ${isDragging ? "dragging" : ""}`} ref={setNodeRef}>
    <button type="button" className="planner-source-drag" {...listeners} {...attributes} aria-pressed={selected} aria-label={`Select ${area.name}, or drag it onto the week`} title={`Select ${area.name}, or drag it onto the week`} onClick={onSelect}><span className="planner-area-icon">{renderAreaIcon(area.icon)}</span><span><strong>{area.name}</strong><small>{selected ? "Showing this area" : "Select or drag"}</small></span><i aria-hidden="true"><b /><b /><b /></i></button>
    <button type="button" className="planner-source-settings" onClick={onConfigure}>Set schedule</button>
  </div>;
}

function ProjectDragItem({ project, area, onSchedule }: { project: PlannerProject; area?: PlannerArea; onSchedule: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `project:${project.id}`, data: { kind: "project", projectId: project.id } });
  return <div className={`planner-compact-source ${isDragging ? "dragging" : ""}`} ref={setNodeRef}><button type="button" className="planner-compact-drag" {...listeners} {...attributes} aria-label={`Drag ${project.name} into an ${area?.name ?? "area"} block`}><span className="planner-project-glyph" aria-hidden="true" /><span><strong>{project.name}</strong><small>{project.outcome || area?.name}</small></span></button><button type="button" onClick={onSchedule}>Schedule</button></div>;
}

function TaskDragItem({ task, area, focused, onSchedule }: { task: PlannerTask; area?: PlannerArea; focused: boolean; onSchedule: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task:${task.id}`, data: { kind: "task", taskId: task.id } });
  return <div className={`planner-compact-source ${isDragging ? "dragging" : ""}`} ref={setNodeRef}><button type="button" className="planner-compact-drag" {...listeners} {...attributes} aria-label={`Drag ${task.title} to set its deadline time`}><span className={`planner-task-glyph ${focused ? "focused" : ""}`} aria-hidden="true" /><span><strong>{task.title}</strong><small>{focused ? `Focused · ${area?.name ?? "Area"}` : taskPlanningLabel(task)}</small></span></button><button type="button" onClick={onSchedule}>Set time</button></div>;
}

function DropSlot({ date, minutes }: { date: string; minutes: number }) {
  const id = `slot:${date}:${minutes}`;
  const { isOver, setNodeRef } = useDroppable({ id, data: { kind: "slot", date, minutes } });
  return <div ref={setNodeRef} className={`planner-drop-slot ${isOver ? "over" : ""}`} style={{ top: (minutes - START_HOUR * 60) * PIXELS_PER_MINUTE, height: 15 * PIXELS_PER_MINUTE }} aria-hidden="true" />;
}

function AreaBlockCard({ occurrence, area, focusedTasks, timedTasks, sessions, projects, onOpen }: { occurrence: AreaOccurrence; area: PlannerArea; focusedTasks: PlannerTask[]; timedTasks: PlannerTask[]; sessions: ProjectSession[]; projects: PlannerProject[]; onOpen: () => void }) {
  const { attributes: moveAttributes, isDragging: isMoving, listeners: moveListeners, setNodeRef: setMoveNodeRef, transform: moveTransform } = useDraggable({ id: `block:${occurrence.id}`, data: { kind: "block", occurrence } });
  const { attributes: resizeAttributes, isDragging: isResizing, listeners: resizeListeners, setNodeRef: setResizeNodeRef, transform: resizeTransform } = useDraggable({ id: `resize:${occurrence.id}`, data: { kind: "resize", occurrence } });
  const startMinutes = plannerMinutes(occurrence.startTime);
  const endMinutes = plannerMinutes(occurrence.endTime);
  const top = (startMinutes - START_HOUR * 60) * PIXELS_PER_MINUTE;
  const resizeDelta = isResizing && resizeTransform ? Math.round(resizeTransform.y / 15) * 15 : 0;
  const previewEndMinutes = resizedAreaBlockEnd(occurrence.startTime, occurrence.endTime, resizeDelta);
  const height = (isResizing ? previewEndMinutes - startMinutes : endMinutes - startMinutes) * PIXELS_PER_MINUTE;
  const displayEndTime = isResizing ? plannerTime(previewEndMinutes) : occurrence.endTime;
  const transform = moveTransform ? `translate3d(${moveTransform.x}px,${moveTransform.y}px,0)` : undefined;
  return <article ref={setMoveNodeRef} className={`planner-area-block ${isMoving ? "moving" : ""} ${isResizing ? "resizing" : ""}`} style={{ top, height, transform }}>
    <button type="button" className="planner-block-move" {...moveListeners} {...moveAttributes} aria-label={`Move this ${area.name} occurrence`} title="Drag to move this occurrence"><i /><i /><i /></button>
    <button type="button" className="planner-block-main" onClick={onOpen} aria-label={`${area.name}, ${formatPlannerTime(occurrence.startTime)} to ${formatPlannerTime(displayEndTime)}. Open this occurrence.`}><span className="planner-block-copy"><span className="planner-block-title"><strong>{area.name}</strong></span><small>{formatBlockTime(occurrence.startTime)}–{formatBlockTime(displayEndTime)}</small></span></button>
    <div className="planner-block-contents">{sessions.map((session) => <button type="button" className="planner-project-session" onClick={onOpen} aria-label={`Edit ${projects.find((project) => project.id === session.projectId)?.name ?? "project session"}`} key={session.id}><strong>{projects.find((project) => project.id === session.projectId)?.name ?? "Project session"}</strong><small>{session.durationMinutes}m</small></button>)}{focusedTasks.map((task) => <button type="button" className="planner-focus-task" onClick={onOpen} aria-label={`View focused task ${task.title}`} key={task.id}><strong>{task.title}</strong></button>)}{timedTasks.map((task) => <button type="button" className="planner-deadline-task" onClick={onOpen} aria-label={`Edit time for ${task.title}`} key={task.id}><time>{formatPlannerTime(task.dueTime!)}</time><strong>{task.title}</strong></button>)}</div>
    <button type="button" ref={setResizeNodeRef} className="planner-block-resize" {...resizeListeners} {...resizeAttributes} aria-label={`Resize this ${area.name} occurrence`} title="Drag to resize this occurrence"><span /></button>
  </article>;
}

function ScheduleEditor({ rule, areas, initialAreaId, today, onSave, onDelete, onClose }: { rule?: AreaBlockRule; areas: PlannerArea[]; initialAreaId?: string; today: string; onSave: (rule: AreaBlockRule) => string | null; onDelete?: () => void; onClose: () => void }) {
  const [areaId, setAreaId] = useState(rule?.areaId ?? initialAreaId ?? areas[0]?.id ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? [plannerWeekday(today)]);
  const [startTime, setStartTime] = useState(rule?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(rule?.endTime ?? "10:00");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const validTimes = isPlannerCalendarTime(startTime) && isPlannerCalendarTime(endTime, true);
  const duration = validTimes ? plannerMinutes(endTime) - plannerMinutes(startTime) : 0;
  const canSave = Boolean(areaId && weekdays.length && validTimes && duration >= MIN_AREA_BLOCK_MINUTES);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    const issue = onSave({ id: rule?.id ?? "", areaId, weekdays: [...weekdays].sort((a, b) => a - b), effectiveOn: rule?.effectiveOn ?? today, startTime, endTime });
    if (issue) setError(issue);
  }

  return <form className="planner-editor" onSubmit={submit}>
    <div className="planner-editor-heading"><div><h2>{rule ? "Edit weekly block" : "Set an area schedule"}</h2><p>{rule ? "Changes apply to the recurring series." : "Protect a dependable place for this area."}</p></div><button type="button" onClick={onClose} aria-label="Close schedule settings">Close</button></div>
    <div className="planner-schedule-fields">
      <label className="planner-field"><span>Area</span><select required value={areaId} onChange={(event) => setAreaId(event.target.value)}>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>
      <fieldset className="planner-days"><legend>Repeats</legend><div>{[1, 2, 3, 4, 5, 6, 0].map((day) => <button type="button" aria-pressed={weekdays.includes(day)} aria-label={DAY_NAMES[day]} onClick={() => setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])} key={day}>{SHORT_DAY_NAMES[day].slice(0, 1)}</button>)}</div></fieldset>
      <div className="planner-time-fields"><label className="planner-field"><span>Starts</span><input required type="time" step="900" min={CALENDAR_START} max="22:30" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label className="planner-field"><span>Ends</span><input required type="time" step="900" min={startTime || CALENDAR_START} max={CALENDAR_END} value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>
    </div>
    {duration < MIN_AREA_BLOCK_MINUTES && <p className="planner-form-error" role="alert">Area blocks need at least 30 minutes.</p>}
    {error && <p className="planner-form-error" role="alert">{error}</p>}
    <div className="planner-editor-actions">{onDelete && <button type="button" className="planner-delete" onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}>{confirmDelete ? "Confirm delete" : "Delete schedule"}</button>}<span /><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="planner-save" disabled={!canSave}>{rule ? "Save series" : "Create schedule"}</button></div>
  </form>;
}

function OccurrenceEditor({ occurrence, area, projects, tasks, focusedTasks, planner, initialProjectId, initialTaskId, onSave, onSkip, onEditSeries, onPlannerChange, onTaskChange, onClose, makeId }: { occurrence: AreaOccurrence; area: PlannerArea; projects: PlannerProject[]; tasks: PlannerTask[]; focusedTasks: PlannerTask[]; planner: PlannerData; initialProjectId?: string; initialTaskId?: string; onSave: (date: string, startTime: string, endTime: string) => string | null; onSkip: () => void; onEditSeries: () => void; onPlannerChange: (planner: PlannerData) => void; onTaskChange: PlannerProps["onTaskChange"]; onClose: () => void; makeId: PlannerProps["makeId"] }) {
  const [date, setDate] = useState(occurrence.date);
  const [startTime, setStartTime] = useState(occurrence.startTime);
  const [endTime, setEndTime] = useState(occurrence.endTime);
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [projectStart, setProjectStart] = useState(occurrence.startTime);
  const [projectDuration, setProjectDuration] = useState(60);
  const [editingProjectSessionId, setEditingProjectSessionId] = useState("");
  const [taskId, setTaskId] = useState(initialTaskId ?? "");
  const [taskTime, setTaskTime] = useState(occurrence.startTime);
  const [error, setError] = useState("");
  const [confirmSkip, setConfirmSkip] = useState(false);
  const matchingProjects = projects.filter((project) => project.areaId === occurrence.areaId);
  const matchingTasks = tasks.filter((task) => task.areaId === occurrence.areaId && task.status !== "done" && !task.someday && !task.waiting);
  const scheduledTasks = matchingTasks.filter((task) => task.dueDate === occurrence.date && task.dueTime && task.dueTime >= occurrence.startTime && task.dueTime < occurrence.endTime);
  const sessions = planner.projectSessions.filter((session) => session.ruleId === occurrence.ruleId && session.occurrenceDate === occurrence.sourceDate);
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  function saveOccurrence(event: FormEvent) {
    event.preventDefault();
    if (!isPlannerDate(date) || !isPlannerCalendarTime(startTime) || !isPlannerCalendarTime(endTime, true) || plannerMinutes(endTime) - plannerMinutes(startTime) < MIN_AREA_BLOCK_MINUTES) {
      setError("Choose a valid date and a 30-minute block between 6 AM and 11 PM on the 15-minute grid.");
      return;
    }
    const issue = onSave(date, startTime, endTime);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    if (plannerWeekDates(date)[0] !== plannerWeekDates(occurrence.date)[0]) onClose();
  }

  function resetProjectSessionEditor() {
    setProjectId("");
    setProjectStart(occurrence.startTime);
    setProjectDuration(60);
    setEditingProjectSessionId("");
  }

  function editProjectSession(session: ProjectSession) {
    setProjectId(session.projectId);
    setProjectStart(plannerTime(plannerMinutes(occurrence.startTime) + session.startOffsetMinutes));
    setProjectDuration(session.durationMinutes);
    setEditingProjectSessionId(session.id);
    setError("");
  }

  function saveProjectSession() {
    if (!projectId || !isPlannerCalendarTime(projectStart)) return;
    const offset = plannerMinutes(projectStart) - plannerMinutes(occurrence.startTime);
    const available = plannerMinutes(occurrence.endTime) - plannerMinutes(projectStart);
    if (offset < 0 || available < 15 || projectDuration > available) {
      setError("Project sessions must stay inside the area block.");
      return;
    }
    const overlaps = sessions.some((session) => session.id !== editingProjectSessionId && offset < session.startOffsetMinutes + session.durationMinutes && session.startOffsetMinutes < offset + projectDuration);
    if (overlaps) {
      setError("That project session overlaps another session in this block.");
      return;
    }
    const nextSession = { id: editingProjectSessionId || makeId("project-session"), projectId, ruleId: occurrence.ruleId, occurrenceDate: occurrence.sourceDate, startOffsetMinutes: offset, durationMinutes: projectDuration };
    onPlannerChange({ ...planner, projectSessions: editingProjectSessionId ? planner.projectSessions.map((session) => session.id === editingProjectSessionId ? nextSession : session) : [...planner.projectSessions, nextSession] });
    resetProjectSessionEditor();
    setError("");
  }

  function scheduleTask() {
    if (!taskId) return;
    if (!isPlannerCalendarTime(taskTime) || taskTime < occurrence.startTime || taskTime >= occurrence.endTime) {
      setError("Choose a deadline time inside this area block.");
      return;
    }
    onTaskChange(taskId, { dueDate: occurrence.date, dueTime: taskTime });
    setTaskId("");
    setError("");
  }

  function editTaskTime(task: PlannerTask) {
    setTaskId(task.id);
    setTaskTime(task.dueTime ?? occurrence.startTime);
    setError("");
  }

  function removeTaskTime(task: PlannerTask) {
    onTaskChange(task.id, { dueTime: undefined });
    if (taskId === task.id) setTaskId("");
    setError("");
  }

  return <div className="planner-editor occurrence-editor">
    <div className="planner-editor-heading"><div><h2>{area.name} · this block</h2><p>Adjust only this occurrence, or open its weekly schedule.</p></div><button type="button" onClick={onClose}>Close</button></div>
    <form className="planner-occurrence-form" onSubmit={saveOccurrence}><label className="planner-field"><span>Date</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="planner-time-fields"><label className="planner-field"><span>Starts</span><input required type="time" step="900" min={CALENDAR_START} max="22:30" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label className="planner-field"><span>Ends</span><input required type="time" step="900" min={startTime || CALENDAR_START} max={CALENDAR_END} value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div><button type="submit" className="planner-inline-save">Save this occurrence</button></form>
    <section className="planner-editor-section"><div><h3>Project sessions</h3><span>{sessions.length}</span></div>{sessions.map((session) => <div className={`planner-session-row ${editingProjectSessionId === session.id ? "editing" : ""}`} key={session.id}><span><strong>{projectsById.get(session.projectId)?.name ?? "Project"}</strong><small>{formatPlannerTime(plannerTime(plannerMinutes(occurrence.startTime) + session.startOffsetMinutes))} · {session.durationMinutes} min</small></span><span className="planner-row-actions"><button type="button" onClick={() => editProjectSession(session)}>Edit</button><button type="button" className="danger" onClick={() => { onPlannerChange({ ...planner, projectSessions: planner.projectSessions.filter((item) => item.id !== session.id) }); if (editingProjectSessionId === session.id) resetProjectSessionEditor(); }}>Remove</button></span></div>)}{matchingProjects.length > 0 && <div className="planner-add-row"><select required value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Project"><option value="">Choose project…</option>{matchingProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><input required type="time" step="900" value={projectStart} min={occurrence.startTime} max={occurrence.endTime} onChange={(event) => setProjectStart(event.target.value)} aria-label="Project start time" /><select required value={projectDuration} onChange={(event) => setProjectDuration(Number(event.target.value))} aria-label="Project duration"><option value={30}>30 min</option><option value={60}>60 min</option><option value={90}>90 min</option><option value={120}>2 hours</option></select><span className="planner-add-actions"><button type="button" onClick={saveProjectSession} disabled={!projectId}>{editingProjectSessionId ? "Save" : "Add"}</button>{editingProjectSessionId && <button type="button" className="secondary" onClick={resetProjectSessionEditor}>Cancel</button>}</span></div>}</section>
    <section className="planner-editor-section"><div><h3>Timed tasks</h3><span>{scheduledTasks.length}</span></div>{scheduledTasks.map((task) => <div className={`planner-session-row ${taskId === task.id ? "editing" : ""}`} key={task.id}><span><strong>{task.title}</strong><small>{formatPlannerTime(task.dueTime!)}</small></span><span className="planner-row-actions"><button type="button" onClick={() => editTaskTime(task)}>Edit</button><button type="button" className="danger" onClick={() => removeTaskTime(task)}>Remove time</button></span></div>)}{matchingTasks.length > 0 ? <div className="planner-add-row task-schedule-row"><select required value={taskId} onChange={(event) => { const nextTask = matchingTasks.find((task) => task.id === event.target.value); setTaskId(event.target.value); if (nextTask?.dueTime) setTaskTime(nextTask.dueTime); }} aria-label="Task"><option value="">Choose task…</option>{matchingTasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select><input required type="time" step="900" value={taskTime} min={occurrence.startTime} max={occurrence.endTime} onChange={(event) => setTaskTime(event.target.value)} aria-label="Task deadline time" /><button type="button" onClick={scheduleTask} disabled={!taskId}>{scheduledTasks.some((task) => task.id === taskId) ? "Save time" : "Set time"}</button></div> : <p className="planner-editor-empty">No open area tasks are ready to schedule.</p>}{focusedTasks.length > 0 && <div className="planner-focus-summary"><strong>Focused automatically</strong><span>{focusedTasks.map((task) => task.title).join(" · ")}</span><small>Change these from Today’s focus selection.</small></div>}</section>
    {error && <p className="planner-form-error" role="alert">{error}</p>}
    <div className="planner-editor-actions occurrence-actions"><button type="button" className="planner-delete" onClick={() => confirmSkip ? onSkip() : setConfirmSkip(true)}>{confirmSkip ? "Confirm skip" : "Skip this block"}</button><span /><button type="button" onClick={onEditSeries}>Edit weekly schedule</button></div>
  </div>;
}

export function Planner({ areas, projects, tasks, planner, focusTaskIds, currentAreaId, onChange, onTaskChange, makeId, renderAreaIcon, onNotice, onEditorOpenChange }: PlannerProps) {
  const today = plannerDateKey();
  const [anchorDate, setAnchorDate] = useState(today);
  const dates = plannerWeekDates(anchorDate);
  const [selectedDate, setSelectedDate] = useState(dates.includes(today) ? today : dates[0]);
  const [editor, setEditor] = useState<{ kind: "series"; ruleId?: string; areaId?: string } | { kind: "occurrence"; occurrenceId: string; projectId?: string; taskId?: string } | null>(null);
  const [activeLabel, setActiveLabel] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState(currentAreaId ?? areas[0]?.id ?? "");
  useEffect(() => {
    onEditorOpenChange(editor !== null);
  }, [editor, onEditorOpenChange]);
  useEffect(() => () => onEditorOpenChange(false), [onEditorOpenChange]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 7 } }), useSensor(KeyboardSensor));
  const occurrences = materializeAreaBlocks(planner, dates) as AreaOccurrence[];
  const editingRule = editor?.kind === "series" && editor.ruleId ? planner.areaBlockRules.find((rule) => rule.id === editor.ruleId) : undefined;
  const editingOccurrence = editor?.kind === "occurrence" ? occurrences.find((occurrence) => occurrence.id === editor.occurrenceId) : undefined;
  const focusedTaskIds = new Set(focusTaskIds);
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? areas[0];
  const selectedAreaProjects = projects.filter((project) => project.areaId === selectedArea?.id);
  const selectedAreaTasks = tasks.filter((task) => task.areaId === selectedArea?.id && task.status !== "done" && !task.someday && !task.waiting);
  const selectedFocusedTasks = selectedAreaTasks.filter((task) => focusedTaskIds.has(task.id));
  const priorityRank = { high: 0, medium: 1, low: 2, none: 3 } as const;
  const nextTasks = selectedAreaTasks.filter((task) => !focusedTaskIds.has(task.id)).sort((left, right) => (priorityRank[left.priority ?? "none"] - priorityRank[right.priority ?? "none"]) || Number(left.status !== "doing") - Number(right.status !== "doing") || (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")).slice(0, 3);
  const visibleTaskIds = new Set([...selectedFocusedTasks, ...nextTasks].map((task) => task.id));
  const backlogTasks = selectedAreaTasks.filter((task) => !visibleTaskIds.has(task.id));
  const focusAssignments = (() => {
    const focused = focusTaskIds.map((id) => tasks.find((task) => task.id === id)).filter((task): task is PlannerTask => Boolean(task && task.status !== "done" && !task.dueTime));
    const upcomingDates = Array.from({ length: 21 }, (_, index) => shiftPlannerDate(today, index));
    const targets = (materializeAreaBlocks(planner, upcomingDates) as AreaOccurrence[]).filter((occurrence) => occurrence.areaId === currentAreaId && occurrence.date >= today);
    const byOccurrence = new Map<string, PlannerTask[]>();
    if (!targets.length) return { byOccurrence, unplaced: focused };
    focused.forEach((task, index) => {
      const target = targets[Math.min(index, targets.length - 1)];
      byOccurrence.set(target.id, [...(byOccurrence.get(target.id) ?? []), task]);
    });
    return { byOccurrence, unplaced: [] as PlannerTask[] };
  })();
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);
  const slots = Array.from({ length: (END_HOUR - START_HOUR) * 4 }, (_, index) => START_HOUR * 60 + index * 15);
  const currentTimeParts = new Intl.DateTimeFormat("en-US", { timeZone: PLANNER_TIME_ZONE, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  const currentMinutes = Number(currentTimeParts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(currentTimeParts.find((part) => part.type === "minute")?.value ?? 0);

  function showWeek(next: string) {
    const nextDates = plannerWeekDates(next);
    if (nextDates[0] !== dates[0]) setEditor((current) => current?.kind === "occurrence" ? null : current);
    setAnchorDate(next);
    setSelectedDate(nextDates.includes(today) ? today : nextDates[0]);
  }

  function changeWeek(distance: number) {
    showWeek(shiftPlannerDate(dates[0], distance * 7));
  }

  function commitPlanner(candidate: PlannerData) {
    const normalized = normalizePlanner(candidate, new Set(areas.map((area) => area.id)), new Map(projects.map((project) => [project.id, project.areaId]))) as PlannerData | null;
    if (!normalized) {
      onNotice("That planner change is outside the 15-minute calendar grid.");
      return false;
    }
    onChange(normalized);
    return true;
  }

  function saveRule(draft: AreaBlockRule) {
    const rule = { ...draft, id: draft.id || makeId("area-block") };
    const sessions = planner.projectSessions.filter((session) => session.ruleId === rule.id);
    if (editingRule && rule.areaId !== editingRule.areaId && sessions.length) return "Remove this series’ project sessions before assigning it to another area.";
    if (sessions.some((session) => session.occurrenceDate < rule.effectiveOn || !rule.weekdays.includes(plannerWeekday(session.occurrenceDate)))) return "Remove project sessions from days you are taking out of this schedule first.";
    const next = {
      ...planner,
      areaBlockRules: editingRule ? planner.areaBlockRules.map((item) => item.id === rule.id ? rule : item) : [...planner.areaBlockRules, rule],
      areaBlockExceptions: planner.areaBlockExceptions.filter((item) => item.ruleId !== rule.id || (item.occurrenceDate >= rule.effectiveOn && rule.weekdays.includes(plannerWeekday(item.occurrenceDate)))),
    };
    if (next.areaBlockRules.some((item) => item.id !== rule.id && recurringAreaBlockRulesConflict(rule, item))) return "That time overlaps another area block. Leave the space open or choose a different time.";
    const exceptionsByOccurrence = new Map(next.areaBlockExceptions.map((exception) => [`${exception.ruleId}:${exception.occurrenceDate}`, exception]));
    if (sessions.some((session) => {
      const exception = exceptionsByOccurrence.get(`${session.ruleId}:${session.occurrenceDate}`);
      const duration = exception?.kind === "override"
        ? plannerMinutes(exception.endTime!) - plannerMinutes(exception.startTime!)
        : plannerMinutes(rule.endTime) - plannerMinutes(rule.startTime);
      return session.startOffsetMinutes + session.durationMinutes > duration;
    })) return "A project session would fall outside the shorter block. Adjust or remove it first.";
    if (!commitPlanner(next)) return "Choose a valid block between 6 AM and 11 PM on the 15-minute grid.";
    setEditor(null);
    onNotice(editingRule ? "Weekly area schedule updated" : "Weekly area schedule created");
    return null;
  }

  function deleteRule() {
    if (!editingRule) return;
    commitPlanner({
      areaBlockRules: planner.areaBlockRules.filter((rule) => rule.id !== editingRule.id),
      areaBlockExceptions: planner.areaBlockExceptions.filter((item) => item.ruleId !== editingRule.id),
      projectSessions: planner.projectSessions.filter((item) => item.ruleId !== editingRule.id),
    });
    setEditor(null);
    onNotice("Area schedule removed");
  }

  function upsertOccurrenceException(occurrence: AreaOccurrence, date: string, startTime: string, endTime: string) {
    const exception: AreaBlockException = { id: planner.areaBlockExceptions.find((item) => item.ruleId === occurrence.ruleId && item.occurrenceDate === occurrence.sourceDate)?.id ?? makeId("area-block-exception"), ruleId: occurrence.ruleId, occurrenceDate: occurrence.sourceDate, kind: "override", date, startTime, endTime };
    const next = { ...planner, areaBlockExceptions: [...planner.areaBlockExceptions.filter((item) => !(item.ruleId === occurrence.ruleId && item.occurrenceDate === occurrence.sourceDate)), exception] };
    const nextOccurrences = materializeAreaBlocks(next, plannerWeekDates(date)) as AreaOccurrence[];
    const candidate = nextOccurrences.find((item) => item.id === occurrence.id);
    if (candidate && areaBlockConflict(candidate, nextOccurrences, candidate.id)) return "That change overlaps another area block.";
    const duration = plannerMinutes(endTime) - plannerMinutes(startTime);
    const sessions = planner.projectSessions.filter((session) => session.ruleId === occurrence.ruleId && session.occurrenceDate === occurrence.sourceDate);
    if (sessions.some((session) => session.startOffsetMinutes + session.durationMinutes > duration)) return "A project session would fall outside the shorter block. Adjust or remove it first.";
    if (!commitPlanner(next)) return "Choose a valid date and block between 6 AM and 11 PM on the 15-minute grid.";
    onNotice("This area block was adjusted");
    return null;
  }

  function skipOccurrence(occurrence: AreaOccurrence) {
    const exception: AreaBlockException = { id: planner.areaBlockExceptions.find((item) => item.ruleId === occurrence.ruleId && item.occurrenceDate === occurrence.sourceDate)?.id ?? makeId("area-block-exception"), ruleId: occurrence.ruleId, occurrenceDate: occurrence.sourceDate, kind: "skip" };
    commitPlanner({ ...planner, areaBlockExceptions: [...planner.areaBlockExceptions.filter((item) => !(item.ruleId === occurrence.ruleId && item.occurrenceDate === occurrence.sourceDate)), exception], projectSessions: planner.projectSessions.filter((session) => !(session.ruleId === occurrence.ruleId && session.occurrenceDate === occurrence.sourceDate)) });
    setEditor(null);
    onNotice("This area block was skipped");
  }

  function occurrenceAt(date: string, minutes: number, areaId?: string) {
    return occurrences.find((occurrence) => occurrence.date === date && (!areaId || occurrence.areaId === areaId) && plannerMinutes(occurrence.startTime) <= minutes && plannerMinutes(occurrence.endTime) > minutes);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLabel("");
    const active = event.active.data.current as PlannerDragData | undefined;
    const over = event.over?.data.current as { kind?: string; date?: string; minutes?: number } | undefined;
    if (!active?.kind) return;
    if (active.kind === "resize" && active.occurrence) {
      const delta = Math.round(event.delta.y / 15) * 15;
      if (!delta) return;
      const endMinutes = resizedAreaBlockEnd(active.occurrence.startTime, active.occurrence.endTime, delta);
      if (endMinutes === plannerMinutes(active.occurrence.endTime)) return;
      const issue = upsertOccurrenceException(active.occurrence, active.occurrence.date, active.occurrence.startTime, plannerTime(endMinutes));
      if (issue) onNotice(issue);
      return;
    }
    if (over?.kind !== "slot" || !over.date || over.minutes === undefined) return;
    if (active.kind === "block" && active.occurrence) {
      const duration = plannerMinutes(active.occurrence.endTime) - plannerMinutes(active.occurrence.startTime);
      if (over.minutes + duration > END_HOUR * 60) {
        onNotice("Move the block earlier so it ends before 11 PM");
        return;
      }
      const issue = upsertOccurrenceException(active.occurrence, over.date, plannerTime(over.minutes), plannerTime(over.minutes + duration));
      if (issue) onNotice(issue);
      return;
    }
    if (active.kind === "project" && active.projectId) {
      const project = projects.find((item) => item.id === active.projectId);
      const occurrence = project ? occurrenceAt(over.date, over.minutes, project.areaId) : undefined;
      if (!project || !occurrence) {
        onNotice("Drop a project inside an area block it belongs to");
        return;
      }
      const startOffsetMinutes = over.minutes - plannerMinutes(occurrence.startTime);
      const durationMinutes = Math.min(60, plannerMinutes(occurrence.endTime) - over.minutes);
      if (durationMinutes < 15) return;
      const siblingSessions = planner.projectSessions.filter((session) => session.ruleId === occurrence.ruleId && session.occurrenceDate === occurrence.sourceDate);
      if (siblingSessions.some((session) => startOffsetMinutes < session.startOffsetMinutes + session.durationMinutes && session.startOffsetMinutes < startOffsetMinutes + durationMinutes)) {
        onNotice("That project session overlaps another session");
        return;
      }
      if (!commitPlanner({ ...planner, projectSessions: [...planner.projectSessions, { id: makeId("project-session"), projectId: project.id, ruleId: occurrence.ruleId, occurrenceDate: occurrence.sourceDate, startOffsetMinutes, durationMinutes }] })) return;
      onNotice(`${project.name} scheduled`);
      return;
    }
    if (active.kind === "task" && active.taskId) {
      const task = tasks.find((item) => item.id === active.taskId);
      const occurrence = task?.areaId ? occurrenceAt(over.date, over.minutes, task.areaId) : undefined;
      if (!task || !occurrence) {
        onNotice("Drop a task inside a block for its area");
        return;
      }
      onTaskChange(task.id, { dueDate: over.date, dueTime: plannerTime(over.minutes) });
      onNotice("Task deadline time updated");
      return;
    }
    const areaId = active.areaId;
    if (active.kind !== "area" || !areaId) return;
    if (over.minutes + 60 > END_HOUR * 60) {
      onNotice("Drop the area earlier so its 60-minute block ends by 11 PM");
      return;
    }
    const startTime = plannerTime(over.minutes);
    const endTime = plannerTime(over.minutes + 60);
    const rule: AreaBlockRule = { id: makeId("area-block"), areaId, weekdays: [plannerWeekday(over.date)], effectiveOn: over.date, startTime, endTime };
    const next = { ...planner, areaBlockRules: [...planner.areaBlockRules, rule] };
    const nextOccurrences = materializeAreaBlocks(next, dates);
    const candidate = nextOccurrences.find((item) => item.ruleId === rule.id);
    if (candidate && areaBlockConflict(candidate, nextOccurrences, candidate.id)) {
      onNotice("That time is already protected by another area");
      return;
    }
    if (!commitPlanner(next)) return;
    setEditor({ kind: "series", ruleId: rule.id });
    onNotice("Weekly block added — adjust the series if needed");
  }

  function openNextOccurrenceForArea(areaId?: string, item?: { projectId?: string; taskId?: string }) {
    const upcomingDates = Array.from({ length: 90 }, (_, index) => shiftPlannerDate(today, index));
    const occurrence = (materializeAreaBlocks(planner, upcomingDates) as AreaOccurrence[]).find((item) => item.areaId === areaId && item.date >= today);
    if (!occurrence) {
      onNotice("Create an upcoming area block first");
      return;
    }
    setAnchorDate(occurrence.date);
    setSelectedDate(occurrence.date);
    setEditor({ kind: "occurrence", occurrenceId: occurrence.id, ...item });
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as PlannerDragData | undefined;
    if (data?.kind === "area") setActiveLabel(areas.find((area) => area.id === data.areaId)?.name ?? "Area block");
    else if (data?.kind === "project") setActiveLabel(projects.find((project) => project.id === data.projectId)?.name ?? "Project session");
    else if (data?.kind === "task") setActiveLabel(tasks.find((task) => task.id === data.taskId)?.title ?? "Task deadline");
    else if (data?.occurrence) setActiveLabel(areas.find((area) => area.id === data.occurrence?.areaId)?.name ?? "Area block");
  }

  return <DndContext sensors={sensors} onDragStart={handleDragStart} onDragCancel={() => setActiveLabel("")} onDragEnd={handleDragEnd}>
    <div className="page planner-page">
      <div className="planner-heading"><div><h1>Protect the shape of your week.</h1><p>Give each area a dependable place, then decide what belongs inside it.</p></div><div className="planner-week-controls"><button type="button" onClick={() => changeWeek(-1)} aria-label="Previous week"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5-5 5 5 5" /></svg></button><button type="button" className="planner-range" onClick={() => showWeek(today)}>{formatWeekRange(dates)}<small>{dates.includes(today) ? "This week" : "Return to this week"}</small></button><button type="button" onClick={() => changeWeek(1)} aria-label="Next week"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 5 5 5-5 5" /></svg></button></div></div>
      <div className="planner-mobile-days" role="tablist" aria-label="Days in this week">{dates.map((date) => <button type="button" role="tab" aria-selected={selectedDate === date} className={selectedDate === date ? "active" : ""} onClick={() => setSelectedDate(date)} key={date}><span>{SHORT_DAY_NAMES[plannerWeekday(date)]}</span><strong>{formatDateNumber(date)}</strong></button>)}</div>
      <div className="planner-layout">
        <aside className="planner-tray"><div className="planner-tray-heading"><div><h2>Area blocks</h2><p>Drag one into the week or set its repeating schedule.</p></div><button type="button" onClick={() => setEditor({ kind: "series", areaId: areas[0]?.id })}>New schedule</button></div>
          <div className="planner-sources">{areas.map((area) => <AreaDragItem area={area} selected={selectedArea?.id === area.id} renderAreaIcon={renderAreaIcon} onSelect={() => setSelectedAreaId(area.id)} onConfigure={() => { setSelectedAreaId(area.id); setEditor({ kind: "series", areaId: area.id }); }} key={area.id} />)}</div>
          {editor?.kind === "series" && <ScheduleEditor key={editingRule?.id ?? editor.areaId ?? "new"} rule={editingRule} areas={areas} initialAreaId={editor.areaId} today={today} onSave={saveRule} onDelete={editingRule ? deleteRule : undefined} onClose={() => setEditor(null)} />}
          {editor?.kind === "occurrence" && editingOccurrence && <OccurrenceEditor key={`${editingOccurrence.id}:${editingOccurrence.date}:${editingOccurrence.startTime}:${editingOccurrence.endTime}:${editor.projectId ?? ""}:${editor.taskId ?? ""}`} occurrence={editingOccurrence} area={areas.find((area) => area.id === editingOccurrence.areaId)!} projects={projects} tasks={tasks} focusedTasks={focusAssignments.byOccurrence.get(editingOccurrence.id) ?? []} planner={planner} initialProjectId={editor.projectId} initialTaskId={editor.taskId} onSave={(date, startTime, endTime) => upsertOccurrenceException(editingOccurrence, date, startTime, endTime)} onSkip={() => skipOccurrence(editingOccurrence)} onEditSeries={() => setEditor({ kind: "series", ruleId: editingOccurrence.ruleId })} onPlannerChange={(next) => { commitPlanner(next); }} onTaskChange={onTaskChange} onClose={() => setEditor(null)} makeId={makeId} />}
          {!editor && selectedArea && <section className="planner-area-context" aria-labelledby="planner-area-context-title"><header className="planner-context-heading"><div><h3 id="planner-area-context-title">{selectedArea.name}</h3><p>Keep the field small. Choose what will move this area forward when its block begins.</p></div><button type="button" onClick={() => openNextOccurrenceForArea(selectedArea.id)}>Open next block</button></header>{selectedArea.id === currentAreaId && focusAssignments.unplaced.length > 0 && <button type="button" className="planner-unplaced-focus" onClick={() => setEditor({ kind: "series", areaId: currentAreaId })}><strong>{focusAssignments.unplaced.length} focused {focusAssignments.unplaced.length === 1 ? "task needs" : "tasks need"} a block</strong><span>Create an upcoming schedule so focused work can appear automatically.</span></button>}<div className="planner-context-grid"><section className="planner-context-section planner-context-focus"><div><h4>Focused</h4><span>{selectedFocusedTasks.length}/3</span></div><div className="planner-context-list">{selectedFocusedTasks.length > 0 ? selectedFocusedTasks.map((task) => <div className="planner-context-focus-row" key={task.id}><strong>{task.title}</strong><small>Appears automatically</small></div>) : <p>No focused task in this area.</p>}</div></section><section className="planner-context-section"><div><h4>Next up</h4><span>{nextTasks.length}/3</span></div><div className="planner-context-list">{nextTasks.length > 0 ? nextTasks.map((task) => <TaskDragItem task={task} area={selectedArea} focused={false} onSchedule={() => openNextOccurrenceForArea(selectedArea.id, { taskId: task.id })} key={task.id} />) : <p>No additional task needs attention.</p>}</div></section><section className="planner-context-section"><div><h4>Active projects</h4><span>{Math.min(selectedAreaProjects.length, 2)}/2</span></div><div className="planner-context-list">{selectedAreaProjects.length > 0 ? selectedAreaProjects.slice(0, 2).map((project) => <ProjectDragItem project={project} area={selectedArea} onSchedule={() => openNextOccurrenceForArea(selectedArea.id, { projectId: project.id })} key={project.id} />) : <p>No active project in this area.</p>}</div></section></div>{backlogTasks.length > 0 && <details className="planner-context-backlog"><summary>Backlog <span>{backlogTasks.length}</span></summary><div>{backlogTasks.map((task) => <TaskDragItem task={task} area={selectedArea} focused={false} onSchedule={() => openNextOccurrenceForArea(selectedArea.id, { taskId: task.id })} key={task.id} />)}</div></details>}{planner.areaBlockRules.length === 0 && <div className="planner-guidance"><strong>Start with one dependable block.</strong><p>Protect the time that has real stakes or useful feedback. Leave the rest of the week breathable.</p></div>}</section>}
        </aside>
        <section className="planner-calendar" aria-label={`Week of ${dates[0]}`}>
          <div className="planner-calendar-head"><div className="planner-time-head">Time</div>{dates.map((date) => <div className={`planner-day-head ${date === today ? "today" : ""} ${date === selectedDate ? "selected" : ""}`} key={date}><span>{SHORT_DAY_NAMES[plannerWeekday(date)]}</span><strong>{formatDateNumber(date)}</strong></div>)}</div>
          <div className="planner-deadline-row"><div className="planner-all-day-label">Due</div>{dates.map((date) => <div className={`planner-all-day-cell ${date === selectedDate ? "selected" : ""}`} key={date}>{tasks.filter((task) => task.status !== "done" && task.dueDate === date && !task.dueTime).slice(0, 2).map((task) => <span title={task.title} key={task.id}>{task.title}</span>)}{tasks.filter((task) => task.status !== "done" && task.dueDate === date && !task.dueTime).length > 2 && <small>+{tasks.filter((task) => task.status !== "done" && task.dueDate === date && !task.dueTime).length - 2} more</small>}</div>)}</div>
          <div className="planner-calendar-body"><div className="planner-time-rail">{hours.map((hour) => <span style={{ top: (hour - START_HOUR) * 60 * PIXELS_PER_MINUTE }} key={hour}>{formatPlannerTime(`${String(hour).padStart(2, "0")}:00`)}</span>)}</div>
            <div className="planner-days-grid">{dates.map((date) => <div className={`planner-day ${date === today ? "today" : ""} ${date === selectedDate ? "selected" : ""}`} data-date={date} key={date}>{hours.slice(0, -1).map((hour) => <div className="planner-hour-line" style={{ top: (hour - START_HOUR) * 60 * PIXELS_PER_MINUTE }} key={hour} />)}{slots.map((minutes) => <DropSlot date={date} minutes={minutes} key={minutes} />)}{date === today && currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60 && <div className="planner-now-line" style={{ top: (currentMinutes - START_HOUR * 60) * PIXELS_PER_MINUTE }}><span /></div>}{occurrences.filter((item) => item.date === date).map((occurrence) => {
              const area = areas.find((item) => item.id === occurrence.areaId);
              if (!area) return null;
              const timedTasks = tasks.filter((task) => task.status !== "done" && task.areaId === occurrence.areaId && task.dueDate === occurrence.date && task.dueTime && task.dueTime >= occurrence.startTime && task.dueTime < occurrence.endTime);
              const sessions = planner.projectSessions.filter((session) => session.ruleId === occurrence.ruleId && session.occurrenceDate === occurrence.sourceDate);
              return <AreaBlockCard occurrence={occurrence} area={area} focusedTasks={focusAssignments.byOccurrence.get(occurrence.id) ?? []} timedTasks={timedTasks} sessions={sessions} projects={projects} onOpen={() => { setSelectedAreaId(occurrence.areaId); setEditor({ kind: "occurrence", occurrenceId: occurrence.id }); }} key={occurrence.id} />;
            })}{tasks.filter((task) => task.status !== "done" && task.dueDate === date && task.dueTime && !occurrences.some((occurrence) => occurrence.date === date && occurrence.areaId === task.areaId && task.dueTime! >= occurrence.startTime && task.dueTime! < occurrence.endTime)).map((task) => <button type="button" className="planner-orphan-deadline" style={{ top: (plannerMinutes(task.dueTime!) - START_HOUR * 60) * PIXELS_PER_MINUTE }} onClick={() => openNextOccurrenceForArea(task.areaId)} title="This deadline falls outside an area block" key={task.id}><time>{formatPlannerTime(task.dueTime!)}</time><span>{task.title}</span></button>)}</div>)}</div>
          </div>
        </section>
      </div>
    </div>
    <DragOverlay>{activeLabel ? <div className="planner-drag-overlay">{activeLabel}</div> : null}</DragOverlay>
  </DndContext>;
}
