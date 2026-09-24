import type { CaptureVenture } from "./resolve";

/**
 * Speech to text through Deepgram's pre-recorded API.
 *
 * Chosen over a hosted Whisper for keyterm prompting: venture, project and
 * client names are exactly what a general model mishears, and Nova-3 can be
 * told them per request. Claude's API takes no audio, so this is the one extra
 * service voice capture costs — and it is optional. Without a key the mic
 * button does not render.
 */

const ENDPOINT = "https://api.deepgram.com/v1/listen";

/** Deepgram allows 500 tokens of keyterms per request; stay well inside it. */
export const KEYTERM_WORD_BUDGET = 250;

export function voiceEnabled(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY?.trim());
}

/**
 * The names worth biasing toward, most specific first: anything the user
 * listed by hand (clients and people are not in Linear), then ventures, then
 * projects. Deduplicated, and cut off at the budget rather than truncated
 * mid-name.
 */
export function buildKeyterms(ventures: CaptureVenture[], extra: string | undefined): string[] {
  const candidates = [
    ...(extra ?? "").split(","),
    ...ventures.map((v) => v.name),
    ...ventures.flatMap((v) => v.projects.map((p) => p.name)),
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  let words = 0;

  for (const raw of candidates) {
    const term = raw.trim().replace(/\s+/g, " ");
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    const cost = term.split(" ").length;
    if (words + cost > KEYTERM_WORD_BUDGET) break;
    seen.add(key);
    out.push(term);
    words += cost;
  }
  return out;
}

export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export async function transcribe(
  audio: Blob | ArrayBuffer,
  contentType: string,
  keyterms: string[],
): Promise<string> {
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) throw new TranscriptionError("DEEPGRAM_API_KEY is not set.");

  const params = new URLSearchParams({ model: "nova-3", smart_format: "true", language: "en" });
  for (const term of keyterms) params.append("keyterm", term);

  const res = await fetch(`${ENDPOINT}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      // Browsers report "audio/webm;codecs=opus"; the base type is enough.
      "Content-Type": contentType.split(";")[0] || "application/octet-stream",
    },
    body: audio,
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new TranscriptionError("Deepgram rejected the API key. Check DEEPGRAM_API_KEY.");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new TranscriptionError(`Deepgram returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`);
  }

  const body = (await res.json()) as {
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
  };
  return body.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
}
