'use client';
import { useState } from 'react';
import { Check, ChevronUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { isOpenVisit, type Snapshot, type Visit } from '@/lib/model';
import { currentSets, incomingPackets, recommend, packetLabel } from '@/lib/v3-planning';
import type { Subject } from '@/lib/v2-model';
import type { Packet, Activity } from '@/lib/v3-model';
import { Modal, Packets, DictatedNote, type V3Act } from './v3-shared';
import { elapsed, time } from './shared-ui';
type Draft = {
  activity: Activity;
  exception: boolean;
  incoming: Record<string, 'finished' | 'unfinished' | 'missing'>;
  actual: Packet[] | null;
  adjust: boolean;
  repeat: { level: string; start: number; restart: boolean } | null;
  physical: boolean;
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
  const student = db.students.find((s) => s.id === visit.studentId)!,
    cfg = db.operations!.students[student.id],
    sets = currentSets(db, visit);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      sets.map((a) => [
        a.id,
        {
          activity: visit.handoff?.activities[a.subject] || 'Worksheets',
          exception: false,
          incoming: {},
          actual: visit.handoff ? a.v3!.issued : null,
          adjust: false,
          repeat: null,
          physical: false,
          reason: '',
        },
      ]),
    ),
  );
  const [selected, setSelected] = useState<string[]>([]),
    [text, setText] = useState(''),
    [follow, setFollow] = useState(false),
    [correct, setCorrect] = useState(false),
    [reason, setReason] = useState(''),
    [away, setAway] = useState(false),
    [until, setUntil] = useState(cfg.awayUntil || ''),
    [shortcutEdit, setShortcutEdit] = useState(false),
    [shortcutText, setShortcutText] = useState((cfg.observationTiles || []).join(', '));
  const [fallback, setFallback] = useState(false),
    [fallbackSubject, setFallbackSubject] = useState<Subject>(
      cfg.subjects.Math.enrolled && cfg.subjects.Math.format === 'CONNECT' ? 'Math' : 'Reading',
    ),
    [fallbackLevel, setFallbackLevel] = useState('4A'),
    [fallbackStart, setFallbackStart] = useState(1),
    [fallbackEnd, setFallbackEnd] = useState(5);
  const tiles = [
    ...new Set([
      ...(cfg.observationTiles || []),
      ...(db.operations!.v3!.instructorTiles[db.staff.name] || [
        'Focused well',
        'Needed reminders',
        'Worked independently',
        'Needed help',
        'Worked on corrections',
      ]),
    ]),
  ].slice(0, 6);
  const teaching = db.staff.role !== 'assistant',
    waiting = isOpenVisit(visit) && !visit.handoff;
  const editHandoff = waiting || correct;
  const getDraft = (id: string): Draft =>
    drafts[id] || {
      activity: 'Worksheets',
      exception: false,
      incoming: {},
      actual: null,
      adjust: false,
      repeat: null,
      physical: false,
      reason: '',
    };
  const update = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...getDraft(id), ...patch } }));
  async function save() {
    if (!editHandoff) {
      if (
        await act({
          action: 'observation',
          visitId: visit.id,
          choices: selected,
          text,
          followUp: follow,
        })
      )
        close();
      return;
    }
    const subjects = sets.map((a) => {
      const d = getDraft(a.id);
      return {
        subject: a.subject,
        assignmentId: a.id,
        version: a.v3!.version,
        activity: d.activity,
        exception: d.exception,
        incoming: Object.entries(d.incoming).map(([id, state]) => ({ id, state })),
        actual: d.actual,
        repeat: d.repeat,
        physicalConfirmed: d.physical,
        reason: d.reason,
      };
    });
    if (
      await act({
        action: 'handoff',
        visitId: visit.id,
        expectedAt: visit.handoff?.at || null,
        subjects,
        choices: selected,
        text,
        followUp: follow,
        correctionReason: reason,
      })
    )
      close();
  }
  return (
    <Modal
      title={student.name}
      close={close}
      className="quick-view"
      footer={
        <>
          <span className="small muted">
            {waiting
              ? 'One confirmation completes the arrival interaction.'
              : visit.handoff
                ? 'Handoff already complete.'
                : 'Departed without instructor handoff.'}
          </span>
          {teaching && (
            <button
              className="primary"
              disabled={busy || (!editHandoff && !selected.length && !text.trim())}
              onClick={() => void save()}
            >
              <Check size={18} />
              {busy
                ? 'Saving…'
                : waiting
                  ? 'Complete instructor check-in'
                  : correct
                    ? 'Save handoff correction'
                    : 'Save observation'}
            </button>
          )}
        </>
      }
    >
      <div className="quick-context">
        <b>
          {isOpenVisit(visit)
            ? elapsed(visit.arrivedAt) + ' here'
            : visit.closedAt && !visit.departureVerified
              ? 'Departure unverified'
              : 'Departed ' + (visit.departedAt ? time(visit.departedAt, db.timezone) : '')}
        </b>
        <span>{visit.handoff ? '✓ Handoff complete' : 'Awaiting instructor handoff'}</span>
        <div className="mode-tags">
          {(['Math', 'Reading'] as Subject[])
            .filter((sub) => cfg.subjects[sub].enrolled)
            .map((sub) => (
              <span key={sub}>
                {sub} · {cfg.subjects[sub].format === 'Paper' ? 'PAPER' : 'CONNECT'}
              </span>
            ))}
        </div>
        {cfg.goals && <p className="focus-note">Focus: {cfg.goals}</p>}
      </div>
      {sets.length > 0 && (
        <section className="quick-section">
          <h3>A · Incoming homework</h3>
          {sets.map((a) => {
            const d = getDraft(a.id),
              prior = incomingPackets(db, student.id, a.subject).filter(
                (p) => p.sourceAssignmentId !== a.id,
              );
            return (
              <div key={a.id} className="incoming-subject">
                <span>
                  {a.subject} · {prior.length} previously issued paper packets awaiting
                  reconciliation
                </span>
                {editHandoff && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={d.exception}
                      onChange={(e) => update(a.id, { exception: e.target.checked })}
                    />
                    Homework unfinished or not returned
                  </label>
                )}
                {d.exception &&
                  prior.map((p) => (
                    <label className="incoming-packet" key={p.id}>
                      <b>{packetLabel(p)}</b>
                      <select
                        aria-label={'Incoming ' + packetLabel(p)}
                        value={d.incoming[p.id] || ''}
                        onChange={(e) => {
                          const incoming = { ...d.incoming };
                          if (!e.target.value) delete incoming[p.id];
                          else
                            incoming[p.id] = e.target.value as
                              'finished' | 'unfinished' | 'missing';
                          update(a.id, { incoming });
                        }}
                      >
                        <option value="">Unknown / not assessed</option>
                        <option value="finished">Finished (reported)</option>
                        <option value="unfinished">
                          Returned unfinished · physically available
                        </option>
                        <option value="missing">Not returned · unavailable</option>
                      </select>
                    </label>
                  ))}
                {d.exception && !prior.length && (
                  <p className="small muted">
                    No V3 issued packets available. Historical V2 records remain in Visit History.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}
      <section className="quick-section">
        <h3>B · Today’s activity</h3>
        {sets.length ? (
          sets.map((a) => {
            const d = getDraft(a.id);
            return (
              <fieldset key={a.id}>
                <legend>{a.subject}</legend>
                <div className="segmented activity-choices">
                  {(['Worksheets', 'Corrections only', 'Both'] as Activity[]).map((activity) => (
                    <button
                      type="button"
                      key={activity}
                      disabled={!editHandoff}
                      className={d.activity === activity ? 'selected' : ''}
                      aria-pressed={d.activity === activity}
                      onClick={() => update(a.id, { activity, actual: null })}
                    >
                      {activity}
                    </button>
                  ))}
                </div>
              </fieldset>
            );
          })
        ) : (
          <p>
            {(['Math', 'Reading'] as Subject[]).some(
              (s) => cfg.subjects[s].enrolled && cfg.subjects[s].format === 'Paper',
            )
              ? 'No paper assignment recorded for this historical visit.'
              : 'CONNECT manages worksheet assignments. Confirm the instructor interaction below.'}
          </p>
        )}
      </section>
      {sets.length > 0 && (
        <section className="quick-section">
          <h3>C · Outgoing homework</h3>
          {sets.map((a) => {
            const d = getDraft(a.id),
              prior = incomingPackets(db, student.id, a.subject).map((p) => ({
                ...p,
                status: d.incoming[p.id] || p.status,
              })),
              r = recommend(
                a,
                d.activity,
                d.exception ? prior.filter((p) => p.status === 'unfinished') : [],
              ),
              actual = d.actual || r.out,
              v = a.v3!;
            return (
              <div className="quick-subject" key={a.id}>
                <div className="subject-heading">
                  <b>{a.subject}</b>
                  <span className="small muted">
                    {v.preparedAt ? 'Physically prepared' : 'Physical preparation required'} ·{' '}
                    {actual.length} outgoing packets
                  </span>
                </div>
                {v.inCenter && (
                  <div className="packet-row">
                    <small>IN CENTER</small>
                    <Packets items={[v.inCenter]} center />
                  </div>
                )}
                <div className="packet-row">
                  <small>TAKE HOME</small>
                  <Packets
                    items={
                      d.repeat
                        ? actual.map((p, i) => ({
                            ...p,
                            range: {
                              level: d.repeat!.level,
                              start: d.repeat!.start + i * cfg.subjects[a.subject].sheetsPerPacket,
                              end:
                                d.repeat!.start +
                                (i + 1) * cfg.subjects[a.subject].sheetsPerPacket -
                                1,
                            },
                          }))
                        : actual
                    }
                  />
                </div>
                {r.messages.map((m) => (
                  <p className="physical-instruction" key={m}>
                    {m}
                  </p>
                ))}
                {[...r.review, ...v.adjustment].map((m) => (
                  <p className="warning-line" key={m}>
                    {m}
                  </p>
                ))}
                {editHandoff && (
                  <>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => update(a.id, { adjust: !d.adjust })}
                    >
                      Adjust / Repeat
                    </button>
                    {d.adjust && (
                      <div className="packet-editor">
                        <p className="small muted">
                          One-time outgoing changes. Permanent packet settings stay unchanged.
                        </p>
                        {actual.map((p, index) => (
                          <div className="packet-editor-row" key={index}>
                            <input
                              aria-label={a.subject + ' packet ' + (index + 1) + ' level'}
                              value={p.range.level}
                              onChange={(e) =>
                                update(a.id, {
                                  actual: actual.map((q, i) =>
                                    i === index
                                      ? {
                                          ...q,
                                          id: crypto.randomUUID(),
                                          range: { ...q.range, level: e.target.value },
                                          prepared: false,
                                        }
                                      : q,
                                  ),
                                })
                              }
                            />
                            <input
                              type="number"
                              aria-label={a.subject + ' packet ' + (index + 1) + ' start'}
                              min={1}
                              value={p.range.start}
                              onChange={(e) =>
                                update(a.id, {
                                  actual: actual.map((q, i) =>
                                    i === index
                                      ? {
                                          ...q,
                                          id: crypto.randomUUID(),
                                          range: { ...q.range, start: Number(e.target.value) },
                                          prepared: false,
                                        }
                                      : q,
                                  ),
                                })
                              }
                            />
                            <input
                              type="number"
                              aria-label={a.subject + ' packet ' + (index + 1) + ' end'}
                              min={1}
                              value={p.range.end}
                              onChange={(e) =>
                                update(a.id, {
                                  actual: actual.map((q, i) =>
                                    i === index
                                      ? {
                                          ...q,
                                          id: crypto.randomUUID(),
                                          range: { ...q.range, end: Number(e.target.value) },
                                          prepared: false,
                                        }
                                      : q,
                                  ),
                                })
                              }
                            />
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={'Move packet ' + (index + 1) + ' up'}
                              disabled={index === 0}
                              onClick={() => {
                                const items = [...actual];
                                [items[index - 1], items[index]] = [items[index], items[index - 1]];
                                update(a.id, { actual: items });
                              }}
                            >
                              <ChevronUp size={17} />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={'Move packet ' + (index + 1) + ' down'}
                              disabled={index === actual.length - 1}
                              onClick={() => {
                                const items = [...actual];
                                [items[index + 1], items[index]] = [items[index], items[index + 1]];
                                update(a.id, { actual: items });
                              }}
                            >
                              <ChevronDown size={17} />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={'Remove packet ' + (index + 1)}
                              onClick={() =>
                                update(a.id, { actual: actual.filter((_, i) => i !== index) })
                              }
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        ))}
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => {
                            const last = actual.at(-1)?.range ||
                              v.inCenter?.range || {
                                level: cfg.subjects[a.subject].level,
                                start: cfg.subjects[a.subject].nextStart - 1,
                                end: cfg.subjects[a.subject].nextStart - 1,
                              };
                            update(a.id, {
                              actual: [
                                ...actual,
                                {
                                  id: crypto.randomUUID(),
                                  range: {
                                    level: last.level,
                                    start: last.end + 1,
                                    end: last.end + cfg.subjects[a.subject].sheetsPerPacket,
                                  },
                                  sourceAssignmentId: a.id,
                                  purpose: 'homework',
                                  prepared: false,
                                  status: 'planned',
                                },
                              ],
                            });
                          }}
                        >
                          <Plus size={16} />
                          Add packet
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => update(a.id, { actual: [...v.planned], repeat: null })}
                        >
                          Use original outgoing plan / override shift
                        </button>
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={Boolean(d.repeat)}
                            onChange={(e) =>
                              update(a.id, {
                                repeat: e.target.checked
                                  ? {
                                      level: cfg.subjects[a.subject].level,
                                      start: cfg.subjects[a.subject].currentStart,
                                      restart: false,
                                    }
                                  : null,
                              })
                            }
                          />
                          Repeat from worksheet
                        </label>
                        {d.repeat && (
                          <div className="form-grid">
                            <label>
                              Repeat level
                              <input
                                value={d.repeat.level}
                                onChange={(e) =>
                                  update(a.id, { repeat: { ...d.repeat!, level: e.target.value } })
                                }
                              />
                            </label>
                            <label>
                              Repeat starting worksheet
                              <input
                                type="number"
                                min={1}
                                value={d.repeat.start}
                                onChange={(e) =>
                                  update(a.id, {
                                    repeat: { ...d.repeat!, start: Number(e.target.value) },
                                  })
                                }
                              />
                            </label>
                            <label className="check-label">
                              <input
                                type="checkbox"
                                checked={d.repeat.restart}
                                onChange={(e) =>
                                  update(a.id, {
                                    repeat: { ...d.repeat!, restart: e.target.checked },
                                  })
                                }
                              />
                              Restart ongoing progression (permanent decision)
                            </label>
                          </div>
                        )}
                        <label>
                          Adjustment reason
                          <input
                            value={d.reason}
                            onChange={(e) => update(a.id, { reason: e.target.value })}
                            maxLength={400}
                          />
                        </label>
                      </div>
                    )}
                    {(!v.preparedAt || d.actual || d.repeat || a.stale) && (
                      <label className="check-label physical-confirm">
                        <input
                          type="checkbox"
                          checked={d.physical}
                          onChange={(e) => update(a.id, { physical: e.target.checked })}
                        />
                        Physical materials adjusted and ready to hand over
                      </label>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}
      {teaching && (
        <section className="quick-section">
          <h3>D · Optional observations</h3>
          <div className="observation-tiles">
            {tiles.map((tile) => (
              <button
                className={selected.includes(tile) ? 'selected' : ''}
                type="button"
                aria-pressed={selected.includes(tile)}
                key={tile}
                onClick={() =>
                  setSelected((s) =>
                    s.includes(tile) ? s.filter((t) => t !== tile) : [...s, tile],
                  )
                }
              >
                {tile}
              </button>
            ))}
          </div>
          <p className="small muted">Unselected means Not assessed.</p>
          <DictatedNote text={text} setText={setText} />
          <label className="check-label">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Follow-up needed
          </label>
          <button
            className="text-button"
            type="button"
            onClick={() => setShortcutEdit(!shortcutEdit)}
          >
            Student shortcuts & goals
          </button>
          {shortcutEdit && (
            <div>
              <label>
                Student observation shortcuts (up to six, comma-separated)
                <input value={shortcutText} onChange={(e) => setShortcutText(e.target.value)} />
              </label>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() =>
                  void act({
                    action: 'student-save',
                    studentId: student.id,
                    name: student.name,
                    earlyLearner: student.earlyLearner,
                    settings: cfg,
                    enrollmentDate: cfg.enrollmentDate || null,
                    visitDays: cfg.visitDays || cfg.recurringDays,
                    tiles: shortcutText
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, 6),
                    goals: cfg.goals || '',
                    arrivalWindow: cfg.arrivalWindow || '',
                  })
                }
              >
                Save student shortcuts
              </button>
            </div>
          )}
        </section>
      )}
      <div className="quick-secondary">
        {teaching && visit.handoff && (
          <button type="button" className="text-button" onClick={() => setCorrect(!correct)}>
            Correct recorded handoff
          </button>
        )}
        {correct && (
          <label>
            Reason for correcting handoff
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        {teaching && (
          <>
            <button className="text-button" type="button" onClick={() => setAway(!away)}>
              Away Until / resume attendance
            </button>
            {away && (
              <div className="away-controls">
                <label>
                  First expected return date
                  <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !until}
                  onClick={() => void act({ action: 'away', studentId: student.id, until })}
                >
                  Save Away Until
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => void act({ action: 'away', studentId: student.id, until: null })}
                >
                  Resume normal attendance
                </button>
              </div>
            )}
            {waiting &&
              (['Math', 'Reading'] as Subject[]).some(
                (s) => cfg.subjects[s].enrolled && cfg.subjects[s].format === 'CONNECT',
              ) && (
                <>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setFallback(!fallback)}
                  >
                    Temporary physical CONNECT fallback
                  </button>
                  {fallback && (
                    <div className="form-grid">
                      <label>
                        Fallback subject
                        <select
                          value={fallbackSubject}
                          onChange={(e) => setFallbackSubject(e.target.value as Subject)}
                        >
                          {(['Math', 'Reading'] as Subject[])
                            .filter(
                              (s) =>
                                cfg.subjects[s].enrolled && cfg.subjects[s].format === 'CONNECT',
                            )
                            .map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Fallback level
                        <input
                          value={fallbackLevel}
                          onChange={(e) => setFallbackLevel(e.target.value)}
                        />
                      </label>
                      <label>
                        From worksheet
                        <input
                          type="number"
                          value={fallbackStart}
                          onChange={(e) => setFallbackStart(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Through worksheet
                        <input
                          type="number"
                          value={fallbackEnd}
                          onChange={(e) => setFallbackEnd(Number(e.target.value))}
                        />
                      </label>
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            action: 'temporary-paper',
                            visitId: visit.id,
                            subject: fallbackSubject,
                            range: { level: fallbackLevel, start: fallbackStart, end: fallbackEnd },
                          })
                        }
                      >
                        Add temporary physical packet
                      </button>
                    </div>
                  )}
                </>
              )}
          </>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
