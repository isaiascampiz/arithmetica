import Image from 'next/image';
import QRCode from 'qrcode';
import { notFound, redirect } from 'next/navigation';
import { staffSession } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { centerName } from '@/lib/brand';
import { PrintButton } from '@/components/pouch/print-button';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  try {
    await staffSession();
  } catch {
    redirect('/login');
  }
  const { id } = await params,
    db = await repository.read(),
    student = db.students.find((s) => s.id === id);
  if (!student) notFound();
  const qr = await QRCode.toDataURL(student.token, {
    width: 440,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  return (
    <main className="pouch-print-page">
      <div className="pouch-print-tools">
        <h1>Pouch label</h1>
        <p>2 × 2 inches · print at 100% scale</p>
        <PrintButton />
      </div>
      <article className="pouch-print-label">
        <Image src={qr} alt={'Pouch QR for ' + student.name} width={140} height={140} unoptimized />
        <strong>{student.name}</strong>
        <span>{centerName(db.operations!.center.name)}</span>
      </article>
    </main>
  );
}
