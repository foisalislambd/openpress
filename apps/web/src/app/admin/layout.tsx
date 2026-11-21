'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { User } from '@openpress/shared';
import { AdminShell } from '@/components/admin/shell';
import { api, clearTokens } from '@/lib/client-api';

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
    api<User>('/auth/me')
      .then(setUser)
      .catch((error: unknown) => {
        // A navigation aborts the in-flight session check. That is not a logged-out session.
        const message = error instanceof Error ? error.message : '';
        if (!/401|403|unauthorized|sign in/i.test(message)) return;
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
