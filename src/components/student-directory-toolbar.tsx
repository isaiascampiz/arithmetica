'use client';
import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { RosterFilter } from '@/lib/v3-analytics';
import { directoryFilters, directorySortOptions } from '@/lib/student-directory';
import { SearchField, SortMenu } from './list-controls';
import { SettingRow, Switch } from './ui-primitives';
import { Modal } from './v3-shared';

export function StudentDirectoryToolbar({
  filter,
  onFilter,
  sort,
  onSort,
  searchLabel,
  action,
}: {
  filter: RosterFilter;
  onFilter: (f: RosterFilter) => void;
  sort: string;
  onSort: (s: string) => void;
  searchLabel: string;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(filter);
  const active =
    filter.subject !== 'All' || filter.format !== 'All' || filter.early || filter.days.length > 0;
  return (
    <>
      <div className="student-directory-toolbar">
        <SearchField
          label={searchLabel}
          placeholder="Find a student"
          value={filter.query}
          onChange={(query) => onFilter({ ...filter, query })}
        />
        <SortMenu value={sort} onChange={onSort} options={directorySortOptions} />
        <button
          className="secondary directory-filter-button"
          aria-label={active ? 'Filters (active)' : 'Filters'}
          aria-expanded={open}
          onClick={() => {
            setDraft(structuredClone(filter));
            setOpen(true);
          }}
        >
          <SlidersHorizontal size={17} />
          Filters{active && <i className="filter-active-dot" aria-hidden="true" />}
        </button>
        <div className="directory-action">{action}</div>
      </div>
      {open && (
        <Modal
          variant="form"
          title="Filter students"
          className="roster-filter-dialog"
          close={() => setOpen(false)}
          dismissOnBackdrop
        >
          <form
            aria-label="Roster filters"
            className="roster-v3-filters"
            onSubmit={(e) => {
              e.preventDefault();
              onFilter({ ...draft, query: filter.query });
              setOpen(false);
            }}
          >
            <div className="roster-student-group">
              <SettingRow label="Early learner">
                <Switch
                  label="Early learner"
                  checked={draft.early}
                  onChange={(early) => setDraft({ ...draft, early })}
                />
              </SettingRow>
            </div>
            <div className="roster-filter-fields">
              <label>
                Subject
                <select
                  aria-label="Subject"
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                >
                  <option value="All">All subjects</option>
                  <option>Math</option>
                  <option>Reading</option>
                </select>
              </label>
              <label>
                Format
                <select
                  aria-label="Format"
                  value={draft.format}
                  onChange={(e) => setDraft({ ...draft, format: e.target.value })}
                >
                  <option value="All">All formats</option>
                  <option value="Paper">PAPER</option>
                  <option value="CONNECT">Kumon CONNECT</option>
                </select>
              </label>
            </div>
            <div className="roster-filter-options">
              <fieldset className="roster-visit-days">
                <legend>Visit weekdays</legend>
                <div className="day-options">
                  {['Mon', 'Tue', 'Wed', 'Thu'].map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      aria-label={day}
                      aria-pressed={draft.days.includes(i + 1)}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          days: draft.days.includes(i + 1)
                            ? draft.days.filter((n) => n !== i + 1)
                            : [...draft.days, i + 1],
                        })
                      }
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="roster-filter-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  const clear = { ...directoryFilters, query: filter.query };
                  setDraft(clear);
                  onFilter(clear);
                }}
              >
                Clear
              </button>
              <button className="primary" type="submit">
                Apply
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
