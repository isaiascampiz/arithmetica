import type { Database } from './model';
import type { Packet } from './v3-model';
import type { Subject } from './v2-model';

/** Only packet identities captured during actual paper handoffs/receipts. */
export function verificationPackets(db: Database, visitId: string, subject: Subject) {
  const visit = db.visits.find((v) => v.id === visitId);
  if (!visit) return [];
  const packets = new Map<string, Packet>();
  const record = visit.sessionRecords?.filter((r) => r.subject === subject).at(-1);
  if (record?.format === 'Paper' && record.mode !== 'activity-only') {
    for (const p of [
      ...record.incoming.map((i) => i.packet),
      ...(record.center?.status === 'issued' ? [record.center] : []),
      ...record.outgoing,
    ])
      packets.set(p.id, p);
  }
  if (!record)
    for (const a of db.operations!.assignments.filter(
      (a) =>
        a.studentId === visit.studentId &&
        a.subject === subject &&
        a.format === 'Paper' &&
        a.v3?.visitId === visitId &&
        a.v3.issuedAt,
    )) {
      for (const p of [
        ...a.v3!.issued,
        ...(a.v3!.inCenter?.status === 'issued' ? [a.v3!.inCenter] : []),
      ])
        packets.set(p.id, p);
    }
  return [...packets.values()].flatMap((packet) => {
    const source = db.operations!.assignments.find(
      (a) =>
        a.id === packet.sourceAssignmentId &&
        a.studentId === visit.studentId &&
        a.subject === subject &&
        a.v3 &&
        a.format === 'Paper',
    );
    return source
      ? [
          {
            packet,
            source,
            verificationVersion: db.operations!.completions.filter(
              (c) =>
                c.packetId === packet.id &&
                c.studentId === visit.studentId &&
                c.subject === subject,
            ).length,
          },
        ]
      : [];
  });
}

/** Unknown/contradictory evidence is disclosed, never converted into paper. */
export function verifiedPaperEntries(db: Database) {
  const candidates = db.operations!.completions.filter(
    (c) =>
      c.active &&
      (c.format === 'Paper' ||
        (!c.format &&
          db.operations!.assignments.some(
            (a) => a.id === c.assignmentId && a.format === 'Paper',
          ))) &&
      c.verifiedBy.trim().length > 0 &&
      c.worksheets.length > 0 &&
      c.worksheets.every((n) => Number.isInteger(n) && n > 0) &&
      new Set(c.worksheets).size === c.worksheets.length &&
      c.physicalSheets === c.worksheets.length,
  );
  const occurrences = new Map<string, number>();
  const identity = (c: (typeof candidates)[number], n: number) =>
    JSON.stringify([c.studentId, c.subject, c.packetId || c.assignmentId, c.level, n]);
  for (const entry of candidates)
    for (const n of entry.worksheets) {
      const key = identity(entry, n);
      occurrences.set(key, (occurrences.get(key) || 0) + 1);
    }
  // Conflicting active records require review; neither is silently preferred.
  return candidates.filter((entry) =>
    entry.worksheets.every((n) => occurrences.get(identity(entry, n)) === 1),
  );
}
