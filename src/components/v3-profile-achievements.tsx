'use client';
import { useState } from 'react';
import { dayKey, type Snapshot, type Student } from '@/lib/model';
import type { Achievement, Subject } from '@/lib/v2-model';
import type { V2Command } from '@/lib/v2-domain';

const distinctions = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const;

function awardsFor(db: Snapshot, student: Student, subject: Subject) {
  return db
    .operations!.achievements.filter((a) => a.studentId === student.id && a.subject === subject)
    .toSorted((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Original small illustration inspired by ribbon-and-disc achievement medals. */
function MedalIllustration({ award }: { award: Achievement }) {
  return (
    <svg
      className={'profile-medal-art ' + award.distinction.toLowerCase()}
      viewBox="0 0 40 48"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 2h9l7 18-8 4z" fill="var(--brand)" />
      <path d="M23 2h9L24 24l-8-4z" fill="var(--brand)" opacity=".72" />
      <path d="M12 2h3l7 18-3 1zM25 2h3l-8 20-3-1z" fill="#fff" opacity=".7" />
      <circle
        cx="20"
        cy="29"
        r="16"
        fill="var(--medal-fill)"
        stroke="var(--medal-edge)"
        strokeWidth="1.5"
      />
      <circle cx="20" cy="29" r="12.5" fill="none" stroke="var(--medal-edge)" strokeWidth=".8" />
      <path
        d="M10 25q5-2 10 1 5-3 10-1v7q-5-2-10 1-5-3-10-1zM20 26v7"
        fill="none"
        stroke="var(--medal-ink)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <text x="20" y="22" textAnchor="middle" fill="var(--medal-ink)" fontSize="7" fontWeight="700">
        {award.subject === 'Math' ? 'M' : 'R'}
      </text>
      <path
        d="m20 36 1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2-1.5-1.4 2-.3z"
        fill="var(--medal-ink)"
      />
    </svg>
  );
}

export function ProfileMedals({ db, student }: { db: Snapshot; student: Student }) {
  return (
    <span className="profile-name-medals">
      {(['Math', 'Reading'] as Subject[]).map((subject) => {
        const award = awardsFor(db, student, subject)[0];
        return award ? (
          <span
            key={subject}
            role="img"
            aria-label={'Current ' + subject + ' ' + award.distinction + ' achievement medal'}
            title={'Current · ' + subject + ' · ' + award.distinction + ' · ' + award.date}
          >
            <MedalIllustration award={award} />
          </span>
        ) : null;
      })}
    </span>
  );
}

export function SubjectAchievement({
  db,
  student,
  subject,
  legacyAct,
  busy,
  error,
}: {
  db: Snapshot;
  student: Student;
  subject: Subject;
  legacyAct: (c: V2Command) => Promise<boolean>;
  busy: boolean;
  error: string;
}) {
  const awards = awardsFor(db, student, subject);
  const [editing, setEditing] = useState(false);
  const [distinction, setDistinction] = useState<Achievement['distinction']>('Bronze');
  const [awardedOn, setAwardedOn] = useState(dayKey(new Date(), db.timezone));
  const renderAward = (award: Achievement, index: number) => (
    <li className={'profile-award-item' + (index === 0 ? ' current' : '')} key={award.id}>
      <MedalIllustration award={award} />
      <div>
        <strong>{award.distinction}</strong>
        <span>
          <time dateTime={award.date}>
            {new Date(award.date + 'T12:00:00Z').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </time>
        </span>
        {index === 0 && <span className="profile-award-state">Current</span>}
      </div>
    </li>
  );
  return (
    <section className="profile-achievement" aria-label={subject + ' achievement medal'}>
      <div className="profile-achievement-heading">
        <h3>Achievement medal history</h3>
        {db.staff.role !== 'assistant' && !editing && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Add medal
          </button>
        )}
      </div>
      {awards.length ? (
        <ul className="profile-award-history" aria-label={subject + ' achievement medal history'}>
          {awards.map(renderAward)}
        </ul>
      ) : (
        <p className="small muted">No medal recorded.</p>
      )}
      {editing && (
        <form
          aria-label={'Record ' + subject + ' achievement medal'}
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await legacyAct({
                action: 'achievement',
                studentId: student.id,
                subject,
                distinction,
                date: awardedOn,
                evidence: '',
              })
            )
              setEditing(false);
          }}
        >
          <div className="profile-medal-fields">
            <label>
              Medal
              <select
                value={distinction}
                onChange={(e) => setDistinction(e.target.value as Achievement['distinction'])}
              >
                {distinctions.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Award date
              <input
                type="date"
                required
                value={awardedOn}
                onChange={(e) => setAwardedOn(e.target.value)}
              />
            </label>
          </div>
          <div className="profile-editor-actions">
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button type="submit" className="secondary" disabled={busy || !awardedOn}>
              Save medal
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
