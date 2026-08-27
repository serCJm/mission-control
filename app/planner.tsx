"use client";

import { DndContext, type DragEndEvent, type DragStartEvent, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { areaBlockConflict, formatPlannerTime, isFinalRoutineSessionStatus, isPlannerCalendarTime, isPlannerDate, materializeAreaBlocks, MIN_AREA_BLOCK_MINUTES, normalizePlanner, parsePlannerCandidate, placePlannerBlockItem, PLANNER_END_MINUTES, PLANNER_START_MINUTES, PLANNER_TIME_ZONE, plannerBlockItems, plannerBlockTarget, plannerDateKey, plannerMinutes, plannerTime, plannerWeekDates, plannerWeekday, recurringAreaBlockRulesConflict, shiftPlannerDate } from "./planner-schema.mjs";

export type PlannerArea = { id: string; name: string; icon: string };
export type PlannerProject = { id: string; areaId: string; name: string; outcome: string };
export type PlannerTask = { id: string; title: string; areaId?: string; projectId?: string; status: "todo" | "doing" | "done"; dueDate?: string; dueTime?: string; priority?: "low" | "medium" | "high"; someday?: boolean; waiting?: boolean };
export type PlannerRoutine = { id: string; areaId: string; name: string; expectedMinutes: number; sessions: Array<{ date: string; status: "pending" | "completed" | "skipped" | "missed" }> };
export type AreaBlockRule = { id: string; areaId: string; weekdays: number[]; effectiveOn: string; startTime: string; endTime: string };
export type AreaBlockException = { id: string; ruleId: string; occurrenceDate: string; kind: "skip" | "override"; date?: string; startTime?: string; endTime?: string };
export type BlockItem = { id: string; ruleId: string; occurrenceDate: string; kind: "task" | "routine"; itemId: string };
export type PlannerData = { areaBlockRules: AreaBlockRule[]; areaBlockExceptions: AreaBlockException[]; blockItems: BlockItem[] };
type AreaOccurrence = { id: string; ruleId: string; sourceDate: string; areaId: string; date: string; startTime: string; endTime: string; exception: boolean };
export type PlannerQueue = "work" | "backlog" | "waiting" | "routines";
export type PlannerSessionState = {
  anchorDate: string;
  selectedDate: string;
  selectedAreaId: string;
  selectedProjectId: string;
  queue: PlannerQueue;
  workbenchOpen: boolean;
  workbenchPinned?: boolean;
  calendarScrollTop?: number;
};

type PlannerProps = {
  areas: PlannerArea[];
  projects: PlannerProject[];
  tasks: PlannerTask[];
  routines: PlannerRoutine[];
  planner: PlannerData;
  onChange: (planner: PlannerData) => void;
  onTaskChange: (taskId: string, patch: Partial<Pick<PlannerTask, "status" | "waiting" | "someday" | "dueDate" | "dueTime">>) => void;
  onRoutineSessionStatus: (routineId: string, date: string, status: "completed" | "skipped") => void;
  makeId: (prefix: string) => string;
  renderAreaIcon: (icon: string) => ReactNode;
  onNotice: (message: string) => void;
  onEditorOpenChange: (open: boolean) => void;
  session: PlannerSessionState;
  onSessionChange: (patch: Partial<PlannerSessionState>) => void;
  onManage: (target: { kind: "area" | "project"; id: string }) => void;
  onCreateArea: (name: string) => void;
};
type PlannerDragData = { kind?: string; areaId?: string; taskId?: string; routineId?: string; occurrence?: AreaOccurrence };

function subscribeCompactLayout(onChange: () => void) {
  const query = window.matchMedia("(max-width: 980px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function compactLayoutSnapshot() {
  return window.matchMedia("(max-width: 980px)").matches;
}

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

function AddToQueueIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h8M3.5 10h6M3.5 14.5h5" /><path d="M14 10.5v5M11.5 13h5" /></svg>;
}

function AreaDragItem({ area, selected, renderAreaIcon, onSelect, onConfigure }: { area: PlannerArea; selected: boolean; renderAreaIcon: PlannerProps["renderAreaIcon"]; onSelect: () => void; onConfigure: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `area:${area.id}`, data: { kind: "area", areaId: area.id } });
  return <div className={`planner-source ${selected ? "selected" : ""} ${isDragging ? "dragging" : ""}`} ref={setNodeRef}>
    <button type="button" className="planner-source-drag" {...listeners} {...attributes} aria-pressed={selected} aria-label={`Select ${area.name}, or drag it onto the week`} title={`Select ${area.name}, or drag it onto the week`} onClick={onSelect}><span className="planner-area-icon">{renderAreaIcon(area.icon)}</span><span><strong>{area.name}</strong><small>{selected ? "Showing this area" : "Select or drag"}</small></span><i aria-hidden="true"><b /><b /><b /></i></button>
    <button type="button" className="planner-source-settings" onClick={onConfigure}>Set schedule</button>
  </div>;
}

function TaskDragItem({ task, area, project, canSchedule, onQueue }: { task: PlannerTask; area?: PlannerArea; project?: PlannerProject; canSchedule: boolean; onQueue: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task:${task.id}`, data: { kind: "task", taskId: task.id } });
  return <div className={`planner-compact-source ${isDragging ? "dragging" : ""}`} ref={setNodeRef}><button type="button" className="planner-compact-drag" {...listeners} {...attributes} aria-label={`Drag ${task.title} into an ${area?.name ?? "area"} block`}><span><strong>{task.title}</strong><small>{project?.name ?? taskPlanningLabel(task)}</small></span></button><span className="planner-source-actions"><button type="button" className="planner-queue-button" disabled={!canSchedule} onClick={onQueue} aria-label={`Add ${task.title} to the ${area?.name ?? "area"} block queue`} title="Add to queue"><AddToQueueIcon /></button></span></div>;
}

function RoutineDragItem({ routine, canSchedule, onQueue }: { routine: PlannerRoutine; canSchedule: boolean; onQueue: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `routine:${routine.id}`, data: { kind: "routine", routineId: routine.id } });
  return <div className={`planner-compact-source ${isDragging ? "dragging" : ""}`} ref={setNodeRef}><button type="button" className="planner-compact-drag" {...listeners} {...attributes} aria-label={`Drag ${routine.name} into an area block`}><span><strong>{routine.name}</strong><small>{routine.expectedMinutes} min routine</small></span></button><span className="planner-source-actions"><button type="button" className="planner-queue-button" disabled={!canSchedule} onClick={onQueue} aria-label={`Add ${routine.name} to its area block queue`} title="Add to queue"><AddToQueueIcon /></button></span></div>;
}

function DropSlot({ date, minutes }: { date: string; minutes: number }) {
  const id = `slot:${date}:${minutes}`;
  const { isOver, setNodeRef } = useDroppable({ id, data: { kind: "slot", date, minutes } });
  return <div ref={setNodeRef} className={`planner-drop-slot ${isOver ? "over" : ""}`} style={{ top: (minutes - START_HOUR * 60) * PIXELS_PER_MINUTE, height: 15 * PIXELS_PER_MINUTE }} aria-hidden="true" />;
}

function plannerBlockItemDone(item: BlockItem, occurrenceDate: string, tasks: PlannerTask[], routines: PlannerRoutine[]) {
  if (item.kind === "task") return tasks.find((task) => task.id === item.itemId)?.status === "done";
  const session = routines.find((routine) => routine.id === item.itemId)?.sessions.find((candidate) => candidate.date === occurrenceDate);
  return Boolean(session && isFinalRoutineSessionStatus(session.status));
}

function AreaBlockCard({ occurrence, area, items, tasks, routines, active, onOpen }: { occurrence: AreaOccurrence; area: PlannerArea; items: BlockItem[]; tasks: PlannerTask[]; routines: PlannerRoutine[]; active: boolean; onOpen: () => void }) {
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
  const firstUnfinishedIndex = active ? items.findIndex((item) => !plannerBlockItemDone(item, occurrence.date, tasks, routines)) : -1;
  return <article ref={setMoveNodeRef} className={`planner-area-block ${isMoving ? "moving" : ""} ${isResizing ? "resizing" : ""}`} style={{ top, height, transform }}>
    <button type="button" className="planner-block-move" {...moveListeners} {...moveAttributes} aria-label={`Move this ${area.name} occurrence`} title="Drag to move this occurrence"><i /><i /><i /></button>
    <button type="button" className="planner-block-main" onClick={onOpen} aria-label={`${area.name}, ${formatPlannerTime(occurrence.startTime)} to ${formatPlannerTime(displayEndTime)}. Open this occurrence.`}><span className="planner-block-copy"><span className="planner-block-title"><strong>{area.name}</strong></span><small>{formatBlockTime(occurrence.startTime)}–{formatBlockTime(displayEndTime)}</small></span></button>
    <div className="planner-block-contents">{items.map((item, index) => { const task = item.kind === "task" ? tasks.find((value) => value.id === item.itemId) : undefined; const routine = item.kind === "routine" ? routines.find((value) => value.id === item.itemId) : undefined; const done = plannerBlockItemDone(item, occurrence.date, tasks, routines); return <button type="button" className={`planner-block-item ${done ? "done" : ""}`} onClick={onOpen} key={item.id}><span>{!done && index === firstUnfinishedIndex ? "Now" : done ? "Done" : `${index + 1}`}</span><strong>{task?.title ?? routine?.name ?? "Unavailable item"}</strong></button>; })}</div>
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

function OccurrenceEditor({ occurrence, today, currentMinutes, area, projects, tasks, routines, planner, onSave, onSkip, onEditSeries, onPlannerChange, onTaskChange, onRoutineSessionStatus, onClose, makeId }: { occurrence: AreaOccurrence; today: string; currentMinutes: number; area: PlannerArea; projects: PlannerProject[]; tasks: PlannerTask[]; routines: PlannerRoutine[]; planner: PlannerData; onSave: (date: string, startTime: string, endTime: string) => string | null; onSkip: () => void; onEditSeries: () => void; onPlannerChange: (planner: PlannerData) => void; onTaskChange: PlannerProps["onTaskChange"]; onRoutineSessionStatus: PlannerProps["onRoutineSessionStatus"]; onClose: () => void; makeId: PlannerProps["makeId"] }) {
  const [date, setDate] = useState(occurrence.date);
  const [startTime, setStartTime] = useState(occurrence.startTime);
  const [endTime, setEndTime] = useState(occurrence.endTime);
  const [candidate, setCandidate] = useState("");
  const [error, setError] = useState("");
  const [confirmSkip, setConfirmSkip] = useState(false);
  const blockItems = plannerBlockItems(planner, occurrence) as BlockItem[];
  const matchingTasks = tasks.filter((task) => task.areaId === occurrence.areaId && task.status !== "done" && !task.waiting);
  const matchingRoutines = routines.filter((routine) => routine.areaId === occurrence.areaId);
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

  function addCandidate() {
    if (!candidate) return;
    const parsed = parsePlannerCandidate(candidate) as { kind: "task" | "routine"; itemId: string } | null;
    if (!parsed) return;
    const { kind, itemId } = parsed;
    const placement = placePlannerBlockItem(planner, occurrence, kind, itemId, makeId("block-item")) as { planner: PlannerData; status: "added" | "exists" | "full" };
    if (placement.status === "exists") {
      setError("That item is already in this block.");
      return;
    }
    if (placement.status === "full") {
      setError("This block already has three items.");
      return;
    }
    onPlannerChange(placement.planner);
    if (kind === "task") onTaskChange(itemId, { someday: undefined, waiting: undefined });
    setError("");
    setCandidate("");
  }

  function removeItem(id: string) {
    onPlannerChange({ ...planner, blockItems: planner.blockItems.filter((item) => item.id !== id) });
  }

  function moveItem(id: string, distance: number) {
    const ordered = [...blockItems];
    const index = ordered.findIndex((item) => item.id === id);
    const target = index + distance;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const occurrenceIds = new Set(blockItems.map((item) => item.id));
    const firstIndex = planner.blockItems.findIndex((item) => occurrenceIds.has(item.id));
    const remaining = planner.blockItems.filter((item) => !occurrenceIds.has(item.id));
    remaining.splice(Math.max(0, firstIndex), 0, ...ordered);
    onPlannerChange({ ...planner, blockItems: remaining });
  }

  function isDone(item: BlockItem) {
    return plannerBlockItemDone(item, occurrence.date, tasks, routines);
  }

  const occurrenceActive = occurrence.date === today && plannerMinutes(occurrence.startTime) <= currentMinutes && plannerMinutes(occurrence.endTime) > currentMinutes;
  const nowItemId = occurrenceActive ? blockItems.find((item) => !isDone(item))?.id : undefined;
  const canExecuteRoutines = occurrence.date === today;
  const selectedKeys = new Set(blockItems.map((item) => `${item.kind}:${item.itemId}`));

  return <div className="planner-editor occurrence-editor">
    <div className="planner-editor-heading"><div><h2>{area.name} · This block</h2><p>{occurrenceActive ? "The first unfinished item is Now." : "Keep the list short and executable."}</p></div><button type="button" onClick={onClose}>Close</button></div>
    <section className="planner-editor-section planner-this-block"><div><h3>This block</h3><span>{blockItems.length}/3</span></div>{blockItems.length ? <div className="planner-block-item-list">{blockItems.map((item, index) => { const task = item.kind === "task" ? tasks.find((value) => value.id === item.itemId) : undefined; const routine = item.kind === "routine" ? routines.find((value) => value.id === item.itemId) : undefined; const done = isDone(item); return <div className={`planner-session-row block-work-row ${done ? "done" : ""}`} key={item.id}><span><small>{done ? "Done" : item.id === nowItemId ? "Now" : `Then · ${index + 1}`}</small><strong>{task?.title ?? routine?.name ?? "Unavailable item"}</strong><small>{task?.projectId ? projectsById.get(task.projectId)?.name : item.kind === "routine" ? "Routine" : "Area backlog"}</small></span><span className="planner-row-actions">{!done && item.kind === "task" && <><button type="button" onClick={() => onTaskChange(item.itemId, { status: "done" })}>Complete</button><button type="button" onClick={() => { onTaskChange(item.itemId, { waiting: true, someday: undefined }); removeItem(item.id); }}>Wait</button></>}{!done && item.kind === "routine" && canExecuteRoutines && <><button type="button" onClick={() => onRoutineSessionStatus(item.itemId, occurrence.date, "completed")}>Complete</button><button type="button" onClick={() => onRoutineSessionStatus(item.itemId, occurrence.date, "skipped")}>Skip</button></>}<button type="button" disabled={index === 0} aria-label={`Move ${task?.title ?? routine?.name} earlier`} onClick={() => moveItem(item.id, -1)}>↑</button><button type="button" disabled={index === blockItems.length - 1} aria-label={`Move ${task?.title ?? routine?.name} later`} onClick={() => moveItem(item.id, 1)}>↓</button><button type="button" className="danger" onClick={() => removeItem(item.id)}>Remove</button></span></div>; })}</div> : <p className="planner-editor-empty">Nothing selected. Add one to three items, or leave this block open for context-led work.</p>}
      {blockItems.length < 3 && <div className="planner-add-row block-item-add"><select value={candidate} onChange={(event) => setCandidate(event.target.value)} aria-label="Task or routine"><option value="">Choose work…</option><optgroup label="Project tasks">{matchingTasks.filter((task) => task.projectId && !selectedKeys.has(`task:${task.id}`)).map((task) => <option value={`task:${task.id}`} key={task.id}>{projectsById.get(task.projectId!)?.name} · {task.title}</option>)}</optgroup><optgroup label="Area backlog">{matchingTasks.filter((task) => !task.projectId && !selectedKeys.has(`task:${task.id}`)).map((task) => <option value={`task:${task.id}`} key={task.id}>{task.title}</option>)}</optgroup><optgroup label="Routines">{matchingRoutines.filter((routine) => !selectedKeys.has(`routine:${routine.id}`)).map((routine) => <option value={`routine:${routine.id}`} key={routine.id}>{routine.name}</option>)}</optgroup></select><button type="button" disabled={!candidate} onClick={addCandidate}>Add to block</button></div>}
    </section>
    <form className="planner-occurrence-form" onSubmit={saveOccurrence}><label className="planner-field"><span>Date</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="planner-time-fields"><label className="planner-field"><span>Starts</span><input required type="time" step="900" min={CALENDAR_START} max="22:30" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label className="planner-field"><span>Ends</span><input required type="time" step="900" min={startTime || CALENDAR_START} max={CALENDAR_END} value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div><button type="submit" className="planner-inline-save">Save this occurrence</button></form>
    {error && <p className="planner-form-error" role="alert">{error}</p>}
    <div className="planner-editor-actions occurrence-actions"><button type="button" className="planner-delete" onClick={() => confirmSkip ? onSkip() : setConfirmSkip(true)}>{confirmSkip ? "Confirm skip" : "Skip this block"}</button><span /><button type="button" onClick={onEditSeries}>Edit weekly schedule</button></div>
  </div>;
}

export function Planner({ areas, projects, tasks, routines, planner, onChange, onTaskChange, onRoutineSessionStatus, makeId, renderAreaIcon, onNotice, onEditorOpenChange, session, onSessionChange, onManage, onCreateArea }: PlannerProps) {
  const compactLayout = useSyncExternalStore(subscribeCompactLayout, compactLayoutSnapshot, () => false);
  const workbenchVisible = session.workbenchOpen && (!compactLayout || session.workbenchPinned);
  const today = plannerDateKey();
  const anchorDate = session.anchorDate;
  const dates = plannerWeekDates(anchorDate);
  const selectedDate = dates.includes(session.selectedDate) ? session.selectedDate : dates[0];
  const [editor, setEditor] = useState<{ kind: "series"; ruleId?: string; areaId?: string } | { kind: "occurrence"; occurrenceId: string } | null>(null);
  const [activeLabel, setActiveLabel] = useState("");
  const [areaCreatorOpen, setAreaCreatorOpen] = useState(false);
  const [areaName, setAreaName] = useState("");
  const selectedAreaId = areas.some((area) => area.id === session.selectedAreaId) ? session.selectedAreaId : areas[0]?.id ?? "";
  const selectedProjectId = projects.some((project) => project.id === session.selectedProjectId && project.areaId === selectedAreaId) ? session.selectedProjectId : "";
  const calendarBodyRef = useRef<HTMLDivElement | null>(null);
  const workbenchRef = useRef<HTMLElement | null>(null);
  const workbenchToggleRef = useRef<HTMLButtonElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const onSessionChangeRef = useRef(onSessionChange);
  const previousWorkbenchVisible = useRef(workbenchVisible);
  const restoredScroll = useRef(false);
  useEffect(() => {
    onEditorOpenChange(editor !== null);
  }, [editor, onEditorOpenChange]);
  useEffect(() => {
    onSessionChangeRef.current = onSessionChange;
  }, [onSessionChange]);
  useEffect(() => () => onEditorOpenChange(false), [onEditorOpenChange]);
  useEffect(() => {
    const wasVisible = previousWorkbenchVisible.current;
    if (compactLayout && workbenchVisible && !wasVisible) {
      requestAnimationFrame(() => workbenchRef.current?.querySelector<HTMLElement>('button, select, input, [tabindex]:not([tabindex="-1"])')?.focus());
    }
    if (compactLayout && !workbenchVisible && wasVisible) workbenchToggleRef.current?.focus();
    previousWorkbenchVisible.current = workbenchVisible;
  }, [compactLayout, workbenchVisible]);
  useEffect(() => {
    const workbench = workbenchRef.current;
    if (!compactLayout || !workbenchVisible || !workbench) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setEditor(null);
        onSessionChange({ workbenchOpen: false, workbenchPinned: true });
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(workbench!.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    workbench.addEventListener("keydown", handleKeyDown);
    return () => workbench.removeEventListener("keydown", handleKeyDown);
  }, [compactLayout, onSessionChange, workbenchVisible]);
  useEffect(() => {
    if (selectedAreaId !== session.selectedAreaId) onSessionChange({ selectedAreaId, selectedProjectId: "" });
  }, [onSessionChange, selectedAreaId, session.selectedAreaId]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 7 } }), useSensor(KeyboardSensor));
  const occurrences = materializeAreaBlocks(planner, dates) as AreaOccurrence[];
  const editingRule = editor?.kind === "series" && editor.ruleId ? planner.areaBlockRules.find((rule) => rule.id === editor.ruleId) : undefined;
  const editingOccurrence = editor?.kind === "occurrence" ? occurrences.find((occurrence) => occurrence.id === editor.occurrenceId) : undefined;
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? areas[0];
  const selectedAreaProjects = projects.filter((project) => project.areaId === selectedArea?.id);
  const selectedAreaTasks = tasks.filter((task) => task.areaId === selectedArea?.id && task.status !== "done" && !task.waiting);
  const priorityRank = { high: 0, medium: 1, low: 2, none: 3 } as const;
  const projectTasks = selectedAreaTasks.filter((task) => task.projectId && (!selectedProjectId || task.projectId === selectedProjectId)).sort((left, right) => (priorityRank[left.priority ?? "none"] - priorityRank[right.priority ?? "none"]) || Number(left.status !== "doing") - Number(right.status !== "doing") || (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31"));
  const backlogTasks = selectedAreaTasks.filter((task) => !task.projectId);
  const waitingTasks = tasks.filter((task) => task.areaId === selectedArea?.id && task.status !== "done" && task.waiting && (!selectedProjectId || task.projectId === selectedProjectId));
  const selectedAreaRoutines = routines.filter((routine) => routine.areaId === selectedArea?.id);
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);
  const slots = Array.from({ length: (END_HOUR - START_HOUR) * 4 }, (_, index) => START_HOUR * 60 + index * 15);
  const currentTimeParts = new Intl.DateTimeFormat("en-US", { timeZone: PLANNER_TIME_ZONE, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  const currentMinutes = Number(currentTimeParts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(currentTimeParts.find((part) => part.type === "minute")?.value ?? 0);
  useEffect(() => {
    if (restoredScroll.current || !calendarBodyRef.current) return;
    restoredScroll.current = true;
    const body = calendarBodyRef.current;
    const centered = Math.max(0, Math.min(body.scrollHeight - body.clientHeight, (currentMinutes - START_HOUR * 60) * PIXELS_PER_MINUTE - body.clientHeight / 2));
    body.scrollTop = session.calendarScrollTop ?? centered;
  }, [currentMinutes, session.calendarScrollTop]);
  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    if (pendingScrollTopRef.current !== null) onSessionChangeRef.current({ calendarScrollTop: pendingScrollTopRef.current });
  }, []);
  const blockTarget = useMemo(() => selectedArea ? plannerBlockTarget(planner, selectedArea.id, today, currentMinutes) as { occurrence: AreaOccurrence; active: boolean } | null : null, [currentMinutes, planner, selectedArea, today]);

  function publishCalendarScroll(scrollTop: number) {
    pendingScrollTopRef.current = scrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const nextScrollTop = pendingScrollTopRef.current;
      pendingScrollTopRef.current = null;
      if (nextScrollTop !== null) onSessionChange({ calendarScrollTop: nextScrollTop });
    });
  }

  function showWeek(next: string) {
    const nextDates = plannerWeekDates(next);
    if (nextDates[0] !== dates[0]) setEditor((current) => current?.kind === "occurrence" ? null : current);
    onSessionChange({ anchorDate: next, selectedDate: nextDates.includes(today) ? today : nextDates[0] });
  }

  function changeWeek(distance: number) {
    showWeek(shiftPlannerDate(dates[0], distance * 7));
  }

  function returnToToday() {
    showWeek(today);
    requestAnimationFrame(() => {
      const body = calendarBodyRef.current;
      if (!body) return;
      const centered = Math.max(0, Math.min(body.scrollHeight - body.clientHeight, (currentMinutes - START_HOUR * 60) * PIXELS_PER_MINUTE - body.clientHeight / 2));
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      body.scrollTo({ top: centered, behavior: reduceMotion ? "auto" : "smooth" });
      onSessionChange({ calendarScrollTop: centered });
    });
  }

  function commitPlanner(candidate: PlannerData) {
    const normalized = normalizePlanner(candidate, new Set(areas.map((area) => area.id)), new Map(tasks.filter((task) => task.areaId).map((task) => [task.id, task.areaId!])), new Map(routines.map((routine) => [routine.id, routine.areaId]))) as PlannerData | null;
    if (!normalized) {
      onNotice("That planner change is outside the 15-minute calendar grid.");
      return false;
    }
    onChange(normalized);
    return true;
  }

  function saveRule(draft: AreaBlockRule) {
    const rule = { ...draft, id: draft.id || makeId("area-block") };
    const items = planner.blockItems.filter((item) => item.ruleId === rule.id);
    if (editingRule && rule.areaId !== editingRule.areaId && items.length) return "Clear scheduled work before assigning this series to another area.";
    if (items.some((item) => item.occurrenceDate < rule.effectiveOn || !rule.weekdays.includes(plannerWeekday(item.occurrenceDate)))) return "Clear This block on days you are taking out of this schedule first.";
    const next = {
      ...planner,
      areaBlockRules: editingRule ? planner.areaBlockRules.map((item) => item.id === rule.id ? rule : item) : [...planner.areaBlockRules, rule],
      areaBlockExceptions: planner.areaBlockExceptions.filter((item) => item.ruleId !== rule.id || (item.occurrenceDate >= rule.effectiveOn && rule.weekdays.includes(plannerWeekday(item.occurrenceDate)))),
    };
    if (next.areaBlockRules.some((item) => item.id !== rule.id && recurringAreaBlockRulesConflict(rule, item))) return "That time overlaps another area block. Leave the space open or choose a different time.";
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
      blockItems: planner.blockItems.filter((item) => item.ruleId !== editingRule.id),
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
    if (!commitPlanner(next)) return "Choose a valid date and block between 6 AM and 11 PM on the 15-minute grid.";
    onNotice("This area block was adjusted");
    return null;
  }

  function skipOccurrence(occurrence: AreaOccurrence) {
    const exception: AreaBlockException = { id: planner.areaBlockExceptions.find((item) => item.ruleId === occurrence.ruleId && item.occurrenceDate === occurrence.sourceDate)?.id ?? makeId("area-block-exception"), ruleId: occurrence.ruleId, occurrenceDate: occurrence.sourceDate, kind: "skip" };
    commitPlanner({ ...planner, areaBlockExceptions: [...planner.areaBlockExceptions.filter((item) => !(item.ruleId === occurrence.ruleId && item.occurrenceDate === occurrence.sourceDate)), exception], blockItems: planner.blockItems.filter((item) => !(item.ruleId === occurrence.ruleId && item.occurrenceDate === occurrence.sourceDate)) });
    setEditor(null);
    onNotice("This area block was skipped");
  }

  function occurrenceAt(date: string, minutes: number, areaId?: string) {
    return occurrences.find((occurrence) => occurrence.date === date && (!areaId || occurrence.areaId === areaId) && plannerMinutes(occurrence.startTime) <= minutes && plannerMinutes(occurrence.endTime) > minutes);
  }

  function addToOccurrence(occurrence: AreaOccurrence, kind: "task" | "routine", itemId: string) {
    const placement = placePlannerBlockItem(planner, occurrence, kind, itemId, makeId("block-item")) as { planner: PlannerData; status: "added" | "exists" | "full" };
    if (placement.status === "full") {
      onSessionChange({ workbenchOpen: true, workbenchPinned: true, selectedAreaId: occurrence.areaId, selectedDate: occurrence.date, anchorDate: occurrence.date });
      setEditor({ kind: "occurrence", occurrenceId: occurrence.id });
      onNotice("This block already has three items. Remove or complete one first.");
      return false;
    }
    if (placement.status === "exists") {
      onNotice("That item is already in this block");
      return false;
    }
    if (!commitPlanner(placement.planner)) return false;
    if (kind === "task") onTaskChange(itemId, { someday: undefined });
    onNotice("Added to the block queue");
    return true;
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
    if (active.kind === "task" && active.taskId) {
      const task = tasks.find((item) => item.id === active.taskId);
      const occurrence = task?.areaId ? occurrenceAt(over.date, over.minutes, task.areaId) : undefined;
      if (!task || !occurrence) {
        onNotice("Drop a task inside a block for its area");
        return;
      }
      addToOccurrence(occurrence, "task", task.id);
      return;
    }
    if (active.kind === "routine" && active.routineId) {
      const routine = routines.find((item) => item.id === active.routineId);
      const occurrence = routine ? occurrenceAt(over.date, over.minutes, routine.areaId) : undefined;
      if (!routine || !occurrence) {
        onNotice("Drop a routine inside a block for its area");
        return;
      }
      addToOccurrence(occurrence, "routine", routine.id);
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

  function openTargetForArea(areaId?: string, item?: { kind: "task" | "routine"; itemId: string }) {
    const target = areaId ? plannerBlockTarget(planner, areaId, today, currentMinutes) as { occurrence: AreaOccurrence; active: boolean } | null : null;
    if (!target) {
      onNotice("Create an upcoming area block first");
      onSessionChange({ workbenchOpen: true, workbenchPinned: true });
      return;
    }
    onSessionChange({ anchorDate: target.occurrence.date, selectedDate: target.occurrence.date, workbenchOpen: true, workbenchPinned: true });
    if (item) addToOccurrence(target.occurrence, item.kind, item.itemId);
    else setEditor({ kind: "occurrence", occurrenceId: target.occurrence.id });
  }

  function createArea(event: FormEvent) {
    event.preventDefault();
    const name = areaName.trim();
    if (!name) return;
    onCreateArea(name);
    setAreaName("");
    setAreaCreatorOpen(false);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as PlannerDragData | undefined;
    if (data?.kind === "area") setActiveLabel(areas.find((area) => area.id === data.areaId)?.name ?? "Area block");
    else if (data?.kind === "task") setActiveLabel(tasks.find((task) => task.id === data.taskId)?.title ?? "Task deadline");
    else if (data?.kind === "routine") setActiveLabel(routines.find((routine) => routine.id === data.routineId)?.name ?? "Routine");
    else if (data?.occurrence) setActiveLabel(areas.find((area) => area.id === data.occurrence?.areaId)?.name ?? "Area block");
  }

  return <DndContext id="planner-workspace" sensors={sensors} onDragStart={handleDragStart} onDragCancel={() => setActiveLabel("")} onDragEnd={handleDragEnd}>
    <div className={`planner-page ${workbenchVisible ? "workbench-open" : "workbench-closed"}`}>
      <header className="planner-toolbar">
        <div className="planner-toolbar-title"><button ref={workbenchToggleRef} type="button" className="planner-workbench-toggle" aria-label={workbenchVisible ? "Hide workbench" : "Show workbench"} aria-controls="planner-workbench" aria-expanded={workbenchVisible} onClick={() => onSessionChange({ workbenchOpen: !workbenchVisible, workbenchPinned: true })}><span aria-hidden="true" /><span>{workbenchVisible ? "Hide workbench" : "Show workbench"}</span></button><div><strong>Today</strong><small>{formatWeekRange(dates)}</small></div></div>
        <div className="planner-week-controls"><button type="button" onClick={() => changeWeek(-1)} aria-label="Previous week"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5-5 5 5 5" /></svg></button><button type="button" className="planner-range" onClick={returnToToday}>{dates.includes(today) ? "This week" : formatWeekRange(dates)}</button><button type="button" onClick={() => changeWeek(1)} aria-label="Next week"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 5 5 5-5 5" /></svg></button></div>
        <div className="planner-toolbar-actions"><button type="button" onClick={returnToToday}>Return to today</button><button type="button" className="primary" onClick={() => { onSessionChange({ workbenchOpen: true, workbenchPinned: true }); setEditor({ kind: "series", areaId: selectedArea?.id }); }}>New block</button></div>
      </header>
      <div className="planner-mobile-days" role="tablist" aria-label="Days in this week">{dates.map((date) => <button type="button" role="tab" aria-selected={selectedDate === date} className={selectedDate === date ? "active" : ""} onClick={() => onSessionChange({ selectedDate: date })} key={date}><span>{SHORT_DAY_NAMES[plannerWeekday(date)]}</span><strong>{formatDateNumber(date)}</strong></button>)}</div>
      <div className="planner-layout">
        <aside ref={workbenchRef} id="planner-workbench" className="planner-workbench" role="dialog" tabIndex={-1} aria-modal={compactLayout || undefined} aria-label="Calendar workbench" aria-hidden={!workbenchVisible}>
          <div className="planner-workbench-head"><div><h2>{editor?.kind === "occurrence" ? "This block" : editor?.kind === "series" ? "Area schedule" : "Choose the work"}</h2><p>{editor ? "Adjust the calendar without leaving Today." : "Keep the calendar clear while work stays close at hand."}</p></div><button type="button" onClick={() => { setEditor(null); onSessionChange({ workbenchOpen: false }); }} aria-label="Close workbench">Close</button></div>
          {editor?.kind === "series" && <ScheduleEditor key={editingRule?.id ?? editor.areaId ?? "new"} rule={editingRule} areas={areas} initialAreaId={editor.areaId} today={today} onSave={saveRule} onDelete={editingRule ? deleteRule : undefined} onClose={() => setEditor(null)} />}
          {editor?.kind === "occurrence" && editingOccurrence && <OccurrenceEditor key={`${editingOccurrence.id}:${editingOccurrence.date}:${editingOccurrence.startTime}:${editingOccurrence.endTime}`} occurrence={editingOccurrence} today={today} currentMinutes={currentMinutes} area={areas.find((area) => area.id === editingOccurrence.areaId)!} projects={projects} tasks={tasks} routines={routines} planner={planner} onSave={(date, startTime, endTime) => upsertOccurrenceException(editingOccurrence, date, startTime, endTime)} onSkip={() => skipOccurrence(editingOccurrence)} onEditSeries={() => setEditor({ kind: "series", ruleId: editingOccurrence.ruleId })} onPlannerChange={(next) => { commitPlanner(next); }} onTaskChange={onTaskChange} onRoutineSessionStatus={onRoutineSessionStatus} onClose={() => setEditor(null)} makeId={makeId} />}
          {!editor && selectedArea && <div className="planner-workbench-context">
            <div className="planner-context-controls"><label><span>Area</span><select value={selectedArea.id} onChange={(event) => onSessionChange({ selectedAreaId: event.target.value, selectedProjectId: "" })}>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label><label><span>Project</span><select value={selectedProjectId} onChange={(event) => onSessionChange({ selectedProjectId: event.target.value, queue: "work" })}><option value="">All projects</option>{selectedAreaProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div>
            <div className="planner-manage-row"><span>{blockTarget ? blockTarget.active ? "This area owns the current block." : `Next block · ${blockTarget.occurrence.date}` : "No upcoming block for this area."}</span><div className="planner-manage-actions"><button type="button" onClick={() => onManage(selectedProjectId ? { kind: "project", id: selectedProjectId } : { kind: "area", id: selectedArea.id })}>Manage {selectedProjectId ? "project" : "area"}</button><button type="button" onClick={() => setAreaCreatorOpen((open) => !open)} aria-expanded={areaCreatorOpen}>{areaCreatorOpen ? "Cancel" : "New area"}</button></div></div>
            {areaCreatorOpen && <form className="planner-area-create" onSubmit={createArea}><input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="Area name" aria-label="New area name" /><button type="submit" disabled={!areaName.trim()}>Create</button></form>}
            <div className="planner-area-source"><AreaDragItem area={selectedArea} selected renderAreaIcon={renderAreaIcon} onSelect={() => {}} onConfigure={() => setEditor({ kind: "series", areaId: selectedArea.id })} /></div>
            <nav className="planner-queue-tabs" aria-label="Workbench queues">{([['work', 'Work', projectTasks.length], ['backlog', 'Backlog', backlogTasks.length], ['waiting', 'Waiting', waitingTasks.length], ['routines', 'Routines', selectedAreaRoutines.length]] as Array<[PlannerQueue, string, number]>).map(([queue, label, count]) => <button type="button" aria-current={session.queue === queue ? "page" : undefined} className={session.queue === queue ? "active" : ""} onClick={() => onSessionChange({ queue })} key={queue}><span>{label}</span><small>{count}</small></button>)}</nav>
            <div className="planner-queue-content">
              {session.queue === "work" && (projectTasks.length ? projectTasks.map((task) => <TaskDragItem task={task} area={selectedArea} project={projects.find((project) => project.id === task.projectId)} canSchedule={Boolean(blockTarget)} onQueue={() => openTargetForArea(selectedArea.id, { kind: "task", itemId: task.id })} key={task.id} />) : <div className="planner-queue-empty"><strong>No actionable project work.</strong><p>Manage the area or choose another project when the queue needs attention.</p></div>)}
              {session.queue === "backlog" && (backlogTasks.length ? backlogTasks.map((task) => <TaskDragItem task={task} area={selectedArea} canSchedule={Boolean(blockTarget)} onQueue={() => openTargetForArea(selectedArea.id, { kind: "task", itemId: task.id })} key={task.id} />) : <div className="planner-queue-empty"><strong>The area backlog is clear.</strong><p>Capture new ideas in Inbox and give them a home during review.</p></div>)}
              {session.queue === "waiting" && (waitingTasks.length ? waitingTasks.map((task) => <div className="planner-waiting-source" key={task.id}><span><strong>{task.title}</strong><small>{task.projectId ? projects.find((project) => project.id === task.projectId)?.name : "Area waiting"}</small></span><button type="button" onClick={() => onTaskChange(task.id, { waiting: undefined })}>Resume</button></div>) : <div className="planner-queue-empty"><strong>Nothing is waiting.</strong><p>Blocked work stays out of scheduling until it is ready again.</p></div>)}
              {session.queue === "routines" && (selectedAreaRoutines.length ? selectedAreaRoutines.map((routine) => <RoutineDragItem routine={routine} canSchedule={Boolean(blockTarget)} onQueue={() => openTargetForArea(selectedArea.id, { kind: "routine", itemId: routine.id })} key={routine.id} />) : <div className="planner-queue-empty"><strong>No routines in this area.</strong><p>Add durable practices from the area management view.</p></div>)}
            </div>
            {!blockTarget && <button type="button" className="planner-create-first-block" onClick={() => setEditor({ kind: "series", areaId: selectedArea.id })}>Create a block for {selectedArea.name}</button>}
          </div>}
          {!editor && !selectedArea && <div className="planner-workbench-context planner-empty-workbench"><div className="planner-queue-empty"><strong>Create your first area.</strong><p>Areas give calendar blocks and work queues a durable home.</p></div><button type="button" onClick={() => setAreaCreatorOpen((open) => !open)} aria-expanded={areaCreatorOpen}>{areaCreatorOpen ? "Cancel" : "New area"}</button>{areaCreatorOpen && <form className="planner-area-create" onSubmit={createArea}><input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="Area name" aria-label="New area name" /><button type="submit" disabled={!areaName.trim()}>Create</button></form>}</div>}
        </aside>
        {workbenchVisible && <button type="button" className="planner-workbench-scrim" aria-label="Close workbench" onClick={() => onSessionChange({ workbenchOpen: false, workbenchPinned: true })} />}
        <section className="planner-calendar" aria-label={`Week of ${dates[0]}`}>
          <div className="planner-calendar-head"><div className="planner-time-head">Time</div>{dates.map((date) => <div className={`planner-day-head ${date === today ? "today" : ""} ${date === selectedDate ? "selected" : ""}`} key={date}><span>{SHORT_DAY_NAMES[plannerWeekday(date)]}</span><strong>{formatDateNumber(date)}</strong></div>)}</div>
          <div className="planner-deadline-row"><div className="planner-all-day-label">Due</div>{dates.map((date) => <div className={`planner-all-day-cell ${date === selectedDate ? "selected" : ""}`} key={date}>{tasks.filter((task) => task.status !== "done" && task.dueDate === date && !task.dueTime).slice(0, 2).map((task) => <span title={task.title} key={task.id}>{task.title}</span>)}{tasks.filter((task) => task.status !== "done" && task.dueDate === date && !task.dueTime).length > 2 && <small>+{tasks.filter((task) => task.status !== "done" && task.dueDate === date && !task.dueTime).length - 2} more</small>}</div>)}</div>
          <div className="planner-calendar-body" ref={calendarBodyRef} onScroll={(event) => publishCalendarScroll(event.currentTarget.scrollTop)}><div className="planner-time-rail">{hours.map((hour) => <span style={{ top: (hour - START_HOUR) * 60 * PIXELS_PER_MINUTE }} key={hour}>{formatPlannerTime(`${String(hour).padStart(2, "0")}:00`)}</span>)}</div>
            <div className="planner-days-grid">{dates.map((date) => <div className={`planner-day ${date === today ? "today" : ""} ${date === selectedDate ? "selected" : ""}`} data-date={date} key={date}>{hours.slice(0, -1).map((hour) => <div className="planner-hour-line" style={{ top: (hour - START_HOUR) * 60 * PIXELS_PER_MINUTE }} key={hour} />)}{slots.map((minutes) => <DropSlot date={date} minutes={minutes} key={minutes} />)}{date === today && currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60 && <div className="planner-now-line" style={{ top: (currentMinutes - START_HOUR * 60) * PIXELS_PER_MINUTE }}><span /></div>}{occurrences.filter((item) => item.date === date).map((occurrence) => {
              const area = areas.find((item) => item.id === occurrence.areaId);
              if (!area) return null;
              const active = occurrence.date === today && plannerMinutes(occurrence.startTime) <= currentMinutes && plannerMinutes(occurrence.endTime) > currentMinutes;
              return <AreaBlockCard occurrence={occurrence} area={area} items={plannerBlockItems(planner, occurrence) as BlockItem[]} tasks={tasks} routines={routines} active={active} onOpen={() => { onSessionChange({ selectedAreaId: occurrence.areaId, selectedProjectId: "", workbenchOpen: true, workbenchPinned: true }); setEditor({ kind: "occurrence", occurrenceId: occurrence.id }); }} key={occurrence.id} />;
            })}{tasks.filter((task) => task.status !== "done" && task.dueDate === date && task.dueTime).map((task) => { const inAreaBlock = occurrences.some((occurrence) => occurrence.date === date && occurrence.areaId === task.areaId && task.dueTime! >= occurrence.startTime && task.dueTime! < occurrence.endTime); return <button type="button" className={`planner-orphan-deadline ${inAreaBlock ? "in-block" : ""}`} style={{ top: (plannerMinutes(task.dueTime!) - START_HOUR * 60) * PIXELS_PER_MINUTE }} onClick={() => openTargetForArea(task.areaId)} title={inAreaBlock ? "Deadline inside this area block" : "This deadline falls outside an area block"} key={task.id}><time>{formatPlannerTime(task.dueTime!)}</time><span>{task.title}</span></button>; })}</div>)}</div>
          </div>
        </section>
      </div>
    </div>
    <DragOverlay>{activeLabel ? <div className="planner-drag-overlay">{activeLabel}</div> : null}</DragOverlay>
  </DndContext>;
}
