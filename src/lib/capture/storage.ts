import { db } from "@/lib/db/client";

/**
 * Voice clips live in a private Supabase Storage bucket until the capture is
 * resolved, so a mangled name can be checked against what was actually said.
 *
 * The bucket is created on first use rather than by migration: storage is not
 * part of the SQL schema, and one fewer manual step matters for anyone
 * self-hosting this.
 */
export const BUCKET = "captures";

/** Nobody records a two-minute commitment; this is a runaway-recording guard. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

let ensured = false;

async function ensureBucket(): Promise<void> {
  if (ensured) return;
  const { error } = await db().storage.getBucket(BUCKET);
  if (error) {
    const created = await db().storage.createBucket(BUCKET, { public: false });
    // Two first uploads can race; losing that race is fine.
    if (created.error && !/already exists/i.test(created.error.message)) {
      throw new Error(`Could not create the "${BUCKET}" storage bucket: ${created.error.message}`);
    }
  }
  ensured = true;
}

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export async function uploadAudio(audio: Blob, contentType: string): Promise<string> {
  await ensureBucket();
  const base = contentType.split(";")[0];
  const path = `${crypto.randomUUID()}.${EXTENSIONS[base] ?? "bin"}`;
  const { error } = await db().storage.from(BUCKET).upload(path, audio, { contentType: base });
  if (error) throw new Error(`Could not store the recording: ${error.message}`);
  return path;
}

export async function downloadAudio(path: string): Promise<Blob> {
  const { data, error } = await db().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Could not read the recording back: ${error?.message ?? "empty"}`);
  return data;
}

/** A short-lived link for the inbox player. Null rather than a thrown page. */
export async function audioUrl(path: string): Promise<string | null> {
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function removeAudio(path: string): Promise<void> {
  // Best effort: a leftover clip is untidy, not wrong, and must not undo an
  // approval that already reached Linear.
  await db().storage.from(BUCKET).remove([path]);
}
