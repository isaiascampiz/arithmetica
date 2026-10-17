'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Mic, X, Award } from 'lucide-react';
import type { Database, Student } from '@/lib/model';
import type { Packet } from '@/lib/v3-model';
import { packetLabel } from '@/lib/v3-planning';
import type { V3Command } from '@/lib/v3-domain';
export type V3Act = (c: V3Command) => Promise<boolean>;
export function Modal({
  title,
  titleLabel,
  children,
  footer,
  close,
  className = '',
}: {
  title: ReactNode;
  titleLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      d?.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      className={'v3-modal ' + className}
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="modal-title" aria-label={titleLabel}>
          {title}
        </h2>
        <button type="button" className="icon-button" aria-label="Close panel" onClick={close}>
          <X size={21} />
        </button>
      </header>
      <div className="v3-modal-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>
  );
}
export function Packets({ items, center = false }: { items: Packet[]; center?: boolean }) {
  return (
    <div className="packet-chips">
      {items.map((p) => (
        <span
          className={'packet-chip ' + (center ? 'center-packet' : '')}
          key={p.id}
          title={'Packet ' + p.id}
        >
          {packetLabel(p)}
          {p.prepared ? ' ✓' : ''}
        </span>
      ))}
      {!items.length && <span className="muted">None</span>}
    </div>
  );
}
export function Medals({ db, student }: { db: Database; student: Student }) {
  return (
    <span className="medals">
      {db
        .operations!.achievements.filter((a) => a.studentId === student.id)
        .map((a) => (
          <span
            className={'medal ' + a.distinction.toLowerCase()}
            key={a.id}
            aria-label={a.subject + ' ' + a.distinction + ' medal'}
            title={a.subject + ' · ' + a.distinction + ' · ' + a.date}
          >
            <Award size={19} />
            <small>{a.subject[0]}</small>
          </span>
        ))}
    </span>
  );
}
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
export function DictatedNote({
  text,
  setText,
  label = 'Optional instructor note',
  buttonLabel = 'Dictate note',
  maxLength = 1200,
  dictationOnly = false,
  showPrivacyHint = true,
  hideLabel = false,
}: {
  text: string;
  setText: (s: string) => void;
  label?: string;
  buttonLabel?: string;
  maxLength?: number;
  dictationOnly?: boolean;
  showPrivacyHint?: boolean;
  hideLabel?: boolean;
}) {
  const fieldId = useId();
  const [listening, setListening] = useState(false),
    [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => () => recognition.current?.stop(), []);
  function dictate() {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) {
      setError(
        dictationOnly
          ? 'Dictation unavailable in this browser.'
          : 'Dictation unavailable; type or use the keyboard microphone.',
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
    r.onresult = (e) =>
      setText(
        (
          text +
          ' ' +
          Array.from(e.results)
            .filter((x) => x.isFinal)
            .map((x) => x[0].transcript)
            .join(' ')
        )
          .trim()
          .slice(0, maxLength),
      );
    r.onerror = () => {
      setError(
        dictationOnly
          ? 'Dictation failed. Please try again.'
          : 'Dictation failed. Typed input remains available.',
      );
      setListening(false);
    };
    r.onend = () => setListening(false);
    try {
      r.start();
      setListening(true);
      setError('');
    } catch {
      setError('Unable to start dictation.');
    }
  }
  return (
    <div className="dictated-note">
      {!hideLabel && <label htmlFor={fieldId}>{label}</label>}
      <textarea
        id={fieldId}
        aria-label={hideLabel ? label : undefined}
        maxLength={maxLength}
        rows={2}
        value={text}
        readOnly={dictationOnly}
        onChange={(e) => setText(e.target.value)}
        placeholder="A brief note for this visit…"
      />
      <button className="text-button" type="button" onClick={dictate}>
        <Mic size={17} />
        {listening ? 'Stop dictation' : buttonLabel}
      </button>
      {showPrivacyHint && (
        <small className="muted">
          Fictional speech only; browser/provider privacy requires approval.
        </small>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
