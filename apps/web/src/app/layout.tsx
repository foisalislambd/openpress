import type { Metadata } from 'next';
import './globals.css';
import { getSettings } from '@/lib/api';

function isRtl(locale: string) {
  const base = locale.toLowerCase().split('-')[0];
  return base === 'ar' || base === 'he' || base === 'fa' || base === 'ur';
}

function safeCss(css: unknown) {
  return String(css ?? '')
    .replace(/<\/style/gi, '')
    .replace(/@import[^;]+;?/gi, '')
    .slice(0, 20000);
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: { default: settings.siteTitle, template: `%s | ${settings.siteTitle}` },
    description: settings.siteDescription,
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
        { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
        { url: '/icon.png', type: 'image/png', sizes: '192x192' },
        { url: '/openpress-icon-512.png', type: 'image/png', sizes: '512x512' },
        { url: '/openpress-icon.svg', type: 'image/svg+xml' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    },
    alternates: { types: { 'application/rss+xml': '/feed' } },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSettings();
  const locale = String(settings.siteLanguage ?? 'en');
  const mods = (settings.themeMods ?? {}) as { accent?: string };
  const css = [
    mods.accent ? `:root { --op-accent: ${String(mods.accent).replace(/[^#a-zA-Z0-9(),.%\s-]/g, '')}; }` : '',
    safeCss(settings.additionalCss),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <body className="antialiased">
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
        {children}
      </body>
    </html>
  );
}
