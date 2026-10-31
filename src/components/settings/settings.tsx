'use client';
import { useState } from 'react';
import { Building2, SquareUserRound, ShieldCheck, SlidersHorizontal, Plus, X } from 'lucide-react';
import type { Snapshot } from '@/lib/model';
import type { V2Command } from '@/lib/v2-domain';
import type { Subject } from '@/lib/v2-model';
import { centerFeatures } from '@/lib/center-features';
import { APP_NAME, APP_VERSION, centerName } from '@/lib/brand';
import { Modal, type WorkspaceAction } from '@/components/ui/shared';
import { ThemeControl, AccentControl } from '@/components/ui/theme';
import { InfoTip, SettingRow, Switch } from '@/components/ui/ui-primitives';
import { AccountSettings } from './account-settings';
import { RosterImport } from '@/components/students/roster-import';
import './settings.css';
type Props = {
  db: Snapshot;
  act: WorkspaceAction;
  legacyAct: (c: V2Command) => Promise<boolean>;
  busy: boolean;
  error?: string;
  initialSection?: string;
};
export function SettingsWorkspace({
  db,
  act,
  legacyAct,
  busy,
  error,
  initialSection = 'general',
}: Props) {
  const [section, setSection] = useState(initialSection);
  const [editor, setEditor] = useState('');
  const [resumeReviewed, setResumeReviewed] = useState(false);
  const features = centerFeatures(db),
    owner = db.staff.role === 'owner';
  const shortcuts = db.operations!.v3!.instructorTiles[db.staff.name] || [
    'Focused well',
    'Needed reminders',
    'Worked independently',
    'Needed help',
  ];
  const [tiles, setTiles] = useState(shortcuts);
  const [center, setCenter] = useState(() => ({
    ...db.operations!.center,
    name: centerName(db.operations!.center.name),
  }));
  const [subject, setSubject] = useState<Subject>('Math'),
    [level, setLevel] = useState('D'),
    [first, setFirst] = useState(1),
    [last, setLast] = useState(200),
    [order, setOrder] = useState(8),
    [source, setSource] = useState('');
  const nav = (id: string, label: string, Icon: typeof Building2) => (
    <button
      type="button"
      aria-current={section === id ? 'page' : undefined}
      onClick={() => setSection(id)}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
  return (
    <div className="v3-settings-workspace refined-settings">
      <aside className="settings-navigation">
        <div>
          <p className="settings-nav-label">SETTINGS</p>
          <nav aria-label="Settings sections">
            {nav('general', 'General', SlidersHorizontal)}
            {nav('center', 'Center details', Building2)}
          </nav>
          <p className="settings-nav-label account-section-label">ACCOUNT</p>
          <nav aria-label="Account settings">
            {nav('account', 'Account', SquareUserRound)}
            {nav('privacy', 'Data and privacy', ShieldCheck)}
          </nav>
        </div>
        <span className="settings-version">
          {APP_NAME} v{APP_VERSION}
        </span>
      </aside>
      <div className="settings-content">
        <h2 className="settings-section-title">
          {
            {
              general: 'General',
              center: 'Center details',
              account: 'Account',
              privacy: 'Data and privacy',
            }[section]
          }
        </h2>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {section === 'general' && (
          <div className="settings-row-group">
            <SettingRow label="Theme">
              <ThemeControl />
            </SettingRow>
            <SettingRow label="Accent color">
              <AccentControl />
            </SettingRow>
            {db.staff.role !== 'assistant' && (
              <SettingRow label="Observation shortcuts" detail={shortcuts.slice(0, 2).join(' · ')}>
                <button
                  className="secondary"
                  onClick={() => {
                    setTiles(shortcuts);
                    setEditor('shortcuts');
                  }}
                >
                  Change
                </button>
              </SettingRow>
            )}
            {owner && (
              <SettingRow
                label={
                  <>
                    Homework{' '}
                    <InfoTip label="About homework">
                      Shows paper preparation and homework tracking. Existing records are retained
                      when turned off.
                    </InfoTip>
                  </>
                }
              >
                <Switch
                  label="Homework"
                  checked={features.homework}
                  disabled={busy}
                  onChange={(value) => {
                    if (value) {
                      setResumeReviewed(false);
                      setEditor('homework');
                    } else
                      void act({
                        action: 'center-features',
                        expectedVersion: features.version,
                        homework: false,
                        medals: features.medals,
                        resumeReviewed: false,
                      });
                  }}
                />
              </SettingRow>
            )}
          </div>
        )}
        {section === 'center' && (
          <>
            <div className="settings-row-group">
              <SettingRow label="Center name" detail={centerName(db.operations!.center.name)}>
                <button
                  className="secondary"
                  disabled={!owner}
                  onClick={() => {
                    setCenter({
                      ...db.operations!.center,
                      name: centerName(db.operations!.center.name),
                    });
                    setEditor('center');
                  }}
                >
                  Change
                </button>
              </SettingRow>
              <SettingRow
                label="Operating hours"
                detail={
                  'Closes at ' +
                  new Intl.DateTimeFormat('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'UTC',
                  }).format(new Date('2000-01-01T' + db.operations!.center.closingTime + ':00Z'))
                }
              >
                <button
                  className="secondary"
                  disabled={!owner}
                  onClick={() => {
                    setCenter({
                      ...db.operations!.center,
                      name: centerName(db.operations!.center.name),
                    });
                    setEditor('center');
                  }}
                >
                  Change
                </button>
              </SettingRow>
              <SettingRow
                label={
                  <>
                    End of day{' '}
                    <InfoTip label="About end of day">
                      Open visits close automatically at closing time. A missed checkout has an
                      unknown physical departure time; it does not count as measured attendance.
                      Daily reports are archived at closing.
                    </InfoTip>
                  </>
                }
              >
                <span className="setting-value">Automatic</span>
              </SettingRow>
            </div>
            {owner && features.homework && (
              <div className="settings-row-group secondary-settings-group">
                <SettingRow label="Curriculum boundaries">
                  <button className="secondary" onClick={() => setEditor('curriculum')}>
                    Manage
                  </button>
                </SettingRow>
              </div>
            )}
          </>
        )}
        {section === 'account' && <AccountSettings staff={db.staff} />}
        {section === 'privacy' && (
          <div className="settings-row-group">
            <SettingRow label="Your access">
              <span className="setting-value capitalize">{db.staff.role}</span>
            </SettingRow>
            <SettingRow label="Student records" detail="Available to authorized staff only.">
              <InfoTip label="About access">
                Reception devices receive attendance confirmations only. Student records are not
                stored in browser storage.
              </InfoTip>
            </SettingRow>
            {owner && (
              <SettingRow label="Center backup">
                <a className="secondary" href="/api/export" download>
                  Export
                </a>
              </SettingRow>
            )}
            <SettingRow label="Data environment">
              <span className="setting-value">
                {db.runtime?.demo
                  ? 'Fictional demo'
                  : db.runtime?.environment === 'staging'
                    ? 'Staging — synthetic data only'
                    : 'Center workspace'}
              </span>
            </SettingRow>
            <RosterImport db={db} />
          </div>
        )}
      </div>
      {editor === 'shortcuts' && (
        <Modal
          variant="form"
          title="Observation shortcuts"
          className="settings-edit-dialog"
          close={() => setEditor('')}
          footer={
            <>
              <button className="secondary" onClick={() => setEditor('')}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  tiles.some((t) => !t.trim()) ||
                  new Set(tiles.map((t) => t.trim().toLowerCase())).size !== tiles.length
                }
                onClick={async () => {
                  if (
                    await act({
                      action: 'shortcuts',
                      tiles: tiles.map((t) => t.trim()),
                    })
                  )
                    setEditor('');
                }}
              >
                Save
              </button>
            </>
          }
        >
          <p className="muted">Keep up to six frequently used observations in Quick View.</p>
          <div className="shortcut-editor">
            {tiles.map((tile, i) => (
              <div key={i}>
                <label>
                  <span className="sr-only">Shortcut {i + 1}</span>
                  <input
                    value={tile}
                    maxLength={48}
                    onChange={(e) =>
                      setTiles(tiles.map((t, index) => (index === i ? e.target.value : t)))
                    }
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label={'Remove shortcut ' + (i + 1)}
                  onClick={() => setTiles(tiles.filter((_, index) => index !== i))}
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="text-button"
            disabled={tiles.length >= 6}
            onClick={() => setTiles([...tiles, ''])}
          >
            <Plus size={16} />
            Add shortcut
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {editor === 'homework' && (
        <Modal
          variant="form"
          title="Turn on homework"
          close={() => setEditor('')}
          footer={
            <>
              <button className="secondary" onClick={() => setEditor('')}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || !resumeReviewed}
                onClick={async () => {
                  if (
                    await act({
                      action: 'center-features',
                      expectedVersion: features.version,
                      homework: true,
                      medals: features.medals,
                      resumeReviewed: true,
                    })
                  )
                    setEditor('');
                }}
              >
                Turn on
              </button>
            </>
          }
        >
          <p>Review current student levels and saved paper plans before resuming preparation.</p>
          <SettingRow label="Levels and plans reviewed">
            <Switch
              label="Levels and plans reviewed"
              checked={resumeReviewed}
              onChange={setResumeReviewed}
            />
          </SettingRow>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {editor === 'center' && (
        <Modal
          variant="form"
          title="Center details"
          className="settings-edit-dialog"
          close={() => setEditor('')}
          footer={
            <>
              <button className="secondary" onClick={() => setEditor('')}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || !center.name.trim()}
                onClick={async () => {
                  if (
                    await legacyAct({
                      action: 'center-save',
                      expectedVersion: center.version || 0,
                      name: center.name,
                      closingTime: center.closingTime,
                      operatingDays: center.operatingDays,
                      closedDates: center.closedDates,
                      reportTime: center.closingTime,
                      autoClose: true,
                      expectedMinutes: center.expectedMinutes,
                      earlyPerInstructor: center.earlyPerInstructor,
                    })
                  )
                    setEditor('');
                }}
              >
                Save
              </button>
            </>
          }
        >
          <label>
            Center name
            <input
              value={center.name}
              maxLength={120}
              onChange={(e) => setCenter({ ...center, name: e.target.value })}
            />
          </label>
          <label>
            Closing time
            <input
              type="time"
              value={center.closingTime}
              onChange={(e) => setCenter({ ...center, closingTime: e.target.value })}
            />
          </label>
          <fieldset className="operating-days">
            <legend>Operating days</legend>
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
              (day, i) => (
                <SettingRow key={day} label={day}>
                  <Switch
                    label={day}
                    checked={center.operatingDays.includes(i)}
                    onChange={(on) =>
                      setCenter({
                        ...center,
                        operatingDays: on
                          ? [...center.operatingDays, i].sort()
                          : center.operatingDays.filter((d) => d !== i),
                      })
                    }
                  />
                </SettingRow>
              ),
            )}
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {editor === 'curriculum' && (
        <Modal
          variant="form"
          title="Curriculum boundaries"
          className="curriculum-editor-dialog"
          close={() => setEditor('')}
          footer={
            <>
              <button className="secondary" onClick={() => setEditor('')}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || source.trim().length < 3}
                onClick={async () => {
                  if (
                    await act({
                      action: 'catalog',
                      subject,
                      id: level,
                      first,
                      last,
                      order,
                      source,
                    })
                  )
                    setEditor('');
                }}
              >
                Approve entry
              </button>
            </>
          }
        >
          <p className="muted">
            Use center-approved bounds.{' '}
            {db.runtime?.demo
              ? 'The demonstration catalog is fictional.'
              : 'Approve each level from the center’s verified materials.'}
          </p>
          <div className="form-grid">
            <label className="full-width-field">
              Subject
              <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
                <option>Math</option>
                <option>Reading</option>
              </select>
            </label>
            <label>
              Level
              <input value={level} onChange={(e) => setLevel(e.target.value)} />
            </label>
            <label>
              Sequence order
              <input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </label>
            <label>
              First worksheet
              <input
                type="number"
                min={1}
                value={first}
                onChange={(e) => setFirst(Number(e.target.value))}
              />
            </label>
            <label>
              Last worksheet
              <input
                type="number"
                min={1}
                value={last}
                onChange={(e) => setLast(Number(e.target.value))}
              />
            </label>
            <label className="full-width-field">
              Verification source
              <input value={source} onChange={(e) => setSource(e.target.value)} />
            </label>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
