'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
/** Native top-layer popovers dismiss on outside press/Escape and restore trigger focus. */
export function Popover({
  label,
  trigger,
  children,
  buttonClass = 'secondary',
  className = '',
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  buttonClass?: string;
  className?: string;
}) {
  const id = useId(),
    ref = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  function close() {
    const element = document.getElementById(id) as HTMLDivElement | null;
    element?.hidePopover();
    (element?.previousElementSibling as HTMLButtonElement | null)?.focus();
  }
  return (
    <span className={'popover-control ' + className}>
      <button
        ref={button}
        className={buttonClass}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
      >
        {trigger}
      </button>
      <div
        id={id}
        ref={ref}
        popover="auto"
        className="app-popover"
        onToggle={(e) => {
          const visible = e.newState === 'open';
          setOpen(visible);
          if (visible && button.current) {
            const rect = button.current.getBoundingClientRect(),
              element = e.currentTarget;
            element.style.top =
              Math.min(rect.bottom + 6, innerHeight - element.offsetHeight - 12) + 'px';
            element.style.left =
              Math.max(12, Math.min(rect.left, innerWidth - element.offsetWidth - 12)) + 'px';
            element.querySelector<HTMLElement>('button, input, a')?.focus();
          }
        }}
        onKeyDown={(e) => {
          if (
            !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) ||
            ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
          )
            return;
          const items = [
            ...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'),
          ];
          if (!items.length) return;
          e.preventDefault();
          const index = items.indexOf(document.activeElement as HTMLElement);
          items[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? items.length - 1
                : (index + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
          ].focus();
        }}
      >
        {children(close)}
      </div>
    </span>
  );
}
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId(),
    [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    tip = useRef<HTMLSpanElement>(null),
    fromPointer = useRef(false),
    hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 280 });
  function cancelHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }
  function show() {
    const anchor = trigger.current;
    if (!anchor) return;
    cancelHide();
    const rect = anchor.getBoundingClientRect(),
      width = Math.min(280, innerWidth - 24);
    const left = Math.max(
      12,
      Math.min(rect.left + rect.width / 2 - width / 2, innerWidth - width - 12),
    );
    setPosition({ left, top: rect.bottom + 8, width });
    setOpen(true);
    requestAnimationFrame(() => {
      const height = tip.current?.getBoundingClientRect().height || 0;
      setPosition({
        left,
        width,
        top:
          rect.bottom + 8 + height <= innerHeight - 12
            ? rect.bottom + 8
            : Math.max(12, rect.top - height - 8),
      });
    });
  }
  return (
    <span
      className="info-tip"
      data-open={open || undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') show();
      }}
      onPointerLeave={() => {
        if (!trigger.current?.matches(':focus-visible'))
          hideTimer.current = setTimeout(() => setOpen(false), 120);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="info-trigger"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onPointerDown={() => {
          fromPointer.current = true;
        }}
        onFocus={() => {
          if (!fromPointer.current) show();
        }}
        onClick={() => {
          fromPointer.current = false;
          if (open) setOpen(false);
          else show();
        }}
        onBlur={() => {
          fromPointer.current = false;
          cancelHide();
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <Info size={15} strokeWidth={1.6} />
      </button>
      <span ref={tip} id={id} role="tooltip" style={position} onPointerEnter={cancelHide}>
        {children}
      </span>
    </span>
  );
}
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="app-switch"
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function SettingRow({
  label,
  detail,
  children,
}: {
  label: ReactNode;
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <span className="setting-label">{label}</span>
        {detail && <span className="setting-detail">{detail}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
