'use client';
import { useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { dayKey, type Snapshot } from '@/lib/model';
import { addDays, datesBetween, localClock, weekday, zonedTimestamp } from '@/lib/schedule';
import { staffingWarnings } from '@/lib/reports';
import type { Appointment, Report } from '@/lib/v2-model';
import { request } from '@/lib/client';
import { date, time, Empty } from './shared-ui';
import { DayPicker, NumberField, dayNames, type Act } from './operations-ui';
export function CenterCalendar({ db, act, busy }: { db: Snapshot; act: Act; busy: boolean }) {
  const op = db.operations!,
    today = dayKey(new Date(), db.timezone);
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState('Week');
  const [month, setMonth] = useState(today.slice(0, 7) + '-01');
  const [edit, setEdit] = useState<Appointment | null>(null);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(today);
  const [clock, setClock] = useState('15:00');
  const [minutes, setMinutes] = useState(30);
  const [staffId, setStaff] = useState(op.coverage.find((s) => s.role === 'instructor')?.id || '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const monthEnd = addDays(
    new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1))
      .toISOString()
      .slice(0, 10),
    -1,
  );
  const weekStart = addDays(selected, -((weekday(selected) + 6) % 7));
  const start = view === 'Month' ? month : view === 'Week' ? weekStart : selected,
    end = view === 'Month' ? monthEnd : view === 'Week' ? addDays(weekStart, 6) : selected;
  const appointments = op.appointments
    .filter(
      (a) => dayKey(a.startsAt, db.timezone) >= start && dayKey(a.startsAt, db.timezone) <= end,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const open = (a?: Appointment) => {
    setEdit(a || null);
    setTitle(a?.title || '');
    setDay(a ? dayKey(a.startsAt, db.timezone) : selected);
    setClock(a ? localClock(new Date(a.startsAt), db.timezone) : '15:00');
    setMinutes(a?.minutes || 30);
    setStaff(a?.staffId || op.coverage.find((s) => s.role === 'instructor')?.id || '');
    setNotes(a?.notes || '');
    setError('');
    setShow(true);
  };
  return (
    <div className="calendar-workspace">
      <div className="screen-toolbar">
        <div className="segmented">
          {['Day', 'Week', 'Month'].map((v) => (
            <button key={v} className={view === v ? 'selected' : ''} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>
        <label className="inline-field">
          View date
          <input
            type="date"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setMonth(e.target.value.slice(0, 7) + '-01');
            }}
          />
        </label>
        <button className="primary" onClick={() => open()}>
          <Plus size={18} />
          New orientation
        </button>
      </div>
      <div className="calendar-grid">
        <section className="panel month-panel">
          <div className="panel-heading">
            <button
              className="icon-button"
              aria-label="Previous month"
              onClick={() => {
                const d = addDays(month, -1).slice(0, 7) + '-01';
                setMonth(d);
                setSelected(d);
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <h2>
              {new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </h2>
            <button
              className="icon-button"
              aria-label="Next month"
              onClick={() => {
                const d = addDays(monthEnd, 1);
                setMonth(d);
                setSelected(d);
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="month-days">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span className="month-label" key={d}>
                {d}
              </span>
            ))}
            {Array.from({ length: (weekday(month) + 6) % 7 }, (_, i) => (
              <span key={'blank' + i} />
            ))}
            {datesBetween(month, monthEnd).map((d) => {
              const a = op.appointments.filter(
                (a) => a.status === 'scheduled' && dayKey(a.startsAt, db.timezone) === d,
              );
              return (
                <button
                  className={`${selected === d ? 'selected' : ''} ${op.center.closedDates.includes(d) ? 'closed-day' : ''}`}
                  key={d}
                  onClick={() => setSelected(d)}
                >
                  <b>{Number(d.slice(-2))}</b>
                  {a.length ? (
                    <span>
                      {a.length} orientation{a.length > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <small>{op.center.operatingDays.includes(weekday(d)) ? 'Open' : ''}</small>
                  )}
                </button>
              );
            })}
          </div>
          <p className="calendar-note">
            Staff-managed orientations only. Existing students keep flexible arrivals.
          </p>
        </section>
        <section className="calendar-agenda">
          <div className="agenda-heading">
            <h2>{view === 'Day' ? selected : `${start} → ${end}`}</h2>
            <span>{appointments.length} orientations</span>
          </div>
          {appointments.map((a) => (
            <article
              className={`assignment-card ${a.status === 'cancelled' ? 'cancelled' : ''}`}
              key={a.id}
            >
              <div className="assignment-top">
                <span className="settings-icon">
                  <CalendarDays size={22} />
                </span>
                <div>
                  <h3>{a.title}</h3>
                  <p>
                    {date(a.startsAt, db.timezone)} · {time(a.startsAt, db.timezone)} · {a.minutes}{' '}
                    min
                  </p>
                </div>
                <span className="tag">{a.status}</span>
              </div>
              <p>
                {op.coverage.find((c) => c.id === a.staffId)?.name} is occupied during this
                orientation.
              </p>
              {a.notes && <p className="muted">{a.notes}</p>}
              {a.status === 'scheduled' &&
                staffingWarnings(db, a).map((w) => (
                  <p className="warning-line" key={w}>
                    {w}
                  </p>
                ))}
              <div className="inline-actions">
                <button className="secondary" onClick={() => open(a)}>
                  Edit / reschedule
                </button>
                {a.status === 'scheduled' && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void act({ action: 'appointment-save', ...a, status: 'cancelled' })
                    }
                  >
                    Cancel orientation
                  </button>
                )}
              </div>
            </article>
          ))}
          {!appointments.length && (
            <Empty
              title="Room on the calendar"
              text="Add an orientation to see its staffing impact."
            />
          )}
        </section>
      </div>
      {show && (
        <section className="panel form-panel orientation-form">
          <div className="panel-heading">
            <div>
              <h2>{edit ? 'Update orientation' : 'Create orientation'}</h2>
              <p>Times use {db.timezone}; potential conflicts are flagged rather than hidden.</p>
            </div>
            <button className="text-button" onClick={() => setShow(false)}>
              Close form
            </button>
          </div>
          <form
            className="compact-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (
                  await act({
                    action: 'appointment-save',
                    id: edit?.id,
                    version: edit?.version,
                    title,
                    staffId,
                    startsAt: zonedTimestamp(day, clock, db.timezone),
                    minutes,
                    notes,
                    status: 'scheduled',
                  })
                ) {
                  setShow(false);
                  setSelected(day);
                  setMonth(day.slice(0, 7) + '-01');
                }
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className="form-grid three">
              <label>
                Orientation / prospect label
                <input
                  required
                  maxLength={120}
                  placeholder="Fictional family introduction"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Assigned instructor
                <select value={staffId} onChange={(e) => setStaff(e.target.value)}>
                  {op.coverage
                    .filter((c) => c.role === 'instructor')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Orientation date
                <input type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
              </label>
              <label>
                Center-local time
                <input
                  type="time"
                  required
                  value={clock}
                  onChange={(e) => setClock(e.target.value)}
                />
              </label>
              <NumberField
                label="Duration in minutes"
                min={10}
                max={180}
                value={minutes}
                onChange={setMinutes}
              />
            </div>
            <label>
              Preparation & follow-up notes
              <textarea maxLength={1200} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              <Save size={16} />
              Save orientation
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
export function ReportsWorkspace({ db, refresh }: { db: Snapshot; refresh: () => Promise<void> }) {
  const op = db.operations!,
    today = dayKey(new Date(), db.timezone);
  const [kind, setKind] = useState<Report['kind']>('daily');
  const [period, setPeriod] = useState(today);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('Instructor requested operational snapshot');
  const [newVersion, setNewVersion] = useState(false);
  const list = [...op.reports]
    .filter((r) => r.kind === kind)
    .sort((a, b) => b.period.localeCompare(a.period) || b.version - a.version);
  const report = op.reports.find((r) => r.id === selected) || list[0];
  return (
    <div className="reports-workspace">
      <div className="screen-toolbar">
        <div className="segmented">
          {(['daily', 'weekly', 'monthly'] as const).map((k) => (
            <button
              className={kind === k ? 'selected' : ''}
              key={k}
              onClick={() => {
                setKind(k);
                setSelected(null);
              }}
            >
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <label className="inline-field">
          Period date
          <input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const r = await request<{ id: string }>('/api/reports', 'POST', {
                kind,
                period,
                newVersion,
                reason,
              });
              await refresh();
              setSelected(r.id);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Generate / open snapshot
        </button>
      </div>
      <details className="report-revision">
        <summary>Historical snapshot revisions</summary>
        <label className="check-label">
          <input
            type="checkbox"
            checked={newVersion}
            onChange={(e) => setNewVersion(e.target.checked)}
          />
          Create a new version; preserve the earlier snapshot
        </label>
        <label>
          Reason
          <input
            value={reason}
            minLength={3}
            required
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </details>
      <p className="small muted report-schedule">
        Daily reports: {op.center.reportTime} {db.timezone},{' '}
        {op.center.operatingDays.map((d) => dayNames[d]).join('–')}. Weekly: last operating day.
        Monthly: month-end. Worker status is shown in Settings.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="report-grid">
        <aside className="panel archive-list">
          <div className="panel-heading">
            <h2>Archive</h2>
          </div>
          {list.map((r) => (
            <button
              className={report?.id === r.id ? 'selected' : ''}
              key={r.id}
              onClick={() => setSelected(r.id)}
            >
              <b>
                {r.period} <span>v{r.version}</span>
              </b>
              <small>
                {date(r.generatedAt, db.timezone)} · revision {r.sourceRevision}
              </small>
            </button>
          ))}
          {!list.length && <p className="column-empty">No archived {kind} reports yet.</p>}
        </aside>
        {report ? (
          <article className="panel report-detail">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  ARCHIVED · V{report.version} · SOURCE REVISION {report.sourceRevision}
                </span>
                <h2>
                  {report.kind[0].toUpperCase() + report.kind.slice(1)} report · {report.period}
                </h2>
                <p>
                  {report.reason} · generated {date(report.generatedAt, db.timezone)}{' '}
                  {time(report.generatedAt, db.timezone)}
                </p>
              </div>
              <a className="secondary" href={`/api/reports?id=${report.id}&format=csv`} download>
                <Download size={17} />
                CSV
              </a>
              <a className="text-button" href={`/api/reports?id=${report.id}`} download>
                JSON
              </a>
            </div>
            <div className="report-metrics">
              {[
                ['Visits', report.payload.visits],
                ['Students', report.payload.students],
                ['Verified departures', report.payload.verifiedDepartures],
                ['Unverified departures', report.payload.unverifiedDepartures.length],
                ['Pending observations', report.payload.pendingObservations],
                ...(!op.v3 ? [['Outstanding corrections', report.payload.corrections]] : []),
                ['Physical sheets verified', report.payload.physicalSheets],
                ['Official completed count', report.payload.officialSheets],
              ].map(([label, n]) => (
                <div key={label}>
                  <span>{label}</span>
                  <b>{n}</b>
                </div>
              ))}
            </div>
            <div className="report-body">
              <h3>Incomplete / inconsistent records</h3>
              {report.payload.missing.length ? (
                report.payload.missing.map((m) => (
                  <p className="warning-line" key={m}>
                    {m}
                  </p>
                ))
              ) : (
                <p>No identified exceptions in this snapshot.</p>
              )}
              <p className="small muted">
                {report.payload.unreportableCompletions} completion records lack a verified official
                count. Counts are not a certified corporate report.
              </p>
              <div className="profile-grid">
                <section>
                  <h3>Next operating day · {report.payload.nextDay || 'not configured'}</h3>
                  <p>
                    {report.payload.expectedNext.length} expected students ·{' '}
                    {report.payload.preparation.length} paper preparation tasks.
                  </p>
                  <p>
                    {report.payload.expectedNext
                      .map((id) => db.students.find((s) => s.id === id)?.name || id)
                      .join(', ') || 'None expected.'}
                  </p>
                </section>
                <section>
                  <h3>Homework & follow-up</h3>
                  {Object.entries(report.payload.assignmentStatuses).map(([status, n]) => (
                    <p key={status}>
                      {status}: {n}
                    </p>
                  ))}
                  <p>
                    Follow-up:{' '}
                    {report.payload.followUps
                      .map((id) => db.students.find((s) => s.id === id)?.name || id)
                      .join(', ') || 'None flagged.'}
                  </p>
                  {!op.v3 && <p>{report.payload.appointments.length} upcoming orientations.</p>}
                  {!op.v3 &&
                    report.payload.staffingWarnings.map((w) => (
                      <p className="warning-line" key={w}>
                        {w}
                      </p>
                    ))}
                </section>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Student / subject</th>
                    <th>Recorded level / range</th>
                    <th>Visits</th>
                    <th>Physical / official sheets</th>
                    <th>Returned / distributed</th>
                    <th>Repeats</th>
                  </tr>
                </thead>
                <tbody>
                  {report.payload.studentSummaries.map((s) => (
                    <tr key={s.id + s.subject}>
                      <td>
                        <b>{s.name}</b>
                        <br />
                        {s.subject}
                      </td>
                      <td>{s.range}</td>
                      <td>{s.attendance}</td>
                      <td>
                        {s.physicalSheets} / {s.officialSheets}
                      </td>
                      <td>
                        {s.returned} / {s.distributed}
                      </td>
                      <td>{s.repeats}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ) : (
          <Empty
            title="Your operational record starts here"
            text="Generate a snapshot, or enable the report worker to archive reports automatically."
          />
        )}
      </div>
    </div>
  );
}
export function CenterSettings({ db, act, busy }: { db: Snapshot; act: Act; busy: boolean }) {
  const op = db.operations!,
    owner = db.staff.role === 'owner';
  const [c, setC] = useState({ ...op.center });
  const [closures, setClosures] = useState(op.center.closedDates.join(', '));
  const [name, setName] = useState('');
  const [role, setRole] = useState<'instructor' | 'grader'>('grader');
  const [days, setDays] = useState([2, 4]);
  const [start, setStart] = useState('14:00');
  const [end, setEnd] = useState('18:00');
  const [coverageId, setCoverage] = useState<string | undefined>();
  const [jobResult, setJob] = useState('');
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <ShieldCheck className="settings-icon" />
        <h2>Access & persistence</h2>
        <p>
          {db.runtime?.demo ? 'Fictional-data testing' : 'Configured approved center'} ·{' '}
          {db.runtime?.adapter || 'local'} adapter ·{' '}
          {db.runtime?.scheduler ? 'Scheduled worker enabled' : 'Scheduled worker disabled'}
        </p>
        <p>
          {db.staff.name} · {db.staff.role}
        </p>
        <p>
          Staff permissions are enforced by the server. Kiosk sessions cannot receive student
          records. Owner/instructor: instructional records and reports; assistants: attendance,
          physical attendance and preparation.
        </p>
        <p>
          Schema v{db.schemaVersion} · revision {db.revision}. Existing V1 packets and all 96
          original student identities are retained.
        </p>
        <a className="secondary" href="/api/export" download>
          <Download size={16} />
          Owner backup export
        </a>
        <p className="small muted">
          Fictional local testing until cloud configuration and organizational permission are
          verified. No corporate portal integration.
        </p>
      </section>
      <section className="panel settings-card">
        <h2>Closing & reports</h2>
        <p>Auto-closure records departure as unverified. Reconcile it in Student Visit History.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await act({
              action: 'center-save',
              name: c.name,
              operatingDays: c.operatingDays,
              closedDates: closures
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
              closingTime: c.closingTime,
              reportTime: c.reportTime,
              autoClose: c.autoClose,
              expectedMinutes: c.expectedMinutes,
              earlyPerInstructor: c.earlyPerInstructor,
            });
          }}
        >
          <label>
            Center name
            <input required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          </label>
          <div className="form-grid">
            <label>
              Closing time
              <input
                type="time"
                value={c.closingTime}
                required
                onChange={(e) => setC({ ...c, closingTime: e.target.value })}
              />
            </label>
            <label>
              Report time
              <input
                type="time"
                value={c.reportTime}
                required
                onChange={(e) => setC({ ...c, reportTime: e.target.value })}
              />
            </label>
            <NumberField
              label="Default expected minutes"
              value={c.expectedMinutes}
              min={5}
              max={240}
              onChange={(n) => setC({ ...c, expectedMinutes: n })}
            />
            <NumberField
              label="Early learners per free instructor"
              value={c.earlyPerInstructor}
              min={1}
              max={10}
              onChange={(n) => setC({ ...c, earlyPerInstructor: n })}
            />
          </div>
          <DayPicker
            value={c.operatingDays}
            onChange={(n) => setC({ ...c, operatingDays: n })}
            label="Center operating days"
          />
          <label>
            Closure dates (YYYY-MM-DD, comma-separated)
            <input value={closures} onChange={(e) => setClosures(e.target.value)} />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={c.autoClose}
              onChange={(e) => setC({ ...c, autoClose: e.target.checked })}
            />
            Administrative auto-closure enabled
          </label>
          {owner && (
            <button className="primary" disabled={busy}>
              Save center settings
            </button>
          )}
        </form>
        <p className="small muted">
          Timezone: {db.timezone}. Scheduled worker requires ENABLE_SCHEDULER=true on an
          always-running server, or a configured external job caller.
        </p>
        {owner && (
          <button
            className="text-button"
            onClick={async () => {
              try {
                const r = await request<{ changes: number }>('/api/jobs', 'POST');
                setJob(
                  `Due jobs processed: ${r.changes} new closures/reports. Refresh to inspect the archive.`,
                );
              } catch (e) {
                setJob((e as Error).message);
              }
            }}
          >
            Run due jobs now
          </button>
        )}
        {jobResult && <p role="status">{jobResult}</p>}
      </section>
      <section className="panel settings-card full">
        <h2>Staff coverage & additional graders</h2>
        <p>
          Orientations occupy their assigned instructor. Coverage is a configurable planning
          estimate, not an attendance reservation system.
        </p>
        <div className="coverage-list">
          {op.coverage.map((s) => (
            <button
              className="preference-row"
              key={s.id}
              onClick={() => {
                setCoverage(s.id);
                setName(s.name);
                setRole(s.role);
                setDays(s.days);
                setStart(s.start);
                setEnd(s.end);
              }}
            >
              <span>
                {s.name} · {s.role}
              </span>
              <b>
                {s.days.map((d) => dayNames[d]).join(', ')} · {s.start}–{s.end}
              </b>
            </button>
          ))}
        </div>
        {owner && (
          <form
            className="compact-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act({ action: 'coverage-save', id: coverageId, name, role, days, start, end })
              ) {
                setName('');
                setCoverage(undefined);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Staff display name
                <input required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Coverage role
                <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                  <option value="instructor">Instructor</option>
                  <option value="grader">Additional grader</option>
                </select>
              </label>
              <label>
                Starts
                <input
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Ends
                <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
            <DayPicker value={days} onChange={setDays} label="Coverage days" />
            <button className="secondary" disabled={busy}>
              {coverageId ? 'Update coverage' : 'Add staff coverage'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
