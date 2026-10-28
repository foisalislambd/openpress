'use client';

import React from 'react';

// Small shadcn-style UI primitives used across the admin panel.

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const variants = {
    primary:
      'border-[#2271b1] bg-[#2271b1] text-white hover:border-[#135e96] hover:bg-[#135e96]',
    secondary:
      'border-[#2271b1] bg-[#f6f7f7] text-[#2271b1] hover:border-[#0a4b78] hover:bg-[#f0f0f1] hover:text-[#0a4b78]',
    ghost: 'border-transparent bg-transparent text-[#2271b1] hover:text-[#135e96]',
    danger: 'border-[#d63638] bg-[#d63638] text-white hover:bg-[#b32d2e]',
  };
  return (
    <button
      className={cn(
        'inline-flex min-h-[30px] items-center justify-center gap-1 rounded-[3px] border px-3 text-[13px] leading-none font-normal disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-[4px] border border-[#8c8f94] bg-white px-2 py-1 text-[14px] text-[#2c3338] outline-none focus:border-[#2271b1] focus:shadow-[0_0_0_1px_#2271b1]',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-[4px] border border-[#8c8f94] bg-white px-2 py-1 text-[14px] text-[#2c3338] outline-none focus:border-[#2271b1] focus:shadow-[0_0_0_1px_#2271b1]',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'max-w-full rounded-[4px] border border-[#8c8f94] bg-white px-2 py-0 text-[14px] text-[#2c3338] min-h-[30px] outline-none focus:border-[#2271b1] focus:shadow-[0_0_0_1px_#2271b1]',
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1 block text-[14px] font-normal text-[#1d2327]', className)}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'border border-[#c3c4c7] bg-white p-3 shadow-[0_1px_1px_rgba(0,0,0,0.04)]',
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  color = 'zinc',
  children,
}: {
  color?: 'zinc' | 'green' | 'yellow' | 'red' | 'indigo';
  children: React.ReactNode;
}) {
  const colors = {
    zinc: 'bg-zinc-100 text-zinc-700',
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  };
  return (
    <span
      className={cn(
        'inline-flex rounded-[2px] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        colors[color],
      )}
    >
      {children}
    </span>
  );
}

export function statusBadgeColor(status: string) {
  switch (status) {
    case 'PUBLISHED':
    case 'APPROVED':
      return 'green' as const;
    case 'DRAFT':
    case 'PENDING':
      return 'yellow' as const;
    case 'TRASHED':
    case 'SPAM':
      return 'red' as const;
    case 'SCHEDULED':
      return 'indigo' as const;
    default:
      return 'zinc' as const;
  }
}
