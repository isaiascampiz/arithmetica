export type Role = 'owner' | 'instructor' | 'assistant';
export type Staff = {
  name: string;
  role: Role;
  id?: string;
  email?: string;
  displayName?: string;
  picture?: string;
};
export type Student = {
  firstName?: string;
  lastName?: string;
  id: string;
  name: string;
  initials: string;
  color: string;
  earlyLearner: boolean;
  subjects: string[];
  level: string;
  token: string;
};
export type Visit = {
  id: string;
  studentId: string;
  arrivedAt: string;
  departedAt: string | null;
  closedAt?: string;
  departureVerified?: boolean;
  closureReason?: string;
  events?: { at: string; kind: string; actor: string; reason?: string; value?: string }[];
  handoff?: import('./v3-model').Handoff;
  subjectCheckIns?: Partial<Record<import('./v2-model').Subject, import('./v3-model').Handoff>>;
  sessionRecords?: import('./v3-model').SessionRecord[];
};
export type Observation = {
  context?: 'additional';
  inputMethod?: 'dictation';
  id: string;
  studentId: string;
  visitId: string | null;
  choices: string[];
  skillRatings?: { id: string; label: string; score: number }[];
  revisions?: {
    at: string;
    actor: string;
    text: string;
    skillRatings: { id: string; label: string; score: number }[];
  }[];
  text: string;
  followUp: boolean;
  createdAt: string;
  author: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  subject?: 'Math' | 'Reading' | null;
};
export type Homework = {
  id: string;
  studentId: string;
  description: string;
  status: 'assigned' | 'prepared' | 'handed-off';
  createdAt: string;
  updatedAt: string;
};
export type Audit = { id: string; action: string; actor: string; at: string; entityId: string };
export type Database = {
  schemaVersion: 1 | 2 | 3;
  revision: number;
  students: Student[];
  visits: Visit[];
  observations: Observation[];
  homework: Homework[];
  audit: Audit[];
  operations?: import('./v2-model').Operations;
};
export type Snapshot = Database & {
  staff: Staff;
  timezone: string;
  runtime?: {
    demo: boolean;
    adapter: string;
    scheduler: boolean;
    environment?: string;
    dictationApproved?: boolean;
  };
};
export const choices = [
  'Worked independently',
  'Needed guidance',
  'Strong focus',
  'Needed refocusing',
  'Corrections complete',
  'Review next assignment',
  'Parent conversation',
  'Celebrated progress',
] as const;
// Cache formatters, never records or formatted dates. Bound the cache because
// the timezone can be supplied by center configuration or a caller.
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
export function dayKey(value: string | Date, timezone = 'America/Los_Angeles') {
  let formatter = dayFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    if (dayFormatters.size >= 16) dayFormatters.delete(dayFormatters.keys().next().value!);
    dayFormatters.set(timezone, formatter);
  }
  return formatter.format(new Date(value));
}
export function metrics(db: Database, now = new Date(), timezone = 'America/Los_Angeles') {
  const date = dayKey(now, timezone);
  const today = db.visits.filter((v) => dayKey(v.arrivedAt, timezone) === date);
  const active = db.visits.filter(isOpenVisit);
  return {
    active: active.length,
    early: active.filter((v) => db.students.find((s) => s.id === v.studentId)?.earlyLearner).length,
    today: today.length,
    pending: db.observations.filter((o) => !o.reviewedAt).length,
    enrolled: db.students.length,
  };
}
export function isOpenVisit(v: Visit) {
  return !v.departedAt && !v.closedAt;
}
export function arrivalHistogram(visits: Visit[], timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: timezone,
  });
  const hours = visits.map((v) => Number(formatter.format(new Date(v.arrivedAt))));
  const earliest = hours.length ? Math.min(...hours) : 13;
  const latest = hours.length ? Math.max(...hours) : 18;
  const step = Math.max(1, Math.ceil((latest - earliest + 1) / 6));
  const start = Math.max(0, Math.min(earliest, 24 - step * 6));
  return Array.from({ length: 6 }, (_, i) => {
    const h = start + i * step;
    return {
      label: `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`,
      count: hours.filter((hour) => hour >= h && hour < h + step).length,
    };
  });
}
