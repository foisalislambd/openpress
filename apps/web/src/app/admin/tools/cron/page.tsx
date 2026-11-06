'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { Button, Input } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

type EventRow = {
  id: string;
  hook: string;
  intervalSeconds: number | null;
  nextRunAt: string;
  attempts: number;
  lastError: string | null;
};

export default function CronPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [hook, setHook] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState('3600');
  const [error, setError] = useState('');

  function load() {
    api<EventRow[]>('/cron').then(setEvents).catch((err) => setError(err instanceof Error ? err.message : 'Could not load events'));
  }

  useEffect(load, []);

  async function schedule(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const seconds = Number(intervalSeconds);
      await api('/cron', {
        method: 'POST',
        body: JSON.stringify({
          hook,
          intervalSeconds: Number.isFinite(seconds) && seconds >= 15 ? seconds : undefined,
          runAt: new Date().toISOString(),
        }),
      });
      setHook('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule the event');
    }
  }

  return (
    <Screen title="Scheduled Events" help="Events are stored in PostgreSQL and run even when Redis is not configured. The publish, purge, and health hooks are seeded automatically.">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button type="button" className="mb-3" onClick={() => api('/cron/run', { method: 'POST' }).then(load).catch((err) => setError(err instanceof Error ? err.message : 'Could not run events'))}>
        Run due events
      </Button>
      <table className="op-list">
        <thead>
          <tr>
            <th>Hook</th>
            <th>Next run</th>
            <th>Every</th>
            <th>Attempts</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {events.map((item) => (
            <tr key={item.id}>
              <td>
                <span className="op-row-title">{item.hook}</span>
                {item.lastError ? <div className="op-status">{item.lastError}</div> : null}
              </td>
              <td>{new Date(item.nextRunAt).toLocaleString()}</td>
              <td>{item.intervalSeconds ? `${item.intervalSeconds}s` : 'Once'}</td>
              <td>{item.attempts}</td>
              <td>
                <button
                  type="button"
                  className="is-delete"
                  onClick={async () => {
                    await api(`/cron/${item.id}`, { method: 'DELETE' });
                    load();
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={schedule} className="op-postbox mt-4 space-y-2 p-3">
        <h2>Add event</h2>
        <Input placeholder="hook.name" value={hook} onChange={(e) => setHook(e.target.value)} />
        <Input placeholder="Interval seconds, blank for once" value={intervalSeconds} onChange={(e) => setIntervalSeconds(e.target.value)} />
        <Button type="submit">Schedule</Button>
      </form>
    </Screen>
  );
}
