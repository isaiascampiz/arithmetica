'use client';
import { useState } from 'react';
import { Edit3 } from 'lucide-react';
import { isOpenVisit, type Snapshot, type Student } from '@/lib/model';
import { recurring } from '@/lib/schedule';
import { dailyWorksheets, dailyWork } from '@/lib/worksheet-allocation';
import { centerFeatures } from '@/lib/center-features';
import type { Subject, StudentSettings } from '@/lib/v2-model';
import type { V2Command } from '@/lib/v2-domain';
import { Modal, type V3Act } from './v3-shared';
import { SettingRow, Switch } from './ui-primitives';
import { SubjectAchievement } from './v3-profile-achievements';

type Props = { db: Snapshot; student: Student; act: V3Act; busy: boolean; error: string };
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu'];
const subjects: Subject[] = ['Math', 'Reading'];
function EditButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      className="secondary profile-edit-action"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Edit3 size={15} />
      Edit
    </button>
  );
}
function Tabs<T extends string>({
  values,
  value,
  change,
  label,
}: {
  values: T[];
  value: T;
  change: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented profile-subject-selector" role="tablist" aria-label={label}>
      {values.map((v, i) => (
        <button
          type="button"
          role="tab"
          aria-selected={v === value}
          tabIndex={v === value ? 0 : -1}
          className={v === value ? 'selected' : ''}
          key={v}
          onClick={() => change(v)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const next = (i + (e.key === 'ArrowRight' ? 1 : values.length - 1)) % values.length;
              change(values[next]);
              (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
            }
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function StudentInformation({
  db,
  student,
  act,
  busy,
  error,
  editing,
  close,
  months,
  open,
}: Props & { editing: boolean; close: () => void; open: () => void; months: number | null }) {
  const c = db.operations!.students[student.id];
  const [page, setPage] = useState<'Details' | 'Enrollment'>('Details');
  return (
    <section className="panel overview-card overview-student" aria-label="Student information">
      <div className="profile-section-heading">
        <h2>Student information</h2>
        {db.staff.role !== 'assistant' && (
          <EditButton onClick={open} disabled={busy} label="Edit student information" />
        )}
      </div>
      <Tabs
        values={['Details', 'Enrollment']}
        value={page}
        change={setPage}
        label="Student information"
      />
      <dl className="profile-readout">
        {page === 'Details' ? (
          <>
            <div>
              <dt>Student name</dt>
              <dd>{student.name}</dd>
            </div>
            <div>
              <dt>Grade</dt>
              <dd>{c.grade || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Regular visits</dt>
              <dd>
                {recurring(db.operations!, c)
                  .map((d) => weekdays[d - 1])
                  .join(' / ') || 'Not configured'}
              </dd>
            </div>
            <div>
              <dt>Early learner</dt>
              <dd>{student.earlyLearner ? 'Yes' : 'No'}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Enrollment status</dt>
              <dd>{c.active ? 'Active' : 'Inactive'}</dd>
            </div>
            <div>
              <dt>Enrollment date</dt>
              <dd>{c.enrollmentDate || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Time enrolled</dt>
              <dd>{months === null ? 'Not recorded' : months + ' months'}</dd>
            </div>
            {c.awayUntil && (
              <div>
                <dt>Away until</dt>
                <dd>{c.awayUntil}</dd>
              </div>
            )}
          </>
        )}
      </dl>
      {editing && (
        <ProfileEditor
          db={db}
          student={student}
          act={act}
          busy={busy}
          error={error}
          close={close}
          initialPage={page}
        />
      )}
    </section>
  );
}

export function OverviewSubjects({
  db,
  student,
  act,
  legacyAct,
  busy,
  error,
}: Props & { legacyAct: (c: V2Command) => Promise<boolean> }) {
  const cfg = db.operations!.students[student.id];
  const [selected, setSelected] = useState<Subject>(
    cfg.subjects.Math.enrolled ? 'Math' : 'Reading',
  );
  const [editing, setEditing] = useState<'edit' | 'enroll' | null>(null);
  const c = cfg.subjects[selected];
  return (
    <section className="panel overview-card overview-subjects" aria-label="Subjects">
      <div className="profile-section-heading">
        <h2>Subjects</h2>
        {db.staff.role !== 'assistant' && (
          <EditButton
            onClick={() => setEditing('edit')}
            disabled={busy}
            label={'Edit ' + selected}
          />
        )}
      </div>
      <Tabs values={subjects} value={selected} change={setSelected} label="Subjects" />
      <div className="overview-subject-panel" role="region" aria-label={selected}>
        <dl className="profile-readout">
          <div>
            <dt>Learning mode</dt>
            <dd>{c.enrolled ? (c.format === 'CONNECT' ? 'Kumon CONNECT' : 'PAPER') : '\u2014'}</dd>
          </div>
          <div>
            <dt>Current level</dt>
            <dd>{c.enrolled ? c.level || 'Not recorded' : '\u2014'}</dd>
          </div>
          <div>
            <dt>Current worksheet</dt>
            <dd>
              {c.enrolled && c.format === 'Paper' && centerFeatures(db).homework
                ? c.currentStart
                : '\u2014'}
            </dd>
          </div>
          <div>
            <dt>Worksheets per day</dt>
            <dd>
              {c.enrolled && c.format === 'Paper' && centerFeatures(db).homework
                ? dailyWorksheets(c)
                : '\u2014'}
            </dd>
          </div>
        </dl>
        {!c.enrolled && (
          <div className="subject-not-enrolled">
            <button className="secondary" onClick={() => setEditing('enroll')}>
              Add {selected}
            </button>
          </div>
        )}
        {c.enrolled && centerFeatures(db).medals && (
          <SubjectAchievement
            db={db}
            student={student}
            subject={selected}
            legacyAct={legacyAct}
            busy={busy}
            error={error}
          />
        )}
      </div>
      {c.enrolled && cfg.goals && <p className="overview-goal">Focus: {cfg.goals}</p>}
      {editing && (
        <ProfileEditor
          db={db}
          student={student}
          act={act}
          busy={busy}
          error={error}
          subject={selected}
          enrollOnOpen={editing === 'enroll'}
          close={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function ProfileEditor({
  db,
  student,
  act,
  busy,
  error,
  close,
  subject,
  initialPage = 'Details',
  enrollOnOpen = false,
}: Props & {
  close: () => void;
  subject?: Subject;
  initialPage?: 'Details' | 'Enrollment';
  enrollOnOpen?: boolean;
}) {
  const original = db.operations!.students[student.id];
  const [cfg, setCfg] = useState<StudentSettings>(() => {
    const copy = structuredClone(original);
    if (subject && enrollOnOpen) {
      copy.subjects[subject].enrolled = true;
      if (
        !db.operations!.configHistory.some(
          (h) => h.studentId === student.id && h.subjects[subject].enrolled,
        )
      )
        Object.assign(copy.subjects[subject], {
          dailyWork: dailyWork(10),
          sheetsPerPacket: 10,
          packetsPerDay: 1,
          classworkSheets: 10,
        });
    }
    return copy;
  });
  const [name, setName] = useState(student.name),
    [early, setEarly] = useState(student.earlyLearner),
    [page, setPage] = useState(initialPage);
  const days = cfg.visitDays || recurring(db.operations!, cfg);
  const c = subject ? cfg.subjects[subject] : null;
  const patch = (p: Partial<NonNullable<typeof c>>) => {
    if (subject && c) setCfg({ ...cfg, subjects: { ...cfg.subjects, [subject]: { ...c, ...p } } });
  };
  async function save() {
    if (
      await act({
        action: 'student-save',
        studentId: student.id,
        name,
        earlyLearner: early,
        settings: cfg,
        enrollmentDate: cfg.enrollmentDate || null,
        visitDays: days,
        tiles: original.observationTiles || [],
        goals: original.goals || '',
        arrivalWindow: original.arrivalWindow || '',
      })
    )
      close();
  }
  return (
    <Modal
      title={subject ? (enrollOnOpen ? 'Add ' : 'Edit ') + subject : 'Edit student information'}
      close={close}
      className="settings-edit-dialog profile-edit-dialog"
      dismissOnBackdrop
      footer={
        <>
          <button className="secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary"
            type="submit"
            form="profile-editor"
            disabled={busy || !name.trim()}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <form
        id="profile-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {!subject ? (
          <>
            <Tabs
              values={['Details', 'Enrollment']}
              value={page}
              change={setPage}
              label="Edit student information"
            />
            {page === 'Details' ? (
              <div className="profile-edit-fields">
                <label>
                  Student name
                  <input
                    value={name}
                    maxLength={120}
                    required
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Grade
                  <input
                    value={cfg.grade || ''}
                    maxLength={40}
                    onChange={(e) => setCfg({ ...cfg, grade: e.target.value || null })}
                  />
                </label>
                <SettingRow label="Early learner">
                  <Switch label="Early learner" checked={early} onChange={setEarly} />
                </SettingRow>
                <fieldset>
                  <legend>Regular visits</legend>
                  <div className="day-options">
                    {weekdays.map((d, i) => (
                      <button
                        type="button"
                        className="secondary"
                        key={d}
                        aria-pressed={days.includes(i + 1)}
                        onClick={() =>
                          setCfg({
                            ...cfg,
                            visitDays: days.includes(i + 1)
                              ? days.filter((n) => n !== i + 1)
                              : [...days, i + 1].sort(),
                          })
                        }
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : (
              <div className="profile-edit-fields">
                <label>
                  Enrollment status
                  <select
                    value={cfg.active ? 'active' : 'inactive'}
                    onChange={(e) => setCfg({ ...cfg, active: e.target.value === 'active' })}
                  >
                    <option value="active">Active</option>
                    <option
                      value="inactive"
                      disabled={db.visits.some((v) => v.studentId === student.id && isOpenVisit(v))}
                    >
                      Inactive
                    </option>
                  </select>
                </label>
                <label>
                  Enrollment date
                  <input
                    type="date"
                    value={cfg.enrollmentDate || ''}
                    onChange={(e) => setCfg({ ...cfg, enrollmentDate: e.target.value || null })}
                  />
                </label>
              </div>
            )}
          </>
        ) : (
          c && (
            <div className="profile-edit-fields subject-editor-fields">
              <SettingRow label="Enrolled">
                <Switch
                  label="Enrolled"
                  checked={c.enrolled}
                  onChange={(enrolled) => patch({ enrolled })}
                />
              </SettingRow>
              {c.enrolled && (
                <>
                  <div className="profile-edit-pair">
                    <label>
                      Learning mode
                      <select
                        value={c.format}
                        onChange={(e) => patch({ format: e.target.value as 'Paper' | 'CONNECT' })}
                      >
                        <option value="Paper">PAPER</option>
                        <option value="CONNECT">Kumon CONNECT</option>
                      </select>
                    </label>
                    <label>
                      Current level
                      <input
                        value={c.level}
                        maxLength={20}
                        onChange={(e) => patch({ level: e.target.value })}
                      />
                    </label>
                  </div>
                  {centerFeatures(db).homework && c.format === 'Paper' && (
                    <div className="profile-edit-pair">
                      <label>
                        {enrollOnOpen ? 'Starting worksheet' : 'Current worksheet'}
                        <input
                          type="number"
                          min={1}
                          value={c.currentStart}
                          onChange={(e) =>
                            patch({
                              currentStart: Number(e.target.value),
                              currentEnd: Math.max(c.currentEnd, Number(e.target.value)),
                              nextStart: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Worksheets per day
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={dailyWorksheets(c)}
                          onChange={(e) => {
                            const worksheets = Number(e.target.value);
                            patch({
                              dailyWork: { version: 1, worksheets, packetSheets: 10 },
                              packetsPerDay: Math.ceil(worksheets / 10),
                              sheetsPerPacket: 10,
                              classworkSheets: worksheets
                                ? Math.min(10, worksheets)
                                : Math.min(10, c.classworkSheets),
                            });
                          }}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
