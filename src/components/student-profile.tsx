'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Edit3,
  Flag,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import type { Snapshot, Student } from '@/lib/model';
import { dayKey, isOpenVisit } from '@/lib/model';
import { dimensions, type Rating, type StudentSettings, type Subject } from '@/lib/v2-model';
import { numbers, planHomework, rangeLabel } from '@/lib/homework';
import { addDays, nextExpected, recurring, expectedMinutes } from '@/lib/schedule';
import { completionChart } from '@/lib/reports';
import { ClassworkRecords } from './classwork-records';
import { ProfileCharts } from './profile-charts';
import { Avatar, Empty, time, date, elapsed, useNow } from './shared-ui';
import {
  AssignmentCard,
  CorrectionQueue,
  DayPicker,
  NumberField,
  ScheduleForm,
  VacationHint,
  dayNames,
  parseWorksheets,
  type Act,
} from './operations-ui';
type Props = {
  student: Student;
  db: Snapshot;
  act: Act;
  busy: boolean;
  back: () => void;
  note: (s: Student) => void;
  attendance: (s: Student) => void;
};
export function StudentProfile({ student: s, db, act, busy, back, note, attendance }: Props) {
  const [tab, setTab] = useState('Overview');
  const [edit, setEdit] = useState(false);
  const [qr, setQr] = useState('');
  const now = useNow();
  const op = db.operations!,
    cfg = op.students[s.id],
    canTeach = db.staff.role !== 'assistant';
  const v = db.visits.find((v) => v.studentId === s.id && isOpenVisit(v));
  useEffect(() => {
    void QRCode.toDataURL(s.token, {
      width: 240,
      margin: 3,
      color: { dark: '#273747', light: '#ffffff' },
    }).then(setQr);
  }, [s.token]);
  return (
    <section className="student-workspace">
      <div className="profile-heading">
        <button className="icon-button" aria-label="Back to students" onClick={back}>
          <ArrowLeft size={21} />
        </button>
        <Avatar student={s} />
        <div>
          <h1>{s.name}</h1>
          <p>
            {cfg.active ? 'Active student' : 'Withdrawn · history retained'} ·{' '}
            {cfg.familyId
              ? op.families.find((f) => f.id === cfg.familyId)?.name
              : 'Individual schedule'}
          </p>
        </div>
        <div className="profile-header-actions">
          {v && (
            <span
              className={`tag ${(now.getTime() - Date.parse(v.arrivedAt)) / 60000 > expectedMinutes(op, cfg) ? 'amber' : 'green'}`}
            >
              {elapsed(v.arrivedAt)} · {expectedMinutes(op, cfg)} min expected
            </span>
          )}
          {canTeach && (
            <button className="secondary" onClick={() => note(s)}>
              <Flag size={16} />
              Quick note
            </button>
          )}
          <button className="primary" disabled={busy || !cfg.active} onClick={() => attendance(s)}>
            {v ? 'Check out' : 'Check in'}
          </button>
        </div>
      </div>
      <nav className="profile-tabs" aria-label="Student sections">
        {[
          'Overview',
          'Assignments',
          'Progress',
          ...(canTeach ? ['Evaluations', 'Notes'] : []),
          'Attendance',
          'QR code',
        ].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {tab === 'Overview' && (
        <div className="profile-grid">
          <section className="panel profile-overview">
            <div className="panel-heading">
              <div>
                <h2>Learning & attendance</h2>
                <p>Stable ID: {s.id}</p>
              </div>
              {canTeach && (
                <button className="secondary" onClick={() => setEdit((e) => !e)}>
                  <Edit3 size={16} />
                  {edit ? 'Close editing' : 'Edit profile'}
                </button>
              )}
            </div>
            {edit ? (
              <ProfileEditor
                key={s.id}
                s={s}
                db={db}
                act={act}
                busy={busy}
                done={() => setEdit(false)}
              />
            ) : (
              <>
                <div className="profile-facts">
                  <div>
                    <span>Attendance days</span>
                    <b>
                      {recurring(op, cfg)
                        .map((d) => dayNames[d])
                        .join(' · ') || 'No recurring days'}
                    </b>
                  </div>
                  <div>
                    <span>Next expected visit</span>
                    <b>
                      {nextExpected(op, s.id, dayKey(new Date(), db.timezone), true) ||
                        'Not scheduled'}
                    </b>
                  </div>
                  <div>
                    <span>Expected duration</span>
                    <b>{expectedMinutes(op, cfg)} minutes</b>
                  </div>
                  <div>
                    <span>Early learner</span>
                    <b>{s.earlyLearner ? 'Yes · individual support' : 'No'}</b>
                  </div>
                </div>
                <div className="subject-overviews">
                  {(['Math', 'Reading'] as Subject[]).map((sub) => {
                    const c = cfg.subjects[sub];
                    return (
                      <button
                        key={sub}
                        className="subject-summary"
                        onClick={() => setTab('Assignments')}
                      >
                        <span className="settings-icon">
                          <BookOpen size={21} />
                        </span>
                        <div>
                          <b>{sub}</b>
                          <span>
                            {c.enrolled
                              ? `${c.format} · ${rangeLabel({ level: c.level, start: c.currentStart, end: c.currentEnd })}`
                              : 'Not enrolled'}
                          </span>
                        </div>
                        <span>
                          {c.enrolled ? `${c.packetsPerDay} × ${c.sheetsPerPacket} sheets/day` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <VacationHint db={db} id={s.id} />
                {canTeach && (
                  <div className="inline-actions profile-admin">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void act({ action: 'student-active', studentId: s.id, active: !cfg.active })
                      }
                    >
                      {cfg.active ? 'Withdraw student' : 'Reactivate student'}
                    </button>
                    <span className="small muted">
                      Attendance, notes and assignments stay in the record.
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
          <ScheduleForm db={db} studentId={s.id} act={act} busy={busy} />
        </div>
      )}
      {tab === 'Assignments' && (
        <AssignmentsWorkspace
          s={s}
          db={db}
          act={act}
          busy={busy}
          editSettings={() => {
            setTab('Overview');
            setEdit(true);
          }}
          legacy={() => note(s)}
        />
      )}
      {tab === 'Progress' && <ProgressWorkspace s={s} db={db} act={act} busy={busy} />}
      {tab === 'Evaluations' && <EvaluationWorkspace s={s} db={db} act={act} busy={busy} />}
      {tab === 'Notes' && (
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <h2>Notes & follow-ups</h2>
              <p>Original V1 entries remain dated, attributed and reviewable.</p>
            </div>
            <button className="primary" onClick={() => note(s)}>
              <Plus size={17} />
              Quick observation
            </button>
          </div>
          {[...db.observations]
            .filter((o) => o.studentId === s.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((o) => (
              <article className="history-note" key={o.id}>
                <div>
                  <b>
                    {date(o.createdAt, db.timezone)} · {time(o.createdAt, db.timezone)}
                  </b>
                  <span className={`tag ${o.reviewedAt ? 'green' : 'amber'}`}>
                    {o.reviewedAt ? 'Reviewed' : 'Pending review'}
                  </span>
                </div>
                <div className="note-choices">
                  {o.choices.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
                <p>{o.text || 'Quick choices recorded.'}</p>
                <small>
                  {o.author}
                  {o.reviewedBy ? ` · reviewed by ${o.reviewedBy}` : ''}
                  {o.followUp ? ' · Follow-up flagged' : ''}
                </small>
              </article>
            ))}
          {!db.observations.some((o) => o.studentId === s.id) && (
            <Empty title="A fresh page" text="Observations and follow-ups will appear here." />
          )}
        </section>
      )}
      {tab === 'Attendance' && <AttendanceHistory s={s} db={db} act={act} busy={busy} />}
      {tab === 'QR code' && (
        <section className="panel qr-profile">
          <QrCode size={27} />
          <h2>Student pouch identifier</h2>
          <p>Private bearer code. Reissuing immediately invalidates the previous code.</p>
          {qr && (
            <Image unoptimized src={qr} width={240} height={240} alt={`Pouch QR for ${s.name}`} />
          )}
          <code>{s.token}</code>
          {canTeach && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act({
                  action: 'qr-reissue',
                  studentId: s.id,
                  reason: 'Instructor requested replacement pouch identifier',
                })
              }
            >
              <RefreshCw size={16} />
              Reissue QR identifier
            </button>
          )}
        </section>
      )}
    </section>
  );
}
function ProfileEditor({
  s,
  db,
  act,
  busy,
  done,
}: {
  s: Student;
  db: Snapshot;
  act: Act;
  busy: boolean;
  done: () => void;
}) {
  const [name, setName] = useState(s.name);
  const [early, setEarly] = useState(s.earlyLearner);
  const [c, setC] = useState<StudentSettings>(structuredClone(db.operations!.students[s.id]));
  return (
    <form
      className="compact-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await act({
            action: 'student-save',
            studentId: s.id,
            name,
            earlyLearner: early,
            settings: c,
          })
        )
          done();
      }}
    >
      <div className="form-grid">
        <label>
          Student name
          <input
            value={name}
            required
            minLength={2}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Family group
          <select
            value={c.familyId || ''}
            onChange={(e) => setC({ ...c, familyId: e.target.value || null })}
          >
            <option value="">No family group</option>
            {db.operations!.families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Expected visit minutes"
          value={c.expectedMinutes}
          min={5}
          max={240}
          onChange={(expectedMinutes) =>
            setC({ ...c, expectedMinutes, expectedMinutesOverride: true })
          }
        />
      </div>
      <div className="inline-actions">
        <label className="check-label">
          <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} />
          Early learner
        </label>
        {c.familyId && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={!c.individualSchedule}
              onChange={(e) => setC({ ...c, individualSchedule: !e.target.checked })}
            />
            Use family attendance days
          </label>
        )}
      </div>
      <DayPicker
        value={c.recurringDays}
        onChange={(recurringDays) => setC({ ...c, recurringDays })}
        label="Individual attendance days / family override"
      />
      <label className="check-label">
        <input
          type="checkbox"
          checked={!c.expectedMinutesOverride}
          onChange={(e) =>
            setC({
              ...c,
              expectedMinutesOverride: !e.target.checked,
              expectedMinutes: e.target.checked
                ? db.operations!.center.expectedMinutes
                : c.expectedMinutes,
            })
          }
        />
        Use center default visit duration
      </label>
      {(['Math', 'Reading'] as Subject[]).map((sub) => {
        const q = c.subjects[sub];
        const change = (field: keyof typeof q, value: unknown) =>
          setC({ ...c, subjects: { ...c.subjects, [sub]: { ...q, [field]: value } } });
        return (
          <fieldset className="subject-config" key={sub}>
            <legend>{sub} settings</legend>
            <div className="inline-actions">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={q.enrolled}
                  onChange={(e) => change('enrolled', e.target.checked)}
                />
                Enrolled in {sub}
              </label>
              <label>
                Format
                <select value={q.format} onChange={(e) => change('format', e.target.value)}>
                  <option>Paper</option>
                  <option>CONNECT</option>
                </select>
              </label>
              <label>
                Current level
                <input
                  value={q.level}
                  required
                  maxLength={20}
                  onChange={(e) => change('level', e.target.value)}
                />
              </label>
            </div>
            <div className="form-grid three">
              <NumberField
                label="Current range start"
                min={1}
                value={q.currentStart}
                onChange={(n) => change('currentStart', n)}
              />
              <NumberField
                label="Current range end"
                min={1}
                value={q.currentEnd}
                onChange={(n) => change('currentEnd', n)}
              />
              <NumberField
                label="Next worksheet starts at"
                min={1}
                value={q.nextStart}
                onChange={(n) => change('nextStart', n)}
              />
              <NumberField
                label="Packets per homework day"
                max={10}
                value={q.packetsPerDay}
                onChange={(n) => change('packetsPerDay', n)}
              />
              <NumberField
                label="Sheets per packet"
                min={1}
                max={100}
                value={q.sheetsPerPacket}
                onChange={(n) => change('sheetsPerPacket', n)}
              />
              <NumberField
                label="Classwork sheet target"
                min={1}
                max={100}
                value={q.classworkSheets}
                onChange={(n) => change('classworkSheets', n)}
              />
              <NumberField
                label="Homework day cap"
                min={1}
                max={90}
                value={q.maxDays}
                onChange={(n) => change('maxDays', n)}
              />
              <NumberField
                label="Homework sheet cap"
                min={1}
                max={1000}
                value={q.maxSheets}
                onChange={(n) => change('maxSheets', n)}
              />
            </div>
            <DayPicker
              value={q.excludeDays}
              onChange={(n) => change('excludeDays', n)}
              label={`${sub}: days excluded from homework`}
            />
            <p className="small muted">
              {q.packetsPerDay * q.sheetsPerPacket} sheets per homework day. Format changes preserve
              all prior assignments and verified records.
            </p>
          </fieldset>
        );
      })}
      <button className="primary" disabled={busy}>
        <Save size={17} />
        Save student profile
      </button>
      <p className="small muted">
        A conflicting edit from another device is rejected rather than silently overwriting it.
      </p>
    </form>
  );
}
function AssignmentsWorkspace({
  s,
  db,
  act,
  busy,
  editSettings,
  legacy,
}: {
  s: Student;
  db: Snapshot;
  act: Act;
  busy: boolean;
  editSettings: () => void;
  legacy: () => void;
}) {
  const [subject, setSubject] = useState<Subject>('Math');
  const cfg = db.operations!.students[s.id].subjects[subject];
  const [from, setFrom] = useState(dayKey(new Date(), db.timezone));
  const [carry, setCarry] = useState<string[]>([]);
  const [level, setLevel] = useState(cfg.level);
  const [start, setStart] = useState(cfg.nextStart);
  const [end, setEnd] = useState(cfg.nextStart + cfg.classworkSheets - 1);
  const [completed, setCompleted] = useState('');
  const [workedDate, setWorkedDate] = useState(dayKey(new Date(), db.timezone));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [showClass, setShowClass] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [decision, setDecision] = useState<
    'continue' | 'repeat-range' | 'repeat-from' | 'advance' | 'review'
  >('continue');
  const op = db.operations!,
    teacher = db.staff.role !== 'assistant';
  let proposed: ReturnType<typeof planHomework> | null = null;
  let planningError = '';
  try {
    if (cfg.enrolled) proposed = planHomework(db, s.id, subject, from, carry);
  } catch (e) {
    planningError = (e as Error).message;
  }
  const unfinished = op.classwork.filter(
    (w) =>
      w.studentId === s.id &&
      w.subject === subject &&
      !w.carriedAssignmentId &&
      w.completed.length < numbers(w.range).length,
  );
  return (
    <div className="assignments-workspace">
      <div className="inline-actions">
        <button className="text-button" onClick={legacy}>
          Legacy homework packets
        </button>
        <div className="segmented">
          {(['Math', 'Reading'] as Subject[]).map((sub) => (
            <button
              key={sub}
              className={subject === sub ? 'selected' : ''}
              onClick={() => {
                setSubject(sub);
                const c = op.students[s.id].subjects[sub];
                setLevel(c.level);
                setStart(c.nextStart);
                setEnd(c.nextStart + c.classworkSheets - 1);
                setCarry([]);
              }}
            >
              {sub}
            </button>
          ))}
        </div>
        <span className="tag">
          {cfg.enrolled ? `${cfg.format} · Level ${cfg.level}` : 'Not enrolled'}
        </span>
        {teacher && (
          <button className="text-button" onClick={editSettings}>
            Edit subject settings
          </button>
        )}
      </div>
      <CorrectionQueue db={db} act={act} busy={busy} profile={() => {}} studentId={s.id} />
      {cfg.enrolled && (
        <>
          <section className="panel planning-panel">
            <div className="panel-heading">
              <div>
                <h2>Next outgoing assignment · {subject}</h2>
                <p>Corrections → classwork → outgoing work. Each step remains explicit.</p>
              </div>
            </div>
            <div className="compact-form">
              <label>
                Departure / planning date
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <VacationHint db={db} id={s.id} />
              {unfinished.length > 0 && (
                <fieldset className="carryover-options">
                  <legend>Replace new homework with unfinished classwork</legend>
                  {unfinished.map((w) => (
                    <label className="check-label" key={w.id}>
                      <input
                        type="checkbox"
                        checked={carry.includes(w.id)}
                        onChange={(e) =>
                          setCarry(
                            e.target.checked ? [...carry, w.id] : carry.filter((x) => x !== w.id),
                          )
                        }
                      />
                      {rangeLabel(w.range)} · {numbers(w.range).length - w.completed.length}{' '}
                      unfinished sheets
                    </label>
                  ))}
                </fieldset>
              )}
              {proposed && (
                <div className="proposal-summary">
                  <div>
                    <span>Next return</span>
                    <b>{proposed.nextVisit || 'Not scheduled'}</b>
                  </div>
                  <div>
                    <span>Homework days</span>
                    <b>{proposed.homeworkDays.length}</b>
                  </div>
                  <div>
                    <span>New to pull</span>
                    <b>
                      {proposed.newPackets} packets / {proposed.newSheets} sheets
                    </b>
                  </div>
                  <div>
                    <span>Total outgoing</span>
                    <b>{proposed.targetSheets} sheets</b>
                  </div>
                  <p>
                    {proposed.ranges.map(rangeLabel).join(', ') || 'Carryover covers the workload.'}
                  </p>
                  {proposed.capped && (
                    <p className="warning-line">
                      Long absence capped at {cfg.maxDays} homework days / {cfg.maxSheets} sheets.
                      Instructor approval required.
                    </p>
                  )}
                  {proposed.format === 'CONNECT' && (
                    <p className="small muted">
                      CONNECT assignment: no ordinary physical pulling task will be created.
                    </p>
                  )}
                </div>
              )}
              {planningError && <p className="error">{planningError}</p>}
              <button
                className="primary"
                disabled={busy || !proposed}
                onClick={() =>
                  void act({
                    action: 'plan',
                    studentId: s.id,
                    subject,
                    fromDate: from,
                    carryIds: carry,
                  })
                }
              >
                <Plus size={17} />
                Save proposal
              </button>
              {teacher && (
                <div className="inline-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      setShowClass(!showClass);
                      setShowCorrection(false);
                    }}
                  >
                    Record classwork
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setShowCorrection(!showCorrection);
                      setShowClass(false);
                    }}
                  >
                    Add corrections
                  </button>
                </div>
              )}
              {(showClass || showCorrection) && (
                <form
                  className="record-work-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const okay = showClass
                        ? await act({
                            action: 'classwork',
                            studentId: s.id,
                            subject,
                            range: { level, start, end },
                            completed: parseWorksheets(completed),
                            workedDate,
                          })
                        : await act({
                            action: 'correction-add',
                            studentId: s.id,
                            subject,
                            range: { level, start, end },
                            reason,
                          });
                      if (okay) {
                        setShowClass(false);
                        setShowCorrection(false);
                        setCompleted('');
                        setReason('');
                        setCarry([]);
                      }
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <h3>{showClass ? 'In-center worksheet record' : 'Outstanding corrections'}</h3>
                  <div className="form-grid three">
                    <label>
                      Worksheet level
                      <input value={level} required onChange={(e) => setLevel(e.target.value)} />
                    </label>
                    <NumberField label="Range start" value={start} min={1} onChange={setStart} />
                    <NumberField label="Range end" value={end} min={start} onChange={setEnd} />
                  </div>
                  {showClass ? (
                    <>
                      <label>
                        Date this classwork was worked
                        <input
                          type="date"
                          value={workedDate}
                          max={dayKey(new Date(), db.timezone)}
                          required
                          onChange={(e) => setWorkedDate(e.target.value)}
                        />
                      </label>
                      <label>
                        Completed worksheet identities
                        <input
                          placeholder="101–105, 108 (blank means unfinished)"
                          value={completed}
                          onChange={(e) => setCompleted(e.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <label>
                      Correction reason
                      <input
                        value={reason}
                        required
                        minLength={3}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                  )}
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="primary" disabled={busy}>
                    Save worksheet record
                  </button>
                </form>
              )}
            </div>
          </section>
          <ClassworkRecords db={db} studentId={s.id} subject={subject} act={act} busy={busy} />
          {teacher && (
            <section className="panel form-panel">
              <div className="panel-heading">
                <div>
                  <h2>Instructional assignment decision</h2>
                  <p>General notes never apply a repeat or advancement automatically.</p>
                </div>
              </div>
              <form
                className="compact-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await act({
                      action: 'decision',
                      studentId: s.id,
                      subject,
                      kind: decision,
                      range: { level, start, end },
                      note: reason,
                    })
                  )
                    setReason('');
                }}
              >
                <div className="form-grid">
                  <label>
                    Decision
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value as typeof decision)}
                    >
                      <option value="continue">Continue from specified worksheet</option>
                      <option value="repeat-range">Repeat exact range</option>
                      <option value="repeat-from">Repeat from specified worksheet</option>
                      <option value="advance">Advance to specified level/range</option>
                      <option value="review">Review before deciding</option>
                    </select>
                  </label>
                  <label>
                    Level
                    <input value={level} required onChange={(e) => setLevel(e.target.value)} />
                  </label>
                  <NumberField label="Start worksheet" min={1} value={start} onChange={setStart} />
                  <NumberField label="End worksheet" min={start} value={end} onChange={setEnd} />
                </div>
                <label>
                  Instructor reasoning
                  <input
                    value={reason}
                    required
                    minLength={3}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  Record decision for approval
                </button>
              </form>
              {op.decisions
                .filter((d) => d.studentId === s.id && d.subject === subject)
                .map((d) => (
                  <div className="exception-row" key={d.id}>
                    <div>
                      <b>
                        {d.kind} · {rangeLabel(d.range)}
                      </b>
                      <p>
                        {d.note} · {d.author} · {date(d.createdAt, db.timezone)}
                      </p>
                    </div>
                    {d.approvedAt ? (
                      <span className="tag green">Approved · {d.approvedBy}</span>
                    ) : d.kind !== 'review' ? (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void act({ action: 'decision-approve', id: d.id })}
                      >
                        Approve decision
                      </button>
                    ) : (
                      <span className="tag amber">Needs concrete decision</span>
                    )}
                  </div>
                ))}
            </section>
          )}
          {op.assignments
            .filter((a) => a.studentId === s.id && a.subject === subject)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((a) => (
              <div key={a.id}>
                <AssignmentCard a={a} db={db} act={act} busy={busy} profile={() => {}} />
                {teacher && <AssignmentReturn a={a} db={db} act={act} busy={busy} />}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
function AssignmentReturn({
  a,
  db,
  act,
  busy,
}: {
  a: import('@/lib/v2-model').Assignment;
  db: Snapshot;
  act: Act;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sheets, setSheets] = useState('');
  const [official, setOfficial] = useState('');
  const [completedDate, setCompletedDate] = useState(dayKey(new Date(), db.timezone));
  const [verificationLevel, setVerificationLevel] = useState(
    a.ranges[0]?.level || a.carryRanges[0]?.level || '',
  );
  const [partial, setPartial] = useState(true);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<import('@/lib/v2-model').AssignmentStatus>('ready');
  return (
    <details
      className="assignment-return"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Returned work, verification & audited corrections</summary>
      <div className="compact-form">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (
                await act({
                  action: 'completion',
                  id: a.id,
                  worksheets: parseWorksheets(sheets),
                  level: verificationLevel,
                  completedDate,
                  officialCount: official === '' ? null : Number(official),
                  partial,
                  reason,
                })
              ) {
                setSheets('');
                setOfficial('');
                setReason('');
              }
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Worksheet level being verified
            <select
              value={verificationLevel}
              onChange={(e) => setVerificationLevel(e.target.value)}
            >
              {[...new Set([...a.ranges, ...a.carryRanges].map((r) => r.level))].map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </label>
          <label>
            Actual completion date
            <input
              type="date"
              required
              min={a.fromDate}
              max={dayKey(new Date(), db.timezone)}
              value={completedDate}
              onChange={(e) => setCompletedDate(e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              Verified completed worksheet identities
              <input
                required
                value={sheets}
                onChange={(e) => setSheets(e.target.value)}
                placeholder="e.g. 101–105"
              />
            </label>
            <label>
              Official reportable completed count · optional
              <input
                type="number"
                min={0}
                value={official}
                onChange={(e) => setOfficial(e.target.value)}
                placeholder="Leave blank if not verified"
              />
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={partial}
              onChange={(e) => setPartial(e.target.checked)}
            />
            Partial completion; keep unfinished sheets outstanding
          </label>
          <label>
            Verification evidence / reason
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
          <button className="secondary" disabled={busy}>
            <ShieldCheck size={16} />
            Record verified completion
          </button>
        </form>
        <div className="audit-correction">
          <h3>Correct a workflow status</h3>
          <p>
            Retains the previous events. Prior verified ledger entries are revoked, not deleted.
          </p>
          <select
            aria-label="Corrected assignment status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            {[
              'proposed',
              'approved',
              'ready',
              'pulled',
              'distributed',
              'returned',
              'partial',
              'corrections-outstanding',
              'repeated',
              'deferred',
            ].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <label>
            Correction reason
            <input
              value={reason}
              minLength={3}
              required
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="text-button"
            disabled={busy || reason.length < 3}
            onClick={() =>
              void act({ action: 'assignment-status', id: a.id, status, reason, correcting: true })
            }
          >
            Apply audited correction
          </button>
        </div>
        <div className="event-timeline">
          {a.events.map((e, i) => (
            <p key={i}>
              <b>{e.status}</b> · {date(e.at, db.timezone)} {time(e.at, db.timezone)} · {e.actor}
              <span>{e.reason}</span>
              {e.snapshot && (
                <span>
                  Worksheets: {e.snapshot.ranges.map(rangeLabel).join(', ')} · carryover:{' '}
                  {e.snapshot.carryRanges.map(rangeLabel).join(', ') || 'none'} ·{' '}
                  {e.snapshot.targetSheets} total outgoing sheets
                </span>
              )}
            </p>
          ))}
        </div>
        {db
          .operations!.completions.filter((c) => c.assignmentId === a.id)
          .map((c) => (
            <p className="small muted" key={c.id}>
              {c.active ? 'Verified' : 'Revoked'}: {c.level} {c.worksheets.join(', ')} ·{' '}
              {c.physicalSheets} physical sheets · {c.officialCount ?? 'unverified'} official count
              · {c.verifiedBy}
            </p>
          ))}
      </div>
    </details>
  );
}
function EvaluationWorkspace({
  s,
  db,
  act,
  busy,
}: {
  s: Student;
  db: Snapshot;
  act: Act;
  busy: boolean;
}) {
  const empty = Object.fromEntries(dimensions.map((d) => [d, 'Not assessed'])) as Record<
    (typeof dimensions)[number],
    Rating
  >;
  const [ratings, setRatings] = useState(empty);
  const [subject, setSubject] = useState<Subject>('Math');
  const [text, setText] = useState('');
  const [followUp, setFollow] = useState(false);
  return (
    <div className="profile-grid">
      <section className="panel form-panel">
        <div className="panel-heading">
          <div>
            <h2>Quick instructor evaluation</h2>
            <p>Choose only what you assessed. Unassessed dimensions remain explicit.</p>
          </div>
        </div>
        <form
          className="compact-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await act({ action: 'evaluation', studentId: s.id, subject, ratings, text, followUp })
            ) {
              setRatings(empty);
              setText('');
              setFollow(false);
            }
          }}
        >
          <label>
            Evaluation subject
            <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              <option>Math</option>
              <option>Reading</option>
            </select>
          </label>
          <div className="rating-matrix">
            {dimensions.map((d) => (
              <fieldset key={d}>
                <legend>{d}</legend>
                <div>
                  {(['Not assessed', 'Needs support', 'Developing', 'Secure'] as Rating[]).map(
                    (r) => (
                      <button
                        type="button"
                        key={r}
                        aria-pressed={ratings[d] === r}
                        className={ratings[d] === r ? 'selected' : ''}
                        onClick={() => setRatings({ ...ratings, [d]: r })}
                      >
                        {r}
                      </button>
                    ),
                  )}
                </div>
              </fieldset>
            ))}
          </div>
          <label>
            Optional context
            <textarea
              maxLength={1200}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="A brief instructor note…"
            />
          </label>
          <p className="small muted">
            Use the keyboard microphone for native dictation, or the Quick note microphone where
            supported.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={followUp}
              onChange={(e) => setFollow(e.target.checked)}
            />
            Add to persistent follow-up review queue
          </label>
          <button className="primary" disabled={busy}>
            <Check size={16} />
            Save evaluation
          </button>
        </form>
      </section>
      <section className="panel form-panel">
        <div className="panel-heading">
          <div>
            <h2>Dated evaluations</h2>
            <p>No missing value is treated as poor performance.</p>
          </div>
        </div>
        {opEvaluations(db, s.id).map((e) => (
          <article className="history-note" key={e.id}>
            <div>
              <b>
                {e.subject} · {date(e.createdAt, db.timezone)}
              </b>
              <span>{e.author}</span>
            </div>
            <div className="evaluation-ratings">
              {dimensions.map((d) => (
                <span
                  className={`rating ${e.ratings[d] === 'Secure' ? 'green' : e.ratings[d] === 'Needs support' ? 'amber' : ''}`}
                  key={d}
                >
                  <b>{d}</b>
                  {e.ratings[d]}
                </span>
              ))}
            </div>
            {e.text && <p>{e.text}</p>}
          </article>
        ))}
        {!opEvaluations(db, s.id).length && (
          <Empty
            title="Not assessed yet"
            text="No evaluation scores or ratings have been invented."
          />
        )}
      </section>
    </div>
  );
}
function opEvaluations(db: Snapshot, id: string) {
  return [...db.operations!.evaluations]
    .filter((e) => e.studentId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function ProgressWorkspace({
  s,
  db,
  act,
  busy,
}: {
  s: Student;
  db: Snapshot;
  act: Act;
  busy: boolean;
}) {
  const [days, setDays] = useState(30);
  const [subject, setSubject] = useState<Subject>('Math');
  const [distinction, setDistinction] = useState<'Bronze' | 'Silver' | 'Gold' | 'Platinum'>(
    'Bronze',
  );
  const [awardDate, setDate] = useState(dayKey(new Date(), db.timezone));
  const [evidence, setEvidence] = useState('');
  const since = days ? addDays(dayKey(new Date(), db.timezone), -days) : '1900-01-01';
  const chart = completionChart(db, s.id, since);
  const max = Math.max(1, ...chart.map((x) => Math.max(x.Math, x.Reading)));
  const op = db.operations!,
    history = op.configHistory.filter(
      (h) => h.studentId === s.id && dayKey(h.at, db.timezone) >= since,
    );
  const decisions = op.decisions.filter(
    (d) => d.studentId === s.id && d.approvedAt && dayKey(d.approvedAt, db.timezone) >= since,
  );
  return (
    <div className="progress-workspace">
      <div className="segmented chart-ranges">
        {[
          [7, 'Week'],
          [30, 'Month'],
          [90, '3 months'],
          [180, '6 months'],
          [365, 'Year'],
          [0, 'All history'],
        ].map(([n, label]) => (
          <button
            className={days === n ? 'selected' : ''}
            key={n}
            onClick={() => setDays(Number(n))}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Work completed, one day at a time</h2>
            <p>
              Verified worksheet identities · Math in blue, Reading in green. No completion record
              means no plotted value.
            </p>
          </div>
        </div>
        {chart.length ? (
          <div
            className="completion-chart"
            role="img"
            aria-label="Dated verified physical worksheet counts by subject"
          >
            {chart.map((x) => (
              <div className="completion-column" key={x.date}>
                <div className="completion-bars">
                  <span
                    className="math-bar"
                    style={{ height: `${(x.Math / max) * 100}%` }}
                    title={`Math: ${x.Math} verified sheets`}
                  />
                  <span
                    className="reading-bar"
                    style={{ height: `${(x.Reading / max) * 100}%` }}
                    title={`Reading: ${x.Reading} verified sheets`}
                  />
                </div>
                <b>{x.Math + x.Reading}</b>
                <small>{x.date.slice(5)}</small>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="No verified completion data in this period"
            text="Returned and unfinished sheets are not counted as completed."
          />
        )}
      </section>
      <ProfileCharts db={db} id={s.id} since={since} />
      <div className="profile-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <h2>Levels, worksheet ranges & repeats</h2>
              <p>Recorded changes only; no automatic advancement score.</p>
            </div>
          </div>
          {history.map((h, i) => (
            <article className="history-note" key={i}>
              <b>{date(h.at, db.timezone)}</b>
              <p>
                {(['Math', 'Reading'] as Subject[])
                  .filter((sub) => h.subjects[sub].enrolled)
                  .map(
                    (sub) =>
                      `${sub}: ${h.subjects[sub].format} · ${h.subjects[sub].level} ${h.subjects[sub].currentStart}–${h.subjects[sub].currentEnd}`,
                  )
                  .join(' / ')}
              </p>
            </article>
          ))}
          {decisions.map((d) => (
            <article className="history-note" key={d.id}>
              <b>
                {d.subject} · {d.kind}
              </b>
              <p>
                {rangeLabel(d.range)} · {d.note}
              </p>
              <span className="small muted">
                Approved {date(d.approvedAt!, db.timezone)} by {d.approvedBy}
              </span>
            </article>
          ))}
        </section>
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <h2>Verified achievement distinctions</h2>
              <p>Manually recorded by subject; never calculated from app activity.</p>
            </div>
          </div>
          {op.achievements
            .filter((a) => a.studentId === s.id)
            .map((a) => (
              <article className="history-note" key={a.id}>
                <b>
                  {a.subject} · {a.distinction}
                </b>
                <p>
                  {a.date} · {a.evidence}
                </p>
                <small>Verified by {a.verifiedBy}</small>
              </article>
            ))}
          {db.staff.role !== 'assistant' && (
            <form
              className="compact-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await act({
                    action: 'achievement',
                    studentId: s.id,
                    subject,
                    distinction,
                    date: awardDate,
                    evidence,
                  })
                )
                  setEvidence('');
              }}
            >
              <div className="form-grid">
                <label>
                  Subject
                  <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
                    <option>Math</option>
                    <option>Reading</option>
                  </select>
                </label>
                <label>
                  Verified distinction
                  <select
                    value={distinction}
                    onChange={(e) => setDistinction(e.target.value as typeof distinction)}
                  >
                    {['Bronze', 'Silver', 'Gold', 'Platinum'].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Achievement date
                  <input
                    type="date"
                    required
                    value={awardDate}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  Verification evidence
                  <input
                    value={evidence}
                    required
                    minLength={3}
                    onChange={(e) => setEvidence(e.target.value)}
                    placeholder="Reviewed official source / record"
                  />
                </label>
              </div>
              <button className="secondary" disabled={busy}>
                Record verified distinction
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
export function AttendanceHistory({
  s,
  db,
  act,
  busy,
}: {
  s?: Student;
  db: Snapshot;
  act: Act;
  busy: boolean;
}) {
  const [visitId, setVisit] = useState<string | null>(null);
  const [departure, setDeparture] = useState('');
  const [reason, setReason] = useState('');
  const visits = [...db.visits]
    .filter((v) => !s || v.studentId === s.id)
    .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));
  const durations = visits
    .filter((v) => v.departedAt && v.departureVerified !== false)
    .map((v) => (Date.parse(v.departedAt!) - Date.parse(v.arrivedAt)) / 60000);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{s ? 'Attendance history' : 'Attendance & reconciliation'}</h2>
          <p>
            {durations.length
              ? `Typical verified visit: ${Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)} minutes. `
              : ''}
            Administrative closure does not verify that a child left.
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Student / arrival</th>
              <th>Departure / closure</th>
              <th>Duration</th>
              <th>Reconcile</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id}>
                <td>
                  <b>{db.students.find((s) => s.id === v.studentId)?.name}</b>
                  <br />
                  {date(v.arrivedAt, db.timezone)} · {time(v.arrivedAt, db.timezone)}
                </td>
                <td>
                  {v.departedAt ? (
                    <span>{time(v.departedAt, db.timezone)} · verified</span>
                  ) : v.closedAt ? (
                    <span className="tag amber">Departure time unverified</span>
                  ) : (
                    <span className="tag green">Open visit</span>
                  )}
                  {v.closedAt && (
                    <p className="small muted">
                      Admin closed {date(v.closedAt, db.timezone)} {time(v.closedAt, db.timezone)}
                    </p>
                  )}
                </td>
                <td>
                  {v.departedAt && v.departureVerified !== false
                    ? `${Math.round((Date.parse(v.departedAt) - Date.parse(v.arrivedAt)) / 60000)} min`
                    : isOpenVisit(v)
                      ? elapsed(v.arrivedAt)
                      : 'Unverified'}
                </td>
                <td>
                  {db.staff.role !== 'assistant' && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setVisit(v.id);
                        setReason('');
                        setDeparture('');
                      }}
                    >
                      Correct / view events
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visitId && (
        <div className="compact-form">
          <h3>Reconcile an attendance record</h3>
          <label>
            Verified departure timestamp (with timezone)
            <input
              placeholder="2026-10-12T18:45:00-07:00"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
            />
          </label>
          <label>
            Evidence / correction reason
            <input
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="inline-actions">
            <button
              className="primary"
              disabled={busy || reason.length < 3 || !departure}
              onClick={() =>
                void act({
                  action: 'visit-reconcile',
                  id: visitId,
                  mode: 'verify',
                  departedAt: departure,
                  reason,
                })
              }
            >
              Save verified departure
            </button>
            <button
              className="secondary"
              disabled={busy || reason.length < 3}
              onClick={() =>
                void act({ action: 'visit-reconcile', id: visitId, mode: 'reopen', reason })
              }
            >
              Reopen / undo checkout
            </button>
            <button className="text-button" onClick={() => setVisit(null)}>
              Close reconciliation
            </button>
          </div>
          <div className="event-timeline">
            {db.visits
              .find((v) => v.id === visitId)
              ?.events?.map((e, i) => (
                <p key={i}>
                  <b>{e.kind}</b> · {e.at} · {e.actor}
                  <span>
                    {e.reason || 'Recorded attendance event'} {e.value}
                  </span>
                </p>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
