import { db } from "@/lib/db/client";
import type { Capture } from "@/lib/db/types";
import { getSettings } from "@/lib/day";
import { localDate } from "@/lib/time";
import { captureChrome, loadVentures } from "@/lib/capture/pipeline";
import { blankProposal } from "@/lib/capture/resolve";
import { audioUrl } from "@/lib/capture/storage";
import { HeaderNav } from "@/components/HeaderNav";
import { CaptureInbox, type InboxItem } from "@/components/CaptureInbox";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const settings = await getSettings();
  const today = localDate(new Date(), settings.timezone);

  const [capturesRes, ventures, chrome] = await Promise.all([
    db().from("captures").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    loadVentures(),
    captureChrome(),
  ]);
  const captures = (capturesRes.data ?? []) as Capture[];

  const items: InboxItem[] = await Promise.all(
    captures.map(async (c) => ({
      id: c.id,
      source: c.source,
      rawText: c.raw_text,
      createdAt: c.created_at,
      audioUrl: c.audio_path ? await audioUrl(c.audio_path) : null,
      // Null means Claude never produced one; the item still gets a form.
      parsed: c.proposed_issue !== null,
      proposal: c.proposed_issue ?? blankProposal(c.raw_text, ventures),
    })),
  );

  return (
    <main className="relative z-0 mx-auto w-full max-w-3xl px-5 pb-24 pt-16 sm:px-8">
      <HeaderNav eyebrow="Inbox" date={today} capture={chrome} current="inbox" />
      <CaptureInbox
        items={items}
        ventures={ventures}
        today={today}
        timezone={settings.timezone}
      />
    </main>
  );
}
