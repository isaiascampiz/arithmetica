'use client';
import { useState, type ReactNode } from 'react';
import { type Snapshot, type Student } from '@/lib/model';
import type { Subject } from '@/lib/v2-model';
import { Modal } from './v3-shared';
import { AcademicProgress } from './v3-academic-progress';
import { HomeworkConsistency } from './v3-homework-consistency';
import { CenterDuration } from './v3-center-duration';
import { SkillProgress, type SkillView } from './v3-skill-progress';

const titles = {
  academic: 'Academic progress',
  homework: 'Homework consistency',
  duration: 'Time spent at center',
  skills: 'Skill ratings',
};
type Card = keyof typeof titles;

export function ProgressCharts({ db, student }: { db: Snapshot; student: Student }) {
  const [skillViews, setSkillViews] = useState<Record<string, SkillView>>({});
  const [selected, setSelected] = useState<Subject>('Math');
  const [expanded, setExpanded] = useState<Card | null>(null);
  const op = db.operations!,
    cfg = op.students[student.id];
  const subjects = (['Math', 'Reading'] as Subject[]).filter((sub) => cfg.subjects[sub].enrolled);
  const subject = subjects.includes(selected) ? selected : subjects[0];
  const paper = subject && cfg.subjects[subject].format === 'Paper';
  const connect = (
    <p className="progress-empty">
      {subject
        ? 'Assignments and academic progression are managed in Kumon CONNECT.'
        : 'No enrolled subjects recorded.'}
    </p>
  );

  function academic(detail: boolean) {
    if (!paper || !subject) return connect;
    return (
      <AcademicProgress
        key={subject + (detail ? '-detail' : '-preview')}
        db={db}
        student={student}
        subject={subject}
        detail={detail}
      />
    );
  }
  function homework(detail: boolean) {
    if (!paper || !subject) return connect;
    return (
      <HomeworkConsistency
        key={subject + (detail ? '-detail' : '-preview')}
        db={db}
        student={student}
        subject={subject}
        detail={detail}
      />
    );
  }
  function duration(detail: boolean) {
    return <CenterDuration db={db} student={student} detail={detail} />;
  }
  function skills(detail: boolean) {
    return (
      <SkillProgress
        db={db}
        student={student}
        detail={detail}
        view={skillViews[student.id] || {}}
        updateView={(change) =>
          setSkillViews((previous) => ({
            ...previous,
            [student.id]: { ...previous[student.id], ...change },
          }))
        }
      />
    );
  }
  const content: Record<Card, (detail: boolean) => ReactNode> = {
    academic,
    homework,
    duration,
    skills,
  };
  return (
    <div className="progress-v3 progress-layout">
      <div className="progress-toolbar">
        <div className="segmented" role="tablist" aria-label="Progress subjects">
          {subjects.map((sub, index) => (
            <button
              type="button"
              key={sub}
              role="tab"
              id={'progress-tab-' + sub}
              aria-controls="progress-cards"
              aria-selected={subject === sub}
              tabIndex={subject === sub ? 0 : -1}
              className={subject === sub ? 'selected' : ''}
              onClick={() => setSelected(sub)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  const next = subjects[(index + 1) % subjects.length];
                  setSelected(next);
                  document.getElementById('progress-tab-' + next)?.focus();
                }
              }}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>
      <div
        className="progress-grid"
        id="progress-cards"
        role="tabpanel"
        aria-labelledby={subject ? 'progress-tab-' + subject : undefined}
      >
        {(Object.keys(titles) as Card[]).map((card) => (
          <article
            className="panel progress-card progress-summary-card"
            key={card}
            aria-label={titles[card]}
          >
            <header>
              <h2>{titles[card]}</h2>
            </header>
            <button
              type="button"
              className="progress-card-hit"
              aria-label={'Open ' + titles[card]}
              aria-haspopup="dialog"
              onClick={() => setExpanded(card)}
            />
            <div className="progress-card-preview">{content[card](false)}</div>
          </article>
        ))}
      </div>
      {expanded && (
        <Modal
          title={titles[expanded]}
          className={
            'progress-detail' +
            (expanded === 'academic'
              ? ' academic-detail'
              : expanded === 'homework'
                ? ' homework-detail'
                : expanded === 'duration'
                  ? ' center-time-detail'
                  : ' skill-trend-detail')
          }
          close={() => setExpanded(null)}
        >
          {content[expanded](true)}
        </Modal>
      )}
    </div>
  );
}
