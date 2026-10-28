import { redirect } from 'next/navigation';
import { staffSession } from '@/lib/auth';
import { Kiosk } from '@/components/kiosk';
export default async function Page() {
  try {
    await staffSession();
  } catch {
    redirect('/login');
  }
  return <Kiosk staffPreview />;
}
