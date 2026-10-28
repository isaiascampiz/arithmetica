'use client';
/* eslint-disable @next/next/no-location-assign-relative-destination -- A fresh document prevents cached staff state surviving sign-in. */
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { request } from '@/lib/client';
import { BrandMark } from './brand';
import { APP_NAME, CENTER_NAME } from '@/lib/brand';
import { ThemeControl } from './theme';
export function Login({ cloud = false }: { cloud?: boolean }) {
  const [email, setEmail] = useState(cloud ? '' : 'owner@demo.center');
  const [password, setPassword] = useState(cloud ? '' : 'CenterDemo!2026');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="login-page refined-login">
      <header className="login-header">
        <a className="brand" href="/login">
          <span className="brand-icon">
            <BrandMark />
          </span>
          {APP_NAME}
        </a>
        <ThemeControl compact />
      </header>
      <section className="login-form">
        <div className="login-form-inner">
          <h2>Welcome back</h2>
          <p className="muted">Sign in to {APP_NAME}.</p>
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
          <p className="login-note">
            {cloud ? 'For authorized center staff.' : 'Fictional demonstration data only.'}
          </p>
        </div>
      </section>
      <footer className="login-center">{CENTER_NAME}</footer>
    </main>
  );
}
