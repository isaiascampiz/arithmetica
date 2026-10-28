import ExcelJS from 'exceljs';
import type { Report } from './v2-model';
import { dayKey } from './model';
import { reportWorksheets } from './report-view';

/** The monthly operational export is a single frozen, verified worksheet summary. */
export async function monthlyReportWorkbook(report: Report) {
  if (report.kind !== 'monthly')
    throw new Error('Excel exports are available for monthly reports.');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Arithmetica';
  workbook.created = new Date(report.generatedAt);
  const sheet = workbook.addWorksheet('Monthly worksheets', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.addRow([
    'Student name',
    'Grade',
    'Subject',
    'Last verified level',
    'Last verified worksheet',
    'Verified worksheets',
    'Packets (10 worksheets)',
  ]);
  for (const row of report.payload.detail ? reportWorksheets(report.payload.detail) : [])
    sheet.addRow([
      row.studentName,
      row.grade || 'Not recorded',
      row.subject,
      row.lastVerifiedLevel || 'Not recorded',
      row.lastVerifiedWorksheet,
      row.worksheets,
      row.packetEquivalents,
    ]);
  sheet.getRow(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF247872' } };
  sheet.getRow(1).height = 32;
  sheet.columns.forEach((c, i) => {
    c.width = i === 0 ? 30 : i > 2 ? 25 : 18;
  });
  sheet.getColumn(7).numFmt = '0.0#';
  sheet.eachRow((row) => {
    row.alignment = { vertical: 'middle', wrapText: true };
    if (row.number > 1) row.height = 26;
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: 7 },
  };
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return workbook.xlsx.writeBuffer();
}

/** Export only the selected frozen payload; text is always a string, never a formula. */
export async function reportWorkbook(report: Report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Arithmetica';
  workbook.created = new Date(report.generatedAt);
  const p = report.payload,
    d = p.detail;
  const sheet = (name: string, headers: string[], rows: (string | number | Date | null)[][]) => {
    const ws = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(headers);
    rows.forEach((row) => ws.addRow(row));
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, rows.length + 1), column: headers.length },
    };
    ws.getRow(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF254E76' } };
    ws.getRow(1).height = 30;
    ws.columns.forEach((column, index) => {
      column.width = Math.min(52, Math.max(18, headers[index].length + 3));
    });
    ws.eachRow((row, index) => {
      row.alignment = { vertical: 'top', wrapText: true };
      if (index > 1) {
        row.font = { name: 'Calibri', size: 11 };
        row.height = Math.min(
          110,
          Math.max(
            30,
            ...Array.from(
              { length: headers.length },
              (_, i) =>
                Math.ceil(
                  String(row.getCell(i + 1).value ?? '').length /
                    Math.max(10, (ws.getColumn(i + 1).width || 18) - 2),
                ) *
                  15 +
                8,
            ),
          ),
        );
        if (index % 2 === 0)
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      }
      row.eachCell((cell) => {
        if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd hh:mm';
      });
    });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.eachRow((row, index) => {
      if (index > 1)
        row.eachCell((cell, col) => {
          if (headers[col - 1] === 'Completed date' && cell.value instanceof Date)
            cell.numFmt = 'yyyy-mm-dd';
        });
    });
    return ws;
  };
  sheet(
    'Summary',
    ['Measure', 'Value'],
    [
      ['Center', d?.centerName || 'Not recorded in this snapshot'],
      ['Report', report.kind],
      ['Period', report.period],
      ['From', d?.start || report.period],
      ['Through', d?.end || report.period],
      ['Timezone', d?.timezone || 'Not recorded in this snapshot'],
      ['Snapshot', report.version ? `Archived version ${report.version}` : 'Live preview'],
      ['Source revision', report.sourceRevision],
      ['Generated (UTC)', new Date(report.generatedAt)],
      [
        'Evidence status',
        d?.provisional ? 'Period in progress' : 'Records available at generation time',
      ],
      ['Distinct students', p.students],
      ['Visits', p.visits],
      ['Verified departures', p.verifiedDepartures],
      ['Unresolved departures', d?.unresolved ?? p.unverifiedDepartures.length],
      ['Verified completed paper sheets', p.physicalSheets],
      [
        'Completion evidence',
        p.physicalSheets
          ? 'See Completion detail for supporting rows'
          : 'No verified completions recorded',
      ],
      [
        'Data limitations',
        d
          ? `${d.excludedCompletions} completion entries excluded for missing or inconsistent paper evidence. Receipt assumptions are excluded.`
          : 'Detail unavailable in this older snapshot. Original recorded totals are preserved.',
      ],
    ],
  );
  sheet(
    'Students & subjects',
    [
      'Student ID',
      'Student',
      'Subject',
      'Recorded level',
      'Recorded range',
      'Visits',
      'Verified paper sheets',
      'Level evidence',
      'Evidence recorded (UTC)',
    ],
    p.studentSummaries.map((s) => [
      s.id,
      s.name,
      s.subject,
      s.level,
      s.range,
      s.attendance,
      s.physicalSheets,
      s.levelSource ||
        (s.level === 'Not recorded' ? 'No historical level evidence' : 'Recorded evidence'),
      s.levelAt ? new Date(s.levelAt) : null,
    ]),
  );
  sheet(
    'Completion detail',
    [
      'Completion ID',
      'Student ID',
      'Student',
      'Subject',
      'Level',
      'Worksheet numbers',
      'Physical sheets',
      'Completed date',
      'Verified by',
      'Verified at (UTC)',
      'Packet ID',
      'Assignment ID',
      'Supersedes',
    ],
    d
      ? d.completions.map((c) => [
          c.id,
          c.studentId,
          c.studentName,
          c.subject,
          c.level,
          c.worksheets.join(', '),
          c.physicalSheets,
          new Date((c.completedDate || dayKey(c.at, d.timezone)) + 'T00:00:00Z'),
          c.verifiedBy,
          new Date(c.at),
          c.packetId || 'Legacy evidence',
          c.assignmentId,
          c.supersedes || '',
        ])
      : [
          [
            'Detail unavailable in this snapshot',
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          ],
        ],
  );
  sheet(
    'Attendance',
    [
      'Visit ID',
      'Student ID',
      'Student',
      'Arrival (UTC)',
      'Departure (UTC)',
      'Departure status',
      'Administrative closure (UTC)',
      'Verified minutes',
      'Session subjects',
    ],
    d
      ? d.visits.map(({ visit: v, studentName, minutes }) => [
          v.id,
          v.studentId,
          studentName,
          new Date(v.arrivedAt),
          v.departedAt ? new Date(v.departedAt) : null,
          v.departedAt && v.departureVerified !== false ? 'Verified' : 'Unverified / unresolved',
          v.closedAt ? new Date(v.closedAt) : null,
          minutes,
          [...new Set(v.sessionRecords?.map((r) => r.subject) || [])].join(', ') || null,
        ])
      : [['Detail unavailable in this snapshot', null, null, null, null, null, null, null, null]],
  );
  workbook.getWorksheet('Summary')!.getColumn(1).width = 34;
  workbook.getWorksheet('Summary')!.getColumn(2).width = 85;
  workbook.getWorksheet('Summary')!.getRow(18).height = 48;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
