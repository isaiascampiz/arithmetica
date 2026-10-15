'use client';
import { useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { ArrowLeft, Edit3, QrCode } from 'lucide-react';
import { isOpenVisit, type Snapshot, type Student, type Visit } from '@/lib/model';
import { recurring, zonedTimestamp } from '@/lib/schedule';
import { matchVisit, measuredMinutes } from '@/lib/v3-analytics';
import type { Subject } from '@/lib/v2-model';
import type { V2Command } from '@/lib/v2-domain';
import { Medals, Modal, type V3Act } from './v3-shared';
import { ProgressCharts } from './v3-charts';
import { time, date, Empty, useNow } from './shared-ui';
const days = ['Mon', 'Tue', 'Wed', 'Thu'];
export function StudentProfileV3({
  db,
  student: s,
  act,
  legacyAct,
  busy,
  error,
  back,
  quick,
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
    [qr, setQr] = useState('');
  const op = db.operations!,
    cfg = op.students[s.id],
    teacher = db.staff.role !== 'assistant';
  const visits = db.visits
    .filter((v) => v.studentId === s.id)
    .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));
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
        <div>
          <h1>
            {s.name}
            <Medals db={db} student={s} />
          </h1>
          <span>
            {cfg.active ? 'Active' : 'Inactive'} · {s.earlyLearner ? 'Early learner' : 'Student'} ·
            Stable ID {s.id}
          </span>
        </div>
        {teacher && (
          <button className="secondary" onClick={() => setEdit(true)}>
            <Edit3 size={17} />
            Edit Student
          </button>
        )}
      </div>
      <div className="segmented profile-sections">
        {['Overview', 'Progress', 'Visit History'].map((t) => (
          <button className={tab === t ? 'selected' : ''} onClick={() => setTab(t)} key={t}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Overview' && (
        <section className="panel overview-v3">
          <dl>
            <div>
              <dt>Enrollment date</dt>
              <dd>{cfg.enrollmentDate || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Time enrolled</dt>
              <dd>{months === null ? 'Not recorded' : months + ' months'}</dd>
            </div>
            <div>
              <dt>Regular visits</dt>
              <dd>
                {recurring(op, cfg)
                  .map((d) => days[d - 1])
                  .join(' · ') || 'Not configured'}
              </dd>
            </div>
            <div>
              <dt>Early learner</dt>
              <dd>{s.earlyLearner ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
          {cfg.awayUntil && (
            <p className="physical-instruction">
              Away Until {cfg.awayUntil} · regular days retained
            </p>
          )}
          {(['Math', 'Reading'] as Subject[])
            .filter((sub) => cfg.subjects[sub].enrolled)
            .map((sub) => {
              const c = cfg.subjects[sub];
              return (
                <div className="overview-subject" key={sub}>
                  <h2>
                    {sub}
                    <span className="mode-tag">{c.format === 'Paper' ? 'PAPER' : 'CONNECT'}</span>
                  </h2>
                  {c.format === 'Paper' ? (
                    <p>
                      Current {c.level}
                      {c.currentStart}–{c.currentEnd} · Upcoming {c.level}
                      {c.nextStart}
                      <br />
                      {c.packetsPerDay} packets / homework day · {c.sheetsPerPacket} worksheets /
                      packet
                    </p>
                  ) : (
                    <p>Assignments and academic progression are managed in Kumon Connect.</p>
                  )}
                </div>
              );
            })}
          {cfg.goals && <p>Focus: {cfg.goals}</p>}
          <button
            className="text-button"
            onClick={() => void QRCode.toDataURL(s.token, { width: 220, margin: 2 }).then(setQr)}
          >
            <QrCode size={17} />
            Show pouch QR
          </button>
          {qr && (
            <div className="profile-qr">
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
          {teacher && (
            <button
              className="text-button"
              disabled={busy || visits.some(isOpenVisit)}
              onClick={() =>
                void legacyAct({ action: 'student-active', studentId: s.id, active: !cfg.active })
              }
            >
              {cfg.active ? 'Withdraw student' : 'Reactivate student'}
            </button>
          )}
          <p className="small muted">
            Attendance and historical records remain when enrollment changes.
          </p>
        </section>
      )}
      {tab === 'Progress' && <ProgressCharts db={db} student={s} />}
      {tab === 'Visit History' && (
        <div className="visit-timeline">
          {visits.map((v) => {
            const notes = db.observations.filter(
                (o) =>
                  o.studentId === s.id && matchVisit(db, s.id, o.createdAt, o.visitId)?.id === v.id,
              ),
              evals = op.evaluations.filter(
                (e) => e.studentId === s.id && matchVisit(db, s.id, e.createdAt)?.id === v.id,
              ),
              decisions = op.decisions.filter(
                (d) => d.studentId === s.id && matchVisit(db, s.id, d.createdAt)?.id === v.id,
              ),
              minutes = measuredMinutes(v),
              issued = op.assignments.filter((a) => a.v3?.visitId === v.id);
            return (
              <article className="panel visit-entry" key={v.id}>
                <header>
                  <div>
                    <h2>
                      {date(v.arrivedAt, db.timezone)} · {time(v.arrivedAt, db.timezone)}
                    </h2>
                    <p>
                      {v.departedAt
                        ? 'Departed ' + time(v.departedAt, db.timezone)
                        : v.closedAt
                          ? 'Departure unverified'
                          : 'Physically here'}{' '}
                      · {minutes === null ? 'Duration unverified' : Math.round(minutes) + ' min'}
                    </p>
                  </div>
                  {teacher && (
                    <button className="secondary" onClick={() => quick(v)}>
                      Visit note / Quick View
                    </button>
                  )}
                </header>
                <small>Session {v.id}</small>
                <p>
                  {v.handoff
                    ? 'Handoff complete · ' +
                      v.handoff.actor +
                      ' · ' +
                      time(v.handoff.at, db.timezone)
                    : 'Instructor handoff not recorded'}
                </p>
                {v.handoff && (
                  <p>
                    {Object.entries(v.handoff.activities)
                      .map(([sub, activity]) => sub + ': ' + activity)
                      .join(' · ')}{' '}
                    · Incoming: {v.handoff.incoming}
                  </p>
                )}
                {issued.map((a) => (
                  <p key={a.id}>
                    {a.subject} issued:{' '}
                    {a
                      .v3!.issued.map((p) => p.range.level + p.range.start + '–' + p.range.end)
                      .join(', ') || 'No outgoing paper'}
                    {a.v3!.held.length
                      ? ' · Held: ' +
                        a
                          .v3!.held.map((p) => p.range.level + p.range.start + '–' + p.range.end)
                          .join(', ')
                      : ''}
                  </p>
                ))}
                {!notes.length && !evals.length && (
                  <p className="muted">No observations recorded</p>
                )}
                {notes.map((o) => (
                  <div className="history-note" key={o.id}>
                    <b>{o.choices.join(' · ') || 'Instructor note'}</b>
                    <p>{o.text}</p>
                    <small>
                      {o.author} · {time(o.createdAt, db.timezone)}
                      {o.followUp ? ' · Follow-up' : ''}
                      {o.reviewedAt ? ' · Reviewed by ' + o.reviewedBy : ''}
                    </small>
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
                {evals.map((e) => (
                  <div className="history-note" key={e.id}>
                    <b>{e.subject} · historical evaluation</b>
                    <p>
                      {Object.entries(e.ratings)
                        .filter(([, r]) => r !== 'Not assessed')
                        .map(([d, r]) => d + ': ' + r)
                        .join(' · ') || 'Not assessed'}
                    </p>
                    <p>{e.text}</p>
                    <small>{e.author}</small>
                  </div>
                ))}
                {decisions.map((d) => (
                  <p key={d.id}>
                    {d.subject} · {d.kind} · {d.range.level}
                    {d.range.start}–{d.range.end} · {d.note}
                  </p>
                ))}
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
              title="No attended sessions"
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
      {edit && (
        <EditStudent
          db={db}
          student={s}
          act={act}
          legacyAct={legacyAct}
          busy={busy}
          error={error}
          close={() => setEdit(false)}
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
}: {
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
        awayUntil: until || null,
        visitDays: cfg.visitDays || cfg.recurringDays,
        tiles: tiles
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 6),
        goals: cfg.goals || '',
        arrivalWindow: cfg.arrivalWindow || '',
      })
    )
      close();
  }
  return (
    <Modal
      title="Edit Student"
      close={close}
      footer={
        <button className="primary" disabled={busy} onClick={() => void save()}>
          Save Student
        </button>
      }
    >
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
      {(['Math', 'Reading'] as Subject[]).map((sub) => {
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
        <button className="text-button" disabled={busy} onClick={() => setUntil('')}>
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
            <input type="date" value={medalDate} onChange={(e) => setMedalDate(e.target.value)} />
          </label>
          <label>
            Verification evidence
            <input value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          </label>
        </div>
        <button
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
