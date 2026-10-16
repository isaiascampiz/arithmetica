import type { Metadata, Viewport } from 'next';
import './globals.css';
import './v2.css';
import './v3.css';
import { Pwa } from '@/components/pwa';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Centerflow · Learning center',
  description: 'A calmer day at your learning center. Fictional operations demo.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Centerflow' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f5f6f8',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <Pwa />
      </body>
    </html>
  );
}
