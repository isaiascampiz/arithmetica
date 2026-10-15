'use client';
/* eslint-disable @next/next/no-location-assign-relative-destination -- A fresh document prevents cached staff state surviving sign-in. */
import { useState } from 'react';
import { ArrowRight, BookOpen, Check, Sparkles } from 'lucide-react';
import { request } from '@/lib/client';
export function Login({ cloud = false }: { cloud?: boolean }) {
  const [email, setEmail] = useState(cloud ? '' : 'owner@demo.center');
  const [password, setPassword] = useState(cloud ? '' : 'CenterDemo!2026');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="login-page">
      <section className="login-story">
        <a className="brand" href="/login">
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          centerflow<span className="brand-dot">.</span>
        </a>
        <div className="story-content">
          <div className="eyebrow">
            <Sparkles size={16} /> MORE SPACE FOR LEARNING
          </div>
          <h1>
            A calmer center.
            <br />A clearer day.
          </h1>
          <p>
            Keep the small details together.
            <br />
            Give every learner your full attention.
          </p>
          <div className="story-card">
            <span className="avatar mint">AB</span>
            <div>
              <b>Small moments. Lasting progress.</b>
              <span>Notice it. Capture it. Follow through.</span>
            </div>
            <span className="round-check">
              <Check size={18} />
            </span>
          </div>
        </div>
        <div className="story-footer">Made for the rhythm of a learning center.</div>
      </section>
      <section className="login-form">
        <div className="login-form-inner">
          <span className="pill">{cloud ? 'PRIVATE CENTER · V3.0' : 'FICTIONAL DEMO · V3.0'}</span>
          <h2>Welcome back</h2>
          <p className="muted">Your center, thoughtfully connected.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await request('/api/auth', 'POST', { email, password });
                location.assign('/');
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <label>
              Email address
              <input
                autoComplete="username"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in to your center'}
              <ArrowRight size={18} />
            </button>
          </form>
          {!cloud && (
            <details className="demo-accounts">
              <summary>Explore a different staff role</summary>
              <button
                onClick={() => {
                  setEmail('instructor@demo.center');
                  setPassword('TeachDemo!2026');
                }}
              >
                Instructor · observations & review
              </button>
              <button
                onClick={() => {
                  setEmail('assistant@demo.center');
                  setPassword('HelpDemo!2026');
                }}
              >
                Assistant · attendance & homework
              </button>
              <button
                onClick={() => {
                  setEmail('owner@demo.center');
                  setPassword('CenterDemo!2026');
                }}
              >
                Owner · all demo tools
              </button>
            </details>
          )}
          <p className="login-note">
            {cloud
              ? 'Access is limited to verified authorized staff. Configure and validate the organization’s privacy and recovery requirements before real use.'
              : 'All original 96 students are fictional. Use fictional test records only until corporate and privacy authorization is verified.'}
          </p>
        </div>
      </section>
    </main>
  );
}
