import { quickViewDemo } from './quick-view-demo';
import type { Subject } from '../../src/lib/v2-model';
import type { Packet, SessionRecord } from '../../src/lib/v3-model';
import { dayKey } from '../../src/lib/model';

/** Separate, entirely fictional aggregate. Never merge into existing center data. */
export function academicProgressDemo(now = new Date()) {
  const db = quickViewDemo(now),
    op = db.operations!,
    student = db.students[0];
  op.center.name = 'FICTIONAL Academic progress demo · 2 years';
  const paths: Record<Subject, string[]> = {
    Math: ['6A', '5A', '4A', '3A', '2A', 'A', 'B', 'C', 'B', 'C', 'D', 'C', 'D'],
    Reading: ['7A', '6A', '5A', '4A', '5A', '4A'],
  };
  for (const subject of ['Math', 'Reading'] as Subject[]) {
    for (const [index, level] of paths[subject].entries()) {
      const prior = paths[subject][Math.max(0, index - 1)];
      const order = (id: string) =>
        op.v3!.catalog.find((l) => l.subject === subject && l.id === id)!.order;
      const repeat = order(level) < order(prior);
      const at = new Date(
        now.getTime() -
          (paths[subject].length - index) * (subject === 'Math' ? 56 : 112) * 86400000,
      ).toISOString();
      const settings = structuredClone(op.students[student.id]);
      settings.subjects[subject].level = prior;
      op.configHistory.push({
        studentId: student.id,
        at: new Date(Date.parse(at) - 60000).toISOString(),
        subjects: structuredClone(settings.subjects),
        settings,
      });
      op.decisions.push({
        id: 'fictional-academic-' + subject + '-' + index,
        studentId: student.id,
        subject,
        kind: repeat ? 'repeat-from' : 'advance',
        range: { level, start: 31, end: 35 },
        note: repeat
          ? subject === 'Math'
            ? 'Fictional example: revisit earlier material to build fluency and confidence. Start with the packet today, then continue the revised homework sequence.'
            : 'Fictional example: return to familiar reading material to strengthen independent work before moving forward.'
          : 'Fictional example: instructor recorded a new program position.',
        author: 'Fictional Demo Instructor',
        approvedBy: 'Fictional Demo Instructor',
        createdAt: at,
        approvedAt: at,
      });
    }
  }
  const previousOutgoing: Partial<Record<Subject, Packet[]>> = {};
  for (let index = 0; index < 104; index++) {
    const at = new Date(now.getTime() - (104 - index) * 7 * 86400000 + 3600000).toISOString();
    const visitId = 'fictional-academic-visit-' + index,
      records: SessionRecord[] = [],
      assignmentIds: string[] = [];
    for (const subject of ['Math', 'Reading'] as Subject[]) {
      const decision = op.decisions
        .filter(
          (d) =>
            d.studentId === student.id &&
            d.subject === subject &&
            d.approvedAt &&
            d.approvedAt <= at,
        )
        .toSorted((a, b) => b.approvedAt!.localeCompare(a.approvedAt!))[0];
      const level = decision?.range.level || paths[subject][0],
        start = 1 + (index % 8) * 25;
      const id = 'fictional-academic-set-' + subject + '-' + index;
      const packet = (offset: number, purpose: Packet['purpose']): Packet => ({
        id: id + '-packet-' + offset,
        sourceAssignmentId: id,
        purpose,
        range: { level, start: start + offset, end: start + offset + 4 },
        status: 'issued',
        prepared: true,
      });
      const center = packet(0, 'in-center'),
        outgoing = [5, 10, 15].map((offset) => packet(offset, 'homework'));
      const incoming = (previousOutgoing[subject] || []).map((p, i) => ({
        packet: structuredClone(p),
        outcome:
          index % 11 === 0 || (index % 7 === 0 && i === 0)
            ? ('unfinished' as const)
            : ('assumed completed' as const),
      }));
      const record: SessionRecord = {
        subject,
        at,
        actor: 'Fictional Demo Instructor',
        format: 'Paper',
        activity: index % 3 === 0 ? 'Both' : 'Worksheets',
        incoming,
        center,
        outgoing,
        reason:
          index > 0 && index % 7 === 0
            ? 'Fictional example: began with the earliest unfinished work and reviewed the take-home packet order.'
            : '',
      };
      records.push(record);
      previousOutgoing[subject] = outgoing;
      const template = op.assignments.find(
        (a) => a.studentId === student.id && a.subject === subject && a.v3?.issuedAt,
      )!;
      op.assignments.push({
        ...structuredClone(template),
        id,
        createdAt: at,
        updatedAt: at,
        fromDate: dayKey(at, op.center.timezone),
        nextVisit: null,
        homeworkDays: [],
        ranges: outgoing.map((p) => p.range),
        carryRanges: [],
        carryIds: [],
        targetPackets: 3,
        targetSheets: 15,
        newPackets: 3,
        newSheets: 15,
        status: 'distributed',
        stale: false,
        fingerprint: id,
        events: [
          {
            at,
            actor: record.actor,
            status: 'distributed',
            reason: 'Fictional historical packet handoff',
          },
        ],
        v3: {
          ...structuredClone(template.v3!),
          visitDate: dayKey(at, op.center.timezone),
          inCenter: center,
          planned: outgoing,
          issued: outgoing,
          held: [],
          inCenterReturns: [],
          version: 1,
          review: [],
          adjustment: [],
          originalCursor: { level, start },
          advanceCursor: { level, start: start + 20 },
          preparedAt: at,
          preparedBy: record.actor,
          issuedAt: at,
          visitId,
          reconciliations: [],
        },
      });
      assignmentIds.push(id);
    }
    op.students[student.id].observationSkills ||= [
      { id: 'focus', label: 'Focus' },
      { id: 'handwriting', label: 'Handwriting' },
      { id: 'independence', label: 'Independence' },
    ];
    db.visits.push({
      id: visitId,
      studentId: student.id,
      arrivedAt: at,
      departedAt: new Date(Date.parse(at) + (35 + (index % 4) * 5) * 60000).toISOString(),
      departureVerified: true,
      sessionRecords: records,
      handoff: {
        at,
        actor: 'Fictional Demo Instructor',
        activities: { Math: records[0].activity, Reading: records[1].activity },
        assignmentIds,
        incoming: records.some((r) => r.incoming.some((p) => p.outcome === 'unfinished'))
          ? 'exception'
          : 'routine-no-exception',
        events: [],
      },
    });
    if (index % 4 === 3)
      db.observations.push({
        id: 'fictional-academic-observation-' + index,
        studentId: student.id,
        visitId,
        createdAt: at,
        author: 'Fictional Demo Instructor',
        text: 'Fictional example: worked steadily and asked for help independently.',
        choices: [],
        followUp: false,
        reviewedAt: null,
        reviewedBy: null,
        skillRatings: [
          { id: 'focus', label: 'Focus', score: 3 + (index % 3) },
          { id: 'handwriting', label: 'Handwriting', score: 3 + (index % 2) },
          { id: 'independence', label: 'Independence', score: 4 },
        ],
      });
  }
  // Complete the base fixture's prior visit using its already-issued fictional sets.
  for (const visit of db.visits.filter(
    (v) => v.studentId === student.id && v.handoff && !v.id.startsWith('fictional-academic-visit-'),
  )) {
    visit.sessionRecords ||= op.assignments
      .filter((a) => a.studentId === student.id && a.v3?.visitId === visit.id && a.v3.issuedAt)
      .map((a) => ({
        subject: a.subject,
        at: a.v3!.issuedAt!,
        actor: 'Fictional Demo Instructor',
        format: 'Paper',
        activity: 'Worksheets',
        incoming: [],
        center: a.v3!.inCenter,
        outgoing: a.v3!.issued,
        reason: '',
      }));
    for (const record of visit.sessionRecords)
      if (!record.incoming.length)
        record.incoming = (previousOutgoing[record.subject] || []).map((packet) => ({
          packet: structuredClone(packet),
          outcome: 'assumed completed',
        }));
  }
  return db;
}
