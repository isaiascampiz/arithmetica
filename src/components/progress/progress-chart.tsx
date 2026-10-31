'use client';
import { useLayoutEffect, useState, type RefObject } from 'react';

export function useProgressPlotWidth(ref: RefObject<HTMLDivElement | null>, active = true) {
  const [width, setWidth] = useState(400);
  useLayoutEffect(() => {
    const plot = ref.current;
    if (!plot || !active) return;
    const measure = () => setWidth(plot.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(plot);
    measure();
    return () => observer.disconnect();
  }, [ref, active]);
  return width;
}
