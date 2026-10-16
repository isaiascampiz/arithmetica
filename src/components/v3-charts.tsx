'use client';
import { useState } from 'react';
import { dayKey, type Snapshot, type Student } from '@/lib/model';
import { addDays } from '@/lib/schedule';
import { centerActivity, measuredMinutes } from '@/lib/v3-analytics';
import type { Subject } from '@/lib/v2-model';
import { Empty, time } from './shared-ui';
const periods = ['Week', 'Month', '3 months', '6 months'] as const;
export function ProgressCharts({ db, student }: { db: Snapshot; student: Student }) {
  const [period, setPeriod] = useState<string>('Month'),
    [whole, setWhole] = useState(false);
  const op = db.operations!,
    today = dayKey(new Date(), db.timezone),
    start = addDays(
      today,
      -({ Week: 7, Month: 30, '3 months': 90, '6 months': 180 }[period] || 30),
    ),
    cfg = op.students[student.id];
  const visits = db.visits
    .filter((v) => v.studentId === student.id && dayKey(v.arrivedAt, db.timezone) >= start)
    .sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  const paper = (['Math', 'Reading'] as Subject[]).filter(
    (sub) => cfg.subjects[sub].enrolled && cfg.subjects[sub].format === 'Paper',
  );
  return (
    <div className="progress-v3">
      <div className="screen-toolbar">
        <div className="segmented">
          {periods.map((p) => (
            <button className={period === p ? 'selected' : ''} key={p} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
      {paper.length > 0 && (
        <>
          <section className="panel chart-card">
            <header>
              <h2>Academic progression</h2>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={whole}
                  onChange={(e) => setWhole(e.target.checked)}
                />
                Entire program
              </label>
            </header>
            <p className="small muted">
              Recorded milestones; issued material is not verified completed work. Repetition does
              not lower the highest recorded position.
            </p>
            {paper.map((sub) => {
              const milestones = [
                ...op.completions
                  .filter((c) => c.studentId === student.id && c.subject === sub && c.active)
                  .map((c) => ({
                    at: c.at,
                    level: c.level,
                    end: Math.max(...c.worksheets),
                    label: 'Verified ' + c.level + Math.max(...c.worksheets),
                  })),
                ...op.decisions
                  .filter((d) => d.studentId === student.id && d.subject === sub && d.approvedAt)
                  .map((d) => ({
                    at: d.approvedAt!,
                    level: d.range.level,
                    end: d.range.end,
                    label:
                      (d.kind.includes('repeat')
                        ? 'Repeat'
                        : d.kind === 'review'
                          ? 'Assessment'
                          : 'Decision') +
                      ' ' +
                      d.range.level +
                      d.range.start +
                      '–' +
                      d.range.end,
                  })),
                ...op.assignments
                  .filter((a) => a.studentId === student.id && a.subject === sub && a.v3?.issuedAt)
                  .flatMap((a) =>
                    a.v3!.issued.map((p) => ({
                      at: a.v3!.issuedAt!,
                      level: p.range.level,
                      end: p.range.end,
                      label: 'Issued ' + p.range.level + p.range.start + '–' + p.range.end,
                    })),
                  ),
              ]
                .filter(
                  (m) =>
                    dayKey(m.at, db.timezone) >= start &&
                    (whole || m.level === cfg.subjects[sub].level),
                )
                .sort((a, b) => a.at.localeCompare(b.at));
              const points = milestones
                .map((m) => {
                  const l = op.v3!.catalog.find((l) => l.subject === sub && l.id === m.level);
                  return { ...m, position: l ? (whole ? l.order * 10000 + m.end : m.end) : null };
                })
                .filter((m) => m.position !== null);
              let highest = 0;
              const values = points.map((p) => {
                  highest = Math.max(highest, p.position!);
                  return highest;
                }),
                max = Math.max(...values, 1),
                min = Math.min(...values, 0);
              const coords = values
                .map(
                  (v, i) =>
                    `${20 + (i * 560) / Math.max(values.length - 1, 1)},${140 - ((v - min) / (max - min || 1)) * 110}`,
                )
                .join(' ');
              return (
                <div key={sub}>
                  <h3>
                    {sub} · {cfg.subjects[sub].level}
                  </h3>
                  {points.length ? (
                    <>
                      <svg
                        className="milestone-chart"
                        viewBox="0 0 600 160"
                        role="img"
                        aria-label={sub + ' recorded academic milestones'}
                      >
                        <line x1="20" y1="140" x2="580" y2="140" stroke="var(--line)" />
                        <polyline
                          points={coords}
                          fill="none"
                          stroke="var(--brand)"
                          strokeWidth="3"
                        />
                        {points.map((p, i) => (
                          <circle
                            key={p.at + p.label + i}
                            cx={20 + (i * 560) / Math.max(values.length - 1, 1)}
                            cy={140 - ((values[i] - min) / (max - min || 1)) * 110}
                            r="4"
                            fill="var(--brand)"
                          >
                            <title>
                              {dayKey(p.at, db.timezone)} · {p.label}
                            </title>
                          </circle>
                        ))}
                      </svg>
                      <div className="milestone-labels">
                        {points.map((p, i) => (
                          <span key={p.at + p.label + i}>
                            {dayKey(p.at, db.timezone)} · {p.label}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Empty
                      title="No recorded academic milestones"
                      text="No graph is inferred from current configuration alone."
                    />
                  )}
                </div>
              );
            })}
          </section>
          <section className="panel chart-card">
            <h2>Homework completion consistency</h2>
            <p className="small muted">
              Reported receipt and routine planning assumptions; no assumed visit counts as
              independently verified completion.
            </p>
            {paper.map((sub) => {
              const relevant = visits.filter((v) =>
                  v.handoff?.assignmentIds.some(
                    (id) => op.assignments.find((a) => a.id === id)?.subject === sub,
                  ),
                ),
                reconciliations = op.assignments
                  .filter((a) => a.studentId === student.id && a.subject === sub && a.v3)
                  .flatMap((a) => a.v3!.reconciliations)
                  .filter((r) => dayKey(r.at, db.timezone) >= start),
                routine = relevant.filter(
                  (v) => v.handoff?.incoming === 'routine-no-exception',
                ).length;
              return (
                <div key={sub}>
                  <h3>{sub}</h3>
                  <div className="consistency-bars">
                    {[
                      ['Routine no-exception visits (assumed)', routine],
                      [
                        'Reported finished packets',
                        reconciliations.filter((r) => r.state === 'finished').length,
                      ],
                      [
                        'Returned unfinished packets',
                        reconciliations.filter((r) => r.state === 'unfinished').length,
                      ],
                      [
                        'Not returned packets',
                        reconciliations.filter((r) => r.state === 'missing').length,
                      ],
                      ['Visits with unknown receipt', visits.length - relevant.length],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <div>
                          <i
                            style={{
                              width:
                                (Number(value) /
                                  Math.max(visits.length, reconciliations.length, 1)) *
                                  100 +
                                '%',
                            }}
                          />
                        </div>
                        <b>{value}</b>
                      </div>
                    ))}
                  </div>
                  <p className="small muted">
                    {visits.length} attended sessions · {reconciliations.length} explicit packet
                    reports. Separate units; no completion percentage is inferred.
                  </p>
                </div>
              );
            })}
          </section>
        </>
      )}
      <section className="panel chart-card">
        <h2>Time spent at center</h2>
        <p className="small muted">
          Verified physical visit durations. Administrative closures are excluded.
        </p>
        {visits.some((v) => measuredMinutes(v) !== null) ? (
          <div className="duration-bars">
            {visits.map((v) => {
              const n = measuredMinutes(v);
              return (
                <div key={v.id}>
                  <span>
                    {dayKey(v.arrivedAt, db.timezone)} · {time(v.arrivedAt, db.timezone)}
                  </span>
                  <div>
                    <i style={{ width: (n === null ? 0 : Math.min((n / 120) * 100, 100)) + '%' }} />
                  </div>
                  <b>{n === null ? 'Unverified / open' : Math.round(n) + ' min'}</b>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title="No verified duration data"
            text="Open visits and unverified exits are not measured physical durations."
          />
        )}
      </section>
    </div>
  );
}
export function CenterActivity({ db }: { db: Snapshot }) {
  const [period, setPeriod] = useState('Daily'),
    [date, setDate] = useState(dayKey(new Date(), db.timezone)),
    [weekday, setWeekday] = useState('All');
  const start =
    period === 'Daily' ? date : period === 'Weekly' ? addDays(date, -6) : date.slice(0, 7) + '-01';
  const result = centerActivity(db, start, date, weekday === 'All' ? null : Number(weekday));
  const hours = result.bins.filter(
    (b) => (b.hour >= 12 && b.hour <= 20) || b.arrivals > 0 || b.occupancy > 0,
  );
  const bars = (metric: 'arrivals' | 'occupancy') => {
    const max = Math.max(1, ...hours.map((b) => b[metric]));
    return (
      <div className="activity-bars">
        {hours.map((b) => (
          <div key={b.hour}>
            <b>{metric === 'arrivals' ? b.arrivals : b.occupancy.toFixed(1)}</b>
            <div>
              <i style={{ height: (b[metric] / max) * 100 + '%' }} />
            </div>
            <span>
              {b.hour % 12 || 12}
              {b.hour < 12 ? 'a' : 'p'}
            </span>
          </div>
        ))}
      </div>
    );
  };
  return (
    <>
      <div className="screen-toolbar">
        <div className="segmented">
          {['Daily', 'Weekly', 'Monthly'].map((p) => (
            <button className={p === period ? 'selected' : ''} key={p} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
        <label>
          Period ending
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Weekday comparison
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            <option value="All">All weekdays</option>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday'].map((d, i) => (
              <option value={i + 1} key={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="panel chart-card">
        <h2>Student check-ins by hour</h2>
        <p>
          {result.visits} attendance sessions across {result.days} calendar days. Actual arrivals,
          including unresolved departures.
        </p>
        {bars('arrivals')}
      </section>
      <section className="panel chart-card">
        <h2>Average simultaneous occupancy by hour</h2>
        <p>Time-weighted average students present; distinct from arrival count.</p>
        {bars('occupancy')}
        <p className="warning-line">
          {result.excluded} unresolved/unverified visits excluded from occupancy. {result.live}{' '}
          current-day open visits contribute provisional live duration. Historical open visits never
          inflate occupancy.
        </p>
        {!result.visits && <p>No attendance source data in this period.</p>}
      </section>
    </>
  );
}
