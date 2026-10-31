import type { ReportDetail, WorksheetSummary } from './report-detail';

/** Count observed visits once, regardless of the number of subjects or notes. */
export function reportVisitGroups(detail: ReportDetail) {
  const recorded = detail.visits.filter(
    (r) =>
      (detail.evaluatedVisitIds || []).includes(r.visit.id) ||
      r.notes.some((o) => {
        const current = o.revisions?.at(-1) || o;
        return !!(current.text.trim() || o.choices.length || current.skillRatings?.length);
      }),
  );
  const ids = new Set(recorded.map((r) => r.visit.id));
  return {
    recorded,
    unrecorded: detail.visits.filter((r) => !ids.has(r.visit.id)),
  };
}

/** Older frozen reports remain exportable without filling historical gaps from live profiles. */
export function reportWorksheets(detail: ReportDetail): WorksheetSummary[] {
  if (detail.worksheetSummary) return detail.worksheetSummary;
  const rows = new Map<string, WorksheetSummary>();
  for (const c of [...detail.completions].sort(
    (a, b) =>
      (a.completedDate || a.at).localeCompare(b.completedDate || b.at) || a.at.localeCompare(b.at),
  )) {
    const key = c.studentId + ':' + c.subject;
    const row = rows.get(key) || {
      studentId: c.studentId,
      studentName: c.studentName,
      grade: null,
      subject: c.subject,
      lastVerifiedLevel: null,
      lastVerifiedWorksheet: null,
      worksheets: 0,
      packetEquivalents: 0,
    };
    row.worksheets += c.physicalSheets;
    row.packetEquivalents = row.worksheets / 10;
    row.lastVerifiedLevel = c.level;
    row.lastVerifiedWorksheet = Math.max(...c.worksheets);
    rows.set(key, row);
  }
  return [...rows.values()];
}
