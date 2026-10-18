'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';
import { dayKey, type Snapshot, type Student } from '@/lib/model';
import { academicPeriods, academicWindow, type AcademicPeriod } from '@/lib/academic-progress';
import {
  durationVisits,
  durationBuckets,
  durationTotals,
  durationAxis,
} from '@/lib/center-duration';
import { progressBarUnit, progressBarLabels, progressDateLabel } from '@/lib/progress-chart';
import { time, useNow } from './shared-ui';

export function CenterDuration({
  db,
  student,
  detail,
}: {
  db: Snapshot;
  student: Student;
  detail: boolean;
}) {
  const [period, setPeriod] = useState<AcademicPeriod>('8 weeks');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  const plot = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistent = useRef(false);
  const id = useId();
  const today = dayKey(useNow(), db.timezone);
  const visits = useMemo(() => durationVisits(db, student.id), [db, student.id]);
  const first = visits[0]?.day || today;
  const window = detail
    ? academicWindow(period, offset, today, first)
    : academicWindow('8 weeks', 0, today, first);
  const end = window.end < today ? window.end : today;
  const visible = useMemo(
    () => visits.filter((r) => r.day >= window.start && r.day <= end),
    [visits, window.start, end],
  );
  const unit = progressBarUnit(detail ? period : '8 weeks', window.start, end);
  const buckets = useMemo(
    () => durationBuckets(visible, window.start, end, unit),
    [visible, window.start, end, unit],
  );
  const total = durationTotals(visible);
  const axis = durationAxis(buckets.map((b) => b.average));
  const chosen = selected === null ? null : buckets[selected];
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const closeSoon = () => {
    cancelClose();
    if (!persistent.current) closeTimer.current = setTimeout(() => setSelected(null), 160);
  };
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (selected === null) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.center-time-chart')) {
        persistent.current = false;
        setSelected(null);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selected]);
  const date = (day: string, full = false) =>
    new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {
      timeZone: db.timezone,
      month: 'short',
      ...(unit !== 'month' || full ? { day: 'numeric' as const } : {}),
      ...(full ? { year: 'numeric' as const } : {}),
    });
  const resetSelection = () => {
    setSelected(null);
    persistent.current = false;
  };
  const nearest = (clientX: number) => {
    const rect = plot.current!.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        buckets.length - 1,
        Math.floor(((clientX - rect.left) / rect.width) * buckets.length),
      ),
    );
  };
  const headline = (
    <div className="center-time-summary">
      <strong>{total.average === null ? '\u2014' : Math.round(total.average) + ' min'}</strong>
      <span>{total.average === null ? 'No measured visits' : 'Average visit'}</span>
    </div>
  );
  return (
    <div className={'center-duration' + (detail ? ' detailed' : '')}>
      <div className="center-time-context">
        <div>
          <p className="progress-context">
            All subjects · {detail ? 'Physical attendance' : 'Last 8 weeks'}
          </p>
          {headline}
        </div>
        {detail && (
          <label className="progress-period">
            <span>Period</span>
            <select
              aria-label="Duration period"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as AcademicPeriod);
                setOffset(0);
                resetSelection();
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
        <div className="academic-period-nav center-time-period-nav">
          <button
            type="button"
            className="secondary"
            aria-label="Previous duration period"
            disabled={period === 'All time' || window.start <= first}
            onClick={() => {
              setOffset(offset - 1);
              resetSelection();
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
            aria-label="Next duration period"
            disabled={period === 'All time' || offset >= 0}
            onClick={() => {
              setOffset(offset + 1);
              resetSelection();
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      <div className="progress-axis-row" aria-hidden="true" />
      <div
        className="center-time-chart"
        data-grouping={unit}
        role={detail ? 'group' : 'img'}
        aria-label="Average visit duration in minutes"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && selected !== null) {
            e.preventDefault();
            e.stopPropagation();
            resetSelection();
          }
        }}
      >
        <p className="center-time-unit progress-y-title">Minutes per visit</p>
        <div className="center-time-y-labels">
          {axis.ticks.map((n) => (
            <span key={n} style={{ bottom: (n / axis.top) * 100 + '%' }}>
              {n}
            </span>
          ))}
        </div>
        <div
          className="center-time-plot"
          ref={plot}
          onPointerMove={
            detail
              ? (e) => {
                  if (
                    e.pointerType === 'mouse' &&
                    !(e.target instanceof Element && e.target.closest('.center-time-tooltip'))
                  ) {
                    persistent.current = false;
                    cancelClose();
                    setSelected(nearest(e.clientX));
                  }
                }
              : undefined
          }
          onPointerLeave={detail ? closeSoon : undefined}
        >
          {axis.ticks.map((n) => (
            <div
              key={n}
              className="center-time-grid-line"
              style={{ bottom: (n / axis.top) * 100 + '%' }}
            />
          ))}
          {buckets.map((bucket, index) => (
            <div
              className="center-time-column"
              key={bucket.start}
              style={{
                left: ((index + 0.5) / buckets.length) * 100 + '%',
                width: 100 / buckets.length + '%',
              }}
            >
              {bucket.average === null ? (
                <span className="center-time-no-visit" />
              ) : (
                <div
                  className="center-time-bar"
                  style={{ height: (bucket.average / axis.top) * 100 + '%' }}
                />
              )}
              {detail && (
                <button
                  type="button"
                  id={id + '-bar-' + index}
                  className="center-time-bar-target"
                  aria-label={
                    date(bucket.start, true) +
                    (bucket.end !== bucket.start ? ' to ' + date(bucket.end, true) : '') +
                    ': ' +
                    (bucket.average === null
                      ? 'No measured visits'
                      : Math.round(bucket.average) +
                        ' minutes average, ' +
                        bucket.count +
                        ' visits')
                  }
                  aria-pressed={selected === index}
                  aria-describedby={selected === index ? id + '-tooltip' : undefined}
                  tabIndex={
                    selected === null ? (index === 0 ? 0 : -1) : selected === index ? 0 : -1
                  }
                  onFocus={() => {
                    cancelClose();
                    setSelected(index);
                  }}
                  onBlur={() => {
                    persistent.current = false;
                    closeSoon();
                  }}
                  onPointerDown={(e) => {
                    persistent.current = e.pointerType !== 'mouse';
                  }}
                  onClick={(e) => {
                    const target = e.detail ? nearest(e.clientX) : index;
                    setSelected(target);
                    document.getElementById(id + '-bar-' + target)?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      const next =
                        (index + (e.key === 'ArrowRight' ? 1 : buckets.length - 1)) %
                        buckets.length;
                      document.getElementById(id + '-bar-' + next)?.focus();
                    }
                  }}
                />
              )}
            </div>
          ))}
          <div className="center-time-x-labels">
            {progressBarLabels(buckets.length, unit, detail).map((i) => (
              <span
                key={buckets[i].start}
                data-date={buckets[i].start}
                style={{ left: ((i + 0.5) / buckets.length) * 100 + '%' }}
              >
                {progressDateLabel(buckets[i].start, window.start, window.end)}
              </span>
            ))}
          </div>
          {detail && chosen && (
            <div
              id={id + '-tooltip'}
              className="center-time-tooltip"
              style={{
                left:
                  'clamp(0px, calc(' +
                  ((selected! + 0.5) / buckets.length) * 100 +
                  '% - 150px), max(0px, calc(100% - 300px)))',
              }}
              role="tooltip"
              aria-label="Visit duration summary"
              onPointerEnter={cancelClose}
              onPointerLeave={closeSoon}
            >
              <strong>
                {date(chosen.start, true)}
                {chosen.start !== chosen.end ? ' – ' + date(chosen.end, true) : ''}
              </strong>
              {chosen.average === null ? (
                <p>No measured visits in this period.</p>
              ) : (
                <>
                  <p>{Math.round(chosen.average)} minutes average</p>
                  <p>
                    {chosen.count} {chosen.count === 1 ? 'visit' : 'visits'} ·{' '}
                    {Math.round(chosen.total)} minutes total
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="center-time-footnote">
        Confirmed physical departures only. Gaps mean no measured visits.
      </p>
      {detail && (
        <>
          <button
            className="secondary center-time-history-toggle"
            type="button"
            aria-expanded={history}
            aria-controls={id + '-history'}
            onClick={() => {
              setHistory(!history);
              resetSelection();
            }}
          >
            <List size={16} />
            Visit history
          </button>
          <section id={id + '-history'} className="center-time-history" hidden={!history}>
            <h3>Visit history</h3>
            {visible.length ? (
              <ul aria-label="Recorded visit history">
                {visible.toReversed().map((r) => (
                  <li key={r.id}>
                    <header>
                      <time>{date(r.day, true)}</time>
                      <strong>{Math.round(r.minutes)} min</strong>
                    </header>
                    <dl className="center-time-visit-times">
                      <div>
                        <dt>Checked in</dt>
                        <dd>{time(r.arrivedAt, db.timezone)}</dd>
                      </div>
                      <div>
                        <dt>Checked out</dt>
                        <dd>
                          {time(r.departedAt, db.timezone)}
                          {dayKey(r.arrivedAt, db.timezone) !== dayKey(r.departedAt, db.timezone)
                            ? ' (' + date(dayKey(r.departedAt, db.timezone), true) + ')'
                            : ''}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No measured visits in this period.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
