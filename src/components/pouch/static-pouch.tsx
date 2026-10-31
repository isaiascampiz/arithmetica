'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import type { Snapshot, Student } from '@/lib/model';
import { request } from '@/lib/client';
import { centerName } from '@/lib/brand';
import { PrintButton } from './print-button';

/** Public static shell; label contents are fetched only through the staff-authorized API. */
export function StaticPouch() {
  const [label, setLabel] = useState<{
    student: Student;
    qr: string;
    center: string;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    window.addEventListener('pageshow', restored);
    const id = location.pathname.match(/^\/students\/([^/]+)\/pouch\/?$/)?.[1];
    if (!id) {
      setError('Pouch label not found.');
      return () => window.removeEventListener('pageshow', restored);
    }
    void request<Snapshot>('/api/state')
      .then(async (db) => {
        const student = db.students.find((item) => item.id === decodeURIComponent(id));
        if (!student) throw new Error('Student not found.');
        const qr = await QRCode.toDataURL(student.token, {
          width: 440,
          margin: 4,
          errorCorrectionLevel: 'M',
        });
        if (active)
          setLabel({
            student,
            qr,
            center: centerName(db.operations!.center.name),
          });
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
      window.removeEventListener('pageshow', restored);
    };
  }, []);
  if (!label)
    return (
      <main className="pouch-print-page">
        <p role={error ? 'alert' : 'status'}>{error || 'Loading pouch label…'}</p>
      </main>
    );
  return (
    <main className="pouch-print-page">
      <div className="pouch-print-tools">
        <h1>Pouch label</h1>
        <p>2 × 2 inches · print at 100% scale</p>
        <PrintButton />
      </div>
      <article className="pouch-print-label">
        <Image
          src={label.qr}
          alt={'Pouch QR for ' + label.student.name}
          width={140}
          height={140}
          unoptimized
        />
        <strong>{label.student.name}</strong>
        <span>{label.center}</span>
      </article>
    </main>
  );
}
