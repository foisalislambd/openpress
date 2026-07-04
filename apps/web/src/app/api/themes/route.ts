import { NextResponse } from 'next/server';
import { listBuiltInThemes } from '@/lib/themes';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET() {
  const builtIn = listBuiltInThemes();
  let uploaded: unknown[] = [];
  try {
    const res = await fetch(`${API_URL}/api/themes/installed`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const items = (await res.json()) as Record<string, unknown>[];
      uploaded = items.map((t) => ({ ...t, builtIn: false }));
    }
  } catch {
    // API offline; only built-ins available
  }
  return NextResponse.json([...builtIn, ...uploaded]);
}
