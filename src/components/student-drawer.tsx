'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { ArrowRight, Check, Clock3, Flag, Mic, Plus, QrCode, X } from 'lucide-react';
import { choices, isOpenVisit, type Student, type Snapshot } from '@/lib/model';
import type { Command } from '@/lib/domain';
import { Avatar, Empty, time, date, elapsed } from './shared-ui';
type DrawerProps = {
  student: Student;
  db: Snapshot;
  busy: boolean;
  error: string;
  mutate: (command: Command) => Promise<boolean>;
  close: () => void;
};
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
export function StudentDrawer({ student: s, db, busy, error, mutate, close }: DrawerProps) {
  const [tab, setTab] = useState('Observation');
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [subject, setSubject] = useState<'Math' | 'Reading' | ''>(
    s.subjects.length === 1 ? (s.subjects[0] as 'Math' | 'Reading') : '',
  );
  const [description, setDescription] = useState('');
  const [qr, setQr] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const active = db.visits.find((v) => v.studentId === s.id && isOpenVisit(v));
  const notes = db.observations
    .filter((o) => o.studentId === s.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const canObserve = db.staff.role !== 'assistant';
  useEffect(() => {
    void QRCode.toDataURL(s.token, {
      width: 220,
      margin: 2,
      color: { dark: '#202b48', light: '#ffffff' },
    }).then(setQr);
  }, [s.token]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = prior;
      before?.focus();
      recognition.current?.stop();
    };
  }, []);
  async function dictate() {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) {
      setVoiceError(
        'Dictation isn’t available here. Use the iPad keyboard microphone or type your note.',
      );
      return;
    }
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = new R();
    recognition.current = r;
    r.lang = 'en-US';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const result = Array.from(e.results)
        .filter((x) => x.isFinal)
        .map((x) => x[0].transcript)
        .join(' ');
      setText((t) => (t + ' ' + result).trim().slice(0, 1200));
    };
    r.onerror = () => {
      setVoiceError('Microphone access or dictation failed. You can still type your note.');
      setListening(false);
    };
    r.onend = () => setListening(false);
    try {
      r.start();
      setListening(true);
      setVoiceError('');
    } catch {
      setVoiceError('Unable to start dictation. Type or use your keyboard microphone.');
    }
  }
  return (
    <div className="drawer-layer">
      <button className="drawer-scrim" aria-label="Close student details" onClick={close} />
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          if (e.key === 'Tab') {
            const items = dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input,textarea,select,a[href]',
            );
            if (items?.length) {
              const first = items[0],
                last = items[items.length - 1];
              if (
                e.shiftKey &&
                (document.activeElement === first || document.activeElement === dialog.current)
              ) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }
        }}
      >
        <header className="drawer-header">
          <span className="eyebrow">STUDENT DETAILS</span>
          <button className="icon-button" aria-label="Close student details" onClick={close}>
            <X size={21} />
          </button>
        </header>
        <div className="student-hero">
          <Avatar student={s} />
          <h2 id="student-title">{s.name}</h2>
          <p>
            {s.subjects.join(' & ')} · Level {s.level}
          </p>
          <div>
            {s.earlyLearner && <span className="tag lilac">Early learner</span>}
            <span className={`tag ${active ? 'green' : ''}`}>{active ? 'In center' : 'Away'}</span>
          </div>
        </div>
        <div className="drawer-attendance">
          <span>
            <Clock3 size={17} />
            {active
              ? `Arrived ${time(active.arrivedAt, db.timezone)} · ${elapsed(active.arrivedAt)}`
              : 'No open visit'}
          </span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void mutate({ kind: 'attendance', studentId: s.id, direction: active ? 'out' : 'in' })
            }
          >
            {active ? 'Check out' : 'Check in'}
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="drawer-tabs">
          {(canObserve
            ? ['Observation', 'History', 'Homework', 'QR code']
            : ['Homework', 'QR code']
          ).map((t) => (
            <button
              className={
                tab === t || (!canObserve && tab === 'Observation' && t === 'Homework')
                  ? 'active'
                  : ''
              }
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="drawer-content">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {canObserve && tab === 'Observation' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate({
                    kind: 'observation',
                    studentId: s.id,
                    choices: selected as (typeof choices)[number][],
                    text,
                    followUp,
                    subject: subject || null,
                  })
                ) {
                  setText('');
                  setSelected([]);
                  setFollowUp(false);
                }
              }}
            >
              <div className="section-intro">
                <h3>What did you notice?</h3>
                <p>A few taps now. A clearer picture later.</p>
              </div>
              <label>
                Observation subject
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value as typeof subject)}
                >
                  <option value="">General / both subjects</option>
                  <option>Math</option>
                  <option>Reading</option>
                </select>
              </label>
              <div className="choice-grid">
                {choices.map((c) => (
                  <button
                    className={`choice ${selected.includes(c) ? 'selected' : ''}`}
                    type="button"
                    aria-pressed={selected.includes(c)}
                    key={c}
                    onClick={() =>
                      setSelected((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]))
                    }
                  >
                    {selected.includes(c) ? <Check size={16} /> : <Plus size={16} />} {c}
                  </button>
                ))}
              </div>
              <label className="note-label">
                A little more context <span>Optional</span>
                <textarea
                  placeholder="A quick note for the next visit…"
                  maxLength={1200}
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="dictation-row">
                <button
                  type="button"
                  className={`text-button ${listening ? 'listening' : ''}`}
                  onClick={() => void dictate()}
                >
                  <Mic size={16} />
                  {listening ? 'Stop dictation' : 'Dictate a note'}
                </button>
                <span>{text.length}/1200</span>
              </div>
              <p className="small muted">
                Browser dictation may use a provider service. Use fictional speech until privacy
                approval is verified.
              </p>
              {voiceError && (
                <p className="small muted" role="status">
                  {voiceError}
                </p>
              )}
              <label className="followup-toggle">
                <span>
                  <Flag size={18} />
                  <b>Needs a follow-up</b>
                  <small>Keep this on the instructor’s radar.</small>
                </span>
                <input
                  type="checkbox"
                  checked={followUp}
                  onChange={(e) => setFollowUp(e.target.checked)}
                />
              </label>
              <button
                className="primary wide"
                disabled={busy || (!selected.length && !text.trim())}
              >
                <Check size={17} />
                {busy ? 'Saving…' : 'Save observation'}
              </button>
              <p className="save-caption">
                Saved notes join the review queue, even after checkout.
              </p>
            </form>
          )}
          {tab === 'History' && (
            <>
              <div className="section-intro">
                <h3>Observation history</h3>
                <p>All notes, including those already reviewed.</p>
              </div>
              {notes.map((o) => (
                <article className="history-note" key={o.id}>
                  <div>
                    <span>
                      {date(o.createdAt, db.timezone)} · {time(o.createdAt, db.timezone)}
                    </span>
                    <span className={`tag ${o.reviewedAt ? 'green' : 'amber'}`}>
                      {o.reviewedAt ? 'Reviewed' : 'Pending'}
                    </span>
                  </div>
                  {o.followUp && (
                    <span className="small amber-text">
                      <Flag size={12} /> Follow-up
                    </span>
                  )}
                  <div className="note-choices">
                    {o.choices.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                  <p>{o.text}</p>
                  <small className="muted">
                    {o.author}
                    {o.reviewedAt ? ` · Reviewed by ${o.reviewedBy}` : ''}
                  </small>
                  {!o.reviewedAt && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void mutate({ kind: 'review', id: o.id })}
                    >
                      <Check size={15} />
                      Mark reviewed
                    </button>
                  )}
                </article>
              ))}
              {!notes.length && (
                <Empty title="A fresh page" text="Student observations will appear here." />
              )}
            </>
          )}
          {(tab === 'Homework' || (!canObserve && tab === 'Observation')) && (
            <>
              <div className="section-intro">
                <h3>Homework packets</h3>
                <p>A simple handoff tracker. Physical worksheets stay in the pouch.</p>
              </div>
              <form
                className="homework-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await mutate({ kind: 'homework', studentId: s.id, description }))
                    setDescription('');
                }}
              >
                <label>
                  New assignment
                  <input
                    required
                    maxLength={240}
                    placeholder="e.g. Math · 4A 101–110"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <button className="primary wide" disabled={busy || !description.trim()}>
                  <Plus size={17} />
                  Assign packet
                </button>
              </form>
              {db.homework
                .filter((h) => h.studentId === s.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((h) => (
                  <article className="history-note" key={h.id}>
                    <div>
                      <b>{h.description}</b>
                      <span className="tag">{h.status.replace('-', ' ')}</span>
                    </div>
                    <p className="small muted">Assigned {date(h.createdAt, db.timezone)}</p>
                    {h.status !== 'handed-off' && (
                      <button
                        className="secondary wide"
                        disabled={busy}
                        onClick={() =>
                          void mutate({
                            kind: 'homework-status',
                            id: h.id,
                            status: h.status === 'assigned' ? 'prepared' : 'handed-off',
                          })
                        }
                      >
                        <Check size={15} />
                        {h.status === 'assigned' ? 'Mark prepared' : 'Confirm handoff'}
                      </button>
                    )}
                  </article>
                ))}
            </>
          )}
          {tab === 'QR code' && (
            <div className="qr-detail">
              <span className="settings-icon">
                <QrCode size={25} />
              </span>
              <h3>A simple arrival.</h3>
              <p>Use this fictional student code at the reception kiosk.</p>
              {qr && (
                <Image
                  unoptimized
                  src={qr}
                  alt={`Check-in QR code for ${s.name}`}
                  width={220}
                  height={220}
                />
              )}
              <code>{s.token}</code>
              <p className="small muted">
                Manual entry uses the same code. Treat codes as private bearer credentials. A real
                center needs controlled printing, replacement, and revocation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
