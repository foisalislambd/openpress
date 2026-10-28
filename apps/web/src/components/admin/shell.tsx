'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Comment, Role, SiteSettings, User } from '@openpress/shared';
import { api, clearTokens } from '@/lib/client-api';
import { cn } from '@/components/ui';

type IconName =
  | 'dashboard'
  | 'posts'
  | 'media'
  | 'pages'
  | 'comments'
  | 'appearance'
  | 'plugins'
  | 'users'
  | 'settings'
  | 'collapse'
  | 'plus'
  | 'external';

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

/**
 * Same groups and order as wp-admin/menu.php, limited to screens OpenPress
 * already ships. Appearance / Tools editors and the settings sub-screens
 * land in later clones.
 */
const MENU: MenuEntry[] = [
  {
    kind: 'item',
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    href: '/admin',
    roles: ROLES,
    children: [{ href: '/admin', label: 'Home', roles: ROLES, exact: true }],
  },
  {
    kind: 'item',
    id: 'posts',
    label: 'Posts',
    icon: 'posts',
    href: '/admin/posts',
    roles: ROLES,
    children: [
      { href: '/admin/posts', label: 'All Posts', roles: ROLES, exclude: ['/admin/posts/new'] },
      { href: '/admin/posts/new', label: 'Add Post', roles: ROLES, exact: true },
      { href: '/admin/taxonomy#categories', label: 'Categories', roles: ROLES, whenHashEmpty: true },
      { href: '/admin/taxonomy#tags', label: 'Tags', roles: ROLES },
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
      { href: '/admin/media', label: 'Library', roles: ROLES },
      { href: '/admin/media#upload', label: 'Add Media File', roles: ROLES },
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
    children: [{ href: '/admin/themes', label: 'Themes', roles: ['ADMIN'] }],
  },
  {
    kind: 'item',
    id: 'plugins',
    label: 'Plugins',
    icon: 'plugins',
    href: '/admin/plugins',
    roles: ['ADMIN'],
    children: [{ href: '/admin/plugins', label: 'Installed Plugins', roles: ['ADMIN'] }],
  },
  {
    kind: 'item',
    id: 'users',
    label: 'Users',
    icon: 'users',
    href: '/admin/users',
    roles: ['ADMIN'],
    children: [{ href: '/admin/users', label: 'All Users', roles: ['ADMIN'] }],
  },
  {
    kind: 'item',
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    href: '/admin/settings',
    roles: ['ADMIN'],
    children: [{ href: '/admin/settings', label: 'General', roles: ['ADMIN'] }],
  },
];

function Icon({ name }: { name: IconName }) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'currentColor',
    'aria-hidden': true as const,
    className: 'h-5 w-5',
  };
  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <path d="M3 3h6v6H3V3zm8 0h6v4h-6V3zM3 11h6v6H3v-6zm8-2h6v8h-6V9z" />
        </svg>
      );
    case 'posts':
      return (
        <svg {...common}>
          <path d="M4 3h9l3 3v11H4V3zm8 1.5V7h2.5L12 4.5zM6 9h8v1.4H6V9zm0 3h8v1.4H6V12zm0 3h5v1.4H6V15z" />
        </svg>
      );
    case 'media':
      return (
        <svg {...common}>
          <path d="M3 4h14v12H3V4zm2 2v6.2l2.4-2.2 2.1 2 3-3.2L15 12V6H5zm2.2 1.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z" />
        </svg>
      );
    case 'pages':
      return (
        <svg {...common}>
          <path d="M5 2h7l3 3v13H5V2zm6 1.4V6h2.6L11 3.4zM7 8h6v1.3H7V8zm0 3h6v1.3H7V11zm0 3h4v1.3H7V14z" />
        </svg>
      );
    case 'comments':
      return (
        <svg {...common}>
          <path d="M3 3h14v10H7.2L3 16.2V3zm2 2v7.4l1.6-1.4H15V5H5z" />
        </svg>
      );
    case 'appearance':
      return (
        <svg {...common}>
          <path d="M10 2a8 8 0 1 0 .01 16.01A8 8 0 0 0 10 2zm0 2c.8 0 1.5.2 2.2.5A3 3 0 0 1 10 9a3 3 0 0 1-2.2-4.5A6 6 0 0 1 10 4zm-4.5 3.2A5 5 0 0 0 10 11a5 5 0 0 0 4.5-3.8A6 6 0 0 1 10 16a6 6 0 0 1-4.5-8.8z" />
        </svg>
      );
    case 'plugins':
      return (
        <svg {...common}>
          <path d="M7 2h2v4h2V2h2v4h1.2A1.8 1.8 0 0 1 16 7.8V11h2v2h-2v3.2A1.8 1.8 0 0 1 14.2 18H5.8A1.8 1.8 0 0 1 4 16.2V13H2v-2h2V7.8A1.8 1.8 0 0 1 5.8 6H7V2z" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <path d="M7 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm6.5 1.5a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM2.5 16.5c.4-2.6 2.4-4 4.5-4s4.1 1.4 4.5 4H2.5zm8.2-.4c-.2-1.6.2-3 1.2-4 .7.3 1.5.5 2.3.5 1.6 0 3 .9 3.4 3.5h-6.9z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path d="M8.2 2h3.6l.4 2.1a6 6 0 0 1 1.5.9l2-1 2.5 2.5-1 2c.4.5.7 1 .9 1.5L20 10.4v3.2l-2.1.4a6 6 0 0 1-.9 1.5l1 2-2.5 2.5-2-1a6 6 0 0 1-1.5.9l-.4 2.1H8.2l-.4-2.1a6 6 0 0 1-1.5-.9l-2 1L2 16.5l1-2a6 6 0 0 1-.9-1.5L0 12.6V9.4l2.1-.4c.2-.5.5-1 .9-1.5l-1-2L4.5 3l2 1c.5-.4 1-.7 1.5-.9L8.2 2zM10 7.5A2.5 2.5 0 1 0 10 12a2.5 2.5 0 0 0 0-4.5z" />
        </svg>
      );
    case 'collapse':
      return (
        <svg {...common}>
          <path d="M12.5 4.5 7 10l5.5 5.5 1.2-1.2L9.4 10l4.3-4.3-1.2-1.2zM4 3h2v14H4V3z" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M9 3h2v6h6v2h-6v6H9v-6H3V9h6V3z" />
        </svg>
      );
    case 'external':
      return (
        <svg {...common}>
          <path d="M4 4h6v2H6v8h8v-4h2v6H4V4zm6 0h6v6h-2V7.4l-5.3 5.3-1.4-1.4L12.6 6H10V4z" />
        </svg>
      );
  }
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

function visibleMenu(role: Role) {
  return MENU.flatMap((entry) => {
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
    <div className="op-admin min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header
        ref={barRef}
        className="fixed inset-x-0 top-0 z-40 flex h-8 items-center bg-[#1d2327] text-[13px] text-[#f0f0f1]"
      >
        <button
          type="button"
          className="grid h-8 w-9 place-items-center hover:bg-[#2c3338] md:hidden"
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
          <Link href="/admin/media#upload">Media</Link>
          {canPages ? <Link href="/admin/pages/new">Page</Link> : null}
          {isAdmin ? <Link href="/admin/users">User</Link> : null}
        </BarMenu>
        <div className="ml-auto flex h-full items-center">
          {pending > 0 && user.role !== 'AUTHOR' ? (
            <Link
              href="/admin/comments"
              className="flex h-8 items-center gap-1 px-2 hover:bg-[#2c3338]"
              title={`${pending} in moderation`}
            >
              <Icon name="comments" />
              <span className="rounded-full bg-[#d63638] px-1.5 text-[11px] leading-4 text-white">
                {pending}
              </span>
            </Link>
          ) : null}
          <BarMenu
            label={user.name}
            open={menuOpen === 'user'}
            onToggle={() => setMenuOpen(menuOpen === 'user' ? null : 'user')}
            align="right"
          >
            <div className="px-3 py-2 text-[12px] text-[#a7aaad]">{user.role}</div>
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
          'fixed bottom-0 left-0 top-8 z-30 flex w-40 flex-col bg-[#1d2327] text-[#f0f0f1] transition-[width,transform] duration-150',
          folded ? 'md:w-9' : 'md:w-40',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        )}
      >
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" aria-label="Main">
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
          className="hidden h-9 items-center border-t border-white/10 text-left text-[13px] text-[#c3c4c7] hover:text-[#72aee6] md:flex"
        >
          <span className={cn('grid w-9 shrink-0 place-items-center', !folded && '[&_svg]:rotate-0', folded && '[&_svg]:rotate-180')}>
            <Icon name="collapse" />
          </span>
          <span className={cn(folded && 'sr-only')}>{folded ? 'Expand menu' : 'Collapse menu'}</span>
        </button>
      </aside>

      <div className={cn('pt-8', folded ? 'md:pl-9' : 'md:pl-40')}>
        <div className="px-5 py-4">{children}</div>
        <footer className="px-5 pb-6 text-[13px] text-[#50575e]">
          Thank you for creating with OpenPress.
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
          'flex h-[34px] items-center text-[13px] no-underline hover:text-[#72aee6]',
          sectionOn ? 'bg-[#2271b1] text-white hover:text-white' : 'text-[#f0f0f1]',
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
        <div className="fixed z-50 min-w-40 shadow-lg" style={{ top: fly.top, left: fly.left }}>
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
    <ul className="bg-[#2c3338] py-1">
      {entry.children.map((child) => {
        const on = linkActive(pathname, hash, child);
        return (
          <li key={child.href}>
            <Link
              href={child.href}
              onClick={() => onHash(hashOf(child.href))}
              className={cn(
                'block px-3 py-1.5 text-[13px] no-underline',
                on ? 'font-semibold text-white' : 'text-[#c3c4c7] hover:text-white',
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
        className="flex h-8 items-center gap-1 px-3 hover:bg-[#2c3338]"
      >
        {icon ? <Icon name={icon} /> : null}
        <span className="max-w-40 truncate">{label}</span>
      </button>
      {open ? (
        <div
          className={cn(
            'absolute top-8 z-50 min-w-44 border border-[#2c3338] bg-[#2c3338] py-1 text-[#f0f0f1] shadow-lg [&_a]:block [&_a]:px-3 [&_a]:py-1.5 [&_a]:no-underline [&_a]:hover:bg-[#2271b1] [&_button]:block [&_button]:w-full [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-left [&_button]:hover:bg-[#2271b1]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
