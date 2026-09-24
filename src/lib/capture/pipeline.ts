import { db, unwrap } from "@/lib/db/client";
import type { Capture, CaptureSource, Project, ProposedIssue, Workspace } from "@/lib/db/types";
import { getSettings } from "@/lib/day";
import { localDate } from "@/lib/time";
import { parseCapture } from "./parse";
import type { CaptureVenture } from "./resolve";
import { buildKeyterms, transcribe, voiceEnabled } from "./deepgram";
import { downloadAudio } from "./storage";

/**
 * The capture pipeline. One rule runs through all of it: **a capture is saved
 * before anything that can fail.** Transcription and parsing are conveniences
 * on top of the words; losing "I'll send Dayo the deck" to a Deepgram outage
 * would defeat the reason this exists. A failure leaves the row in the inbox
 * with whatever it has, and a note on what to retry.
 */

export async function loadVentures(): Promise<CaptureVenture[]> {
  const [workspaces, projects] = await Promise.all([
    db().from("workspaces").select("id, venture_name").eq("active", true).order("created_at"),
    db().from("projects").select("id, workspace_id, name, target_date").order("name"),
  ]);
  const ws = (workspaces.data ?? []) as Pick<Workspace, "id" | "venture_name">[];
  const ps = (projects.data ?? []) as Pick<Project, "id" | "workspace_id" | "name" | "target_date">[];

  return ws.map((w) => ({
    id: w.id,
    name: w.venture_name,
    projects: ps
      .filter((p) => p.workspace_id === w.id)
      .map((p) => ({ id: p.id, name: p.name, targetDate: p.target_date })),
  }));
}

async function today(): Promise<string> {
  const settings = await getSettings();
  return localDate(new Date(), settings.timezone);
}

export type CaptureOutcome = { capture: Capture; note?: string };

/** Parses the text and stores the proposal. Returns a note on failure, never throws. */
async function propose(capture: Capture, ventures: CaptureVenture[]): Promise<CaptureOutcome> {
  if (!capture.raw_text) return { capture };

  // Left null on failure rather than stored blank: null is how the inbox knows
  // to offer "ask again", and it fills in a blank form itself.
  let proposal: ProposedIssue | null = null;
  let note: string | undefined;
  try {
    proposal = await parseCapture(capture.raw_text, ventures, await today());
  } catch (err) {
    note = `Saved, but Claude could not read it (${err instanceof Error ? err.message : String(err)}). Fill it in from the inbox.`;
  }

  const saved = unwrap(
    await db().from("captures").update({ proposed_issue: proposal }).eq("id", capture.id).select("*").single(),
  ) as Capture;
  return { capture: saved, note };
}

async function insert(row: {
  source: CaptureSource;
  raw_text: string | null;
  audio_path?: string | null;
}): Promise<Capture> {
  return unwrap(await db().from("captures").insert(row).select("*").single()) as Capture;
}

export async function captureText(text: string): Promise<CaptureOutcome> {
  const capture = await insert({ source: "text", raw_text: text });
  return propose(capture, await loadVentures());
}

/** The clip is already in storage; transcription is attempted after the row exists. */
export async function captureVoice(audioPath: string, audio: Blob, contentType: string): Promise<CaptureOutcome> {
  const capture = await insert({ source: "voice", raw_text: null, audio_path: audioPath });
  return transcribeAndPropose(capture, audio, contentType);
}

async function transcribeAndPropose(capture: Capture, audio: Blob, contentType: string): Promise<CaptureOutcome> {
  const ventures = await loadVentures();

  let text: string;
  try {
    text = await transcribe(audio, contentType, buildKeyterms(ventures, process.env.DEEPGRAM_KEYTERMS));
  } catch (err) {
    return {
      capture,
      note: `Recording saved, but it could not be transcribed (${err instanceof Error ? err.message : String(err)}). Retry it from the inbox.`,
    };
  }

  if (!text) {
    return { capture, note: "Recording saved, but no speech was heard in it. Listen to it in the inbox." };
  }

  const saved = unwrap(
    await db().from("captures").update({ raw_text: text }).eq("id", capture.id).select("*").single(),
  ) as Capture;
  return propose(saved, ventures);
}

/** Re-runs whichever step failed: transcription for a voice clip with no text, else parsing. */
export async function retryCapture(id: string): Promise<CaptureOutcome> {
  const capture = unwrap(await db().from("captures").select("*").eq("id", id).single()) as Capture;
  if (capture.status !== "pending") return { capture, note: "That capture is already resolved." };

  if (!capture.raw_text && capture.audio_path) {
    if (!voiceEnabled()) return { capture, note: "DEEPGRAM_API_KEY is not set, so voice cannot be transcribed." };
    const audio = await downloadAudio(capture.audio_path);
    return transcribeAndPropose(capture, audio, audio.type || "audio/webm");
  }
  return propose(capture, await loadVentures());
}

/** What the header needs on every page: the inbox count and whether the mic shows. */
export type CaptureChrome = { pending: number; voice: boolean };

export async function captureChrome(): Promise<CaptureChrome> {
  const { count } = await db()
    .from("captures")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return { pending: count ?? 0, voice: voiceEnabled() };
}
