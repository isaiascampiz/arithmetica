'use client';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { moveAttendanceDate, type AttendancePeriod } from '@/lib/center-attendance';
import { SearchField } from './list-controls';
export function WorkspacePeriodControls({
  period,
  date,
  today,
  query,
  searchLabel,
  dateLabel,
  changeDate,
  changePeriod,
  changeQuery,
  periodLabel = 'Activity period',
}: {
  period: AttendancePeriod;
  date: string;
  today: string;
  query: string;
  searchLabel: string;
  dateLabel: string;
  changeDate: (d: string) => void;
  changePeriod: (p: AttendancePeriod) => void;
  changeQuery: (q: string) => void;
  periodLabel?: string;
}) {
  const year = Number(date.slice(0, 4)),
    thisYear = Number(today.slice(0, 4)),
    maxYear = Math.max(thisYear + 1, year),
    minYear = Math.min(thisYear - 10, year);
  const current = period !== 'Monthly' && period !== 'Yearly' && date === today;
  const text = current
    ? 'Today'
    : new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        ...(period === 'Monthly'
          ? { month: 'long', year: 'numeric' }
          : { month: 'short', day: 'numeric', year: 'numeric' }),
      }).format(new Date(date + 'T12:00:00Z'));
  return (
    <>
      <div className="student-directory-toolbar period-workspace-toolbar">
        <SearchField
          label={searchLabel}
          placeholder="Find a student"
          value={query}
          onChange={changeQuery}
        />
        <div className="workspace-date-slot">
          <div className="workspace-date-controls">
            <button
              className="icon-button"
              aria-label={
                periodLabel === 'Report period' ? 'Previous report period' : 'Previous period'
              }
              onClick={() => changeDate(moveAttendanceDate(date, period, -1))}
            >
              <ChevronLeft size={17} />
            </button>
            {period === 'Yearly' ? (
              <label className="workspace-year-field">
                <select
                  aria-label={periodLabel === 'Report period' ? 'Report year' : 'Activity year'}
                  value={year}
                  onChange={(e) => changeDate(e.target.value + '-01-01')}
                >
                  {Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i).map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="workspace-date-field">
                <span aria-hidden="true">{text}</span>
                <CalendarDays size={16} aria-hidden="true" />
                <input
                  aria-label={dateLabel}
                  type={period === 'Monthly' ? 'month' : 'date'}
                  value={period === 'Monthly' ? date.slice(0, 7) : date}
                  onChange={(e) => {
                    if (e.target.value)
                      changeDate(period === 'Monthly' ? e.target.value + '-01' : e.target.value);
                  }}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {
                      /* Native input remains available. */
                    }
                  }}
                />
              </label>
            )}
            <button
              className="icon-button"
              aria-label={periodLabel === 'Report period' ? 'Next report period' : 'Next period'}
              onClick={() => changeDate(moveAttendanceDate(date, period, 1))}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="workspace-period-rail">
        <div className="segmented" aria-label={periodLabel}>
          {(['Daily', 'Weekly', 'Monthly', 'Yearly'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={p === period ? 'selected' : ''}
              aria-pressed={p === period}
              onClick={() => changePeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
