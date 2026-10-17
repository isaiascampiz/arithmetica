'use client';
import { useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { ArrowLeft, Edit3, QrCode } from 'lucide-react';
import { dayKey, isOpenVisit, type Snapshot, type Student, type Visit } from '@/lib/model';
import { recurring, zonedTimestamp } from '@/lib/schedule';
import { matchVisit, measuredMinutes } from '@/lib/v3-analytics';
import type { Subject, StudentSettings } from '@/lib/v2-model';
import type { V2Command } from '@/lib/v2-domain';
import { Medals, type V3Act } from './v3-shared';
import { ProgressCharts } from './v3-charts';
import { time, date, Empty, useNow, Avatar } from './shared-ui';
import { SessionHistory } from './v3-session-history';
const days = ['Mon', 'Tue', 'Wed', 'Thu'];
export function StudentProfileV3({
  db,
  student: s,
  act,
  legacyAct,
  busy,
  error,
  back,
  review,
}: {
  db: Snapshot;
  student: Student;
  act: V3Act;
  legacyAct: (c: V2Command) => Promise<boolean>;
  busy: boolean;
  error: string;
  back: () => void;
  quick: (v: Visit) => void;
  review: (id: string) => Promise<boolean>;
}) {
  const [tab, setTab] = useState('Overview'),
    [edit, setEdit] = useState(false),
    [more, setMore] = useState(false),
    [session, setSession] = useState<string | null>(null),
    [visitDate, setVisitDate] = useState(''),
    [visitSort, setVisitSort] = useState('newest'),
    [filtersOpen, setFiltersOpen] = useState(false),
    [qr, setQr] = useState('');
  const op = db.operations!,
    cfg = op.students[s.id],
    teacher = db.staff.role !== 'assistant';
  const visits = db.visits
    .filter(
      (v) => v.studentId === s.id && (!visitDate || dayKey(v.arrivedAt, db.timezone) === visitDate),
    )
    .sort((a, b) => {
      if (visitSort === 'longest' || visitSort === 'shortest') {
        const x = measuredMinutes(a),
          y = measuredMinutes(b);
        if (x === null || y === null)
          return x === y ? b.arrivedAt.localeCompare(a.arrivedAt) : x === null ? 1 : -1;
        return (visitSort === 'longest' ? y - x : x - y) || b.arrivedAt.localeCompare(a.arrivedAt);
      }
      return visitSort === 'oldest'
        ? a.arrivedAt.localeCompare(b.arrivedAt)
        : b.arrivedAt.localeCompare(a.arrivedAt);
    });
  const orphanNotes = db.observations.filter(
    (o) => o.studentId === s.id && !matchVisit(db, s.id, o.createdAt, o.visitId),
  );
  const orphanEval = op.evaluations.filter(
    (e) => e.studentId === s.id && !matchVisit(db, s.id, e.createdAt),
  );
  const now = useNow();
  const months = cfg.enrollmentDate
    ? Math.max(
        0,
        Math.floor(
          (now.getTime() - Date.parse(cfg.enrollmentDate + 'T12:00:00Z')) / (86400000 * 30.44),
        ),
      )
    : null;
  return (
    <div className="profile-v3">
      <div className="profile-v3-heading">
        <button className="icon-button" aria-label="Back to Student Roster" onClick={back}>
          <ArrowLeft size={21} />
        </button>
        <Avatar student={s} />
        <div>
          <h1>
            {s.name}
            <Medals db={db} student={s} />
          </h1>
          <span>
            {cfg.active ? 'Enrolled' : 'Not enrolled'} ·{' '}
            {s.earlyLearner ? 'Early learner' : 'Student'} · Student ID {s.id}
          </span>
        </div>
        <div className="overview-pouch" role="group" aria-label="Pouch identifier">
          <button
            className="text-button"
            onClick={() => void QRCode.toDataURL(s.token, { width: 220, margin: 2 }).then(setQr)}
          >
            <QrCode size={17} />
            Show pouch identifier
          </button>
          {qr && (
            <div className="profile-qr">
              <button type="button" className="text-button" onClick={() => setQr('')}>
                Hide pouch identifier
              </button>
              <Image src={qr} width={220} height={220} alt={'Pouch QR for ' + s.name} />
              <code>{s.token}</code>
              {teacher && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await legacyAct({
                        action: 'qr-reissue',
                        studentId: s.id,
                        reason: 'Staff reissued identifier from V3 profile',
                      })
                    )
                      setQr('');
                  }}
                >
                  Reissue QR identifier
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="segmented profile-sections">
        {['Overview', 'Progress', 'Visit History'].map((t) => (
          <button className={tab === t ? 'selected' : ''} onClick={() => setTab(t)} key={t}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Overview' && (
        <div className="overview-v3 overview-layout">
          <section
            className="panel overview-card overview-student"
            aria-label="Student information"
          >
            <div className="profile-section-heading">
              <h2>Student information</h2>
              {teacher && !edit && (
                <button className="text-button" disabled={busy} onClick={() => setEdit(true)}>
                  <Edit3 size={14} />
                  Edit student information
                </button>
              )}
            </div>
            <StudentDetails
              key={s.id + String(edit)}
              db={db}
              student={s}
              editing={edit}
              act={act}
              busy={busy}
              error={error}
              months={months}
              close={() => setEdit(false)}
            />
            {teacher && (
              <button
                className="text-button profile-status-action"
                disabled={busy || db.visits.some((v) => v.studentId === s.id && isOpenVisit(v))}
                onClick={() =>
                  void legacyAct({
                    action: 'student-active',
                    studentId: s.id,
                    active: !cfg.active,
                  })
                }
              >
                {cfg.active ? 'Withdraw student' : 'Reactivate student'}
              </button>
            )}
          </section>
          <OverviewSubjects
            key={s.id}
            db={db}
            student={s}
            act={act}
            legacyAct={legacyAct}
            busy={busy}
            error={error}
          />
          <div className="profile-utilities">
            {' '}
            {teacher && (
              <div className="profile-other-settings">
                {more ? (
                  <EditStudent
                    db={db}
                    student={s}
                    act={act}
                    legacyAct={legacyAct}
                    busy={busy}
                    error={error}
                    section="more"
                    close={() => setMore(false)}
                  />
                ) : (
                  <button className="text-button" disabled={busy} onClick={() => setMore(true)}>
                    Other student settings
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {tab === 'Progress' && <ProgressCharts db={db} student={s} />}
      {tab === 'Visit History' && (
        <div className="visit-timeline">
          <div className="visit-history-toolbar">
            <button
              type="button"
              className="secondary"
              aria-expanded={filtersOpen}
              aria-controls="visit-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              Filter &amp; sort
            </button>
            <div
              id="visit-filters"
              hidden={!filtersOpen}
              className="visit-history-controls visit-history-dropdown"
            >
              <h3>Filter &amp; sort</h3>
              <label>
                Visit date
                <input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                />
              </label>
              <button
                className="text-button"
                disabled={!visitDate}
                onClick={() => setVisitDate('')}
              >
                Clear date
              </button>
              <label>
                Sort visits
                <select value={visitSort} onChange={(e) => setVisitSort(e.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="longest">Longest visit</option>
                  <option value="shortest">Shortest visit</option>
                </select>
              </label>
            </div>
          </div>
          {visits.map((v) => {
            const notes = db.observations.filter(
              (o) =>
                o.studentId === s.id && matchVisit(db, s.id, o.createdAt, o.visitId)?.id === v.id,
            );
            const ratings = notes
              .filter((o) => o.context !== 'additional')
              .reduce(
                (n, o) => n + (o.revisions?.at(-1)?.skillRatings || o.skillRatings || []).length,
                0,
              );
            const minutes = measuredMinutes(v);
            return (
              <article className="panel visit-entry" key={v.id} data-history-visit={v.id}>
                <header>
                  <h2>
                    {new Intl.DateTimeFormat('en-US', {
                      timeZone: db.timezone,
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    }).format(new Date(v.arrivedAt))}
                  </h2>
                </header>
                <dl className="visit-summary">
                  <div>
                    <dt>Checked in</dt>
                    <dd>{time(v.arrivedAt, db.timezone)}</dd>
                  </div>
                  <div>
                    <dt>Checked out</dt>
                    <dd>
                      {v.departedAt && v.departureVerified !== false
                        ? time(v.departedAt, db.timezone)
                        : v.closedAt || v.departedAt
                          ? 'Departure unverified'
                          : 'Physically here'}
                    </dd>
                  </div>
                  <div>
                    <dt>Visit duration</dt>
                    <dd>
                      {minutes === null ? 'Duration unverified' : Math.round(minutes) + ' minutes'}
                    </dd>
                  </div>
                  <div>
                    <dt>Observations</dt>
                    <dd>{ratings > 0 || notes.some((o) => o.choices.length) ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt>Note</dt>
                    <dd>
                      {notes.some((o) => (o.revisions?.at(-1)?.text ?? o.text).trim())
                        ? 'Yes'
                        : 'No'}
                    </dd>
                  </div>
                </dl>
                <button className="secondary" onClick={() => setSession(v.id)}>
                  View session
                </button>
                {teacher && v.closedAt && !v.departureVerified && (
                  <details>
                    <summary>Reconcile unverified departure</summary>
                    <Reconcile visit={v} db={db} act={legacyAct} busy={busy} />
                  </details>
                )}
              </article>
            );
          })}
          {!visits.length && (
            <Empty
              title={visitDate ? 'No visits on this date' : 'No attended sessions'}
              text="Every attendance session will appear here, even without observations."
            />
          )}
          {(orphanNotes.length > 0 || orphanEval.length > 0) && (
            <section className="panel historical-v3">
              <h2>Dated historical entries</h2>
              <p className="small muted">No unique visit match; original records retained.</p>
              {orphanNotes.map((o) => (
                <div className="history-note" key={o.id}>
                  <small>
                    {date(o.createdAt, db.timezone)} · {o.author}
                  </small>
                  <b>{o.choices.join(' · ')}</b>
                  <p>{o.text}</p>
                  {teacher && !o.reviewedAt && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void review(o.id)}
                    >
                      Mark reviewed
                    </button>
                  )}
                </div>
              ))}
              {orphanEval.map((e) => (
                <div className="history-note" key={e.id}>
                  {date(e.createdAt, db.timezone)} · {e.subject} · {e.text}
                </div>
              ))}
            </section>
          )}
          <details className="panel historical-v3">
            <summary>Preserved V1/V2 worksheet and decision history</summary>
            {db.homework
              .filter((h) => h.studentId === s.id)
              .map((h) => (
                <p key={h.id}>
                  {date(h.createdAt, db.timezone)} · {h.description} · {h.status}
                </p>
              ))}
            {op.assignments
              .filter((a) => a.studentId === s.id && !a.v3)
              .map((a) => (
                <p key={a.id}>
                  {a.fromDate} · {a.subject} ·{' '}
                  {a.ranges.map((r) => r.level + r.start + '–' + r.end).join(', ')} · {a.status}
                </p>
              ))}
            {op.corrections
              .filter((c) => c.studentId === s.id)
              .map((c) => (
                <p key={c.id}>
                  Historical corrections · {c.subject} · {c.range.level}
                  {c.range.start}–{c.range.end} · {c.state}
                </p>
              ))}
            {op.classwork
              .filter((c) => c.studentId === s.id)
              .map((c) => (
                <p key={c.id}>
                  Historical classwork · {c.subject} · {c.range.level}
                  {c.range.start}–{c.range.end} · {c.completed.length} recorded
                </p>
              ))}
            {op.decisions
              .filter((d) => d.studentId === s.id && !matchVisit(db, s.id, d.createdAt))
              .map((d) => (
                <p key={d.id}>
                  {date(d.createdAt, db.timezone)} · {d.subject} · {d.kind} · {d.note}
                </p>
              ))}
          </details>
        </div>
      )}
      {session && db.visits.some((v) => v.id === session) && (
        <SessionHistory
          db={db}
          visit={db.visits.find((v) => v.id === session)!}
          act={act}
          busy={busy}
          review={review}
          error={error}
          close={() => setSession(null)}
        />
      )}
    </div>
  );
}
function Reconcile({
  visit,
  db,
  act,
  busy,
}: {
  visit: Visit;
  db: Snapshot;
  act: (c: V2Command) => Promise<boolean>;
  busy: boolean;
}) {
  const [stamp, setStamp] = useState(''),
    [reason, setReason] = useState('');
  return (
    <div className="form-grid">
      <label>
        Actual departure (center time)
        <input type="datetime-local" value={stamp} onChange={(e) => setStamp(e.target.value)} />
      </label>
      <label>
        Reconciliation reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button
        className="secondary"
        disabled={busy || !stamp || reason.length < 3}
        onClick={() =>
          void act({
            action: 'visit-reconcile',
            id: visit.id,
            mode: 'verify',
            departedAt: zonedTimestamp(stamp.slice(0, 10), stamp.slice(11, 16), db.timezone),
            reason,
          })
        }
      >
        Verify actual departure
      </button>
      <button
        className="text-button"
        disabled={busy || reason.length < 3}
        onClick={() =>
          void act({ action: 'visit-reconcile', id: visit.id, mode: 'reopen', reason })
        }
      >
        Reopen unresolved visit
      </button>
    </div>
  );
}
function EditStudent({
  db,
  student: s,
  act,
  legacyAct,
  busy,
  error,
  close,
  section,
}: {
  section: 'student' | 'more' | Subject;
  db: Snapshot;
  student: Student;
  act: V3Act;
  legacyAct: (c: V2Command) => Promise<boolean>;
  busy: boolean;
  error: string;
  close: () => void;
}) {
  const original = db.operations!.students[s.id];
  const [cfg, setCfg] = useState(() => structuredClone(original)),
    [name, setName] = useState(s.name),
    [early, setEarly] = useState(s.earlyLearner),
    [tiles, setTiles] = useState((cfg.observationTiles || []).join(', ')),
    [until, setUntil] = useState(cfg.awayUntil || ''),
    [medalSubject, setMedalSubject] = useState<Subject>('Math'),
    [medal, setMedal] = useState<'Bronze' | 'Silver' | 'Gold' | 'Platinum'>('Bronze'),
    [medalDate, setMedalDate] = useState(new Date().toISOString().slice(0, 10)),
    [evidence, setEvidence] = useState('');
  async function save() {
    if (
      await act({
        action: 'student-save',
        studentId: s.id,
        name,
        earlyLearner: early,
        settings: cfg,
        enrollmentDate: cfg.enrollmentDate || null,
        ...(section === 'more' ? { awayUntil: until || null } : {}),
        visitDays: cfg.visitDays || cfg.recurringDays,
        tiles:
          section === 'more'
            ? tiles
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 6)
            : original.observationTiles || [],
        goals: cfg.goals || '',
        arrivalWindow: cfg.arrivalWindow || '',
      })
    )
      close();
  }
  return (
    <form
      className="profile-inline-editor"
      aria-label={
        section === 'student'
          ? 'Edit student information'
          : section === 'more'
            ? 'Other student settings'
            : 'Edit ' + section
      }
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {section === 'student' && (
        <>
          <div className="form-grid">
            <label>
              Student name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
            <label>
              Enrollment date
              <input
                type="date"
                value={cfg.enrollmentDate || ''}
                onChange={(e) => setCfg({ ...cfg, enrollmentDate: e.target.value || null })}
              />
            </label>
            <label className="check-label">
              <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} />
              Early learner
            </label>
            <label>
              Expected visit minutes
              <input
                type="number"
                min={5}
                max={240}
                value={cfg.expectedMinutes}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    expectedMinutes: Number(e.target.value),
                    expectedMinutesOverride: true,
                  })
                }
              />
            </label>
          </div>
          <fieldset>
            <legend>Regular visit weekdays</legend>
            <div className="day-options">
              {days.map((d, i) => (
                <label key={d}>
                  <input
                    type="checkbox"
                    checked={(cfg.visitDays || cfg.recurringDays).includes(i + 1)}
                    onChange={(e) =>
                      setCfg({
                        ...cfg,
                        visitDays: e.target.checked
                          ? [...(cfg.visitDays || cfg.recurringDays), i + 1]
                          : (cfg.visitDays || cfg.recurringDays).filter((n) => n !== i + 1),
                      })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      {(section === 'Math' || section === 'Reading') && (
        <p className="small muted">
          Saving a new level or worksheet position updates the ongoing plan.
        </p>
      )}
      {(['Math', 'Reading'] as Subject[])
        .filter((sub) => section === sub)
        .map((sub) => {
          const c = cfg.subjects[sub],
            patch = (p: Partial<typeof c>) =>
              setCfg({ ...cfg, subjects: { ...cfg.subjects, [sub]: { ...c, ...p } } });
          return (
            <fieldset key={sub}>
              <legend>{sub}</legend>
              <div className="form-grid">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={c.enrolled}
                    onChange={(e) => patch({ enrolled: e.target.checked })}
                  />
                  Enrolled in {sub}
                </label>
                {c.enrolled && (
                  <label>
                    {sub} learning mode
                    <select
                      value={c.format}
                      onChange={(e) => patch({ format: e.target.value as 'Paper' | 'CONNECT' })}
                    >
                      <option value="Paper">PAPER</option>
                      <option value="CONNECT">Kumon CONNECT</option>
                    </select>
                  </label>
                )}
              </div>
              {c.enrolled && c.format === 'Paper' && (
                <div className="form-grid">
                  <label>
                    {sub} current level
                    <input
                      value={c.level}
                      maxLength={20}
                      onChange={(e) => patch({ level: e.target.value })}
                    />
                  </label>
                  <label>
                    {sub} next planned worksheet
                    <input
                      type="number"
                      min={1}
                      value={c.nextStart}
                      onChange={(e) => patch({ nextStart: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    {sub} current worksheet
                    <input
                      type="number"
                      min={1}
                      value={c.currentStart}
                      onChange={(e) =>
                        patch({
                          currentStart: Number(e.target.value),
                          currentEnd: Math.max(c.currentEnd, Number(e.target.value)),
                        })
                      }
                    />
                  </label>
                  <label>
                    {sub} packets per homework day
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={c.packetsPerDay}
                      onChange={(e) => patch({ packetsPerDay: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    {sub} worksheets per packet
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={c.sheetsPerPacket}
                      onChange={(e) =>
                        patch({
                          sheetsPerPacket: Number(e.target.value),
                          classworkSheets: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </fieldset>
          );
        })}
      {section === 'more' && (
        <>
          <label>
            Expected arrival window (optional)
            <input
              value={cfg.arrivalWindow || ''}
              onChange={(e) => setCfg({ ...cfg, arrivalWindow: e.target.value })}
            />
          </label>
          <label>
            Student-specific goals
            <input
              value={cfg.goals || ''}
              maxLength={400}
              onChange={(e) => setCfg({ ...cfg, goals: e.target.value })}
            />
          </label>
          <label>
            Student observation shortcuts (comma-separated)
            <input value={tiles} onChange={(e) => setTiles(e.target.value)} />
          </label>
          <fieldset>
            <legend>Away Until</legend>
            <label>
              First expected return date
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setUntil('')}
            >
              Clear pause (saved with Student)
            </button>
          </fieldset>
          <fieldset>
            <legend>Manually verified achievement</legend>
            <Medals db={db} student={s} />
            <div className="form-grid">
              <label>
                Medal subject
                <select
                  value={medalSubject}
                  onChange={(e) => setMedalSubject(e.target.value as Subject)}
                >
                  <option>Math</option>
                  <option>Reading</option>
                </select>
              </label>
              <label>
                Medal
                <select value={medal} onChange={(e) => setMedal(e.target.value as typeof medal)}>
                  {['Bronze', 'Silver', 'Gold', 'Platinum'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Achievement date
                <input
                  type="date"
                  value={medalDate}
                  onChange={(e) => setMedalDate(e.target.value)}
                />
              </label>
              <label>
                Verification evidence
                <input value={evidence} onChange={(e) => setEvidence(e.target.value)} />
              </label>
            </div>
            <button
              type="button"
              className="secondary"
              disabled={busy || evidence.length < 3}
              onClick={() =>
                void legacyAct({
                  action: 'achievement',
                  studentId: s.id,
                  subject: medalSubject,
                  distinction: medal,
                  date: medalDate,
                  evidence,
                })
              }
            >
              Record verified medal
            </button>
          </fieldset>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="profile-editor-actions">
        <button type="button" className="text-button" disabled={busy} onClick={close}>
          Cancel
        </button>
        <button className="secondary" type="submit" disabled={busy}>
          {busy
            ? 'Saving...'
            : section === 'student'
              ? 'Save student information'
              : section === 'more'
                ? 'Save settings'
                : 'Save ' + section}
        </button>
      </div>
    </form>
  );
}

function OverviewSubjects({
  db,
  student,
  act,
  legacyAct,
  busy,
  error,
}: {
  db: Snapshot;
  student: Student;
  act: V3Act;
  legacyAct: (c: V2Command) => Promise<boolean>;
  busy: boolean;
  error: string;
}) {
  const cfg = db.operations!.students[student.id];
  const [editing, setEditing] = useState<Subject | null>(null);
  const subjects = (['Math', 'Reading'] as Subject[]).filter(
    (sub) => cfg.subjects[sub].enrolled || editing === sub,
  );
  return (
    <section className="panel overview-card overview-subjects" aria-label="Subjects">
      <h2>Subjects</h2>
      {subjects.map((sub) => {
        const c = cfg.subjects[sub];
        return (
          <div className="overview-subject-panel" key={sub} role="region" aria-label={sub}>
            <div className="profile-subject-heading">
              <h3>{sub}</h3>
              {db.staff.role !== 'assistant' && !editing && (
                <button className="text-button" disabled={busy} onClick={() => setEditing(sub)}>
                  Edit {sub}
                </button>
              )}
            </div>
            {editing === sub ? (
              <EditStudent
                key={sub}
                db={db}
                student={student}
                act={act}
                legacyAct={legacyAct}
                busy={busy}
                error={error}
                section={sub}
                close={() => setEditing(null)}
              />
            ) : (
              <>
                <dl>
                  <div>
                    <dt>Learning format</dt>
                    <dd>{c.format === 'CONNECT' ? 'Kumon CONNECT' : 'PAPER'}</dd>
                  </div>
                  <div>
                    <dt>Starting level</dt>
                    <dd>Not recorded</dd>
                  </div>
                  <div>
                    <dt>Current level</dt>
                    <dd>{c.level || 'Not recorded'}</dd>
                  </div>
                  {c.format === 'Paper' && (
                    <>
                      <div>
                        <dt>Packets per homework day</dt>
                        <dd>{c.packetsPerDay}</dd>
                      </div>
                      <div>
                        <dt>Worksheets per packet</dt>
                        <dd>{c.sheetsPerPacket}</dd>
                      </div>
                      <div>
                        <dt>Planned worksheets per homework day</dt>
                        <dd>{c.packetsPerDay * c.sheetsPerPacket}</dd>
                      </div>
                    </>
                  )}
                </dl>
                {c.format === 'CONNECT' && (
                  <p className="small muted">
                    Assignments and academic progression are managed in Kumon CONNECT.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
      {!subjects.length && <p className="muted">No enrolled subjects recorded.</p>}
      {db.staff.role !== 'assistant' && !editing && (
        <div className="profile-add-subject">
          {(['Math', 'Reading'] as Subject[])
            .filter((sub) => !cfg.subjects[sub].enrolled)
            .map((sub) => (
              <button
                type="button"
                key={sub}
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setEditing(sub);
                }}
              >
                Add {sub}
              </button>
            ))}
        </div>
      )}
      {cfg.goals && <p className="overview-goal">Focus: {cfg.goals}</p>}
    </section>
  );
}

function StudentDetails({
  db,
  student,
  editing,
  act,
  busy,
  error,
  months,
  close,
}: {
  db: Snapshot;
  student: Student;
  editing: boolean;
  act: V3Act;
  busy: boolean;
  error: string;
  months: number | null;
  close: () => void;
}) {
  const original = db.operations!.students[student.id];
  const [cfg, setCfg] = useState<StudentSettings>(() => structuredClone(original));
  const [name, setName] = useState(student.name);
  const [early, setEarly] = useState(student.earlyLearner);
  const weekdays = cfg.visitDays || recurring(db.operations!, cfg);
  async function save() {
    if (
      await act({
        action: 'student-save',
        studentId: student.id,
        name,
        earlyLearner: early,
        settings: cfg,
        enrollmentDate: cfg.enrollmentDate || null,
        visitDays: weekdays,
        tiles: original.observationTiles || [],
        goals: original.goals || '',
        arrivalWindow: original.arrivalWindow || '',
      })
    )
      close();
  }
  return (
    <form
      className="profile-student-details"
      aria-label={editing ? 'Edit student information' : 'Student details'}
      onSubmit={(e) => {
        e.preventDefault();
        if (editing) void save();
      }}
    >
      <dl>
        <div>
          <dt>Student name</dt>
          <dd>
            {editing ? (
              <input
                aria-label="Student name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            ) : (
              student.name
            )}
          </dd>
        </div>
        <div>
          <dt>Enrollment date</dt>
          <dd>
            {editing ? (
              <input
                aria-label="Enrollment date"
                type="date"
                value={cfg.enrollmentDate || ''}
                onChange={(e) => setCfg({ ...cfg, enrollmentDate: e.target.value || null })}
              />
            ) : (
              original.enrollmentDate || 'Not recorded'
            )}
          </dd>
        </div>
        <div>
          <dt>Time enrolled</dt>
          <dd>{months === null ? 'Not recorded' : months + ' months'}</dd>
        </div>
        <div className="profile-weekday-detail">
          <dt>Regular visits</dt>
          <dd>
            {editing ? (
              <div className="day-options" role="group" aria-label="Regular visit weekdays">
                {days.map((d, i) => (
                  <label key={d}>
                    <input
                      type="checkbox"
                      checked={weekdays.includes(i + 1)}
                      onChange={(e) =>
                        setCfg({
                          ...cfg,
                          visitDays: e.target.checked
                            ? [...weekdays, i + 1]
                            : weekdays.filter((n) => n !== i + 1),
                        })
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
            ) : (
              recurring(db.operations!, original)
                .map((d) => days[d - 1])
                .join(' / ') || 'Not configured'
            )}
          </dd>
        </div>
        <div>
          <dt>Expected visit duration</dt>
          <dd>
            {editing ? (
              <input
                aria-label="Expected visit minutes"
                type="number"
                min={5}
                max={240}
                value={cfg.expectedMinutes}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    expectedMinutes: Number(e.target.value),
                    expectedMinutesOverride: true,
                  })
                }
              />
            ) : original.expectedMinutes ? (
              original.expectedMinutes + ' minutes'
            ) : (
              'Not recorded'
            )}
          </dd>
        </div>
        <div>
          <dt>Early learner</dt>
          <dd>
            {editing ? (
              <label className="profile-value-checkbox">
                <input
                  aria-label="Early learner"
                  type="checkbox"
                  checked={early}
                  onChange={(e) => setEarly(e.target.checked)}
                />
                <span>{early ? 'Yes' : 'No'}</span>
              </label>
            ) : student.earlyLearner ? (
              'Yes'
            ) : (
              'No'
            )}
          </dd>
        </div>
      </dl>
      {original.awayUntil && <p className="small muted">Away Until {original.awayUntil}</p>}
      <dl className="profile-enrollment">
        <div>
          <dt>Status</dt>
          <dd>{original.active ? 'Enrolled' : 'Not enrolled'}</dd>
        </div>
      </dl>
      {editing && (
        <>
          <div className="profile-editor-actions">
            <button type="button" className="text-button" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button type="submit" className="secondary" disabled={busy}>
              Save student information
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </form>
  );
}
