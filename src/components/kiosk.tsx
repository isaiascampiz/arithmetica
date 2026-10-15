'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Camera, Check, ScanLine, ShieldCheck, X } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { request } from '@/lib/client';
export function Kiosk() {
  const [ready, setReady] = useState<boolean | null>(null),
    [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [direction, setDirection] = useState(''),
    [manual, setManual] = useState(false);
  const [demo, setDemo] = useState(true);
  const video = useRef<HTMLVideoElement>(null),
    lock = useRef(false),
    resume = useRef(false);
  const lastCode = useRef<string | null>(null),
    blankSince = useRef<number | null>(null);
  useEffect(() => {
    void request<{ demo: boolean }>('/api/kiosk')
      .then((data) => {
        setReady(true);
        setDemo(data.demo);
      })
      .catch(() => setReady(false));
  }, []);
  function reset() {
    setMessage('');
    setError('');
    if (resume.current) setCamera(true);
  }
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => {
      setMessage('');
      setError('');
      if (resume.current) setCamera(true);
    }, 4000);
    return () => clearTimeout(t);
  }, [message]);
  async function submit(value: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    resume.current = camera;
    setCamera(false);
    try {
      const result = await request<{ message: string; direction?: string }>('/api/kiosk', 'POST', {
        token: value.trim(),
      });
      setMessage(result.message);
      setDirection(result.direction || 'recorded');
      setToken('');
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
    if (!camera) return;
    const element = video.current;
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
              void submitRef.current(result.getText());
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
    <main className="kiosk-page v2-kiosk">
      <header className="kiosk-header">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          centerflow.
        </Link>
        <span className="demo-label">{demo ? 'FICTIONAL TEST DATA' : 'CENTER RECEPTION'}</span>
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
              <span className="success-orbit">
                <Check size={46} />
              </span>
              <h1>
                {direction === 'in'
                  ? 'Welcome in.'
                  : direction === 'out'
                    ? 'See you soon.'
                    : 'Scan recorded.'}
              </h1>
              <p>{message}</p>
              <button className="primary" onClick={reset}>
                Ready for the next student
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <>
              <span className="eyebrow">RECEPTION · ARRIVAL & DEPARTURE</span>
              <h1>SCAN YOUR POUCH</h1>
              <p>One scan when you arrive. One scan when you leave.</p>
              <div className={'scan-card ' + (camera ? 'camera-on' : '')}>
                {camera ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="scan-illustration">
                      <ScanLine size={92} strokeWidth={1.1} />
                    </div>
                    <h2>Your learning day starts here.</h2>
                    <p>Hold the pouch code up to the camera.</p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => {
                        setError('');
                        setCamera(true);
                      }}
                    >
                      <Camera size={19} />
                      Start camera
                    </button>
                  </>
                )}
              </div>
              <button className="text-button" onClick={() => setManual(!manual)}>
                Enter a pouch code instead
              </button>
              {(manual || error) && (
                <form
                  className="manual-code"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit(token);
                  }}
                >
                  <label htmlFor="code">Student pouch code</label>
                  <div>
                    <input
                      id="code"
                      placeholder="Pouch code"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={100}
                      value={token}
                      disabled={busy || camera}
                      required
                      onChange={(e) => setToken(e.target.value)}
                    />
                    <button
                      className="primary"
                      disabled={busy || camera || !token.trim()}
                      aria-label="Submit pouch scan"
                    >
                      {busy ? 'Saving…' : <ArrowRight size={21} />}
                    </button>
                  </div>
                </form>
              )}
              {error && (
                <p className="error kiosk-error" role="alert">
                  {error}
                </p>
              )}
              <details className="kiosk-test">
                <summary>Testing without a QR card?</summary>
                <p>Entirely fictional test code; no student name is exposed.</p>
                <button
                  className="text-button"
                  disabled={camera || busy}
                  onClick={() => {
                    setManual(true);
                    setToken('CF-DEMO-AVERY-7K2Q');
                  }}
                >
                  Use fictional test code
                </button>
              </details>
              <p className="kiosk-privacy">
                Immediate repeat scans are ignored. Previous unverified visits require staff review.
              </p>
            </>
          )}
        </div>
      )}
      <footer className="kiosk-footer">
        <span>
          <ShieldCheck size={16} />
          Student scanning only · no roster or private notes
        </span>
        <a href="/login">Staff access</a>
      </footer>
    </main>
  );
}
