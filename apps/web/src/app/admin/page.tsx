'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Comment, Content, Paginated } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Badge, Card, statusBadgeColor } from '@/components/ui';

export default function DashboardPage() {
  const [posts, setPosts] = useState<Paginated<Content> | null>(null);
  const [pages, setPages] = useState<Paginated<Content> | null>(null);
  const [pending, setPending] = useState<Comment[]>([]);

  useEffect(() => {
    api<Paginated<Content>>('/content?type=POST&perPage=5').then(setPosts).catch(() => {});
    api<Paginated<Content>>('/content?type=PAGE&perPage=1').then(setPages).catch(() => {});
    api<Comment[]>('/comments?status=PENDING').then(setPending).catch(() => {});
  }, []);

  const stats = [
    { label: 'Posts', value: posts?.total ?? '—', href: '/admin/posts' },
    { label: 'Pages', value: pages?.total ?? '—', href: '/admin/pages' },
    { label: 'Pending comments', value: pending.length, href: '/admin/comments' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="text-3xl font-extrabold text-indigo-600">{s.value}</div>
              <div className="mt-1 text-sm text-zinc-500">{s.label}</div>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Recent posts</h2>
          <Link href="/admin/posts/new" className="text-sm text-indigo-600 hover:underline">
            New post
          </Link>
        </div>
        <ul className="divide-y divide-zinc-100">
          {posts?.items.map((post) => (
            <li key={post.id} className="flex items-center justify-between py-3">
              <Link
                href={`/admin/posts/${post.id}`}
                className="font-medium hover:text-indigo-600"
              >
                {post.title}
              </Link>
              <Badge color={statusBadgeColor(post.status)}>{post.status}</Badge>
            </li>
          ))}
          {posts && posts.items.length === 0 ? (
            <li className="py-3 text-sm text-zinc-500">No posts yet.</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
