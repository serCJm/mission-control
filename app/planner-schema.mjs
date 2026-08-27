export const PLANNER_TIME_ZONE = "America/Los_Angeles";
export const PLANNER_SNAP_MINUTES = 15;
export const MIN_AREA_BLOCK_MINUTES = 30;
export const PLANNER_START_MINUTES = 6 * 60;
export const PLANNER_END_MINUTES = 23 * 60;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isText(value, maxLength = 200) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

export function isPlannerDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isPlannerTime(value) {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function isPlannerCalendarTime(value, allowEnd = false) {
  if (!isPlannerTime(value)) return false;
  const minutes = plannerMinutes(value);
  return minutes >= PLANNER_START_MINUTES
    && minutes <= PLANNER_END_MINUTES
    && (allowEnd || minutes < PLANNER_END_MINUTES)
    && minutes % PLANNER_SNAP_MINUTES === 0;
}

export function isPlannerDeadline(dueDate, dueTime) {
  return dueTime === undefined || (isPlannerDate(dueDate) && isPlannerCalendarTime(dueTime));
}

export function plannerMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function plannerTime(minutes) {
  const value = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function plannerDateKey(date = new Date(), timeZone = PLANNER_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return `${value("year")}-${String(value("month")).padStart(2, "0")}-${String(value("day")).padStart(2, "0")}`;
}

export function shiftPlannerDate(dateKey, distance) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + distance));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function plannerWeekday(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function plannerWeekStart(dateKey) {
  const weekday = plannerWeekday(dateKey);
  return shiftPlannerDate(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

export function plannerWeekDates(anchorDate) {
  const start = plannerWeekStart(anchorDate);
  return Array.from({ length: 7 }, (_, index) => shiftPlannerDate(start, index));
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) return null;
  if (value.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null;
  const weekdays = [...new Set(value)].sort((a, b) => a - b);
  return weekdays.length === value.length ? weekdays : null;
}

function normalizeRule(value, areaIds) {
  if (!value || typeof value !== "object" || !isText(value.id) || !isText(value.areaId) || !areaIds.has(value.areaId)) return null;
  const weekdays = normalizeWeekdays(value.weekdays);
  if (!weekdays || !isPlannerDate(value.effectiveOn) || !isPlannerCalendarTime(value.startTime) || !isPlannerCalendarTime(value.endTime, true)) return null;
  if (plannerMinutes(value.endTime) - plannerMinutes(value.startTime) < MIN_AREA_BLOCK_MINUTES) return null;
  return { id: value.id, areaId: value.areaId, weekdays, effectiveOn: value.effectiveOn, startTime: value.startTime, endTime: value.endTime };
}

export function recurringAreaBlockRulesConflict(left, right) {
  return left.weekdays.some((weekday) => right.weekdays.includes(weekday))
    && plannerMinutes(left.startTime) < plannerMinutes(right.endTime)
    && plannerMinutes(right.startTime) < plannerMinutes(left.endTime);
}

function normalizeException(value, rulesById) {
  if (!value || typeof value !== "object" || !isText(value.id) || !isText(value.ruleId) || !isPlannerDate(value.occurrenceDate)) return null;
  const rule = rulesById.get(value.ruleId);
  if (!rule || value.occurrenceDate < rule.effectiveOn || !rule.weekdays.includes(plannerWeekday(value.occurrenceDate))) return null;
  if (value.kind === "skip") return { id: value.id, ruleId: value.ruleId, occurrenceDate: value.occurrenceDate, kind: "skip" };
  if (value.kind !== "override" || !isPlannerDate(value.date) || !isPlannerCalendarTime(value.startTime) || !isPlannerCalendarTime(value.endTime, true)) return null;
  if (plannerMinutes(value.endTime) - plannerMinutes(value.startTime) < MIN_AREA_BLOCK_MINUTES) return null;
  return { id: value.id, ruleId: value.ruleId, occurrenceDate: value.occurrenceDate, kind: "override", date: value.date, startTime: value.startTime, endTime: value.endTime };
}

function normalizeSession(value, projectAreas, rulesById) {
  if (!value || typeof value !== "object" || !isText(value.id) || !isText(value.projectId) || !isText(value.ruleId) || !isPlannerDate(value.occurrenceDate)) return null;
  const rule = rulesById.get(value.ruleId);
  if (!rule || projectAreas.get(value.projectId) !== rule.areaId) return null;
  if (value.occurrenceDate < rule.effectiveOn || !rule.weekdays.includes(plannerWeekday(value.occurrenceDate))) return null;
  if (!Number.isInteger(value.startOffsetMinutes) || value.startOffsetMinutes < 0 || value.startOffsetMinutes % PLANNER_SNAP_MINUTES !== 0 || !Number.isInteger(value.durationMinutes) || value.durationMinutes < PLANNER_SNAP_MINUTES || value.durationMinutes % PLANNER_SNAP_MINUTES !== 0 || value.durationMinutes > 12 * 60) return null;
  return { id: value.id, projectId: value.projectId, ruleId: value.ruleId, occurrenceDate: value.occurrenceDate, startOffsetMinutes: value.startOffsetMinutes, durationMinutes: value.durationMinutes };
}

export function normalizePlanner(value, areaIds, projectAreas) {
  if (!value || typeof value !== "object" || !Array.isArray(value.areaBlockRules) || !Array.isArray(value.areaBlockExceptions) || !Array.isArray(value.projectSessions)) return null;
  const rules = value.areaBlockRules.map((rule) => normalizeRule(rule, areaIds));
  if (rules.some((rule) => rule === null)) return null;
  const ruleIds = new Set(rules.map((rule) => rule.id));
  if (ruleIds.size !== rules.length) return null;
  for (let index = 0; index < rules.length; index += 1) {
    for (let comparison = index + 1; comparison < rules.length; comparison += 1) {
      if (recurringAreaBlockRulesConflict(rules[index], rules[comparison])) return null;
    }
  }
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const exceptions = value.areaBlockExceptions.map((exception) => normalizeException(exception, rulesById));
  if (exceptions.some((exception) => exception === null)) return null;
  const exceptionIds = new Set(exceptions.map((exception) => exception.id));
  const occurrenceKeys = new Set(exceptions.map((exception) => plannerOccurrenceId(exception.ruleId, exception.occurrenceDate)));
  if (exceptionIds.size !== exceptions.length || occurrenceKeys.size !== exceptions.length) return null;
  const exceptionsByOccurrence = new Map(exceptions.map((exception) => [plannerOccurrenceId(exception.ruleId, exception.occurrenceDate), exception]));
  const recurringRuleBySlot = Array.from({ length: 7 }, () => []);
  for (const rule of rules) {
    const start = plannerMinutes(rule.startTime);
    const end = plannerMinutes(rule.endTime);
    for (const weekday of rule.weekdays) {
      for (let minutes = start; minutes < end; minutes += PLANNER_SNAP_MINUTES) {
        recurringRuleBySlot[weekday][(minutes - PLANNER_START_MINUTES) / PLANNER_SNAP_MINUTES] = rule;
      }
    }
  }
  const overridesByDate = new Map();
  for (const exception of exceptions) {
    if (exception.kind !== "override") continue;
    const group = overridesByDate.get(exception.date);
    if (group) group.push(exception);
    else overridesByDate.set(exception.date, [exception]);
    const start = plannerMinutes(exception.startTime);
    const end = plannerMinutes(exception.endTime);
    for (let minutes = start; minutes < end; minutes += PLANNER_SNAP_MINUTES) {
      const rule = recurringRuleBySlot[plannerWeekday(exception.date)][(minutes - PLANNER_START_MINUTES) / PLANNER_SNAP_MINUTES];
      if (rule && exception.date >= rule.effectiveOn && !exceptionsByOccurrence.has(plannerOccurrenceId(rule.id, exception.date))) return null;
    }
  }
  for (const group of overridesByDate.values()) {
    group.sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 1; index < group.length; index += 1) {
      if (plannerMinutes(group[index].startTime) < plannerMinutes(group[index - 1].endTime)) return null;
    }
  }
  const sessions = value.projectSessions.map((session) => normalizeSession(session, projectAreas, rulesById));
  if (sessions.some((session) => session === null)) return null;
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length) return null;
  const sessionsByOccurrence = new Map();
  for (const session of sessions) {
    const rule = rulesById.get(session.ruleId);
    const exception = exceptionsByOccurrence.get(plannerOccurrenceId(session.ruleId, session.occurrenceDate));
    if (!rule || exception?.kind === "skip") return null;
    const blockDuration = exception?.kind === "override"
      ? plannerMinutes(exception.endTime) - plannerMinutes(exception.startTime)
      : plannerMinutes(rule.endTime) - plannerMinutes(rule.startTime);
    if (session.startOffsetMinutes + session.durationMinutes > blockDuration) return null;
    const key = plannerOccurrenceId(session.ruleId, session.occurrenceDate);
    const group = sessionsByOccurrence.get(key);
    if (group) group.push(session);
    else sessionsByOccurrence.set(key, [session]);
  }
  for (const group of sessionsByOccurrence.values()) {
    group.sort((left, right) => left.startOffsetMinutes - right.startOffsetMinutes);
    for (let index = 1; index < group.length; index += 1) {
      if (group[index].startOffsetMinutes < group[index - 1].startOffsetMinutes + group[index - 1].durationMinutes) return null;
    }
  }
  return { areaBlockRules: rules, areaBlockExceptions: exceptions, projectSessions: sessions };
}

function plannerOccurrenceId(ruleId, occurrenceDate) {
  return `${ruleId}:${occurrenceDate}`;
}

export function materializeAreaBlocks(planner, dateKeys) {
  const visibleDates = new Set(dateKeys);
  const exceptions = new Map(planner.areaBlockExceptions.map((item) => [plannerOccurrenceId(item.ruleId, item.occurrenceDate), item]));
  const occurrences = [];
  for (const rule of planner.areaBlockRules) {
    for (const sourceDate of dateKeys) {
      if (sourceDate < rule.effectiveOn || !rule.weekdays.includes(plannerWeekday(sourceDate))) continue;
      const exception = exceptions.get(`${rule.id}:${sourceDate}`);
      if (exception?.kind === "skip") continue;
      const occurrence = exception?.kind === "override"
        ? { id: plannerOccurrenceId(rule.id, sourceDate), ruleId: rule.id, sourceDate, areaId: rule.areaId, date: exception.date, startTime: exception.startTime, endTime: exception.endTime, exception: true }
        : { id: plannerOccurrenceId(rule.id, sourceDate), ruleId: rule.id, sourceDate, areaId: rule.areaId, date: sourceDate, startTime: rule.startTime, endTime: rule.endTime, exception: false };
      if (visibleDates.has(occurrence.date)) occurrences.push(occurrence);
    }
  }
  for (const exception of planner.areaBlockExceptions) {
    if (exception.kind !== "override" || !visibleDates.has(exception.date) || visibleDates.has(exception.occurrenceDate)) continue;
    const rule = planner.areaBlockRules.find((item) => item.id === exception.ruleId);
    if (!rule || exception.occurrenceDate < rule.effectiveOn || !rule.weekdays.includes(plannerWeekday(exception.occurrenceDate))) continue;
    occurrences.push({ id: plannerOccurrenceId(rule.id, exception.occurrenceDate), ruleId: rule.id, sourceDate: exception.occurrenceDate, areaId: rule.areaId, date: exception.date, startTime: exception.startTime, endTime: exception.endTime, exception: true });
  }
  return occurrences.sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime));
}

export function plannerRangesOverlap(left, right) {
  return left.date === right.date && plannerMinutes(left.startTime) < plannerMinutes(right.endTime) && plannerMinutes(right.startTime) < plannerMinutes(left.endTime);
}

export function areaBlockConflict(candidate, occurrences, ignoredId) {
  return occurrences.some((occurrence) => occurrence.id !== ignoredId && plannerRangesOverlap(candidate, occurrence));
}

export function formatPlannerTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${suffix}`;
}
