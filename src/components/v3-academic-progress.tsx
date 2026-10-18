'use client';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, List, RotateCcw } from 'lucide-react';
import { dayKey, type Snapshot, type Student } from '@/lib/model';
import type { Subject } from '@/lib/v2-model';
import {
  academicHistory,
  academicPlot,
  academicPeriods,
  academicWindow,
  academicCheckpoints,
  academicYDomain,
  type AcademicWindowPeriod,
} from '@/lib/academic-progress';
import { progressDayX, progressTimeAxis, progressDateLabel } from '@/lib/progress-chart';
import { useProgressPlotWidth } from './v3-progress-chart';
import { Empty, useNow } from './shared-ui';
import type { AcademicEvent } from '@/lib/academic-progress';

export function AcademicProgress({
  db,
  student,
  subject,
  detail,
}: {
  db: Snapshot;
  student: Student;
  subject: Subject;
  detail: boolean;
}) {
  const [period, setPeriod] = useState<AcademicWindowPeriod>('8 weeks');
  const [offset, setOffset] = useState(0);
  const plotRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<'pages' | 'repeats' | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistent = useRef(false);
  const chartId = useId();
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const closeSoon = () => {
    cancelClose();
    if (!persistent.current) closeTimer.current = setTimeout(() => setSelected(null), 180);
  };
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!selected) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('.academic-point, .academic-point-popup')
      ) {
        persistent.current = false;
        setSelected(null);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selected]);
  const today = dayKey(useNow(), db.timezone);
  const all = useMemo(() => academicHistory(db, student.id, subject), [db, student.id, subject]);
  const firstDay = all.length ? dayKey(all[0].at, db.timezone) : today;
  const window = academicWindow(detail ? period : '8 weeks', detail ? offset : 0, today, firstDay);
  const events = useMemo(
    () =>
      all.filter((e) => {
        const day = dayKey(e.at, db.timezone);
        return day >= window.start && day <= window.end && day <= today;
      }),
    [all, db.timezone, window.start, window.end, today],
  );
  const { points: rawPoints, unknown } = useMemo(
    () => academicPlot(db, subject, events),
    [db, subject, events],
  );
  const { daily, checkpoints: points } = useMemo(
    () => academicCheckpoints(rawPoints, detail ? period : '8 weeks', db.timezone),
    [rawPoints, period, detail, db.timezone],
  );
  const pointDays = useMemo(
    () => new Map(daily.map((p) => [p.at, dayKey(p.at, db.timezone)])),
    [daily, db.timezone],
  );
  const plotWidth = useProgressPlotWidth(plotRef, rawPoints.length > 0);
  const selectedPoint = points.find((p) => p.id === selected);
  const repeats = events.filter((e) => e.kind === 'repeat').toReversed();
  const number = (day: string) => Date.parse(day + 'T12:00:00Z');
  const left = number(window.start),
    right = Math.max(left + 86400000, number(window.end));
  const x = (at: string) =>
    progressDayX(pointDays.get(at) || dayKey(at, db.timezone), window.start, window.end);
  const {
    bottom,
    top,
    ticks: yTicks,
  } = academicYDomain(
    rawPoints.map((p) => p.position),
    rawPoints.length ? Math.min(...rawPoints.map((p) => p.rank)) : 0,
    rawPoints.length ? Math.max(...rawPoints.map((p) => p.rank)) + 1 : 1,
  );
  const y = (position: number) => 100 - ((position - bottom) / (top - bottom)) * 100;
  const date = (at: string | number, full = false) =>
    new Date(at).toLocaleDateString('en-US', {
      timeZone: db.timezone,
      month: 'short',
      ...(full || right - left < 120 * 86400000 ? { day: 'numeric' as const } : {}),
      ...(full || right - left >= 120 * 86400000 ? { year: 'numeric' as const } : {}),
    });
  const catalog = db
    .operations!.v3!.catalog.filter((l) => l.subject === subject)
    .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const ticks = yTicks.map((position, i) => {
    const rank = i === 0 ? Math.floor(position) : Math.max(0, Math.ceil(position) - 1);
    const level = catalog[rank];
    const scale = Math.max(
      level?.last || 200,
      ...events.filter((e) => e.kind === 'completion' && e.level === level?.id).map((e) => e.end),
    );
    return {
      id: String(i),
      position,
      label: level ? level.id + ' ' + Math.round((position - rank) * scale) : '',
    };
  });
  const pageEvents = events.filter((e) => e.kind === 'completion');
  const { grids: gridTicks, labels: dateTicks } = progressTimeAxis(
    window.start,
    window.end,
    plotWidth,
    detail,
  );
  const tickLabel = (day: string) => progressDateLabel(day, window.start, window.end);
  const move = (amount: number) => {
    setOffset(offset + amount);
    setSelected(null);
    persistent.current = false;
  };
  return (
    <div className={'academic-progress' + (detail ? ' detailed' : '')}>
      <div className="academic-context">
        <div>
          <p className="progress-context">
            {subject} {'\u00b7'} {detail ? 'Academic progress' : 'Last 8 weeks'}
          </p>
          <div className="academic-summary">
            <strong>
              {db.operations!.students[student.id].subjects[subject].level || '\u2014'}
            </strong>
            <span>Current level</span>
          </div>
        </div>
        {detail && (
          <label className="progress-period">
            <span className="academic-period-label">Period</span>
            <select
              aria-label="Academic period"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as typeof period);
                setSelected(null);
                setOffset(0);
                persistent.current = false;
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
        <div className="academic-period-nav">
          <button
            type="button"
            className="secondary"
            aria-label="Previous academic period"
            disabled={period === 'All time' || window.start <= firstDay}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span aria-live="polite">
            {date(number(window.start), true)} {'\u2013'} {date(number(window.end), true)}
          </span>
          <button
            type="button"
            className="secondary"
            aria-label="Next academic period"
            disabled={period === 'All time' || offset >= 0}
            onClick={() => move(1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      <div className="progress-axis-row" aria-hidden="true" />
      {points.length ? (
        <div
          className={'academic-chart' + (detail ? ' detailed' : '')}
          role={detail ? 'group' : 'img'}
          aria-label={subject + ' packet completion history'}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && selected) {
              event.preventDefault();
              event.stopPropagation();
              persistent.current = false;
              setSelected(null);
            }
          }}
        >
          <p className="academic-unit progress-y-title">Level / page</p>
          <div className="academic-level-labels">
            {ticks.map((level) => (
              <span key={level.id} style={{ top: y(level.position) + '%' }}>
                {level.label}
              </span>
            ))}
          </div>
          <div className="academic-plot" ref={plotRef}>
            {ticks.map((level) => (
              <div
                key={level.id}
                className="academic-grid-horizontal"
                style={{ top: y(level.position) + '%' }}
              />
            ))}
            {gridTicks.map((i) => (
              <div
                key={i}
                className="academic-grid-vertical"
                style={{ left: progressDayX(i, window.start, window.end) + '%' }}
              />
            ))}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="academic-connection"
            >
              {points.length > 1 && (
                <polygon
                  className="academic-area"
                  fill="var(--brand)"
                  points={
                    x(points[0].at) +
                    ',100 ' +
                    points.map((p) => x(p.at) + ',' + y(p.position)).join(' ') +
                    ' ' +
                    x(points.at(-1)!.at) +
                    ',100'
                  }
                />
              )}
              <path
                d={points
                  .map((p, i) => (i ? 'L ' : 'M ') + x(p.at) + ' ' + y(p.position))
                  .join(' ')}
                fill="none"
                stroke="var(--brand)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {points.map((p, index) => {
              return detail ? (
                <button
                  key={p.id}
                  id={chartId + '-' + index}
                  type="button"
                  className="academic-point"
                  tabIndex={selected ? (selected === p.id ? 0 : -1) : index === 0 ? 0 : -1}
                  style={{ left: x(p.at) + '%', top: y(p.position) + '%' }}
                  aria-label={'View ' + date(p.at, true) + ' ' + p.level + ' snapshot'}
                  aria-pressed={selected === p.id}
                  aria-describedby={selected === p.id ? chartId + '-popup' : undefined}
                  onFocus={() => {
                    cancelClose();
                    setSelected(p.id);
                  }}
                  onBlur={() => {
                    persistent.current = false;
                    closeSoon();
                  }}
                  onPointerDown={(event) => {
                    persistent.current = event.pointerType !== 'mouse';
                  }}
                  onPointerMove={(event) => {
                    if (event.pointerType !== 'mouse') return;
                    persistent.current = false;
                    cancelClose();
                    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
                    const distance = (point: typeof p) =>
                      Math.hypot(
                        event.clientX - rect.left - (x(point.at) / 100) * rect.width,
                        event.clientY - rect.top - (y(point.position) / 100) * rect.height,
                      );
                    setSelected(
                      points.reduce(
                        (best, point) => (distance(point) < distance(best) ? point : best),
                        p,
                      ).id,
                    );
                  }}
                  onPointerEnter={(event) => {
                    cancelClose();
                    if (event.pointerType === 'mouse') {
                      persistent.current = false;
                      setSelected(p.id);
                    }
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === 'mouse') closeSoon();
                  }}
                  onClick={(event) => {
                    // Nearby 44px targets can overlap on phones; select the nearest visual point.
                    const plot = event.currentTarget.parentElement!.getBoundingClientRect();
                    const distance = (point: typeof p) =>
                      Math.hypot(
                        event.clientX - plot.left - (x(point.at) / 100) * plot.width,
                        event.clientY - plot.top - (y(point.position) / 100) * plot.height,
                      );
                    const target = event.detail
                      ? points.reduce(
                          (best, point) => (distance(point) < distance(best) ? point : best),
                          p,
                        )
                      : p;
                    setSelected(target.id);
                    document.getElementById(chartId + '-' + points.indexOf(target))?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      const next =
                        (index + (e.key === 'ArrowRight' ? 1 : points.length - 1)) % points.length;
                      document.getElementById(chartId + '-' + next)?.focus();
                    }
                  }}
                >
                  <span />
                </button>
              ) : (
                <span
                  key={p.id}
                  className="academic-preview-dot"
                  style={{ left: x(p.at) + '%', top: y(p.position) + '%' }}
                />
              );
            })}
            <div className="academic-time-labels">
              {dateTicks.map((day) => (
                <span
                  key={day}
                  data-date={day}
                  style={{ left: progressDayX(day, window.start, window.end) + '%' }}
                >
                  {tickLabel(day)}
                </span>
              ))}
            </div>
          </div>
          {detail && selectedPoint && (
            <PointPopup
              id={chartId + '-popup'}
              anchorId={chartId + '-' + points.indexOf(selectedPoint)}
              subject={subject}
              at={selectedPoint.at}
              events={selectedPoint.events}
              db={db}
              enter={cancelClose}
              leave={closeSoon}
            />
          )}
        </div>
      ) : (
        <div className={'academic-empty-chart' + (detail ? ' detailed' : '')}>
          <p className="academic-unit progress-y-title">Level / page</p>
          <Empty
            title="No packet completions recorded"
            text="Issued and unfinished packets do not create completion points."
          />
        </div>
      )}
      <p className="academic-footnote">Recorded packet completions; missing work is excluded.</p>
      {detail && (
        <>
          {unknown.length > 0 && (
            <p className="small muted">
              Some levels appear in page history only because their catalog order is not recorded.
            </p>
          )}
          <div className="academic-history-actions">
            <button
              type="button"
              className="secondary"
              aria-label="View page history"
              aria-expanded={history === 'pages'}
              aria-controls={chartId + '-pages'}
              onClick={() => {
                setSelected(null);
                setHistory(history === 'pages' ? null : 'pages');
              }}
            >
              <List size={16} />
              <span>Page history</span>
            </button>
            <button
              type="button"
              className="secondary"
              aria-label="Show repeat history"
              aria-expanded={history === 'repeats'}
              aria-controls={chartId + '-repeats'}
              onClick={() => {
                setSelected(null);
                setHistory(history === 'repeats' ? null : 'repeats');
              }}
            >
              <RotateCcw size={16} />
              <span>Repeat history{repeats.length ? ` (${repeats.length})` : ''}</span>
            </button>
          </div>
          <section
            id={chartId + '-pages'}
            className="academic-history"
            hidden={history !== 'pages'}
          >
            <h3>Page history</h3>
            {pageEvents.length ? (
              <ul className="progress-record-list" aria-label="Recorded academic history">
                {pageEvents.toReversed().map((e) => (
                  <li key={e.id}>
                    <time>{dayKey(e.at, db.timezone)}</time>
                    <span>{e.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No page records in this period.</p>
            )}
          </section>
          <section
            id={chartId + '-repeats'}
            className="academic-history"
            hidden={history !== 'repeats'}
          >
            <h3>Repeat history</h3>
            {repeats.length ? (
              <ul className="academic-repeat-list" aria-label="Repeat history">
                {repeats.map((e) => (
                  <li key={e.id}>
                    <time>{date(e.at, true)}</time>
                    <h3>
                      {e.fromLevel
                        ? e.fromLevel + ' → ' + e.level
                        : 'Previous level not recorded → ' + e.level}
                    </h3>
                    <p>{e.label}</p>
                    <p className="academic-note">{e.note || 'No repeat reason recorded.'}</p>
                    <span className="small muted">Recorded by {e.actor}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No repeats recorded in this period.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PointPopup({
  id,
  anchorId,
  subject,
  at,
  events,
  db,
  enter,
  leave,
}: {
  id: string;
  anchorId: string;
  subject: Subject;
  at: string;
  events: AcademicEvent[];
  db: Snapshot;
  enter: () => void;
  leave: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const box = popup.current,
        anchor = document.getElementById(anchorId);
      if (!box || !anchor) return;
      const dot = anchor.getBoundingClientRect();
      const plot = anchor.parentElement!.getBoundingClientRect();
      box.style.width = Math.min(300, plot.width) + 'px';
      const size = box.getBoundingClientRect();
      const dialog = box.closest('dialog')!.getBoundingClientRect();
      box.style.left =
        Math.max(
          plot.left,
          Math.min(dot.x + dot.width / 2 - size.width / 2, plot.right - size.width),
        ) + 'px';
      box.style.top = Math.max(dialog.top + 64, plot.top - size.height - 6) + 'px';
      box.style.visibility = 'visible';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorId]);
  return (
    <div
      ref={popup}
      id={id}
      role="tooltip"
      aria-label="Academic snapshot"
      className="academic-point-popup"
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <header>
        <strong>
          {new Date(at).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: db.timezone,
          })}
        </strong>
        <span>{subject}</span>
      </header>
      <p className="academic-completed-packet">{events[0].label}</p>
      <span className="small muted">Homework completion recorded</span>
    </div>
  );
}
