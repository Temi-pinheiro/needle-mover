import { toast, type ExternalToast } from "sonner";

/**
 * How serious a result is. Server actions set it when `ok` alone would
 * mislead — "marked here, but Linear did not update" succeeded, and is still
 * something to act on.
 */
export type Level = "success" | "info" | "warning" | "error";

/** The shape every server action returns. */
export type Result = { ok: boolean; note?: string; level?: Level };

/**
 * Turns an action's result into a toast.
 *
 * With no level, `ok` decides between success and error. A success with no
 * note and no fallback shows nothing: when the page itself visibly changes —
 * a task marked started — a toast repeating it is noise.
 */
export function notify(result: Result, fallback?: string, options?: ExternalToast): void {
  const level: Level = result.level ?? (result.ok ? "success" : "error");
  const message = result.note ?? fallback ?? (result.ok ? null : "Something went wrong.");
  if (!message) return;
  toast[level](message, options);
}

/** For a thrown error that never became a Result. */
export function notifyError(err: unknown, options?: ExternalToast): void {
  toast.error(err instanceof Error ? err.message : String(err), options);
}
