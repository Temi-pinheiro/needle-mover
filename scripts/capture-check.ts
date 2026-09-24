/**
 * Dry-runs capture parsing against the real ventures and projects. Reads the
 * cache, calls Claude, prints the proposal. Writes nothing.
 *
 *   pnpm capture:check "send dayo the pricing deck by friday"
 */
import { loadVentures } from "@/lib/capture/pipeline";
import { parseCapture, weekdayOf } from "@/lib/capture/parse";
import { buildKeyterms, voiceEnabled } from "@/lib/capture/deepgram";
import { getSettings } from "@/lib/day";
import { localDate } from "@/lib/time";

async function main() {
  const text = process.argv.slice(2).join(" ").trim();
  if (!text) {
    console.error('Usage: pnpm capture:check "what you would capture"');
    process.exit(1);
  }

  const ventures = await loadVentures();
  const settings = await getSettings();
  const today = localDate(new Date(), settings.timezone);

  console.log(`\n${ventures.length} venture(s), ${ventures.reduce((n, v) => n + v.projects.length, 0)} project(s). Today is ${weekdayOf(today)} ${today}.`);
  console.log(`Voice: ${voiceEnabled() ? "on" : "off (DEEPGRAM_API_KEY not set)"}`);
  console.log(`Keyterms: ${buildKeyterms(ventures, process.env.DEEPGRAM_KEYTERMS).join(" · ") || "none"}\n`);

  const started = Date.now();
  const proposal = await parseCapture(text, ventures, today);
  const venture = ventures.find((v) => v.id === proposal.workspace_id);
  const project = venture?.projects.find((p) => p.id === proposal.project_id);

  console.log(`"${text}"  →  ${Date.now() - started}ms\n`);
  console.log(`  title        ${proposal.title}`);
  console.log(`  venture      ${venture?.name ?? "(none — you would choose)"}`);
  console.log(`  project      ${project?.name ?? "(none)"}`);
  console.log(`  due          ${proposal.due_date ?? "(none)"}`);
  console.log(`  description  ${proposal.description ?? "(none)"}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
