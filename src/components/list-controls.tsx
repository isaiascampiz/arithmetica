'use client';
import { ArrowDownUp, Check, ChevronDown, Search } from 'lucide-react';
import { Popover } from './ui-primitives';
export function SearchField({
  label,
  placeholder = 'Search',
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="list-search">
      <Search size={17} strokeWidth={1.6} aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function SortMenu({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Popover
      label="Sort by"
      trigger={
        <>
          <ArrowDownUp size={17} />
          <span>Sort by</span>
          <ChevronDown size={15} />
        </>
      }
      buttonClass="secondary list-sort-button"
    >
      {(close) => (
        <div role="menu" aria-label="Sort by">
          <p className="menu-caption">Sort by</p>
          {options.map((option) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                close();
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
