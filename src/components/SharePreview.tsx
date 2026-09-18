"use client";

import { ShareCard } from "./ShareCard";
import { ShareButton } from "./ShareButton";

const SAMPLE = {
  ventureName: "Northbound",
  title: "Prove the recap end to end",
  projectName: "Needle Mover",
  projectTarget: "2026-09-21",
  date: "2026-09-18",
};

const LONG = {
  ...SAMPLE,
  title: "Work on the sales funnel and walk the client through the whole thing before Friday",
  ventureName: "Halyard",
  projectName: "Sales funnel",
  projectTarget: "2026-09-30",
};

const BARE = {
  ventureName: "Halyard",
  title: "Confirm or register the business entity",
  projectName: null,
  projectTarget: null,
  date: "2026-09-18",
};

/**
 * The share image, on screen. It normally renders off-screen, so this is the
 * only way to judge it — including how a long title behaves and what an
 * untargeted task looks like with no project line.
 */
export function SharePreview() {
  return (
    <main className="relative z-0 mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
      <header className="mb-10 flex items-baseline justify-between border-b border-line pb-5">
        <p className="label">Share card</p>
        <ShareButton {...SAMPLE} />
      </header>

      <div className="space-y-10">
        <Sample label="Short title, targeted project" {...SAMPLE} />
        <Sample label="Long title" {...LONG} />
        <Sample label="No project" {...BARE} />
      </div>

      <p className="mt-12 max-w-[58ch] text-[13px] leading-relaxed text-ink-muted">
        The card is fixed to light regardless of your theme, because the recipient
        sees a PNG and it should look the same to everyone. Press Share above to
        check the rasterised version matches what is drawn here, particularly the
        serif.
      </p>
    </main>
  );
}

function Sample({
  label,
  ...card
}: { label: string } & React.ComponentProps<typeof ShareCard>) {
  return (
    <section>
      <p className="label mb-3">{label}</p>
      <div className="origin-top-left scale-[0.78] sm:scale-100">
        <ShareCard {...card} />
      </div>
    </section>
  );
}
