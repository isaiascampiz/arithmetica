'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';
import type { Snapshot, Student } from '@/lib/model';
import type { Subject } from '@/lib/v2-model';
import { academicPeriods, academicWindow, type AcademicPeriod } from '@/lib/academic-progress';
import { homeworkReviews, homeworkBuckets, homeworkTotals } from '@/lib/homework-consistency';
import { progressBarUnit, progressBarLabels, progressDateLabel } from '@/lib/progress-chart';
import { packetLabel } from '@/lib/v3-planning';
import { useCenterDay } from './shared-ui';

export function HomeworkConsistency({
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
  const [period, setPeriod] = useState<AcademicPeriod>('8 weeks');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  const plot = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistent = useRef(false);
  const id = useId();
  const today = useCenterDay(db.timezone);
  const reviews = useMemo(
    () => homeworkReviews(db, student.id, subject),
    [db, student.id, subject],
  );
  const first = reviews[0]?.day || today;
  const window = detail
    ? academicWindow(period, offset, today, first)
    : academicWindow('8 weeks', 0, today, first);
  const end = window.end < today ? window.end : today;
  const visible = useMemo(
    () => reviews.filter((r) => r.day >= window.start && r.day <= end),
    [reviews, window.start, end],
  );
  const unit = progressBarUnit(detail ? period : '8 weeks', window.start, end);
  const buckets = useMemo(
    () => homeworkBuckets(visible, window.start, end, unit),
    [visible, window.start, end, unit],
  );
  const total = homeworkTotals(visible);
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
      if (!(event.target instanceof Element) || !event.target.closest('.homework-chart')) {
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
  const legend = (
    <div className="homework-legend" role="group" aria-label="Homework outcomes">
      <span>
        <i />
        Completed
      </span>
      <span>
        <i />
        Not completed
      </span>
    </div>
  );
  const headline = (
    <div className="homework-summary">
      <strong>{total.percent === null ? '\u2014' : Math.round(total.percent) + '%'}</strong>
      <span>
        {total.percent === null
          ? 'No homework reviews'
          : `completed · ${total.completed} of ${total.total} packets`}
      </span>
    </div>
  );
  return (
    <div className={'homework-consistency' + (detail ? ' detailed' : '')}>
      <div className="homework-context">
        <div>
          <p className="progress-context">
            {subject} · {detail ? 'Homework reviews' : 'Last 8 weeks'}
          </p>
          {headline}
        </div>
        {detail && (
          <label className="progress-period">
            <span>Period</span>
            <select
              aria-label="Homework period"
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
        <div className="academic-period-nav homework-period-nav">
          <button
            type="button"
            className="secondary"
            aria-label="Previous homework period"
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
            aria-label="Next homework period"
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
      <div className="homework-axis-row">{legend}</div>
      <div
        className="homework-chart"
        data-grouping={unit}
        role={detail ? 'group' : 'img'}
        aria-label={subject + ' homework completion percentages'}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && selected !== null) {
            e.preventDefault();
            e.stopPropagation();
            resetSelection();
          }
        }}
      >
        <p className="homework-unit progress-y-title">Completion (%)</p>
        <div className="homework-y-labels">
          {[0, 25, 50, 75, 100].map((n) => (
            <span key={n} style={{ bottom: n + '%' }}>
              {n}%
            </span>
          ))}
        </div>
        <div
          className="homework-plot"
          ref={plot}
          onPointerMove={
            detail
              ? (e) => {
                  if (
                    e.pointerType === 'mouse' &&
                    !(e.target instanceof Element && e.target.closest('.homework-tooltip'))
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
          {[0, 25, 50, 75, 100].map((n) => (
            <div key={n} className="homework-grid-line" style={{ bottom: n + '%' }} />
          ))}
          {buckets.map((bucket, index) => (
            <div
              className="homework-column"
              key={bucket.start}
              style={{
                left: ((index + 0.5) / buckets.length) * 100 + '%',
                width: 100 / buckets.length + '%',
              }}
            >
              {bucket.percent === null ? (
                <span className="homework-no-review" />
              ) : (
                <div className="homework-stack">
                  <span
                    className="homework-unfinished"
                    style={{ height: 100 - bucket.percent + '%' }}
                  />
                  <span className="homework-completed" style={{ height: bucket.percent + '%' }} />
                </div>
              )}
              {detail && (
                <button
                  type="button"
                  id={id + '-bar-' + index}
                  className="homework-bar-target"
                  aria-label={
                    date(bucket.start, true) +
                    (bucket.end !== bucket.start ? ' to ' + date(bucket.end, true) : '') +
                    ': ' +
                    (bucket.percent === null
                      ? 'No homework reviews'
                      : Math.round(bucket.percent) +
                        '% completed, ' +
                        bucket.completed +
                        ' of ' +
                        bucket.total +
                        ' packets')
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
          <div className="homework-x-labels">
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
              className="homework-tooltip"
              style={{
                left:
                  'clamp(0px, calc(' +
                  ((selected! + 0.5) / buckets.length) * 100 +
                  '% - 150px), max(0px, calc(100% - 300px)))',
              }}
              role="tooltip"
              aria-label="Homework review summary"
              onPointerEnter={cancelClose}
              onPointerLeave={closeSoon}
            >
              <strong>
                {date(chosen.start, true)}
                {chosen.start !== chosen.end ? ' – ' + date(chosen.end, true) : ''}
              </strong>
              {chosen.percent === null ? (
                <p>No homework reviews in this period.</p>
              ) : (
                <>
                  <p>
                    {Math.round(chosen.percent)}% completed · {chosen.completed} of {chosen.total}{' '}
                    packets
                  </p>
                  <p>
                    {chosen.unfinished} unfinished
                    {chosen.missing ? ' · ' + chosen.missing + ' not returned' : ''} ·{' '}
                    {chosen.reviews} {chosen.reviews === 1 ? 'review' : 'reviews'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="homework-footnote">
        {total.total
          ? 'Based on incoming homework reviews.'
          : 'A gap means no review, not 0% completion.'}
      </p>
      {detail && (
        <>
          <button
            className="secondary homework-history-toggle"
            type="button"
            aria-expanded={history}
            aria-controls={id + '-history'}
            onClick={() => {
              setHistory(!history);
              resetSelection();
            }}
          >
            <List size={16} />
            Homework history
          </button>
          <section id={id + '-history'} className="homework-history" hidden={!history}>
            <h3>Homework history</h3>
            <p className="small muted">
              Each return review is counted. Unmarked packets follow your completed-by-default rule.
            </p>
            {visible.length ? (
              <ul aria-label="Recorded homework history">
                {visible.toReversed().map((r) => (
                  <li key={r.id}>
                    <header>
                      <time>{date(r.day, true)}</time>
                      <span>Reviewed by {r.actor}</span>
                    </header>
                    {r.packets.length ? (
                      r.packets.map((p) => (
                        <div
                          className="homework-history-packet"
                          key={p.packet.sourceAssignmentId + ':' + p.packet.id}
                        >
                          <span className="packet-chip">{packetLabel(p.packet)}</span>
                          <span>
                            {p.outcome === 'unfinished'
                              ? 'Unfinished'
                              : p.outcome === 'missing'
                                ? 'Not returned'
                                : 'Completed'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p>No incoming homework recorded.</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No homework reviews in this period.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
