'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Content, Revision } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Select } from '@/components/ui';
import { Notice } from '@/components/admin/screen';

const CURRENT = 'current';

type Snapshot = { id: string; label: string; title: string; blocks: unknown[] };

export function RevisionsPanel({
  contentId,
  title,
  blocks,
  refreshKey,
  onRestored,
}: {
  contentId: string;
  title: string;
  blocks: unknown[];
  refreshKey: number;
  onRestored: (content: Content) => void;
}) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState(CURRENT);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [compareHost, setCompareHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Revision[]>(`/content/${contentId}/revisions`)
      .then((rows) => {
        if (cancelled) return;
        setRevisions(rows);
        setFromId((current) => current || rows[0]?.id || '');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load revisions.');
      });
    return () => {
      cancelled = true;
    };
  }, [contentId, refreshKey]);

  const current: Snapshot = {
    id: CURRENT,
    label: 'Current',
    title,
    blocks,
  };
  const saved: Snapshot[] = revisions.map((revision) => ({
    id: revision.id,
    label: revisionLabel(revision),
    title: revision.title,
    blocks: Array.isArray(revision.blocks) ? revision.blocks : [],
  }));
  const choices = [current, ...saved];
  const from = choices.find((item) => item.id === fromId) ?? saved[0];
  const to = choices.find((item) => item.id === toId) ?? current;

  async function restore() {
    if (!from || from.id === CURRENT) return;
    const ok = window.confirm(
      'Restore this revision? The current title and content are saved as a new revision first. Excerpt, SEO, categories, and tags stay as they are.',
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<Content>(`/content/${contentId}/revisions/${from.id}/restore`, {
        method: 'POST',
      });
      setOpen(true);
      onRestored(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const host = document.getElementById('op-revision-compare');
    setCompareHost(host);
    if (open) host?.scrollIntoView({ block: 'start' });
  }, [open]);

  const compare =
    open && from && to ? (
      <div className="op-postbox mb-4">
        <h2 className="px-3 py-2">Compare revisions</h2>
        <div className="space-y-3 p-3">
          <RevisionDiff from={from} to={to} />
          <div className="flex gap-2">
            {from.id !== CURRENT ? (
              <Button type="button" disabled={busy} onClick={restore}>
                {busy ? 'Restoring…' : 'Restore this revision'}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      {compare && compareHost ? createPortal(compare, compareHost) : null}
      <div className="op-postbox">
        <h2 className="px-3 py-2">Revisions</h2>
        <div className="space-y-3 p-3 text-[13px]">
          {error ? <Notice kind="error">{error}</Notice> : null}
          {revisions.length === 0 ? (
            <p className="op-description">Revisions appear here after you update this item.</p>
          ) : (
            <>
              <p className="op-description">
                {revisions.length} saved. Compare two versions, then restore a saved title and content.
              </p>
              <label className="block">
                From
                <Select className="mt-1 w-full" value={from?.id ?? ''} onChange={(e) => setFromId(e.target.value)}>
                  {saved.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                To
                <Select className="mt-1 w-full" value={to.id} onChange={(e) => setToId(e.target.value)}>
                  {choices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={!from}>
                  Compare
                </Button>
                <Button type="button" disabled={busy || !from || from.id === CURRENT} onClick={restore}>
                  Restore
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function RevisionDiff({ from, to }: { from: Snapshot; to: Snapshot }) {
  const left = align(snapshotLines(from), snapshotLines(to));
  return (
    <div className="op-revisions">
      <div>
        <h3>{from.label}</h3>
        <pre>{renderColumn(left, 'left')}</pre>
      </div>
      <div>
        <h3>{to.label}</h3>
        <pre>{renderColumn(left, 'right')}</pre>
      </div>
    </div>
  );
}

function revisionLabel(revision: Revision) {
  const when = new Date(revision.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const who = revision.author?.name ?? 'Unknown';
  return `${when} — ${who}`;
}

function snapshotLines(snapshot: Snapshot) {
  return [`Title: ${snapshot.title}`, ...blocksToLines(snapshot.blocks)];
}

function blocksToLines(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return [];
  const lines: string[] = [];
  const walk = (list: unknown[]) => {
    for (const block of list) {
      if (!block || typeof block !== 'object') continue;
      const record = block as { content?: unknown; children?: unknown };
      const line = inlineText(record.content);
      if (line) lines.push(line);
      if (Array.isArray(record.children)) walk(record.children);
    }
  };
  walk(blocks);
  return lines;
}

function inlineText(content: unknown) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('');
}

type DiffRow = { left: string | null; right: string | null; kind: 'same' | 'del' | 'ins' };

function align(before: string[], after: string[]): DiffRow[] {
  const n = before.length;
  const m = after.length;
  if (n * m > 250000) {
    return [
      ...before.map((line) => ({ left: line, right: null, kind: 'del' as const })),
      ...after.map((line) => ({ left: null, right: line, kind: 'ins' as const })),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      rows.push({ left: before[i], right: after[j], kind: 'same' });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ left: before[i], right: null, kind: 'del' });
      i += 1;
    } else {
      rows.push({ left: null, right: after[j], kind: 'ins' });
      j += 1;
    }
  }
  while (i < n) {
    rows.push({ left: before[i], right: null, kind: 'del' });
    i += 1;
  }
  while (j < m) {
    rows.push({ left: null, right: after[j], kind: 'ins' });
    j += 1;
  }
  return rows;
}

function renderColumn(rows: DiffRow[], side: 'left' | 'right') {
  return rows.map((row, index) => {
    const text = side === 'left' ? row.left : row.right;
    if (text == null) return <span key={index} className="op-diff-same">{'\n'}</span>;
    const kind = row.kind === 'same' ? 'op-diff-same' : side === 'left' ? 'op-diff-del' : 'op-diff-ins';
    const marked = row.kind === 'same' ? 'op-diff-same' : kind;
    return (
      <span key={index} className={row.kind === 'same' ? 'op-diff-same' : marked}>
        {text}
        {'\n'}
      </span>
    );
  });
}
