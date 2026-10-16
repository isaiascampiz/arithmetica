import { z } from 'zod';
import { sameOrigin, staffSession } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { archiveReport } from '@/lib/reports';
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
      db = await repository.read(),
      report = db.operations!.reports.find((r) => r.id === url.searchParams.get('id'));
    if (!report) throw new DomainError('Report not found.', 404);
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
          'Content-Disposition': `attachment; filename="centerflow-${report.kind}-${report.period}-v${report.version}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return json(report);
  } catch (e) {
    return failure(e);
  }
}
