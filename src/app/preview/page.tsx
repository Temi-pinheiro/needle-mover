import { notFound } from "next/navigation";
import { NowView, type NowViewProps } from "@/components/NowView";

/**
 * Renders the Now view against fabricated data so the design can be judged
 * before any credentials exist. Development only — 404s in production.
 */
export default function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview searchParams={searchParams} />;
}

async function Preview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const variant = typeof params.v === "string" ? params.v : "default";

  const base: NowViewProps = {
    dayId: "preview",
    date: "2026-09-16",
    active: {
      id: "nm",
      identifier: "MEN-214",
      title: "Ship the pricing page",
      url: "https://linear.app",
      ventureName: "Meridian",
      projectName: "Launch pricing",
      projectTarget: "2026-10-01",
      projectProgress: 0.42,
    },
    showingBackup: false,
    blockReason: null,
    started: false,
    done: false,
    firstStep: "Open the Meridian pricing doc and list three tiers.",
    reason:
      "It is the only open task that moves the Launch pricing target, which lands in two weeks and is still under half done. Everything above it on urgency was either blocked or belongs to a project with no date.",
    focusWindow: "Focus window 09:00–12:00",
    carryOverDays: 0,
    needsSplit: false,
    degraded: false,
    alsoToday: [
      { id: "a1", identifier: "MEN-201", title: "Reply to the Figma thread on onboarding copy", url: "#", ventureName: "Meridian", projectName: null, projectTarget: null, projectProgress: null },
      { id: "a2", identifier: "NBD-88", title: "Send the revised statement of work", url: "#", ventureName: "Northbound", projectName: null, projectTarget: null, projectProgress: null },
      { id: "a3", identifier: "NBD-91", title: "Confirm the October workshop dates", url: "#", ventureName: "Northbound", projectName: null, projectTarget: null, projectProgress: null },
    ],
  };

  const variants: Record<string, Partial<NowViewProps>> = {
    default: {},
    started: { started: true },
    done: { started: true, done: true },
    blocked: {
      showingBackup: true,
      blockReason: "Waiting on the contract from legal",
      active: {
        id: "bk",
        identifier: "NBD-12",
        title: "Draft the Q4 partner update",
        url: "https://linear.app",
        ventureName: "Northbound",
        projectName: null,
        projectTarget: null,
        projectProgress: null,
      },
    },
    stale: { carryOverDays: 3, needsSplit: true, degraded: true },
  };

  return <NowView {...base} {...variants[variant]} />;
}
