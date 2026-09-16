import Anthropic from "@anthropic-ai/sdk";

/**
 * One shared client. Model choice per job:
 *  - the daily pick and the recap are judgement calls over the whole day, and
 *    run once each, so they get the most capable model;
 *  - capture parsing is "turn one sentence into a Linear issue" at maybe a
 *    dozen calls a day, where a fast model is plainly enough.
 */
export const MODELS = {
  pick: "claude-opus-5",
  recap: "claude-opus-5",
  capture: "claude-haiku-4-5",
} as const;

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}
