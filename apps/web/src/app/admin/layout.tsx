'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@openpress/shared';
import { api, clearTokens, getToken } from '@/lib/client-api';
import { cn } from '@/components/ui';

const NAV = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/posts', label: 'Posts' },
  { href: '/admin/pages', label: 'Pages' },
  { href: '/admin/media', label: 'Media' },
  { href: '/admin/taxonomy', label: 'Categories & Tags' },
  { href: '/admin/comments', label: 'Comments' },
  { href: '/admin/users', label: 'Users', adminOnly: true },
  { href: '/admin/themes', label: 'Themes', adminOnly: true },
  { href: '/admin/plugins', label: 'Plugins', adminOnly: true },
  { href: '/admin/settings', label: 'Settings', adminOnly: true },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const isLogin = pathname === '/admin/login';

  useEffect(() => {
    if (isLogin) {
      setChecked(true);
      return;
    }
    if (!getToken()) {
      router.replace('/admin/login');
      return;
    }
    api<User>('/auth/me')
      .then((u) => {
        setUser(u);
        setChecked(true);
      })
      .catch(() => {
        clearTokens();
        router.replace('/admin/login');
      });
  }, [isLogin, pathname, router]);

  if (isLogin) return <>{children}</>;
  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <Link href="/admin" className="text-lg font-extrabold tracking-tight">
            Open<span className="text-indigo-600">Press</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.filter((n) => !n.adminOnly || user?.role === 'ADMIN').map(
            (item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-zinc-600 hover:bg-zinc-100',
                  )}
                >
                  {item.label}
                </Link>
              );
            },
          )}
        </nav>
        <div className="border-t border-zinc-200 p-4">
          <div className="mb-2 text-sm">
            <div className="font-medium">{user?.name}</div>
            <div className="text-xs text-zinc-500">{user?.role}</div>
          </div>
          <div className="flex gap-3 text-xs">
            <a href="/" target="_blank" className="text-indigo-600 hover:underline">
              View site
            </a>
            <button
              onClick={() => {
                clearTokens();
                router.replace('/admin/login');
              }}
              className="text-zinc-500 hover:text-red-600"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>
      <main className="ml-60 flex-1 p-8">{children}</main>
    </div>
  );
}
