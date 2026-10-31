import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { APP_DESCRIPTION, APP_NAME } from '@/lib/brand';
import './globals.css';
import './v2.css';
import './v3.css';
import './identity.css';
import './refinement.css';
import './iteration.css';
import './workspace-refinement.css';
import { Pwa } from '@/components/ui/pwa';
import { ThemeProvider } from '@/components/ui/theme';
const interfaceFont = localFont({
  src: '../../public/fonts/figtree-variable.ttf',
  variable: '--font-interface',
  display: 'swap',
  weight: '300 900',
});
const editorialFont = localFont({
  src: '../../public/fonts/eb-garamond-variable.ttf',
  variable: '--font-editorial',
  display: 'swap',
  weight: '400 800',
});
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: `${APP_NAME} · Learning center`,
  description: APP_DESCRIPTION,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: APP_NAME,
  },
  icons: { icon: '/icon.svg?v=7', apple: '/icon-192.png?v=7' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1a1a1a',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${interfaceFont.variable} ${editorialFont.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Pwa />
      </body>
    </html>
  );
}
