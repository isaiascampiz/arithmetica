'use client';
/* eslint-disable @next/next/no-location-assign-relative-destination -- Account removal and sign-out clear private client state. */
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { SquareUserRound } from 'lucide-react';
import type { Staff } from '@/lib/model';
import type { StaffProfile } from '@/lib/v3-model';
import { clientId, request } from '@/lib/client';
import { Modal } from '@/components/ui/shared';
import { SettingRow } from '@/components/ui/ui-primitives';
type Profile = StaffProfile & { email: string; role: string };
export function AccountSettings({ staff }: { staff: Staff }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [saved, setSaved] = useState<Profile | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(0),
    [password, setPassword] = useState(''),
    [email, setEmail] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const requestId = useRef<{ key: string; id: string } | null>(null),
    file = useRef<HTMLInputElement>(null);
  async function load() {
    try {
      const p = await request<Profile>('/api/account');
      setProfile(p);
      setSaved(p);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function upload(value?: File) {
    if (!value || !profile) return;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(value.type) || value.size > 5000000)
        throw Error('Choose a PNG, JPEG or WebP image under 5 MB.');
      const bitmap = await createImageBitmap(value),
        canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const size = Math.min(bitmap.width, bitmap.height);
      canvas
        .getContext('2d')!
        .drawImage(
          bitmap,
          (bitmap.width - size) / 2,
          (bitmap.height - size) / 2,
          size,
          size,
          0,
          0,
          256,
          256,
        );
      bitmap.close();
      const picture = canvas.toDataURL('image/webp', 0.85);
      setProfile((current) => (current ? { ...current, picture } : current));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
    if (file.current) file.current.value = '';
  }
  if (!profile)
    return (
      <div>
        {error ? (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button className="secondary" onClick={() => void load()}>
              Reload profile
            </button>
          </>
        ) : (
          <p role="status">Loading account…</p>
        )}
      </div>
    );
  return (
    <>
      <div className="settings-row-group account-form">
        <SettingRow label={<label htmlFor="account-first">First name</label>}>
          <input
            id="account-first"
            value={profile.firstName}
            maxLength={60}
            autoComplete="given-name"
            onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
          />
        </SettingRow>
        <SettingRow label={<label htmlFor="account-last">Last name</label>}>
          <input
            id="account-last"
            value={profile.lastName}
            maxLength={60}
            autoComplete="family-name"
            onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
          />
        </SettingRow>
        <SettingRow label="Email">
          <span className="setting-value">
            {profile.email || staff.email || 'Managed by your organization'}
          </span>
        </SettingRow>
        <SettingRow label="Profile picture">
          <button
            type="button"
            className="profile-picture-button"
            aria-label="Change profile picture"
            onClick={() => file.current?.click()}
          >
            {profile.picture ? (
              <Image
                src={profile.picture}
                alt="Your profile picture"
                width={40}
                height={40}
                unoptimized
              />
            ) : (
              <SquareUserRound size={36} />
            )}
          </button>
          <input
            className="sr-only"
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Profile picture file"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          {profile.picture && (
            <button className="text-button" onClick={() => setProfile({ ...profile, picture: '' })}>
              Remove
            </button>
          )}
        </SettingRow>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="account-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await request('/api/auth', 'DELETE');
              location.assign('/login');
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Sign out
        </button>
        <button
          className="text-button"
          onClick={() => {
            setError('');
            setRemove(1);
          }}
        >
          Delete account
        </button>
        <button
          className="primary account-save"
          disabled={
            busy || !profile.firstName.trim() || JSON.stringify(profile) === JSON.stringify(saved)
          }
          onClick={async () => {
            setBusy(true);
            setError('');
            const body = {
                expectedVersion: saved!.version,
                firstName: profile.firstName,
                lastName: profile.lastName,
                picture: profile.picture,
              },
              key = JSON.stringify(body);
            requestId.current =
              requestId.current?.key === key ? requestId.current : { key, id: clientId() };
            try {
              const next = await request<StaffProfile>('/api/account', 'PATCH', {
                ...body,
                requestId: requestId.current.id,
              });
              const result = { ...profile, ...next };
              setProfile(result);
              setSaved(result);
              requestId.current = null;
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </button>
      </div>
      {remove > 0 && (
        <Modal
          variant="form"
          title="Delete account"
          close={() => setRemove(0)}
          className="settings-edit-dialog"
          footer={
            <>
              <button className="secondary" disabled={busy} onClick={() => setRemove(0)}>
                Cancel
              </button>
              {remove === 1 ? (
                <button className="primary" onClick={() => setRemove(2)}>
                  Continue
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={
                    busy ||
                    confirmation !== 'DELETE MY ACCOUNT' ||
                    email !== profile.email ||
                    !password
                  }
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await request('/api/account', 'DELETE', {
                        email,
                        password,
                        confirmation,
                        requestId: clientId(),
                      });
                      location.assign('/login');
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Delete my account
                </button>
              )}
            </>
          }
        >
          {remove === 1 ? (
            <p>
              This removes your access and profile picture. Student records and previously
              attributed work remain with the center. The only owner must transfer ownership first.
            </p>
          ) : (
            <>
              <p>Confirm your account to continue.</p>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                Type DELETE MY ACCOUNT
                <input
                  value={confirmation}
                  autoComplete="off"
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
