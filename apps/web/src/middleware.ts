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
      if (data.to) return NextResponse.redirect(new URL(data.to, request.url), data.statusCode || 301);
    }
  } catch {
    // The public site still renders when the lookup is unavailable.
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
