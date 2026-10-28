import type { Database } from './model';
export const normalizedName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
/** User-authorized name-only projection. Ambiguity never chooses a student. */
export function completeStudentName(db: Database, prefix: string): { completion: string | null } {
  const query = normalizedName(prefix);
  if (query.length < 3) return { completion: null };
  const matches = db.students.filter(
    (s) =>
      db.operations?.students[s.id]?.active !== false && normalizedName(s.name).startsWith(query),
  );
  return { completion: matches.length === 1 ? matches[0].name : null };
}
