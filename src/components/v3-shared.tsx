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
  dismissOnBackdrop = false,
  footerInBody = false,
  variant = 'default',
}: {
  title: ReactNode;
  titleLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  close: () => void;
  className?: string;
  dismissOnBackdrop?: boolean;
  footerInBody?: boolean;
  variant?: 'default' | 'form';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      d.animate(
        [
          { opacity: 0, transform: reduce ? 'none' : 'translateY(8px) scale(0.985)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      );
    }
    return () => {
      d?.getAnimations().forEach((animation) => animation.cancel());
      d?.close();
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  function dismiss() {
    if (closing.current) return;
    const d = ref.current;
    if (!d) return close();
    closing.current = true;
    d.getAnimations().forEach((animation) => animation.cancel());
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = d.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: reduce ? 'none' : 'translateY(4px) scale(0.99)' },
      ],
      { duration: 120, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' },
    );
    void animation.finished
      .then(() => {
        if (d.isConnected) close();
      })
      .catch(() => {});
  }
  return (
    <dialog
      className={'v3-modal ' + (variant === 'form' ? 'edit-dialog ' : '') + className}
      ref={ref}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (!dismissOnBackdrop || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          dismiss();
      }}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <header>
        <h2 id={titleId} aria-label={titleLabel}>
          {title}
        </h2>
        <button type="button" className="icon-button" aria-label="Close panel" onClick={dismiss}>
          <X size={21} />
        </button>
      </header>
      <div className="v3-modal-body">
        {children}
        {footerInBody && footer && <div className="modal-inline-footer">{footer}</div>}
      </div>
      {!footerInBody && footer && <footer>{footer}</footer>}
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
  allowDictation = true,
}: {
  text: string;
  setText: (s: string) => void;
  label?: string;
  buttonLabel?: string;
  maxLength?: number;
  dictationOnly?: boolean;
  showPrivacyHint?: boolean;
  hideLabel?: boolean;
  allowDictation?: boolean;
}) {
  const fieldId = useId();
  const [listening, setListening] = useState(false),
    [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const latestText = useRef(text);
  useEffect(() => {
    latestText.current = text;
  }, [text]);
  useEffect(
    () => () => {
      const current = recognition.current;
      if (!current) return;
      current.onresult = current.onerror = current.onend = null;
      current.stop();
    },
    [],
  );
  function dictate() {
    if (!allowDictation) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) {
      setError(
        dictationOnly
          ? 'Dictation unavailable in this browser.'
          : 'Dictation unavailable; type your note.',
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
          latestText.current +
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
      <button className="text-button" type="button" disabled={!allowDictation} onClick={dictate}>
        <Mic size={17} />
        {listening ? 'Stop dictation' : buttonLabel}
      </button>
      {showPrivacyHint && (
        <small className="muted">
          {allowDictation
            ? 'Use the center-approved dictation provider. Arithmetica saves text only.'
            : 'Dictation requires documented provider privacy approval. Typed notes remain available.'}
        </small>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
