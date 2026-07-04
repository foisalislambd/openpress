'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { User } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Badge, Button, Card, Input, Label, Select } from '@/components/ui';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'AUTHOR',
  });

  const load = useCallback(() => {
    api<User[]>('/users').then(setUsers).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', email: '', password: '', role: 'AUTHOR' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  }

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
    <div>
      <h1 className="mb-6 text-2xl font-bold">Users</h1>
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Posts</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-zinc-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      className="!w-auto"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="EDITOR">Editor</option>
                      <option value="AUTHOR">Author</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {u._count?.contents ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(u.id)}
                      className="text-xs text-zinc-500 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Add user</h2>
          <form onSubmit={create} className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
                required
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="ADMIN">Admin</option>
                <option value="EDITOR">Editor</option>
                <option value="AUTHOR">Author</option>
              </Select>
            </div>
            <Button type="submit" className="w-full">
              Create user
            </Button>
          </form>
          <div className="mt-4 space-y-1 text-xs text-zinc-500">
            <p><Badge color="indigo">Admin</Badge> full access</p>
            <p><Badge color="green">Editor</Badge> manage all content &amp; comments</p>
            <p><Badge color="yellow">Author</Badge> write &amp; manage own posts</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
