/**
 * Circular OpenPress mark (#2271b1 badge, white open O).
 * Paths match apps/web/public/openpress-icon.svg.
 */
export function OpenPressMark({
  size = 24,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="256" cy="256" r="256" fill="#2271b1" />
      <circle cx="256" cy="256" r="228" fill="none" stroke="#ffffff" strokeWidth="16" />
      <circle cx="256" cy="256" r="128" fill="none" stroke="#ffffff" strokeWidth="52" />
      <path d="M348 348 L410 410" stroke="#2271b1" strokeWidth="56" strokeLinecap="butt" />
    </svg>
  );
}
