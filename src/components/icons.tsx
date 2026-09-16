/**
 * Icon primitives. Stroke 1.75 — a technical, slightly thicker weight that
 * holds its own against the hairline structure; thin strokes read as vague
 * against a 1px border system.
 */
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
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

/** Sharp plus/minus for the drawer, per the accordion convention. */
export function Toggle({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className={className} aria-hidden {...base}>
      <path d="M3 8h10" />
      <path
        d="M8 3v10"
        style={{
          transformOrigin: "center",
          transform: open ? "scaleY(0)" : "scaleY(1)",
          transition: "transform 260ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </svg>
  );
}
