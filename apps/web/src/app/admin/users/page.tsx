'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Input, Select } from '@/components/ui';
import { Screen } from '@/components/admin/screen';
import { RoleSelect } from '@/components/admin/role-select';

const ROLES = [
  { value: '', label: 'All' },
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'AUTHOR', label: 'Author' },
  { value: 'CONTRIBUTOR', label: 'Contributor' },
  { value: 'SUBSCRIBER', label: 'Subscriber' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [capability, setCapability] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (capability) params.set('capability', capability);
    const query = params.toString();
    api<User[]>(`/users${query ? `?${query}` : ''}`).then(setUsers).catch(() => {});
  }, [search, capability]);

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
      <div className="op-tablenav">
        <Input placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={capability} onChange={(e) => setCapability(e.target.value)}>
          <option value="">All capabilities</option>
          <option value="edit_posts">edit_posts</option>
          <option value="publish_posts">publish_posts</option>
          <option value="manage_options">manage_options</option>
          <option value="list_users">list_users</option>
        </Select>
      </div>
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
                <RoleSelect value={user.role} onChange={(next) => changeRole(user.id, next)} />
              </td>
              <td>{user._count?.contents ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Screen>
  );
}
