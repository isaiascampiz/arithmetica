import type { Database, Student } from './model';
import type { RosterFilter } from './v3-analytics';
import { nextExpected } from './schedule';

export const directoryFilters: RosterFilter = {
  query: '',
  format: 'All',
  subject: 'All',
  early: false,
  days: [],
  medal: 'All',
  status: 'All',
};
export const directorySortOptions = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'due', label: 'Next scheduled visit' },
  { value: 'enrolled', label: 'Recently enrolled' },
];
export function directoryOrder(
  db: Database,
  sort: string,
  today: string,
  due?: Map<string, string | null>,
) {
  return (a: Student, b: Student) => {
    const name = a.name.localeCompare(b.name);
    if (sort === 'name-desc') return -name;
    if (sort === 'enrolled')
      return (
        (db.operations!.students[b.id].enrollmentDate || '').localeCompare(
          db.operations!.students[a.id].enrollmentDate || '',
        ) || name
      );
    if (sort === 'due')
      return (
        (due?.get(a.id) || nextExpected(db.operations!, a.id, today, true) || '9999').localeCompare(
          due?.get(b.id) || nextExpected(db.operations!, b.id, today, true) || '9999',
        ) || name
      );
    return name;
  };
}
