'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import type { Comment, SiteSettings, User } from '@openpress/shared';
import { OpenPressMark } from '@/components/brand/openpress-mark';
import { api, clearTokens, getToken } from '@/lib/client-api';
import './admin-bar.css';

const DOCS = 'https://github.com/foisalislambd/openpress/tree/main/docs';

function can(user: User, cap: string, roles: string[]) {
  if (user.capabilities?.includes(cap)) return true;
  return roles.includes(user.role);
}

function BarItem({
  label,
  href,
  iconOnly = false,
  align = 'left',
  children,
}: {
  label: string;
  href?: string;
  iconOnly?: boolean;
  align?: 'left' | 'right';
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const topClass = iconOnly ? 'op-ab-top is-icon' : 'op-ab-top';
  return (
    <div
      className={`op-ab-item${align === 'right' ? ' is-right' : ''}${open ? ' is-open' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {href ? (
        <Link href={href} className={topClass} aria-label={iconOnly ? label : undefined} aria-expanded={children ? open : undefined}>
          {iconOnly ? <OpenPressMark size={20} /> : <span className="op-ab-label">{label}</span>}
        </Link>
      ) : (
        <button type="button" className={topClass} aria-expanded={open} aria-label={iconOnly ? label : undefined} onClick={() => setOpen((value) => !value)}>
          {iconOnly ? <span className="dashicons dashicons-plus" aria-hidden /> : <span className="op-ab-label">{label}</span>}
        </button>
      )}
      {children ? <div className="op-ab-sub" role="menu">{children}</div> : null}
    </div>
  );
}

export function AdminBar({
  user,
  context,
  menuOpen = false,
  onToggleMenu,
}: {
  user: User;
  context: 'admin' | 'front';
  menuOpen?: boolean;
  onToggleMenu?: () => void;
}) {
  const router = useRouter();
  const [siteTitle, setSiteTitle] = useState('OpenPress');
  const [pending, setPending] = useState(0);
  const [sites, setSites] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [siteSlug, setSiteSlug] = useState('');

  const canWrite = can(user, 'edit_posts', ['ADMIN', 'EDITOR', 'AUTHOR', 'CONTRIBUTOR']);
  const canMedia = can(user, 'upload_files', ['ADMIN', 'EDITOR', 'AUTHOR']);
  const canPages = can(user, 'edit_pages', ['ADMIN', 'EDITOR']);
  const canUsers = can(user, 'create_users', ['ADMIN']) || can(user, 'list_users', ['ADMIN']);
  const canTheme = can(user, 'edit_theme_options', ['ADMIN']);
  const canModerate = can(user, 'moderate_comments', ['ADMIN', 'EDITOR']);
  const canHealth = user.role === 'ADMIN' || Boolean(user.capabilities?.includes('manage_options'));
  const initial = (user.name || 'U').trim().slice(0, 1);

  useEffect(() => {
    api<SiteSettings>('/settings')
      .then((settings) => setSiteTitle(settings.siteTitle || 'OpenPress'))
      .catch(() => {});
    setSiteSlug(window.localStorage.getItem('op_site') ?? 'primary');
    api<{ id: string; name: string; slug: string }[]>('/sites').then(setSites).catch(() => setSites([]));
    if (canModerate) {
      api<Comment[]>('/comments?status=PENDING')
        .then((rows) => setPending(rows.length))
        .catch(() => {});
    }
  }, [canModerate]);

  function logout() {
    clearTokens();
    router.replace('/admin/login');
  }

  const newHref = canWrite ? '/admin/posts/new' : canMedia ? '/admin/media/new' : canPages ? '/admin/pages/new' : '/admin/users/new';
  const showNew = canWrite || canMedia || canPages || canUsers;

  return (
    <header className="op-admin-bar" role="navigation" aria-label="Toolbar">
      <link rel="stylesheet" href="/dashicons/css/dashicons.css" />
      <div className="op-ab-side">
        {onToggleMenu ? (
          <button type="button" className="op-ab-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={onToggleMenu}>
            <span className="block h-0.5 w-4 bg-current shadow-[0_5px_0_currentColor,0_-5px_0_currentColor]" />
          </button>
        ) : null}
        <BarItem label="About OpenPress" href="/admin/updates" iconOnly>
          <Link href="/admin/updates" role="menuitem">About OpenPress</Link>
          <a href={DOCS} role="menuitem">Documentation</a>
          {canHealth ? <Link href="/admin/tools/site-health" role="menuitem">Support</Link> : null}
        </BarItem>
        <BarItem label={siteTitle} href={context === 'admin' ? '/' : '/admin'}>
          {context === 'admin' ? (
            <a href="/" role="menuitem">Visit Site</a>
          ) : (
            <Link href="/admin" role="menuitem">Dashboard</Link>
          )}
          {context === 'admin' ? <Link href="/admin" role="menuitem">Dashboard</Link> : null}
          {canTheme ? <Link href="/admin/themes" role="menuitem">Themes</Link> : null}
          {canTheme ? <Link href="/admin/appearance/widgets" role="menuitem">Widgets</Link> : null}
          {canTheme ? <Link href="/admin/appearance/menus" role="menuitem">Menus</Link> : null}
          {sites.length > 1 ? (
            <label className="block px-3 py-2 text-[12px] text-[#c3c4c7]">
              Site
              <select
                className="mt-1 w-full bg-[#1d2327] text-white"
                value={siteSlug}
                onChange={(event) => {
                  window.localStorage.setItem('op_site', event.target.value);
                  window.location.reload();
                }}
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.slug}>{site.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </BarItem>
        {showNew ? (
          <div
            className="op-ab-item"
            onMouseEnter={(event) => event.currentTarget.classList.add('is-open')}
            onMouseLeave={(event) => event.currentTarget.classList.remove('is-open')}
          >
            <Link href={newHref} className="op-ab-top" aria-label="New">
              <span className="dashicons dashicons-plus" aria-hidden />
              <span className="op-ab-label">New</span>
            </Link>
            <div className="op-ab-sub" role="menu">
              {canWrite ? <Link href="/admin/posts/new" role="menuitem">Post</Link> : null}
              {canMedia ? <Link href="/admin/media/new" role="menuitem">Media</Link> : null}
              {canPages ? <Link href="/admin/pages/new" role="menuitem">Page</Link> : null}
              {canUsers ? <Link href="/admin/users/new" role="menuitem">User</Link> : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="op-ab-side is-end">
        {canModerate ? (
          <Link href="/admin/comments" className="op-ab-top op-ab-comments" title={pending > 0 ? `${pending} in moderation` : 'Comments'} aria-label={pending > 0 ? `${pending} comments in moderation` : 'Comments'}>
            <span className="dashicons dashicons-admin-comments" aria-hidden />
            {pending > 0 ? <span className="op-ab-count">{pending > 99 ? '99+' : pending}</span> : null}
          </Link>
        ) : null}
        <div
          className="op-ab-item is-right"
          onMouseEnter={(event) => event.currentTarget.classList.add('is-open')}
          onMouseLeave={(event) => event.currentTarget.classList.remove('is-open')}
        >
          <Link href="/admin/profile" className="op-ab-top">
            <span className="op-ab-avatar" aria-hidden>{initial}</span>
            <span className="op-ab-label">Howdy, {user.name}</span>
          </Link>
          <div className="op-ab-sub" role="menu">
            <Link href="/admin/profile" role="menuitem">{user.name}</Link>
            <Link href="/admin/profile" role="menuitem">Edit Profile</Link>
            <button type="button" role="menuitem" onClick={logout}>Log Out</button>
          </div>
        </div>
      </div>
    </header>
  );
}

export function FrontAdminBar() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    api<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  if (!user) return null;
  return (
    <>
      <AdminBar user={user} context="front" />
      <div className="h-8" aria-hidden />
    </>
  );
}
