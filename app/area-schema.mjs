export const AREA_ICON_OPTIONS = [
  ["target", "Target"],
  ["trend", "Trend"],
  ["sprout", "Growth"],
  ["people", "People"],
  ["briefcase", "Work"],
  ["heart", "Health"],
  ["home", "Home"],
  ["book", "Learning"],
];

const AREA_ICONS = AREA_ICON_OPTIONS.map(([icon]) => icon);

export function isAreaIcon(value) {
  return AREA_ICONS.includes(value);
}

export function defaultAreaIcon(name) {
  const normalized = name.toLowerCase();
  if (normalized.includes("trading") || normalized.includes("finance")) return "trend";
  if (normalized.includes("growth") || normalized.includes("personal")) return "sprout";
  if (normalized.includes("family")) return "people";
  if (normalized.includes("business") || normalized.includes("work")) return "briefcase";
  return "target";
}

export function normalizeArea(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (isAreaIcon(value.icon)) return { id: value.id, name: value.name, icon: value.icon };
  if (typeof value.cue === "string") return { id: value.id, name: value.name, icon: defaultAreaIcon(value.name) };
  return null;
}
