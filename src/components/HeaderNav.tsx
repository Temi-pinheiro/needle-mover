import Link from "next/link";

/**
 * The header on every signed-in page. Small and quiet — this app is one screen
 * you look at, not somewhere you navigate around.
 */
export function HeaderNav({
  eyebrow,
  date,
  index = 0,
}: {
  eyebrow: string;
  date: string;
  index?: number;
}) {
  return (
    <header
      className="enter mb-12 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-5"
      style={{ "--index": index } as React.CSSProperties}
    >
      <p className="label">{eyebrow}</p>
      <div className="flex items-baseline gap-5">
        <p className="font-mono text-[11px] text-ink-faint">{date}</p>
        <Link
          href="/settings"
          className="pressable rounded-lg border border-btn-border bg-btn-face px-4 py-2 text-[13px] font-medium text-btn-ink hover:bg-btn-face-hover disabled:opacity-50"
        >
          Settings
        </Link>
      </div>
    </header>
  );
}
