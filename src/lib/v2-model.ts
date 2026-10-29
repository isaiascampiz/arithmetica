export type Subject = 'Math' | 'Reading';
export type Format = 'Paper' | 'CONNECT' | 'Unspecified';
export type Range = { level: string; start: number; end: number };
export type SubjectSettings = {
  setupPending?: boolean;
  dailyWork?: { version: 1; worksheets: number; packetSheets: 10 };
  enrolled: boolean;
  format: Format;
  level: string;
  currentStart: number;
  currentEnd: number;
  nextStart: number;
  packetsPerDay: number;
  sheetsPerPacket: number;
  classworkSheets: number;
  excludeDays: number[];
  maxDays: number;
  maxSheets: number;
};
export type StudentSettings = {
  setupPending?: boolean;
  intake?: {
    version: 1;
    batchRequestId: string;
    sourceSha256: string;
    sourceRows: number[];
    subjectEnrollmentDates: Partial<Record<Subject, string>>;
  };
  grade?: string | null;
  enrollmentDate?: string | null;
  visitDays?: number[];
  awayUntil?: string | null;
  observationTiles?: string[];
  observationSkills?: { id: string; label: string }[];
  goals?: string;
  arrivalWindow?: string;
  version: number;
  active: boolean;
  familyId: string | null;
  recurringDays: number[];
  individualSchedule: boolean;
  expectedMinutes: number;
  expectedMinutesOverride?: boolean;
  subjects: Record<Subject, SubjectSettings>;
  updatedAt: string;
};
export type Family = { id: string; name: string; recurringDays: number[] };
export type ScheduleEvent = {
  id: string;
  studentId: string | null;
  familyId: string | null;
  kind: 'absence' | 'vacation' | 'extra-visit' | 'move-visit';
  start: string;
  end: string;
  returnDate: string | null;
  reason: string;
  createdAt: string;
  author: string;
  cancelledAt?: string;
};
export type Assistance = {
  id: string;
  studentId: string;
  reason: string;
  state: 'requested' | 'helping' | 'resolved';
  requestedAt: string;
  assignedTo: string | null;
  resolvedAt: string | null;
};
export type Correction = {
  id: string;
  studentId: string;
  subject: Subject;
  range: Range;
  remaining: number[];
  state: 'outstanding' | 'partial' | 'deferred' | 'complete';
  reason: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  events: { at: string; actor: string; state: string; remaining: number[]; reason: string }[];
};
export type Classwork = {
  id: string;
  studentId: string;
  subject: Subject;
  format?: Format;
  workedDate?: string;
  range: Range;
  completed: number[];
  createdAt: string;
  visitId: string | null;
  carriedAssignmentId: string | null;
  events?: { at: string; actor: string; completed: number[]; reason: string }[];
};
export const assignmentStatuses = [
  'decision-needed',
  'proposed',
  'approved',
  'ready',
  'pulled',
  'distributed',
  'returned',
  'partial',
  'verified',
  'corrections-outstanding',
  'repeated',
  'deferred',
] as const;
export type AssignmentStatus = (typeof assignmentStatuses)[number];
export type Assignment = {
  v3?: import('./v3-model').PaperSet;
  id: string;
  studentId: string;
  subject: Subject;
  format: Format;
  fromDate: string;
  nextVisit: string | null;
  homeworkDays: string[];
  ranges: Range[];
  carryRanges: Range[];
  carryIds: string[];
  targetPackets: number;
  targetSheets: number;
  newPackets: number;
  newSheets: number;
  status: AssignmentStatus;
  blocked: string[];
  capped: boolean;
  stale: boolean;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  legacyId?: string;
  events: {
    at: string;
    actor: string;
    status: AssignmentStatus;
    reason: string;
    snapshot?: {
      ranges: Range[];
      carryRanges: Range[];
      targetSheets: number;
      newSheets: number;
      nextVisit: string | null;
    };
  }[];
};
export type Completion = {
  packetId?: string;
  visitId?: string;
  supersedes?: string;
  id: string;
  assignmentId: string;
  studentId: string;
  subject: Subject;
  level: string;
  worksheets: number[];
  physicalSheets: number;
  format?: Format;
  completedDate?: string;
  officialCount: number | null;
  verifiedBy: string;
  at: string;
  active: boolean;
  reason: string;
};
export const dimensions = [
  'Focus',
  'Independence',
  'Accuracy',
  'Pace',
  'Understanding',
  'Progress',
  'Corrections',
] as const;
export type Dimension = (typeof dimensions)[number];
export type Rating = 'Not assessed' | 'Needs support' | 'Developing' | 'Secure';
export type Evaluation = {
  id: string;
  studentId: string;
  subject: Subject;
  ratings: Record<Dimension, Rating>;
  text: string;
  followUp: boolean;
  createdAt: string;
  author: string;
};
export type Decision = {
  id: string;
  studentId: string;
  subject: Subject;
  kind: 'continue' | 'repeat-range' | 'repeat-from' | 'advance' | 'review';
  range: Range;
  note: string;
  createdAt: string;
  author: string;
  approvedAt: string | null;
  approvedBy: string | null;
  supersededAt?: string;
};
export type Achievement = {
  id: string;
  studentId: string;
  subject: Subject;
  distinction: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  date: string;
  evidence: string;
  verifiedBy: string;
  createdAt: string;
};
export type StaffCoverage = {
  id: string;
  name: string;
  role: 'instructor' | 'grader';
  days: number[];
  start: string;
  end: string;
};
export type Appointment = {
  id: string;
  title: string;
  staffId: string;
  startsAt: string;
  minutes: number;
  status: 'scheduled' | 'cancelled';
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type CenterSettings = {
  version?: number;
  name: string;
  timezone: string;
  operatingDays: number[];
  closedDates: string[];
  closingTime: string;
  reportTime: string;
  autoClose: boolean;
  expectedMinutes: number;
  earlyPerInstructor: number;
  jobStartDate: string;
};
export type ReportPayload = {
  detail?: import('./report-detail').ReportDetail;
  visits: number;
  students: number;
  verifiedDepartures: number;
  unverifiedDepartures: string[];
  followUps: string[];
  pendingObservations: number;
  corrections: number;
  assignmentStatuses: Record<string, number>;
  physicalSheets: number;
  officialSheets: number;
  unreportableCompletions: number;
  nextDay: string | null;
  expectedNext: string[];
  preparation: string[];
  appointments: string[];
  staffingWarnings: string[];
  missing: string[];
  studentSummaries: {
    id: string;
    name: string;
    subject: Subject;
    level: string;
    range: string;
    levelAt?: string;
    levelSource?: string;
    attendance: number;
    physicalSheets: number;
    officialSheets: number;
    repeats: number;
    observations: number;
    returned: number;
    distributed: number;
  }[];
};
export type Report = {
  requestId?: string;
  requestKey?: string;
  id: string;
  kind: 'daily' | 'weekly' | 'monthly';
  period: string;
  version: number;
  generatedAt: string;
  sourceRevision: number;
  payload: ReportPayload;
  reason: string;
  jobKey?: string;
};
export type Operations = {
  v3?: import('./v3-model').V3Settings;
  students: Record<string, StudentSettings>;
  families: Family[];
  scheduleEvents: ScheduleEvent[];
  assistance: Assistance[];
  corrections: Correction[];
  classwork: Classwork[];
  assignments: Assignment[];
  completions: Completion[];
  evaluations: Evaluation[];
  decisions: Decision[];
  achievements: Achievement[];
  appointments: Appointment[];
  coverage: StaffCoverage[];
  center: CenterSettings;
  reports: Report[];
  processedRequests: string[];
  configHistory: {
    studentId: string;
    at: string;
    subjects: Record<Subject, SubjectSettings>;
    name?: string;
    settings?: StudentSettings;
  }[];
};

/** Read-only yearly views do not create a new archived report kind. */
export type ReportView = Omit<Report, 'kind'> & { kind: Report['kind'] | 'yearly' };
