import type { Metadata } from 'next';
import './globals.css';
import { getSettings } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: { default: settings.siteTitle, template: `%s | ${settings.siteTitle}` },
    description: settings.siteDescription,
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
