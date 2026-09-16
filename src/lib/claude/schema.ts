import { z } from "zod";

/**
 * Claude answers in issue identifiers (MEN-14), not uuids — they're in the
 * prompt already, they're checkable by eye in a log, and a hallucinated
 * identifier is obvious where a hallucinated uuid is not.
 */
export const PickSchema = z.object({
  needle_mover: z.string().describe("Identifier of the single highest-impact issue, e.g. MEN-14"),
  backup: z
    .string()
    .describe("Identifier of a task that stays startable even if the needle mover turns out to be blocked"),
  reason: z
    .string()
    .describe("One or two sentences on why this outranked everything else, naming the project target it advances"),
  first_step: z
    .string()
    .describe("One physical action under 10 minutes, starting with a verb"),
  also_today: z
    .array(z.string())
    .describe("Up to 5 other identifiers worth touching today, drawn from at most 2 ventures"),
  plain_focus: z
    .string()
    .describe(
      "The needle mover in one short line with no jargon, client names or venture names, e.g. 'Deep work on a new product launch'",
    ),
});

export type Pick = z.infer<typeof PickSchema>;
