import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { captureVoice } from "@/lib/capture/pipeline";
import { voiceEnabled } from "@/lib/capture/deepgram";
import { MAX_AUDIO_BYTES, uploadAudio } from "@/lib/capture/storage";

/**
 * Voice capture upload. A route handler rather than a server action because a
 * server action's body is capped at 1MB, and a clip can exceed it.
 *
 * The body is the raw audio; its Content-Type is whatever MediaRecorder
 * produced (webm on Chrome and Firefox, mp4 on Safari).
 */
export async function POST(request: NextRequest) {
  // Middleware gates this path too, but it redirects, which a fetch follows
  // into an HTML login page. A plain 401 is what the recorder can report.
  if (!(await currentUser())) {
    return NextResponse.json({ ok: false, note: "Not signed in." }, { status: 401 });
  }
  if (!voiceEnabled()) {
    return NextResponse.json({ ok: false, note: "Voice capture is off: DEEPGRAM_API_KEY is not set." }, { status: 501 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("audio/")) {
    return NextResponse.json({ ok: false, note: `Expected audio, got "${contentType || "nothing"}".` }, { status: 415 });
  }

  const audio = await request.blob();
  if (audio.size === 0) {
    return NextResponse.json({ ok: false, note: "The recording was empty." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, note: "That recording is too long. Keep voice notes under two minutes." }, { status: 413 });
  }

  try {
    const path = await uploadAudio(audio, contentType);
    const { capture, note } = await captureVoice(path, audio, contentType);
    // A note means the clip was saved but a later step failed.
    return NextResponse.json({
      ok: true,
      note: note ?? "In the inbox.",
      level: note ? "warning" : "success",
      heard: capture.raw_text,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, note: `Not saved: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
