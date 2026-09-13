"use client";

import { DndContext, type DragEndEvent, type DragStartEvent, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { type ReactNode, FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CALENDAR_BLOCK_FILLS, calendarBlockConflict, DEFAULT_AREA_CALENDAR_BLOCK_FILL, DEFAULT_STANDALONE_CALENDAR_BLOCK_FILL, formatPlannerTime, isFinalRoutineSessionStatus, isPlannerCalendarTime, isPlannerDate, materializeCalendarBlocks, MIN_CALENDAR_BLOCK_MINUTES, normalizePlanner, parsePlannerCandidate, placePlannerBlockItem, PLANNER_END_MINUTES, PLANNER_START_MINUTES, PLANNER_TIME_ZONE, plannerAfterOccurrenceDelete, plannerAfterOccurrenceUpdate, plannerAfterOneTimeRuleEdit, plannerAfterRuleDelete, plannerBlockItems, plannerBlockTarget, plannerDateKey, plannerDragSelection, plannerMinutes, plannerOccurrenceId, plannerRuleOccursOn, plannerTime, plannerWeekDates, plannerWeekday, recurringCalendarBlockRulesConflict, shiftPlannerDate } from "./planner-schema.mjs";
import { Presence } from "./presence";
import { listMotionRef } from "./list-motion";

export type PlannerArea = { id: string; name: string; icon: string };
export type PlannerProject = { id: string; areaId: string; name: string; outcome: string };
export type PlannerTask = { id: string; title: string; areaId?: string; projectId?: string; status: "todo" | "doing" | "done"; dueDate?: string; dueTime?: string; priority?: "low" | "medium" | "high"; someday?: boolean; waiting?: boolean };
export type PlannerRoutine = { id: string; areaId: string; name: string; expectedMinutes: number; sessions: Array<{ date: string; status: "pending" | "completed" | "skipped" | "missed" }> };
export type CalendarBlockFill = "sage" | "sky" | "sand" | "rose" | "lilac" | "slate";
type CalendarBlockSchedule = { id: string; weekdays: number[]; effectiveOn: string; endsOn?: string; startTime: string; endTime: string; fill: CalendarBlockFill };
export type AreaCalendarBlockRule = CalendarBlockSchedule & { kind: "area"; areaId: string };
export type StandaloneCalendarBlockRule = CalendarBlockSchedule & { kind: "standalone"; title: string };
export type CalendarBlockRule = AreaCalendarBlockRule | StandaloneCalendarBlockRule;
export type CalendarBlockException = { id: string; ruleId: string; occurrenceDate: string; kind: "skip" | "override"; date?: string; startTime?: string; endTime?: string };
export type BlockItem = { id: string; ruleId: string; occurrenceDate: string; kind: "task" | "routine"; itemId: string };
export type PlannerData = { blockRules: CalendarBlockRule[]; blockExceptions: CalendarBlockException[]; blockItems: BlockItem[] };
type CalendarOccurrence = { id: string; ruleId: string; sourceDate: string; date: string; startTime: string; endTime: string; fill: CalendarBlockFill; exception: boolean } & ({ kind: "area"; areaId: string } | { kind: "standalone"; title: string });
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
  onNotice: (message: string) => void;
  onEditorOpenChange: (open: boolean) => void;
  session: PlannerSessionState;
  onSessionChange: (patch: Partial<PlannerSessionState>) => void;
  renderWork: (areaId: string, selectedTaskIds: Set<string>, full: boolean, onQueue: (taskId: string) => void, onRelease: (taskId: string) => void) => ReactNode;
  onCreateArea: (name: string) => void;
};
type PlannerDragData = { kind?: string; taskId?: string; routineId?: string; occurrence?: CalendarOccurrence };
type CalendarDragSelection = { pointerId: number; date: string; areaId: string; anchorMinutes: number; startMinutes: number; endMinutes: number; originY: number; moved: boolean };
type NewBlockConnection = { kind: "area"; areaId: string } | { kind: "standalone" };
type PlannerEditor =
  | { kind: "schedule"; areaId: string }
  | { kind: "series"; ruleId: string; areaId?: never; date?: never; blockKind?: never; initialStartTime?: never; initialEndTime?: never; initialFrequency?: never }
  | { kind: "series"; ruleId?: never; areaId?: string; date: string; blockKind: "area" | "standalone"; initialStartTime?: string; initialEndTime?: string; initialFrequency?: "once" | "weekly" }
  | { kind: "occurrence"; occurrenceId: string }
  | { kind: "deadline"; taskId: string };

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
const WORKBENCH_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const FOCUSABLE_SELECTOR = 'button:not(:disabled), summary, select:not(:disabled), textarea:not(:disabled), input:not(:disabled):not([type="hidden"]), [tabindex]:not([tabindex="-1"]):not(:disabled)';
const CALENDAR_BLOCK_FILL_LABELS: Record<CalendarBlockFill, string> = {
  sage: "Sage",
  sky: "Sky",
  sand: "Sand",
  rose: "Rose",
  lilac: "Lilac",
  slate: "Slate",
};
const CALENDAR_BLOCK_FILL_OPTIONS = (CALENDAR_BLOCK_FILLS as CalendarBlockFill[]).map((value) => ({ value, label: CALENDAR_BLOCK_FILL_LABELS[value] }));
const STANDALONE_BLOCK_SUGGESTIONS = ["Driving", "Break", "Meal", "Appointment", "Buffer"];

function resizedCalendarBlockEnd(startTime: string, endTime: string, deltaMinutes: number) {
  const startMinutes = plannerMinutes(startTime);
  return Math.max(startMinutes + MIN_CALENDAR_BLOCK_MINUTES, Math.min(END_HOUR * 60, plannerMinutes(endTime) + deltaMinutes));
}

function formatWeekRange(dates: string[]) {
  const format = (value: string, includeYear = false) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(includeYear ? { year: "numeric" } : {}) }).format(new Date(`${value}T00:00:00Z`));
  return `${format(dates[0])} – ${format(dates[6], true)}`;
}

function formatDateNumber(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function formatWorkbenchDate(value: string) {
  return WORKBENCH_DATE_FORMATTER.format(new Date(`${value}T00:00:00Z`));
}

function focusableElements(container: ParentNode | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.closest('[inert], [aria-hidden="true"]')) return false;
    for (let ancestor = element.parentElement; ancestor && ancestor !== container; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === "DETAILS" && !ancestor.hasAttribute("open") && !(element.tagName === "SUMMARY" && element.parentElement === ancestor)) return false;
    }
    return true;
  });
}

function formatBlockTime(value: string) {
  const minutes = plannerMinutes(value);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour < 12 ? "a" : "p"}`;
}

function AddToQueueIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h8M3.5 10h6M3.5 14.5h5" /><path d="M14 10.5v5M11.5 13h5" /></svg>;
}

function PlusIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v13M3.5 10h13" /></svg>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8h14M6.5 2.8v3.4m7-3.4v3.4" /></svg>;
}

function EditIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.2 4.2 3.6 3.6M4 16l2.8-.6 8.7-8.7a1.3 1.3 0 0 0 0-1.8l-.4-.4a1.3 1.3 0 0 0-1.8 0l-8.7 8.7L4 16Z" /></svg>;
}

function DeleteIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M7 5.5V3.3h6v2.2m2 0-.8 11.2H5.8L5 5.5m3 3v5m4-5v5" /></svg>;
}

function ArrowIcon({ direction = "right" }: { direction?: "left" | "right" }) {
  return <svg className={direction === "left" ? "reverse" : undefined} viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 3.7 3.7L16 5.8" /></svg>;
}

function WaitIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5v4l2.6 1.5" /></svg>;
}

function VerticalArrowIcon({ direction }: { direction: "up" | "down" }) {
  return <svg className={direction === "down" ? "down" : undefined} viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 12 4.5-4.5 4.5 4.5" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h.01M10 10h.01M15 10h.01" /></svg>;
}

function BlockItemActionMenu({ itemId, title, canMoveEarlier, canMoveLater, onWait, onMoveEarlier, onMoveLater, onRemove }: { itemId: string; title: string; canMoveEarlier: boolean; canMoveLater: boolean; onWait?: () => void; onMoveEarlier: () => void; onMoveLater: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `planner-row-menu-${itemId}`;

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
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
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
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

  return <div className="planner-row-menu">
    <button ref={triggerRef} type="button" className="planner-icon-action" aria-expanded={open} aria-controls={menuId} aria-haspopup="menu" aria-label={`More actions for ${title}`} title="More actions" onClick={() => setOpen((current) => !current)}><MoreIcon /></button>
    <Presence show={open} className="motion-popover">{() => <div ref={menuRef} id={menuId} className="planner-row-menu-popover" role="menu" tabIndex={-1} aria-label={`More actions for ${title}`} onKeyDown={handleMenuKeyDown}>
      {onWait && <button type="button" role="menuitem" onClick={() => choose(onWait)}><WaitIcon /><span>Move to Waiting</span></button>}
      <button type="button" role="menuitem" disabled={!canMoveEarlier} onClick={() => choose(onMoveEarlier)}><VerticalArrowIcon direction="up" /><span>Move earlier</span></button>
      <button type="button" role="menuitem" disabled={!canMoveLater} onClick={() => choose(onMoveLater)}><VerticalArrowIcon direction="down" /><span>Move later</span></button>
      <button type="button" className="danger" role="menuitem" onClick={() => choose(onRemove)}><DeleteIcon /><span>Remove from block</span></button>
    </div>}</Presence>
  </div>;
}

function BlockFillPicker({ value, onChange, repeating }: { value: CalendarBlockFill; onChange: (fill: CalendarBlockFill) => void; repeating: boolean }) {
  const scope = repeating ? "All blocks in schedule" : "This block only";
  const pickerRef = useRef<HTMLDetailsElement>(null);
  return <details className={`planner-fill-menu fill-${value}`} ref={pickerRef}>
    <summary aria-label={`Choose block fill. ${CALENDAR_BLOCK_FILL_LABELS[value]} selected. ${scope}`} title={`${CALENDAR_BLOCK_FILL_LABELS[value]} fill · ${scope}`}><i aria-hidden="true" /></summary>
    <div className="planner-fill-palette" role="group" aria-label="Block fill colors">
      {CALENDAR_BLOCK_FILL_OPTIONS.map((option) => <button
        type="button"
        className={`planner-fill-option fill-${option.value}`}
        aria-label={option.label}
        aria-pressed={value === option.value}
        title={option.label}
        onClick={() => { onChange(option.value); pickerRef.current?.removeAttribute("open"); }}
        key={option.value}
      >{value === option.value ? <CheckIcon /> : null}</button>)}
    </div>
  </details>;
}

function isOneTimeRule(rule: CalendarBlockRule) {
  return rule.endsOn === rule.effectiveOn;
}

function scheduleRuleDays(rule: CalendarBlockRule) {
  if (isOneTimeRule(rule)) return formatWorkbenchDate(rule.effectiveOn);
  return [1, 2, 3, 4, 5, 6, 0].filter((day) => rule.weekdays.includes(day)).map((day) => SHORT_DAY_NAMES[day]).join(", ");
}

function RoutineDragItem({ routine, canSchedule, onQueue }: { routine: PlannerRoutine; canSchedule: boolean; onQueue: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `routine:${routine.id}`, data: { kind: "routine", routineId: routine.id } });
  return <div className={`planner-compact-source ${isDragging ? "dragging" : ""}`} ref={setNodeRef}><button type="button" className="planner-compact-drag" {...listeners} {...attributes} aria-label={`Drag ${routine.name} into a time block`}><span><strong>{routine.name}</strong><small>{routine.expectedMinutes} min routine</small></span></button><span className="planner-source-actions"><button type="button" className="planner-queue-button" disabled={!canSchedule} onClick={onQueue} aria-label={`Add ${routine.name} to its time block queue`} title={canSchedule ? "Add to queue" : "Schedule a block first"}><AddToQueueIcon /></button></span></div>;
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

function visiblePlannerBlockItemCount(height: number, itemCount: number) {
  if (!itemCount) return 0;
  if (height < 90) return 1;
  return Math.min(itemCount, Math.max(1, Math.floor((height - 56) / 26)));
}

function CalendarBlockCard({ occurrence, area, items, tasks, routines, active, onOpen }: { occurrence: CalendarOccurrence; area?: PlannerArea; items: BlockItem[]; tasks: PlannerTask[]; routines: PlannerRoutine[]; active: boolean; onOpen: () => void }) {
  const { attributes: moveAttributes, isDragging: isMoving, listeners: moveListeners, setNodeRef: setMoveNodeRef, transform: moveTransform } = useDraggable({ id: `block:${occurrence.id}`, data: { kind: "block", occurrence } });
  const { attributes: resizeAttributes, isDragging: isResizing, listeners: resizeListeners, setNodeRef: setResizeNodeRef, transform: resizeTransform } = useDraggable({ id: `resize:${occurrence.id}`, data: { kind: "resize", occurrence } });
  const startMinutes = plannerMinutes(occurrence.startTime);
  const endMinutes = plannerMinutes(occurrence.endTime);
  const top = (startMinutes - START_HOUR * 60) * PIXELS_PER_MINUTE;
  const resizeDelta = isResizing && resizeTransform ? Math.round(resizeTransform.y / 15) * 15 : 0;
  const previewEndMinutes = resizedCalendarBlockEnd(occurrence.startTime, occurrence.endTime, resizeDelta);
  const height = (isResizing ? previewEndMinutes - startMinutes : endMinutes - startMinutes) * PIXELS_PER_MINUTE;
  const displayEndTime = isResizing ? plannerTime(previewEndMinutes) : occurrence.endTime;
  const transform = moveTransform ? `translate3d(${moveTransform.x}px,${moveTransform.y}px,0)` : undefined;
  const title = occurrence.kind === "area" ? area?.name ?? "Unavailable area" : occurrence.title;
  const queuedItems = occurrence.kind === "area" ? items : [];
  const firstUnfinishedIndex = active && occurrence.kind === "area" ? queuedItems.findIndex((item) => !plannerBlockItemDone(item, occurrence.date, tasks, routines)) : -1;
  const compact = height < 90;
  const visibleItemCount = visiblePlannerBlockItemCount(height, queuedItems.length);
  const visibleStartIndex = active && firstUnfinishedIndex > 0 && visibleItemCount < queuedItems.length ? Math.min(firstUnfinishedIndex, queuedItems.length - visibleItemCount) : 0;
  const visibleItems = queuedItems.slice(visibleStartIndex, visibleStartIndex + visibleItemCount);
  const hiddenItemCount = queuedItems.length - visibleItems.length;
  const queueSummary = occurrence.kind === "standalone" ? "No area." : queuedItems.length ? `${queuedItems.length} queued item${queuedItems.length === 1 ? "" : "s"}.` : "No queued items.";
  return <article ref={setMoveNodeRef} className={`planner-calendar-block fill-${occurrence.fill} ${occurrence.kind === "standalone" ? "standalone" : ""} ${compact ? "compact" : ""} ${height < 46 ? "short" : ""} ${active ? "active" : ""} ${isMoving ? "moving" : ""} ${isResizing ? "resizing" : ""}`} style={{ top, height, transform }}>
    <button type="button" className="planner-block-move" {...moveListeners} {...moveAttributes} aria-label={`Move this ${title} occurrence`} title="Drag to move this occurrence"><i /><i /><i /></button>
    <button type="button" className="planner-block-main" onClick={onOpen} aria-label={`${title}, ${formatPlannerTime(occurrence.startTime)} to ${formatPlannerTime(displayEndTime)}. ${queueSummary} Open this occurrence.`}><span className="planner-block-copy"><span className="planner-block-title"><strong>{title}</strong></span><small>{formatBlockTime(occurrence.startTime)}–{formatBlockTime(displayEndTime)}</small></span></button>
    <div className="planner-block-contents" ref={listMotionRef}>{visibleItems.map((item, visibleIndex) => { const index = visibleStartIndex + visibleIndex; const task = item.kind === "task" ? tasks.find((value) => value.id === item.itemId) : undefined; const routine = item.kind === "routine" ? routines.find((value) => value.id === item.itemId) : undefined; const title = task?.title ?? routine?.name ?? "Unavailable item"; const done = plannerBlockItemDone(item, occurrence.date, tasks, routines); const label = !done && index === firstUnfinishedIndex ? "Now" : done ? "Done" : `${index + 1}`; const overflow = visibleIndex === visibleItems.length - 1 ? hiddenItemCount : 0; return <button type="button" className={`planner-block-item ${done ? "done" : ""}`} onClick={onOpen} aria-label={`${label}: ${title}.${overflow ? ` ${overflow} more queued.` : ""}`} key={item.id}><span>{label}</span><strong>{title}</strong>{overflow > 0 && <small className="planner-block-overflow" aria-label={`${overflow} more queued`}>+{overflow}</small>}</button>; })}</div>
    <button type="button" ref={setResizeNodeRef} className="planner-block-resize" {...resizeListeners} {...resizeAttributes} aria-label={`Resize this ${title} occurrence`} title="Drag to resize this occurrence"><span /></button>
  </article>;
}

function ScheduleEditor({ rule, areas, initialAreaId, initialKind, initialDate, initialStartTime, initialEndTime, initialFrequency, onConnectionChange, onSave, onDelete, onClose }: { rule?: CalendarBlockRule; areas: PlannerArea[]; initialAreaId?: string; initialKind?: "area" | "standalone"; initialDate: string; initialStartTime?: string; initialEndTime?: string; initialFrequency?: "once" | "weekly"; onConnectionChange?: (connection: NewBlockConnection) => void; onSave: (rule: CalendarBlockRule) => string | null; onDelete?: () => void; onClose: () => void }) {
  const existingOneTimeBlock = Boolean(rule && isOneTimeRule(rule));
  const [frequency, setFrequency] = useState<"once" | "weekly">(existingOneTimeBlock ? "once" : initialFrequency ?? "weekly");
  const [kind, setKind] = useState<"area" | "standalone">(rule?.kind ?? initialKind ?? (areas.length ? "area" : "standalone"));
  const [areaId, setAreaId] = useState(rule?.kind === "area" ? rule.areaId : initialAreaId ?? areas[0]?.id ?? "");
  const [title, setTitle] = useState(rule?.kind === "standalone" ? rule.title : "");
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? [plannerWeekday(initialDate)]);
  const [date, setDate] = useState(rule?.effectiveOn ?? initialDate);
  const [startTime, setStartTime] = useState(rule?.startTime ?? initialStartTime ?? "09:00");
  const [endTime, setEndTime] = useState(rule?.endTime ?? initialEndTime ?? "10:00");
  const [fill, setFill] = useState<CalendarBlockFill>(rule?.fill ?? ((initialKind ?? (areas.length ? "area" : "standalone")) === "area" ? DEFAULT_AREA_CALENDAR_BLOCK_FILL : DEFAULT_STANDALONE_CALENDAR_BLOCK_FILL) as CalendarBlockFill);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const validTimes = isPlannerCalendarTime(startTime) && isPlannerCalendarTime(endTime, true);
  const duration = validTimes ? plannerMinutes(endTime) - plannerMinutes(startTime) : 0;
  const validSchedule = frequency === "once" ? isPlannerDate(date) : weekdays.length > 0;
  const validIdentity = kind === "area" ? Boolean(areaId) : Boolean(title.trim());
  const canSave = Boolean(validIdentity && validSchedule && validTimes && duration >= MIN_CALENDAR_BLOCK_MINUTES);

  function chooseKind(nextKind: "area" | "standalone") {
    if (nextKind === "area" && !areas.length) return;
    setKind(nextKind);
    onConnectionChange?.(nextKind === "area" ? { kind: "area", areaId } : { kind: "standalone" });
    setFill((current) => current === (kind === "area" ? DEFAULT_AREA_CALENDAR_BLOCK_FILL : DEFAULT_STANDALONE_CALENDAR_BLOCK_FILL)
      ? nextKind === "area" ? DEFAULT_AREA_CALENDAR_BLOCK_FILL : DEFAULT_STANDALONE_CALENDAR_BLOCK_FILL
      : current);
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    const effectiveOn = frequency === "once" ? date : rule?.effectiveOn ?? initialDate;
    const schedule = { id: rule?.id ?? "", weekdays: frequency === "once" ? [plannerWeekday(date)] : [...weekdays].sort((a, b) => a - b), effectiveOn, ...(frequency === "once" ? { endsOn: date } : {}), startTime, endTime, fill };
    const draft = kind === "area" ? { ...schedule, kind, areaId } : { ...schedule, kind, title: title.trim() };
    const issue = onSave(draft as CalendarBlockRule);
    if (issue) setError(issue);
  }

  return <form className="planner-editor" onSubmit={submit}>
    <div className="planner-editor-heading"><div className="planner-editor-title"><div className="planner-editor-title-row"><h2>{rule ? existingOneTimeBlock ? "Edit time block" : "Edit repeating schedule" : "New time block"}</h2><BlockFillPicker value={fill} onChange={setFill} repeating={frequency === "weekly"} /></div><p>{rule ? existingOneTimeBlock ? "Changes apply only to this date." : "Changes apply to every block in this schedule." : "Choose one date or a weekly rhythm."}</p></div><button type="button" onClick={onClose} aria-label="Close schedule settings">Close</button></div>
    <div className="planner-schedule-fields" ref={listMotionRef}>
      <fieldset className="planner-block-kind"><legend>Connect to</legend><div><button type="button" aria-pressed={kind === "area"} disabled={!areas.length} onClick={() => chooseKind("area")}>Area</button><button type="button" aria-pressed={kind === "standalone"} onClick={() => chooseKind("standalone")}>No area</button></div></fieldset>
      {kind === "area" ? <label className="planner-field planner-mode-field"><span>Area</span><select required value={areaId} onChange={(event) => { const nextAreaId = event.target.value; setAreaId(nextAreaId); onConnectionChange?.({ kind: "area", areaId: nextAreaId }); }}>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label> : <div className="planner-standalone-title planner-mode-field"><label className="planner-field"><span>Title</span><input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Driving" /></label><div className="planner-title-suggestions" aria-label="Title suggestions">{STANDALONE_BLOCK_SUGGESTIONS.map((suggestion) => <button type="button" onClick={() => setTitle(suggestion)} key={suggestion}>{suggestion}</button>)}</div><p>Protected time only—no tasks or routines.</p></div>}
      {!rule && <fieldset className="planner-frequency"><legend>Schedule</legend><div><button type="button" aria-pressed={frequency === "once"} onClick={() => setFrequency("once")}>One time</button><button type="button" aria-pressed={frequency === "weekly"} onClick={() => setFrequency("weekly")}>Repeats weekly</button></div></fieldset>}
      {frequency === "once" ? <label className="planner-field planner-mode-field" key="once"><span>Date</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label> : <fieldset className="planner-days planner-mode-field" key="weekly"><legend>Repeats</legend><div>{[1, 2, 3, 4, 5, 6, 0].map((day) => <button type="button" aria-pressed={weekdays.includes(day)} aria-label={DAY_NAMES[day]} onClick={() => setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])} key={day}>{SHORT_DAY_NAMES[day].slice(0, 1)}</button>)}</div></fieldset>}
      <div className="planner-time-fields"><label className="planner-field"><span>Starts</span><input required type="time" step="900" min={CALENDAR_START} max="22:30" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label className="planner-field"><span>Ends</span><input required type="time" step="900" min={startTime || CALENDAR_START} max={CALENDAR_END} value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>
    </div>
    <Presence show={duration < MIN_CALENDAR_BLOCK_MINUTES} className="motion-collapse">{() => <p className="planner-form-error" role="alert">Time blocks need at least 30 minutes.</p>}</Presence>
    <Presence show={Boolean(error)} className="motion-collapse">{() => <p className="planner-form-error" role="alert">{error}</p>}</Presence>
    <div className="planner-editor-actions">{onDelete && <button type="button" className="planner-delete planner-button-with-icon" onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}><DeleteIcon />{confirmDelete ? existingOneTimeBlock ? "Confirm delete block" : "Confirm delete repeating schedule" : existingOneTimeBlock ? "Delete block" : "Delete repeating schedule"}</button>}<span /><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="planner-save planner-button-with-icon" disabled={!canSave}><CheckIcon />{rule ? existingOneTimeBlock ? "Save block" : "Save schedule" : frequency === "once" ? "Add once" : "Add weekly"}</button></div>
  </form>;
}

function ScheduleOverview({ area, rules, exceptions, onEditSeries, onEditOccurrence, onDelete, onAdd, onBack }: { area: PlannerArea; rules: AreaCalendarBlockRule[]; exceptions: CalendarBlockException[]; onEditSeries: (ruleId: string) => void; onEditOccurrence: (occurrenceId: string, date: string) => void; onDelete: (ruleId: string) => void; onAdd: () => void; onBack: () => void }) {
  const [confirmRuleId, setConfirmRuleId] = useState("");
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const focusAfterDelete = useRef(false);
  const exceptionsByOccurrence = useMemo(() => new Map(exceptions.map((exception) => [plannerOccurrenceId(exception.ruleId, exception.occurrenceDate), exception])), [exceptions]);
  const orderedRules = useMemo(() => [...rules].sort((left, right) => Number(isOneTimeRule(left)) - Number(isOneTimeRule(right)) || left.weekdays[0] - right.weekdays[0] || left.startTime.localeCompare(right.startTime) || left.effectiveOn.localeCompare(right.effectiveOn)), [rules]);
  useEffect(() => {
    if (!focusAfterDelete.current) return;
    focusAfterDelete.current = false;
    const nextTarget = rules.length
      ? overviewRef.current?.querySelector<HTMLElement>('.planner-schedule-row-main, .planner-schedule-new')
      : overviewRef.current?.querySelector<HTMLElement>('.planner-schedule-empty .planner-schedule-new');
    nextTarget?.focus();
  }, [rules]);

  function deleteScheduleRule(ruleId: string) {
    focusAfterDelete.current = true;
    setConfirmRuleId("");
    onDelete(ruleId);
  }

  return <div className="planner-editor planner-schedule-overview" ref={overviewRef}>
    <div className="planner-editor-heading"><div><h2>{area.name} schedule</h2><p>Weekly rhythms and one-time blocks for this area.</p></div><button type="button" className="planner-heading-back planner-button-with-icon" onClick={onBack}><ArrowIcon direction="left" />Back</button></div>
    <button type="button" className="planner-schedule-new planner-button-with-icon" onClick={onAdd}><PlusIcon />New block</button>
    <div className="planner-schedule-list" ref={listMotionRef}>{orderedRules.map((rule) => {
      const oneTime = isOneTimeRule(rule);
      const exception = oneTime ? exceptionsByOccurrence.get(plannerOccurrenceId(rule.id, rule.effectiveOn)) : undefined;
      const override = exception?.kind === "override" ? exception : undefined;
      const skipped = exception?.kind === "skip";
      const date = override?.date ?? rule.effectiveOn;
      const startTime = override?.startTime ?? rule.startTime;
      const endTime = override?.endTime ?? rule.endTime;
      const label = oneTime ? formatWorkbenchDate(date) : scheduleRuleDays(rule);
      const edit = () => oneTime && !skipped ? onEditOccurrence(plannerOccurrenceId(rule.id, rule.effectiveOn), date) : onEditSeries(rule.id);
      const confirming = confirmRuleId === rule.id;
      return <article className="planner-schedule-row" ref={listMotionRef} key={rule.id}>
        <button type="button" className="planner-schedule-row-main" onClick={edit}>
          <span className={`planner-schedule-row-icon fill-${rule.fill}`}><CalendarIcon /></span>
          <span><strong>{label}</strong><small>{formatBlockTime(startTime)}–{formatBlockTime(endTime)} · {skipped ? "Skipped · edit to restore" : oneTime ? "One time" : "Repeats weekly"}</small></span>
          <ArrowIcon />
        </button>
        <div className={`planner-schedule-row-actions ${confirming ? "confirming" : ""}`} key={confirming ? "confirm" : "actions"}>
          {confirming ? <><button type="button" className="planner-confirm-delete" onClick={() => deleteScheduleRule(rule.id)}>{oneTime ? "Confirm delete block" : "Confirm delete repeating schedule"}</button><button type="button" onClick={() => setConfirmRuleId("")}>Cancel</button></> : <><button type="button" aria-label={`Edit ${label} block`} title="Edit block" onClick={edit}><EditIcon /></button><button type="button" className="danger" aria-label={`Delete ${label} ${oneTime ? "block" : "repeating schedule"}`} title={oneTime ? "Delete block" : "Delete repeating schedule"} onClick={() => setConfirmRuleId(rule.id)}><DeleteIcon /></button></>}
        </div>
      </article>;
    })}{!orderedRules.length && <div key="empty" className="planner-schedule-empty"><CalendarIcon /><strong>No time blocks scheduled</strong><p>Create one block or a weekly rhythm for {area.name}.</p><button type="button" className="planner-schedule-new planner-button-with-icon" onClick={onAdd}><PlusIcon />New block</button></div>}</div>
  </div>;
}

function DeadlineEditor({ task, area, project, onSave, onComplete, onClear, onClose }: { task: PlannerTask; area?: PlannerArea; project?: PlannerProject; onSave: (dueDate: string, dueTime?: string) => void; onComplete: () => void; onClear: () => void; onClose: () => void }) {
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task.dueTime ?? "");
  const canSave = isPlannerDate(dueDate) && (!dueTime || isPlannerCalendarTime(dueTime));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSave) onSave(dueDate, dueTime || undefined);
  }

  return <form className="planner-editor deadline-editor" onSubmit={submit}>
    <div className="planner-editor-heading"><div><h2>{task.title}</h2><p>{project?.name ?? area?.name ?? "Inbox"} · Task deadline</p></div><button type="button" onClick={onClose} aria-label="Close task deadline editor">Close</button></div>
    <div className="planner-schedule-fields">
      <label className="planner-field"><span>Due date</span><input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
      <label className="planner-field"><span>Due time</span><input type="time" step="900" min={CALENDAR_START} max="22:45" value={dueTime} onChange={(event) => setDueTime(event.target.value)} /></label>
    </div>
    <div className="planner-editor-actions"><button type="button" className="planner-delete" onClick={onClear}>Remove deadline</button><span /><button type="button" onClick={onComplete}>Complete task</button><button type="submit" className="planner-save" disabled={!canSave}>Save task</button></div>
  </form>;
}

function AreaOccurrenceEditor({ occurrence, rule, today, currentMinutes, area, projects, tasks, routines, planner, onSave, onDelete, onAddAnother, onEditSeries, onPlannerChange, onTaskChange, onRoutineSessionStatus, onClose, makeId, renderWork }: { occurrence: CalendarOccurrence & { kind: "area"; areaId: string }; rule: AreaCalendarBlockRule; today: string; currentMinutes: number; area: PlannerArea; projects: PlannerProject[]; tasks: PlannerTask[]; routines: PlannerRoutine[]; planner: PlannerData; onSave: (date: string, startTime: string, endTime: string, fill: CalendarBlockFill) => string | null; onDelete: () => void; onAddAnother: () => void; onEditSeries: () => void; onPlannerChange: (planner: PlannerData) => void; onTaskChange: PlannerProps["onTaskChange"]; onRoutineSessionStatus: PlannerProps["onRoutineSessionStatus"]; onClose: () => void; makeId: PlannerProps["makeId"]; renderWork: PlannerProps["renderWork"] }) {
  const [date, setDate] = useState(occurrence.date);
  const [startTime, setStartTime] = useState(occurrence.startTime);
  const [endTime, setEndTime] = useState(occurrence.endTime);
  const [fill, setFill] = useState<CalendarBlockFill>(rule.fill);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const blockItems = plannerBlockItems(planner, occurrence) as BlockItem[];
  const matchingRoutines = routines.filter((routine) => routine.areaId === occurrence.areaId);
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  function saveOccurrence(event: FormEvent) {
    event.preventDefault();
    if (!isPlannerDate(date) || !isPlannerCalendarTime(startTime) || !isPlannerCalendarTime(endTime, true) || plannerMinutes(endTime) - plannerMinutes(startTime) < MIN_CALENDAR_BLOCK_MINUTES) {
      setError("Choose a valid date and a 30-minute block between 6 AM and 11 PM on the 15-minute grid.");
      return;
    }
    const issue = onSave(date, startTime, endTime, fill);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    if (plannerWeekDates(date)[0] !== plannerWeekDates(occurrence.date)[0]) onClose();
  }

  function addCandidate(candidate: string) {
    const parsed = parsePlannerCandidate(candidate) as { kind: "task" | "routine"; itemId: string } | null;
    if (!parsed) return;
    const { kind, itemId } = parsed;
    const alreadyInThisBlock = blockItems.some((item) => item.kind === kind && item.itemId === itemId);
    const placement = placePlannerBlockItem(planner, occurrence, kind, itemId, makeId("block-item")) as { planner: PlannerData; status: "added" | "exists" | "full" | "unavailable" };
    if (placement.status === "unavailable") {
      setError("No-area blocks cannot hold tasks or routines.");
      return;
    }
    if (placement.status === "exists") {
      setError(kind === "routine" && !alreadyInThisBlock ? "That routine is already scheduled in another block on this date." : "That item is already in this block.");
      return;
    }
    if (placement.status === "full") {
      setError("This block already has three items.");
      return;
    }
    onPlannerChange(placement.planner);
    if (kind === "task") onTaskChange(itemId, { someday: undefined, waiting: undefined });
    setError("");
  }

  function removeItem(id: string) {
    onPlannerChange({ ...planner, blockItems: planner.blockItems.filter((item) => item.id !== id) });
  }

  function isDone(item: BlockItem) {
    return plannerBlockItemDone(item, occurrence.date, tasks, routines);
  }

  const orderedBlockItems = [
    ...blockItems.filter((item) => !isDone(item)),
    ...blockItems.filter((item) => isDone(item)),
  ];

  function moveItem(id: string, distance: number) {
    const ordered = [...orderedBlockItems];
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

  const occurrenceActive = occurrence.date === today && plannerMinutes(occurrence.startTime) <= currentMinutes && plannerMinutes(occurrence.endTime) > currentMinutes;
  const nowItemId = occurrenceActive ? orderedBlockItems.find((item) => !isDone(item))?.id : undefined;
  const canExecuteRoutines = occurrence.date === today;
  const selectedKeys = new Set(blockItems.map((item) => `${item.kind}:${item.itemId}`));

  const recurring = !isOneTimeRule(rule);

  return <div className="planner-editor occurrence-editor">
    <div className="planner-editor-heading"><div className="planner-editor-title"><div className="planner-editor-title-row"><h2>{area.name}</h2><BlockFillPicker value={fill} onChange={setFill} repeating={recurring} /></div><p>{formatWorkbenchDate(occurrence.date)} · {formatBlockTime(occurrence.startTime)}–{formatBlockTime(occurrence.endTime)}{recurring ? " · Repeats weekly" : " · One time"}</p></div><button type="button" onClick={onClose}>Close</button></div>
    <section className="planner-editor-section planner-this-block"><div><h3>This block · choose up to 3</h3><span>{blockItems.length}/3</span></div><div className="planner-block-item-list" ref={listMotionRef}>{orderedBlockItems.map((item, index) => {
      const task = item.kind === "task" ? tasks.find((value) => value.id === item.itemId) : undefined;
      const routine = item.kind === "routine" ? routines.find((value) => value.id === item.itemId) : undefined;
      const title = task?.title ?? routine?.name ?? "Unavailable item";
      const done = isDone(item);
      const canMoveEarlier = index > 0 && isDone(orderedBlockItems[index - 1]) === done;
      const canMoveLater = index < orderedBlockItems.length - 1 && isDone(orderedBlockItems[index + 1]) === done;
      return <div className={`planner-session-row block-work-row ${done ? "done" : ""}`} key={item.id}>
        <span>
          {!done && <small>{item.id === nowItemId ? "Now" : `Up next · ${index + 1}`}</small>}
          <strong>{done && <span className="sr-only">Completed: </span>}{title}</strong>
          <small>{task?.projectId ? projectsById.get(task.projectId)?.name : item.kind === "routine" ? "Routine" : "Area backlog"}</small>
        </span>
        <span className="planner-row-actions">
          {!done && item.kind === "task" && <button type="button" className="planner-icon-action" aria-label={`Complete ${title}`} title="Complete" onClick={() => onTaskChange(item.itemId, { status: "done" })}><CheckIcon /></button>}
          {!done && item.kind === "routine" && canExecuteRoutines && <>
            <button type="button" className="planner-icon-action" aria-label={`Complete ${title}`} title="Complete" onClick={() => onRoutineSessionStatus(item.itemId, occurrence.date, "completed")}><CheckIcon /></button>
            <button type="button" onClick={() => onRoutineSessionStatus(item.itemId, occurrence.date, "skipped")}>Skip</button>
          </>}
          <BlockItemActionMenu itemId={item.id} title={title} canMoveEarlier={canMoveEarlier} canMoveLater={canMoveLater} onWait={!done && item.kind === "task" ? () => { onTaskChange(item.itemId, { waiting: true, someday: undefined }); removeItem(item.id); } : undefined} onMoveEarlier={() => moveItem(item.id, -1)} onMoveLater={() => moveItem(item.id, 1)} onRemove={() => removeItem(item.id)} />
        </span>
      </div>;
    })}{!blockItems.length && <p key="empty" className="planner-editor-empty">Nothing selected. Add one to three items, or leave this block open for context-led work.</p>}</div>

    </section>
    <Presence show={Boolean(error)} className="motion-collapse">{() => <p className="planner-form-error" role="alert">{error}</p>}</Presence>
    {renderWork(area.id, new Set(blockItems.filter((item) => item.kind === "task").map((item) => item.itemId)), blockItems.length >= 3, (taskId) => addCandidate(`task:${taskId}`), (taskId) => { const item = blockItems.find((item) => item.kind === "task" && item.itemId === taskId); if (item) removeItem(item.id); })}
    {matchingRoutines.length > 0 && <details className="planner-work-group"><summary>Routines</summary>{matchingRoutines.filter((routine) => !selectedKeys.has(`routine:${routine.id}`)).map((routine) => <RoutineDragItem key={routine.id} routine={routine} canSchedule={blockItems.length < 3} onQueue={() => addCandidate(`routine:${routine.id}`)} />)}</details>}
    <details className="planner-block-settings"><summary>Block settings · time & repeat</summary>
    <form className="planner-occurrence-form" onSubmit={saveOccurrence}><label className="planner-field"><span>Date</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="planner-time-fields"><label className="planner-field"><span>Starts</span><input required type="time" step="900" min={CALENDAR_START} max="22:30" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label className="planner-field"><span>Ends</span><input required type="time" step="900" min={startTime || CALENDAR_START} max={CALENDAR_END} value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div><button type="submit" className="planner-inline-save planner-button-with-icon"><CheckIcon />Save block</button></form>
    <div className="planner-editor-actions occurrence-actions"><button type="button" className="planner-delete planner-button-with-icon" onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}><DeleteIcon />{confirmDelete ? recurring ? "Confirm this block only" : "Confirm delete block" : recurring ? "Delete this block only" : "Delete this block"}</button><span /><button type="button" className="planner-button-with-icon" onClick={onAddAnother}><PlusIcon />New block</button><button type="button" className="planner-button-with-icon" onClick={onEditSeries}><CalendarIcon />{recurring ? "Edit repeating schedule" : "Edit block details"}</button></div>
    </details>
  </div>;
}

function StandaloneOccurrenceEditor({ occurrence, rule, onSave, onDelete, onAddAnother, onEditSeries, onClose }: { occurrence: CalendarOccurrence & { kind: "standalone"; title: string }; rule: StandaloneCalendarBlockRule; onSave: (date: string, startTime: string, endTime: string, fill: CalendarBlockFill) => string | null; onDelete: () => void; onAddAnother: () => void; onEditSeries: () => void; onClose: () => void }) {
  const [date, setDate] = useState(occurrence.date);
  const [startTime, setStartTime] = useState(occurrence.startTime);
  const [endTime, setEndTime] = useState(occurrence.endTime);
  const [fill, setFill] = useState<CalendarBlockFill>(rule.fill);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const recurring = !isOneTimeRule(rule);

  function saveOccurrence(event: FormEvent) {
    event.preventDefault();
    if (!isPlannerDate(date) || !isPlannerCalendarTime(startTime) || !isPlannerCalendarTime(endTime, true) || plannerMinutes(endTime) - plannerMinutes(startTime) < MIN_CALENDAR_BLOCK_MINUTES) {
      setError("Choose a valid date and a 30-minute block between 6 AM and 11 PM on the 15-minute grid.");
      return;
    }
    const issue = onSave(date, startTime, endTime, fill);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    if (plannerWeekDates(date)[0] !== plannerWeekDates(occurrence.date)[0]) onClose();
  }

  return <div className="planner-editor occurrence-editor standalone-occurrence-editor">
    <div className="planner-editor-heading"><div className="planner-editor-title"><div className="planner-editor-title-row"><h2>{occurrence.title}</h2><BlockFillPicker value={fill} onChange={setFill} repeating={recurring} /></div><p>No area · {formatWorkbenchDate(occurrence.date)} · {formatBlockTime(occurrence.startTime)}–{formatBlockTime(occurrence.endTime)}{recurring ? " · Repeats weekly" : " · One time"}</p></div><button type="button" onClick={onClose}>Close</button></div>
    <p className="planner-standalone-purpose">Protected time only—no tasks or routines.</p>
    <form className="planner-occurrence-form" onSubmit={saveOccurrence}><label className="planner-field"><span>Date</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="planner-time-fields"><label className="planner-field"><span>Starts</span><input required type="time" step="900" min={CALENDAR_START} max="22:30" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label className="planner-field"><span>Ends</span><input required type="time" step="900" min={startTime || CALENDAR_START} max={CALENDAR_END} value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div><button type="submit" className="planner-inline-save planner-button-with-icon"><CheckIcon />Save block</button></form>
    <Presence show={Boolean(error)} className="motion-collapse">{() => <p className="planner-form-error" role="alert">{error}</p>}</Presence>
    <div className="planner-editor-actions occurrence-actions"><button type="button" className="planner-delete planner-button-with-icon" onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}><DeleteIcon />{confirmDelete ? recurring ? "Confirm this block only" : "Confirm delete block" : recurring ? "Delete this block only" : "Delete this block"}</button><span /><button type="button" className="planner-button-with-icon" onClick={onAddAnother}><PlusIcon />New block</button><button type="button" className="planner-button-with-icon" onClick={onEditSeries}><CalendarIcon />{recurring ? "Edit repeating schedule" : "Edit block details"}</button></div>
  </div>;
}

export function Planner({ areas, projects, tasks, routines, planner, onChange, onTaskChange, onRoutineSessionStatus, makeId, onNotice, onEditorOpenChange, session, onSessionChange, renderWork, onCreateArea }: PlannerProps) {
  const compactLayout = useSyncExternalStore(subscribeCompactLayout, compactLayoutSnapshot, () => false);
  const workbenchVisible = Boolean(session.workbenchOpen && (!compactLayout || session.workbenchPinned));
  const today = plannerDateKey();
  const anchorDate = session.anchorDate;
  const dates = plannerWeekDates(anchorDate);
  const selectedDate = dates.includes(session.selectedDate) ? session.selectedDate : dates[0];
  const [editor, setEditor] = useState<PlannerEditor | null>(null);
  const [activeLabel, setActiveLabel] = useState("");
  const [calendarSelection, setCalendarSelection] = useState<CalendarDragSelection | null>(null);
  const [newBlockConnection, setNewBlockConnection] = useState<NewBlockConnection | null>(null);
  const [areaCreatorOpen, setAreaCreatorOpen] = useState(false);
  const [areaName, setAreaName] = useState("");
  const selectedAreaId = areas.some((area) => area.id === session.selectedAreaId) ? session.selectedAreaId : areas[0]?.id ?? "";

  const calendarBodyRef = useRef<HTMLDivElement | null>(null);
  const calendarSelectionRef = useRef<CalendarDragSelection | null>(null);
  const workbenchRef = useRef<HTMLElement | null>(null);
  const workbenchToggleRef = useRef<HTMLButtonElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const onSessionChangeRef = useRef(onSessionChange);
  const previousWorkbenchVisible = useRef(workbenchVisible);
  const previousEditorOpen = useRef(false);
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
    let frame: number | undefined;
    if (compactLayout && workbenchVisible && !wasVisible) {
      frame = requestAnimationFrame(() => {
        const workbench = workbenchRef.current;
        if (workbenchVisible && workbench && !workbench.hasAttribute("inert")) focusableElements(workbench)[0]?.focus();
      });
    }
    if (compactLayout && !workbenchVisible && wasVisible) workbenchToggleRef.current?.focus();
    previousWorkbenchVisible.current = workbenchVisible;
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [compactLayout, workbenchVisible]);
  useEffect(() => {
    const wasOpen = previousEditorOpen.current;
    previousEditorOpen.current = editor !== null;
    if (!workbenchVisible || (editor === null && !wasOpen)) return;
    const frame = requestAnimationFrame(() => {
      const workbench = workbenchRef.current;
      let target: HTMLElement | undefined;
      if (editor) {
        target = focusableElements(workbench?.querySelector<HTMLElement>('.planner-editor:not([inert])') ?? null)[0];
      } else {
        const focusable = focusableElements(workbench);
        const areaSelect = workbench?.querySelector<HTMLElement>('#planner-area-select');
        target = areaSelect && focusable.includes(areaSelect) ? areaSelect : focusable[0];
      }
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, workbenchVisible]);
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
      const focusable = focusableElements(workbench);
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
  const occurrences = materializeCalendarBlocks(planner, dates) as CalendarOccurrence[];
  const editingRule = editor?.kind === "series" && editor.ruleId ? planner.blockRules.find((rule) => rule.id === editor.ruleId) : undefined;
  const editingOneTimeOverride = editingRule && isOneTimeRule(editingRule)
    ? planner.blockExceptions.find((item): item is CalendarBlockException & { kind: "override"; date: string; startTime: string; endTime: string } => item.ruleId === editingRule.id && item.occurrenceDate === editingRule.effectiveOn && item.kind === "override")
    : undefined;
  const scheduleEditorRule = editingRule && editingOneTimeOverride ? {
    ...editingRule,
    weekdays: [plannerWeekday(editingOneTimeOverride.date)],
    effectiveOn: editingOneTimeOverride.date,
    endsOn: editingOneTimeOverride.date,
    startTime: editingOneTimeOverride.startTime,
    endTime: editingOneTimeOverride.endTime,
  } : editingRule;
  const editingOccurrence = editor?.kind === "occurrence" ? occurrences.find((occurrence) => occurrence.id === editor.occurrenceId) : undefined;
  const editingOccurrenceRule = editingOccurrence ? planner.blockRules.find((rule) => rule.id === editingOccurrence.ruleId) : undefined;
  const editingDeadlineTask = editor?.kind === "deadline" ? tasks.find((task) => task.id === editor.taskId) : undefined;
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? areas[0];
  const dragCreateArea = !editor
    ? selectedArea
    : editor.kind === "series" && !editor.ruleId && newBlockConnection?.kind === "area"
      ? areas.find((area) => area.id === newBlockConnection.areaId)
      : undefined;
  const scheduleArea = editor?.kind === "schedule" ? areas.find((area) => area.id === editor.areaId) : undefined;
  const scheduleRules = useMemo(() => scheduleArea ? planner.blockRules.filter((rule): rule is AreaCalendarBlockRule => rule.kind === "area" && rule.areaId === scheduleArea.id) : [], [planner.blockRules, scheduleArea]);
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
  const blockTarget = useMemo(() => selectedArea ? plannerBlockTarget(planner, selectedArea.id, today, currentMinutes) as { occurrence: CalendarOccurrence & { kind: "area"; areaId: string }; active: boolean } | null : null, [currentMinutes, planner, selectedArea, today]);
  const calendarSelectionConflict = Boolean(calendarSelection && calendarBlockConflict({ id: "calendar-selection", date: calendarSelection.date, startTime: plannerTime(calendarSelection.startMinutes), endTime: plannerTime(calendarSelection.endMinutes) }, occurrences));

  function openNewSeries(areaId: string | undefined, date: string, blockKind: "area" | "standalone" = areaId ? "area" : "standalone") {
    onSessionChange({ workbenchOpen: true, workbenchPinned: true });
    setNewBlockConnection(blockKind === "area" && areaId ? { kind: "area", areaId } : { kind: "standalone" });
    setEditor({ kind: "series", areaId, date, blockKind });
  }

  function updateCalendarSelection(next: CalendarDragSelection | null) {
    calendarSelectionRef.current = next;
    setCalendarSelection(next);
  }

  function pointerMinutes(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return PLANNER_START_MINUTES + (event.clientY - rect.top) / PIXELS_PER_MINUTE;
  }

  function beginCalendarSelection(event: ReactPointerEvent<HTMLDivElement>, date: string) {
    if (!dragCreateArea || event.pointerType === "touch" || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, select, textarea, .planner-calendar-block, .planner-orphan-deadline")) return;
    const anchorMinutes = pointerMinutes(event);
    const range = plannerDragSelection(anchorMinutes, anchorMinutes) as { startMinutes: number; endMinutes: number };
    const next = { pointerId: event.pointerId, date, areaId: dragCreateArea.id, anchorMinutes, originY: event.clientY, moved: false, ...range };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    updateCalendarSelection(next);
  }

  function moveCalendarSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const current = calendarSelectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const range = plannerDragSelection(current.anchorMinutes, pointerMinutes(event)) as { startMinutes: number; endMinutes: number };
    event.preventDefault();
    updateCalendarSelection({ ...current, ...range, moved: current.moved || Math.abs(event.clientY - current.originY) >= 6 });
  }

  function finishCalendarSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const current = calendarSelectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const range = plannerDragSelection(current.anchorMinutes, pointerMinutes(event)) as { startMinutes: number; endMinutes: number };
    const moved = current.moved || Math.abs(event.clientY - current.originY) >= 6;
    const finalSelection = { ...current, ...range, moved };
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    updateCalendarSelection(null);
    if (!moved) return;
    const startTime = plannerTime(finalSelection.startMinutes);
    const endTime = plannerTime(finalSelection.endMinutes);
    if (calendarBlockConflict({ id: "calendar-selection", date: finalSelection.date, startTime, endTime }, occurrences)) {
      onNotice("That time overlaps another time block. Drag across open time instead.");
      return;
    }
    onSessionChange({ selectedAreaId: finalSelection.areaId, selectedProjectId: "", selectedDate: finalSelection.date, workbenchOpen: true, workbenchPinned: true });
    setNewBlockConnection({ kind: "area", areaId: finalSelection.areaId });
    setEditor({ kind: "series", areaId: finalSelection.areaId, date: finalSelection.date, blockKind: "area", initialStartTime: startTime, initialEndTime: endTime, initialFrequency: "once" });
  }

  function cancelCalendarSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (calendarSelectionRef.current?.pointerId === event.pointerId) updateCalendarSelection(null);
  }

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

  function saveRule(draft: CalendarBlockRule) {
    const rule = { ...draft, id: draft.id || makeId("calendar-block") } as CalendarBlockRule;
    const storedItems = planner.blockItems.filter((item) => item.ruleId === rule.id);
    const restoringSkippedOneTime = Boolean(editingRule && isOneTimeRule(editingRule) && planner.blockExceptions.some((item) => item.ruleId === editingRule.id && item.occurrenceDate === editingRule.effectiveOn && item.kind === "skip"));
    const identityChanged = Boolean(editingRule && (rule.kind !== editingRule.kind || (rule.kind === "area" && editingRule.kind === "area" && rule.areaId !== editingRule.areaId)));
    if (identityChanged && storedItems.length) return "Remove block tasks before changing what this schedule connects to.";
    const updatedPlanner = editingRule && isOneTimeRule(editingRule) && isOneTimeRule(rule)
      ? plannerAfterOneTimeRuleEdit(planner, editingRule, rule) as PlannerData
      : {
        ...planner,
        blockRules: editingRule ? planner.blockRules.map((item) => item.id === rule.id ? rule : item) : [...planner.blockRules, rule],
      };
    const persistedRule = updatedPlanner.blockRules.find((item) => item.id === rule.id)!;
    const items = updatedPlanner.blockItems.filter((item) => item.ruleId === rule.id);
    if (items.some((item) => !plannerRuleOccursOn(persistedRule, item.occurrenceDate))) return "Clear block tasks on days you are removing from this schedule first.";
    const shouldKeepBlockException = (item: CalendarBlockException) => item.ruleId !== rule.id
      || (plannerRuleOccursOn(persistedRule, item.occurrenceDate)
        && !(restoringSkippedOneTime && item.kind === "skip" && item.occurrenceDate === editingRule?.effectiveOn));
    const next = {
      ...updatedPlanner,
      blockExceptions: updatedPlanner.blockExceptions.filter(shouldKeepBlockException),
    };
    if (next.blockRules.some((item) => item.id !== rule.id && recurringCalendarBlockRulesConflict(persistedRule, item))) return "That time overlaps another time block. Time blocks can touch, but they cannot overlap.";
    if (!commitPlanner(next)) return "Choose a valid block between 6 AM and 11 PM on the 15-minute grid.";
    const startDate = editingRule ? selectedDate : persistedRule.effectiveOn;
    const firstBlock = (materializeCalendarBlocks(next, Array.from({ length: 7 }, (_, index) => shiftPlannerDate(startDate, index))) as CalendarOccurrence[]).find((item) => item.ruleId === rule.id);
    if (firstBlock) {
      onSessionChange({ anchorDate: firstBlock.date, selectedDate: firstBlock.date, ...(firstBlock.kind === "area" ? { selectedAreaId: firstBlock.areaId } : {}), workbenchOpen: true, workbenchPinned: true });
      setEditor({ kind: "occurrence", occurrenceId: firstBlock.id });
    } else setEditor(null);
    const oneTime = rule.endsOn === rule.effectiveOn;
    onNotice(editingRule ? oneTime ? "Time block updated" : "Repeating schedule updated" : oneTime ? "Time block created" : "Repeating schedule created");
    return null;
  }

  function deleteRuleById(ruleId: string) {
    const rule = planner.blockRules.find((item) => item.id === ruleId);
    if (!rule) return false;
    const deleted = commitPlanner(plannerAfterRuleDelete(planner, ruleId));
    if (!deleted) return false;
    onNotice(isOneTimeRule(rule) ? "Time block deleted" : "Repeating schedule deleted");
    return true;
  }

  function deleteRule() {
    if (editingRule && deleteRuleById(editingRule.id)) setEditor(null);
  }

  function upsertOccurrenceException(occurrence: CalendarOccurrence, date: string, startTime: string, endTime: string, fill: CalendarBlockFill) {
    const next = plannerAfterOccurrenceUpdate(planner, occurrence, date, startTime, endTime, fill, makeId("calendar-block-exception")) as PlannerData;
    const nextOccurrences = materializeCalendarBlocks(next, plannerWeekDates(date)) as CalendarOccurrence[];
    const candidate = nextOccurrences.find((item) => item.id === occurrence.id);
    if (candidate && calendarBlockConflict(candidate, nextOccurrences, candidate.id)) return "That change overlaps another time block.";
    if (!commitPlanner(next)) return "Choose a valid date and block between 6 AM and 11 PM on the 15-minute grid.";
    onNotice("Time block updated");
    return null;
  }

  function deleteOccurrence(occurrence: CalendarOccurrence) {
    const rule = planner.blockRules.find((item) => item.id === occurrence.ruleId);
    if (!rule) return;
    const oneTime = isOneTimeRule(rule);
    const deleted = commitPlanner(plannerAfterOccurrenceDelete(planner, occurrence, oneTime ? "" : makeId("calendar-block-exception")) as PlannerData);
    if (!deleted) return;
    setEditor(null);
    onNotice(oneTime ? "Time block deleted" : `Time block deleted for ${formatWorkbenchDate(occurrence.date)}`);
  }

  function occurrenceAt(date: string, minutes: number, areaId?: string) {
    return occurrences.find((occurrence): occurrence is CalendarOccurrence & { kind: "area"; areaId: string } => occurrence.kind === "area" && occurrence.date === date && (!areaId || occurrence.areaId === areaId) && plannerMinutes(occurrence.startTime) <= minutes && plannerMinutes(occurrence.endTime) > minutes);
  }

  function standaloneOccurrenceAt(date: string, minutes: number) {
    return occurrences.find((occurrence) => occurrence.kind === "standalone" && occurrence.date === date && plannerMinutes(occurrence.startTime) <= minutes && plannerMinutes(occurrence.endTime) > minutes);
  }

  function addToOccurrence(occurrence: CalendarOccurrence & { kind: "area"; areaId: string }, kind: "task" | "routine", itemId: string) {
    const alreadyInThisBlock = (plannerBlockItems(planner, occurrence) as BlockItem[]).some((item) => item.kind === kind && item.itemId === itemId);
    const placement = placePlannerBlockItem(planner, occurrence, kind, itemId, makeId("block-item")) as { planner: PlannerData; status: "added" | "exists" | "full" | "unavailable" };
    if (placement.status === "unavailable") {
      onNotice("No-area blocks cannot hold tasks or routines");
      return false;
    }
    if (placement.status === "full") {
      onSessionChange({ workbenchOpen: true, workbenchPinned: true, selectedAreaId: occurrence.areaId, selectedDate: occurrence.date, anchorDate: occurrence.date });
      setEditor({ kind: "occurrence", occurrenceId: occurrence.id });
      onNotice("This block already has three items. Remove or complete one first.");
      return false;
    }
    if (placement.status === "exists") {
      onNotice(kind === "routine" && !alreadyInThisBlock ? "That routine is already scheduled in another block on this date" : "That item is already in this block");
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
      const endMinutes = resizedCalendarBlockEnd(active.occurrence.startTime, active.occurrence.endTime, delta);
      if (endMinutes === plannerMinutes(active.occurrence.endTime)) return;
      const issue = upsertOccurrenceException(active.occurrence, active.occurrence.date, active.occurrence.startTime, plannerTime(endMinutes), active.occurrence.fill);
      if (issue) onNotice(issue);
      return;
    }
    if (over?.kind !== "slot" || !over.date || over.minutes === undefined) return;
    if (active.kind === "block" && active.occurrence) {
      const duration = plannerMinutes(active.occurrence.endTime) - plannerMinutes(active.occurrence.startTime);
      if (over.minutes + duration > END_HOUR * 60) {
        onNotice("Move the time block earlier so it ends before 11 PM");
        return;
      }
      const issue = upsertOccurrenceException(active.occurrence, over.date, plannerTime(over.minutes), plannerTime(over.minutes + duration), active.occurrence.fill);
      if (issue) onNotice(issue);
      return;
    }
    if (active.kind === "task" && active.taskId) {
      const task = tasks.find((item) => item.id === active.taskId);
      const occurrence = task?.areaId ? occurrenceAt(over.date, over.minutes, task.areaId) : undefined;
      if (!task || !occurrence) {
        onNotice(standaloneOccurrenceAt(over.date, over.minutes) ? "No-area blocks cannot hold tasks or routines" : "Drop a task inside a time block for its area");
        return;
      }
      addToOccurrence(occurrence, "task", task.id);
      return;
    }
    if (active.kind === "routine" && active.routineId) {
      const routine = routines.find((item) => item.id === active.routineId);
      const occurrence = routine ? occurrenceAt(over.date, over.minutes, routine.areaId) : undefined;
      if (!routine || !occurrence) {
        onNotice(standaloneOccurrenceAt(over.date, over.minutes) ? "No-area blocks cannot hold tasks or routines" : "Drop a routine inside a time block for its area");
        return;
      }
      addToOccurrence(occurrence, "routine", routine.id);
      return;
    }
  }

  function openTargetForArea(areaId?: string, item?: { kind: "task" | "routine"; itemId: string }) {
    const target = areaId ? plannerBlockTarget(planner, areaId, today, currentMinutes) as { occurrence: CalendarOccurrence & { kind: "area"; areaId: string }; active: boolean } | null : null;
    if (!target) {
      onNotice("Create an upcoming time block first");
      onSessionChange({ workbenchOpen: true, workbenchPinned: true });
      return;
    }
    onSessionChange({ anchorDate: target.occurrence.date, selectedDate: target.occurrence.date, workbenchOpen: true, workbenchPinned: true });
    if (item) addToOccurrence(target.occurrence, item.kind, item.itemId);
    else setEditor({ kind: "occurrence", occurrenceId: target.occurrence.id });
  }

  function openDeadlineTask(task: PlannerTask, date: string) {
    onSessionChange({ selectedAreaId: task.areaId ?? selectedAreaId, selectedProjectId: task.projectId ?? "", selectedDate: date, workbenchOpen: true, workbenchPinned: true });
    setEditor({ kind: "deadline", taskId: task.id });
  }

  function saveDeadline(dueDate: string, dueTime?: string) {
    if (!editingDeadlineTask) return;
    onTaskChange(editingDeadlineTask.id, { dueDate, dueTime });
    setEditor(null);
    onNotice("Task deadline updated");
  }

  function completeDeadline() {
    if (!editingDeadlineTask) return;
    onTaskChange(editingDeadlineTask.id, { status: "done" });
    setEditor(null);
    onNotice("Task completed");
  }

  function clearDeadline() {
    if (!editingDeadlineTask) return;
    onTaskChange(editingDeadlineTask.id, { dueDate: undefined, dueTime: undefined });
    setEditor(null);
    onNotice("Task deadline removed");
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
    if (data?.kind === "task") setActiveLabel(tasks.find((task) => task.id === data.taskId)?.title ?? "Task deadline");
    else if (data?.kind === "routine") setActiveLabel(routines.find((routine) => routine.id === data.routineId)?.name ?? "Routine");
    else if (data?.occurrence) {
      const occurrence = data.occurrence;
      setActiveLabel(occurrence.kind === "standalone" ? occurrence.title : areas.find((area) => area.id === occurrence.areaId)?.name ?? "Time block");
    }
  }

  return <DndContext id="planner-workspace" sensors={sensors} onDragStart={handleDragStart} onDragCancel={() => setActiveLabel("")} onDragEnd={handleDragEnd}>
    <div className={`planner-page ${workbenchVisible ? "workbench-open" : "workbench-closed"}`}>
      <header className="planner-toolbar">
        <div className="planner-toolbar-title"><button ref={workbenchToggleRef} type="button" className="planner-workbench-toggle" aria-label={workbenchVisible ? "Hide workbench" : "Show workbench"} aria-controls="planner-workbench" aria-expanded={workbenchVisible} onClick={() => onSessionChange({ workbenchOpen: !workbenchVisible, workbenchPinned: true })}><span aria-hidden="true" /><span>{workbenchVisible ? "Hide workbench" : "Show workbench"}</span></button><div><strong>Today</strong><small>{formatWeekRange(dates)}</small></div></div>
        <div className="planner-week-controls"><button type="button" onClick={() => changeWeek(-1)} aria-label="Previous week"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5-5 5 5 5" /></svg></button><button type="button" className="planner-range" onClick={returnToToday}>{dates.includes(today) ? "This week" : formatWeekRange(dates)}</button><button type="button" onClick={() => changeWeek(1)} aria-label="Next week"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 5 5 5-5 5" /></svg></button></div>
        <div className="planner-toolbar-actions"><button type="button" className="planner-global-new planner-button-with-icon" onClick={() => openNewSeries(selectedArea?.id, selectedDate, selectedArea ? "area" : "standalone")} aria-label="New time block"><PlusIcon /><span>New block</span></button></div>
      </header>
      <div className="planner-mobile-days" role="tablist" aria-label="Days in this week">{dates.map((date) => <button type="button" role="tab" aria-selected={selectedDate === date} className={selectedDate === date ? "active" : ""} onClick={() => onSessionChange({ selectedDate: date })} key={date}><span>{SHORT_DAY_NAMES[plannerWeekday(date)]}</span><strong>{formatDateNumber(date)}</strong></button>)}</div>
      <div className="planner-layout">
        <aside ref={workbenchRef} id="planner-workbench" className="planner-workbench" role="dialog" tabIndex={-1} aria-modal={compactLayout || undefined} aria-label="Calendar workbench" aria-hidden={!workbenchVisible} inert={!workbenchVisible}><div className="planner-workbench-views" ref={listMotionRef}>
          {editor?.kind === "deadline" && editingDeadlineTask && <DeadlineEditor key={editingDeadlineTask.id} task={editingDeadlineTask} area={areas.find((area) => area.id === editingDeadlineTask.areaId)} project={projects.find((project) => project.id === editingDeadlineTask.projectId)} onSave={saveDeadline} onComplete={completeDeadline} onClear={clearDeadline} onClose={() => setEditor(null)} />}
          {editor?.kind === "schedule" && scheduleArea && <ScheduleOverview area={scheduleArea} rules={scheduleRules} exceptions={planner.blockExceptions} onEditSeries={(ruleId) => setEditor({ kind: "series", ruleId })} onEditOccurrence={(occurrenceId, date) => { onSessionChange({ anchorDate: date, selectedDate: date }); setEditor({ kind: "occurrence", occurrenceId }); }} onDelete={(ruleId) => deleteRuleById(ruleId)} onAdd={() => openNewSeries(scheduleArea.id, selectedDate, "area")} onBack={() => setEditor(null)} />}
          {editor?.kind === "series" && <ScheduleEditor key={`${scheduleEditorRule?.id ?? `${editor.blockKind}:${editor.areaId ?? "new"}:${editor.date}:${editor.initialStartTime ?? "default"}:${editor.initialEndTime ?? "default"}`}:${editingOneTimeOverride?.id ?? "base"}`} rule={scheduleEditorRule} areas={areas} initialAreaId={editor.areaId} initialKind={editor.blockKind} initialDate={editor.date ?? scheduleEditorRule?.effectiveOn ?? selectedDate} initialStartTime={editor.initialStartTime} initialEndTime={editor.initialEndTime} initialFrequency={editor.initialFrequency} onConnectionChange={editingRule ? undefined : setNewBlockConnection} onSave={saveRule} onDelete={editingRule ? deleteRule : undefined} onClose={() => setEditor(null)} />}
          {editor?.kind === "occurrence" && editingOccurrence?.kind === "area" && editingOccurrenceRule?.kind === "area" && <AreaOccurrenceEditor key={`${editingOccurrence.id}:${editingOccurrence.date}:${editingOccurrence.startTime}:${editingOccurrence.endTime}`} occurrence={editingOccurrence} rule={editingOccurrenceRule} today={today} currentMinutes={currentMinutes} area={areas.find((area) => area.id === editingOccurrence.areaId)!} projects={projects} tasks={tasks} routines={routines} planner={planner} onSave={(date, startTime, endTime, fill) => upsertOccurrenceException(editingOccurrence, date, startTime, endTime, fill)} onDelete={() => deleteOccurrence(editingOccurrence)} onAddAnother={() => openNewSeries(editingOccurrence.areaId, editingOccurrence.date, "area")} onEditSeries={() => setEditor({ kind: "series", ruleId: editingOccurrence.ruleId })} onPlannerChange={(next) => { commitPlanner(next); }} onTaskChange={onTaskChange} onRoutineSessionStatus={onRoutineSessionStatus} onClose={() => setEditor(null)} makeId={makeId} renderWork={renderWork} />}
          {editor?.kind === "occurrence" && editingOccurrence?.kind === "standalone" && editingOccurrenceRule?.kind === "standalone" && <StandaloneOccurrenceEditor key={`${editingOccurrence.id}:${editingOccurrence.date}:${editingOccurrence.startTime}:${editingOccurrence.endTime}`} occurrence={editingOccurrence} rule={editingOccurrenceRule} onSave={(date, startTime, endTime, fill) => upsertOccurrenceException(editingOccurrence, date, startTime, endTime, fill)} onDelete={() => deleteOccurrence(editingOccurrence)} onAddAnother={() => openNewSeries(undefined, editingOccurrence.date, "standalone")} onEditSeries={() => setEditor({ kind: "series", ruleId: editingOccurrence.ruleId })} onClose={() => setEditor(null)} />}
          {!editor && selectedArea && <div className="planner-workbench-context">
            <header className="planner-context-heading"><div><h2>Schedule your areas</h2><p>Open a block to work on its projects and tasks.</p></div><button type="button" onClick={() => onSessionChange({ workbenchOpen: false, workbenchPinned: true })}>Close</button></header>
            <section className="planner-context-card" aria-label="Current planning context">
              <div className="planner-context-field"><div className="planner-context-label"><label htmlFor="planner-area-select">Area</label><button type="button" onClick={() => setAreaCreatorOpen((open) => !open)} aria-expanded={areaCreatorOpen}>New area</button></div><select id="planner-area-select" value={selectedArea.id} onChange={(event) => onSessionChange({ selectedAreaId: event.target.value, selectedProjectId: "" })}>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></div>
              <div className="planner-manage-row"><div className="planner-time-block-summary">{blockTarget ? <button type="button" className={`planner-block-status planner-block-status-button ${blockTarget.active ? "active" : ""}`} onClick={() => openTargetForArea(selectedArea.id)}><i aria-hidden="true" /><span><strong>{blockTarget.active ? "Current time block" : "Next time block"}</strong><small>{formatWorkbenchDate(blockTarget.occurrence.date)} · {formatBlockTime(blockTarget.occurrence.startTime)}–{formatBlockTime(blockTarget.occurrence.endTime)}</small></span><ArrowIcon /></button> : <span className="planner-block-status"><i aria-hidden="true" /><span><strong>No time block scheduled</strong><small>Drag open calendar time to add {selectedArea.name}</small></span></span>}</div><div className="planner-manage-actions"><button type="button" className="planner-button-with-icon" onClick={() => setEditor({ kind: "schedule", areaId: selectedArea.id })}><CalendarIcon />View schedule</button><button type="button" className="planner-schedule-action planner-button-with-icon" onClick={() => openNewSeries(selectedArea.id, selectedDate)}><PlusIcon />New block</button></div></div>
            </section>
            <Presence show={areaCreatorOpen} className="motion-collapse">{() => <form className="planner-area-create" onSubmit={createArea}><input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="Area name" aria-label="New area name" /><button type="submit" disabled={!areaName.trim()}>Create</button></form>}</Presence>
            <section className="planner-week-blocks"><h3>{selectedArea.name} this week</h3>{occurrences.filter((item) => item.kind === "area" && item.areaId === selectedArea.id).map((item) => <button type="button" className="planner-schedule-row-main" key={item.id} onClick={() => { onSessionChange({ selectedDate: item.date }); setEditor({ kind: "occurrence", occurrenceId: item.id }); }}><span><strong>{formatWorkbenchDate(item.date)}</strong><small>{formatBlockTime(item.startTime)}–{formatBlockTime(item.endTime)} · {plannerBlockItems(planner, item).length}/3 selected</small></span><ArrowIcon /></button>)}{!occurrences.some((item) => item.kind === "area" && item.areaId === selectedArea.id) && <p className="planner-editor-empty">No blocks this week. Drag on the calendar or create a new block.</p>}</section>
          </div>}
          {!editor && !selectedArea && <div className="planner-workbench-context planner-empty-workbench"><div className="planner-queue-empty"><strong>Create your first area.</strong><p>Areas give time blocks and work queues a durable home.</p></div><button type="button" onClick={() => setAreaCreatorOpen((open) => !open)} aria-expanded={areaCreatorOpen}>{areaCreatorOpen ? "Cancel" : "New area"}</button><Presence show={areaCreatorOpen} className="motion-collapse">{() => <form className="planner-area-create" onSubmit={createArea}><input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="Area name" aria-label="New area name" /><button type="submit" disabled={!areaName.trim()}>Create</button></form>}</Presence></div>}
        </div></aside>
        <Presence show={workbenchVisible} className="motion-scrim">{() => <button type="button" className="planner-workbench-scrim" aria-label="Close workbench" onClick={() => onSessionChange({ workbenchOpen: false, workbenchPinned: true })} />}</Presence>
        <section className="planner-calendar" aria-label={`Week of ${dates[0]}`}>
          <div className="planner-calendar-top">
            <div className="planner-calendar-head"><div className="planner-time-head">Time</div>{dates.map((date) => <div className={`planner-day-head ${date === today ? "today" : ""} ${date === selectedDate ? "selected" : ""}`} key={date}><span>{SHORT_DAY_NAMES[plannerWeekday(date)]}</span><strong>{formatDateNumber(date)}</strong></div>)}</div>
            <div className="planner-deadline-row"><div className="planner-all-day-label">Due</div>{dates.map((date) => {
              const allDayTasks = tasks.filter((task) => task.status !== "done" && task.dueDate === date && !task.dueTime);
              return <div className={`planner-all-day-cell ${date === selectedDate ? "selected" : ""}`} ref={listMotionRef} key={date}>{allDayTasks.slice(0, 2).map((task) => <button type="button" onClick={() => openDeadlineTask(task, date)} title={`Edit deadline for ${task.title}`} key={task.id}>{task.title}</button>)}{allDayTasks.length > 2 && <small>+{allDayTasks.length - 2} more</small>}</div>;
            })}</div>
          </div>
          <div className="planner-calendar-body" ref={calendarBodyRef} onScroll={(event) => publishCalendarScroll(event.currentTarget.scrollTop)}><div className="planner-time-rail">{hours.map((hour) => <span style={{ top: (hour - START_HOUR) * 60 * PIXELS_PER_MINUTE }} key={hour}>{formatPlannerTime(`${String(hour).padStart(2, "0")}:00`)}</span>)}</div>
            <div className="planner-days-grid" ref={listMotionRef}>{dates.map((date) => <div className={`planner-day ${date === today ? "today" : ""} ${date === selectedDate ? "selected" : ""} ${dragCreateArea ? "can-create" : ""} ${calendarSelection?.date === date ? "creating" : ""}`} data-date={date} title={dragCreateArea ? `Drag to add a ${dragCreateArea.name} block` : undefined} onPointerDown={(event) => beginCalendarSelection(event, date)} onPointerMove={moveCalendarSelection} onPointerUp={finishCalendarSelection} onPointerCancel={cancelCalendarSelection} onLostPointerCapture={cancelCalendarSelection} key={date}>{hours.slice(0, -1).map((hour) => <div className="planner-hour-line" style={{ top: (hour - START_HOUR) * 60 * PIXELS_PER_MINUTE }} key={hour} />)}{slots.map((minutes) => <DropSlot date={date} minutes={minutes} key={minutes} />)}{calendarSelection?.date === date && <div className={`planner-create-selection fill-sage ${calendarSelectionConflict ? "conflict" : ""}`} style={{ top: (calendarSelection.startMinutes - PLANNER_START_MINUTES) * PIXELS_PER_MINUTE, height: (calendarSelection.endMinutes - calendarSelection.startMinutes) * PIXELS_PER_MINUTE }} aria-hidden="true"><strong>{areas.find((area) => area.id === calendarSelection.areaId)?.name ?? "New block"}</strong><small>{formatBlockTime(plannerTime(calendarSelection.startMinutes))}–{formatBlockTime(plannerTime(calendarSelection.endMinutes))}</small></div>}{date === today && currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60 && <div className="planner-now-line" style={{ top: (currentMinutes - START_HOUR * 60) * PIXELS_PER_MINUTE }}><span /></div>}<div className="planner-day-events" ref={listMotionRef}>{occurrences.filter((item) => item.date === date).map((occurrence) => {
              const area = occurrence.kind === "area" ? areas.find((item) => item.id === occurrence.areaId) : undefined;
              if (occurrence.kind === "area" && !area) return null;
              const active = occurrence.date === today && plannerMinutes(occurrence.startTime) <= currentMinutes && plannerMinutes(occurrence.endTime) > currentMinutes;
              return <CalendarBlockCard occurrence={occurrence} area={area} items={plannerBlockItems(planner, occurrence) as BlockItem[]} tasks={tasks} routines={routines} active={active} onOpen={() => { onSessionChange({ ...(occurrence.kind === "area" ? { selectedAreaId: occurrence.areaId, selectedProjectId: "" } : {}), selectedDate: occurrence.date, workbenchOpen: true, workbenchPinned: true }); setEditor({ kind: "occurrence", occurrenceId: occurrence.id }); }} key={occurrence.id} />;
            })}{tasks.filter((task) => task.status !== "done" && task.dueDate === date && task.dueTime).map((task) => { const inAreaBlock = occurrences.some((occurrence) => occurrence.kind === "area" && occurrence.date === date && occurrence.areaId === task.areaId && task.dueTime! >= occurrence.startTime && task.dueTime! < occurrence.endTime); return <button type="button" className={`planner-orphan-deadline ${inAreaBlock ? "in-block" : ""}`} style={{ top: (plannerMinutes(task.dueTime!) - START_HOUR * 60) * PIXELS_PER_MINUTE }} onClick={() => openDeadlineTask(task, date)} aria-label={`${task.title}, due ${formatPlannerTime(task.dueTime!)}. Edit task deadline.`} title={inAreaBlock ? "Edit task deadline inside this time block" : "Edit task deadline outside a time block"} key={task.id}><time>{formatPlannerTime(task.dueTime!)}</time><span>{task.title}</span></button>; })}</div></div>)}</div>
          </div>
        </section>
      </div>
    </div>
    <DragOverlay>{activeLabel ? <div className="planner-drag-overlay">{activeLabel}</div> : null}</DragOverlay>
  </DndContext>;
}
