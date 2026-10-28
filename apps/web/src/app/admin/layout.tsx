'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { User } from '@openpress/shared';
import { AdminShell } from '@/components/admin/shell';
import { api, clearTokens, getToken } from '@/lib/client-api';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const isLogin = pathname === '/admin/login';

  useEffect(() => {
    if (isLogin) return;
    if (!getToken()) {
      router.replace('/admin/login');
      return;
    }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => {
        clearTokens();
        router.replace('/admin/login');
      });
  }, [isLogin, pathname, router]);

  if (isLogin) {
    return (
      <>
        <link rel="stylesheet" href="/dashicons/css/dashicons.css" />
        {children}
      </>
    );
  }
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0f0f0] text-[13px] text-[#50575e]">
        Loading…
      </div>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="/dashicons/css/dashicons.css" />
      <AdminShell user={user}>{children}</AdminShell>
    </>
  );
}
