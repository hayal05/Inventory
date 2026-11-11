// Turns user text into a safe ILIKE "contains" pattern. Without escaping, a
// search for "50%" or "_" would act as a wildcard instead of literal text.
// Postgres LIKE uses backslash as its default escape character.
export function containsPattern(text) {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}
