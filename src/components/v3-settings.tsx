'use client';
import { useState } from 'react';
import type { Snapshot } from '@/lib/model';
import type { Subject } from '@/lib/v2-model';
import type { V3Act } from './v3-shared';
export function V3Settings({ db, act, busy }: { db: Snapshot; act: V3Act; busy: boolean }) {
  const [tiles, setTiles] = useState(
      (
        db.operations!.v3!.instructorTiles[db.staff.name] || [
          'Focused well',
          'Needed reminders',
          'Worked independently',
          'Needed help',
        ]
      ).join(', '),
    ),
    [subject, setSubject] = useState<Subject>('Math'),
    [level, setLevel] = useState('D'),
    [first, setFirst] = useState(1),
    [last, setLast] = useState(200),
    [order, setOrder] = useState(8),
    [source, setSource] = useState('');
  return (
    <div className="settings-grid v3-settings">
      <section className="panel settings-card">
        <h2>Preferred observation shortcuts</h2>
        <p>Up to six concise tiles. Student-pinned shortcuts appear first.</p>
        <label>
          Instructor shortcuts (comma-separated)
          <input value={tiles} onChange={(e) => setTiles(e.target.value)} />
        </label>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void act({
              action: 'shortcuts',
              tiles: tiles
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 6),
            })
          }
        >
          Save instructor shortcuts
        </button>
      </section>
      {db.staff.role === 'owner' && (
        <section className="panel settings-card">
          <h2>Curriculum boundaries</h2>
          <p className="small muted">
            Explicit center-approved bounds. The supplied catalog is fictional demonstration data,
            not a certified Kumon catalog. Unknown identifiers stop planning. Reading AI/AII etc.
            stay distinct; legacy A/B/C are not silently remapped.
          </p>
          <details>
            <summary>Approve or update a curriculum entry</summary>
            <div className="form-grid">
              <label>
                Catalog subject
                <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
                  <option>Math</option>
                  <option>Reading</option>
                </select>
              </label>
              <label>
                Curriculum identifier
                <input value={level} onChange={(e) => setLevel(e.target.value)} />
              </label>
              <label>
                First worksheet
                <input
                  type="number"
                  value={first}
                  onChange={(e) => setFirst(Number(e.target.value))}
                />
              </label>
              <label>
                Last worksheet
                <input
                  type="number"
                  value={last}
                  onChange={(e) => setLast(Number(e.target.value))}
                />
              </label>
              <label>
                Explicit sequence order
                <input
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(Number(e.target.value))}
                />
              </label>
              <label>
                Verification source / reason
                <input value={source} onChange={(e) => setSource(e.target.value)} />
              </label>
            </div>
            <button
              className="secondary"
              disabled={busy || source.trim().length < 3}
              onClick={() =>
                void act({ action: 'catalog', subject, id: level, first, last, order, source })
              }
            >
              Approve catalog entry
            </button>
          </details>
        </section>
      )}
    </div>
  );
}
