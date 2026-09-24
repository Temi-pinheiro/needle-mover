"use client";

import { useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { toast } from "sonner";
import { ShareCard, type ShareCardProps } from "./ShareCard";

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
  const [working, setWorking] = useState(false);

  async function share() {
    if (!cardRef.current) return;
    setWorking(true);

    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2, // legible when someone opens it full size
        cacheBust: true,
        backgroundColor: "#f7f6f3",
      });
      if (!blob) throw new Error("Nothing rendered.");

      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("Copied to clipboard.");
      } catch {
        // Clipboard refused. Hand over the file instead of failing.
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `needle-mover-${props.date}.png`;
        link.click();
        URL.revokeObjectURL(url);
        toast.info("The clipboard refused the image, so it was downloaded instead.");
      }
    } catch {
      toast.error("Could not render the share card.");
    }

    setWorking(false);
  }

  return (
    <>
      <button
        onClick={share}
        disabled={working}
        className="pressable rounded-lg border border-btn-border bg-btn-face px-4 py-2 text-[13px] font-medium text-btn-ink hover:bg-btn-face-hover disabled:opacity-50"
      >
        {working ? "Rendering…" : "Share"}
      </button>

      {/* Off-screen, not display:none — a hidden element has nothing to measure. */}
      <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
        <ShareCard ref={cardRef} {...props} />
      </div>
    </>
  );
}
