import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "@/lib/claude/client";
import type { ProposedIssue } from "@/lib/db/types";
import { ParsedCaptureSchema, type ParsedCapture } from "./schema";
import { resolveProposal, type CaptureVenture } from "./resolve";
import { addDays } from "@/lib/time";

const SYSTEM = `You turn a quick note into one Linear issue for a founder running several ventures.

The note was typed or spoken in a hurry, often straight after a conversation: "I'll send that over", "call Dayo about pricing Thursday". Spoken notes are machine transcripts and may mangle names; prefer the closest venture or project name from the list when one is plainly meant.

Rules:

- The title is what the founder has to do, as an imperative, the way it would read in a Linear list. Keep names of people and clients. Drop filler ("remind me to", "I need to").
- Choose the venture and project only from the lists given, by exact name. If the note does not make the venture clear, return null rather than guessing — the founder will choose.
- A due date only when the note states or plainly implies one. Read weekdays and "tomorrow" off the calendar you are given; do not work dates out yourself. "Soon" and "this week" are not dates.
- The description holds anything useful that did not fit in the title. Most notes need none.`;

export function renderVentures(ventures: CaptureVenture[]): string {
  return ventures
    .map((v) => {
      const projects = v.projects.length
        ? v.projects
            .map((p) => `  - ${p.name}${p.targetDate ? ` (target ${p.targetDate})` : ""}`)
            .join("\n")
        : "  (no active projects)";
      return `${v.name}\n${projects}`;
    })
    .join("\n\n");
}

export const weekdayOf = (date: string) =>
  // Noon UTC names the right weekday for a calendar date whatever the offset.
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

/**
 * The next two weeks, one line per day. Given only today's date, the model
 * does weekday arithmetic and gets it wrong — the first live run filed "by
 * Friday" on a Saturday. A lookup table removes the arithmetic.
 */
export function renderCalendar(today: string, days = 14): string {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    return `${weekdayOf(date)} ${date}${label}`;
  }).join("\n");
}

export function buildCapturePrompt(rawText: string, ventures: CaptureVenture[], today: string): string {
  return [
    `Calendar:\n\n${renderCalendar(today)}`,
    `Ventures and their active projects:\n\n${renderVentures(ventures)}`,
    `The note:\n\n${rawText}`,
  ].join("\n\n");
}

/** One small call per capture. Throws when Claude returns nothing usable. */
export async function parseCapture(
  rawText: string,
  ventures: CaptureVenture[],
  today: string,
): Promise<ProposedIssue> {
  const response = await anthropic().messages.parse({
    model: MODELS.capture,
    max_tokens: 1000,
    system: SYSTEM,
    messages: [{ role: "user", content: buildCapturePrompt(rawText, ventures, today) }],
    output_config: { format: zodOutputFormat(ParsedCaptureSchema) },
  });

  const parsed = response.parsed_output as ParsedCapture | null;
  if (!parsed) {
    throw new Error(`Claude returned no parsable issue (stop_reason: ${response.stop_reason}).`);
  }
  return resolveProposal(parsed, ventures, rawText, today);
}
