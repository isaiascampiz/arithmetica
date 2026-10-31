import { Login } from '@/components/auth/login';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <Login cloud={process.env.DEMO_MODE === 'false'} />;
}
