'use client';
import { useEffect, useRef } from 'react';
/** Decorative only. The input, receipt and controls never move. */
export function ReceptionBackdrop({ state }: { state: 'idle' | 'in' | 'out' | 'recorded' }) {
  const plane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
      fine = matchMedia('(hover: hover) and (pointer: fine)');
    let frame = 0,
      x = 0,
      y = 0;
    const move = (e: PointerEvent) => {
      if (reduced.matches || !fine.matches) return;
      x = (e.clientX / innerWidth - 0.5) * 18;
      y = (e.clientY / innerHeight - 0.5) * 14;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (plane.current) plane.current.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      });
    };
    const reset = () => {
      if (plane.current) plane.current.style.transform = 'translate3d(0,0,0)';
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', reset);
    const preference = () => {
      if (reduced.matches) reset();
    };
    reduced.addEventListener('change', preference);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', reset);
      reduced.removeEventListener('change', preference);
    };
  }, []);
  return (
    <div className="reception-backdrop" data-state={state} aria-hidden="true">
      <div className="backdrop-plane" ref={plane}>
        <div className="reception-atmosphere" />
        {(state === 'in' || state === 'out') && (
          <div key={state} className="reception-confirmation-wave" />
        )}
        <svg
          className="reception-contours"
          viewBox="0 0 1400 1000"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <g className="contour-upper">
            <path d="M-160 670C100 720 310 490 300 250S460-10 690-100" />
            <path d="M-180 710C130 780 350 510 340 260S480 20 720-70" />
            <path d="M-200 750C170 840 390 530 380 270S500 50 750-40" />
          </g>
          <g className="contour-lower">
            <path d="M1510 280C1210 260 1150 450 1190 660S1030 1020 760 1080" />
            <path d="M1550 240C1170 180 1100 440 1150 670S990 1060 730 1120" />
            <path d="M1590 200C1130 100 1050 430 1110 680S950 1100 700 1160" />
          </g>
          <g className="contour-nodes">
            <circle cx="323" cy="429" r="4" />
            <circle cx="1139" cy="525" r="4" />
            <path d="M196 765h8v8h-8zM1218 228h8v8h-8z" />
          </g>
        </svg>
      </div>
    </div>
  );
}
