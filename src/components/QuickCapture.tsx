"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitCapture } from "@/app/inbox/actions";
import { Mic, Stop } from "./icons";
import { Toasts } from "./Toasts";
import { notify, type Result } from "@/lib/notify";

/**
 * Errors raised while the dialog is open go to a toaster inside it: a modal
 * dialog sits in the top layer, above the page's toaster, which would hide them.
 */
const IN_DIALOG = { toasterId: "capture" };

/** Nobody dictates a two-minute commitment; this stops a forgotten recording. */
const MAX_SECONDS = 120;

/** MediaRecorder formats in preference order. Safari only offers mp4. */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/**
 * The five-second path from "I'll send that over" to the inbox.
 *
 * `C` opens it from anywhere, as it does in Linear, so the habit carries over.
 * Enter files it; Shift+Enter is a new line. Nothing here touches Linear —
 * every capture waits in the inbox for approval.
 */
export function QuickCapture({ voice }: { voice: boolean }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const open = useCallback(() => {
    dialogRef.current?.showModal();
    textRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditable(event.target) || dialogRef.current?.open) return;
      event.preventDefault();
      open();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) recorderRef.current?.stop();
  }, [recording, seconds]);

  /** Saved: close, then report on the page, where the toast is visible. */
  function finish(result: Result) {
    dialogRef.current?.close();
    if (textRef.current) textRef.current.value = "";
    notify(result, "In the inbox.");
    router.refresh();
  }

  /** Not saved: stay open so nothing typed is lost, and say why inside the dialog. */
  function fail(message: string) {
    notify({ ok: false, note: message }, undefined, IN_DIALOG);
  }

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    const text = textRef.current?.value ?? "";
    if (!text.trim()) return;
    startTransition(async () => {
      const result = await submitCapture(text);
      if (result.ok) finish(result);
      else fail(result.note ?? "Not saved.");
    });
  }

  async function startRecording() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("The browser did not allow the microphone. Check its site permissions.");
      return;
    }

    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) return;
      await upload(blob, type);
    };

    recorderRef.current = recorder;
    setSeconds(0);
    setRecording(true);
    recorder.start();
  }

  async function upload(blob: Blob, type: string) {
    setUploading(true);
    try {
      const res = await fetch("/api/captures/voice", {
        method: "POST",
        headers: { "Content-Type": type },
        body: blob,
      });
      const body = (await res.json().catch(() => null)) as Result | null;
      if (body?.ok) finish(body);
      else fail(body?.note ?? `Upload failed (${res.status}).`);
    } catch {
      fail("Could not reach the app to upload the recording.");
    } finally {
      setUploading(false);
    }
  }

  function onClose() {
    // Closing mid-recording discards it rather than uploading half a sentence.
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      recorder.stop();
    }
  }

  const busy = pending || uploading;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <>
      <button
        onClick={open}
        className="pressable flex items-center gap-2 rounded-lg border border-btn-border bg-btn-face px-4 py-2 text-[13px] font-medium text-btn-ink hover:bg-btn-face-hover"
      >
        Capture
        <kbd className="key hidden sm:inline">C</kbd>
      </button>

      <dialog ref={dialogRef} className="capture" onClose={onClose} aria-label="Quick capture">
        <form onSubmit={submit} className="px-6 pb-5 pt-6">
          <p className="label mb-3">Capture</p>
          <textarea
            ref={textRef}
            rows={3}
            maxLength={4000}
            placeholder="What did you just say you would do?"
            disabled={recording || busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
            }}
            className="w-full resize-none rounded-lg border border-line bg-surface-sunken px-4 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-ink disabled:opacity-60"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-ink-faint">
              {recording ? (
                <span className="flex items-center gap-2 text-pale-red-ink">
                  <span className="recording-dot inline-block h-2 w-2 rounded-full bg-current" aria-hidden />
                  Recording {clock}
                </span>
              ) : uploading ? (
                "Transcribing…"
              ) : (
                "Nothing reaches Linear until you approve it."
              )}
            </p>

            <div className="flex items-center gap-2">
              {voice &&
                (recording ? (
                  <button
                    type="button"
                    onClick={() => recorderRef.current?.stop()}
                    className="pressable flex items-center gap-2 rounded-lg border border-btn-border bg-btn-face px-4 py-2.5 text-sm font-medium text-pale-red-ink hover:bg-btn-face-hover"
                  >
                    <Stop />
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={busy}
                    aria-label="Record a voice note"
                    className="pressable flex items-center gap-2 rounded-lg border border-btn-border bg-btn-face px-4 py-2.5 text-sm font-medium text-btn-ink hover:bg-btn-face-hover disabled:opacity-50"
                  >
                    <Mic />
                    Voice
                  </button>
                ))}
              <button
                type="submit"
                disabled={recording || busy}
                className="pressable rounded-lg bg-cta px-5 py-2.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
              >
                {pending ? "Saving…" : "Capture"}
              </button>
            </div>
          </div>
        </form>
        <Toasts id="capture" />
      </dialog>
    </>
  );
}
