import { FrontAdminBar } from '@/components/admin/admin-bar';
import { getPluginChrome, getPublicPages, getSettings } from '@/lib/api';
import { resolveTheme } from '@/lib/themes';

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, pages, pluginChrome] = await Promise.all([
    getSettings(),
    getPublicPages(),
    getPluginChrome(),
  ]);
  const theme = await resolveTheme(settings.activeTheme);
  const { Layout } = theme;
  return (
    <>
      <FrontAdminBar />
      <Layout settings={{ ...settings, pluginChrome }} pages={pages.items}>
        {children}
      </Layout>
    </>
  );
}
