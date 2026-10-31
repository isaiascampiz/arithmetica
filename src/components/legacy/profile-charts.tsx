'use client';
import { dimensions } from '@/lib/v2-model';
import { dayKey, type Snapshot } from '@/lib/model';
import { Empty, date } from '@/components/ui/shared-ui';
export function ProfileCharts({ db, id, since }: { db: Snapshot; id: string; since: string }) {
  const op = db.operations!,
    evaluations = op.evaluations
      .filter((e) => e.studentId === id && dayKey(e.createdAt, db.timezone) >= since)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const visits = db.visits.filter(
    (v) =>
      v.studentId === id &&
      dayKey(v.arrivedAt, db.timezone) >= since &&
      v.departedAt &&
      v.departureVerified !== false,
  );
  const max = Math.max(
    1,
    ...visits.map((v) => (Date.parse(v.departedAt!) - Date.parse(v.arrivedAt)) / 60000),
  );
  const assignments = op.assignments.filter(
    (a) => a.studentId === id && dayKey(a.createdAt, db.timezone) >= since,
  );
  const distributed = assignments.filter((a) => a.events.some((e) => e.status === 'distributed')),
    returned = distributed.filter((a) =>
      a.events.some((e) =>
        ['returned', 'partial', 'verified', 'corrections-outstanding'].includes(e.status),
      ),
    ),
    verified = distributed.filter((a) => a.status === 'verified');
  return (
    <>
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Evaluation timeline</h2>
            <p>
              Dated, subject-specific ratings. Grey means not assessed; no combined success score.
            </p>
          </div>
        </div>
        {evaluations.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Dimension</th>
                  {evaluations.map((e) => (
                    <th key={e.id}>
                      {date(e.createdAt, db.timezone)}
                      <br />
                      {e.subject}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dimensions.map((d) => (
                  <tr key={d}>
                    <td>{d}</td>
                    {evaluations.map((e) => (
                      <td key={e.id}>
                        <span
                          className={`rating ${e.ratings[d] === 'Secure' ? 'green' : e.ratings[d] === 'Needs support' ? 'amber' : ''}`}
                        >
                          <span className="rating-dot" />
                          {e.ratings[d]}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Not assessed in this period"
            text="Missing evaluations are not a negative rating."
          />
        )}
      </section>
      <div className="profile-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Verified visit durations</h2>
              <p>Only confirmed departures. Administrative closures are excluded.</p>
            </div>
          </div>
          {visits.length ? (
            <div className="duration-chart">
              {visits.map((v) => {
                const minutes = Math.round(
                  (Date.parse(v.departedAt!) - Date.parse(v.arrivedAt)) / 60000,
                );
                return (
                  <div key={v.id}>
                    <span>{date(v.arrivedAt, db.timezone)}</span>
                    <div>
                      <i style={{ width: `${(minutes / max) * 100}%` }} />
                    </div>
                    <b>{minutes} min</b>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="No verified durations yet"
              text="Recorded departures are needed before a duration is plotted."
            />
          )}
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Homework consistency records</h2>
              <p>Returns and fully verified completion remain separate.</p>
            </div>
          </div>
          {distributed.length ? (
            <div className="consistency-records">
              <div>
                <span>Distributed assignments</span>
                <b>{distributed.length}</b>
              </div>
              <div>
                <span>Returned, including partial work</span>
                <b>{returned.length}</b>
              </div>
              <div>
                <span>Fully completed and verified</span>
                <b>{verified.length}</b>
              </div>
              <p className="small muted">
                {distributed.length - returned.length} distributions have no return record. This is
                missing information, not a performance judgment.
              </p>
            </div>
          ) : (
            <Empty
              title="No distributed assignments in this period"
              text="No consistency rate is inferred from missing records."
            />
          )}
        </section>
      </div>
    </>
  );
}
