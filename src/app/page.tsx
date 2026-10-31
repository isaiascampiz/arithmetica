import { redirect } from 'next/navigation';
import { staffSession } from '@/lib/auth';
import { StaffApp } from '@/components/workspace/staff-app';
import { cookies } from 'next/headers';
export const dynamic = 'force-dynamic';
export default async function Page() {
  try {
    await staffSession();
  } catch {
    if (process.env.DEMO_MODE === 'false' && (await cookies()).get('cf-refresh'))
      redirect('/api/session');
    redirect('/login');
  }
  return <StaffApp />;
}
