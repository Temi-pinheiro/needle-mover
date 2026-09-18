"use client";

import { useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { ShareCard, type ShareCardProps } from "./ShareCard";

type State = "idle" | "working" | "copied" | "downloaded" | "failed";

/**
 * Copies a picture of today's task to the clipboard.
 *
 * The card is rendered off-screen rather than hidden: `display: none` has no
 * layout, so there is nothing for the rasteriser to measure. Moving it out of
 * view keeps it real.
 *
 * Clipboard image writing is not available everywhere, and Safari drops the
 * permission if the write is not part of the original gesture. So a failure
 * falls back to a download rather than telling you it did not work.
 */
export function ShareButton(props: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("idle");

  async function share() {
    if (!cardRef.current) return;
    setState("working");

    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2, // legible when someone opens it full size
        cacheBust: true,
        backgroundColor: "#f7f6f3",
      });
      if (!blob) throw new Error("Nothing rendered.");

      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setState("copied");
      } catch {
        // Clipboard refused. Hand over the file instead of failing.
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `needle-mover-${props.date}.png`;
        link.click();
        URL.revokeObjectURL(url);
        setState("downloaded");
      }
    } catch {
      setState("failed");
    }

    setTimeout(() => setState("idle"), 2600);
  }

  const label = {
    idle: "Share",
    working: "Rendering…",
    copied: "Copied to clipboard",
    downloaded: "Downloaded",
    failed: "Could not render it",
  }[state];

  return (
    <>
      <button
        onClick={share}
        disabled={state === "working"}
        className="pressable text-[13px] text-ink-faint transition-colors hover:text-ink disabled:opacity-50"
      >
        {label}
      </button>

      {/* Off-screen, not display:none — a hidden element has nothing to measure. */}
      <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
        <ShareCard ref={cardRef} {...props} />
      </div>
    </>
  );
}
