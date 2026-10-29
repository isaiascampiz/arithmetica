'use client';
import { useRef, useState } from 'react';
import type { Snapshot } from '@/lib/model';
import { Modal } from './v3-shared';
import { request } from '@/lib/client';

export function RosterImport({ db }: { db: Snapshot }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ roster: unknown; count: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selection = useRef(0);
  if (db.staff.role !== 'owner' || db.runtime?.demo || db.students.length) return null;
  function close() {
    if (busy) return;
    selection.current++;
    setOpen(false);
    setDraft(null);
    setError('');
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ ok: boolean }>('/api/admin/roster', 'POST', {
        expectedRevision: db.revision, roster: draft.roster,
      });
      if (!result.ok) throw new Error('The import was not saved.');
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The import was not saved. Retry with the same file.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="secondary" onClick={() => setOpen(true)}>
        Import student roster
      </button>
      {open && (
        <Modal
          variant="form"
          title="Import student roster"
          close={close}
          footer={
            <>
              <button className="secondary" disabled={busy} onClick={close}>
                Cancel
              </button>
              <button className="primary" disabled={busy || !draft} onClick={() => void save()}>
                {busy ? 'Importing…' : `Import ${draft?.count ?? ''} students`}
              </button>
            </>
          }
        >
          <p>
            Choose the prepared roster file. Students will be available for attendance and
            observations. Teachers complete learning mode and homework setup for each subject.
          </p>
          <label>
            Prepared roster
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={async (event) => {
                const selected = ++selection.current;
                setDraft(null);
                setError('');
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  setError('Choose a prepared roster smaller than 2 MiB.');
                  return;
                }
                try {
                  const roster = JSON.parse(await file.text());
                  if (selected !== selection.current) return;
                  if (!Array.isArray(roster.profiles) || !roster.profiles.length)
                    throw new Error('Choose a prepared pending-roster file.');
                  setDraft({ roster, count: roster.profiles.length });
                } catch {
                  if (selected === selection.current)
                    setError('Choose a valid prepared pending-roster file.');
                }
              }}
            />
          </label>
          {draft && <p role="status">{draft.count} student profiles ready for import.</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
