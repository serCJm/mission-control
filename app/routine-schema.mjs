export const ROUTINE_TIME_ZONE = "America/Los_Angeles";
export const ROUTINE_STATUSES = ["pending", "completed", "skipped", "missed"];
export const ROUTINE_FINAL_STATUSES = ["completed", "skipped", "missed"];
export const MAX_ROUTINE_HISTORY = 10;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isText(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

export function isRoutineDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isRoutineTime(value) {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function routineDateParts(date = new Date(), timeZone = ROUTINE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return {
    year,
    month,
    day,
    hour: value("hour"),
    minute: value("minute"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

export function routineDateKey(date = new Date(), timeZone = ROUTINE_TIME_ZONE) {
  const { year, month, day } = routineDateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftRoutineDate(dateKey, distance) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + distance));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekdayForDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function timeMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function normalizeSchedule(value) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value.weekdays) || value.weekdays.length < 1 || value.weekdays.length > 7) return null;
  const weekdays = [...new Set(value.weekdays)];
  if (weekdays.length !== value.weekdays.length || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null;
  if (typeof value.allDay !== "boolean") return null;
  if (value.allDay) return { weekdays: [...weekdays].sort((a, b) => a - b), allDay: true };
  if (!isRoutineTime(value.windowStart) || !isRoutineTime(value.windowEnd) || timeMinutes(value.windowStart) >= timeMinutes(value.windowEnd)) return null;
  return { weekdays: [...weekdays].sort((a, b) => a - b), allDay: false, windowStart: value.windowStart, windowEnd: value.windowEnd };
}

function normalizeChecklist(value) {
  if (!Array.isArray(value) || value.length > 20) return null;
  const items = value.map((item) => {
    if (!item || typeof item !== "object" || !isText(item.id, 200) || !isText(item.text, 500)) return null;
    return { id: item.id, text: item.text };
  });
  if (items.some((item) => item === null)) return null;
  const ids = items.map((item) => item.id);
  return new Set(ids).size === ids.length ? items : null;
}

function normalizeSessionChecklist(value) {
  if (!Array.isArray(value) || value.length > 20) return null;
  const items = value.map((item) => {
    if (!item || typeof item !== "object" || !isText(item.id, 200) || !isText(item.text, 500) || typeof item.checked !== "boolean") return null;
    return { id: item.id, text: item.text, checked: item.checked };
  });
  if (items.some((item) => item === null)) return null;
  const ids = items.map((item) => item.id);
  return new Set(ids).size === ids.length ? items : null;
}

function normalizeSuspensions(value) {
  if (!Array.isArray(value) || value.length > 200) return null;
  const suspensions = value.map((item) => {
    if (!item || typeof item !== "object" || !isText(item.id, 200) || (item.kind !== "pause" && item.kind !== "vacation") || !isRoutineDate(item.startsOn)) return null;
    if (item.endsOn !== undefined && (!isRoutineDate(item.endsOn) || item.endsOn < item.startsOn)) return null;
    if (item.kind === "vacation" && item.endsOn === undefined) return null;
    return { id: item.id, kind: item.kind, startsOn: item.startsOn, ...(item.endsOn ? { endsOn: item.endsOn } : {}) };
  });
  if (suspensions.some((item) => item === null)) return null;
  const ids = suspensions.map((item) => item.id);
  return new Set(ids).size === ids.length ? suspensions : null;
}

function normalizeSessions(value) {
  if (!Array.isArray(value) || value.length > MAX_ROUTINE_HISTORY + 1) return null;
  const sessions = value.map((item) => {
    if (!item || typeof item !== "object" || !isRoutineDate(item.date) || !ROUTINE_STATUSES.includes(item.status) || !Number.isFinite(item.updatedAt)) return null;
    const checklist = normalizeSessionChecklist(item.checklist);
    return checklist === null ? null : { date: item.date, status: item.status, checklist, updatedAt: item.updatedAt };
  });
  if (sessions.some((item) => item === null)) return null;
  const dates = sessions.map((item) => item.date);
  return new Set(dates).size === dates.length ? sessions : null;
}

export function normalizeRoutine(value) {
  if (!value || typeof value !== "object" || !isText(value.id, 200) || !isText(value.areaId, 200) || !isText(value.name, 500)) return null;
  if (!Number.isInteger(value.expectedMinutes) || value.expectedMinutes < 1 || value.expectedMinutes > 480 || !isRoutineDate(value.scheduleEffectiveOn)) return null;
  const schedule = normalizeSchedule(value);
  const checklist = normalizeChecklist(value.checklist);
  const suspensions = normalizeSuspensions(value.suspensions);
  const sessions = normalizeSessions(value.sessions);
  if (!schedule || checklist === null || suspensions === null || sessions === null) return null;

  let pendingSchedule;
  if (value.pendingSchedule !== undefined) {
    const normalized = normalizeSchedule(value.pendingSchedule);
    if (!normalized || !isRoutineDate(value.pendingSchedule.effectiveOn) || value.pendingSchedule.effectiveOn <= value.scheduleEffectiveOn) return null;
    pendingSchedule = { ...normalized, effectiveOn: value.pendingSchedule.effectiveOn };
  }

  return {
    id: value.id,
    areaId: value.areaId,
    name: value.name,
    expectedMinutes: value.expectedMinutes,
    ...schedule,
    scheduleEffectiveOn: value.scheduleEffectiveOn,
    checklist,
    suspensions,
    sessions,
    ...(pendingSchedule ? { pendingSchedule } : {}),
  };
}

export function normalizeRoutines(value, areaIds) {
  if (!Array.isArray(value)) return null;
  const routines = value.map(normalizeRoutine);
  if (routines.some((routine) => routine === null)) return null;
  const ids = routines.map((routine) => routine.id);
  if (new Set(ids).size !== ids.length) return null;
  if (areaIds && routines.some((routine) => !areaIds.has(routine.areaId))) return null;
  return routines;
}

function scheduleForDate(routine, dateKey) {
  if (routine.pendingSchedule && dateKey >= routine.pendingSchedule.effectiveOn) return routine.pendingSchedule;
  return routine;
}

export function isRoutineSuspended(routine, dateKey) {
  return routine.suspensions.some((item) => item.startsOn <= dateKey && (!item.endsOn || item.endsOn >= dateKey));
}

function isScheduled(routine, dateKey) {
  if (dateKey < routine.scheduleEffectiveOn || isRoutineSuspended(routine, dateKey)) return false;
  return scheduleForDate(routine, dateKey).weekdays.includes(weekdayForDate(dateKey));
}

function windowState(routine, dateKey, now) {
  const currentDate = routineDateKey(now);
  if (dateKey < currentDate) return "closed";
  if (dateKey > currentDate) return "before";
  const schedule = scheduleForDate(routine, dateKey);
  if (schedule.allDay) return "active";
  const parts = routineDateParts(now);
  const currentMinutes = parts.hour * 60 + parts.minute;
  if (currentMinutes < timeMinutes(schedule.windowStart)) return "before";
  return currentMinutes < timeMinutes(schedule.windowEnd) ? "active" : "closed";
}

function checklistSnapshot(routine, previous = []) {
  const checked = new Map(previous.map((item) => [item.id, item.checked]));
  return routine.checklist.map((item) => ({ ...item, checked: checked.get(item.id) ?? false }));
}

function missedTimestamp(dateKey, routine) {
  const schedule = scheduleForDate(routine, dateKey);
  const endMinutes = schedule.allDay ? 24 * 60 : timeMinutes(schedule.windowEnd);
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 0, endMinutes);
}

export function pruneRoutineSessions(sessions) {
  const pending = sessions.filter((session) => session.status === "pending").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 1);
  const finalized = sessions.filter((session) => ROUTINE_FINAL_STATUSES.includes(session.status)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ROUTINE_HISTORY);
  return [...pending, ...finalized].sort((a, b) => a.date.localeCompare(b.date));
}

export function reconcileRoutine(routine, now = new Date()) {
  const today = routineDateKey(now);
  const sessions = new Map(routine.sessions.map((session) => [session.date, session]));
  for (let dateKey = routine.scheduleEffectiveOn, guard = 0; dateKey <= today && guard < 20_000; dateKey = shiftRoutineDate(dateKey, 1), guard += 1) {
    if (!isScheduled(routine, dateKey)) {
      if (sessions.get(dateKey)?.status === "pending") sessions.delete(dateKey);
      continue;
    }
    const state = windowState(routine, dateKey, now);
    const existing = sessions.get(dateKey);
    if (existing?.status === "pending" && state === "closed") {
      sessions.set(dateKey, { ...existing, status: "missed", updatedAt: missedTimestamp(dateKey, routine) });
    } else if (!existing && state === "active") {
      sessions.set(dateKey, { date: dateKey, status: "pending", checklist: checklistSnapshot(routine), updatedAt: now.getTime() });
    } else if (!existing && state === "closed") {
      sessions.set(dateKey, { date: dateKey, status: "missed", checklist: checklistSnapshot(routine), updatedAt: missedTimestamp(dateKey, routine) });
    }
  }

  let next = { ...routine, sessions: pruneRoutineSessions([...sessions.values()]) };
  if (routine.pendingSchedule && today >= routine.pendingSchedule.effectiveOn) {
    const { effectiveOn, ...schedule } = routine.pendingSchedule;
    next = { ...next, ...schedule, scheduleEffectiveOn: effectiveOn };
    delete next.pendingSchedule;
  }
  return JSON.stringify(next) === JSON.stringify(routine) ? routine : next;
}

export function reconcileRoutines(routines, now = new Date()) {
  let changed = false;
  const next = routines.map((routine) => {
    const reconciled = reconcileRoutine(routine, now);
    if (reconciled !== routine) changed = true;
    return reconciled;
  });
  return changed ? next : routines;
}

export function currentRoutineSession(routine, now = new Date()) {
  const dateKey = routineDateKey(now);
  if (!isScheduled(routine, dateKey) || windowState(routine, dateKey, now) !== "active") return null;
  return routine.sessions.find((session) => session.date === dateKey) ?? null;
}

export function routineConsistency(routine) {
  const sessions = routine.sessions.filter((session) => ROUTINE_FINAL_STATUSES.includes(session.status)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ROUTINE_HISTORY);
  return { completed: sessions.filter((session) => session.status === "completed").length, total: sessions.length };
}

export function routineScheduleStartsOn(schedule, now = new Date()) {
  const today = routineDateKey(now);
  const normalized = normalizeSchedule(schedule);
  if (!normalized || !normalized.weekdays.includes(weekdayForDate(today)) || normalized.allDay) return today;
  const parts = routineDateParts(now);
  return parts.hour * 60 + parts.minute >= timeMinutes(normalized.windowEnd) ? shiftRoutineDate(today, 1) : today;
}

export function routineScheduleLabel(routine) {
  const days = routine.weekdays;
  const allDays = days.length === 7;
  const weekdays = days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day));
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cadence = allDays ? "Daily" : weekdays ? "Weekdays" : days.map((day) => dayNames[day]).join(", ");
  if (routine.allDay) return `${cadence} · All day`;
  const format = (value) => {
    const [hour, minute] = value.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${suffix}`;
  };
  return `${cadence} · ${format(routine.windowStart)}–${format(routine.windowEnd)}`;
}
