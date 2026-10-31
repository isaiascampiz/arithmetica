'use client';
import { useState } from 'react';
import type { Snapshot } from '@/lib/model';
import type { Subject } from '@/lib/v2-model';
import { rangeLabel } from '@/lib/homework';
import { parseWorksheets, type Act } from './operations-ui';
import { date, time } from '@/components/ui/shared-ui';
export function ClassworkRecords({
  db,
  studentId,
  subject,
  act,
  busy,
}: {
  db: Snapshot;
  studentId: string;
  subject: Subject;
  act: Act;
  busy: boolean;
}) {
  const [id, setId] = useState<string | null>(null),
    [text, setText] = useState(''),
    [official, setOfficial] = useState(''),
    [reason, setReason] = useState(''),
    [error, setError] = useState('');
  const work = db
    .operations!.classwork.filter((w) => w.studentId === studentId && w.subject === subject)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!work.length) return null;
  return (
    <section className="panel form-panel">
      <div className="panel-heading">
        <div>
          <h2>In-center classwork records</h2>
          <p>Exact worksheet identities, partial completion and carryover stay visible.</p>
        </div>
      </div>
      {work.map((w) => (
        <article className="history-note" key={w.id}>
          <div>
            <b>{rangeLabel(w.range)}</b>
            <span className="tag">
              {w.carriedAssignmentId
                ? 'Carried home'
                : `${w.completed.length} / ${w.range.end - w.range.start + 1} complete`}
            </span>
          </div>
          <p>
            {date(w.createdAt, db.timezone)} · {time(w.createdAt, db.timezone)} · Completed:{' '}
            {w.completed.join(', ') || 'none recorded'}
          </p>
          {db.staff.role !== 'assistant' && !w.carriedAssignmentId && (
            <button
              className="text-button"
              onClick={() => {
                setId(w.id);
                setText(w.completed.join(', '));
                setOfficial('');
                setReason('');
              }}
            >
              Update / correct completion
            </button>
          )}
          {id === w.id && (
            <form
              className="compact-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (
                    await act({
                      action: 'classwork-update',
                      id: w.id,
                      completed: parseWorksheets(text),
                      officialCount: official === '' ? null : Number(official),
                      reason,
                    })
                  ) {
                    setId(null);
                    setError('');
                  }
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <label>
                Verified completed worksheet identities
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="e.g. 101–105, 108"
                />
              </label>
              <label>
                Verified official count · optional
                <input
                  type="number"
                  min={0}
                  value={official}
                  onChange={(e) => setOfficial(e.target.value)}
                />
              </label>
              <label>
                Correction / verification evidence
                <input
                  value={reason}
                  required
                  minLength={3}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="secondary" disabled={busy}>
                Save verified classwork update
              </button>
            </form>
          )}
          {w.events && (
            <details className="event-timeline">
              <summary>Classwork event history</summary>
              {w.events.map((e, i) => (
                <p key={i}>
                  {e.at} · {e.actor} · {e.completed.length} complete
                  <span>{e.reason}</span>
                </p>
              ))}
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
