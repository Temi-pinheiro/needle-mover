import Link from "next/link";
import type { CaptureChrome } from "@/lib/capture/pipeline";
import { QuickCapture } from "./QuickCapture";

const quiet =
  "pressable rounded-lg border border-btn-border bg-btn-face px-4 py-2 text-[13px] font-medium text-btn-ink hover:bg-btn-face-hover disabled:opacity-50";

/**
 * The header on every signed-in page. Small and quiet — this app is one screen
 * you look at, not somewhere you navigate around.
 *
 * Capture lives here because it has to be reachable from anywhere; the inbox
 * count is the loop closing visibly, and disappears when there is nothing in it.
 */
export function HeaderNav({
  eyebrow,
  date,
  index = 0,
  capture,
  current = "today",
}: {
  eyebrow: string;
  date: string;
  index?: number;
  capture?: CaptureChrome;
  /** Which page this is: it gets no link to itself, and every other page gets a way home. */
  current?: "today" | "inbox";
}) {
  return (
    <header
      className="enter mb-12 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-5"
      style={{ "--index": index } as React.CSSProperties}
    >
      <p className="label">{eyebrow}</p>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <p className="mr-2.5 font-mono text-[11px] text-ink-faint">{date}</p>
        {current !== "today" && (
          <Link href="/" className={quiet}>
            Today
          </Link>
        )}
        {capture && (
          <>
            {capture.pending > 0 && current !== "inbox" && (
              <Link href="/inbox" className={`${quiet} flex items-center gap-2`}>
                Inbox
                <span className="rounded-full bg-pale-yellow px-1.5 font-mono text-[11px] text-pale-yellow-ink">
                  {capture.pending}
                </span>
              </Link>
            )}
            <QuickCapture voice={capture.voice} />
          </>
        )}
        <Link href="/settings" className={quiet}>
          Settings
        </Link>
      </div>
    </header>
  );
}
