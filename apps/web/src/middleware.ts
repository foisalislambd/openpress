import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/admin') || pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const response = await fetch(`${api}/api/redirects/lookup?path=${encodeURIComponent(pathname)}`, {
      cache: 'no-store',
    });
    if (response.ok) {
      const data = (await response.json()) as { to?: string | null; statusCode?: number };
      const redirect = safeInternalPath(data.to, request);
      if (redirect) return NextResponse.redirect(redirect, data.statusCode || 301);
    }
    const permalinks = await fetch(`${api}/api/permalinks/resolve?path=${encodeURIComponent(pathname)}`, {
      cache: 'no-store',
    });
    if (permalinks.ok) {
      const resolved = (await permalinks.json()) as {
        action?: string;
        slug?: string;
        to?: string;
        statusCode?: number;
      };
      if (resolved.action === 'redirect' && resolved.to) {
        const target = safeInternalPath(resolved.to, request);
        if (target) return NextResponse.redirect(target, resolved.statusCode || 301);
      }
      if (resolved.action === 'rewrite' && resolved.slug) {
        const url = request.nextUrl.clone();
        url.pathname = `/${resolved.slug}`;
        return NextResponse.rewrite(url);
      }
      const rules = await fetch(`${api}/api/rewrite/match?path=${encodeURIComponent(pathname)}`, {
        cache: 'no-store',
      });
      if (rules.ok) {
        const matched = (await rules.json()) as { rewriteTo?: string | null };
        if (matched.rewriteTo && matched.rewriteTo !== pathname && safeInternalPath(matched.rewriteTo, request)) {
          const url = request.nextUrl.clone();
          url.pathname = matched.rewriteTo;
          return NextResponse.rewrite(url);
        }
      }
    }
  } catch {
    // The public site still renders when the lookup is unavailable.
  }
  return NextResponse.next();
}

function safeInternalPath(value: string | null | undefined, request: NextRequest) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('..')) return null;
  return new URL(value, request.url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
