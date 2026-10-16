'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import type { Snapshot } from '@/lib/model';
import type { Assignment } from '@/lib/v2-model';
import { Packets, type V3Act } from './v3-shared';
import { Empty } from './shared-ui';
export function Preparation({ db, act, busy }: { db: Snapshot; act: V3Act; busy: boolean }) {
  const [view, setView] = useState('Needs Preparation'),
    [query, setQuery] = useState('');
  const op = db.operations!;
  const assignments = op.assignments.filter((a) => {
    const c = op.students[a.studentId];
    return (
      a.v3 &&
      !a.v3.issuedAt &&
      c.active &&
      !(
        c.awayUntil &&
        c.awayUntil >
          new Intl.DateTimeFormat('en-CA', {
            timeZone: db.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date())
      ) &&
      c.subjects[a.subject].enrolled &&
      c.subjects[a.subject].format === 'Paper'
    );
  });
  const groups = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = a.studentId + '|' + a.v3!.visitDate;
    groups.set(key, [...(groups.get(key) || []), a]);
  }
  const rows = [...groups.values()]
    .filter((as) =>
      db.students
        .find((s) => s.id === as[0].studentId)!
        .name.toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        a[0].v3!.visitDate.localeCompare(b[0].v3!.visitDate) ||
        (op.students[a[0].studentId].arrivalWindow || '').localeCompare(
          op.students[b[0].studentId].arrivalWindow || '',
        ) ||
        db.students
          .find((s) => s.id === a[0].studentId)!
          .name.localeCompare(db.students.find((s) => s.id === b[0].studentId)!.name),
    );
  const ready = (as: Assignment[]) => as.every((a) => a.v3!.preparedAt && !a.stale);
  const filtered = rows.filter((as) => (view === 'Prepared' ? ready(as) : !ready(as)));
  async function mark(as: Assignment[], reprepare = false) {
    await act({
      action: 'prepare',
      ids: as.map((a) => a.id),
      versions: Object.fromEntries(as.map((a) => [a.id, a.v3!.version])),
      reprepare,
    });
  }
  const sections = (as: Assignment[]) =>
    as.map((a) => (
      <section className="prep-subject" key={a.id}>
        <div className="prep-subject-label">
          <b>{a.subject}</b>
          <span>
            {op.students[a.studentId].subjects[a.subject].sheetsPerPacket} worksheets / packet
          </span>
          {a.v3!.preparedAt && !a.stale && <span className="ready-label">✓ Prepared</span>}
          {as.length > 1 && !a.v3!.preparedAt && (
            <button
              className="text-button subject-prepare"
              type="button"
              disabled={busy || a.v3!.review.length > 0}
              onClick={() => void mark([a])}
            >
              Mark {a.subject} prepared
            </button>
          )}
        </div>
        {a.v3!.review.length > 0 ? (
          <p className="warning-line">{a.v3!.review.join(' ')}</p>
        ) : (
          <>
            <div className="packet-row">
              <small>IN CENTER</small>
              <Packets items={a.v3!.inCenter ? [a.v3!.inCenter] : []} center />
            </div>
            <div className="packet-row">
              <small>TAKE HOME</small>
              <Packets items={a.v3!.planned} />
            </div>
          </>
        )}
        {a.stale && (
          <p className="warning-line">Physical adjustment required: {a.v3!.adjustment.join(' ')}</p>
        )}
      </section>
    ));
  return (
    <>
      <div className="screen-toolbar">
        <div className="segmented">
          {['Needs Preparation', 'Prepared'].map((v) => (
            <button className={view === v ? 'selected' : ''} key={v} onClick={() => setView(v)}>
              {v}{' '}
              <span className="small">
                {rows.filter((as) => (v === 'Prepared' ? ready(as) : !ready(as))).length}
              </span>
            </button>
          ))}
        </div>
        <input
          aria-label="Search preparation"
          placeholder="Find a student…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="prep-list">
        {filtered.map((as) => {
          const s = db.students.find((s) => s.id === as[0].studentId)!,
            v = as[0].v3!;
          return view === 'Prepared' ? (
            <details className="prep-entry" key={s.id + v.visitDate}>
              <summary>
                <b>{s.name}</b>
                <span>
                  {v.visitDate} · {as.map((a) => a.subject).join(' & ')} · Prepared
                </span>
              </summary>
              {sections(as)}
            </details>
          ) : (
            <article
              className="prep-entry"
              data-preparation-student={s.id}
              key={s.id + v.visitDate}
            >
              <header>
                <div>
                  <b>{s.name}</b>
                  <span>
                    {new Intl.DateTimeFormat('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(v.visitDate + 'T12:00:00Z'))}
                    {op.students[s.id].arrivalWindow ? ' · ' + op.students[s.id].arrivalWindow : ''}
                  </span>
                </div>
                <button
                  className="secondary"
                  disabled={busy || as.some((a) => a.v3!.review.length)}
                  onClick={() =>
                    void mark(
                      as,
                      as.some((a) => a.stale),
                    )
                  }
                >
                  <Check size={16} />
                  {as.some((a) => a.stale) ? 'Confirm adjusted set' : 'Mark Prepared'}
                </button>
              </header>
              {sections(as)}
            </article>
          );
        })}
        {!filtered.length && (
          <Empty
            title={
              view === 'Prepared'
                ? 'No prepared sets in this view'
                : 'All current preparation is clear'
            }
            text="Preparation is separate from issuance. CONNECT subjects create no paper tasks."
          />
        )}
      </div>
    </>
  );
}
