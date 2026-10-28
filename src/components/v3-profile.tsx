'use client';
import { useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { ArrowLeft, QrCode, Printer } from 'lucide-react';
import { dayKey, type Snapshot, type Student, type Visit } from '@/lib/model';
import { zonedTimestamp } from '@/lib/schedule';
import { matchVisit, measuredMinutes } from '@/lib/v3-analytics';
import type { V2Command } from '@/lib/v2-domain';
import { Modal, type V3Act } from './v3-shared';
import { ProfileMedals } from './v3-profile-achievements';
import { ProgressCharts } from './v3-progress';
import { time, date, Empty, useNow, Avatar } from './shared-ui';
import { SessionHistory } from './v3-session-history';
import { Popover } from './ui-primitives';
import { StudentInformation, OverviewSubjects } from './profile-overview';
export function StudentProfileV3({
  db,
  student: s,
  act,
  legacyAct,
  busy,
  error,
  back,
  review,
}: {
  db: Snapshot;
  student: Student;
  act: V3Act;
  legacyAct: (c: V2Command) => Promise<boolean>;
  busy: boolean;
  error: string;
  back: () => void;
  quick: (v: Visit) => void;
  review: (id: string) => Promise<boolean>;
}) {
  const [tab, setTab] = useState('Overview'),
    [edit, setEdit] = useState(false),
    [session, setSession] = useState<string | null>(null),
    [visitDate, setVisitDate] = useState(''),
    [visitSort, setVisitSort] = useState('newest'),
    [qr, setQr] = useState('');
  const op = db.operations!,
    cfg = op.students[s.id],
    teacher = db.staff.role !== 'assistant';
  const visits = db.visits
    .filter(
      (v) => v.studentId === s.id && (!visitDate || dayKey(v.arrivedAt, db.timezone) === visitDate),
    )
    .sort((a, b) => {
      if (visitSort === 'longest' || visitSort === 'shortest') {
        const x = measuredMinutes(a),
          y = measuredMinutes(b);
        if (x === null || y === null)
          return x === y ? b.arrivedAt.localeCompare(a.arrivedAt) : x === null ? 1 : -1;
        return (visitSort === 'longest' ? y - x : x - y) || b.arrivedAt.localeCompare(a.arrivedAt);
      }
      return visitSort === 'oldest'
        ? a.arrivedAt.localeCompare(b.arrivedAt)
        : b.arrivedAt.localeCompare(a.arrivedAt);
    });
  const orphanNotes = db.observations.filter(
    (o) => o.studentId === s.id && !matchVisit(db, s.id, o.createdAt, o.visitId),
  );
  const orphanEval = op.evaluations.filter(
    (e) => e.studentId === s.id && !matchVisit(db, s.id, e.createdAt),
  );
  const now = useNow();
  const months = cfg.enrollmentDate
    ? Math.max(
        0,
        Math.floor(
          (now.getTime() - Date.parse(cfg.enrollmentDate + 'T12:00:00Z')) / (86400000 * 30.44),
        ),
      )
    : null;
  return (
    <div className="profile-v3">
      <div className="profile-v3-heading">
        <button className="icon-button" aria-label="Back to Student Roster" onClick={back}>
          <ArrowLeft size={21} />
        </button>
        <Avatar student={s} />
        <div className="profile-heading-identity">
          <div className="profile-heading-copy">
            <h1>
              {teacher ? (
                <button
                  className="profile-name-edit"
                  aria-label={s.name}
                  title="Edit student information"
                  onClick={() => {
                    setTab('Overview');
                    setEdit(true);
                  }}
                >
                  {s.name}
                </button>
              ) : (
                s.name
              )}
            </h1>
            <span>
              {cfg.grade || s.subjects.join(' / ')}
              {s.earlyLearner && <small className="learner-badge">Early learner</small>}
            </span>
          </div>
          <ProfileMedals db={db} student={s} />
        </div>
        <div className="overview-pouch" role="group" aria-label="Pouch identifier">
          <button
            className="text-button"
            onClick={() => void QRCode.toDataURL(s.token, { width: 220, margin: 2 }).then(setQr)}
          >
            <QrCode size={17} />
            Show pouch identifier
          </button>
          {qr && (
            <Modal
              title="Pouch identifier"
              className="pouch-dialog"
              close={() => setQr('')}
              footer={
                <>
                  <button className="secondary" onClick={() => setQr('')}>
                    Done
                  </button>
                  <a
                    className="primary"
                    href={'/students/' + encodeURIComponent(s.id) + '/pouch'}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Printer size={17} />
                    Print 2 × 2 label
                  </a>
                </>
              }
            >
              <div className="pouch-preview">
                <Image src={qr} width={220} height={220} alt={'Pouch QR for ' + s.name} />
                <b>{s.name}</b>
                <span>Keep this label with the student’s pouch.</span>
              </div>
            </Modal>
          )}
        </div>
      </div>
      <div className="segmented profile-sections">
        {['Overview', 'Progress', 'Visit History'].map((t) => (
          <button className={tab === t ? 'selected' : ''} onClick={() => setTab(t)} key={t}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Overview' && (
        <div className="overview-v3 overview-layout">
          <StudentInformation
            db={db}
            student={s}
            editing={edit}
            open={() => setEdit(true)}
            act={act}
            busy={busy}
            error={error}
            months={months}
            close={() => setEdit(false)}
          />
          <OverviewSubjects
            key={s.id}
            db={db}
            student={s}
            act={act}
            legacyAct={legacyAct}
            busy={busy}
            error={error}
          />
        </div>
      )}
      {tab === 'Progress' && <ProgressCharts key={s.id} db={db} student={s} />}
      {tab === 'Visit History' && (
        <div className="visit-timeline">
          <div className="visit-history-toolbar">
            <Popover label="Filter & sort" trigger="Filter & sort">
              {(close) => (
                <>
                  <div id="visit-filters" className="visit-filter-popover">
                    <h3>Filter &amp; sort</h3>
                    <label>
                      Visit date
                      <input
                        type="date"
                        value={visitDate}
                        onChange={(e) => setVisitDate(e.target.value)}
                      />
                    </label>
                    <button
                      className="text-button"
                      disabled={!visitDate}
                      onClick={() => setVisitDate('')}
                    >
                      Clear date
                    </button>
                    <label>
                      Sort visits
                      <select value={visitSort} onChange={(e) => setVisitSort(e.target.value)}>
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="longest">Longest visit</option>
                        <option value="shortest">Shortest visit</option>
                      </select>
                    </label>
                    <button className="secondary" onClick={close}>
                      Done
                    </button>
                  </div>
                </>
              )}
            </Popover>
          </div>
          {visits.map((v) => {
            const notes = db.observations.filter(
              (o) =>
                o.studentId === s.id && matchVisit(db, s.id, o.createdAt, o.visitId)?.id === v.id,
            );
            const ratings = notes
              .filter((o) => o.context !== 'additional')
              .reduce(
                (n, o) => n + (o.revisions?.at(-1)?.skillRatings || o.skillRatings || []).length,
                0,
              );
            const minutes = measuredMinutes(v);
            return (
              <article className="panel visit-entry" key={v.id} data-history-visit={v.id}>
                <header>
                  <h2>
                    {new Intl.DateTimeFormat('en-US', {
                      timeZone: db.timezone,
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    }).format(new Date(v.arrivedAt))}
                  </h2>
                </header>
                <dl className="visit-summary">
                  <div>
                    <dt>Checked in</dt>
                    <dd>{time(v.arrivedAt, db.timezone)}</dd>
                  </div>
                  <div>
                    <dt>Checked out</dt>
                    <dd>
                      {v.departedAt && v.departureVerified !== false
                        ? time(v.departedAt, db.timezone)
                        : v.closedAt || v.departedAt
                          ? 'Departure unverified'
                          : 'Physically here'}
                    </dd>
                  </div>
                  <div>
                    <dt>Visit duration</dt>
                    <dd>
                      {minutes === null ? 'Duration unverified' : Math.round(minutes) + ' minutes'}
                    </dd>
                  </div>
                  <div>
                    <dt>Observations</dt>
                    <dd>{ratings > 0 || notes.some((o) => o.choices.length) ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt>Note</dt>
                    <dd>
                      {notes.some((o) => (o.revisions?.at(-1)?.text ?? o.text).trim())
                        ? 'Yes'
                        : 'No'}
                    </dd>
                  </div>
                </dl>
                <button className="secondary" onClick={() => setSession(v.id)}>
                  View session
                </button>
                {teacher && v.closedAt && !v.departureVerified && (
                  <details>
                    <summary>Reconcile unverified departure</summary>
                    <Reconcile visit={v} db={db} act={legacyAct} busy={busy} />
                  </details>
                )}
              </article>
            );
          })}
          {!visits.length && (
            <Empty
              title={visitDate ? 'No visits on this date' : 'No attended sessions'}
              text="Every attendance session will appear here, even without observations."
            />
          )}
          {(orphanNotes.length > 0 || orphanEval.length > 0) && (
            <section className="panel historical-v3">
              <h2>Dated historical entries</h2>
              <p className="small muted">No unique visit match; original records retained.</p>
              {orphanNotes.map((o) => (
                <div className="history-note" key={o.id}>
                  <small>
                    {date(o.createdAt, db.timezone)} · {o.author}
                  </small>
                  <b>{o.choices.join(' · ')}</b>
                  <p>{o.text}</p>
                  {teacher && !o.reviewedAt && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void review(o.id)}
                    >
                      Mark reviewed
                    </button>
                  )}
                </div>
              ))}
              {orphanEval.map((e) => (
                <div className="history-note" key={e.id}>
                  {date(e.createdAt, db.timezone)} · {e.subject} · {e.text}
                </div>
              ))}
            </section>
          )}
        </div>
      )}
      {session && db.visits.some((v) => v.id === session) && (
        <SessionHistory
          db={db}
          visit={db.visits.find((v) => v.id === session)!}
          act={act}
          busy={busy}
          review={review}
          error={error}
          close={() => setSession(null)}
        />
      )}
    </div>
  );
}
function Reconcile({
  visit,
  db,
  act,
  busy,
}: {
  visit: Visit;
  db: Snapshot;
  act: (c: V2Command) => Promise<boolean>;
  busy: boolean;
}) {
  const [stamp, setStamp] = useState(''),
    [reason, setReason] = useState('');
  return (
    <div className="form-grid">
      <label>
        Actual departure (center time)
        <input type="datetime-local" value={stamp} onChange={(e) => setStamp(e.target.value)} />
      </label>
      <label>
        Reconciliation reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button
        className="secondary"
        disabled={busy || !stamp || reason.length < 3}
        onClick={() =>
          void act({
            action: 'visit-reconcile',
            id: visit.id,
            mode: 'verify',
            departedAt: zonedTimestamp(stamp.slice(0, 10), stamp.slice(11, 16), db.timezone),
            reason,
          })
        }
      >
        Verify actual departure
      </button>
      <button
        className="text-button"
        disabled={busy || reason.length < 3}
        onClick={() =>
          void act({ action: 'visit-reconcile', id: visit.id, mode: 'reopen', reason })
        }
      >
        Reopen unresolved visit
      </button>
    </div>
  );
}
