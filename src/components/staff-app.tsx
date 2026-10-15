'use client';
/* eslint-disable @next/next/no-location-assign-relative-destination -- Authentication changes discard private client state. */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Home,
  Users,
  BarChart3,
  Download,
  QrCode,
  Settings,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  Check,
  Clock3,
} from 'lucide-react';
import { dayKey, isOpenVisit, type Snapshot, type Student } from '@/lib/model';
import type { Command } from '@/lib/domain';
import type { V2Command } from '@/lib/v2-domain';
import type { V3Command } from '@/lib/v3-domain';
import { expectedOn } from '@/lib/schedule';
import { dailyRoster } from '@/lib/v3-planning';
import { measuredMinutes } from '@/lib/v3-analytics';
import { request } from '@/lib/client';
import { Avatar, Empty, time, elapsed } from './shared-ui';
import { QuickView } from './v3-quick-view';
import { Preparation } from './v3-preparation';
import { RosterV3 } from './v3-roster';
import { StudentProfileV3 } from './v3-profile';
import { CenterActivity } from './v3-charts';
import { V3Settings } from './v3-settings';
import { CenterSettings, ReportsWorkspace } from './calendar-reports';
type View = 'home' | 'students' | 'homework' | 'activity' | 'reports' | 'settings';
type Mutation = Command | { kind: 'v2'; command: V2Command } | { kind: 'v3'; command: V3Command };
const nav = [
  { id: 'home' as View, label: 'Home', icon: Home },
  { id: 'students' as View, label: 'Student Roster', icon: Users },
  { id: 'homework' as View, label: 'Homework Preparation', icon: BookOpen },
  { id: 'activity' as View, label: 'Center Activity', icon: BarChart3 },
  { id: 'reports' as View, label: 'Reports', icon: Download },
];
export function StaffApp() {
  const [db, setDb] = useState<Snapshot | null>(null),
    [view, setView] = useState<View>('home'),
    [profileId, setProfile] = useState<string | null>(null),
    [visitId, setVisit] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [online, setOnline] = useState(true),
    [collapsed, setCollapsed] = useState(false),
    [menu, setMenu] = useState(false),
    [theme, setTheme] = useState('light'),
    [now, setNow] = useState(new Date()),
    [undo, setUndo] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());
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
    const poll = setInterval(() => void refresh(), 7000),
      clock = setInterval(() => setNow(new Date()), 1000);
    setCollapsed(localStorage.getItem('cf-sidebar') === 'collapsed');
    setTheme(localStorage.getItem('cf-theme') || 'light');
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
      clearInterval(clock);
      window.removeEventListener('popstate', read);
    };
  }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      setToast('');
      setUndo(null);
    }, 7000);
    return () => clearTimeout(t);
  }, [toast]);
  function navigate(v: View) {
    setView(v);
    setProfile(null);
    setVisit(null);
    setMenu(false);
    setError('');
    history.pushState(null, '', '/?view=' + v);
  }
  function profile(id: string) {
    setProfile(id);
    setView('students');
    setMenu(false);
    history.pushState(null, '', '/?view=students&student=' + encodeURIComponent(id));
  }
  async function mutate(c: Mutation) {
    const key = JSON.stringify(c),
      requestId = requestIds.current.get(key) || crypto.randomUUID();
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
    setBusy(true);
    try {
      await request('/api/kiosk', 'PUT');
      location.assign('/kiosk');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function toggleSidebar() {
    setCollapsed((v) => {
      localStorage.setItem('cf-sidebar', v ? 'expanded' : 'collapsed');
      return !v;
    });
  }
  function toggleTheme() {
    const t = theme === 'light' ? 'dark' : 'light';
    setTheme(t);
    localStorage.setItem('cf-theme', t);
  }
  if (!db?.operations?.v3)
    return (
      <main className="loading">
        <span className="brand-icon">
          <BookOpen />
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
  const op = db.operations,
    teacher = db.staff.role !== 'assistant',
    today = dayKey(now, db.timezone),
    active = db.visits.filter(isOpenVisit),
    roster = dailyRoster(db, today),
    student = profileId ? db.students.find((s) => s.id === profileId) : undefined,
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
    : view === 'home'
      ? 'Your center, right now.'
      : view === 'students'
        ? 'Student Roster'
        : view === 'homework'
          ? 'Homework Preparation'
          : view === 'activity'
            ? 'Center Activity'
            : view === 'reports'
              ? 'A clear record of the work.'
              : 'Settings & access';
  return (
    <div className={'app-shell v2-shell v3-shell ' + (collapsed ? 'side-collapsed' : '')}>
      <aside className={'sidebar v2-sidebar ' + (menu ? 'open' : '')}>
        <div className="sidebar-brand">
          <Link
            href="/"
            aria-label="Centerflow home"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              navigate('home');
            }}
          >
            <span className="brand-icon">
              <BookOpen size={23} />
            </span>
            <span className="brand-word">centerflow.</span>
          </Link>
          <button
            className="icon-button collapse-control"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleSidebar}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <div className="center-switch">
          <div>
            <b>{op.center.name}</b>
            <span>Operations workspace · V3.0</span>
          </div>
        </div>
        <nav>
          {nav
            .filter((n) => teacher || n.id !== 'reports')
            .map((n) => (
              <button
                className={'nav-item ' + (view === n.id && !student ? 'active' : '')}
                title={n.label}
                key={n.id}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={19} />
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
            className={'nav-item ' + (view === 'settings' ? 'active' : '')}
            title="Settings & access"
            onClick={() => navigate('settings')}
          >
            <Settings size={19} />
            <span>Settings & access</span>
          </button>
          <div className="staff-profile">
            <span className="staff-avatar">
              {db.staff.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
            <div>
              <b>{db.staff.name}</b>
              <span>{db.staff.role}</span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await request('/api/auth', 'DELETE');
                location.assign('/login');
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
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
        <header className="topbar v2-topbar">
          <div className="header-location">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <b>
              {student ? 'Student profile' : nav.find((n) => n.id === view)?.label || 'Settings'}
            </b>
            <span>
              {new Intl.DateTimeFormat('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: db.timezone,
              }).format(now)}
            </span>
          </div>
          <div className="topbar-right">
            <span className={'connection ' + (!online ? 'disconnected' : '')}>
              <span className="live-dot" />
              {busy ? 'Saving…' : online ? 'Synced' : 'Offline · data may be stale'}
            </span>
            <button className="icon-button" aria-label="Toggle color theme" onClick={toggleTheme}>
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
          </div>
        </header>
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
              {view === 'home' && (
                <>
                  <div className="home-v3-metrics">
                    <div>
                      <span>Expected today</span>
                      <b>{db.students.filter((s) => expectedOn(op, s.id, today)).length}</b>
                    </div>
                    <div>
                      <span>Here now</span>
                      <b>{active.length}</b>
                    </div>
                    <div>
                      <span>Early learners here</span>
                      <b>
                        {
                          active.filter(
                            (v) => db.students.find((s) => s.id === v.studentId)?.earlyLearner,
                          ).length
                        }
                      </b>
                    </div>
                  </div>
                  <section className="panel live-v3">
                    <header>
                      <h2>Today’s students</h2>
                      <span>Waiting students first · tap for Quick View</span>
                    </header>
                    <div className="live-v3-list">
                      {roster.map((v) => {
                        const s = db.students.find((s) => s.id === v.studentId)!,
                          here = isOpenVisit(v),
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
                            </div>
                            <div className="live-v3-time">
                              <b>
                                {here
                                  ? elapsed(v.arrivedAt)
                                  : v.closedAt && !v.departureVerified
                                    ? 'Departure unverified'
                                    : duration === null
                                      ? 'Duration unverified'
                                      : Math.round(duration) + ' min'}
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
                              ) : (
                                'No handoff recorded'
                              )}
                            </span>
                          </button>
                        );
                      })}
                      {!roster.length && (
                        <Empty
                          title="No visits yet today"
                          text="Kiosk or Student Roster check-in records physical attendance. Instructor handoff is separate."
                        />
                      )}
                    </div>
                  </section>
                </>
              )}
              {view === 'students' && (
                <RosterV3
                  db={db}
                  profile={profile}
                  attendance={attendance}
                  legacyAct={legacyAct}
                  busy={busy}
                  error={error}
                />
              )}
              {view === 'homework' && <Preparation db={db} act={act} busy={busy} />}
              {view === 'activity' && <CenterActivity db={db} />}
              {view === 'reports' && teacher && <ReportsWorkspace db={db} refresh={refresh} />}
              {view === 'settings' && (
                <>
                  {teacher && <V3Settings db={db} act={act} busy={busy} />}
                  <CenterSettings db={db} act={legacyAct} busy={busy} />
                </>
              )}
            </>
          )}
        </main>
      </div>
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
