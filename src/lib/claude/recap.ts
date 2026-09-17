import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "./client";
import { renderFacts, type RecapFacts } from "@/lib/recap";

export const RecapSchema = z.object({
  summary: z
    .string()
    .describe(
      "Two or three sentences on what the day amounted to. Plain, specific, no encouragement.",
    ),
  tomorrow_note: z
    .string()
    .describe("One sentence on why tomorrow's candidate is the thing to pick up next."),
});

export type RecapText = z.infer<typeof RecapSchema>;

const SYSTEM = `You write the end-of-day recap for a founder running several ventures at once.

You are given the facts of the day: whether the needle mover was finished, what was closed in Linear, and how project targets moved. Turn them into a short, plain summary.

Rules:

- Two or three sentences. Shorter is better.
- Say what actually happened, including when it was a thin day. "The needle mover did not move and nothing closed" is a perfectly good recap. Do not manufacture progress.
- No encouragement, no praise, no motivational framing. This is a record, not a coach.
- Name the specific work and the specific target it moved. Avoid "productivity", "momentum" and similar abstractions.
- If the needle mover was blocked, say what by, and treat the backup being worked as a normal outcome rather than a failure.
- The tomorrow note explains the pick in one sentence, in terms of what it advances.`;

/** One call at close of day. */
export async function writeRecap(
  facts: RecapFacts,
  tomorrow: { identifier: string; title: string; ventureName: string } | null,
): Promise<RecapText> {
  const prompt = [
    `Date: ${facts.date}`,
    "",
    renderFacts(facts),
    "",
    tomorrow
      ? `Tomorrow's candidate: ${tomorrow.identifier} "${tomorrow.title}" (${tomorrow.ventureName}).`
      : "There is no candidate for tomorrow — nothing open and unblocked is assigned.",
    "",
    "Write the recap.",
  ].join("\n");

  const response = await anthropic().messages.parse({
    model: MODELS.recap,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(RecapSchema) },
  });

  const parsed = response.parsed_output as RecapText | null;
  if (!parsed) {
    // The facts are the point; the narrative is a nicety. A failed call should
    // not stop the recap from being sent.
    return {
      summary: renderFacts(facts),
      tomorrow_note: tomorrow ? `Next up: ${tomorrow.title}.` : "",
    };
  }
  return parsed;
}
