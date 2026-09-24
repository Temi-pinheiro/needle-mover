"use client";

import { Toaster } from "sonner";

/**
 * The one place feedback appears: every success, warning and failure is a
 * toast, never a line of text left inside the page.
 *
 * Sonner's colours are swapped for the app's own tokens through inline CSS
 * variables. Inline wins over the theme rules Sonner injects at runtime, and
 * because the values are `var(--…)` references they follow the light and dark
 * palettes without a theme prop of their own. The semantic colours are the
 * same washed pastels the rest of the app uses for meaning.
 */
const PALETTE = {
  "--normal-bg": "var(--surface)",
  "--normal-border": "var(--line-strong)",
  "--normal-text": "var(--ink)",
  "--success-bg": "var(--pale-green)",
  "--success-border": "color-mix(in srgb, var(--pale-green-ink) 22%, transparent)",
  "--success-text": "var(--pale-green-ink)",
  "--info-bg": "var(--surface)",
  "--info-border": "var(--line-strong)",
  "--info-text": "var(--ink-soft)",
  "--warning-bg": "var(--pale-yellow)",
  "--warning-border": "color-mix(in srgb, var(--pale-yellow-ink) 25%, transparent)",
  "--warning-text": "var(--pale-yellow-ink)",
  "--error-bg": "var(--pale-red)",
  "--error-border": "color-mix(in srgb, var(--pale-red-ink) 25%, transparent)",
  "--error-text": "var(--pale-red-ink)",
  "--border-radius": "10px",
  fontFamily: "var(--font-sans), 'Helvetica Neue', sans-serif",
} as React.CSSProperties;

/**
 * `id` makes a second, named toaster. The quick-capture box needs one inside
 * itself: a modal <dialog> sits in the browser's top layer, above anything the
 * page renders, so a page-level toast raised while it is open would be hidden
 * behind it.
 */
export function Toasts({ id }: { id?: string }) {
  return (
    <Toaster
      id={id}
      position="bottom-right"
      richColors
      closeButton
      // Long enough to read a sentence that explains a partial failure.
      duration={6000}
      style={PALETTE}
      toastOptions={{ classNames: { toast: "!shadow-none", title: "!font-medium" } }}
    />
  );
}
