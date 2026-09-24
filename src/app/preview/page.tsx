import { notFound } from "next/navigation";
import { NowView, type NowViewProps } from "@/components/NowView";
import { DayClosed } from "@/components/DayClosed";
import { SharePreview } from "@/components/SharePreview";
import type { ClosedIssue } from "@/lib/recap";

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

  if (variant === "closed" || variant === "closed-quiet") {
    return <ClosedPreview quiet={variant === "closed-quiet"} />;
  }

  if (variant === "share") return <SharePreview />;

  const base: NowViewProps = {
    dayId: "preview",
    date: "2026-09-16",
    active: {
      id: "nm",
      identifier: "MER-214",
      title: "Ship the pricing page",
      url: "https://linear.app",
      ventureName: "Meridian",
      projectName: "Launch pricing",
      projectTarget: "2026-10-01",
      projectProgress: 0.42,
    },
    blockReason: null,
    started: false,
    done: false,
    firstStep: "Open the Meridian pricing doc and list three tiers.",
    reason:
      "It is the only open task that moves the Launch pricing target, which lands in two weeks and is still under half done. Everything above it on urgency was either blocked or belongs to a project with no date.",
    carryOverDays: 0,
    needsSplit: false,
    degraded: false,
    alsoToday: [
      {
        id: "a1",
        identifier: "MER-201",
        title: "Reply to the Figma thread on onboarding copy",
        url: "#",
        ventureName: "Meridian",
        projectName: "Onboarding",
        reason: "Three people are waiting on it before they can keep going",
        started: false,
        done: false,
      },
      {
        id: "a2",
        identifier: "NBD-88",
        title: "Send the revised statement of work",
        url: "#",
        ventureName: "Northbound",
        projectName: "Client retainer",
        reason: "The scope call was a week ago and the quote goes stale",
        started: true,
        done: false,
      },
      {
        id: "a3",
        identifier: "NBD-91",
        title: "Confirm the October workshop dates",
        url: "#",
        ventureName: "Northbound",
        projectName: null,
        reason: "The venue holds the room until Friday",
        started: false,
        done: true,
      },
    ],
  };

  const variants: Record<string, Partial<NowViewProps>> = {
    default: {},
    started: { started: true },
    done: { started: true, done: true },
    blocked: {
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


/** The closed day, at the volume that made the flat list unreadable. */
function ClosedPreview({ quiet }: { quiet: boolean }) {
  const make = (project: string, venture: string, prefix: string, titles: string[]): ClosedIssue[] =>
    titles.map((title, i) => ({
      identifier: `${prefix}-${100 + i}`,
      title,
      url: "#",
      ventureName: venture,
      projectName: project,
      linearProjectId: `lin_${project.toLowerCase().replace(/\s+/g, "_")}`,
      workspaceId: "preview",
    }));

  const closed: ClosedIssue[] = quiet
    ? make("Guest links", "Northbound", "NBD", ["Collaborator link projection", "Revocation and expiry"])
    : [
        ...make("Needle Mover", "Northbound", "NBD", [
          "Qualify issue identifiers when two ventures produce the same one",
          "A venture is a Linear team, not a Linear organisation",
          "Operational scripts: migrations, env:check, seed, scope",
          "Linear webhooks with signed, replay-protected deliveries",
          "Close day and the recap",
          "Midday nudge over web push",
          "Settings page",
          "Auth, Supabase Google sign-in restricted to one address",
        ]),
        ...make("Guest links", "Northbound", "NBD", [
          "Collaborator link, one per venture",
          "Personal link for friends and family",
          "Private venture override",
        ]),
        ...make("Sales funnel", "Halyard", "HLY", [
          "Walk the client through the funnel",
          "Finish the discovery deck",
          "Send the revised statement of work",
          "Confirm October workshop dates",
          "Draft the Q4 partner update",
        ]),
        ...make("Bord", "Halyard", "HLY", ["Pricing page copy", "Onboarding email sequence"]),
      ];

  return (
    <DayClosed
      date="2026-09-17"
      summary={
        quiet
          ? "A thin day. The needle mover did not move and two small guest-link tasks closed against a target that is still three weeks out."
          : "Eighteen issues closed across both ventures, most of them the Needle Mover build itself. The Halyard discovery deck finally shipped, which unblocks the funnel walkthrough that has been waiting on it since Monday."
      }
      closed={closed}
      movements={
        quiet
          ? []
          : [
              {
                name: "Needle Mover",
                ventureName: "Northbound",
                targetDate: "2026-10-01",
                before: 0.31,
                after: 0.58,
              },
              {
                name: "Sales funnel",
                ventureName: "Halyard",
                targetDate: "2026-09-30",
                before: 0.4,
                after: 0.52,
              },
            ]
      }
      tomorrow={{
        identifier: "HLY-127",
        title: "Rebuild the sales funnel and walk the client through it",
        ventureName: "Halyard",
      }}
      tomorrowNote="The deck is done, so the walkthrough is the next thing standing between this and a signed scope."
    />
  );
}
