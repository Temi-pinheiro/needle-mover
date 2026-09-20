"use client";

import { useState } from "react";

/**
 * The webhook URL and secret for one venture.
 *
 * The secret stays hidden until asked for: this page is likely to be open on a
 * shared screen at some point, and a secret in plain sight is a secret leaked.
 */
export function WebhookDetails({
  ventureName,
  url,
  secret,
}: {
  ventureName: string;
  url: string;
  secret: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  if (!secret) {
    return (
      <div className="py-4">
        <p className="text-[13px] text-ink-muted">
          {ventureName} has no webhook secret yet. Apply migration 0005.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-4">
      <p className="text-[14px] text-ink">{ventureName}</p>

      <Row label="URL" value={url} onCopy={() => copy("url", url)} copied={copied === "url"} />
      <Row
        label="Secret"
        value={revealed ? secret : "•".repeat(32)}
        onCopy={() => copy("secret", secret)}
        copied={copied === "secret"}
        extra={
          <button
            onClick={() => setRevealed((v) => !v)}
            className="pressable linkish text-[12px] text-ink-faint transition-colors hover:text-ink"
          >
            {revealed ? "Hide" : "Reveal"}
          </button>
        }
      />
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
  extra,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-line bg-surface-sunken px-3 py-1.5 font-mono text-[11px] text-ink-soft">
        {value}
      </code>
      <button
        onClick={onCopy}
        className="pressable linkish text-[12px] text-ink-faint transition-colors hover:text-ink"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {extra}
    </div>
  );
}
