import { z } from 'zod';
import { sameOrigin, staffSession } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { archiveReport, buildReport, reportBounds } from '@/lib/reports';
import { monthlyReportWorkbook } from '@/lib/report-workbook';
import type { Report } from '@/lib/v2-model';
import { dateInput } from '@/lib/v2-domain';
import { DomainError } from '@/lib/domain';
import { failure, json } from '@/lib/http';
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const staff = await staffSession();
    if (staff.role === 'assistant')
      throw new DomainError('Reports require instructor access.', 403);
    const input = z
      .object({
        kind: z.enum(['daily', 'weekly', 'monthly']),
        period: dateInput,
        newVersion: z.boolean().default(false),
        reason: z.string().trim().min(3).max(500),
        requestId: z.string().min(1).max(100).optional(),
      })
      .parse(await req.json());
    const report = await repository.transaction((db) =>
      archiveReport(
        db,
        input.kind,
        input.period,
        new Date(),
        `${staff.name}: ${input.reason}`,
        input.newVersion,
        input.requestId,
      ),
    );
    return json({ id: report.id });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request) {
  try {
    const staff = await staffSession();
    if (staff.role === 'assistant')
      throw new DomainError('Reports require instructor access.', 403);
    const url = new URL(req.url),
      db = await repository.read();
    let report: Report | undefined;
    if (url.searchParams.get('preview') === 'true') {
      const revision = url.searchParams.get('revision');
      if (revision !== null && z.coerce.number().int().min(0).parse(revision) !== db.revision)
        throw new DomainError(
          'Records changed. Refresh the report before exporting, or export an archived snapshot.',
          409,
        );
      const kind = z.enum(['daily', 'weekly', 'monthly']).parse(url.searchParams.get('kind'));
      const date = dateInput.parse(url.searchParams.get('period'));
      const period = kind === 'monthly' ? date.slice(0, 7) : reportBounds(kind, date).start;
      const asOf = url.searchParams.get('asOf');
      const now = asOf ? new Date(z.iso.datetime().parse(asOf)) : new Date();
      if (now.getTime() > Date.now())
        throw new DomainError('Report generation time cannot be in the future.');
      report = {
        id: 'preview',
        kind,
        period,
        version: 0,
        sourceRevision: db.revision,
        generatedAt: now.toISOString(),
        reason: 'Live view of records available now',
        payload: buildReport(db, kind, period, now),
      };
    } else report = db.operations!.reports.find((r) => r.id === url.searchParams.get('id'));
    if (!report) throw new DomainError('Report not found.', 404);
    if (url.searchParams.get('format') === 'xlsx') {
      if (report.kind !== 'monthly')
        throw new DomainError('Excel exports are available for monthly reports.');
      const bytes = await monthlyReportWorkbook(report);
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="arithmetica-${report.kind}-${report.period}-${report.version ? 'v' + report.version : 'preview'}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    if (url.searchParams.get('format') === 'csv') {
      const cols = [
        'Student',
        'Subject',
        'Recorded level',
        'Recorded range',
        'Visits',
        'Verified physical sheets',
        'Official completed count',
        'Repeats',
        'Observations',
        'Distributed',
        'Returned',
      ];
      const rows = report.payload.studentSummaries.map((s) => [
        s.name,
        s.subject,
        s.level,
        s.range,
        s.attendance,
        s.physicalSheets,
        s.officialSheets,
        s.repeats,
        s.observations,
        s.distributed,
        s.returned,
      ]);
      const csv = [cols, ...rows]
        .map((row) =>
          row
            .map((v) => {
              let value = String(v);
              if (/^[=+\-@]/.test(value)) value = "'" + value;
              return '"' + value.replaceAll('"', '""') + '"';
            })
            .join(','),
        )
        .join('\r\n');
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="arithmetica-${report.kind}-${report.period}-v${report.version}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return json(report);
  } catch (e) {
    return failure(e);
  }
}
