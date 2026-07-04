import { getPublicPages, getSettings } from '@/lib/api';
import { resolveTheme } from '@/lib/themes';

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, pages] = await Promise.all([getSettings(), getPublicPages()]);
  const theme = await resolveTheme(settings.activeTheme);
  const { Layout } = theme;
  return (
    <Layout settings={settings} pages={pages.items}>
      {children}
    </Layout>
  );
}
