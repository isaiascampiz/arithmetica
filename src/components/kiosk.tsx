'use client';
import { isPouchCode, isPouchCodePrefix } from '@/lib/pouch-code';
/* eslint-disable @next/next/no-location-assign-relative-destination -- Locking a shared reception device clears staff state. */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, Check, LogOut, ShieldCheck, X } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { clientId, request } from '@/lib/client';
import './kiosk.css';
import { BrandMark } from './brand';
import { ReceptionBackdrop } from './reception-backdrop';
import { APP_NAME, CENTER_NAME } from '@/lib/brand';
import { ThemeControl } from './theme';
export function Kiosk({ staffPreview = false }: { staffPreview?: boolean }) {
  const [ready, setReady] = useState<boolean | null>(null),
    [token, setToken] = useState(''),
    [pouchCode, setPouchCode] = useState(''),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [direction, setDirection] = useState(''),
    [confirmedName, setConfirmedName] = useState(''),
    [completion, setCompletion] = useState<{ prefix: string; name: string } | null>(null),
    [manual, setManual] = useState(false);
  const endpoint = staffPreview ? '/api/reception' : '/api/kiosk';
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const [confirmationSeconds, setConfirmationSeconds] = useState(4);
  const video = useRef<HTMLVideoElement>(null),
    codeInput = useRef<HTMLInputElement>(null),
    lock = useRef(false),
    resume = useRef(false);
  const lastCode = useRef<string | null>(null),
    blankSince = useRef<number | null>(null);
  useEffect(() => {
    if (!message && !busy && !camera) codeInput.current?.focus();
  }, [message, busy, camera]);
  useEffect(() => {
    void request<{ demo: boolean; confirmationSeconds: number }>(endpoint)
      .then((data) => {
        setReady(true);
        setConfirmationSeconds(data.confirmationSeconds);
      })
      .catch(() => setReady(false));
  }, [endpoint]);
  const suggestedName = completion?.prefix === token ? completion.name : null;
  const ghostName =
    suggestedName &&
    suggestedName.toLowerCase().startsWith(token.toLowerCase()) &&
    suggestedName.length > token.length
      ? suggestedName
      : null;
  useEffect(() => {
    setCompletion(null);
    if (!ready || busy || message || camera || token.trim().length < 3 || isPouchCodePrefix(token))
      return;
    let disposed = false;
    const timer = setTimeout(() => {
      void request<{ completion: string | null }>(endpoint + '/name', 'POST', { prefix: token })
        .then((result) => {
          if (!disposed && result.completion)
            setCompletion({ prefix: token, name: result.completion });
        })
        .catch(() => {});
    }, 180);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [token, endpoint, ready, busy, message, camera]);
  function reset() {
    setMessage('');
    setConfirmedName('');
    setError('');
    if (resume.current) setCamera(true);
  }
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => {
      setMessage('');
      setConfirmedName('');
      setError('');
      if (resume.current) setCamera(true);
    }, confirmationSeconds * 1000);
    return () => clearTimeout(t);
  }, [message, confirmationSeconds]);
  async function submit(value: string, byName = true) {
    if (lock.current || !value.trim()) return;
    lock.current = true;
    setBusy(true);
    setError('');
    resume.current = camera;
    setCamera(false);
    try {
      let name = value.trim();
      if (byName && name.length >= 3) {
        const hint =
          suggestedName ||
          (
            await request<{ completion: string | null }>(endpoint + '/name', 'POST', {
              prefix: name,
            }).catch(() => null)
          )?.completion;
        if (hint) name = hint;
      }
      const entry = byName ? { name } : { token: value.trim() },
        key = JSON.stringify(entry);
      attempt.current = attempt.current?.key === key ? attempt.current : { key, id: clientId() };
      const result = await request<{ message: string; direction?: string; studentName?: string }>(
        endpoint,
        'POST',
        {
          ...entry,
          requestId: attempt.current.id,
        },
      );
      attempt.current = null;
      setMessage(result.message);
      setConfirmedName(result.studentName || '');
      setDirection(result.direction || 'recorded');
      setToken('');
      setPouchCode('');
    } catch (e) {
      setError((e as Error).message);
      resume.current = false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    if (!ready || message || camera || busy) return;
    let buffer = '',
      previous = 0;
    const scan = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const now = performance.now();
      if (now - previous > 200) buffer = '';
      previous = now;
      if (e.key === 'Enter') {
        if (isPouchCode(buffer)) {
          e.preventDefault();
          e.stopPropagation();
          setToken('');
          void submitRef.current(buffer, false);
        }
        buffer = '';
      } else if (e.key.length === 1) buffer = (buffer + e.key).slice(-100);
      else if (e.key !== 'Shift') buffer = '';
    };
    document.addEventListener('keydown', scan, true);
    return () => document.removeEventListener('keydown', scan, true);
  }, [ready, message, camera, busy]);
  useEffect(() => {
    if (!camera) return;
    const element = video.current;
    element?.scrollIntoView({ block: 'center', behavior: 'instant' });
    let cancelled = false;
    let controls: IScannerControls | undefined;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('Camera needs HTTPS or localhost. Enter the code instead.');
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled || !element) return;
        controls = await new BrowserQRCodeReader().decodeFromVideoDevice(
          undefined,
          element,
          (result, decodeError, controller) => {
            if (!result && decodeError) {
              blankSince.current ??= Date.now();
              if (Date.now() - blankSince.current > 1000) lastCode.current = null;
            }
            if (result && !cancelled) {
              blankSince.current = null;
              if (lastCode.current === result.getText()) return;
              lastCode.current = result.getText();
              cancelled = true;
              controller.stop();
              void submitRef.current(result.getText(), false);
            }
          },
        );
        if (cancelled) controls.stop();
      } catch (e) {
        if (!cancelled) {
          setError(
            (e as Error).message.includes('HTTPS')
              ? (e as Error).message
              : 'Camera could not start. Allow camera access or enter your pouch code.',
          );
          setCamera(false);
          setManual(true);
          resume.current = false;
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      controls?.stop();
      (element?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    };
  }, [camera]);
  return (
    <main
      className="kiosk-page v2-kiosk reception-kiosk immersive-reception"
      data-reception-state={message ? direction : 'idle'}
    >
      <ReceptionBackdrop
        state={
          message ? (direction === 'in' ? 'in' : direction === 'out' ? 'out' : 'recorded') : 'idle'
        }
      />
      <header className="kiosk-header">
        <Link className="brand" href="/" aria-label={APP_NAME + ' home'}>
          <span className="brand-icon">
            <BrandMark />
          </span>
          {APP_NAME}
        </Link>
        <ThemeControl compact />
      </header>
      {ready === null ? (
        <div className="kiosk-center">
          <h1>Opening reception…</h1>
        </div>
      ) : !ready ? (
        <div className="kiosk-center">
          <span className="kiosk-large-icon">
            <ShieldCheck size={38} />
          </span>
          <h1>Let’s set up reception.</h1>
          <p>A staff member must sign in and choose Open kiosk.</p>
          <a href="/login" className="primary">
            Staff sign-in
            <ArrowRight size={18} />
          </a>
        </div>
      ) : (
        <div className="kiosk-center">
          {message ? (
            <div className="kiosk-success" role="status">
              <span className="receipt-mark" aria-hidden="true">
                {direction === 'out' ? <LogOut size={34} /> : <Check size={34} />}
              </span>
              <h1>
                {direction === 'in'
                  ? "You're checked in."
                  : direction === 'out'
                    ? "You're checked out."
                    : 'Scan recorded.'}
              </h1>
              <p className="receipt-direction">
                {direction === 'in'
                  ? 'Arrival recorded'
                  : direction === 'out'
                    ? 'Departure recorded'
                    : 'Attendance'}
              </p>
              <p className="confirmation-student">{confirmedName || message}</p>
              {confirmedName && (
                <p className="confirmation-message">
                  {direction === 'in' ? 'Have a good session.' : 'See you next time.'}
                </p>
              )}
              <button className="primary" onClick={reset}>
                Ready for the next student
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <>
              <span className="eyebrow">{CENTER_NAME}</span>
              <h1>
                Scan your <em>pouch.</em>
              </h1>
              <p>Use your pouch or enter your name.</p>
              <div className="reception-entry">
                <form
                  className="manual-code"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit(token);
                  }}
                >
                  <label htmlFor="student-name">Your name</label>
                  <div>
                    <div className="name-input-wrap">
                      <input
                        id="student-name"
                        aria-label="Full name"
                        ref={codeInput}
                        value={token}
                        placeholder="Start typing your name"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={120}
                        required
                        disabled={busy || camera}
                        aria-autocomplete="inline"
                        aria-describedby={ghostName ? 'name-completion-description' : undefined}
                        onChange={(e) => setToken(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            ghostName &&
                            ((e.key === 'Tab' && !e.shiftKey) ||
                              (e.key === 'ArrowRight' &&
                                e.currentTarget.selectionStart === token.length))
                          ) {
                            if (e.key === 'ArrowRight') e.preventDefault();
                            setToken(ghostName);
                          }
                          if (e.key === 'Escape') setCompletion(null);
                        }}
                      />
                      {ghostName && (
                        <span className="name-ghost" aria-hidden="true">
                          <span>{token}</span>
                          {ghostName.slice(token.length)}
                        </span>
                      )}
                      {ghostName && (
                        <span className="sr-only" id="name-completion-description">
                          {ghostName}. Press Tab or Right Arrow to complete.
                        </span>
                      )}
                    </div>
                    <button
                      className="primary"
                      aria-label="Check in or out by name"
                      disabled={busy || camera || !token.trim()}
                    >
                      {busy ? 'Saving…' : 'Continue'}
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </form>
                <div className="reception-alternatives">
                  <button
                    className="text-button"
                    disabled={busy || camera}
                    onClick={() => setManual(!manual)}
                  >
                    Enter pouch code
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || camera}
                    onClick={() => {
                      setError('');
                      setCamera(true);
                    }}
                  >
                    <Camera size={16} />
                    Use camera
                  </button>
                </div>
                {manual && (
                  <form
                    className="reception-code-entry"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit(pouchCode, false);
                    }}
                  >
                    <label htmlFor="pouch-code">
                      Pouch code
                      <input
                        id="pouch-code"
                        placeholder="Scan a pouch label"
                        autoComplete="off"
                        value={pouchCode}
                        onChange={(e) => setPouchCode(e.target.value)}
                        disabled={busy || camera}
                        required
                      />
                    </label>
                    <button className="secondary" disabled={busy || camera || !pouchCode.trim()}>
                      Submit pouch scan
                    </button>
                  </form>
                )}
                {camera && (
                  <div className="scan-card camera-on">
                    <video ref={video} autoPlay muted playsInline aria-label="QR camera preview" />
                    <div className="scan-reticle" />
                    <button
                      className="camera-close icon-button"
                      aria-label="Stop camera"
                      onClick={() => {
                        setCamera(false);
                        resume.current = false;
                      }}
                    >
                      <X size={20} />
                    </button>
                    <span className="camera-caption">Hold your QR code inside the frame</span>
                  </div>
                )}
              </div>
              {error && (
                <p className="error kiosk-error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      )}
      <footer className="kiosk-footer">
        <span>
          <ShieldCheck size={16} />
          Reception
        </span>
        {staffPreview ? (
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await request('/api/kiosk', 'PUT');
                window.location.assign('/kiosk');
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            Lock for shared use
          </button>
        ) : (
          <Link href="/login">Staff access</Link>
        )}
      </footer>
    </main>
  );
}
