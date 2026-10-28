'use client';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, List, Pin, ChevronDown } from 'lucide-react';
import type { Snapshot, Student } from '@/lib/model';
import { academicPeriods, academicWindow, type AcademicPeriod } from '@/lib/academic-progress';
import {
  skillSeries,
  skillScatter,
  skillAverage,
  skillColors,
  skillDailyAverages,
} from '@/lib/skill-progress';
import { progressDayX, progressTimeAxis, progressDateLabel } from '@/lib/progress-chart';
import { useProgressPlotWidth } from './v3-progress-chart';
import { useCenterDay } from './shared-ui';

export type SkillView = { pins?: string[]; skill?: string };

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
  const [period, setPeriod] = useState<AcademicPeriod>('8 weeks'),
    [offset, setOffset] = useState(0),
    [history, setHistory] = useState(false),
    [selected, setSelected] = useState<number | null>(null);
  const id = useId(),
    plot = useRef<HTMLDivElement>(null),
    root = useRef<HTMLDivElement>(null);
  const today = useCenterDay(db.timezone);
  const series = useMemo(() => skillSeries(db, student.id), [db, student.id]);
  const colors = useMemo(() => skillColors(series), [series]);
  const all = series
    .flatMap((s) => s.records)
    .filter((r) => r.day <= today)
    .toSorted((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const previewWindow = academicWindow('8 weeks', 0, today, all[0]?.day || today);
  const window = detail
      ? academicWindow(period, offset, today, all[0]?.day || today)
      : previewWindow,
    end = window.end < today ? window.end : today;
  const available = series
    .map((s) => ({
      ...s,
      color: colors.get(s.key)!,
      points: skillScatter(s.records, window.start, end, db.timezone).map((p) => ({
        ...p,
        x: progressDayX(p.day, window.start, window.end),
      })),
    }))
    .filter((s) => s.points.length);
  const defaults = series
    .filter((s) => s.records.some((r) => r.day >= previewWindow.start && r.day <= today))
    .slice(0, 3)
    .map((s) => s.key);
  const pins = (view.pins ?? defaults).slice(0, 3);
  const previewKeys = pins.slice(0, 3);
  const controls = previewKeys.flatMap((key) => available.filter((s) => s.key === key));
  const averageMode = !detail || !view.skill;
  const visible = averageMode ? available : available.filter((s) => s.key === view.skill);
  const chosenSeries = series.find((s) => s.key === view.skill);
  const title = averageMode
    ? 'All skills average'
    : chosenSeries
      ? chosenSeries.label +
        (chosenSeries.scope !== 'Visit-wide' ? ' (' + chosenSeries.scope + ')' : '')
      : 'Skill';
  const mean = skillAverage(visible.flatMap((s) => s.points));
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
  const togglePin = (key: string) => {
    if (!pins.includes(key) && pins.length >= 3) return;
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
  const plotWidth = useProgressPlotWidth(plot);
  const { grids, labels: ticks } = progressTimeAxis(window.start, window.end, plotWidth, detail);
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
  const histories = days.toReversed();
  return (
    <div className={'skill-scatter' + (detail ? ' detailed' : '')}>
      <div className="skill-scatter-header">
        <div className="skill-scatter-summary-panel">
          <div className="skill-scatter-context">
            <div>
              <p className="skill-scatter-caption">
                {detail ? 'Average rating' : 'All skills average \u00b7 Last 8 weeks'}
              </p>
              {mean !== null && (
                <strong
                  className="skill-scatter-headline"
                  role="meter"
                  aria-label={title + (averageMode ? '' : ' average')}
                  aria-valuemin={1}
                  aria-valuemax={5}
                  aria-valuenow={mean}
                >
                  {mean.toFixed(1)}
                  <small>/5</small>
                </strong>
              )}
              {!detail && mean !== null && (
                <span className="skill-scatter-average-label">Average rating</span>
              )}
            </div>
            {detail && (
              <SkillViewMenu
                title={title}
                items={series
                  .filter((s) => s.records.length)
                  .map((s) => ({
                    key: s.key,
                    label: s.label + (s.scope !== 'Visit-wide' ? ' (' + s.scope + ')' : ''),
                    color: colors.get(s.key)!,
                  }))}
                value={view.skill || ''}
                pins={pins}
                togglePin={togglePin}
                choose={(skill) => {
                  updateView({ skill: skill || undefined });
                  reset();
                }}
              />
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
        </div>
        {!detail && (
          <div
            id={id + '-preview'}
            className="skill-scatter-averages"
            aria-label="Average skill ratings"
          >
            {controls.map((s) => (
              <div
                className="skill-scatter-average"
                data-skill={s.id}
                key={s.key}
                style={{ '--skill-color': s.color } as CSSProperties}
              >
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
              </div>
            ))}
            {!available.length && <p>No skill ratings recorded in this period.</p>}
            {!!available.length && !controls.length && (
              <p>No skills pinned. Open the chart to pin skills.</p>
            )}
          </div>
        )}

        {detail && !visible.length && <p>No skill ratings recorded in this period.</p>}
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
      </div>
      <div className="progress-axis-row" aria-hidden="true" />
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
        <p className="skill-scatter-unit progress-y-title">Rating</p>
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
                  if (
                    e.pointerType === 'mouse' &&
                    !e.currentTarget.contains(document.activeElement)
                  )
                    reset();
                }
              : undefined
          }
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {[0, 25, 50, 75, 100].map((n) => (
              <line key={n} className="skill-scatter-grid" x1="0" x2="100" y1={n} y2={n} />
            ))}
            {grids.map((day) => (
              <line
                key={day}
                className="skill-scatter-grid vertical"
                x1={progressDayX(day, window.start, window.end)}
                x2={progressDayX(day, window.start, window.end)}
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
                data-date={day}
                style={{
                  left: progressDayX(day, window.start, window.end) + '%',
                }}
              >
                {progressDateLabel(day, window.start, window.end)}
              </span>
            ))}
          </div>
          {!visible.length && <p className="skill-scatter-empty">No ratings in this period</p>}
          {detail && chosen && (
            <div
              id={id + '-tooltip'}
              role="tooltip"
              className="skill-scatter-tooltip"
              style={{
                left:
                  'clamp(0px, calc(' +
                  dayPoints[selected!].x +
                  '% - 150px), max(0px, calc(100% - 300px)))',
              }}
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

function SkillViewMenu({
  title,
  items,
  value,
  pins,
  togglePin,
  choose,
}: {
  title: string;
  items: { key: string; label: string; color: string }[];
  value: string;
  pins: string[];
  togglePin: (key: string) => void;
  choose: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  const select = (key: string) => {
    choose(key);
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="skill-view-menu"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <span className="skill-view-label">View</span>
      <button
        ref={trigger}
        type="button"
        className="skill-view-trigger"
        aria-label="Skills view"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          className="skill-view-options"
          role="group"
          aria-label="Skill views and preview pins"
        >
          <p role="status">
            {pins.length} of 3 pinned to preview
            {pins.length === 3 ? ' \u00b7 Unpin one to replace it' : ''}
          </p>
          <button
            type="button"
            className="skill-view-option"
            aria-pressed={!value}
            onClick={() => select('')}
          >
            All skills average
          </button>
          {items.map((s) => (
            <div
              className="skill-view-row"
              key={s.key}
              data-skill-key={s.key}
              style={{ '--skill-color': s.color } as CSSProperties}
            >
              <button
                type="button"
                className="skill-view-option"
                aria-pressed={value === s.key}
                onClick={() => select(s.key)}
              >
                <i aria-hidden="true" />
                {s.label}
              </button>
              <button
                type="button"
                className="skill-scatter-pin"
                aria-label={'Pin ' + s.label + ' to preview'}
                aria-pressed={pins.includes(s.key)}
                disabled={!pins.includes(s.key) && pins.length >= 3}
                onClick={() => togglePin(s.key)}
              >
                <Pin size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
