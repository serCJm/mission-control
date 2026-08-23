export const PROJECT_NOTE_TITLE_LIMIT = 500;
export const PROJECT_NOTE_BODY_LIMIT = 20_000;

function isText(value, maxLength) {
  return typeof value === "string" && value.length <= maxLength;
}

export function normalizeProjectNotes(value) {
  if (!Array.isArray(value)) return null;
  const ids = new Set();
  const notes = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const { id, title, body, pinned, createdAt, updatedAt } = candidate;
    if (
      !isText(id, 200)
      || !id
      || ids.has(id)
      || !isText(title, PROJECT_NOTE_TITLE_LIMIT)
      || !isText(body, PROJECT_NOTE_BODY_LIMIT)
      || typeof pinned !== "boolean"
      || typeof createdAt !== "number"
      || !Number.isFinite(createdAt)
      || typeof updatedAt !== "number"
      || !Number.isFinite(updatedAt)
    ) return null;

    ids.add(id);
    notes.push({ id, title, body, pinned, createdAt, updatedAt });
  }

  return notes;
}

export function sortProjectNotes(notes) {
  return [...notes].sort((left, right) => (
    Number(right.pinned) - Number(left.pinned)
    || right.updatedAt - left.updatedAt
    || right.createdAt - left.createdAt
    || left.id.localeCompare(right.id)
  ));
}
