'use client';
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { isOpenVisit, type Snapshot, type Student } from '@/lib/model';
import { filterRoster, type RosterFilter } from '@/lib/v3-analytics';
import { expectedOn } from '@/lib/schedule';
import { dayKey } from '@/lib/model';
import { Medals, Modal } from './v3-shared';
import { Avatar, Empty } from './shared-ui';
import type { V2Command } from '@/lib/v2-domain';
const initial: RosterFilter = {
  query: '',
  format: 'All',
  subject: 'All',
  early: false,
  days: [],
  medal: 'All',
  status: 'Active',
};
export function RosterV3({
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
    [draft, setDraft] = useState(initial),
    [filtersOpen, setFiltersOpen] = useState(false),
    [add, setAdd] = useState(false),
    [name, setName] = useState(''),
    [early, setEarly] = useState(false);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const students = filterRoster(db, f),
    today = dayKey(new Date(), db.timezone),
    teacher = db.staff.role !== 'assistant';
  return (
    <>
      <div className="roster-v3-toolbar">
        <input
          aria-label="Search Student Roster"
          placeholder="Search name or student ID…"
          value={f.query}
          onChange={(e) => setF({ ...f, query: e.target.value })}
        />
        <button
          ref={filtersButton}
          className="secondary"
          aria-expanded={filtersOpen}
          aria-controls="roster-filters"
          onClick={() => {
            setDraft(f);
            setFiltersOpen(!filtersOpen);
          }}
        >
          Filters
          {(f.subject !== initial.subject ||
            f.format !== initial.format ||
            f.status !== initial.status ||
            f.early ||
            f.days.length > 0) && <span className="small"> (active)</span>}
        </button>
        {teacher && (
          <button className="primary" onClick={() => setAdd(true)}>
            <Plus size={17} />
            Add student
          </button>
        )}
      </div>
      {filtersOpen && (
        <form
          id="roster-filters"
          aria-label="Roster filters"
          className="roster-v3-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setF({ ...draft, query: f.query });
            setFiltersOpen(false);
            filtersButton.current?.focus();
          }}
        >
          <h3 className="roster-filter-heading">Filter students</h3>
          <div className="roster-filter-fields">
            <label>
              Subject
              <select
                aria-label="Subject"
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              >
                <option value="All">All subjects</option>
                <option>Math</option>
                <option>Reading</option>
              </select>
            </label>
            <label>
              Format
              <select
                aria-label="Format"
                value={draft.format}
                onChange={(e) => setDraft({ ...draft, format: e.target.value })}
              >
                <option value="All">All formats</option>
                <option value="Paper">PAPER</option>
                <option value="CONNECT">Kumon CONNECT</option>
              </select>
            </label>
            <label>
              Enrollment status
              <select
                aria-label="Enrollment status"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                {['Active', 'Inactive', 'All'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="roster-filter-options">
            <fieldset className="roster-student-group">
              <legend>Student group</legend>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={draft.early}
                  onChange={(e) => setDraft({ ...draft, early: e.target.checked })}
                />
                Early learner
              </label>
            </fieldset>
            <fieldset className="roster-visit-days">
              <legend>Visit weekdays</legend>
              <div className="day-options">
                {['Mon', 'Tue', 'Wed', 'Thu'].map((d, i) => (
                  <label key={d}>
                    <input
                      type="checkbox"
                      checked={draft.days.includes(i + 1)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          days: e.target.checked
                            ? [...draft.days, i + 1]
                            : draft.days.filter((n) => n !== i + 1),
                        })
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="roster-filter-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => {
                const cleared = { ...initial, query: f.query };
                setF(cleared);
                setDraft(cleared);
              }}
            >
              Clear
            </button>
            <button className="secondary" type="submit">
              Apply
            </button>
          </div>
        </form>
      )}
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
                  <b>
                    {s.name}
                    <Medals db={db} student={s} />
                  </b>
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
                    · {s.id}
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
          title="Add fictional student"
          close={() => setAdd(false)}
          footer={
            <button
              className="primary"
              disabled={busy || name.trim().length < 2}
              onClick={async () => {
                if (await legacyAct({ action: 'student-add', name, earlyLearner: early })) {
                  setAdd(false);
                  setF({ ...initial, query: name });
                }
              }}
            >
              Create student
            </button>
          }
        >
          <label>
            New fictional student name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <label className="check-label">
            <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} />
            Early learner
          </label>
          <p className="small muted">
            Edit Student after creation to set enrollment date, subjects and worksheet settings.
          </p>
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
