'use client';
import { useState } from 'react';
import { Check, ChevronRight, Flag, Plus, BookOpen, Users, CalendarDays } from 'lucide-react';
import { dayKey, isOpenVisit, type Snapshot, type Student } from '@/lib/model';
import type { V2Command } from '@/lib/v2-domain';
import type { Assignment } from '@/lib/v2-model';
import { activeCorrections, correctionVisits, rangeLabel } from '@/lib/homework';
import {
  expectedOn,
  lastVisitBeforeVacation,
  nextExpected,
  recurring,
  expectedMinutes,
} from '@/lib/schedule';
import { Avatar, Empty, time, elapsed, useNow } from './shared-ui';
export type Act = (command: V2Command) => Promise<boolean>;
export const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function DayPicker({
  value,
  onChange,
  label = 'Recurring attendance days',
}: {
  value: number[];
  onChange: (days: number[]) => void;
  label?: string;
}) {
  return (
    <fieldset className="day-picker">
      <legend>{label}</legend>
      {dayNames.map((d, i) => (
        <button
          type="button"
          key={d}
          aria-pressed={value.includes(i)}
          className={value.includes(i) ? 'selected' : ''}
          onClick={() => onChange(value.includes(i) ? value.filter((n) => n !== i) : [...value, i])}
        >
          {d}
        </button>
      ))}
    </fieldset>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 10000,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        required
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function parseWorksheets(text: string) {
  if (!text.trim()) return [];
  const result: number[] = [];
  for (const part of text.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!m) throw new Error('Use worksheet numbers or ranges, for example 101–105, 108.');
    const start = Number(m[1]),
      end = Number(m[2] || m[1]);
    if (start < 1 || end < start || end - start > 999)
      throw new Error('Enter ordered ranges of at most 1,000 sheets.');
    for (let n = start; n <= end; n++) result.push(n);
  }
  return [...new Set(result)];
}
export function RosterRows({
  students,
  db,
  busy,
  profile,
  note,
  attendance,
  act,
}: {
  students: Student[];
  db: Snapshot;
  busy: boolean;
  profile: (id: string) => void;
  note: (s: Student) => void;
  attendance: (s: Student) => void;
  act: Act;
}) {
  const op = db.operations!;
  const now = useNow();
  const today = dayKey(new Date(), db.timezone);
  return (
    <div className="operating-roster">
      {students.map((s) => {
        const v = db.visits.find((v) => v.studentId === s.id && isOpenVisit(v));
        const cfg = op.students[s.id],
          overdue =
            v && (now.getTime() - Date.parse(v.arrivedAt)) / 60000 > expectedMinutes(op, cfg);
        const corrections = activeCorrections(db, s.id);
        return (
          <div className={`operating-row ${overdue ? 'overdue' : ''}`} key={s.id}>
            <button className="plain person roster-person" onClick={() => profile(s.id)}>
              <Avatar student={s} />
              <div>
                <b>{s.name}</b>
                {v && (
                  <small className={overdue ? 'roster-timer amber-text' : 'roster-timer'}>
                    {elapsed(v.arrivedAt)}
                    {overdue ? ' · exceeds expected duration' : ''}
                  </small>
                )}
                <span>
                  {s.subjects.join(' & ')}
                  {s.earlyLearner ? ' · Early learner' : ''}
                  {cfg.familyId ? ` · ${op.families.find((f) => f.id === cfg.familyId)?.name}` : ''}
                </span>
              </div>
            </button>
            <div className="roster-meta">
              {v ? (
                <>
                  <b>{elapsed(v.arrivedAt)}</b>
                  <span className={overdue ? 'amber-text' : ''}>
                    {overdue
                      ? 'Beyond expected duration'
                      : `${expectedMinutes(op, cfg)} min expected`}
                  </span>
                </>
              ) : (
                <>
                  <b>
                    {expectedOn(op, s.id, today)
                      ? 'Expected today'
                      : nextExpected(op, s.id, today, true) || 'No schedule'}
                  </b>
                  <span>
                    {cfg.active
                      ? recurring(op, cfg)
                          .map((d) => dayNames[d])
                          .join(' · ')
                      : 'Withdrawn · history retained'}
                  </span>
                </>
              )}
              {corrections.length > 0 && (
                <span className="tag amber">
                  {corrections.length} correction set{corrections.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="row-actions">
              {s.earlyLearner && v && (
                <button
                  className="icon-button"
                  aria-label={`Request help for ${s.name}`}
                  disabled={busy}
                  onClick={() =>
                    void act({
                      action: 'assistance',
                      studentId: s.id,
                      reason: 'Individual early-learner support requested',
                    })
                  }
                >
                  <Users size={18} />
                </button>
              )}
              {db.staff.role !== 'assistant' && (
                <button
                  className="icon-button"
                  aria-label={`Quick note for ${s.name}`}
                  onClick={() => note(s)}
                >
                  <Flag size={17} />
                </button>
              )}
              <button
                className={`secondary attendance-action ${v ? '' : 'blue-action'}`}
                disabled={busy || !cfg.active}
                aria-label={`${v ? 'Check out' : 'Check in'} ${s.name}`}
                onClick={() => attendance(s)}
              >
                {v ? 'Check out' : 'Check in'}
              </button>
            </div>
          </div>
        );
      })}
      {!students.length && (
        <Empty title="Nothing in this view" text="Choose another filter or search for a student." />
      )}
    </div>
  );
}
export function FamilyManager({ db, act, busy }: { db: Snapshot; act: Act; busy: boolean }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState([1, 4]);
  const [edit, setEdit] = useState<string | undefined>();
  return (
    <section className="panel form-panel">
      <div className="panel-heading">
        <div>
          <h2>Family groups</h2>
          <p>Shared schedules and vacations; each student keeps an individual record.</p>
        </div>
      </div>
      <form
        className="compact-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: 'family-save', id: edit, name, recurringDays: days })) {
            setName('');
            setEdit(undefined);
          }
        }}
      >
        <label>
          Family name
          <input value={name} required maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <DayPicker value={days} onChange={setDays} />
        <button className="primary" disabled={busy}>
          <Plus size={17} />
          {edit ? 'Save family' : 'Create family'}
        </button>
      </form>
      <div className="family-list">
        {db.operations!.families.map((f) => (
          <button
            key={f.id}
            className="preference-row"
            onClick={() => {
              setEdit(f.id);
              setName(f.name);
              setDays(f.recurringDays);
            }}
          >
            <span>
              <Users size={18} />
              {f.name}
            </span>
            <b>
              {f.recurringDays.map((d) => dayNames[d]).join(', ')}
              <ChevronRight size={16} />
            </b>
          </button>
        ))}
      </div>
    </section>
  );
}
export function ScheduleForm({
  db,
  studentId,
  act,
  busy,
}: {
  db: Snapshot;
  studentId: string;
  act: Act;
  busy: boolean;
}) {
  const today = dayKey(new Date(), db.timezone);
  const [kind, setKind] = useState<'absence' | 'vacation' | 'extra-visit' | 'move-visit'>(
    'absence',
  );
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [returnDate, setReturn] = useState(today);
  const [reason, setReason] = useState('');
  const [family, setFamily] = useState(false);
  const op = db.operations!,
    cfg = op.students[studentId];
  return (
    <section className="panel form-panel">
      <div className="panel-heading">
        <div>
          <h2>Temporary attendance changes</h2>
          <p>Regular attendance days stay intact. Proposed homework recalculates automatically.</p>
        </div>
      </div>
      <form
        className="compact-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await act({
              action: 'schedule-add',
              studentId: family ? null : studentId,
              familyId: family ? cfg.familyId : null,
              kind,
              start,
              end: kind === 'extra-visit' || kind === 'move-visit' ? start : end,
              returnDate: kind === 'move-visit' ? returnDate : null,
              reason,
            })
          )
            setReason('');
        }}
      >
        <div className="form-grid">
          <label>
            Change
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="absence">Known absence</option>
              <option value="vacation">Vacation</option>
              <option value="extra-visit">Make-up / extra visit</option>
              <option value="move-visit">Change return day</option>
            </select>
          </label>
          <label>
            {kind === 'move-visit' ? 'Original visit' : 'Start / visit date'}
            <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          {kind === 'vacation' || kind === 'absence' ? (
            <label>
              End date
              <input
                type="date"
                required
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          ) : null}
          {kind === 'move-visit' && (
            <label>
              New return date
              <input
                type="date"
                required
                value={returnDate}
                onChange={(e) => setReturn(e.target.value)}
              />
            </label>
          )}
          <label>
            Reason
            <input
              minLength={3}
              required
              maxLength={1200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Fictional family vacation"
            />
          </label>
        </div>
        {cfg.familyId && (
          <label className="check-label">
            <input type="checkbox" checked={family} onChange={(e) => setFamily(e.target.checked)} />
            Apply to family group
          </label>
        )}
        <button className="primary" disabled={busy}>
          <CalendarDays size={17} />
          Save attendance change
        </button>
      </form>
      <div className="exception-list">
        {op.scheduleEvents
          .filter(
            (e) =>
              !e.cancelledAt &&
              (e.studentId === studentId || (e.familyId && e.familyId === cfg.familyId)),
          )
          .map((e) => (
            <div className="exception-row" key={e.id}>
              <div>
                <b>
                  {e.kind.replace('-', ' ')} · {e.start}
                  {e.end !== e.start ? ` → ${e.end}` : ''}
                  {e.returnDate ? ` → return ${e.returnDate}` : ''}
                </b>
                <p>
                  {e.reason}
                  {e.familyId ? ' · Family group' : ''}
                </p>
              </div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void act({
                    action: 'schedule-cancel',
                    id: e.id,
                    reason: 'Staff cancelled temporary attendance change',
                  })
                }
              >
                Cancel change
              </button>
            </div>
          ))}
      </div>
    </section>
  );
}
export function AssignmentCard({
  a,
  db,
  act,
  busy,
  profile,
}: {
  a: Assignment;
  db: Snapshot;
  act: Act;
  busy: boolean;
  profile: (id: string) => void;
}) {
  const s = db.students.find((s) => s.id === a.studentId)!;
  const teacher = db.staff.role !== 'assistant';
  const next: { status: Assignment['status']; label: string } | null =
    a.status === 'proposed'
      ? { status: 'approved', label: a.capped ? 'Approve capped proposal' : 'Approve proposal' }
      : a.status === 'approved'
        ? { status: 'ready', label: 'Ready to prepare' }
        : a.status === 'ready'
          ? {
              status: a.format === 'CONNECT' ? 'distributed' : 'pulled',
              label: a.format === 'CONNECT' ? 'Record CONNECT assignment' : 'Mark pulled',
            }
          : a.status === 'pulled'
            ? { status: 'distributed', label: 'Confirm distribution' }
            : a.status === 'distributed'
              ? { status: 'returned', label: 'Record returned work' }
              : null;
  return (
    <article className="assignment-card" data-assignment-id={a.id}>
      <div className="assignment-top">
        <button className="plain person" onClick={() => profile(s.id)}>
          <Avatar student={s} />
          <div>
            <b>{s.name}</b>
            <span>
              {a.subject} · {a.format} · next visit {a.nextVisit || 'not scheduled'}
              {' · departure ' + a.fromDate}
            </span>
          </div>
        </button>
        <span
          className={`tag ${a.stale || a.blocked.length ? 'amber' : a.status === 'pulled' ? 'green' : ''}`}
        >
          {a.status === 'verified' ? 'Completed & verified' : a.status.replaceAll('-', ' ')}
        </span>
      </div>
      <div className="worksheet-line">
        <BookOpen size={17} />
        <strong>{a.ranges.map(rangeLabel).join(', ') || 'No new sheets required'}</strong>
      </div>
      {a.carryRanges.length > 0 && (
        <p className="carry-label">
          Carry home: {a.carryRanges.map(rangeLabel).join(', ')} · replaces new work
        </p>
      )}
      <div className="assignment-quantities">
        <span>
          <b>{a.newPackets}</b> new packets · <b>{a.newSheets}</b> new sheets
        </span>
        <span>
          <b>{a.targetSheets}</b> total outgoing sheets · {a.homeworkDays.length} homework days
        </span>
      </div>
      {a.capped && (
        <p className="warning-line">Absence workload capped. Instructor must review quantities.</p>
      )}
      {a.blocked.map((b) => (
        <p className="warning-line" key={b}>
          {b}
        </p>
      ))}
      {a.stale && (
        <p className="warning-line">
          Schedule, subject or corrections changed after approval. Review before
          pulling/distributing.
        </p>
      )}
      <div className="assignment-bottom">
        <span>
          {a.events.at(-1)?.actor} ·{' '}
          {a.events.at(-1)?.at ? time(a.events.at(-1)!.at, db.timezone) : ''}
        </span>
        <div>
          {a.stale && teacher && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void act({
                  action: 'assignment-refresh',
                  id: a.id,
                  reason: 'Instructor reviewed changed schedule and worksheet proposal',
                })
              }
            >
              Recalculate
            </button>
          )}
          {next && (!['proposed', 'approved'].includes(a.status) || teacher) && (
            <button
              className="secondary"
              disabled={busy || a.stale || a.blocked.length > 0}
              onClick={() =>
                void act({
                  action: 'assignment-status',
                  id: a.id,
                  status: next.status,
                  reason: a.capped
                    ? 'Instructor reviewed capped workload and exact worksheet identities'
                    : 'Staff reviewed worksheet workflow',
                  correcting: false,
                })
              }
            >
              <Check size={16} />
              {next.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
export function CorrectionQueue({
  db,
  act,
  busy,
  profile,
  studentId,
}: {
  db: Snapshot;
  act: Act;
  busy: boolean;
  profile: (id: string) => void;
  studentId?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [remaining, setRemaining] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const corrections = activeCorrections(db, studentId);
  const now = useNow();
  return (
    <section className="correction-list">
      {corrections.map((c) => {
        const s = db.students.find((s) => s.id === c.studentId)!;
        const age = Math.floor((now.getTime() - Date.parse(c.createdAt)) / 86400000);
        return (
          <article className="assignment-card" key={c.id}>
            <div className="assignment-top">
              <button className="plain person" onClick={() => profile(s.id)}>
                <Avatar student={s} />
                <div>
                  <b>{s.name}</b>
                  <span>
                    {c.subject} · {rangeLabel(c.range)}
                  </span>
                </div>
              </button>
              <span className="tag amber">Corrections first · {c.state}</span>
            </div>
            <p>
              {c.remaining.length} sheets outstanding · {age} days ·{' '}
              {correctionVisits(db, c.createdAt, s.id)} visits since recorded
            </p>
            <p className="muted">{c.reason}</p>
            {db.staff.role !== 'assistant' && (
              <div className="inline-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act({
                      action: 'correction-update',
                      id: c.id,
                      remaining: [],
                      state: 'complete',
                      reason: 'Instructor verified all listed corrections complete',
                    })
                  }
                >
                  <Check size={16} />
                  Corrections complete
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setEditing(c.id);
                    setRemaining(c.remaining.join(', '));
                    setReason('');
                    setError('');
                  }}
                >
                  Partial / defer
                </button>
              </div>
            )}
            {editing === c.id && (
              <form
                className="compact-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const state = (new FormData(e.currentTarget).get('state') || 'partial') as
                      'partial' | 'deferred';
                    if (
                      await act({
                        action: 'correction-update',
                        id: c.id,
                        remaining: parseWorksheets(remaining),
                        state,
                        reason,
                      })
                    )
                      setEditing(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <label>
                  Worksheets still outstanding
                  <input
                    required
                    value={remaining}
                    onChange={(e) => setRemaining(e.target.value)}
                  />
                </label>
                <label>
                  Action
                  <select name="state">
                    <option value="partial">Partially corrected</option>
                    <option value="deferred">Defer with reason</option>
                  </select>
                </label>
                <label>
                  Reason
                  <input
                    required
                    minLength={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <button className="primary" disabled={busy}>
                  Save correction update
                </button>
              </form>
            )}
          </article>
        );
      })}
      {!corrections.length && (
        <Empty
          title="Corrections are clear"
          text="New correction sets will appear here before classwork."
        />
      )}
    </section>
  );
}
export function VacationHint({ db, id }: { db: Snapshot; id: string }) {
  const d = lastVisitBeforeVacation(db.operations!, id, dayKey(new Date(), db.timezone));
  return d ? (
    <p className="warning-line">
      <CalendarDays size={16} />
      Last expected visit before vacation: {d}. Review the capped paper workload before departure.
    </p>
  ) : null;
}
