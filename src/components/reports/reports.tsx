'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { dayKey, type Snapshot } from '@/lib/model';
import type { ReportView } from '@/lib/v2-model';
import type { WorksheetSummary } from '@/lib/report-detail';
import { reportVisitGroups, reportWorksheets } from '@/lib/report-view';
import { addDays } from '@/lib/schedule';
import { request } from '@/lib/client';
import { date, time, Avatar, useCenterDay } from '@/components/ui/shared-ui';
import { WorkspacePeriodControls } from '@/components/workspace/workspace-period-controls';
import type { AttendancePeriod } from '@/lib/center-attendance';
import { Modal } from '@/components/ui/shared';
import { SessionHistory } from '@/components/students/session-history';
import './reports.css';

type Metric = 'visits' | 'recorded' | 'unrecorded' | 'worksheets';
export function ReportsWorkspace({ db, profile }: { db: Snapshot; profile: (id: string) => void }) {
  const today = useCenterDay(db.timezone);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ReportView['kind']>('daily');
  const [period, setPeriod] = useState(today);
  const [preview, setPreview] = useState<ReportView | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const params = `preview=true&kind=${kind}&period=${period}`;
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError('');
    void request<ReportView>('/api/reports?' + params)
      .then((r) => {
        if (!disposed) setPreview(r);
      })
      .catch((e) => {
        if (!disposed) {
          setError((e as Error).message);
          setPreview(null);
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [params, db.revision]);
  const key =
    kind === 'yearly'
      ? period.slice(0, 4)
      : kind === 'monthly'
        ? period.slice(0, 7)
        : kind === 'weekly'
          ? addDays(period, -((new Date(period + 'T12:00:00Z').getUTCDay() + 6) % 7))
          : period;
  const archived = db
    .operations!.reports.filter(
      (r) =>
        r.kind === kind &&
        r.period === key &&
        r.payload.detail &&
        r.payload.detail.end < dayKey(new Date(), db.timezone),
    )
    .sort((a, b) => b.version - a.version)[0];
  const report = archived || preview;
  const changePeriod = (value: string) => {
    if (value) {
      setPeriod(value);
      setPreview(null);
    }
  };
  return (
    <div className="reports-v3 reports-workspace">
      <WorkspacePeriodControls
        period={(kind[0].toUpperCase() + kind.slice(1)) as AttendancePeriod}
        date={period}
        today={today}
        query={query}
        searchLabel="Search report students"
        dateLabel="Period date"
        periodLabel="Report period"
        changeDate={changePeriod}
        changePeriod={(p) => {
          setKind(p.toLowerCase() as ReportView['kind']);
          setPreview(null);
        }}
        changeQuery={setQuery}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && !report ? (
        <p role="status">Loading report…</p>
      ) : (
        report && (
          <ReportBody
            key={kind + key}
            db={db}
            report={report}
            profile={profile}
            query={query}
            exportParams={
              archived
                ? `id=${archived.id}`
                : params +
                  `&revision=${report.sourceRevision}&asOf=${encodeURIComponent(report.generatedAt)}`
            }
          />
        )
      )}
    </div>
  );
}

function ReportBody({
  db,
  report,
  exportParams,
  profile,
  query,
}: {
  db: Snapshot;
  report: ReportView;
  exportParams: string;
  profile: (id: string) => void;
  query: string;
}) {
  const [metric, setMetric] = useState<Metric>('visits'),
    [page, setPage] = useState(0);
  const [session, setSession] = useState<string | null>(null),
    [completion, setCompletion] = useState<WorksheetSummary | null>(null);
  useEffect(() => setPage(0), [query]);
  const detail = report.payload.detail;
  if (!detail)
    return (
      <section className="panel">
        <p>This older report has no saved visit detail.</p>
      </section>
    );
  const reportDate = (value: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value + 'T12:00:00Z'));
  const groups = reportVisitGroups(detail),
    worksheets = reportWorksheets(detail).filter((r) => r.worksheets > 0);
  const metrics: { id: Metric; label: string; title: string; value: number }[] = [
    {
      id: 'visits',
      label: 'Visits',
      title: 'Visits',
      value: detail.visits.length,
    },
    {
      id: 'recorded',
      label: 'With notes',
      title: 'Observations recorded',
      value: groups.recorded.length,
    },
    {
      id: 'unrecorded',
      label: 'No notes',
      title: 'Observations not recorded',
      value: groups.unrecorded.length,
    },
    {
      id: 'worksheets',
      label: 'Worksheets',
      title: 'Verified completed worksheets',
      value: detail.completions.reduce((n, c) => n + c.physicalSheets, 0),
    },
  ];
  const matches = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());
  const visits = (
    metric === 'recorded'
      ? groups.recorded
      : metric === 'unrecorded'
        ? groups.unrecorded
        : detail.visits
  )
    .filter((r) => matches(r.studentName))
    .toReversed();
  const completed = worksheets.filter((r) => matches(r.studentName));
  const count = metric === 'worksheets' ? completed.length : visits.length,
    pageSize = 20,
    pages = Math.max(1, Math.ceil(count / pageSize)),
    current = Math.min(page, pages - 1);
  const avatar = (id: string, name: string) => {
    const s = db.students.find((s) => s.id === id);
    return (
      <Avatar
        student={{
          id,
          name,
          initials: name
            .split(/\s+/)
            .map((s) => s[0])
            .slice(0, 2)
            .join(''),
          color: s?.color || '#247872',
          earlyLearner: false,
          subjects: [],
          level: '',
          token: '',
        }}
      />
    );
  };
  const frozen: Snapshot = {
    ...db,
    timezone: detail.timezone,
    visits: detail.visits.map((r) => r.visit),
    observations: detail.visits.flatMap((r) => r.notes),
    students: db.students.map((s) => ({
      ...s,
      name: detail.visits.find((r) => r.visit.studentId === s.id)?.studentName || s.name,
    })),
    operations: {
      ...db.operations!,
      assignments: [],
      completions: detail.completions,
      evaluations: detail.evaluations || [],
      decisions: detail.decisions || [],
    },
  };
  return (
    <section className="panel report-continuous">
      <header className="report-document-heading">
        <div>
          <h2>{report.kind[0].toUpperCase() + report.kind.slice(1)} report</h2>
          <p>
            {detail.centerName} {'\u00b7'} {reportDate(detail.start)}
            {detail.end !== detail.start ? ' \u2013 ' + reportDate(detail.end) : ''}
          </p>
        </div>{' '}
        {report.kind === 'monthly' && (
          <a
            className="secondary report-export-link"
            href={'/api/reports?' + exportParams + '&format=xlsx'}
          >
            <Download size={16} />
            Export Excel
          </a>
        )}
      </header>
      <div className="report-metric-tabs" aria-label="Report sections">
        {metrics.map((m) => (
          <button
            key={m.id}
            aria-label={m.title + ' ' + m.value}
            title={m.title}
            aria-pressed={metric === m.id}
            onClick={() => {
              setMetric(m.id);
              setPage(0);
            }}
          >
            <span>{m.label}</span>
            <b>{m.value}</b>
          </button>
        ))}
      </div>
      {metric && (
        <section
          className="report-drilldown"
          aria-label={metrics.find((m) => m.id === metric)!.title}
        >
          <h2 className="sr-only">{metrics.find((m) => m.id === metric)!.label}</h2>
          {metric === 'worksheets'
            ? completed.slice(current * pageSize, (current + 1) * pageSize).map((r) => (
                <article className="report-student-row" key={r.studentId + r.subject}>
                  <div className="report-person">
                    {avatar(r.studentId, r.studentName)}
                    <div>
                      <b>{r.studentName}</b>
                      <small>
                        {r.subject} · {r.lastVerifiedLevel || 'Level not recorded'}
                        {r.lastVerifiedWorksheet !== null ? ' · ' + r.lastVerifiedWorksheet : ''}
                      </small>
                    </div>
                  </div>
                  <div className="report-worksheet-count">
                    <b>{r.worksheets} worksheets</b>
                    <small>{r.packetEquivalents} packets · 10 worksheets each</small>
                  </div>
                  <button className="secondary" onClick={() => setCompletion(r)}>
                    View worksheets
                  </button>
                </article>
              ))
            : visits.slice(current * pageSize, (current + 1) * pageSize).map((r) => (
                <article
                  className={
                    'report-visit-row ' + (metric === 'visits' ? 'minimal' : 'visit-entry')
                  }
                  key={r.visit.id}
                >
                  <header className="report-student-row">
                    <div className="report-person">
                      {avatar(r.visit.studentId, r.studentName)}
                      <div>
                        <b>{r.studentName}</b>
                        <small>
                          {date(r.visit.arrivedAt, detail.timezone)} ·{' '}
                          {time(r.visit.arrivedAt, detail.timezone)}
                          {r.visit.departedAt && r.visit.departureVerified !== false
                            ? ' – ' + time(r.visit.departedAt, detail.timezone)
                            : ''}
                        </small>
                      </div>
                    </div>
                    <button
                      className="secondary"
                      onClick={() =>
                        metric === 'visits' ? profile(r.visit.studentId) : setSession(r.visit.id)
                      }
                    >
                      {metric === 'visits' ? 'View student' : 'View session'}
                    </button>
                  </header>
                  {metric !== 'visits' && (
                    <dl className="visit-summary">
                      <div>
                        <dt>Checked in</dt>
                        <dd>{time(r.visit.arrivedAt, detail.timezone)}</dd>
                      </div>
                      <div>
                        <dt>Checked out</dt>
                        <dd>
                          {r.visit.departedAt && r.visit.departureVerified !== false
                            ? time(r.visit.departedAt, detail.timezone)
                            : r.visit.closedAt
                              ? 'Closed automatically'
                              : 'Here now'}
                        </dd>
                      </div>
                      <div>
                        <dt>Visit duration</dt>
                        <dd>
                          {r.minutes === null ? 'Not recorded' : Math.round(r.minutes) + ' minutes'}
                        </dd>
                      </div>
                      <div>
                        <dt>Observations</dt>
                        <dd>{metric === 'recorded' ? 'Recorded' : 'Not recorded'}</dd>
                      </div>
                    </dl>
                  )}
                </article>
              ))}
          {!count && <p className="report-empty">No records in this selection.</p>}
          {pages > 1 && (
            <div className="report-pagination">
              <span>
                Page {current + 1} of {pages}
              </span>
              <button
                className="secondary"
                disabled={!current}
                onClick={() => setPage(current - 1)}
              >
                Previous
              </button>
              <button
                className="secondary"
                disabled={current + 1 >= pages}
                onClick={() => setPage(current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
      {session &&
        frozen.visits.some((v) => v.id === session) &&
        frozen.students.some(
          (s) => s.id === frozen.visits.find((v) => v.id === session)!.studentId,
        ) && (
          <SessionHistory
            db={frozen}
            visit={frozen.visits.find((v) => v.id === session)!}
            act={async () => false}
            review={async () => false}
            busy={false}
            error=""
            readOnly
            close={() => setSession(null)}
          />
        )}
      {completion && (
        <Modal
          title={completion.studentName + ' · ' + completion.subject}
          className="settings-edit-dialog"
          close={() => setCompletion(null)}
          footer={
            <button className="secondary" onClick={() => setCompletion(null)}>
              Done
            </button>
          }
        >
          <p>
            {completion.worksheets} verified worksheets · {completion.packetEquivalents} packets at
            10 worksheets per packet
          </p>
          {detail.completions
            .filter((c) => c.studentId === completion.studentId && c.subject === completion.subject)
            .map((c) => (
              <div className="report-completion-entry" key={c.id}>
                <b>
                  {c.level} · {c.worksheets.join(', ')}
                </b>
                <small>
                  {c.completedDate || date(c.at, detail.timezone)} · Verified by {c.verifiedBy}
                </small>
              </div>
            ))}
        </Modal>
      )}
    </section>
  );
}
