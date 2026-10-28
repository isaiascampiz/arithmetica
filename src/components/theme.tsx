'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import { Popover } from './ui-primitives';
export type Appearance = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{ theme: Appearance; setTheme: (t: Appearance) => void }>({
  theme: 'dark',
  setTheme: () => {},
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, update] = useState<Appearance>('dark');
  useEffect(() => {
    const value = localStorage.getItem('cf-theme');
    if (value === 'light' || value === 'dark' || value === 'system') update(value);
  }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const root = document.documentElement;
      root.classList.add('theme-changing');
      root.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      void root.offsetHeight;
      requestAnimationFrame(() => root.classList.remove('theme-changing'));
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  function setTheme(value: Appearance) {
    localStorage.setItem('cf-theme', value);
    update(value);
  }
  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}
export const useTheme = () => useContext(ThemeContext);
export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const Icon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;
  return (
    <Popover
      label="Theme"
      className="theme-menu"
      trigger={
        compact ? (
          <Sun size={19} strokeWidth={1.6} />
        ) : (
          <>
            <Icon size={16} />
            <span>{theme[0].toUpperCase() + theme.slice(1)}</span>
            <ChevronDown size={15} />
          </>
        )
      }
      buttonClass={compact ? 'icon-button' : 'secondary theme-select'}
    >
      {(close) => (
        <div role="menu" aria-label="Theme">
          {(['light', 'dark', 'system'] as const).map((value) => {
            const ItemIcon = value === 'system' ? Monitor : value === 'light' ? Sun : Moon;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={theme === value}
                onClick={() => {
                  setTheme(value);
                  close();
                }}
              >
                <ItemIcon size={17} />
                <span>{value[0].toUpperCase() + value.slice(1)}</span>
                {theme === value && <Check size={16} />}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
