export const PLANNER_TIME_ZONE = "America/Los_Angeles";
export const PLANNER_SNAP_MINUTES = 15;
export const MIN_CALENDAR_BLOCK_MINUTES = 30;
export const PLANNER_START_MINUTES = 6 * 60;
export const PLANNER_END_MINUTES = 23 * 60;
export const CALENDAR_BLOCK_FILLS = ["sage", "sky", "sand", "rose", "lilac", "slate"];
export const DEFAULT_AREA_CALENDAR_BLOCK_FILL = "sage";
export const DEFAULT_STANDALONE_CALENDAR_BLOCK_FILL = "slate";

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

export function isCalendarBlockFill(value) {
  return CALENDAR_BLOCK_FILLS.includes(value);
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

export function plannerRuleOccursOn(rule, dateKey) {
  return dateKey >= rule.effectiveOn
    && (!rule.endsOn || dateKey <= rule.endsOn)
    && rule.weekdays.includes(plannerWeekday(dateKey));
}

function calendarBlockRulesShareDate(left, right) {
  const overlapStartsOn = left.effectiveOn > right.effectiveOn ? left.effectiveOn : right.effectiveOn;
  const finiteEnds = [left.endsOn, right.endsOn].filter(Boolean).sort();
  const overlapEndsOn = finiteEnds[0];
  if (overlapEndsOn && overlapStartsOn > overlapEndsOn) return false;
  return left.weekdays.some((weekday) => {
    if (!right.weekdays.includes(weekday)) return false;
    const firstMatchingDate = shiftPlannerDate(overlapStartsOn, (weekday - plannerWeekday(overlapStartsOn) + 7) % 7);
    return !overlapEndsOn || firstMatchingDate <= overlapEndsOn;
  });
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) return null;
  if (value.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null;
  const weekdays = [...new Set(value)].sort((a, b) => a - b);
  return weekdays.length === value.length ? weekdays : null;
}

function normalizeRule(value, areaIds) {
  if (!value || typeof value !== "object" || !isText(value.id)) return null;
  const identity = value.kind === "area" && isText(value.areaId) && areaIds.has(value.areaId) && value.title === undefined
    ? { kind: "area", areaId: value.areaId }
    : value.kind === "standalone" && isText(value.title) && value.title.trim() && value.areaId === undefined
      ? { kind: "standalone", title: value.title.trim() }
      : null;
  if (!identity) return null;
  const weekdays = normalizeWeekdays(value.weekdays);
  if (!weekdays || !isPlannerDate(value.effectiveOn) || !isPlannerCalendarTime(value.startTime) || !isPlannerCalendarTime(value.endTime, true)) return null;
  if (value.endsOn !== undefined && (!isPlannerDate(value.endsOn) || value.endsOn < value.effectiveOn)) return null;
  if (!isCalendarBlockFill(value.fill)) return null;
  if (plannerMinutes(value.endTime) - plannerMinutes(value.startTime) < MIN_CALENDAR_BLOCK_MINUTES) return null;
  return { id: value.id, ...identity, weekdays, effectiveOn: value.effectiveOn, ...(value.endsOn ? { endsOn: value.endsOn } : {}), startTime: value.startTime, endTime: value.endTime, fill: value.fill };
}

export function recurringCalendarBlockRulesConflict(left, right) {
  return calendarBlockRulesShareDate(left, right)
    && plannerMinutes(left.startTime) < plannerMinutes(right.endTime)
    && plannerMinutes(right.startTime) < plannerMinutes(left.endTime);
}

function normalizeException(value, rulesById) {
  if (!value || typeof value !== "object" || !isText(value.id) || !isText(value.ruleId) || !isPlannerDate(value.occurrenceDate)) return null;
  const rule = rulesById.get(value.ruleId);
  if (!rule || !plannerRuleOccursOn(rule, value.occurrenceDate)) return null;
  if (value.kind === "skip") return { id: value.id, ruleId: value.ruleId, occurrenceDate: value.occurrenceDate, kind: "skip" };
  if (value.kind !== "override" || !isPlannerDate(value.date) || !isPlannerCalendarTime(value.startTime) || !isPlannerCalendarTime(value.endTime, true)) return null;
  if (plannerMinutes(value.endTime) - plannerMinutes(value.startTime) < MIN_CALENDAR_BLOCK_MINUTES) return null;
  return { id: value.id, ruleId: value.ruleId, occurrenceDate: value.occurrenceDate, kind: "override", date: value.date, startTime: value.startTime, endTime: value.endTime };
}

function normalizeBlockItem(value, rulesById, taskAreas, routineAreas) {
  if (!value || typeof value !== "object" || !isText(value.id) || !isText(value.ruleId) || !isPlannerDate(value.occurrenceDate) || !isText(value.itemId)) return null;
  const rule = rulesById.get(value.ruleId);
  if (!rule || !plannerRuleOccursOn(rule, value.occurrenceDate)) return null;
  if (rule.kind !== "area") return null;
  if (value.kind === "task" && taskAreas.get(value.itemId) === rule.areaId) return { id: value.id, ruleId: value.ruleId, occurrenceDate: value.occurrenceDate, kind: "task", itemId: value.itemId };
  if (value.kind === "routine" && routineAreas.get(value.itemId) === rule.areaId) return { id: value.id, ruleId: value.ruleId, occurrenceDate: value.occurrenceDate, kind: "routine", itemId: value.itemId };
  return null;
}

function plannerBlockItemDate(exceptionsByOccurrence, item) {
  const exception = exceptionsByOccurrence.get(plannerOccurrenceId(item.ruleId, item.occurrenceDate));
  return exception?.kind === "override" ? exception.date : item.occurrenceDate;
}

export function parsePlannerCandidate(value) {
  if (typeof value !== "string") return null;
  const separator = value.indexOf(":");
  if (separator < 1 || separator === value.length - 1) return null;
  const kind = value.slice(0, separator);
  if (kind !== "task" && kind !== "routine") return null;
  return { kind, itemId: value.slice(separator + 1) };
}

export function normalizePlanner(value, areaIds, taskAreas, routineAreas) {
  if (!value || typeof value !== "object" || !Array.isArray(value.blockRules) || !Array.isArray(value.blockExceptions) || !Array.isArray(value.blockItems)) return null;
  const rules = value.blockRules.map((rule) => normalizeRule(rule, areaIds));
  if (rules.some((rule) => rule === null)) return null;
  const ruleIds = new Set(rules.map((rule) => rule.id));
  if (ruleIds.size !== rules.length) return null;
  for (let index = 0; index < rules.length; index += 1) {
    for (let comparison = index + 1; comparison < rules.length; comparison += 1) {
      if (recurringCalendarBlockRulesConflict(rules[index], rules[comparison])) return null;
    }
  }
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const exceptions = value.blockExceptions.map((exception) => normalizeException(exception, rulesById));
  if (exceptions.some((exception) => exception === null)) return null;
  const exceptionIds = new Set(exceptions.map((exception) => exception.id));
  const occurrenceKeys = new Set(exceptions.map((exception) => plannerOccurrenceId(exception.ruleId, exception.occurrenceDate)));
  if (exceptionIds.size !== exceptions.length || occurrenceKeys.size !== exceptions.length) return null;
  const exceptionsByOccurrence = new Map(exceptions.map((exception) => [plannerOccurrenceId(exception.ruleId, exception.occurrenceDate), exception]));
  const overridesByDate = new Map();
  for (const exception of exceptions) {
    if (exception.kind !== "override") continue;
    const group = overridesByDate.get(exception.date);
    if (group) group.push(exception);
    else overridesByDate.set(exception.date, [exception]);
    const conflictsWithRule = rules.some((rule) => plannerRuleOccursOn(rule, exception.date)
      && plannerMinutes(rule.startTime) < plannerMinutes(exception.endTime)
      && plannerMinutes(exception.startTime) < plannerMinutes(rule.endTime)
      && !exceptionsByOccurrence.has(plannerOccurrenceId(rule.id, exception.date)));
    if (conflictsWithRule) return null;
  }
  for (const group of overridesByDate.values()) {
    group.sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 1; index < group.length; index += 1) {
      if (plannerMinutes(group[index].startTime) < plannerMinutes(group[index - 1].endTime)) return null;
    }
  }
  const blockItems = value.blockItems.map((item) => normalizeBlockItem(item, rulesById, taskAreas, routineAreas));
  if (blockItems.some((item) => item === null) || new Set(blockItems.map((item) => item.id)).size !== blockItems.length) return null;
  const blockItemsByOccurrence = new Map();
  const routineItemsByDate = new Set();
  for (const item of blockItems) {
    const exception = exceptionsByOccurrence.get(plannerOccurrenceId(item.ruleId, item.occurrenceDate));
    if (exception?.kind === "skip") return null;
    const key = plannerOccurrenceId(item.ruleId, item.occurrenceDate);
    const group = blockItemsByOccurrence.get(key) ?? [];
    if (group.some((entry) => entry.kind === item.kind && entry.itemId === item.itemId) || group.length >= 3) return null;
    group.push(item);
    blockItemsByOccurrence.set(key, group);
    if (item.kind === "routine") {
      const routineDateKey = `${item.itemId}:${plannerBlockItemDate(exceptionsByOccurrence, item)}`;
      if (routineItemsByDate.has(routineDateKey)) return null;
      routineItemsByDate.add(routineDateKey);
    }
  }
  return { blockRules: rules, blockExceptions: exceptions, blockItems };
}

export function plannerOccurrenceId(ruleId, occurrenceDate) {
  return `${ruleId}:${occurrenceDate}`;
}

export function plannerBlockItems(planner, occurrence) {
  return planner.blockItems.filter((item) => item.ruleId === occurrence.ruleId && item.occurrenceDate === occurrence.sourceDate);
}

function isOccurrenceException(exception, occurrence) {
  return exception.ruleId === occurrence.ruleId && exception.occurrenceDate === occurrence.sourceDate;
}

export function plannerAfterRuleDelete(planner, ruleId) {
  return {
    blockRules: planner.blockRules.filter((rule) => rule.id !== ruleId),
    blockExceptions: planner.blockExceptions.filter((exception) => exception.ruleId !== ruleId),
    blockItems: planner.blockItems.filter((item) => item.ruleId !== ruleId),
  };
}

export function plannerAfterOneTimeRuleEdit(planner, previousRule, rule) {
  const isPreviousOccurrence = (item) => item.ruleId === previousRule.id
    && item.occurrenceDate === previousRule.effectiveOn;
  const existingOverride = planner.blockExceptions.find((item) => isPreviousOccurrence(item)
    && item.kind === "override");
  if (existingOverride) {
    const identity = rule.kind === "area"
      ? { kind: "area", areaId: rule.areaId }
      : { kind: "standalone", title: rule.title };
    const storedRule = {
      id: previousRule.id,
      ...identity,
      weekdays: previousRule.weekdays,
      effectiveOn: previousRule.effectiveOn,
      ...(previousRule.endsOn ? { endsOn: previousRule.endsOn } : {}),
      startTime: previousRule.startTime,
      endTime: previousRule.endTime,
      fill: rule.fill,
    };
    return {
      ...planner,
      blockRules: planner.blockRules.map((item) => item.id === previousRule.id ? storedRule : item),
      blockExceptions: planner.blockExceptions.map((item) => item === existingOverride ? {
        ...existingOverride,
        date: rule.effectiveOn,
        startTime: rule.startTime,
        endTime: rule.endTime,
      } : item),
    };
  }
  return {
    ...planner,
    blockRules: planner.blockRules.map((item) => item.id === previousRule.id ? rule : item),
    blockExceptions: planner.blockExceptions.filter((item) => !isPreviousOccurrence(item)),
    blockItems: planner.blockItems.map((item) => isPreviousOccurrence(item)
      ? { ...item, occurrenceDate: rule.effectiveOn }
      : item),
  };
}

export function plannerAfterOccurrenceUpdate(planner, occurrence, date, startTime, endTime, fill, exceptionId) {
  const rule = planner.blockRules.find((item) => item.id === occurrence.ruleId);
  if (!rule) return planner;
  const remainingExceptions = planner.blockExceptions.filter((item) => !isOccurrenceException(item, occurrence));
  const followsRule = date === occurrence.sourceDate && startTime === rule.startTime && endTime === rule.endTime;
  const existingException = planner.blockExceptions.find((item) => isOccurrenceException(item, occurrence));
  const blockExceptions = followsRule ? remainingExceptions : [...remainingExceptions, {
    id: existingException?.id ?? exceptionId,
    ruleId: occurrence.ruleId,
    occurrenceDate: occurrence.sourceDate,
    kind: "override",
    date,
    startTime,
    endTime,
  }];
  return {
    ...planner,
    blockRules: planner.blockRules.map((item) => item.id === occurrence.ruleId ? { ...item, fill } : item),
    blockExceptions,
  };
}

export function plannerAfterOccurrenceDelete(planner, occurrence, exceptionId) {
  const rule = planner.blockRules.find((item) => item.id === occurrence.ruleId);
  if (!rule) return planner;
  if (rule.endsOn === rule.effectiveOn) return plannerAfterRuleDelete(planner, rule.id);
  const existingException = planner.blockExceptions.find((item) => isOccurrenceException(item, occurrence));
  const skip = { id: existingException?.id ?? exceptionId, ruleId: occurrence.ruleId, occurrenceDate: occurrence.sourceDate, kind: "skip" };
  return {
    ...planner,
    blockExceptions: [...planner.blockExceptions.filter((item) => !isOccurrenceException(item, occurrence)), skip],
    blockItems: planner.blockItems.filter((item) => !(item.ruleId === occurrence.ruleId && item.occurrenceDate === occurrence.sourceDate)),
  };
}

export function isFinalRoutineSessionStatus(status) {
  return status === "completed" || status === "skipped" || status === "missed";
}

export function plannerBlockTarget(planner, areaId, today, currentMinutes, horizonDays = 90) {
  const dates = Array.from({ length: horizonDays }, (_, index) => shiftPlannerDate(today, index));
  const occurrences = materializeCalendarBlocks(planner, dates).filter((occurrence) => occurrence.kind === "area" && occurrence.areaId === areaId);
  const active = occurrences.find((occurrence) => occurrence.date === today
    && plannerMinutes(occurrence.startTime) <= currentMinutes
    && plannerMinutes(occurrence.endTime) > currentMinutes);
  if (active) return { occurrence: active, active: true };
  const upcoming = occurrences.find((occurrence) => occurrence.date > today
    || (occurrence.date === today && plannerMinutes(occurrence.startTime) > currentMinutes));
  return upcoming ? { occurrence: upcoming, active: false } : null;
}

export function placePlannerBlockItem(planner, occurrence, kind, itemId, id) {
  if (occurrence.kind !== "area") return { planner, status: "unavailable" };
  const current = plannerBlockItems(planner, occurrence);
  if (current.some((item) => item.kind === kind && item.itemId === itemId)) return { planner, status: "exists" };
  if (kind === "routine") {
    const exceptionsByOccurrence = new Map(planner.blockExceptions.map((exception) => [plannerOccurrenceId(exception.ruleId, exception.occurrenceDate), exception]));
    if (planner.blockItems.some((item) => item.kind === "routine" && item.itemId === itemId && plannerBlockItemDate(exceptionsByOccurrence, item) === occurrence.date)) return { planner, status: "exists" };
  }
  if (current.length >= 3) return { planner, status: "full" };

  const ordered = [...current, { id, ruleId: occurrence.ruleId, occurrenceDate: occurrence.sourceDate, kind, itemId }];

  const occurrenceIds = new Set(current.map((item) => item.id));
  const firstIndex = planner.blockItems.findIndex((item) => occurrenceIds.has(item.id));
  const remaining = planner.blockItems.filter((item) => !occurrenceIds.has(item.id));
  remaining.splice(firstIndex < 0 ? remaining.length : firstIndex, 0, ...ordered);
  return {
    planner: { ...planner, blockItems: remaining },
    status: "added",
  };
}

export function materializeCalendarBlocks(planner, dateKeys) {
  const visibleDates = new Set(dateKeys);
  const exceptions = new Map(planner.blockExceptions.map((item) => [plannerOccurrenceId(item.ruleId, item.occurrenceDate), item]));
  const occurrences = [];
  for (const rule of planner.blockRules) {
    for (const sourceDate of dateKeys) {
      if (!plannerRuleOccursOn(rule, sourceDate)) continue;
      const exception = exceptions.get(plannerOccurrenceId(rule.id, sourceDate));
      if (exception?.kind === "skip") continue;
      const identity = rule.kind === "area" ? { kind: "area", areaId: rule.areaId } : { kind: "standalone", title: rule.title };
      const occurrence = exception?.kind === "override"
        ? { id: plannerOccurrenceId(rule.id, sourceDate), ruleId: rule.id, sourceDate, ...identity, date: exception.date, startTime: exception.startTime, endTime: exception.endTime, fill: rule.fill, exception: true }
        : { id: plannerOccurrenceId(rule.id, sourceDate), ruleId: rule.id, sourceDate, ...identity, date: sourceDate, startTime: rule.startTime, endTime: rule.endTime, fill: rule.fill, exception: false };
      if (visibleDates.has(occurrence.date)) occurrences.push(occurrence);
    }
  }
  for (const exception of planner.blockExceptions) {
    if (exception.kind !== "override" || !visibleDates.has(exception.date) || visibleDates.has(exception.occurrenceDate)) continue;
    const rule = planner.blockRules.find((item) => item.id === exception.ruleId);
    if (!rule || !plannerRuleOccursOn(rule, exception.occurrenceDate)) continue;
    const identity = rule.kind === "area" ? { kind: "area", areaId: rule.areaId } : { kind: "standalone", title: rule.title };
    occurrences.push({ id: plannerOccurrenceId(rule.id, exception.occurrenceDate), ruleId: rule.id, sourceDate: exception.occurrenceDate, ...identity, date: exception.date, startTime: exception.startTime, endTime: exception.endTime, fill: rule.fill, exception: true });
  }
  return occurrences.sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime));
}

export function calendarBlockRangesOverlap(left, right) {
  return left.date === right.date && plannerMinutes(left.startTime) < plannerMinutes(right.endTime) && plannerMinutes(right.startTime) < plannerMinutes(left.endTime);
}

export function calendarBlockConflict(candidate, occurrences, ignoredId) {
  return occurrences.some((occurrence) => occurrence.id !== ignoredId && calendarBlockRangesOverlap(candidate, occurrence));
}

export function formatPlannerTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${suffix}`;
}
