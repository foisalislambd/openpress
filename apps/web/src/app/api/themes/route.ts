import { NextResponse } from 'next/server';
import { listThemes } from '@/lib/themes';

export function GET() {
  return NextResponse.json(listThemes());
}
