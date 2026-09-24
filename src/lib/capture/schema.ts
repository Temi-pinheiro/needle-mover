import { z } from "zod";

/**
 * Claude answers in names, not ids — the names are what it was shown, and a
 * wrong name is obvious in a log where a wrong uuid is not. `resolveProposal`
 * turns them back into ids against the cache.
 */
export const ParsedCaptureSchema = z.object({
  title: z
    .string()
    .describe(
      "The issue title as it should read in Linear: imperative, under 80 characters, e.g. 'Send Dayo the pricing deck'",
    ),
  venture: z
    .string()
    .nullable()
    .describe("Exact venture name from the list, or null if the capture does not make it clear"),
  project: z
    .string()
    .nullable()
    .describe("Exact project name from that venture's list, or null if none clearly fits"),
  due_date: z
    .string()
    .nullable()
    .describe(
      "yyyy-mm-dd, only when the capture states or plainly implies a date ('by Friday', 'tomorrow'). Otherwise null.",
    ),
  description: z
    .string()
    .nullable()
    .describe("Any detail from the capture that does not fit in the title. Null if there is none."),
});

export type ParsedCapture = z.infer<typeof ParsedCaptureSchema>;
