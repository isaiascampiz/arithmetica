'use client';
/* eslint-disable @next/next/no-location-assign-relative-destination -- Authentication changes discard private client state. */
import { centerFeatures } from '@/lib/center-features';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Layers3,
  House,
  ContactRound,
  ChartColumn,
  FileChartColumn,
  QrCode,
  Settings,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  SquareUserRound,
  Check,
  Clock3,
  RefreshCw,
} from 'lucide-react';
import { isOpenVisit, type Snapshot, type Student } from '@/lib/model';
import type { Command } from '@/lib/domain';
import type { V2Command } from '@/lib/v2-domain';
import type { V3Command } from '@/lib/v3-domain';
import { homePreparation } from '@/lib/home-preparation';
import { homeRoster, type HomeFilter } from '@/lib/v3-planning';
import { measuredMinutes } from '@/lib/v3-analytics';
import { clientId, request } from '@/lib/client';
import { Avatar, Empty, time, CenterClock, LiveElapsed, useCenterDay } from './shared-ui';
import { BrandMark } from './brand';
import { APP_NAME, centerName } from '@/lib/brand';
import { ThemeControl } from './theme';
import { Popover } from './ui-primitives';
import { Modal } from './v3-shared';
const QuickView = dynamic(() => import('./v3-quick-view').then((m) => m.QuickView));
const Preparation = dynamic(() => import('./v3-preparation').then((m) => m.Preparation));
const RosterV3 = dynamic(() => import('./v3-roster').then((m) => m.RosterV3));
const StudentProfileV3 = dynamic(() => import('./v3-profile').then((m) => m.StudentProfileV3));
const CenterActivity = dynamic(() => import('./v3-center-activity').then((m) => m.CenterActivity));
const V3Settings = dynamic(() => import('./v3-settings').then((m) => m.V3Settings));
const ReportsWorkspace = dynamic(() => import('./v3-reports').then((m) => m.ReportsWorkspace));
type View = 'home' | 'students' | 'homework' | 'activity' | 'reports' | 'settings';
type Mutation = Command | { kind: 'v2'; command: V2Command } | { kind: 'v3'; command: V3Command };
const nav = [
  { id: 'home' as View, label: 'Home', icon: House },
  { id: 'students' as View, label: 'Student Roster', icon: ContactRound },
  { id: 'homework' as View, label: 'Homework Preparation', icon: Layers3 },
  { id: 'activity' as View, label: 'Traffic', icon: ChartColumn },
  { id: 'reports' as View, label: 'Reports', icon: FileChartColumn },
];
export function StaffApp() {
  const [db, setDb] = useState<Snapshot | null>(null),
    [view, setView] = useState<View>('home'),
    [homeFilter, setHomeFilter] = useState<HomeFilter | null>(null),
    [profileId, setProfile] = useState<string | null>(null),
    [visitId, setVisit] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [online, setOnline] = useState(true),
    [collapsed, setCollapsed] = useState(false),
    [menu, setMenu] = useState(false),
    [undo, setUndo] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] = useState('general');
  const [refreshing, setRefreshing] = useState(false);
  const requestIds = useRef(new Map<string, string>());
  const [settingsReturn, setSettingsReturn] = useState<{ view: View; profileId: string | null }>({
    view: 'home',
    profileId: null,
  });
  const today = useCenterDay(db?.timezone || 'America/Los_Angeles');
  const refresh = useCallback(async () => {
    try {
      setDb(await request<Snapshot>('/api/state'));
      setOnline(true);
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes('sign in')) location.assign('/login');
      setOnline(false);
      setError(message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), 7000);
    setCollapsed(localStorage.getItem('cf-sidebar') === 'collapsed');
    const read = () => {
      const params = new URLSearchParams(location.search),
        id = params.get('view') as View;
      if (nav.some((n) => n.id === id) || id === 'settings') setView(id);
      setProfile(params.get('student'));
    };
    read();
    window.addEventListener('popstate', read);
    return () => {
      clearInterval(poll);
      window.removeEventListener('popstate', read);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      setToast('');
      setUndo(null);
    }, 7000);
    return () => clearTimeout(t);
  }, [toast]);
  function navigate(v: View) {
    if (v === 'settings' && view !== 'settings') setSettingsReturn({ view, profileId });
    setView(v);
    setProfile(null);
    setVisit(null);
    setMenu(false);
    setError('');
    history.pushState(null, '', '/?view=' + v);
  }
  function closeSettings() {
    const prior = settingsReturn;
    setView(prior.view);
    setProfile(prior.profileId);
    setError('');
    history.pushState(
      null,
      '',
      '/?view=' +
        prior.view +
        (prior.profileId ? '&student=' + encodeURIComponent(prior.profileId) : ''),
    );
  }
  function profile(id: string) {
    setProfile(id);
    setView('students');
    setMenu(false);
    history.pushState(null, '', '/?view=students&student=' + encodeURIComponent(id));
  }
  async function mutate(c: Mutation) {
    const key = JSON.stringify(c),
      requestId = requestIds.current.get(key) || clientId();
    requestIds.current.set(key, requestId);
    setBusy(true);
    setError('');
    try {
      await request('/api/commands', 'POST', { ...c, requestId });
      requestIds.current.delete(key);
      await refresh();
      setToast('Saved to your center.');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const act = (command: V3Command) => mutate({ kind: 'v3', command }),
    legacyAct = (command: V2Command) => mutate({ kind: 'v2', command });
  async function attendance(s: Student) {
    const visit = db?.visits.find((v) => v.studentId === s.id && isOpenVisit(v));
    if (
      visit &&
      db?.staff.role === 'assistant' &&
      !window.confirm('Confirm that ' + s.name + ' is checking out?')
    )
      return;
    if (await mutate({ kind: 'attendance', studentId: s.id, direction: visit ? 'out' : 'in' })) {
      if (visit && db?.staff.role !== 'assistant') {
        setUndo(visit.id);
        setToast(s.name + ' checked out.');
      }
    }
  }
  async function openKiosk() {
    location.assign('/reception');
  }
  function toggleSidebar() {
    setCollapsed((v) => {
      localStorage.setItem('cf-sidebar', v ? 'expanded' : 'collapsed');
      return !v;
    });
  }
  if (!db?.operations?.v3)
    return (
      <main className="loading">
        <span className="brand-icon">
          <BrandMark />
        </span>
        <h2>Opening your center…</h2>
        {error && (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button className="primary" onClick={() => void refresh()}>
              Retry
            </button>
          </>
        )}
      </main>
    );
  const features = centerFeatures(db);
  const activeView = view === 'homework' && !features.homework ? 'home' : view;
  const contentView = activeView === 'settings' ? settingsReturn.view : activeView;
  const displayProfileId = activeView === 'settings' ? settingsReturn.profileId : profileId;
  const op = db.operations,
    teacher = db.staff.role !== 'assistant',
    home = homeRoster(db, today, homeFilter),
    student = displayProfileId ? db.students.find((s) => s.id === displayProfileId) : undefined,
    visit = visitId ? db.visits.find((v) => v.id === visitId) : undefined;
  const prepCount = new Set(
    op.assignments
      .filter(
        (a) =>
          a.v3 &&
          !a.v3.issuedAt &&
          (!a.v3.preparedAt || a.stale) &&
          op.students[a.studentId].active &&
          !(op.students[a.studentId].awayUntil && today < op.students[a.studentId].awayUntil!) &&
          op.students[a.studentId].subjects[a.subject].enrolled &&
          op.students[a.studentId].subjects[a.subject].format === 'Paper',
      )
      .map((a) => a.studentId),
  ).size;
  const title = student
    ? ''
    : contentView === 'home'
      ? 'Home'
      : contentView === 'students'
        ? 'Student Roster'
        : contentView === 'homework'
          ? 'Homework Preparation'
          : contentView === 'activity'
            ? 'Traffic'
            : contentView === 'reports'
              ? 'Reports'
              : 'Settings & access';
  return (
    <div className={'app-shell v2-shell v3-shell ' + (collapsed ? 'side-collapsed' : '')}>
      <header className="app-toolbar">
        <div className="app-toolbar-left">
          <button
            className="icon-button desktop-sidebar-control"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleSidebar}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={21} />
          </button>
          <Popover
            label="Account"
            buttonClass="icon-button"
            trigger={
              db.staff.picture ? (
                <Image
                  src={db.staff.picture}
                  width={24}
                  height={24}
                  unoptimized
                  alt="Your account"
                  className="toolbar-avatar"
                />
              ) : (
                <SquareUserRound size={20} />
              )
            }
          >
            {(close) => (
              <div role="menu" aria-label="Account">
                <div className="menu-identity">
                  <b>{db.staff.displayName || db.staff.name}</b>
                  <span>{db.staff.role}</span>
                </div>
                <button
                  role="menuitem"
                  onClick={() => {
                    close();
                    setSettingsSection('account');
                    navigate('settings');
                  }}
                >
                  <SquareUserRound size={17} />
                  Account
                </button>
                <button
                  role="menuitem"
                  onClick={async () => {
                    await request('/api/auth', 'DELETE');
                    location.assign('/login');
                  }}
                >
                  <LogOut size={17} />
                  Sign out
                </button>
              </div>
            )}
          </Popover>
        </div>
        <div className="app-toolbar-right">
          {(!online || busy) && (
            <span className={'connection ' + (!online ? 'disconnected' : '')}>
              {busy ? 'Saving…' : 'Offline'}
            </span>
          )}
          <ThemeControl compact />
        </div>
      </header>
      <aside className={'sidebar v2-sidebar ' + (menu ? 'open' : '')}>
        <div className="sidebar-brand">
          <div className="brand" aria-label={APP_NAME}>
            <span className="brand-icon">
              <BrandMark />
            </span>
            <span className="brand-word">{APP_NAME}</span>
          </div>
        </div>
        <nav>
          {nav
            .filter(
              (n) => (teacher || n.id !== 'reports') && (features.homework || n.id !== 'homework'),
            )
            .map((n) => (
              <button
                className={'nav-item ' + (activeView === n.id && !student ? 'active' : '')}
                title={n.label}
                aria-current={activeView === n.id && !student ? 'page' : undefined}
                key={n.id}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={20} strokeWidth={1.75} />
                <span>{n.label}</span>
                {n.id === 'homework' && prepCount > 0 && (
                  <small className="nav-count">{prepCount}</small>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item kiosk-nav"
            title="Open kiosk"
            disabled={busy}
            onClick={() => void openKiosk()}
          >
            <QrCode size={20} />
            <span>Open kiosk</span>
          </button>
          <button
            className={'nav-item ' + (activeView === 'settings' ? 'active' : '')}
            title="Settings"
            aria-current={activeView === 'settings' && !student ? 'page' : undefined}
            onClick={() => {
              setSettingsSection('general');
              navigate('settings');
            }}
          >
            <Settings size={20} strokeWidth={1.75} />
            <span>Settings</span>
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        {!student && contentView === 'home' && (
          <header className="topbar v2-topbar">
            <div className="header-location">
              <span className="workspace-center-name">{centerName(op.center.name)}</span>
              <CenterClock timezone={db.timezone} />
            </div>
          </header>
        )}
        <main className="main-content v3-content">
          {title && (
            <div className="page-heading">
              <h1>{title}</h1>
            </div>
          )}
          {error && !visit && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {student ? (
            <StudentProfileV3
              key={student.id + '-' + features.version}
              db={db}
              student={student}
              act={act}
              legacyAct={legacyAct}
              busy={busy}
              error={error}
              back={() => navigate('students')}
              quick={(v) => {
                setError('');
                setVisit(v.id);
              }}
              review={(id) => mutate({ kind: 'review', id })}
            />
          ) : (
            <>
              {contentView === 'home' && (
                <>
                  <div className="home-v3-metrics">
                    {(
                      [
                        ['expected', 'Still expected'],
                        ['here', 'Here now'],
                        ['early', 'Early learners here'],
                        ['out', 'Checked out'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={homeFilter === id}
                        onClick={() => setHomeFilter(homeFilter === id ? null : id)}
                      >
                        <span>{label}</span>
                        <b>{home.counts[id]}</b>
                      </button>
                    ))}
                  </div>
                  <section className="panel live-v3">
                    <header>
                      <h2>Today’s students</h2>
                      <button
                        className="icon-button"
                        aria-label="Sync students"
                        aria-busy={refreshing}
                        disabled={refreshing || busy}
                        onClick={async () => {
                          setRefreshing(true);
                          try {
                            await refresh();
                          } finally {
                            setRefreshing(false);
                          }
                        }}
                      >
                        <RefreshCw size={18} />
                      </button>
                    </header>
                    <div className="live-v3-list">
                      {home.rows.map(({ student: s, visit: v }) => {
                        const preparation = homePreparation(db, s.id, today, v || undefined);
                        if (!v)
                          return (
                            <div
                              className="live-v3-row expected"
                              key={'expected:' + s.id}
                              data-expected-student-id={s.id}
                            >
                              <button
                                className="expected-student-open"
                                aria-label={'Open profile for ' + s.name}
                                onClick={() => profile(s.id)}
                              >
                                <Avatar student={s} />
                                <div className="live-v3-person">
                                  <b>
                                    {s.name}
                                    {s.earlyLearner && <small>Early learner</small>}
                                  </b>
                                  <span>{s.subjects.join(' / ')}</span>
                                  {preparation && (
                                    <small
                                      className={'home-preparation-state ' + preparation.state}
                                    >
                                      {preparation.label}
                                    </small>
                                  )}
                                </div>
                              </button>
                              <span className="handoff-state">Not arrived</span>
                              <button
                                className="secondary"
                                disabled={busy}
                                aria-label={'Check in ' + s.name}
                                onClick={() => void attendance(s)}
                              >
                                Check in
                              </button>
                            </div>
                          );
                        const here = isOpenVisit(v),
                          status = here ? (v.handoff ? 'ready' : 'waiting') : 'departed',
                          duration = measuredMinutes(v);
                        return (
                          <button
                            className={'live-v3-row ' + status}
                            data-visit-id={v.id}
                            key={v.id}
                            onClick={() => {
                              setError('');
                              setVisit(v.id);
                            }}
                          >
                            <Avatar student={s} />
                            <div className="live-v3-person">
                              <b>
                                {s.name}
                                {s.earlyLearner && <small>Early learner</small>}
                              </b>
                              <span>
                                {s.subjects
                                  .map(
                                    (sub) =>
                                      sub +
                                      ' · ' +
                                      (op.students[s.id].subjects[sub as 'Math' | 'Reading']
                                        .format === 'Paper'
                                        ? 'PAPER'
                                        : 'CONNECT'),
                                  )
                                  .join(' / ')}
                              </span>
                              {preparation && (
                                <small className={'home-preparation-state ' + preparation.state}>
                                  {preparation.label}
                                </small>
                              )}
                            </div>
                            <div className="live-v3-time">
                              <b>
                                {here ? (
                                  <LiveElapsed value={v.arrivedAt} />
                                ) : v.closedAt && !v.departureVerified ? (
                                  'Departure unverified'
                                ) : duration === null ? (
                                  'Duration unverified'
                                ) : (
                                  Math.round(duration) + ' min'
                                )}
                              </b>
                              <span>
                                Arrived {time(v.arrivedAt, db.timezone)}
                                {v.departedAt ? ' · Left ' + time(v.departedAt, db.timezone) : ''}
                              </span>
                            </div>
                            <span className="handoff-state">
                              {v.handoff ? (
                                <>
                                  <Check size={18} />
                                  Handoff complete
                                </>
                              ) : here ? (
                                <>
                                  <Clock3 size={18} />
                                  Waiting for instructor
                                </>
                              ) : features.homework ? (
                                'No handoff recorded'
                              ) : (
                                'Activity not recorded'
                              )}
                            </span>
                          </button>
                        );
                      })}
                      {!home.rows.length && (
                        <Empty
                          title={
                            homeFilter ? 'No students match this view' : 'No students to show today'
                          }
                          text={
                            homeFilter
                              ? 'No students are in this group right now.'
                              : features.homework
                                ? 'Kiosk or Student Roster check-in records physical attendance. Instructor handoff is separate.'
                                : 'Record activities and observations in Quick View.'
                          }
                        />
                      )}
                    </div>
                  </section>
                </>
              )}
              {contentView === 'students' && (
                <RosterV3
                  db={db}
                  profile={profile}
                  attendance={attendance}
                  legacyAct={legacyAct}
                  busy={busy}
                  error={error}
                />
              )}
              {contentView === 'homework' && (
                <Preparation db={db} act={act} busy={busy} refresh={refresh} profile={profile} />
              )}
              {contentView === 'activity' && (
                <CenterActivity
                  db={db}
                  act={act}
                  busy={busy}
                  review={(id) => mutate({ kind: 'review', id })}
                  error={error}
                />
              )}
              {contentView === 'reports' && teacher && (
                <ReportsWorkspace db={db} profile={profile} />
              )}
            </>
          )}
        </main>
      </div>
      {activeView === 'settings' && (
        <Modal title="Settings" close={closeSettings} className="settings-dialog" dismissOnBackdrop>
          <V3Settings
            db={db}
            act={act}
            busy={busy}
            legacyAct={legacyAct}
            initialSection={settingsSection}
            error={error}
          />
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          {undo && (
            <button
              className="text-button"
              onClick={() =>
                void legacyAct({
                  action: 'visit-reconcile',
                  id: undo,
                  mode: 'reopen',
                  reason: 'Instructor undo of accidental checkout',
                })
              }
            >
              Undo checkout
            </button>
          )}
        </div>
      )}
      {visit && (
        <QuickView
          key={visit.id + '-' + features.version}
          openProfile={() => {
            setVisit(null);
            setError('');
            profile(visit.studentId);
          }}
          db={db}
          visit={visit}
          act={act}
          busy={busy}
          error={error}
          close={() => {
            setVisit(null);
            setError('');
          }}
        />
      )}
    </div>
  );
}
