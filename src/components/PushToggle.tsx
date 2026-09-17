"use client";

import { useEffect, useState } from "react";

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes.
 *
 * Backed by an explicit ArrayBuffer rather than Uint8Array.from, whose return
 * type is ArrayBufferLike and so could in principle be a SharedArrayBuffer,
 * which applicationServerKey does not accept.
 */
function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type State = "checking" | "unsupported" | "blocked" | "off" | "on" | "working";

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [note, setNote] = useState<string | null>(null);

  /*
   * Everything here runs asynchronously, including the early exits: setState
   * called synchronously in an effect body cascades renders. It also cannot
   * run during render, since Notification and navigator do not exist on the
   * server.
   */
  useEffect(() => {
    let cancelled = false;
    const settle = (next: State, message?: string) => {
      if (cancelled) return;
      setState(next);
      if (message !== undefined) setNote(message);
    };

    void (async () => {
      if (!vapidPublicKey) {
        settle("unsupported", "No VAPID key configured. Run pnpm keygen and add the three VAPID values.");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        settle("unsupported", "This browser does not support web push.");
        return;
      }
      if (Notification.permission === "denied") {
        settle("blocked", "Notifications are blocked for this site. Re-allow them in your browser settings.");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        settle(subscription ? "on" : "off");
      } catch {
        settle("off");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    setState("working");
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        setNote("Permission was not granted.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toBytes(vapidPublicKey!),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "could not store the subscription");

      setState("on");
      setNote("This browser will get the midday nudge.");
    } catch (err) {
      setState("off");
      setNote(err instanceof Error ? err.message : String(err));
    }
  }

  async function disable() {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("off");
      setNote(null);
    } catch (err) {
      setState("on");
      setNote(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-ink">
          {state === "on" ? "This browser is subscribed." : "Not subscribed on this browser."}
        </p>
        <p className="mt-1 max-w-[52ch] text-[12px] leading-relaxed text-ink-faint">
          {note ??
            "One notification, halfway between the brief and the cutoff, asking whether you are still on the needle mover. Skipped if it is already done."}
        </p>
      </div>

      {state === "on" ? (
        <button
          onClick={disable}
          className="pressable rounded-md border border-line px-4 py-2 text-[13px] text-ink-muted transition-colors hover:text-ink"
        >
          Turn off
        </button>
      ) : (
        <button
          onClick={enable}
          disabled={state === "checking" || state === "working" || state === "unsupported" || state === "blocked"}
          className="pressable rounded-md bg-cta px-5 py-2.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-40"
        >
          {state === "working" ? "Enabling…" : "Enable"}
        </button>
      )}
    </div>
  );
}
