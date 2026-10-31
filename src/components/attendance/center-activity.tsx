'use client';
import { useId, useMemo, useState, type PointerEvent } from 'react';
import { dayKey, type Snapshot } from '@/lib/model';
import {
  centerAttendance,
  attendanceAxis,
  dailyTrafficBins,
  type AttendancePeriod,
} from '@/lib/center-attendance';
import { attendancePunches, type ArrivalBin } from '@/lib/center-arrivals';
import { SessionHistory } from '@/components/students/session-history';
import type { WorkspaceAction } from '@/components/ui/shared';
import { SortMenu } from '@/components/ui/list-controls';
import { useNow } from '@/components/ui/shared-ui';
import { WorkspacePeriodControls } from '@/components/workspace/workspace-period-controls';
import { InfoTip } from '@/components/ui/ui-primitives';
import './center-activity.css';
const number = (n: number | null) =>
  n === null ? '\u2014' : Number.isInteger(n) ? String(n) : n.toFixed(1);
type ActivityProps = {
  db: Snapshot;
  act: WorkspaceAction;
  busy: boolean;
  review: (id: string) => Promise<boolean>;
  error: string;
};
export function CenterActivity({ db, ...actions }: ActivityProps) {
  const now = useNow(),
    today = dayKey(now, db.timezone),
    second = Math.floor(now.getTime() / 1000);
  const [period, setPeriod] = useState<AttendancePeriod>('Daily'),
    [chosenDate, setDate] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [show, setShow] = useState(false),
    [order, setOrder] = useState('newest');
  const date = chosenDate || today;
  const data = useMemo(
    () => centerAttendance(db, date, period, query, new Date(second * 1000)),
    [db, date, period, query, second],
  );
  const bins = period === 'Daily' ? dailyTrafficBins(data.bins) : data.bins;
  const selection = bins.findIndex((b) => b.key === selected),
    initial = bins.findIndex((b) => b.partial),
    fallback = bins.findIndex((b) => (b.actual || b.expected || 0) > 0);
  const index = selection >= 0 ? selection : initial >= 0 ? initial : Math.max(0, fallback),
    bin = bins[index];
  const changeDate = (value: string | null) => {
    setDate(value);
    setSelected(null);
  };
  return (
    <div className="center-activity-workspace unified-attendance traffic-workspace">
      <WorkspacePeriodControls
        period={period}
        date={date}
        today={today}
        query={query}
        searchLabel="Search check-ins"
        dateLabel="Activity date"
        changeDate={changeDate}
        changePeriod={(p) => {
          setPeriod(p);
          setSelected(null);
        }}
        changeQuery={(value) => {
          setQuery(value);
          setSelected(null);
        }}
      />
      <section
        className="panel activity-comparison attendance-workspace"
        aria-label="Arrival traffic"
      >
        <div
          className={'traffic-summary' + (period === 'Daily' ? ' daily' : '')}
          aria-label="Attendance for selected period"
        >
          <section className="traffic-stat-group">
            <h2>
              {period === 'Daily'
                ? date === today
                  ? 'Today'
                  : new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(date + 'T12:00:00Z'))
                : 'Selected ' +
                  (period === 'Weekly' ? 'week' : period === 'Monthly' ? 'month' : 'year')}{' '}
              <InfoTip label="About arrival comparisons">
                Daily and weekly expected arrivals use up to eight earlier matching weekdays. They
                estimate arrivals, not occupancy. Monthly and yearly views show recorded check-ins
                only. The daily chart shows noon to 7 PM. Day totals and punches include all
                recorded hours.
              </InfoTip>
            </h2>
            <dl>
              <div className="recorded-stat">
                <dd>{data.total}</dd>
                <dt>Checked in</dt>
              </div>
              {data.compare && (
                <div>
                  <dd>{number(data.typical)}</dd>
                  <dt>Expected</dt>
                </div>
              )}
            </dl>
          </section>
          {period === 'Daily' && bin && (
            <section
              className="traffic-stat-group hourly-stat"
              aria-live="polite"
              aria-atomic="true"
            >
              <h2>
                {bin.partial ? 'This hour' : bin.label}
                <span>{bin.partial ? bin.label : ''}</span>
              </h2>
              <dl>
                <div className="recorded-stat">
                  <dd>{number(bin.actual)}</dd>
                  <dt>Checked in</dt>
                </div>
                <div>
                  <dd>{number(bin.expected)}</dd>
                  <dt>Expected</dt>
                </div>
              </dl>
            </section>
          )}
        </div>
        <AttendancePlot
          key={period + date + query}
          bins={bins}
          allBins={data.bins}
          compare={data.compare}
          daily={period === 'Daily'}
          index={index}
          select={(i) => setSelected(bins[i].key)}
        />
        <details className="attendance-punches" onToggle={(e) => setShow(e.currentTarget.open)}>
          <summary>
            Punches <span>{data.rows.length}</span>
          </summary>
          {show && (
            <div className="attendance-punch-content">
              <div className="punch-list-heading">
                <SortMenu
                  value={order}
                  onChange={setOrder}
                  options={[
                    { value: 'newest', label: 'Newest first' },
                    { value: 'oldest', label: 'Oldest first' },
                  ]}
                />
              </div>
              <PunchList
                key={period + date + query + order}
                db={db}
                rows={order === 'newest' ? data.rows : [...data.rows].reverse()}
                {...actions}
              />
            </div>
          )}
        </details>
      </section>
    </div>
  );
}
function AttendancePlot({
  bins,
  allBins,
  compare,
  daily,
  index,
  select,
}: {
  bins: ArrivalBin[];
  allBins: ArrivalBin[];
  compare: boolean;
  daily: boolean;
  index: number;
  select: (i: number) => void;
}) {
  const id = useId(),
    [inspect, setInspect] = useState(false),
    axis = attendanceAxis(bins),
    selected = bins[index];
  const description = (b: ArrivalBin) =>
    b.label +
    ': ' +
    (b.actual === null ? 'not yet recorded' : number(b.actual) + ' check-ins') +
    (compare ? '; expected ' + (b.expected === null ? 'unavailable' : number(b.expected)) : '');
  const point = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    select(
      Math.max(
        0,
        Math.min(bins.length - 1, Math.floor(((e.clientX - rect.left) / rect.width) * bins.length)),
      ),
    );
    setInspect(true);
  };
  const stride = daily || bins.length <= 12 ? 1 : Math.ceil(bins.length / 8);
  return (
    <div className={'attendance-plot' + (daily ? ' daily-plot' : '')}>
      <div className="attendance-legend" id={id}>
        <span>
          <i className="activity-key actual" />
          Recorded
        </span>
        {compare && (
          <span>
            <i className="activity-key expected" />
            Typical
          </span>
        )}
      </div>
      <div className="attendance-chart-frame">
        <div className="attendance-y-axis" aria-hidden="true">
          {axis.ticks.map((n) => (
            <span key={n}>{number(n)}</span>
          ))}
        </div>
        <div className="attendance-chart-viewport">
          <div
            className="attendance-chart"
            role="slider"
            tabIndex={bins.length ? 0 : -1}
            aria-label="Inspect check-ins by period"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, bins.length - 1)}
            aria-valuenow={index}
            aria-valuetext={selected ? description(selected) : 'No check-ins'}
            aria-describedby={id}
            onPointerMove={(e) => {
              if (e.pointerType === 'mouse') point(e);
            }}
            onPointerDown={point}
            onPointerLeave={() => setInspect(false)}
            onFocus={() => setInspect(true)}
            onBlur={() => setInspect(false)}
            onKeyDown={(e) => {
              const k = e.key;
              if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].includes(k)) {
                e.preventDefault();
                select(
                  k === 'Home'
                    ? 0
                    : k === 'End'
                      ? bins.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            bins.length - 1,
                            index + (k === 'ArrowRight' || k === 'ArrowUp' ? 1 : -1),
                          ),
                        ),
                );
                setInspect(true);
              }
            }}
          >
            <div className="attendance-grid" aria-hidden="true" />
            <div
              className="attendance-columns"
              style={{
                gridTemplateColumns: 'repeat(' + Math.max(1, bins.length) + ',minmax(0,1fr))',
              }}
              aria-hidden="true"
            >
              {bins.map((b, i) => (
                <div
                  className={'attendance-column' + (i === index ? ' inspected' : '')}
                  key={b.key}
                >
                  <span className="attendance-gauge-track">
                    {compare && b.expected !== null && (
                      <i
                        className="activity-expected-bar"
                        style={{
                          height: (b.expected / axis.ceiling) * 100 + '%',
                        }}
                      />
                    )}
                    {b.actual !== null && (
                      <i
                        className={'activity-actual-bar' + (b.partial ? ' partial' : '')}
                        style={{
                          height: (b.actual / axis.ceiling) * 100 + '%',
                        }}
                      />
                    )}
                  </span>
                  <span className="attendance-column-label">
                    {i % stride === 0 && (
                      <>
                        <span className="hour-full">{b.label}</span>
                        <span className="hour-compact">
                          {daily ? b.label.replace(' PM', 'p') : b.label}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {!daily && inspect && selected && (
              <div
                className="traffic-tooltip"
                role="status"
                style={{
                  left:
                    'clamp(82px,' + ((index + 0.5) / bins.length) * 100 + '%,calc(100% - 82px))',
                }}
              >
                <strong>{selected.label}</strong>
                <span>
                  <i className="activity-key actual" />
                  Recorded <b>{number(selected.actual)}</b>
                </span>
                {compare && (
                  <span>
                    <i className="activity-key expected" />
                    Typical <b>{number(selected.expected)}</b>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="sr-only">
        <table>
          <caption>Recorded check-ins for selected period</caption>
          <thead>
            <tr>
              <th>Period</th>
              <th>Check-ins</th>
              {compare && <th>Typical check-ins</th>}
            </tr>
          </thead>
          <tbody>
            {allBins.map((b) => (
              <tr key={b.key}>
                <th>{b.label}</th>
                <td>{b.actual ?? 'Not yet recorded'}</td>
                {compare && <td>{b.expected ?? 'Unavailable'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function PunchList({
  db,
  rows,
  ...actions
}: ActivityProps & { rows: ReturnType<typeof attendancePunches> }) {
  const [session, setSession] = useState<string | null>(null),
    [page, setPage] = useState(0);
  const pageSize = 30,
    pages = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, pages - 1);
  const stamp = (at: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: db.timezone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(at));
  return (
    <>
      <div className="activity-punch-list">
        {rows.slice(current * pageSize, (current + 1) * pageSize).map((p) => (
          <details className="activity-punch" key={p.id}>
            <summary>
              <span>
                <b>{db.students.find((s) => s.id === p.studentId)?.name || 'Historical student'}</b>
                <time dateTime={p.at}>{stamp(p.at)}</time>
              </span>
              <span className={p.kind === 'Check-in' ? 'punch-in' : ''}>
                {p.kind === 'Administrative closure' ? 'Closed automatically' : p.kind}
              </span>
            </summary>
            <div className="activity-punch-detail">
              <p>
                Recorded by: {p.actor}
                {p.reason ? ' · ' + p.reason : ''}
              </p>
              {db.students.some((s) => s.id === p.studentId) && (
                <button className="secondary" onClick={() => setSession(p.visitId)}>
                  View session
                </button>
              )}
            </div>
          </details>
        ))}
        {!rows.length && <p className="activity-empty">No punches in this selection.</p>}
      </div>
      {pages > 1 && (
        <div className="activity-pagination">
          <span>
            Page {current + 1} of {pages}
          </span>
          <button className="secondary" disabled={!current} onClick={() => setPage(current - 1)}>
            Previous
          </button>
          <button
            className="secondary"
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      )}
      {session && db.visits.some((v) => v.id === session) && (
        <SessionHistory
          db={db}
          visit={db.visits.find((v) => v.id === session)!}
          {...actions}
          close={() => setSession(null)}
        />
      )}
    </>
  );
}
