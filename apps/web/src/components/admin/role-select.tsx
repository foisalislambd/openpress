'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { Select } from '@/components/ui';

export function RoleSelect({ value, onChange }: { value: string; onChange: (role: string) => void }) {
  const [roles, setRoles] = useState<{ slug: string; label: string }[]>([]);
  useEffect(() => {
    api<{ slug: string; label: string }[]>('/roles').then(setRoles).catch(() => {});
  }, []);
  const options = roles.length
    ? roles
    : [
        { slug: 'ADMIN', label: 'Administrator' },
        { slug: 'EDITOR', label: 'Editor' },
        { slug: 'AUTHOR', label: 'Author' },
        { slug: 'CONTRIBUTOR', label: 'Contributor' },
        { slug: 'SUBSCRIBER', label: 'Subscriber' },
      ];
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((role) => (
        <option key={role.slug} value={role.slug}>
          {role.label}
        </option>
      ))}
    </Select>
  );
}
