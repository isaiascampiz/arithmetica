'use client';
import { useEffect } from 'react';
export function Pwa() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const theme = localStorage.getItem('cf-theme');
    if (theme) document.documentElement.dataset.theme = theme;
  }, []);
  return null;
}
