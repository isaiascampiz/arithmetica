'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { isOpenVisit, type Snapshot, type Visit } from '@/lib/model';
import {
  currentSets,
  incomingPackets,
  subjectPlan,
  packetLabel,
  repeatSequence,
  reuseSequence,
} from '@/lib/v3-planning';
import type { Subject } from '@/lib/v2-model';
import type { Packet, Activity } from '@/lib/v3-model';
import { Modal, DictatedNote, type V3Act } from './v3-shared';
import { Avatar, time, useNow } from './shared-ui';

type RepeatPlan = {
  level: string;
  start: number;
  packetsPerDay: number;
  sheetsPerPacket: number;
  reason: string;
  startWith: 'today' | 'homework';
};
type AdjustmentForm = {
  center: Packet | null;
  out: Packet[];
  reason: string;
};
type Draft = {
  activity: Activity;
  unfinished: string[];
  actual: Packet[] | null;
  center?: Packet | null;
  repeat: RepeatPlan | null;
  editor: 'adjust' | 'repeat' | null;
  version: number;
  correcting: boolean;
  reason: string;
};
export function QuickView({
  db,
  visit,
  busy,
  error,
  act,
  close,
}: {
  db: Snapshot;
  visit: Visit;
  busy: boolean;
  error: string;
  act: V3Act;
  close: () => void;
}) {
  const now = useNow(),
    student = db.students.find((s) => s.id === visit.studentId)!,
    cfg = db.operations!.students[student.id],
    sets = currentSets(db, visit),
    subjects = (['Math', 'Reading'] as Subject[]).filter((s) => cfg.subjects[s].enrolled);
  const [subject, setSubject] = useState<Subject>(subjects[0] || 'Math'),
    [text, setText] = useState(''),
    [localError, setLocalError] = useState('');
  const [skills, setSkills] = useState(
    () =>
      cfg.observationSkills || [
        { id: 'focus', label: 'Focus' },
        { id: 'handwriting', label: 'Handwriting' },
        { id: 'independence', label: 'Independence' },
      ],
  );
  const [scores, setScores] = useState<Record<string, number>>({});
  const [customizing, setCustomizing] = useState(false);
  const [addingSkill, setAddingSkill] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [skillsChanged, setSkillsChanged] = useState(false);
  const skillRatings = skills
    .filter((s) => scores[s.id] > 0)
    .map((s) => ({ ...s, score: scores[s.id] }));
  const observationData = {
    skillRatings,
    ...(skillsChanged ? { skillSettings: { version: cfg.version, skills } } : {}),
  };
  const hasObservations = !!text.trim() || !!skillRatings.length || skillsChanged;
  function changeSkills(next: typeof skills) {
    setSkills(next);
    setSkillsChanged(true);
  }
  function moveSkill(index: number, direction: number) {
    const next = [...skills];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    changeSkills(next);
  }
  const savedFor = (s: Subject) =>
    visit.subjectCheckIns?.[s] ||
    (visit.handoff &&
    (visit.handoff.activities[s] ||
      sets.some((a) => a.subject === s && visit.handoff!.assignmentIds.includes(a.id)) ||
      cfg.subjects[s].format === 'CONNECT')
      ? visit.handoff
      : undefined);
  const defaultDraft = (s: Subject): Draft => ({
    activity: savedFor(s)?.activities[s] || 'Worksheets',
    unfinished: incomingPackets(db, student.id, s, sets.find((a) => a.subject === s)?.id)
      .filter((p) => p.status === 'unfinished')
      .map((p) => p.id),
    actual: null,
    repeat: null,
    editor: null,
    version: sets.find((a) => a.subject === s)?.v3!.version || 0,
    correcting: false,
    reason: '',
  });
  const [drafts, setDrafts] = useState<Partial<Record<Subject, Draft>>>(() =>
    Object.fromEntries(subjects.map((s) => [s, defaultDraft(s)])),
  );
  const [adjustForms, setAdjustForms] = useState<Partial<Record<Subject, AdjustmentForm>>>({});
  const [repeatForms, setRepeatForms] = useState<Partial<Record<Subject, RepeatPlan>>>({});
  const shown = subjects.includes(subject) ? subject : subjects[0],
    a = sets.find((a) => a.subject === shown),
    d = drafts[shown] || defaultDraft(shown),
    saved = savedFor(shown),
    teaching = db.staff.role !== 'assistant',
    editable = teaching && isOpenVisit(visit) && (!saved || d.correcting);
  const prior = incomingPackets(db, student.id, shown, a?.id),
    unfinished = prior
      .filter((p) => d.unfinished.includes(p.id))
      .map((p) => ({ ...p, status: 'unfinished' as const }));
  const base = a ? subjectPlan(db, a, d.activity, unfinished, d.actual?.length) : null;
  const manual =
    a && d.center !== undefined && !d.repeat
      ? subjectPlan(
          db,
          { ...a, v3: { ...a.v3!, inCenter: d.center, planned: d.actual || [], issuedAt: null } },
          d.activity,
        )
      : null;
  const repeat =
    a && d.repeat
      ? repeatSequence(
          db,
          a,
          {
            ...d.repeat,
            startWith: d.activity === 'Corrections only' ? 'homework' : d.repeat.startWith,
          },
          d.activity,
          d.center || base!.center,
          unfinished,
        )
      : null;
  const recommendation = repeat
    ? { center: repeat.v3!.inCenter, out: repeat.v3!.planned, review: repeat.v3!.review }
    : manual || base;
  const outgoing =
    saved && !d.correcting
      ? a?.v3!.issued || []
      : repeat || manual
        ? recommendation!.out
        : d.actual || recommendation?.out || [];
  const center =
    saved && !d.correcting
      ? d.activity === 'Corrections only'
        ? null
        : a?.v3!.inCenter
      : recommendation?.center;
  const changed =
    editable && a
      ? [
          ...new Map(
            [a.v3!.inCenter, ...a.v3!.planned, ...a.v3!.held, ...unfinished]
              .filter(
                (p): p is Packet =>
                  !!p && p.id !== center?.id && !outgoing.some((q) => q.id === p.id),
              )
              .map((p) => [p.id, p]),
          ).values(),
        ]
      : [];
  const originalOutgoing = new Set(a?.v3!.planned.map((p) => p.id));
  const reusedIds = new Set(
    [
      ...unfinished,
      ...db
        .operations!.assignments.filter(
          (x) => x.studentId === student.id && x.subject === shown && x.v3,
        )
        .flatMap((x) => x.v3!.held),
    ].map((p) => p.id),
  );
  const form = repeatForms[shown] || {
    level: cfg.subjects[shown].level,
    start: cfg.subjects[shown].currentStart,
    packetsPerDay: cfg.subjects[shown].packetsPerDay,
    sheetsPerPacket: cfg.subjects[shown].sheetsPerPacket,
    reason: '',
    startWith: 'today' as const,
  };
  const effectiveRepeat = {
    ...form,
    startWith: d.activity === 'Corrections only' ? ('homework' as const) : form.startWith,
  };
  const proposal =
    a && d.editor === 'repeat'
      ? repeatSequence(db, a, effectiveRepeat, d.activity, center || null, unfinished)
      : null;
  const adjustment = adjustForms[shown] || {
    center: center || null,
    out: outgoing,
    reason: d.reason,
  };
  const adjustmentPlan =
    a && d.editor === 'adjust'
      ? reuseSequence(db, a, adjustment.center, adjustment.out, unfinished)
      : null;
  const update = (patch: Partial<Draft>) => {
    setLocalError('');
    setDrafts((all) => ({ ...all, [shown]: { ...d, ...patch } }));
  };
  const setAdjustment = (patch: Partial<AdjustmentForm>) =>
    setAdjustForms((all) => ({ ...all, [shown]: { ...adjustment, ...patch } }));
  function editPacket(p: Packet, index: number, inCenter = false) {
    const change = (key: 'level' | 'start' | 'end', value: string) => {
      const next = {
        ...p,
        id: crypto.randomUUID(),
        prepared: false,
        range: { ...p.range, [key]: key === 'level' ? value : Number(value) },
      };
      if (inCenter) {
        const size = d.repeat?.sheetsPerPacket || cfg.subjects[shown].sheetsPerPacket;
        const out = adjustment.out.map((q, i) => ({
          ...q,
          id: crypto.randomUUID(),
          sourceAssignmentId: a!.id,
          prepared: false,
          range: {
            level: next.range.level,
            start: next.range.end + 1 + i * size,
            end: next.range.end + (i + 1) * size,
          },
        }));
        setAdjustment({ center: next, out });
      } else setAdjustment({ out: adjustment.out.map((q, i) => (i === index ? next : q)) });
    };
    return (
      <div
        role="row"
        className={'packet-editor-row quick-queue-row' + (inCenter ? ' today-row' : '')}
        key={(inCenter ? 'center' : 'out') + index}
      >
        <span role="cell" className="quick-queue-kind">
          {inCenter ? 'Today' : 'Homework'}
        </span>
        {(['level', 'start', 'end'] as const).map((key) => (
          <div role="cell" key={key}>
            <input
              aria-label={
                shown + (inCenter ? ' in-center packet ' : ' packet ' + (index + 1) + ' ') + key
              }
              type={key === 'level' ? 'text' : 'number'}
              min={key === 'level' ? undefined : 1}
              value={p.range[key]}
              onChange={(e) => change(key, e.target.value)}
            />
          </div>
        ))}
        <div role="cell" className="quick-queue-remove">
          {!inCenter && (
            <button
              type="button"
              className="text-button"
              aria-label={'Remove packet ' + (index + 1)}
              onClick={() => setAdjustment({ out: adjustment.out.filter((_, i) => i !== index) })}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    );
  }
  const openSubject = (s: Subject) => {
    setSubject(s);
    setLocalError('');
  };
  const review = recommendation?.review || [];
  async function save() {
    setLocalError('');
    if (!editable) {
      if (
        hasObservations &&
        (await act({
          action: 'observation',
          ...observationData,
          visitId: visit.id,
          choices: [],
          text,
          followUp: false,
        }))
      )
        close();
      return;
    }
    if (review.length) {
      setLocalError(review.join(' '));
      return;
    }
    if (d.correcting && !d.reason.trim()) {
      setLocalError('Enter a correction reason.');
      return;
    }
    const ok = await act({
      action: 'handoff',
      ...observationData,
      subject: shown,
      activity: d.activity,
      visitId: visit.id,
      expectedAt: saved?.at || null,
      subjects: a
        ? [
            {
              subject: shown,
              assignmentId: a.id,
              version: d.version,
              activity: d.activity,
              exception: d.unfinished.length > 0,
              incoming: d.unfinished.map((id) => ({ id, state: 'unfinished' as const })),
              actual: d.repeat ? null : d.actual ? outgoing : null,
              ...(d.center !== undefined ? { center: center || null } : {}),
              repeat: d.repeat ? { ...d.repeat, restart: false } : null,
              physicalConfirmed: true,
              reason: d.reason,
            },
          ]
        : [],
      choices: [],
      text,
      followUp: false,
      correctionReason: d.correcting ? d.reason : '',
    });
    if (ok) {
      setText('');
      setScores({});
      setSkillsChanged(false);
      const next = subjects.find((s) => s !== shown && !savedFor(s));
      if (next) openSubject(next);
      else close();
    }
  }
  function packetCards(items: Packet[]) {
    return (
      <div className="quick-packet-cards">
        {items.map((p) => {
          const returned = d.unfinished.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={'packet-chip' + (returned ? ' unfinished' : '')}
              disabled={!editable}
              aria-pressed={returned}
              aria-label={(returned ? 'Undo unfinished ' : 'Mark unfinished ') + packetLabel(p)}
              onClick={() =>
                update({
                  unfinished: returned
                    ? d.unfinished.filter((id) => id !== p.id)
                    : [...d.unfinished, p.id],
                })
              }
            >
              {packetLabel(p)}
            </button>
          );
        })}
      </div>
    );
  }
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(visit.arrivedAt)) / 60000));
  return (
    <Modal
      titleLabel={student.name}
      title={
        <>
          <span aria-hidden="true">
            <Avatar student={student} />
          </span>
          <span className="quick-student-identity">
            <span>{student.name}</span>
            <small>
              {isOpenVisit(visit)
                ? (saved ? 'Time here: ' : 'Waited: ') +
                  minutes +
                  (minutes === 1 ? ' minute' : ' minutes')
                : visit.departedAt
                  ? 'Departed ' + time(visit.departedAt, db.timezone)
                  : 'Departure unverified'}
            </small>
          </span>
        </>
      }
      className="quick-view"
      close={close}
      footer={
        <>
          <span className="small muted">
            {editable
              ? 'Checking in confirms the displayed physical materials are ready and issued for this subject.'
              : 'Optional notes remain available.'}
          </span>
          {teaching && (
            <button
              className="primary"
              disabled={
                busy ||
                (!editable && !hasObservations) ||
                (editable && (review.length > 0 || d.editor !== null))
              }
              onClick={() => void save()}
            >
              {busy ? 'Saving...' : editable ? 'Check in ' + shown : 'Save observations'}
            </button>
          )}
        </>
      }
    >
      <div className="quick-pinned-context">
        <div className="quick-context">{cfg.goals && <span>{cfg.goals}</span>}</div>
        <div className="quick-subject-tabs" role="tablist" aria-label="Student subjects">
          {subjects.map((s, index) => (
            <button
              type="button"
              role="tab"
              key={s}
              id={'quick-tab-' + s}
              aria-selected={shown === s}
              aria-controls={'quick-panel-' + s}
              tabIndex={shown === s ? 0 : -1}
              onClick={() => openSubject(s)}
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
                if (next === null) return;
                e.preventDefault();
                openSubject(subjects[next]);
                document.getElementById('quick-tab-' + subjects[next])?.focus();
              }}
            >
              {s}
              {savedFor(s) && (
                <>
                  <Check size={16} aria-hidden="true" />
                  <span className="quick-confirmed-label"> confirmed</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
      <section
        role="tabpanel"
        id={'quick-panel-' + shown}
        aria-labelledby={'quick-tab-' + shown}
        className="quick-section quick-subject-card"
      >
        {a ? (
          <>
            <h4>Incoming homework</h4>
            <p className="muted quick-directions">
              Select any packets the student did not finish.{' '}
              {d.activity === 'Corrections only'
                ? 'They move to the front of outgoing homework.'
                : "The earliest becomes today's packet; the rest shift into homework."}
            </p>
            {packetCards(prior)}
            <h4>In-center work</h4>
            <div className="quick-in-center">
              <div className="activity-choices">
                {(['Worksheets', 'Corrections only', 'Both'] as Activity[]).map((activity) => (
                  <button
                    type="button"
                    key={activity}
                    disabled={!editable}
                    className={d.activity === activity ? 'selected' : ''}
                    aria-pressed={d.activity === activity}
                    onClick={() => update({ activity })}
                  >
                    {activity === 'Worksheets'
                      ? 'Packet'
                      : activity === 'Corrections only'
                        ? 'Corrections'
                        : 'Both'}
                  </button>
                ))}
              </div>
              <p className="muted quick-directions">
                {d.activity === 'Corrections only'
                  ? 'Corrections only. All packets shift into homework.'
                  : d.activity === 'Both'
                    ? "Today's packet and corrections. Homework follows the Packet plan."
                    : "Today's packet. Unfinished homework takes priority."}
              </p>
              {center && (
                <div className="packet-chips" aria-label="Today's packet">
                  <span className="packet-chip center-packet">{packetLabel(center)}</span>
                </div>
              )}
            </div>
            <div className="quick-outgoing-heading">
              <h4>Outgoing homework</h4>
              <span className="mode-tag">
                {a.v3!.preparedAt && !a.stale && !d.repeat && outgoing.every((p) => p.prepared)
                  ? 'Prepared'
                  : 'Not prepared'}
              </span>
            </div>
            <div
              className="quick-outgoing-cards packet-chips"
              role="list"
              aria-label="Outgoing homework packets"
            >
              {outgoing.map((p) => (
                <div
                  role="listitem"
                  key={p.id}
                  className={
                    'packet-chip' + (editable && !originalOutgoing.has(p.id) ? ' shifted' : '')
                  }
                >
                  <span>{packetLabel(p)}</span>
                  {editable && (
                    <small>
                      {reusedIds.has(p.id)
                        ? d.repeat || d.center !== undefined
                          ? 'Reuse existing packet'
                          : 'Returned packet'
                        : !originalOutgoing.has(p.id)
                          ? 'Pull'
                          : 'Send home'}
                    </small>
                  )}
                </div>
              ))}
            </div>
            {!!changed.length && (
              <div className="quick-held-packets">
                <p className="muted quick-directions">
                  Remove these from outgoing homework. Keep them at the center.
                </p>
                <div className="packet-chips">
                  {changed.map((p) => (
                    <button key={p.id} type="button" className="packet-chip held-packet" disabled>
                      <span>{packetLabel(p)}</span>
                      <small>Not going home</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {editable && (
              <>
                <div className="quick-edit-actions">
                  <button
                    type="button"
                    className="text-button"
                    aria-expanded={d.editor === 'adjust'}
                    onClick={() => {
                      if (d.editor !== 'adjust')
                        setAdjustForms((all) => ({
                          ...all,
                          [shown]: {
                            center: center || null,
                            out: structuredClone(outgoing),
                            reason: d.reason || d.repeat?.reason || '',
                          },
                        }));
                      update({ editor: d.editor === 'adjust' ? null : 'adjust' });
                    }}
                  >
                    Adjust
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    aria-expanded={d.editor === 'repeat'}
                    onClick={() => update({ editor: d.editor === 'repeat' ? null : 'repeat' })}
                  >
                    Repeat
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      update({
                        actual: null,
                        center: undefined,
                        repeat: null,
                        editor: null,
                        reason: '',
                      })
                    }
                  >
                    Reset
                  </button>
                </div>
                {d.editor === 'adjust' && (
                  <div className="packet-editor quick-plan-editor">
                    <h5>Adjust packets</h5>
                    <p className="muted">
                      Confirm these changes to update the plan below. Check-in records the final
                      plan.
                    </p>
                    <div
                      className="quick-adjustment-queue"
                      role="table"
                      aria-label="Packet adjustment queue"
                    >
                      <div className="quick-queue-head" role="row">
                        <span role="columnheader" className="quick-queue-kind">
                          Packet
                        </span>
                        <span role="columnheader">Level</span>
                        <span role="columnheader">Starting page</span>
                        <span role="columnheader">Ending page</span>
                        <span role="columnheader" className="quick-queue-remove">
                          <span className="quick-confirmed-label">Actions</span>
                        </span>
                      </div>
                      {d.activity !== 'Corrections only' &&
                        adjustment.center &&
                        editPacket(adjustment.center, 0, true)}
                      {adjustment.out.map((p, index) => editPacket(p, index))}
                    </div>
                    <p className="muted quick-directions">
                      Changing today&apos;s packet rebuilds the homework rows. You can then tweak
                      them before confirming.
                    </p>
                    <div className="quick-editor-links">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          const last = adjustment.out.at(-1)?.range || adjustment.center?.range;
                          if (!last) return;
                          setAdjustment({
                            out: [
                              ...adjustment.out,
                              {
                                id: crypto.randomUUID(),
                                sourceAssignmentId: a.id,
                                range: {
                                  level: last.level,
                                  start: last.end + 1,
                                  end: last.end + cfg.subjects[shown].sheetsPerPacket,
                                },
                                prepared: false,
                                purpose: 'homework',
                                status: 'planned',
                              },
                            ],
                          });
                        }}
                      >
                        Add packet
                      </button>
                      {unfinished
                        .filter(
                          (p) =>
                            p.id !== adjustmentPlan?.center?.id &&
                            !adjustmentPlan?.out.some((q) => q.id === p.id),
                        )
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="text-button"
                            onClick={() =>
                              setAdjustment({
                                out: [...adjustment.out, { ...p, purpose: 'homework' }],
                              })
                            }
                          >
                            Add returned {packetLabel(p)}
                          </button>
                        ))}
                    </div>
                    {!!adjustmentPlan?.review.length && (
                      <p className="warning-line" role="status">
                        {adjustmentPlan.review.join(' ')}
                      </p>
                    )}
                    <DictatedNote
                      label="Adjustment reason"
                      buttonLabel="Dictate"
                      maxLength={400}
                      text={adjustment.reason}
                      setText={(reason) => setAdjustment({ reason })}
                    />
                    <div className="quick-editor-confirm">
                      <button
                        type="button"
                        className="primary"
                        disabled={
                          !adjustment.reason.trim() ||
                          !adjustmentPlan ||
                          !!adjustmentPlan.review.length
                        }
                        onClick={() => {
                          if (!adjustmentPlan) return;
                          update({
                            actual: adjustmentPlan.out,
                            center: adjustmentPlan.center,
                            repeat: null,
                            reason: adjustment.reason,
                            editor: null,
                          });
                        }}
                      >
                        Confirm adjustment
                      </button>
                    </div>
                  </div>
                )}
                {d.editor === 'repeat' && (
                  <div className="packet-editor quick-plan-editor">
                    <fieldset className="quick-repeat-start">
                      <legend>Start repeat with</legend>
                      <div
                        className="quick-repeat-options"
                        role="group"
                        aria-label="Start repeat with"
                      >
                        {(
                          [
                            ['today', "Today's packet"],
                            ['homework', 'Homework'],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={effectiveRepeat.startWith === value}
                            disabled={value === 'today' && d.activity === 'Corrections only'}
                            onClick={() =>
                              setRepeatForms((all) => ({
                                ...all,
                                [shown]: { ...form, startWith: value },
                              }))
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div className="form-grid">
                      {(
                        [
                          ['level', 'Repeat level'],
                          ['start', 'Starting worksheet/page'],
                          ['packetsPerDay', 'Packets per day'],
                          ['sheetsPerPacket', 'Worksheets per packet'],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            type={key === 'level' ? 'text' : 'number'}
                            min={key === 'packetsPerDay' ? 0 : 1}
                            value={form[key]}
                            onChange={(e) =>
                              setRepeatForms((all) => ({
                                ...all,
                                [shown]: {
                                  ...form,
                                  [key]: key === 'level' ? e.target.value : Number(e.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="quick-proposed-plan">
                      <h5>Proposed plan</h5>
                      {proposal?.v3!.review.length ? (
                        <p className="warning-line" role="status">
                          {proposal.v3!.review.join(' ')}
                        </p>
                      ) : (
                        <>
                          <p>
                            {proposal?.homeworkDays.length || 0} homework days until{' '}
                            {proposal?.nextVisit}: {proposal?.v3!.planned.length || 0} take-home
                            packets
                          </p>
                          <div className="packet-chips">
                            {proposal?.v3!.inCenter && (
                              <span className="packet-chip">
                                In center: {packetLabel(proposal.v3!.inCenter)}
                              </span>
                            )}
                            {proposal?.v3!.planned.map((p) => (
                              <span key={p.id} className="packet-chip">
                                {packetLabel(p)}
                                {reusedIds.has(p.id) && <small>Reuse existing packet</small>}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <DictatedNote
                      label="Repeat reason"
                      buttonLabel="Dictate"
                      maxLength={400}
                      text={form.reason}
                      setText={(reason) =>
                        setRepeatForms((all) => ({ ...all, [shown]: { ...form, reason } }))
                      }
                    />
                    <div className="quick-editor-confirm">
                      <button
                        type="button"
                        className="primary"
                        disabled={!proposal || !!proposal.v3!.review.length || !form.reason.trim()}
                        onClick={() =>
                          update({
                            repeat: { ...effectiveRepeat },
                            center: proposal!.v3!.inCenter,
                            actual: null,
                            reason: form.reason,
                            editor: null,
                          })
                        }
                      >
                        Confirm repeat plan
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {review.map((message) => (
              <p className="warning-line" key={message}>
                {message}
              </p>
            ))}
          </>
        ) : (
          <p>
            {cfg.subjects[shown].format === 'CONNECT'
              ? 'Assignments are managed in Kumon CONNECT.'
              : 'No paper plan is linked to this visit.'}
          </p>
        )}
        {teaching && saved && isOpenVisit(visit) && (
          <button
            type="button"
            className="text-button"
            onClick={() => update({ correcting: !d.correcting, version: a?.v3!.version || 0 })}
          >
            Edit subject check-in
          </button>
        )}
        {d.correcting && (
          <label>
            Correction reason
            <input value={d.reason} onChange={(e) => update({ reason: e.target.value })} />
          </label>
        )}
      </section>
      {teaching && (
        <section className="quick-section quick-observations" aria-label="Optional observations">
          <div className="quick-observation-heading">
            <h3>Optional observations</h3>
            <button
              type="button"
              className="text-button"
              aria-pressed={customizing}
              onClick={() => setCustomizing(!customizing)}
            >
              Customize
            </button>
          </div>
          <p className="small muted">Slide to rate from 1–5. Leave at 0 to keep it unrated.</p>
          {skills.map((s, index) => (
            <div className="quick-skill" key={s.id}>
              <div className="quick-skill-heading">
                {customizing ? (
                  <input
                    aria-label={'Rename ' + s.label}
                    maxLength={48}
                    value={s.label}
                    onChange={(e) =>
                      changeSkills(
                        skills.map((item) =>
                          item.id === s.id ? { ...item, label: e.target.value } : item,
                        ),
                      )
                    }
                  />
                ) : (
                  <label htmlFor={'skill-' + s.id}>{s.label}</label>
                )}
                <output htmlFor={'skill-' + s.id}>
                  {scores[s.id] ? scores[s.id] + '/5' : 'Not rated'}
                </output>
              </div>
              <input
                id={'skill-' + s.id}
                aria-label={s.label + ' rating'}
                type="range"
                min={0}
                max={5}
                step={1}
                value={scores[s.id] || 0}
                aria-valuetext={scores[s.id] ? scores[s.id] + ' out of 5' : 'Not rated'}
                onChange={(e) => setScores({ ...scores, [s.id]: Number(e.target.value) })}
              />
              {customizing && (
                <div className="quick-skill-actions">
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={'Move ' + s.label + ' up'}
                    onClick={() => moveSkill(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === skills.length - 1}
                    aria-label={'Move ' + s.label + ' down'}
                    onClick={() => moveSkill(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={'Remove ' + s.label}
                    onClick={() => changeSkills(skills.filter((item) => item.id !== s.id))}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
          {addingSkill ? (
            <div className="quick-add-skill">
              <input
                aria-label="Custom observation skill"
                placeholder="Skill name"
                maxLength={48}
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
              />
              <button
                type="button"
                disabled={!newSkill.trim() || skills.length >= 12}
                onClick={() => {
                  changeSkills([...skills, { id: crypto.randomUUID(), label: newSkill.trim() }]);
                  setNewSkill('');
                  setAddingSkill(false);
                }}
              >
                Add
              </button>
              <button type="button" className="text-button" onClick={() => setAddingSkill(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-button"
              disabled={skills.length >= 12}
              onClick={() => setAddingSkill(true)}
            >
              + Add custom
            </button>
          )}
        </section>
      )}
      {teaching && (
        <section className="quick-section quick-note quick-observation-note">
          <h3>Optional instructional note</h3>
          <DictatedNote text={text} setText={setText} />
        </section>
      )}
      {(error || localError) && (
        <p className="error" role="alert">
          {localError || error}
        </p>
      )}
    </Modal>
  );
}
