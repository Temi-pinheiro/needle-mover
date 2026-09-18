import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Settings, Workspace } from "@/lib/db/types";
import {
  ActionForm,
  Field,
  InstantToggle,
  RemoveWorkspace,
  Toggle,
} from "@/components/SettingsClient";
import { WebhookDetails } from "@/components/WebhookDetails";
import { TeamScope } from "@/components/TeamScope";
import { addWorkspace, saveSchedule } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settingsRes, workspacesRes] = await Promise.all([
    db().from("settings").select("*").maybeSingle(),
    db().from("workspaces").select("*").order("created_at"),
  ]);

  const settings = settingsRes.data as Settings | null;
  const workspaces = (workspacesRes.data ?? []) as Workspace[];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <main className="relative z-0 mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
      <header className="enter mb-12 flex items-baseline justify-between border-b border-line pb-5">
        <p className="label">Settings</p>
        <Link href="/" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
          Back to today
        </Link>
      </header>

      <div className="space-y-6">
        {/* ------------------------------------------------------ schedule -- */}
        <Section
          index={1}
          title="Where the brief goes"
          note="The timezone decides what counts as today. Everything else the scheduler used has been removed."
        >
          <ActionForm action={saveSchedule} submitLabel="Save">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Email" name="email" defaultValue={settings?.email} type="email" />
              <Field
                label="Timezone"
                name="timezone"
                defaultValue={settings?.timezone}
                placeholder="Africa/Lagos"
              />
            </div>
          </ActionForm>
        </Section>

        {/* ------------------------------------------------------ ventures -- */}
        <Section
          index={2}
          title="Ventures"
          note="One Linear team each, or a whole organisation. Two ventures sharing an organisation must each be scoped to their own team, or they compete for the same issues and one ends up showing nothing."
        >
          {workspaces.length > 0 && (
            <ul className="mb-8 divide-y divide-line border-y border-line">
              {workspaces.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="text-[15px] text-ink">{w.venture_name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                      {w.last_synced_at
                        ? `synced ${new Date(w.last_synced_at).toLocaleString()}`
                        : "never synced"}
                    </p>
                  </div>
                  <div className="flex items-center gap-5">
                    <TeamScope workspaceId={w.id} teamKey={w.linear_team_key} />
                    <InstantToggle label="Active" workspaceId={w.id} field="active" checked={w.active} />
                    <InstantToggle
                      label="Private"
                      workspaceId={w.id}
                      field="is_private"
                      checked={w.is_private}
                    />
                    <RemoveWorkspace workspaceId={w.id} name={w.venture_name} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <ActionForm action={addWorkspace} submitLabel="Add venture">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Venture name" name="venture_name" placeholder="Meridian" />
              <Field
                label="Linear personal API key"
                name="api_key"
                type="password"
                placeholder="lin_api_…"
                hint="Linear → Settings → Security & access → Personal API keys"
              />
            </div>
            <Toggle
              label="Private venture"
              name="is_private"
              hint="Shows as “Focused on another project” on every guest link except its own."
            />
          </ActionForm>
        </Section>

        {/* -------------------------------------------------------- webhooks -- */}
        {workspaces.length > 0 && (
          <Section
            index={3}
            title="Webhooks"
            note="Optional, and now more useful than it was: nothing syncs on a schedule any more, so without a webhook the cache only refreshes when you plan a day. In Linear: Settings → API → Webhooks → New webhook, subscribe to Issues, and paste these. Needs a deployed URL, because Linear cannot reach localhost."
          >
            <div className="divide-y divide-line border-y border-line">
              {workspaces.map((w) => (
                <WebhookDetails
                  key={w.id}
                  ventureName={w.venture_name}
                  url={`${appUrl}/api/webhooks/linear/${w.id}`}
                  secret={w.webhook_secret}
                />
              ))}
            </div>
          </Section>
        )}

        {/* -------------------------------------------------------- account -- */}
        <Section index={4} title="Account">
          <form action="/auth/signout" method="post">
            <button className="pressable rounded-md border border-line px-4 py-2 text-[13px] text-ink-muted transition-colors hover:text-ink">
              Sign out
            </button>
          </form>
        </Section>
      </div>
    </main>
  );
}

function Section({
  index,
  title,
  note,
  children,
}: {
  index: number;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="enter rounded-xl border border-line bg-surface px-6 py-7 sm:px-8"
      style={{ "--index": index } as React.CSSProperties}
    >
      <h2 className="editorial text-[1.5rem] text-ink">{title}</h2>
      {note && <p className="mb-7 mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">{note}</p>}
      {!note && <div className="mb-7" />}
      {children}
    </section>
  );
}
