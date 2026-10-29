import type { Database } from './model';
import type { Subject, SubjectSettings, StudentSettings } from './v2-model';

export function pendingSubject(level = '', enrolled = false): SubjectSettings {
  return {
    enrolled,
    setupPending: true,
    format: 'Unspecified',
    level,
    currentStart: 0,
    currentEnd: 0,
    nextStart: 0,
    packetsPerDay: 0,
    sheetsPerPacket: 10,
    classworkSheets: 0,
    excludeDays: [],
    maxDays: 14,
    maxSheets: 200,
  };
}

export function pendingStudentSettings(expectedMinutes: number, now: Date): StudentSettings {
  return {
    setupPending: true,
    grade: null,
    version: 1,
    active: true,
    familyId: null,
    recurringDays: [],
    visitDays: [],
    individualSchedule: true,
    expectedMinutes,
    expectedMinutesOverride: false,
    enrollmentDate: null,
    awayUntil: null,
    observationTiles: [],
    goals: '',
    arrivalWindow: '',
    subjects: { Math: pendingSubject(), Reading: pendingSubject() },
    updatedAt: now.toISOString(),
  };
}

export function subjectNeedsSetup(settings: SubjectSettings) {
  return settings.setupPending === true || settings.format === 'Unspecified';
}

export function validateStudentSetup(db: Database) {
  for (const student of db.students) {
    const settings = db.operations?.students[student.id];
    if (!settings) continue; // Older schema validation/migration handles legacy settings.
    if (settings.setupPending !== undefined && typeof settings.setupPending !== 'boolean')
      throw new Error('Invalid student setup state; records will not be reset.');
    if (
      settings.intake &&
      (settings.intake.version !== 1 ||
        !/^[a-f0-9]{64}$/.test(settings.intake.sourceSha256) ||
        !settings.intake.batchRequestId ||
        !Array.isArray(settings.intake.sourceRows) ||
        settings.intake.sourceRows.some((row) => !Number.isInteger(row) || row < 2))
    )
      throw new Error('Invalid student intake metadata; records will not be reset.');
    for (const subject of ['Math', 'Reading'] as Subject[]) {
      const config = settings.subjects[subject];
      if (config.setupPending !== undefined && typeof config.setupPending !== 'boolean')
        throw new Error('Invalid subject setup state; records will not be reset.');
      if (
        !['Paper', 'CONNECT', 'Unspecified'].includes(config.format) ||
        (config.format === 'Unspecified' && config.setupPending !== true)
      )
        throw new Error('Invalid subject modality; records will not be reset.');
      const positions = [
        config.currentStart,
        config.currentEnd,
        config.nextStart,
        config.classworkSheets,
      ];
      if (
        positions.some((value) => !Number.isInteger(value) || value < 0) ||
        (!subjectNeedsSetup(config) &&
          (!config.level || (config.format === 'Paper' && positions.some((value) => value < 1))))
      )
        throw new Error('Invalid subject position or incomplete setup; records will not be reset.');
    }
  }
}
