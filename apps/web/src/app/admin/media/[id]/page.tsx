'use client';

import { use } from 'react';
import { MediaEditScreen } from '@/components/admin/power-screens';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MediaEditScreen id={id} />;
}
