'use client';
import { useState } from 'react';
import { centerFeatures } from '@/lib/center-features';
import type { Snapshot, Visit, Observation } from '@/lib/model';
import type { Subject } from '@/lib/v2-model';
import { packetLabel } from '@/lib/v3-planning';
import { matchVisit } from '@/lib/v3-analytics';
import { Modal, DictatedNote, type V3Act } from './v3-shared';
import { Avatar, date, time } from './shared-ui';
import { VerifyCompletion } from './verify-completion';

export function SessionHistory({
  db,
  visit,
  act,
  busy,
  review,
  error,
  close,
  readOnly = false,
}: {
  db: Snapshot;
  visit: Visit;
  act: V3Act;
  busy: boolean;
  review: (id: string) => Promise<boolean>;
  error: string;
  close: () => void;
  readOnly?: boolean;
}) {
  const student = db.students.find((s) => s.id === visit.studentId)!;
  const recorded = visit.sessionRecords || [];
  const assignments = db.operations!.assignments.filter((a) => a.v3?.visitId === visit.id);
  const subjects = (['Math', 'Reading'] as Subject[]).filter(
    (s) =>
      recorded.some((r) => r.subject === s) ||
      visit.subjectCheckIns?.[s] ||
      visit.handoff?.activities[s] ||
      assignments.some((a) => a.subject === s),
  );
  const [subject, setSubject] = useState<Subject>(subjects[0] || 'Math');
  const record = recorded.filter((r) => r.subject === subject).at(-1);
  const assignment = assignments.find((a) => a.subject === subject);
  const confirmation = visit.subjectCheckIns?.[subject] || visit.handoff;
  const showPackets = centerFeatures(db).homework && record?.mode !== 'activity-only';
  const activity = record?.activity || confirmation?.activities[subject];
  const notes = db.observations.filter(
    (o) =>
      o.studentId === student.id &&
      matchVisit(db, student.id, o.createdAt, o.visitId)?.id === visit.id,
  );
  const evaluations = db.operations!.evaluations.filter(
    (e) => e.studentId === student.id && matchVisit(db, student.id, e.createdAt)?.id === visit.id,
  );
  const decisions = db.operations!.decisions.filter(
    (d) => d.studentId === student.id && matchVisit(db, student.id, d.createdAt)?.id === visit.id,
  );
  return (
    <Modal
      titleLabel={'Past visit · ' + student.name}
      title={
        <>
          <Avatar student={student} />
          <span>
            {student.name}
            <small className="past-session-label">
              Past visit · {date(visit.arrivedAt, db.timezone)}
            </small>
          </span>
        </>
      }
      className="quick-view past-session"
      close={close}
    >
      <p className="small muted">
        Recorded session · Original packet and activity records are preserved.
      </p>
      <div className="quick-subject-tabs" role="tablist" aria-label="Recorded subjects">
        {subjects.map((s, index) => (
          <button
            type="button"
            key={s}
            role="tab"
            aria-selected={s === subject}
            id={'history-tab-' + s}
            aria-controls="history-subject"
            tabIndex={s === subject ? 0 : -1}
            onClick={() => setSubject(s)}
            onKeyDown={(e) => {
              const next =
                e.key === 'ArrowRight'
                  ? (index + 1) % subjects.length
                  : e.key === 'ArrowLeft'
                    ? (index + subjects.length - 1) % subjects.length
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? subjects.length - 1
                        : null;
              if (next !== null) {
                e.preventDefault();
                setSubject(subjects[next]);
                document.getElementById('history-tab-' + subjects[next])?.focus();
              }
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <section
        className="quick-subject-card"
        role="tabpanel"
        id="history-subject"
        aria-labelledby={'history-tab-' + subject}
      >
        {!subjects.length ? (
          <p>Subject details were not recorded for this visit.</p>
        ) : (
          <>
            {showPackets && (
              <>
                <h4>Homework received</h4>
                {record ? (
                  record.format === 'CONNECT' ? (
                    <p>Assignments managed in Kumon CONNECT.</p>
                  ) : record.incoming.length ? (
                    <div className="history-packets">
                      {record.incoming.map((i) => (
                        <div className="packet-chip" key={i.packet.id}>
                          {packetLabel(i.packet)}
                          <small>
                            {i.outcome === 'assumed completed'
                              ? 'Completed'
                              : i.outcome === 'finished'
                                ? 'Reported completed'
                                : i.outcome}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No incoming packets recorded.</p>
                  )
                ) : (
                  <p className="muted">Incoming packet details were not recorded for this visit.</p>
                )}
              </>
            )}
            <h4>{showPackets ? 'In-center work' : 'In-center activity'}</h4>
            <p>
              {activity === 'Worksheets'
                ? 'Packet'
                : activity === 'Corrections only'
                  ? 'Corrections'
                  : activity || 'Activity not recorded'}
            </p>
            {showPackets && (
              <>
                <div className="history-packets">
                  {record
                    ? record.center && (
                        <span className="packet-chip">{packetLabel(record.center)}</span>
                      )
                    : assignment?.v3?.inCenter && (
                        <span className="packet-chip">{packetLabel(assignment.v3.inCenter)}</span>
                      )}
                </div>
                <h4>Homework sent home</h4>
                {record?.format === 'CONNECT' ? (
                  <p>Assignments managed in Kumon CONNECT.</p>
                ) : (
                  <div className="history-packets">
                    {(record?.outgoing || assignment?.v3?.issued || []).map((p) => (
                      <span className="packet-chip" key={p.id}>
                        {packetLabel(p)}
                      </span>
                    ))}
                  </div>
                )}
                {!record && !assignment?.v3?.issuedAt && (
                  <p className="muted">Issuance details were not recorded.</p>
                )}
                {record?.reason && (
                  <p>
                    <b>Adjustment / repeat reason:</b> {record.reason}
                  </p>
                )}
              </>
            )}
            {!readOnly && (
              <VerifyCompletion
                key={visit.id + ':' + subject}
                db={db}
                visitId={visit.id}
                subject={subject}
                act={act}
                busy={busy}
              />
            )}
            {record && (
              <p className="small muted">
                Recorded by {record.actor} · {time(record.at, db.timezone)}
              </p>
            )}
            {recorded.filter((r) => r.subject === subject).length > 1 && (
              <details>
                <summary>Earlier session versions</summary>
                {recorded
                  .filter((r) => r.subject === subject)
                  .slice(0, -1)
                  .map((r, index) => (
                    <div key={index}>
                      <p>
                        {r.actor} · {time(r.at, db.timezone)} · {r.reason || 'Original check-in'}
                      </p>
                      {centerFeatures(db).homework && r.mode !== 'activity-only' ? (
                        <p>
                          In center: {r.center ? packetLabel(r.center) : 'No packet'} · Homework:{' '}
                          {r.outgoing.map(packetLabel).join(', ') || 'None'}
                        </p>
                      ) : (
                        <p>
                          {r.activity === 'Worksheets'
                            ? 'Packet'
                            : r.activity === 'Corrections only'
                              ? 'Corrections'
                              : r.activity}
                        </p>
                      )}
                    </div>
                  ))}
              </details>
            )}
          </>
        )}
      </section>
      <section className="quick-section quick-observations">
        <h3>Observations</h3>
        {!notes.length && <p className="muted">No observations or notes recorded.</p>}
        {notes.map((entry) => (
          <HistoricalObservation
            key={entry.id}
            entry={entry}
            db={db}
            act={act}
            busy={busy}
            review={review}
            readOnly={readOnly}
          />
        ))}
        {evaluations.map((e) => (
          <article className="history-note" key={e.id}>
            <b>{e.subject} / Historical evaluation</b>
            <p>
              {Object.entries(e.ratings)
                .filter(([, r]) => r !== 'Not assessed')
                .map(([k, r]) => k + ': ' + r)
                .join(', ')}
            </p>
            <p>{e.text}</p>
            <small>{e.author}</small>
          </article>
        ))}
        {centerFeatures(db).homework &&
          decisions.map((d) => (
            <p key={d.id}>
              {d.subject} / {d.kind} / {d.range.level}
              {d.range.start}-{d.range.end} / {d.note}
            </p>
          ))}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </Modal>
  );
}
function HistoricalObservation({
  entry,
  db,
  act,
  busy,
  readOnly = false,
}: {
  entry: Observation;
  db: Snapshot;
  act: V3Act;
  busy: boolean;
  readOnly?: boolean;
  review: (id: string) => Promise<boolean>;
}) {
  const current = entry.revisions?.at(-1) || entry;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(current.text);
  const [ratings, setRatings] = useState(current.skillRatings || []);
  const [version, setVersion] = useState(entry.revisions?.length || 0);
  return (
    <article className="history-note">
      {editing ? (
        <>
          {!!ratings.length && <h4>Skill ratings</h4>}
          <div className="history-rating-editor">
            {ratings.map((r) => (
              <div key={r.id}>
                <span>{r.label}</span>
                <output>{r.score}/5</output>
                <div className="skill-rating-buttons" role="group" aria-label={r.label + ' rating'}>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      type="button"
                      key={score}
                      aria-label={r.label + ': ' + score + ' out of 5'}
                      aria-pressed={r.score === score}
                      onClick={() =>
                        setRatings(
                          ratings.map((item) => (item.id === r.id ? { ...item, score } : item)),
                        )
                      }
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DictatedNote
            text={text}
            setText={setText}
            label="Instructional note"
            dictationOnly={entry.context === 'additional'}
            showPrivacyHint={false}
          />
          <div className="history-edit-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                if (
                  await act({
                    action: 'observation-edit',
                    id: entry.id,
                    expectedVersion: version,
                    text,
                    skillRatings: ratings,
                  })
                )
                  setEditing(false);
              }}
            >
              Update observation
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setText(current.text);
                setRatings(current.skillRatings || []);
                setEditing(false);
              }}
            >
              Reset
            </button>
          </div>
        </>
      ) : (
        <>
          {entry.choices.length > 0 && <p>{entry.choices.join(' · ')}</p>}
          {!!current.skillRatings?.length && (
            <>
              <h4>Skill ratings</h4>
              <dl className="history-skill-ratings">
                {current.skillRatings.map((r) => (
                  <div key={r.id}>
                    <dt>{r.label}</dt>
                    <dd>
                      <span
                        className="history-rating-track"
                        role="meter"
                        aria-label={r.label}
                        aria-valuemin={0}
                        aria-valuemax={5}
                        aria-valuenow={r.score}
                        aria-valuetext={r.score + ' out of 5'}
                      >
                        <span style={{ width: (r.score / 5) * 100 + '%' }} />
                      </span>
                      <span>{r.score}/5</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {current.text && (
            <>
              <h4>Instructional note</h4>
              <p className="history-note-text">{current.text}</p>
            </>
          )}
          {entry.followUp && <p className="small muted">Follow-up</p>}
          {!readOnly && db.staff.role !== 'assistant' && (
            <button
              className="text-button"
              onClick={() => {
                setText(current.text);
                setRatings(current.skillRatings || []);
                setVersion(entry.revisions?.length || 0);
                setEditing(true);
              }}
            >
              Edit observation
            </button>
          )}
        </>
      )}
    </article>
  );
}
