import { CheckCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Student } from '@/lib/model';
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
export function Avatar({ student }: { student: Student }) {
  return <span className={`avatar ${student.color}`}>{student.initials}</span>;
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <CheckCheck size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function time(value: string, tz: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(value));
}
export function date(value: string, tz: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: tz }).format(
    new Date(value),
  );
}
export function elapsed(value: string) {
  const n = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n} min`;
}
