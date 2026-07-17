import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/lib/ui/theme';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'LaunchGuard — Deployment readiness scanner',
  description:
    'Scan Next.js and Node.js projects for deployment risks: committed secrets, missing env docs, unsafe dependencies, Docker and Prisma problems, and more.',
  applicationName: 'LaunchGuard',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b1020',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
