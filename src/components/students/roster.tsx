'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { isOpenVisit, type Snapshot, type Student } from '@/lib/model';
import { filterRoster } from '@/lib/v3-analytics';
import { expectedOn } from '@/lib/schedule';
import { dayKey } from '@/lib/model';
import { Modal } from '@/components/ui/shared';
import { Avatar, Empty } from '@/components/ui/shared-ui';
import { StudentDirectoryToolbar } from './student-directory-toolbar';
import { SettingRow, Switch } from '@/components/ui/ui-primitives';
import { directoryFilters as initial, directoryOrder } from '@/lib/student-directory';
import type { V2Command } from '@/lib/v2-domain';
export function StudentRoster({
  db,
  profile,
  attendance,
  legacyAct,
  busy,
  error,
}: {
  db: Snapshot;
  profile: (id: string) => void;
  attendance: (s: Student) => Promise<void>;
  legacyAct: (c: V2Command) => Promise<boolean>;
  busy: boolean;
  error: string;
}) {
  const [f, setF] = useState(initial),
    [add, setAdd] = useState(false),
    [name, setName] = useState(''),
    [early, setEarly] = useState(false),
    [sort, setSort] = useState('name');
  const today = dayKey(new Date(), db.timezone),
    teacher = db.staff.role !== 'assistant';
  const students = filterRoster(db, f).sort(directoryOrder(db, sort, today));
  return (
    <>
      <StudentDirectoryToolbar
        filter={f}
        onFilter={setF}
        sort={sort}
        onSort={setSort}
        searchLabel="Search Student Roster"
        action={
          teacher && (
            <button
              className="primary directory-add-student"
              aria-label="Add student"
              onClick={() => setAdd(true)}
            >
              <Plus size={17} />
              <span>Add student</span>
            </button>
          )
        }
      />
      <div className="roster-result-count" role="status">
        {students.length} students
      </div>
      <section className="panel roster-v3-list">
        {students.map((s) => {
          const c = db.operations!.students[s.id],
            present = db.visits.some((v) => v.studentId === s.id && isOpenVisit(v));
          return (
            <div className="roster-v3-row" key={s.id}>
              <button className="roster-v3-person" onClick={() => profile(s.id)}>
                <Avatar student={s} />
                <div>
                  <b>{s.name}</b>
                  <span>
                    {s.subjects
                      .map(
                        (sub) =>
                          sub +
                          (c.subjects[sub as 'Math' | 'Reading'].format === 'CONNECT'
                            ? ' · CONNECT'
                            : ''),
                      )
                      .join(' / ')}
                    {s.earlyLearner ? ' · Early learner' : ''}
                  </span>
                  <small>
                    {c.awayUntil
                      ? 'Away Until ' + c.awayUntil
                      : expectedOn(db.operations!, s.id, today)
                        ? 'Expected today'
                        : c.active
                          ? 'Active'
                          : 'Inactive'}{' '}
                    {c.setupPending ? '· Setup incomplete' : ''}
                  </small>
                </div>
              </button>
              <button
                className="secondary"
                disabled={busy || !c.active}
                onClick={() => void attendance(s)}
                aria-label={(present ? 'Check out ' : 'Check in ') + s.name}
              >
                {present ? 'Check Out' : 'Check In'}
              </button>
            </div>
          );
        })}
        {!students.length && (
          <Empty title="No students match" text="Clear Filters or change your search." />
        )}
      </section>
      {add && (
        <Modal
          variant="form"
          title={db.runtime?.demo ? 'Add fictional student' : 'Add student'}
          close={() => setAdd(false)}
          footer={
            <>
              <button className="secondary" disabled={busy} onClick={() => setAdd(false)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || name.trim().length < 2}
                onClick={async () => {
                  if (
                    await legacyAct({
                      action: 'student-add',
                      name,
                      earlyLearner: early,
                    })
                  ) {
                    setAdd(false);
                    setF({ ...initial, query: name });
                  }
                }}
              >
                Create student
              </button>
            </>
          }
        >
          <label>
            {db.runtime?.demo ? 'New fictional student name' : 'Student name'}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <SettingRow label="Early learner">
            <Switch label="Early learner" checked={early} onChange={setEarly} />
          </SettingRow>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
