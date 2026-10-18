'use client';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, List, Pin } from 'lucide-react';
import { dayKey, type Snapshot, type Student } from '@/lib/model';
import {
  academicPeriods,
  academicWindow,
  academicDateTicks,
  type AcademicPeriod,
} from '@/lib/academic-progress';
import {
  skillSeries,
  skillScatter,
  skillAverage,
  skillColors,
  skillDailyAverages,
} from '@/lib/skill-progress';
import { useNow } from './shared-ui';

export type SkillView = { pins?: string[]; shown?: string[]; average?: boolean };

export function SkillProgress({
  db,
  student,
  detail,
  view,
  updateView,
}: {
  db: Snapshot;
  student: Student;
  detail: boolean;
  view: SkillView;
  updateView: (change: Partial<SkillView>) => void;
}) {
  const [period, setPeriod] = useState<AcademicPeriod>('3 months'),
    [offset, setOffset] = useState(0),
    [history, setHistory] = useState(false),
    [selected, setSelected] = useState<number | null>(null);
  const id = useId(),
    plot = useRef<HTMLDivElement>(null),
    root = useRef<HTMLDivElement>(null);
  const today = dayKey(useNow(), db.timezone);
  const series = useMemo(() => skillSeries(db, student.id), [db, student.id]);
  const colors = useMemo(() => skillColors(series), [series]);
  const all = series
    .flatMap((s) => s.records)
    .filter((r) => r.day <= today)
    .toSorted((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const window = academicWindow(
      detail ? period : '3 months',
      detail ? offset : 0,
      today,
      all[0]?.day || today,
    ),
    end = window.end < today ? window.end : today;
  const available = series
    .map((s) => ({
      ...s,
      color: colors.get(s.key)!,
      points: skillScatter(s.records, window.start, end, db.timezone),
    }))
    .filter((s) => s.points.length);
  const previewWindow = academicWindow('3 months', 0, today, all[0]?.day || today);
  const defaults = series
    .filter((s) => s.records.some((r) => r.day >= previewWindow.start && r.day <= today))
    .slice(0, 4)
    .map((s) => s.key);
  const pins = view.pins ?? defaults;
  const shown = view.shown ?? pins;
  const previewKeys = pins.slice(0, 4);
  const controls = detail
    ? available
    : previewKeys.flatMap((key) => available.filter((s) => s.key === key));
  const averageMode = !detail || view.average !== false;
  const visible = averageMode
    ? available
    : available.filter((s) => shown.includes(s.key) && (detail || previewKeys.includes(s.key)));
  const chartSeries =
    averageMode && available.length
      ? [
          {
            key: 'overall-average',
            id: 'overall-average',
            color: '#73859a',
            points: skillDailyAverages(available.flatMap((s) => s.points)),
          },
        ]
      : visible;
  const toggleSkill = (key: string) => {
    updateView({
      average: false,
      shown:
        averageMode || view.shown === undefined
          ? [key]
          : shown.includes(key)
            ? shown.filter((k) => k !== key)
            : [...shown, key],
    });
    setSelected(null);
  };
  const togglePin = (key: string) => {
    updateView({ pins: pins.includes(key) ? pins.filter((k) => k !== key) : [...pins, key] });
    setSelected(null);
  };
  const days = [...new Set(visible.flatMap((s) => s.points.map((p) => p.day)))].sort();
  const dayPoints = days.map((day) => ({
    day,
    x: visible
      .flatMap((s) => s.points)
      .filter((p) => p.day === day)
      .reduce((sum, p, _, a) => sum + p.x / a.length, 0),
  }));
  const chosen = selected === null ? null : days[selected];
  const ticks = academicDateTicks(window.start, end, detail ? 5 : 3);
  const date = (day: string, full = false) =>
    new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {
      timeZone: db.timezone,
      month: 'short',
      ...(full || period === '1 week' || period === '1 month' ? { day: 'numeric' as const } : {}),
      ...(full ? { year: 'numeric' as const } : {}),
    });
  const reset = () => setSelected(null);
  const nearest = (x: number) => {
    if (!dayPoints.length) return null;
    const rect = plot.current!.getBoundingClientRect(),
      relative = ((x - rect.left) / rect.width) * 100;
    let at = 0;
    for (let i = 1; i < dayPoints.length; i++)
      if (Math.abs(dayPoints[i].x - relative) < Math.abs(dayPoints[at].x - relative)) at = i;
    return at;
  };
  useEffect(() => {
    if (selected === null) return;
    const dismiss = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setSelected(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selected]);
  const span = Math.max(1, (Date.parse(end) - Date.parse(window.start)) / 86400000 + 1);
  const histories = days.toReversed();
  return (
    <div className={'skill-scatter' + (detail ? ' detailed' : '')}>
      <div className="skill-scatter-header">
        <div className="skill-scatter-context">
          <div>
            <p className="progress-context">
              {detail ? 'Visit-wide ratings' : 'Visit-wide observations'}
            </p>
            <p className="skill-scatter-caption">
              {detail
                ? averageMode
                  ? 'All skills average'
                  : 'Period averages'
                : '3 months \u00b7 All skills average'}
            </p>
          </div>
          {detail && (
            <div className="skill-scatter-mode">
              <button
                type="button"
                className="text-button"
                aria-pressed={averageMode}
                onClick={() => {
                  updateView({ average: true });
                  reset();
                }}
              >
                Show average
              </button>
              <button
                type="button"
                className="text-button"
                aria-pressed={!averageMode && available.every((s) => shown.includes(s.key))}
                onClick={() => {
                  updateView({ average: false, shown: available.map((s) => s.key) });
                  reset();
                }}
              >
                Show all
              </button>
            </div>
          )}
          {detail && (
            <label className="progress-period">
              <span>Period</span>
              <select
                aria-label="Skills period"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value as AcademicPeriod);
                  setOffset(0);
                  reset();
                }}
              >
                {academicPeriods.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {detail && (
          <div className="academic-period-nav skill-scatter-period-nav">
            <button
              type="button"
              className="secondary"
              aria-label="Previous skills period"
              disabled={period === 'All time' || window.start <= (all[0]?.day || today)}
              onClick={() => {
                setOffset(offset - 1);
                reset();
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span aria-live="polite">
              {date(window.start, true)} – {date(window.end, true)}
            </span>
            <button
              type="button"
              className="secondary"
              aria-label="Next skills period"
              disabled={period === 'All time' || offset >= 0}
              onClick={() => {
                setOffset(offset + 1);
                reset();
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        <div className="skill-scatter-averages" aria-label="Average skill ratings">
          {controls.map((s) => (
            <div
              className="skill-scatter-average"
              data-skill={s.id}
              key={s.key}
              style={{ '--skill-color': s.color } as CSSProperties}
            >
              {detail ? (
                <button
                  type="button"
                  className="skill-scatter-choice"
                  aria-label={
                    'Show ' +
                    s.label +
                    (s.scope !== 'Visit-wide' ? ' (' + s.scope + ')' : '') +
                    ' skill'
                  }
                  aria-pressed={!averageMode && shown.includes(s.key)}
                  onClick={() => toggleSkill(s.key)}
                >
                  <i aria-hidden="true" />
                  <span>
                    {s.label}
                    {s.scope !== 'Visit-wide' ? ' (' + s.scope + ')' : ''}
                  </span>
                  <strong
                    role="meter"
                    aria-label={
                      s.label + (s.scope !== 'Visit-wide' ? ' (' + s.scope + ')' : '') + ' average'
                    }
                    aria-valuemin={1}
                    aria-valuemax={5}
                    aria-valuenow={skillAverage(s.points)!}
                  >
                    {skillAverage(s.points)!.toFixed(1)}
                    <small>/5</small>
                  </strong>
                </button>
              ) : (
                <div className="skill-scatter-summary">
                  <i aria-hidden="true" />
                  <span>
                    {s.label}
                    {s.scope !== 'Visit-wide' ? ' (' + s.scope + ')' : ''}
                  </span>
                  <strong
                    role="meter"
                    aria-label={
                      s.label + (s.scope !== 'Visit-wide' ? ' (' + s.scope + ')' : '') + ' average'
                    }
                    aria-valuemin={1}
                    aria-valuemax={5}
                    aria-valuenow={skillAverage(s.points)!}
                  >
                    {skillAverage(s.points)!.toFixed(1)}
                    <small>/5</small>
                  </strong>
                </div>
              )}

              {detail && (
                <button
                  type="button"
                  className="skill-scatter-pin"
                  aria-label={
                    'Pin ' +
                    s.label +
                    (s.scope !== 'Visit-wide' ? ' (' + s.scope + ')' : '') +
                    ' to preview'
                  }
                  aria-pressed={pins.includes(s.key)}
                  onClick={() => togglePin(s.key)}
                >
                  <Pin size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {!available.length && <p>No skill ratings recorded in this period.</p>}
          {!!available.length && !controls.length && (
            <p>No skills pinned. Open the chart to pin skills.</p>
          )}
        </div>
      </div>
      <p className="skill-scatter-unit">Rating</p>
      <div
        className="skill-scatter-chart"
        ref={root}
        role={detail ? 'group' : 'img'}
        aria-label="Skill ratings over time, scale 1 to 5"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && selected !== null) {
            e.preventDefault();
            e.stopPropagation();
            reset();
          }
        }}
      >
        <div className="skill-scatter-y">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} style={{ bottom: ((n - 1) / 4) * 100 + '%' }}>
              {n}
            </span>
          ))}
        </div>
        <div
          className="skill-scatter-plot"
          ref={plot}
          onPointerMove={
            detail
              ? (e) => {
                  if (
                    e.pointerType === 'mouse' &&
                    !(e.target instanceof Element && e.target.closest('.skill-scatter-tooltip'))
                  )
                    setSelected(nearest(e.clientX));
                }
              : undefined
          }
          onPointerLeave={
            detail
              ? (e) => {
                  if (e.pointerType === 'mouse') reset();
                }
              : undefined
          }
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {[0, 25, 50, 75, 100].map((n) => (
              <line key={n} className="skill-scatter-grid" x1="0" x2="100" y1={n} y2={n} />
            ))}
            {ticks.map((day) => (
              <line
                key={day}
                className="skill-scatter-grid vertical"
                x1={(((Date.parse(day) - Date.parse(window.start)) / 86400000 + 0.5) / span) * 100}
                x2={(((Date.parse(day) - Date.parse(window.start)) / 86400000 + 0.5) / span) * 100}
                y1="0"
                y2="100"
              />
            ))}
            {chartSeries
              .filter((s) => s.points.length > 1)
              .map((s) => (
                <polygon
                  key={'fill:' + s.key}
                  data-skill={s.id}
                  className="skill-scatter-area"
                  fill={s.color}
                  points={
                    s.points[0].x +
                    ',100 ' +
                    s.points.map((p) => p.x + ',' + (100 - ((p.score - 1) / 4) * 100)).join(' ') +
                    ' ' +
                    s.points.at(-1)!.x +
                    ',100'
                  }
                />
              ))}
            {chartSeries.map((s) => (
              <polyline
                key={s.key}
                data-skill={s.id}
                className="skill-scatter-line"
                style={{ stroke: s.color }}
                points={s.points
                  .map((p) => p.x + ',' + (100 - ((p.score - 1) / 4) * 100))
                  .join(' ')}
              />
            ))}
          </svg>
          {chartSeries.map((s) => (
            <div
              className="skill-scatter-series"
              key={s.key}
              data-skill={s.id}
              data-color={s.color}
            >
              {s.points.map((p) => (
                <span
                  key={p.id}
                  className="skill-scatter-dot"
                  data-day={p.day}
                  data-score={p.score}
                  style={{
                    left: p.x + '%',
                    top: 100 - ((p.score - 1) / 4) * 100 + '%',
                    background: s.color,
                  }}
                />
              ))}
            </div>
          ))}
          {detail &&
            dayPoints.map((p, i) => (
              <button
                type="button"
                key={p.day}
                className="skill-scatter-target"
                id={id + '-day-' + i}
                style={{ left: p.x + '%' }}
                aria-label={'View skill ratings for ' + date(p.day, true)}
                aria-pressed={selected === i}
                aria-describedby={selected === i ? id + '-tooltip' : undefined}
                tabIndex={i === (selected ?? 0) ? 0 : -1}
                onFocus={() => setSelected(i)}
                onBlur={reset}
                onClick={(e) => {
                  const at = e.detail ? nearest(e.clientX) : i;
                  setSelected(at);
                  if (at !== null) document.getElementById(id + '-day-' + at)?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const next = (i + (e.key === 'ArrowRight' ? 1 : days.length - 1)) % days.length;
                    document.getElementById(id + '-day-' + next)?.focus();
                  }
                }}
              />
            ))}
          <div className="skill-scatter-x">
            {ticks.map((day) => (
              <span
                key={day}
                style={{
                  left:
                    (((Date.parse(day) - Date.parse(window.start)) / 86400000 + 0.5) / span) * 100 +
                    '%',
                }}
              >
                {date(day)}
              </span>
            ))}
          </div>
          {!visible.length && (
            <p className="skill-scatter-empty">
              {available.length ? 'Choose a skill above' : 'No ratings in this period'}
            </p>
          )}
          {detail && chosen && (
            <div
              id={id + '-tooltip'}
              role="tooltip"
              className="skill-scatter-tooltip"
              aria-label="Skill rating snapshot"
            >
              <strong>{date(chosen, true)}</strong>
              {averageMode && (
                <p>
                  All skills average:{' '}
                  {skillAverage(
                    available.flatMap((s) => s.points.filter((p) => p.day === chosen)),
                  )!.toFixed(1)}
                  /5
                </p>
              )}
              {visible.flatMap((s) =>
                s.points
                  .filter((p) => p.day === chosen)
                  .map((p) => (
                    <p key={p.id} style={{ '--skill-color': s.color } as CSSProperties}>
                      <i aria-hidden="true" />
                      <span>
                        {p.label}
                        {p.scope !== 'Visit-wide' ? ' (' + p.scope + ')' : ''}
                      </span>
                      <b>{p.score}/5</b>
                    </p>
                  )),
              )}
            </div>
          )}
        </div>
      </div>
      <p className="skill-scatter-footnote">
        {averageMode
          ? 'Daily mean of recorded ratings; unrated skills are excluded.'
          : 'Dots mark saved ratings; lines connect them.'}
      </p>
      {detail && (
        <>
          <button
            type="button"
            className="secondary skill-scatter-history-toggle"
            aria-expanded={history}
            aria-controls={id + '-history'}
            onClick={() => {
              setHistory(!history);
              reset();
            }}
          >
            <List size={16} />
            Skill record history
          </button>
          <section className="skill-scatter-history" id={id + '-history'} hidden={!history}>
            <h3>Skill record history</h3>
            {histories.length ? (
              <ul aria-label="Recorded skill history">
                {histories.map((day) => (
                  <li key={day}>
                    <time>{date(day, true)}</time>
                    <div>
                      {visible.flatMap((s) =>
                        s.points
                          .filter((p) => p.day === day)
                          .map((p) => (
                            <div
                              key={p.id}
                              className="skill-scatter-history-rating"
                              style={{ '--skill-color': s.color } as CSSProperties}
                            >
                              <i aria-hidden="true" />
                              <span>
                                {p.label}
                                {p.scope !== 'Visit-wide' ? ' (' + p.scope + ')' : ''}
                              </span>
                              <strong>{p.score}/5</strong>
                              <small>{p.actor}</small>
                            </div>
                          )),
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No ratings in this period.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
