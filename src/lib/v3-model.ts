import type { Range, Subject } from './v2-model';
export type Activity = 'Worksheets' | 'Corrections only' | 'Both';
export type SessionRecord = {
  mode?: 'activity-only';
  subject: Subject;
  at: string;
  actor: string;
  activity: Activity;
  format: 'Paper' | 'CONNECT' | 'Unspecified';
  incoming: {
    packet: Packet;
    outcome: 'assumed completed' | 'finished' | 'unfinished' | 'missing';
  }[];
  center: Packet | null;
  outgoing: Packet[];
  reason: string;
};
export type Packet = {
  id: string;
  range: Range;
  sourceAssignmentId: string;
  purpose: 'in-center' | 'homework';
  prepared: boolean;
  status: 'planned' | 'issued' | 'held' | 'finished' | 'unfinished' | 'missing' | 'routine';
};
export type PaperSet = {
  visitDate: string;
  inCenter: Packet | null;
  inCenterReturns?: Packet[];
  planned: Packet[];
  issued: Packet[];
  held: Packet[];
  version: number;
  review: string[];
  adjustment: string[];
  originalCursor: { level: string; start: number };
  advanceCursor: { level: string; start: number };
  preparedAt: string | null;
  preparedBy: string | null;
  issuedAt: string | null;
  visitId: string | null;
  reconciliations: {
    packetId: string;
    state: 'finished' | 'unfinished' | 'missing';
    visitId: string;
    at: string;
    actor: string;
  }[];
  temporaryPaper?: boolean;
};
export type Handoff = {
  mode?: 'activity-only';
  at: string;
  actor: string;
  activities: Partial<Record<Subject, Activity>>;
  assignmentIds: string[];
  incoming: 'routine-no-exception' | 'exception' | 'unknown';
  events: { at: string; actor: string; reason: string }[];
};
export type CatalogLevel = {
  subject: Subject;
  id: string;
  order: number;
  first: number;
  last: number | null;
  approved: boolean;
  source: string;
};
export type V3Settings = {
  dataMode?: 'production';
  rosterImports?: Record<
    string,
    {
      fingerprint: string;
      sourceSha256: string;
      studentIds: string[];
      at: string;
      actor: string;
    }
  >;
  staffProfiles?: Record<string, StaffProfile>;
  accountRequests?: Record<string, { fingerprint: string; owner: string }>;
  receptionReceipts?: Record<
    string,
    {
      fingerprint: string;
      result: { message: string; changed: boolean; direction?: 'in' | 'out'; studentName?: string };
    }
  >;
  kiosk?: { version: number; confirmationSeconds: number };
  activityHours?: { version: number; days: import('./activity-settings').ActivityHours };
  features?: { homework: boolean; medals: boolean; version: number };
  catalog: CatalogLevel[];
  instructorTiles: Record<string, string[]>;
  migratedAt: string;
};
export type StaffProfile = {
  version: number;
  firstName: string;
  lastName: string;
  picture: string;
  disabledAt?: string;
};
