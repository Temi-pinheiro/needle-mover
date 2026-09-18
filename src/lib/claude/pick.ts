import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "./client";
import { PickSchema, type Pick } from "./schema";
import { resolvePick, shortlistRefs, type ResolvedPick } from "./validate";
import { ALSO_TODAY_MAX_VENTURES } from "./validate";
import { CARRYOVER_SPLIT_THRESHOLD } from "@/lib/scoring/weights";
import type { ScoredCandidate, ScoringResult } from "@/lib/scoring/types";

export type PickContext = {
  /** Today's local date, yyyy-mm-dd. */
  today: string;
  timezone: string;
  scoring: ScoringResult;
};

const SYSTEM = `You choose the day's work for a founder running several ventures at once.

You pick one needle mover and three other tasks. The needle mover is the single task that moves a venture furthest toward a stated project target; the other three are what is worth doing after it, in order.

You are given a pre-scored shortlist. The scoring has already weighed goal leverage, deadline pressure, unblocking and momentum. Your job is the judgement the score cannot make: which of these genuinely changes the week, and how to make it easy to start.

Rules, all of which are hard requirements:

- Pick everything from the shortlist only, by identifier.
- The first step is one physical action that takes under 10 minutes and starts with a verb. It must be something you could do without deciding anything else first. Good: "Open the Meridian pricing doc and list three tiers." Bad: "Think about pricing", "Start the pricing work".
- The reason is one or two sentences naming the project target the needle mover advances and why it outranked the runners-up. Do not restate the score.
- The three other tasks are drawn from at most ${ALSO_TODAY_MAX_VENTURES} ventures and exclude the needle mover. Return fewer than three if fewer are genuinely worth the day.
- Each of those three carries one short clause saying why it earned a place, written to be read once the needle mover is already finished. Say what it unblocks or what it is running out of time against. "Unblocks the webhook and the first real brief" is useful; "important task" is not.
- The plain focus line describes the needle mover to a friend: no venture names, client names, product names or jargon. One short sentence.

Prefer the task that unblocks a target over the task that is merely urgent. A high score with a distant target is worth less than a moderate score on a target that lands this month.

Do not suggest when to do any of it. Say what matters and why; the day is theirs to arrange.`;

/** Renders the shortlist for the prompt: scores plus the facts behind them. */
export function renderShortlist(shortlist: ScoredCandidate[]): string {
  // Identifiers are qualified with the venture only when two ventures produce
  // the same one; see shortlistRefs.
  const { refOf } = shortlistRefs(shortlist);

  return shortlist
    .map((s, i) => {
      const { issue, project } = s.candidate;
      const bits = [
        `${i + 1}. ${refOf(s)} — ${issue.title}`,
        `   venture: ${issue.ventureName}`,
        `   score: ${s.total.toFixed(3)} (${Object.entries(s.contributions)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k} ${v.toFixed(2)}`)
          .join(", ") || "all factors zero"})`,
        `   state: ${issue.stateType}${issue.estimate != null ? `, estimate ${issue.estimate}` : ", no estimate"}${
          issue.priority ? `, priority ${issue.priority}` : ""
        }`,
      ];
      if (project) {
        bits.push(
          `   project: ${project.name} — target ${project.targetDate ?? "none"}, ${Math.round(project.progress * 100)}% complete`,
        );
      } else {
        bits.push("   project: none (no target to advance)");
      }
      if (issue.dueDate) bits.push(`   due: ${issue.dueDate}`);
      if (issue.blocksCount > 0) bits.push(`   unblocks ${issue.blocksCount} other issue(s)`);
      if (s.carryOverDays > 0) {
        bits.push(
          `   carried over ${s.carryOverDays} day(s) unfinished${
            s.carryOverDays >= CARRYOVER_SPLIT_THRESHOLD
              ? " — say in the reason that this should be split into smaller issues or dropped in priority"
              : ""
          }`,
        );
      }
      return bits.join("\n");
    })
    .join("\n\n");
}

export function buildPickPrompt(ctx: PickContext): string {
  const parts = [
    `Today is ${ctx.today} (${ctx.timezone}).`,
    ctx.scoring.degraded
      ? `Note: only ${ctx.scoring.targetedCount} candidate(s) belong to a project with a target date, so goal leverage was excluded from the score. Lean harder on your own judgement about which project actually matters.`
      : null,
    `Shortlist (highest score first):\n\n${renderShortlist(ctx.scoring.shortlist)}`,
    "Choose the needle mover and the three that follow it.",
  ].filter(Boolean);

  return parts.join("\n\n");
}

/** One call per morning. Throws if the model picks outside the shortlist. */
export async function pickNeedleMover(ctx: PickContext): Promise<ResolvedPick> {
  const response = await anthropic().messages.parse({
    model: MODELS.pick,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: buildPickPrompt(ctx) }],
    output_config: { format: zodOutputFormat(PickSchema) },
  });

  const parsed = response.parsed_output as Pick | null;
  if (!parsed) {
    throw new Error(`Claude returned no parsable pick (stop_reason: ${response.stop_reason}).`);
  }

  return resolvePick(parsed, ctx.scoring.shortlist);
}
