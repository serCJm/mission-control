export function normalizeTaskNotes(value) {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.length <= 20_000 ? value : null;
}
