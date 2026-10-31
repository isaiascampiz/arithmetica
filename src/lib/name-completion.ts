import type { Database } from './model';
export const normalizedName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export function completeStudentName(db: Database, prefix: string): { completion: string | null } {
  const query = normalizedName(prefix);
  // A short prefix must not become eligible just because it contains punctuation.
  if ((query.match(/\p{L}/gu) ?? []).length < 3) return { completion: null };
  const matches = db.students.filter(
    (s) =>
      db.operations?.students[s.id]?.active !== false && normalizedName(s.name).startsWith(query),
  );
  return { completion: matches.length === 1 ? matches[0].name : null };
}
