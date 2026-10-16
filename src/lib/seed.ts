import { randomUUID } from 'node:crypto';
import type { Database } from './model';
export function seed(now = new Date()): Database {
  const first = [
    'Avery',
    'Milo',
    'Isla',
    'Theo',
    'Nora',
    'Leo',
    'Aria',
    'Finn',
    'Luna',
    'Owen',
    'Ivy',
    'Ezra',
    'Maya',
    'Jude',
    'Ella',
    'Kai',
  ];
  const last = [
    'Bennett',
    'Chen',
    'Rivera',
    'Park',
    'Ellis',
    'Morgan',
    'Reed',
    'Patel',
    'Brooks',
    'Hayes',
    'Lin',
    'Carter',
  ];
  const colors = ['lavender', 'peach', 'mint', 'blue', 'rose'];
  const students = Array.from({ length: 96 }, (_, i) => ({
    id: `demo-student-${i + 1}`,
    name: `${first[i % 16]} ${last[Math.floor(i / 16)]}`,
    initials: first[i % 16][0] + last[Math.floor(i / 16)][0],
    color: colors[i % 5],
    earlyLearner: i < 6 || i % 9 === 0,
    subjects: i % 3 === 0 ? ['Math', 'Reading'] : i % 2 === 0 ? ['Reading'] : ['Math'],
    level: i < 6 ? '4A' : ['3A', '2A', 'A', 'B', 'C', 'D'][i % 6],
    token: i === 0 ? 'CF-DEMO-AVERY-7K2Q' : `CF-DEMO-${randomUUID()}`,
  }));
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString();
  const visits = Array.from({ length: 42 }, (_, i) => ({
    id: randomUUID(),
    studentId: students[i].id,
    arrivedAt: ago(i < 12 ? 10 + i * 3 : 75 + (i - 12) * 4),
    departedAt: i < 12 ? null : ago(35 + (i - 12) * 3),
  }));
  const observations = [
    {
      student: 1,
      choices: ['Needed guidance', 'Review next assignment'],
      text: 'Try a shorter set and sit together for the first two examples.',
      followUp: true,
      age: 25,
    },
    {
      student: 4,
      choices: ['Parent conversation'],
      text: 'Share today’s progress at the next pickup.',
      followUp: true,
      age: 80,
    },
    {
      student: 16,
      choices: ['Corrections complete'],
      text: 'Confirm record book reflects the completed corrections.',
      followUp: false,
      age: 1440,
    },
    {
      student: 7,
      choices: ['Strong focus', 'Celebrated progress'],
      text: 'Worked through the whole reading set independently.',
      followUp: false,
      age: 12,
    },
  ].map((o) => ({
    id: randomUUID(),
    studentId: students[o.student].id,
    visitId: null,
    choices: o.choices,
    text: o.text,
    followUp: o.followUp,
    createdAt: ago(o.age),
    author: 'Alex Morgan',
    reviewedAt: null,
    reviewedBy: null,
  }));
  return {
    schemaVersion: 1,
    revision: 1,
    students,
    visits,
    observations,
    homework: students.slice(0, 18).map((s, i) => ({
      id: randomUUID(),
      studentId: s.id,
      description: `${s.subjects[0]} · ${s.level} ${101 + i * 10}–${110 + i * 10}`,
      status: i < 5 ? 'assigned' : i < 14 ? 'prepared' : 'handed-off',
      createdAt: ago(120),
      updatedAt: ago(30),
    })),
    audit: [],
  };
}
