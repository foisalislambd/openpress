'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Comment, Role, SiteSettings, User } from '@openpress/shared';
import { api, clearTokens } from '@/lib/client-api';
import { cn } from '@/components/ui';

type IconName = string;

const ROLES: Role[] = ['ADMIN', 'EDITOR', 'AUTHOR'];
const STAFF: Role[] = ['ADMIN', 'EDITOR'];

type MenuLink = {
  href: string;
  label: string;
  roles: Role[];
  /** Highlight only this path, not deeper routes. */
  exact?: boolean;
  /** Paths that belong to a sibling item, not this one. */
  exclude?: string[];
  /** Active on this path when the URL has no hash. Used by the default taxonomy view. */
  whenHashEmpty?: boolean;
};

type MenuEntry =
  | { kind: 'separator' }
  | {
      kind: 'item';
      id: string;
      label: string;
      icon: IconName;
      href: string;
      roles: Role[];
      children: MenuLink[];
    };

/** Same groups and order as wp-admin/menu.php. */
const MENU: MenuEntry[] = [
  {
    kind: 'item',
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    href: '/admin',
    roles: ROLES,
    children: [
      { href: '/admin', label: 'Home', roles: ROLES, exact: true },
      { href: '/admin/updates', label: 'Updates', roles: ['ADMIN'], exact: true },
    ],
  },
  {
    kind: 'item',
    id: 'posts',
    label: 'Posts',
    icon: 'posts',
    href: '/admin/posts',
    roles: ROLES,
    children: [
      {
        href: '/admin/posts',
        label: 'All Posts',
        roles: ROLES,
        exclude: ['/admin/posts/new', '/admin/posts/categories', '/admin/posts/tags'],
      },
      { href: '/admin/posts/new', label: 'Add Post', roles: ROLES, exact: true },
      { href: '/admin/posts/categories', label: 'Categories', roles: ROLES },
      { href: '/admin/posts/tags', label: 'Tags', roles: ROLES },
    ],
  },
  {
    kind: 'item',
    id: 'media',
    label: 'Media',
    icon: 'media',
    href: '/admin/media',
    roles: ROLES,
    children: [
      { href: '/admin/media', label: 'Library', roles: ROLES, exclude: ['/admin/media/new'] },
      { href: '/admin/media/new', label: 'Add Media File', roles: ROLES, exact: true },
    ],
  },
  {
    kind: 'item',
    id: 'pages',
    label: 'Pages',
    icon: 'pages',
    href: '/admin/pages',
    roles: STAFF,
    children: [
      { href: '/admin/pages', label: 'All Pages', roles: STAFF, exclude: ['/admin/pages/new'] },
      { href: '/admin/pages/new', label: 'Add Page', roles: STAFF, exact: true },
    ],
  },
  {
    kind: 'item',
    id: 'comments',
    label: 'Comments',
    icon: 'comments',
    href: '/admin/comments',
    roles: STAFF,
    children: [{ href: '/admin/comments', label: 'All Comments', roles: STAFF }],
  },
  { kind: 'separator' },
  {
    kind: 'item',
    id: 'appearance',
    label: 'Appearance',
    icon: 'appearance',
    href: '/admin/themes',
    roles: ['ADMIN'],
    children: [
      { href: '/admin/themes', label: 'Themes', roles: ['ADMIN'], exact: true },
      { href: '/admin/appearance/customize', label: 'Customize', roles: ['ADMIN'], exact: true },
      { href: '/admin/appearance/widgets', label: 'Widgets', roles: ['ADMIN'], exact: true },
      { href: '/admin/appearance/menus', label: 'Menus', roles: ['ADMIN'], exact: true },
      { href: '/admin/appearance/theme-editor', label: 'Theme File Editor', roles: ['ADMIN'], exact: true },
    ],
  },
  {
    kind: 'item',
    id: 'plugins',
    label: 'Plugins',
    icon: 'plugins',
    href: '/admin/plugins',
    roles: ['ADMIN'],
    children: [
      { href: '/admin/plugins', label: 'Installed Plugins', roles: ['ADMIN'], exact: true },
      { href: '/admin/plugins/new', label: 'Add Plugin', roles: ['ADMIN'], exact: true },
      { href: '/admin/plugins/editor', label: 'Plugin File Editor', roles: ['ADMIN'], exact: true },
    ],
  },
  {
    kind: 'item',
    id: 'users',
    label: 'Users',
    icon: 'users',
    href: '/admin/users',
    roles: ['ADMIN'],
    children: [
      { href: '/admin/users', label: 'All Users', roles: ['ADMIN'], exact: true },
      { href: '/admin/users/new', label: 'Add User', roles: ['ADMIN'], exact: true },
      { href: '/admin/profile', label: 'Profile', roles: ['ADMIN'], exact: true },
    ],
  },
  {
    kind: 'item',
    id: 'profile',
    label: 'Profile',
    icon: 'users',
    href: '/admin/profile',
    roles: ['EDITOR', 'AUTHOR'],
    children: [{ href: '/admin/profile', label: 'Profile', roles: ['EDITOR', 'AUTHOR'], exact: true }],
  },
  {
    kind: 'item',
    id: 'tools',
    label: 'Tools',
    icon: 'tools',
    href: '/admin/tools',
    roles: STAFF,
    children: [
      { href: '/admin/tools', label: 'Available Tools', roles: STAFF, exact: true },
      { href: '/admin/tools/import', label: 'Import', roles: STAFF, exact: true },
      { href: '/admin/tools/export', label: 'Export', roles: STAFF, exact: true },
      { href: '/admin/tools/site-health', label: 'Site Health', roles: ['ADMIN'], exact: true },
      { href: '/admin/tools/export-personal-data', label: 'Export Personal Data', roles: ['ADMIN'], exact: true },
      { href: '/admin/tools/erase-personal-data', label: 'Erase Personal Data', roles: ['ADMIN'], exact: true },
    ],
  },
  {
    kind: 'item',
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    href: '/admin/settings',
    roles: ['ADMIN'],
    children: [
      { href: '/admin/settings', label: 'General', roles: ['ADMIN'], exact: true },
      { href: '/admin/settings/writing', label: 'Writing', roles: ['ADMIN'], exact: true },
      { href: '/admin/settings/reading', label: 'Reading', roles: ['ADMIN'], exact: true },
      { href: '/admin/settings/discussion', label: 'Discussion', roles: ['ADMIN'], exact: true },
      { href: '/admin/settings/media', label: 'Media', roles: ['ADMIN'], exact: true },
      { href: '/admin/settings/permalinks', label: 'Permalinks', roles: ['ADMIN'], exact: true },
      { href: '/admin/settings/privacy', label: 'Privacy', roles: ['ADMIN'], exact: true },
    ],
  },
];

function Icon({ name }: { name: string }) {
  const glyph =
    {
      dashboard: 'dashboard',
      posts: 'admin-post',
      media: 'admin-media',
      pages: 'admin-page',
      comments: 'admin-comments',
      appearance: 'admin-appearance',
      plugins: 'admin-plugins',
      users: 'admin-users',
      settings: 'admin-settings',
      tools: 'admin-tools',
      collapse: 'arrow-left-alt2',
      plus: 'plus',
      external: 'external',
      update: 'update',
    }[name] ?? name;
  return <span className={`dashicons dashicons-${glyph}`} aria-hidden />;
}

function pathOf(href: string) {
  return href.split('#')[0];
}

function hashOf(href: string) {
  return href.split('#')[1] ?? '';
}

function linkActive(pathname: string, hash: string, link: MenuLink) {
  const path = pathOf(link.href);
  const fragment = hashOf(link.href);
  if (link.exclude?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }
  const onPath = pathname === path || (!link.exact && pathname.startsWith(`${path}/`));
  if (!onPath) return false;
  if (fragment) {
    if (hash === fragment) return true;
    return hash === '' && link.whenHashEmpty === true;
  }
  // A hash on this exact path belongs to a sibling item (Library vs Add Media).
  if (hash && pathname === path) return false;
  return true;
}

function visibleMenu(role: Role): MenuEntry[] {
  return MENU.flatMap((entry): MenuEntry[] => {
    if (entry.kind === 'separator') return [entry];
    if (!entry.roles.includes(role)) return [];
    return [
      {
        ...entry,
        children: entry.children.filter((child) => child.roles.includes(role)),
      },
    ];
  }).filter((entry, index, list) => {
    if (entry.kind !== 'separator') return true;
    const prev = list[index - 1];
    const next = list[index + 1];
    return Boolean(prev && prev.kind !== 'separator' && next && next.kind !== 'separator');
  });
}

export function AdminShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [hash, setHash] = useState('');
  const [folded, setFolded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [siteTitle, setSiteTitle] = useState('OpenPress');
  const [menuOpen, setMenuOpen] = useState<'new' | 'site' | 'user' | null>(null);
  const [narrow, setNarrow] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const read = () => setHash(window.location.hash.replace('#', ''));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [pathname]);

  useEffect(() => {
    setFolded(localStorage.getItem('op_menu_folded') === '1');
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(null);
  }, [pathname, hash]);

  useEffect(() => {
    if (user.role !== 'AUTHOR') {
      api<Comment[]>('/comments?status=PENDING')
        .then((rows) => setPending(rows.length))
        .catch(() => {});
    }
    api<SiteSettings>('/settings')
      .then((s) => setSiteTitle(s.siteTitle || 'OpenPress'))
      .catch(() => {});
  }, [pathname, user.role]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!barRef.current?.contains(event.target as Node)) setMenuOpen(null);
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const menu = visibleMenu(user.role);
  const canPages = user.role !== 'AUTHOR';
  const isAdmin = user.role === 'ADMIN';

  function selectHash(next: string) {
    setHash(next);
    // Same-page hash links do not always emit hashchange. Taxonomy and media
    // listen for this so Categories, Tags, and Add Media scroll into place.
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('op-admin-hash', { detail: next }));
    }, 0);
  }

  function toggleFold() {
    setFolded((value) => {
      localStorage.setItem('op_menu_folded', value ? '0' : '1');
      return !value;
    });
  }

  return (
    <div className="op-admin min-h-screen bg-[#f0f0f0] text-[#3c434a]">
      <header
        ref={barRef}
        className="fixed inset-x-0 top-0 z-40 flex h-8 items-center bg-[#1e1e1e] text-[13px] text-white"
      >
        <button
          type="button"
          className="grid h-8 w-9 place-items-center hover:bg-[#0c0c0c] hover:text-[#7b90ff] md:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span className="block h-0.5 w-4 bg-current shadow-[0_5px_0_currentColor,0_-5px_0_currentColor]" />
        </button>
        <BarMenu
          label={siteTitle}
          open={menuOpen === 'site'}
          onToggle={() => setMenuOpen(menuOpen === 'site' ? null : 'site')}
        >
          <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2">
            <Icon name="external" />
            Visit Site
          </a>
        </BarMenu>
        <BarMenu
          icon="plus"
          label="New"
          open={menuOpen === 'new'}
          onToggle={() => setMenuOpen(menuOpen === 'new' ? null : 'new')}
        >
          <Link href="/admin/posts/new">Post</Link>
          <Link href="/admin/media/new">Media</Link>
          {canPages ? <Link href="/admin/pages/new">Page</Link> : null}
          {isAdmin ? <Link href="/admin/users/new">User</Link> : null}
        </BarMenu>
        <div className="ml-auto flex h-full items-center">
          {user.role !== 'AUTHOR' ? (
            <Link
              href="/admin/comments"
              className="relative flex h-8 items-center px-2 hover:bg-[#0c0c0c] hover:text-[#7b90ff]"
              title={pending > 0 ? `${pending} in moderation` : 'Comments'}
            >
              <Icon name="comments" />
              {pending > 0 ? (
                <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-[#d63638] px-1 text-center text-[9px] leading-4 text-white">
                  {pending > 99 ? '99+' : pending}
                </span>
              ) : null}
            </Link>
          ) : null}
          <BarMenu
            label={`Howdy, ${user.name}`}
            open={menuOpen === 'user'}
            onToggle={() => setMenuOpen(menuOpen === 'user' ? null : 'user')}
            align="right"
          >
            <div className="px-3 py-2 text-[12px] text-[#a7aaad]">{user.name}</div>
            <div className="px-3 pb-2 text-[12px] text-[#a7aaad]">{user.role}</div>
            <Link href="/admin/profile">Edit Profile</Link>
            <button
              type="button"
              onClick={() => {
                clearTokens();
                router.replace('/admin/login');
              }}
            >
              Log Out
            </button>
          </BarMenu>
        </div>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 top-8 z-20 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed bottom-0 left-0 top-8 z-30 flex w-40 flex-col bg-[#1e1e1e] text-white transition-[width,transform] duration-150',
          folded ? 'md:w-9' : 'md:w-40',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        )}
      >
        <nav className="op-menu min-h-0 flex-1 overflow-y-auto overflow-x-hidden" aria-label="Main">
          <ul>
            {menu.map((entry, index) =>
              entry.kind === 'separator' ? (
                <li key={`sep-${index}`} className="my-1 border-t border-white/10" role="separator" />
              ) : (
                <MenuBranch
                  key={entry.id}
                  entry={entry}
                  pathname={pathname}
                  hash={hash}
                  iconOnly={folded && !narrow}
                  inlineSubmenus={narrow || !folded}
                  allowFly={!narrow}
                  pending={pending}
                  onHash={selectHash}
                />
              ),
            )}
          </ul>
        </nav>
        <button
          type="button"
          onClick={toggleFold}
          className="hidden h-9 items-center border-t border-white/10 text-left text-[13px] text-[#bcbcbc] hover:bg-[#3858e9] hover:text-white md:flex"
        >
          <span className={cn('grid w-9 shrink-0 place-items-center', !folded && '[&_svg]:rotate-0', folded && '[&_svg]:rotate-180')}>
            <Icon name="collapse" />
          </span>
          <span className={cn(folded && 'sr-only')}>{folded ? 'Expand menu' : 'Collapse menu'}</span>
        </button>
      </aside>

      <div className={cn('flex min-h-screen flex-col pt-8', folded ? 'md:pl-9' : 'md:pl-40')}>
        <div className="op-screen flex-1 px-5 py-2">{children}</div>
        <footer className="mt-8 flex items-center justify-between px-5 py-4 text-[13px] text-[#50575e]">
          <span>Thank you for creating with OpenPress.</span>
          <span>Version 0.1.0</span>
        </footer>
      </div>
    </div>
  );
}

function MenuBranch({
  entry,
  pathname,
  hash,
  iconOnly,
  inlineSubmenus,
  allowFly,
  pending,
  onHash,
}: {
  entry: Extract<MenuEntry, { kind: 'item' }>;
  pathname: string;
  hash: string;
  iconOnly: boolean;
  inlineSubmenus: boolean;
  allowFly: boolean;
  pending: number;
  onHash: (hash: string) => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const [fly, setFly] = useState<{ top: number; left: number } | null>(null);
  const sectionOn = entry.children.some((child) => linkActive(pathname, hash, child));
  const inline = inlineSubmenus && sectionOn;

  function openFly() {
    if (inline || !allowFly) return;
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFly({ top: rect.top, left: rect.right - 1 });
  }

  return (
    <li ref={rowRef} className="relative" onMouseEnter={openFly} onMouseLeave={() => setFly(null)}>
      <Link
        href={entry.href}
        title={iconOnly ? entry.label : undefined}
        onClick={() => onHash(hashOf(entry.href))}
        className={cn(
          'flex h-[34px] items-center text-[13px] text-white no-underline hover:bg-[#3858e9] hover:text-white',
          sectionOn && 'is-current bg-[#3858e9]',
        )}
      >
        <span className="grid w-9 shrink-0 place-items-center">
          <Icon name={entry.icon} />
        </span>
        <span className={cn('min-w-0 flex-1 truncate pr-2', iconOnly && 'sr-only')}>
          {entry.label}
        </span>
        {entry.id === 'comments' && pending > 0 ? (
          <span
            className={cn(
              'mr-2 rounded-full bg-[#d63638] px-1.5 text-[10px] leading-4 text-white',
              iconOnly && 'absolute right-0.5 top-0.5 mr-0 px-1',
            )}
          >
            {pending}
          </span>
        ) : null}
      </Link>
      {inline ? (
        <Submenu entry={entry} pathname={pathname} hash={hash} onHash={onHash} />
      ) : fly ? (
        <div className="fixed z-50 min-w-40 bg-[#0c0c0c] py-1 shadow-lg" style={{ top: fly.top, left: fly.left }}>
          <Link href={entry.href} className="block px-3 py-1.5 text-[13px] font-semibold text-white no-underline">
            {entry.label}
          </Link>
          <Submenu entry={entry} pathname={pathname} hash={hash} onHash={onHash} />
        </div>
      ) : null}
    </li>
  );
}

function Submenu({
  entry,
  pathname,
  hash,
  onHash,
}: {
  entry: Extract<MenuEntry, { kind: 'item' }>;
  pathname: string;
  hash: string;
  onHash: (hash: string) => void;
}) {
  return (
    <ul className="op-submenu bg-[#0c0c0c] py-1">
      {entry.children.map((child) => {
        const on = linkActive(pathname, hash, child);
        return (
          <li key={child.href}>
            <Link
              href={child.href}
              onClick={() => onHash(hashOf(child.href))}
              className={cn(
                'block text-[13px] no-underline',
                on ? 'is-current text-white' : 'text-[#bcbcbc] hover:text-[#7b90ff]',
              )}
            >
              {child.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BarMenu({
  label,
  icon,
  open,
  onToggle,
  align = 'left',
  children,
}: {
  label: string;
  icon?: IconName;
  open: boolean;
  onToggle: () => void;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-full">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex h-8 items-center gap-1 px-2 hover:bg-[#0c0c0c] hover:text-[#7b90ff]"
      >
        {icon ? <Icon name={icon} /> : null}
        {align === 'right' ? (
          <span className="grid h-4 w-4 place-items-center rounded-full bg-[#50575e] text-[10px] uppercase text-white">
            {label.replace(/^Howdy,\s*/, '').slice(0, 1)}
          </span>
        ) : null}
        <span className="max-w-40 truncate">{label}</span>
      </button>
      {open ? (
        <div
          className={cn(
            'absolute top-8 z-50 min-w-44 border border-[#0c0c0c] bg-[#0c0c0c] py-1 text-[#bcbcbc] shadow-lg [&_a]:block [&_a]:px-3 [&_a]:py-1.5 [&_a]:text-[#bcbcbc] [&_a]:no-underline [&_a]:hover:text-[#7b90ff] [&_button]:block [&_button]:w-full [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-left [&_button]:text-[#bcbcbc] [&_button]:hover:text-[#7b90ff]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
