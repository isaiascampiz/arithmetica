'use client';
import { useState } from 'react';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import type { Snapshot } from '@/lib/model';
import type { Assignment } from '@/lib/v2-model';
import { type V3Act } from './v3-shared';
import { packetLabel } from '@/lib/v3-planning';
import type { Packet } from '@/lib/v3-model';
import { preparationReturnDate } from '@/lib/preparation-queue';
import { homePreparation } from '@/lib/home-preparation';
import { Avatar, Empty, useCenterDay } from './shared-ui';
import { StudentDirectoryToolbar } from './student-directory-toolbar';
import { directoryFilters, directoryOrder } from '@/lib/student-directory';
import { filterRoster } from '@/lib/v3-analytics';
import { InfoTip } from './ui-primitives';
export function Preparation({
  db,
  act,
  busy,
  refresh,
  profile,
}: {
  db: Snapshot;
  act: V3Act;
  busy: boolean;
  refresh?: () => Promise<void>;
  profile?: (id: string) => void;
}) {
  const [view, setView] = useState('Needs Preparation'),
    [filter, setFilter] = useState(directoryFilters),
    [sort, setSort] = useState('due'),
    [refreshing, setRefreshing] = useState(false);
  const op = db.operations!;
  const studentsById = new Map(db.students.map((student) => [student.id, student]));
  const today = useCenterDay(db.timezone);
  const returnDate = (a: Assignment) =>
    preparationReturnDate(op, a.studentId, a.v3!.visitDate, today);
  const assignments = op.assignments.filter((a) => {
    const c = op.students[a.studentId];
    return (
      a.v3 &&
      !a.v3.issuedAt &&
      c.active &&
      !(c.awayUntil && c.awayUntil > today) &&
      c.subjects[a.subject].enrolled &&
      c.subjects[a.subject].format === 'Paper'
    );
  });
  const groups = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = a.studentId + '|' + a.v3!.visitDate;
    const group = groups.get(key);
    if (group) group.push(a);
    else groups.set(key, [a]);
  }
  const matching = new Set(filterRoster(db, filter).map((s) => s.id));
  const order = directoryOrder(
    db,
    sort,
    today,
    new Map([...groups.values()].map((as) => [as[0].studentId, returnDate(as[0])])),
  );
  const rows = [...groups.values()]
    .filter((as) => matching.has(as[0].studentId))
    .map((as) =>
      as.filter(
        (a) =>
          (filter.subject === 'All' || filter.subject === a.subject) &&
          (filter.format === 'All' || filter.format === a.format),
      ),
    )
    .filter((as) => as.length)
    .sort(
      (a, b) =>
        order(studentsById.get(a[0].studentId)!, studentsById.get(b[0].studentId)!) ||
        a[0].v3!.visitDate.localeCompare(b[0].v3!.visitDate),
    );
  const ready = (as: Assignment[]) => as.every((a) => a.v3!.preparedAt && !a.stale);
  const filtered = rows.filter((as) => (view === 'Prepared' ? ready(as) : !ready(as)));
  async function mark(as: Assignment[]) {
    await act({
      action: 'prepare',
      ids: as.map((a) => a.id),
      versions: Object.fromEntries(as.map((a) => [a.id, a.v3!.version])),
      reprepare: false,
    });
  }
  const packetChips = (packets: Packet[]) => (
    <div className="prep-pull-packets">
      {packets.map((p) => (
        <span className="packet-chip" key={p.id}>
          {packetLabel(p)}
        </span>
      ))}
      {!packets.length && <span className="muted">None</span>}
    </div>
  );
  const sections = (as: Assignment[]) => (
    <div className="prep-subjects">
      {as.map((a) => {
        const prepared = Boolean(a.v3!.preparedAt && !a.stale);
        const blocked = a.stale || a.v3!.review.length > 0;
        const first = a.v3!.inCenter || a.v3!.planned[0];
        const sizes = [
          ...new Set(
            [...(a.v3!.inCenter ? [a.v3!.inCenter] : []), ...a.v3!.planned].map(
              (p) => p.range.end - p.range.start + 1,
            ),
          ),
        ];
        return (
          <section className="prep-subject" key={a.id} aria-label={a.subject + ' preparation'}>
            <div className="prep-subject-label">
              <div>
                <h3>{a.subject}</h3>
                {!blocked && first && (
                  <p className="prep-pull-instruction">
                    Start at{' '}
                    <strong>
                      {first.range.level}
                      {first.range.start}
                    </strong>
                    {' \u00b7 '}
                    {sizes.length === 1
                      ? sizes[0] + ' worksheets in each range'
                      : 'Follow the packet ranges below'}
                  </p>
                )}
              </div>
              {prepared ? (
                <span className="prep-status ready-label">
                  <Check size={15} aria-hidden="true" /> Prepared
                </span>
              ) : (
                <button
                  className="primary prep-mark"
                  type="button"
                  aria-label={'Mark ' + a.subject + ' prepared'}
                  disabled={busy || blocked}
                  onClick={() => void mark([a])}
                >
                  <Check size={16} aria-hidden="true" /> Mark prepared
                </button>
              )}
            </div>
            {blocked ? (
              <div className="prep-review">
                <span>
                  Plan needs review{' '}
                  <InfoTip label={'About ' + a.subject + ' preparation'}>
                    The saved plan is stale or outside approved curriculum bounds. An instructor
                    must confirm it before materials can be marked prepared.
                  </InfoTip>
                </span>
                {profile && (
                  <button className="text-button" onClick={() => profile(a.studentId)}>
                    Review plan
                  </button>
                )}
              </div>
            ) : (
              <div className="prep-packets">
                <div className="prep-packet-group">
                  <h4>In-center packet</h4>
                  {packetChips(a.v3!.inCenter ? [a.v3!.inCenter] : [])}
                </div>
                <div className="prep-packet-group">
                  <h4>Homework</h4>
                  {packetChips(a.v3!.planned)}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
  return (
    <div className="preparation-workspace">
      <StudentDirectoryToolbar
        filter={filter}
        onFilter={setFilter}
        sort={sort}
        onSort={setSort}
        searchLabel="Search preparation"
      />
      <div className="preparation-status-rail">
        <div className="segmented" role="group" aria-label="Preparation status">
          {['Needs Preparation', 'Prepared'].map((v) => (
            <button
              type="button"
              aria-pressed={view === v}
              className={view === v ? 'selected' : ''}
              key={v}
              onClick={() => setView(v)}
            >
              {v}{' '}
              <span className="prep-count">
                {rows.filter((as) => (v === 'Prepared' ? ready(as) : !ready(as))).length}
              </span>
            </button>
          ))}
        </div>
        <div className="preparation-refresh">
          {refresh && (
            <button
              className="icon-button"
              disabled={busy || refreshing}
              aria-label="Refresh preparation"
              aria-busy={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await refresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              <RefreshCw size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="prep-list">
        {filtered.map((as) => {
          const s = studentsById.get(as[0].studentId)!,
            v = as[0].v3!;
          const expected = returnDate(as[0]);
          const dateLabel = (value: string) =>
            new Intl.DateTimeFormat('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(value + 'T12:00:00Z'));
          const identity = (
            <button
              className="prep-identity prep-profile-link"
              type="button"
              aria-label={'Open profile for ' + s.name}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                profile?.(s.id);
              }}
            >
              <Avatar student={s} />
              <div>
                <h2>{s.name}</h2>
                <p>
                  {as
                    .map(
                      (a) => a.subject + ' \u00b7 ' + (a.format === 'Paper' ? 'PAPER' : 'CONNECT'),
                    )
                    .join(' / ')}
                </p>
                <small className={'home-preparation-state ' + (ready(as) ? 'ready' : 'needed')}>
                  {ready(as)
                    ? 'Homework prepared'
                    : homePreparation(db, s.id, today)?.label || 'Homework needs preparation'}
                </small>
              </div>
            </button>
          );
          const expectation = (
            <div className="prep-expectation">
              <span>
                Expected{' '}
                {expected !== v.visitDate && (
                  <InfoTip label="About the expected date">
                    Set planned for {dateLabel(v.visitDate)}. Check the saved set before pulling.
                  </InfoTip>
                )}
              </span>
              <b>
                {expected === today
                  ? 'Today'
                  : expected
                    ? dateLabel(expected)
                    : 'No scheduled return'}
              </b>
              {op.students[s.id].arrivalWindow && <small>{op.students[s.id].arrivalWindow}</small>}
            </div>
          );
          return view === 'Prepared' ? (
            <details
              className="prep-entry prep-ready"
              data-preparation-student={s.id}
              key={s.id + v.visitDate}
            >
              <summary>
                {identity}
                {expectation}
                <span className="prep-ready-summary">
                  <ChevronDown size={16} aria-hidden="true" />
                </span>
              </summary>
              {sections(as)}
            </details>
          ) : (
            <article
              className="prep-entry"
              data-preparation-student={s.id}
              key={s.id + v.visitDate}
            >
              <header>
                {identity}
                {expectation}
              </header>
              {sections(as)}
            </article>
          );
        })}
        {!filtered.length && (
          <Empty
            title={
              filter.query.trim()
                ? 'No students match your search'
                : view === 'Prepared'
                  ? 'No prepared sets in this view'
                  : 'All current preparation is clear'
            }
            text={
              filter.query.trim()
                ? 'Try another student name.'
                : 'CONNECT subjects need no paper packets.'
            }
          />
        )}
      </div>
    </div>
  );
}
