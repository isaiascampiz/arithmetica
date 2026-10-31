'use client';
import { useState } from 'react';
import { dayKey, type Snapshot } from '@/lib/model';
import type { Subject } from '@/lib/v2-model';
import { verificationPackets } from '@/lib/completion-evidence';
import { packetLabel } from '@/lib/v3-planning';
import type { WorkspaceAction } from '@/components/ui/shared';

export function VerifyCompletion({
  db,
  visitId,
  subject,
  act,
  busy,
}: {
  db: Snapshot;
  visitId: string;
  subject: Subject;
  act: WorkspaceAction;
  busy: boolean;
}) {
  const [evidence, setEvidence] = useState(() => verificationPackets(db, visitId, subject));
  const [packetId, setPacket] = useState(evidence[0]?.packet.id || '');
  const [sheets, setSheets] = useState('');
  const [date, setDate] = useState(dayKey(new Date(), db.timezone));
  const [reason, setReason] = useState('');
  const [supersedes, setSupersedes] = useState<string | undefined>();
  const [status, setStatus] = useState('');
  const chosen = evidence.find((e) => e.packet.id === packetId);
  if (!chosen || db.staff.role === 'assistant') return null;
  const verified = db.operations!.completions.filter((c) => c.active && c.packetId === packetId);
  const parsed = sheets.split(',').map((s) => Number(s.trim()));
  const valid =
    sheets.trim() &&
    parsed.every(
      (n) => Number.isInteger(n) && n >= chosen.packet.range.start && n <= chosen.packet.range.end,
    ) &&
    new Set(parsed).size === parsed.length;
  return (
    <details className="verify-completion">
      <summary>Verify completed sheets</summary>
      <p className="small muted">
        Record sheets you have explicitly checked. Receipt assumptions and issued packets do not
        count as verified completion.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          if (
            await act({
              action: 'verify-sheets',
              visitId,
              subject,
              packetId,
              expectedSourceVersion: chosen.source.v3!.version,
              expectedVerificationVersion: chosen.verificationVersion,
              worksheets: parsed,
              completedDate: date,
              reason,
              ...(supersedes ? { supersedes } : {}),
            })
          ) {
            setEvidence((items) =>
              items.map((item) =>
                item.packet.id === packetId
                  ? {
                      ...item,
                      verificationVersion: item.verificationVersion + 1,
                    }
                  : item,
              ),
            );
            setSheets('');
            setReason('');
            setSupersedes(undefined);
            setStatus('Verified completion saved.');
          }
        }}
      >
        <label>
          Recorded paper packet
          <select
            value={packetId}
            onChange={(e) => {
              setPacket(e.target.value);
              setSheets('');
              setSupersedes(undefined);
              setReason('');
            }}
          >
            {evidence.map((e) => (
              <option value={e.packet.id} key={e.packet.id}>
                {packetLabel(e.packet)} · {e.packet.purpose}
              </option>
            ))}
          </select>
        </label>
        {verified.map((entry) => (
          <p className="small" key={entry.id}>
            Verified {entry.worksheets.join(', ')} · {entry.completedDate} · {entry.verifiedBy}{' '}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSupersedes(entry.id);
                setSheets(entry.worksheets.join(', '));
                setDate(entry.completedDate || dayKey(entry.at, db.timezone));
                setReason('');
              }}
            >
              Correct verification
            </button>
          </p>
        ))}
        {supersedes && (
          <p className="small">Correcting an earlier verification. Its history will be retained.</p>
        )}
        <label>
          Verified worksheet numbers (comma-separated)
          <input
            required
            value={sheets}
            placeholder={`${chosen.packet.range.start}, ${chosen.packet.range.start + 1}`}
            onChange={(e) => setSheets(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            setSheets(
              Array.from(
                {
                  length: chosen.packet.range.end - chosen.packet.range.start + 1,
                },
                (_, i) => i + chosen.packet.range.start,
              )
                .filter(
                  (n) => !verified.some((c) => c.id !== supersedes && c.worksheets.includes(n)),
                )
                .join(', '),
            )
          }
        >
          Select remaining sheets in this packet
        </button>
        <label>
          Actual completion date
          <input
            required
            type="date"
            max={dayKey(new Date(), db.timezone)}
            min={chosen.source.fromDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          {supersedes ? 'Correction reason' : 'Verification note'}
          <input
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p className="small muted">
          Verified by {db.staff.name} · {valid ? parsed.length : 0} physical sheets
        </p>
        <button className="secondary" disabled={busy || !valid || reason.trim().length < 3}>
          {supersedes ? 'Save corrected verification' : 'Save verified completion'}
        </button>
        {supersedes && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setSupersedes(undefined);
              setSheets('');
            }}
          >
            Cancel correction
          </button>
        )}
      </form>
      {status && <p role="status">{status}</p>}
    </details>
  );
}
