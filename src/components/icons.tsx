/**
 * Hairline icons, inline. Stroke weight 1.25 at 16px — heavier strokes read as
 * decoration and fight the serif title for attention.
 */
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ArrowUpRight({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className={className} aria-hidden {...base}>
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className={className} aria-hidden {...base}>
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

export function Slash({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className={className} aria-hidden {...base}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="m4.4 4.4 7.2 7.2" />
    </svg>
  );
}

export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" className={className} aria-hidden {...base}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}
