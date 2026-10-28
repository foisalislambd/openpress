'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Select } from '@/components/ui';
import { Screen } from '@/components/admin/screen';

const ROLES = [
  { value: '', label: 'All' },
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'AUTHOR', label: 'Author' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [role, setRole] = useState('');

  const load = useCallback(() => {
    api<User[]>('/users').then(setUsers).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function changeRole(id: string, role: string) {
    await api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this user?')) return;
    await api(`/users/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <Screen title="Users" action={{ href: '/admin/users/new', label: 'Add User' }}>
      <ul className="op-subsubsub">
        {ROLES.map((item) => {
          const count = item.value ? users.filter((user) => user.role === item.value).length : users.length;
          return (
            <li key={item.value || 'all'}>
              <button
                type="button"
                className={role === item.value ? 'is-current' : undefined}
                onClick={() => setRole(item.value)}
              >
                {item.label} <span className="op-status">({count})</span>
              </button>
            </li>
          );
        })}
      </ul>
      <table className="op-list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Posts</th>
          </tr>
        </thead>
        <tbody>
          {users
            .filter((user) => !role || user.role === role)
            .map((user) => (
            <tr key={user.id}>
              <td>
                <span className="op-row-title">{user.name}</span>
                <div className="op-row-actions">
                  <button type="button" className="is-delete" onClick={() => remove(user.id)}>
                    Delete
                  </button>
                </div>
              </td>
              <td>{user.email}</td>
              <td>
                <Select value={user.role} onChange={(e) => changeRole(user.id, e.target.value)}>
                  <option value="ADMIN">Administrator</option>
                  <option value="EDITOR">Editor</option>
                  <option value="AUTHOR">Author</option>
                </Select>
              </td>
              <td>{user._count?.contents ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Screen>
  );
}
