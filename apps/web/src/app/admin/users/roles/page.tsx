'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { Button, Input } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

type RoleRow = { slug: string; label: string; capabilities: string[]; builtin: boolean };
type Cap = { name: string; label: string; builtin: boolean };

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<Cap[]>([]);
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function load() {
    Promise.all([api<RoleRow[]>('/roles'), api<Cap[]>('/roles/catalog')])
      .then(([rows, caps]) => {
        setRoles(rows);
        setCatalog(caps);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load roles'));
  }

  useEffect(load, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/roles', {
        method: 'POST',
        body: JSON.stringify({ slug, label, capabilities: selected }),
      });
      setSlug('');
      setLabel('');
      setSelected([]);
      setMessage('Role created.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the role');
    }
  }

  async function save(role: RoleRow, capabilities: string[]) {
    setError('');
    await api(`/roles/${role.slug}`, { method: 'PATCH', body: JSON.stringify({ capabilities }) });
    setMessage(`${role.label} updated.`);
    load();
  }

  async function remove(role: RoleRow) {
    if (!confirm(`Delete the ${role.label} role?`)) return;
    setError('');
    try {
      await api(`/roles/${role.slug}`, { method: 'DELETE' });
      setMessage('Role deleted.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the role');
    }
  }

  return (
    <Screen title="Roles" help="Capabilities are checked on every write. Denies beat role grants. The Administrator role cannot be stripped.">
      {message ? <Notice kind="success">{message}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <table className="op-list">
        <thead>
          <tr>
            <th>Role</th>
            <th>Capabilities</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <RoleEditor key={role.slug} role={role} catalog={catalog} onSave={save} onDelete={remove} />
          ))}
        </tbody>
      </table>
      <form onSubmit={create} className="op-postbox mt-4 p-3">
        <h2 className="mb-2">Add role</h2>
        <div className="mb-2 flex gap-2">
          <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input placeholder="SLUG" value={slug} onChange={(e) => setSlug(e.target.value.toUpperCase())} />
        </div>
        <CapChecks catalog={catalog} selected={selected} onChange={setSelected} />
        <p className="mt-3">
          <Button type="submit">Add role</Button>
        </p>
      </form>
    </Screen>
  );
}

function RoleEditor({
  role,
  catalog,
  onSave,
  onDelete,
}: {
  role: RoleRow;
  catalog: Cap[];
  onSave: (role: RoleRow, capabilities: string[]) => void;
  onDelete: (role: RoleRow) => void;
}) {
  const [selected, setSelected] = useState(role.capabilities);
  return (
    <tr>
      <td>
        <span className="op-row-title">{role.label}</span>
        <div className="op-status">{role.slug}</div>
        {role.builtin ? null : (
          <button type="button" className="is-delete" onClick={() => onDelete(role)}>
            Delete
          </button>
        )}
      </td>
      <td>
        <CapChecks catalog={catalog} selected={selected} onChange={setSelected} />
        <p className="mt-2">
          <Button type="button" variant="secondary" onClick={() => onSave(role, selected)}>
            Save
          </Button>
        </p>
      </td>
    </tr>
  );
}

function CapChecks({
  catalog,
  selected,
  onChange,
}: {
  catalog: Cap[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {catalog.map((cap) => (
        <label key={cap.name} className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={selected.includes(cap.name)}
            onChange={(event) =>
              onChange(event.target.checked ? [...selected, cap.name] : selected.filter((item) => item !== cap.name))
            }
          />
          {cap.label}
        </label>
      ))}
    </div>
  );
}

