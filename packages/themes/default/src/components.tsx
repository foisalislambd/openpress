import React from 'react';
import type { Comment, Content } from '@openpress/shared';

export function formatDate(date?: string | null) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function PostCard({ post }: { post: Content }) {
  return (
    <article className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
      {post.coverImage ? (
        <a href={`/${post.slug}`} className="mb-4 block overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.coverImage}
            alt={post.title}
            className="aspect-[16/9] w-full object-cover transition-transform group-hover:scale-105"
          />
        </a>
      ) : null}
      <div className="flex flex-wrap gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
        {post.categories?.map((c) => (
          <a key={c.id} href={`/category/${c.slug}`} className="hover:underline">
            {c.name}
          </a>
        ))}
      </div>
      <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        <a href={`/${post.slug}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
          {post.title}
        </a>
      </h2>
      {post.excerpt ? (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {post.excerpt}
        </p>
      ) : null}
      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
        <span>{post.author?.name}</span>
        <span aria-hidden>&middot;</span>
        <time>{formatDate(post.publishedAt)}</time>
      </div>
    </article>
  );
}

export function CommentList({ comments }: { comments: Comment[] }) {
  if (!comments.length) {
    return <p className="text-sm text-zinc-500">No comments yet.</p>;
  }
  return (
    <ul className="space-y-6">
      {comments.map((comment) => (
        <li key={comment.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {comment.author?.name ?? comment.guestName ?? 'Anonymous'}
            <span className="ml-2 font-normal text-zinc-400">
              {formatDate(comment.createdAt)}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {comment.body}
          </p>
          {comment.replies?.length ? (
            <div className="mt-4 border-l-2 border-zinc-200 pl-4 dark:border-zinc-700">
              <CommentList comments={comment.replies} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;
  const sep = basePath.includes('?') ? '&' : '?';
  return (
    <nav className="mt-10 flex items-center justify-center gap-4 text-sm font-medium">
      {page > 1 ? (
        <a href={`${basePath}${sep}page=${page - 1}`} className="rounded-lg border border-zinc-300 px-4 py-2 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          Newer
        </a>
      ) : null}
      <span className="text-zinc-500">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <a href={`${basePath}${sep}page=${page + 1}`} className="rounded-lg border border-zinc-300 px-4 py-2 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          Older
        </a>
      ) : null}
    </nav>
  );
}
