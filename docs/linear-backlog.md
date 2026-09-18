@@PROJECT | Needle Mover
summary: Picks one needle mover each morning from Linear across several ventures, keeps it in front of you all day, and reports at night what actually moved.
workspace: personal
team: TEM
---
A personal web app that answers one question every morning: of everything open across every venture, which single task moves a target furthest today?

## The problem it addresses

Three ways a day goes sideways, and the design response to each:

| Derailer | Response |
| --- | --- |
| Too many ventures competing | One needle mover per day, ranked across all of them against project targets. Everything else hides in an "also today" drawer capped to two ventures. |
| Hard to start the big task | Every pick comes with a first step that takes under 10 minutes and starts with a verb. |
| Losing track mid-day | A Now view showing only the current task, plus one midday nudge. |

Laptop-first, deliberately — the point is less phone time.

## How the pick works

Two passes, which keeps cost low and every pick explainable.

**Code scores.** Five weighted factors, each resolving to 0–1: goal leverage (35%), deadline pressure (25%), unblocks others (15%), momentum (15%), calendar fit (10%). The top 15 form a shortlist.

**Claude chooses** from that shortlist and returns structured output: the needle mover, a backup that stays startable if the first is blocked, the reason, the first step, and a jargon-free line for sharing.

Goal leverage gates entirely on the issue's project having a target date. When too little of the backlog is targeted for that comparison to mean anything, the weight is redistributed rather than silently zeroed, and the day is flagged as degraded.

## Stack

Next.js on Vercel · Supabase Postgres · Claude (Opus 5 for the pick and recap, Haiku for capture parsing) · Resend · Web Push · Linear GraphQL.

## Current state

Phases 1 and 2 are functionally complete: the morning brief, the Now view, close-day with recap, the midday nudge, the cutoff reminder and webhooks all exist. 123 tests.

Nothing is deployed. The recap, the nudge and an actually-sent brief have never run end to end — see the open issues for exactly which seams are unproven.

@@MILESTONE | Phase 1 — Core pick
---
The smallest version that proves the idea: one real needle mover in the inbox each morning. Sign-in, one Linear workspace, Google Calendar, scoring plus the Claude pick, a Now view with Start / Blocked / Done, and the morning brief email.

Done when a useful brief arrives on five consecutive weekdays.

@@MILESTONE | Phase 2 — Full picture
---
Everything needed for the day to close honestly: all Linear workspaces, webhooks, progress snapshots, close-day with a recap email, the cutoff reminder and the midday push nudge.

Done when a recap shows correct before/after progress for at least two ventures.

@@MILESTONE | Deploy and prove
---
Not in the original plan, and it turned out to sit here rather than later. Three things cannot be verified on localhost: pg_cron reaching /api/tick, Linear reaching a webhook endpoint, and the brief actually arriving by email. Phase 3 also needs a public URL before a guest link means anything.

This milestone exists because "written and tested" and "observed working" diverged sharply on this project, and the gap was only ever closed by running things for real.

@@MILESTONE | Phase 3 — Guest links
---
Read-only links so collaborators and family know where the day is going without messaging. A collaborator link per venture, a personal link, the plain-words focus line, the private override, revocation and expiry.

Done when one collaborator and one person outside work use their links for a week without asking for a status update.

@@MILESTONE | Phase 4 — Capture
---
Quick-capture text and voice notes, parsed by Claude into proposed issues, held in an approval inbox. Nothing reaches Linear until approved.

Done when a week of commitments made in chat gets into Linear through the inbox.

@@MILESTONE | Phase 5 — Tuning
---
Make the ranking earn trust: the three-day carry-over rule, the swap log, and weight adjustments driven by what actually gets swapped away.

Done when swaps drop below one per week.

@@UPDATE | 2026-09-16
health: onTrack
---
Foundations, and a deliberate choice about what to build first.

The spec's Phase 1 bundles auth, two integrations, scoring, a UI and email before anything is observable. I proposed a throwaway CLI harness first — the riskiest unknown is whether the ranking picks the right task, and none of that infrastructure is needed to find out. That was declined in favour of going straight at Phase 1, so the mitigation was a pure, heavily tested scorer plus a `linear:check` script that could answer the same question later.

Landed: the schema, the scoring engine, credential encryption, the Linear client, the Claude pick, the timezone layer, Google Calendar free/busy, the day pipeline, `/api/tick`, the brief email and the Now view.

Four things the spec didn't say that the implementation needed:

- **`days` had no columns to make the tick idempotent.** The spec says each step "checks the days table first", but there was nothing there to check. Added per-step `*_sent_at` timestamps.
- **Goal leverage is a cliff, not a slope.** It gates entirely on a project target date, so a backlog without them loses 35% of the score to zero. Added renormalisation.
- **Missing estimates score neutral, not zero.** Penalising an unestimated issue would bury most of a real backlog.
- **Guest-link filtering has to happen server-side.** If a page fetches and filters in React, the private titles are already in the payload.

The Now view was built on the high-end-visual-design system, then reworked to minimalist-ui semantics keeping the same card-and-rail layout.

@@UPDATE | 2026-09-17
health: onTrack
---
The day the code met real data, and then Phase 2 got built on top of it.

## Every Linear query was valid on the first run

The `viewer.id` filter, the relations/inverseRelations direction, the completed-since filter — all correct against the live workspace. That retired the largest integration risk in one command.

## The ranking was not

`linear:check` reported four candidates tied for first and a spread of 0.138, because zero of four active projects carried a target date. Goal leverage was being renormalised away every morning, leaving Claude to invent the whole ranking unaided. It does this well — the first real pick broke a tie on "the funnel task needs the client's time, which you don't control today", a constraint the scorer cannot see — but a ranking reinvented each morning is neither stable nor explainable.

Rather than weaken the scorer to fit a thin backlog, we agreed criteria for Linear itself: every real outcome gets a target date, work that should ever be a needle mover lives inside one, priority and estimate always set. The corollary is the useful half — admin and one-offs stay project-less and rank low automatically.

`MIN_TARGETED_CANDIDATES = 8` also turned out unreachable against a seven-issue backlog; an absolute floor meant goal leverage could never switch on however well the projects were kept. It is proportional now.

## Phase 1 finished and Phase 2 built

Auth, the settings page, close-day with the recap, the midday nudge over web push, the cutoff reminder and Linear webhooks. The tick now has four steps, each claiming its own column before acting and releasing on failure.

Decisions worth recording:

- **Close-day order is sync, then snapshot, then gather.** Snapshotting first would record yesterday's figures as today's close — exactly the silent wrongness the recap exists to prevent.
- **"Closed today" is read from Linear, not our cache**, because sync deletes issues once they leave the open set, which is precisely the set the recap is about.
- **Tomorrow's candidate comes from the scorer, not Claude**, so the recap cannot promise what the morning brief then contradicts.
- **Midday is the midpoint of brief and cutoff**, not a fixed noon.
- **Webhooks refuse to create rows they don't already cache** — a half-populated row is worse than waiting fifteen minutes for a whole one.

## A data-model error, found by asking why one venture showed no work

Two ventures had been seeded against what turned out to be one Linear organisation with two teams. The model assumed one venture equals one organisation, so both synced the whole org, every row collided on the unique `linear_issue_id`, and whichever sync finished last took everything. The zero was a lost race, not a fact. A venture is now a Linear *team*.

Asking whether a venture from a *separate* Linear workspace would break anything surfaced a latent version of the same class of bug: identifiers like `ENG-1` are unique within an organisation but not across them, and the pick resolver keyed its lookup on identifier alone.

## Four bugs, one pattern

`syncAll()` sat inside the brief step, so nothing synced before 07:00 and the manual pick button would have found an empty cache. `seed show` rendered a *failed* query identically to an empty table. The first migration-status script reported a migration applied that had never run. And `.env.example` put comments on the same line as values, leaving `ALLOWED_EMAIL` 69 characters long with the comment glued on — which would have locked the account out of its own app while presenting as "that account is not the one this app is set up for".

Every one of them was found by running something against reality. None was found by writing more tests, and 117 were passing throughout.

@@ISSUE | Database schema with per-step idempotency columns
state: done
milestone: Phase 1 — Core pick
labels: data
priority: 2
---
The spec's nine tables, plus four things it needed but did not list.

`days` gained `brief_sent_at`, `nudge_sent_at`, `reminder_sent_at` and `recap_sent_at`. The spec says each scheduled step "checks the days table first, so a repeated tick never sends twice" — but there was nothing in the table to check. A unique constraint on `days.date` stops a page load racing the tick into two rows for one day.

`day_events.related_issue_id` records what a swap chose *instead*, which is the signal Phase 5 tunes weights from. Cheaper than a separate swaps table and sufficient.

@@ISSUE | Scoring engine with a proportional goal-leverage gate
state: done
milestone: Phase 1 — Core pick
labels: scoring
priority: 1
---
The five weighted factors, pure and tested, with no I/O so the ranking can be reasoned about without a database.

Two decisions that differ from a literal reading of the spec:

**Missing estimates and an unreachable calendar score neutral (0.5), not zero.** Penalising an unestimated issue would bury most of a real backlog.

**Goal leverage is renormalised away when too little of the backlog is targeted.** It gates entirely on a project target date, so without renormalisation 35% of the score silently collapses to zero for nearly every candidate. The gate is proportional — `min(n, max(3, ceil(n/2)))` — because an absolute floor of 8 was unreachable against a seven-issue backlog, meaning goal leverage could never switch on however well the projects were maintained.

The reason the gate exists at all: if one issue out of seven has a target, it collects 35% of the score unopposed, which is a distortion rather than a signal.

@@ISSUE | Encrypt Linear keys and the Google refresh token at rest
state: done
milestone: Phase 1 — Core pick
labels: data, auth
priority: 2
---
AES-256-GCM at the application level rather than Supabase Vault, so the ciphertext is just a string in a column and survives a database move.

Includes a constant-time comparison used by the tick secret and webhook signatures, and the token generator for guest links.

@@ISSUE | Linear GraphQL client, queries and pure mapping layer
state: done
milestone: Phase 1 — Core pick
labels: linear
priority: 2
---
Filters by an explicit `viewer.id` rather than the `isMe` comparator, which is not in Linear's public filtering documentation.

The part most likely to be subtly wrong is kept pure and tested: `relations` and `inverseRelations` use *different* field names for the other side of a relation, because the issue is the source in one and the target in the other. Only open issues on the far side count — being blocked by something already shipped is not a blocker, and unblocking a cancelled issue is not leverage.

@@ISSUE | Daily pick via Claude with deterministic repair
state: done
milestone: Phase 1 — Core pick
labels: claude, scoring
priority: 1
---
Opus 5 with zod structured output. Claude answers in issue identifiers rather than UUIDs, so a hallucination is visible in a log.

The model can return a backup equal to the needle mover, or an "also today" list breaking the two-venture cap. Because this runs once a day, repairing deterministically beats a retry loop: a slightly less ideal brief beats a brief that does not arrive. An unknown backup falls through to the next-highest unblocked issue.

The one failure not papered over is a needle mover outside the shortlist — substituting there would leave the reason and first step describing a different task.

@@ISSUE | linear:check — verify every query and dry-run the real ranking
state: done
milestone: Phase 1 — Core pick
labels: linear, scoring, ops
priority: 2
---
Runs every Linear query against a real key and reports the exact field Linear rejects, which converts schema guesswork into a ten-second check.

More importantly it dry-runs the scorer over the real backlog and prints per-factor contributions, the spread from first to last, and how many candidates are tied at the top. A shortlist that is effectively unordered makes Claude's pick a coin toss, and that should be visible before a week of briefs rather than after.

Also reports each team's configured estimate scale. Estimates are a team-level feature in Linear; a team with them switched off returns null for every issue, sending both scope share and calendar fit to their neutral fallback with nothing on screen saying why.

@@ISSUE | Timezone handling built on Intl rather than a date library
state: done
milestone: Phase 1 — Core pick
labels: backend
priority: 2
---
The scheduler runs in UTC and asks what the local time is on every pass, which is what makes moving between Lagos and Bali need no settings change.

Built on `Intl` so the zone rules come from the platform's own tz database. Resolving a local time to an instant uses a two-pass offset correction, which is what gets 09:00 local right on both sides of a daylight-saving transition. Tested against a fixed-offset zone, a second fixed-offset zone eight hours away, and a zone that observes DST.

`date-fns` and `@date-fns/tz` were installed for this and then removed — once the maths was on `Intl` they were dead weight.

@@ISSUE | Google Calendar free/busy and focus-window selection
state: done
milestone: Phase 1 — Core pick
labels: calendar
priority: 2
---
The free-block maths is pure and tested: merges overlapping *and* back-to-back meetings into one wall of busy, clips meetings straddling the window edges, ignores those entirely outside it, and drops sub-30-minute slivers not worth suggesting as a focus window.

Ties break toward the earlier block — an earlier slot is a better suggestion than an equally long one after lunch.

@@ISSUE | Day planning pipeline
state: done
milestone: Phase 1 — Core pick
labels: backend, scoring
priority: 2
---
Candidate loading, carry-over streaks, the focus window, and the score → pick → persist path.

`materializeDay` is race-safe against the unique constraint, because both the tick and a page load create today's row. The carry-over walk stops at the first day that was finished, had no needle mover, or had a different one, so a streak only ever describes one issue.

@@ISSUE | /api/tick scheduler with claim-then-release
state: done
milestone: Phase 1 — Core pick
labels: backend, ops
priority: 1
---
One protected route, every 15 minutes, doing whatever is due and not yet done.

Each timed step claims its `*_sent_at` column atomically before doing any work and releases it on failure. Claiming after the work would let two overlapping ticks both send; claiming without releasing would let a crash mid-send permanently suppress that day's step.

Running in UTC and checking local time on every pass is what makes the timezone switch a no-op.

@@ISSUE | pg_cron schedule via pg_net
state: done
milestone: Phase 1 — Core pick
labels: ops
priority: 3
---
Drives the tick from the database every 15 minutes, so the schedule costs nothing and does not depend on a paid Vercel plan — the free tier caps cron at once per day, which this design cannot work with.

The app URL and tick secret are read from Vault rather than written into the migration, so neither is committed.

@@ISSUE | Morning brief email
state: done
milestone: Phase 1 — Core pick
labels: email
priority: 2
---
React Email, with a plain-text part alongside the HTML so it reads on a watch and stays out of spam.

The preview line carries the task itself, since that is what shows in an inbox list. Surfaces the carry-over count, the three-day split prompt, and a note when the ranking ran degraded — a brief that quietly ranked badly is worse than one that says it did.

@@ISSUE | Now view — card with context rail, Start / Blocked / Done
state: done
milestone: Phase 1 — Core pick
labels: ui, design
priority: 1
---
One dominant card carrying the task as editorial serif, with a quiet rail showing the project target, progress and why this one won.

Whether the card shows the needle mover or the revealed backup is derived from the event log rather than stored on the day row: "blocked" is a thing that happened at a time, the recap needs that anyway, and a stored column would mean the same fact recorded twice and able to disagree.

**Blocked deliberately does not touch Linear.** Being blocked is a fact about the day, not a workflow state, and guessing at a "Blocked" column in someone's team would be wrong.

Actions write the event log *before* calling Linear, so an outage cannot cost the record that you started, and partial success is reported rather than swallowed.

@@ISSUE | Visual system: minimalist-ui semantics on the card-and-rail layout
state: done
milestone: Phase 1 — Core pick
labels: ui, design
priority: 3
---
Built first on a high-end agency system, then reworked to premium utilitarian minimalism keeping the same layout.

Warm bone canvas, charcoal body text rather than pure black, one structural hairline value used everywhere, crisp radii, and colour treated as scarce and semantic — washed pastels only. The primary action is near-black rather than a brand colour.

Three things had to go because the two systems disagree: the pill-shaped CTA, the button-in-button trailing icon, and resting elevation.

Motion kept from the craft layer: `scale(0.98)` on press over 160ms, entries from `scale(0.985)` and never from zero, custom easing curves with no `ease-in` anywhere, hover gated behind a real pointer, and `prefers-reduced-motion` keeping the fades that explain a change while dropping all movement. The Blocked → backup swap crossfades through a 3px blur, which bridges two cards into one transformation instead of showing both at once.

@@ISSUE | Google Calendar OAuth grant flow
state: done
milestone: Phase 1 — Core pick
labels: calendar, auth
priority: 1
---
The Calendar client existed but nothing could grant it, so free/busy always came back empty and calendar fit was permanently stuck on its neutral fallback. Both routes had been referenced in the setup script's own output as though they existed.

Deliberately a separate OAuth grant from sign-in: Supabase's Google provider only surfaces a refresh token on the very first consent, so one re-login would have killed calendar access permanently. `access_type=offline` plus a forced `prompt=consent` is what guarantees the token comes back.

Learning which account granted access needed no extra scope — the primary calendar's `id` is the account's own email address.

State is checked in constant time against an httpOnly cookie before the code is touched. Setup failures render as readable text rather than redirecting away, because a silent bounce tells you nothing about why it failed.

@@ISSUE | Sync on every tick rather than inside the brief step
state: done
milestone: Phase 1 — Core pick
labels: linear, bug, backend
priority: 1
---
Found by firing the tick against real data for the first time.

`syncAll()` sat inside the brief step, after the claim. Before the brief time the tick logged "not yet" and synced nothing, so the issues cache stayed empty all morning — and because the day planner reads that cache without refreshing it, the manual "pick today's needle mover" button would have reported no candidates on a backlog of seven.

Sync is now its own step on every pass. Until webhooks are live it is the only thing keeping the cache honest for the Now view. The manual path syncs first too, and says so when Linear is unreachable rather than silently ranking stale rows.

No unit test could have caught this. It needed the thing to actually run.

@@ISSUE | brief:preview — run the whole morning path without sending
state: done
milestone: Phase 1 — Core pick
labels: ops, claude
priority: 3
---
The seam unit tests cannot reach is scoring feeding a real Claude call feeding a real email.

Runs sync, score and pick against live data and renders the brief to a file, deliberately never touching `brief_sent_at` so the scheduled brief still goes out on time. Safe to run repeatedly.

@@ISSUE | Hold briefs until a date
state: done
milestone: Phase 1 — Core pick
labels: ops, data
priority: 3
---
For restructuring a backlog, a holiday, or before the first real run.

Deliberately not done by pre-setting `days.brief_sent_at`: that column means "this brief was sent", and writing it when nothing was sent puts a falsehood into the record the recap reads from. Comparison is on plain local dates and inclusive, so a value of today holds today and releases tomorrow.

@@ISSUE | Auth — Supabase Google sign-in restricted to one address
state: done
milestone: Phase 2 — Full picture
labels: auth
priority: 1
---
Entirely server-side: sign-in runs in a server action and the session lives in cookies, so there is no browser Supabase client and the anon key never drives a session in the page.

Middleware uses `getUser()`, which revalidates against Supabase, rather than `getSession()`, which trusts a cookie the browser could have been handed.

An unset allowlist denies everyone — a missing allowlist is a misconfiguration, not an open door. A valid Google account that is not the permitted one has its session torn down in the callback and gets a different message from "not signed in".

@@ISSUE | Settings page
state: done
milestone: Phase 2 — Full picture
labels: ui, ops
priority: 2
---
Schedule, calendar connection, ventures, webhooks and the nudge subscription.

Two things it does that the CLI it replaced did not: a Linear key is **verified against Linear before it is stored**, because a key that does not work is worse than no key — it fails silently inside a scheduled job at 07:00 rather than in front of you. And removing a venture requires typing its name, since it is the only destructive control on the page and it cascades to cached projects and issues.

Every server action re-checks the session independently: middleware gates the page, but a server action is its own endpoint and can be POSTed to directly.

@@ISSUE | Close day and the recap
state: done
milestone: Phase 2 — Full picture
labels: backend, claude, email
priority: 1
---
Snapshots progress, gathers what the day amounted to, has Claude write it up, emails it, and shows the same thing in the app.

**Order is deliberate: sync, then snapshot, then gather.** Snapshotting before the sync would record yesterday's figures as today's close — exactly the silent wrongness this feature exists to avoid.

"Closed today" is read from Linear, not our cache, because sync deletes issues once they leave the open set — precisely the set the recap is about — and work closed directly in Linear has to appear too.

Before/after only reports projects with *both* an opening and closing snapshot, and only those that actually moved; one with no opening figure is skipped rather than reported as having moved from zero.

A failed Claude call falls back to the rendered facts — the facts are the point, the narrative is a nicety. A failed send still closes the day and says so.

@@ISSUE | Midday nudge over web push
state: done
milestone: Phase 2 — Full picture
labels: push, backend
priority: 2
---
Web push rather than a native shell: works in desktop Chrome, Edge, Firefox and Safari with nothing installed, which is far less machinery for one notification a day.

**Midday is the midpoint between the brief and the cutoff**, not a fixed noon — someone who starts at 05:00 and stops at 15:00 does not have the same midday as someone who starts at 09:00.

Skipped when the task is already done, and after the cutoff so a late tick cannot fire "still on it?" at nine in the evening. If no subscription receives it the claim is released rather than recording a nudge that never happened. Subscriptions returning 404 or 410 are deleted rather than retried forever — that is the browser saying it threw the subscription away.

@@ISSUE | Close-day reminder
state: done
milestone: Phase 2 — Full picture
labels: email, backend
priority: 3
---
One email after the cutoff if the day is still open. Skipped entirely when nothing was picked that day, because there is nothing to close.

@@ISSUE | Linear webhooks with signed, replay-protected deliveries
state: done
milestone: Phase 2 — Full picture
labels: linear, backend
priority: 2
---
The 15-minute sync is the backstop; a webhook makes the Now view correct within seconds of a state change.

Verification is the substance, and it is pure and tested. The signature is checked over the **exact bytes received** — parsing and re-serialising the body changes those bytes, and a test covers precisely that mistake. Comparison is constant-time with a length check first so a short signature cannot throw. Deliveries older than a minute are refused per Linear's guidance; one carrying no timestamp is accepted rather than having its age guessed.

The endpoint updates a single row rather than triggering a sync — a webhook storm should not become a sync storm. It refuses to create rows it does not already cache, because doing that properly needs the project mapping and assignee check sync performs, and a half-populated row is worse than waiting fifteen minutes for a whole one. An unknown workspace and an unconfigured one return the same 404, so it cannot be used to enumerate ids.

@@ISSUE | A venture is a Linear team, not a Linear organisation
state: done
milestone: Phase 2 — Full picture
labels: linear, data, bug
priority: 1
---
Two ventures were seeded against one organisation and one of them showed no work at all.

The cause was the data model, not a missing control: sync pulled the whole organisation for each venture, every row collided on the unique `issues.linear_issue_id`, and whichever sync finished last took everything. The zero was a lost race, not a fact. Diagnosed from the database — both ventures had recorded the same `linear_org_id`, and every cached issue carried the same team prefix.

Workspaces now carry an optional team id; null still means the whole organisation, which stays right for a venture that really is one. Issues, projects and the recap's completed-since query all scope through it.

Changing scope clears that venture's cached rows, because they were fetched under the old scope and otherwise the next sync's mark-and-sweep would be the only thing standing between you and issues from a team you had just excluded.

@@ISSUE | Qualify issue identifiers when two ventures produce the same one
state: done
milestone: Phase 2 — Full picture
labels: linear, claude, bug
priority: 2
---
Found while answering whether adding a venture from a *separate* Linear workspace would break anything.

It would not break rows — those key on UUIDs — but an identifier like `ENG-1` is unique within an organisation and not across them. Two organisations each with a team keyed `ENG` would both produce it, and the pick resolver keyed its lookup map on identifier alone, so one entry would silently overwrite the other and Claude's pick would resolve to the wrong issue with nothing in the logs.

Identifiers are now qualified with the venture **only when they actually collide**, so the common case stays short in the prompt and in logs. The prompt and the resolver derive the reference the same way, so they cannot drift. A bare identifier is still accepted and, when ambiguous, takes the higher-scored entry and records a repair rather than guessing silently.

@@ISSUE | Operational scripts: migrations, env:check, seed, scope
state: done
milestone: Phase 2 — Full picture
labels: ops, chore
priority: 3
---
Migrations are applied by hand in the Supabase SQL editor, so there is no migrations table to consult. `pnpm migrations` probes for a column each one adds — and treats a *backfill* migration differently, because probing a column an earlier migration already created reports it applied when it never ran.

`pnpm env:check` reports how the runtime actually parses each value without printing any of them. It exists because `ALLOWED_EMAIL` had parsed to 69 characters with an inline comment glued on, which would have locked the account out of its own app while presenting as "that account is not the one this app is set up for".

`pnpm seed` and `pnpm scope` cover first-run bootstrap and team scoping from the command line.

@@ISSUE | Add target dates to the active Linear projects
state: todo
milestone: Deploy and prove
labels: scoring, chore
priority: 1
---
The single highest-leverage open item, and it is data work rather than code.

Goal leverage is 35% of the score and gates entirely on a project having a target date. `linear:check` currently reports four candidates **tied for first** with a spread of 0.138 — Claude is inventing the whole ranking unaided every morning.

The agreed criteria:

- Every project representing a real outcome gets a target date, landing 2–6 weeks out. Deadline pressure decays to zero at 30 days, so a target further out contributes nothing.
- A project is an outcome, not a bucket. Buckets deliberately get no target date, and their issues correctly rank low.
- Anything that could ever be a needle mover lives inside a targeted project. Admin and one-offs stay project-less and drop out of ranking automatically.
- Priority always set — "no priority" scores 0.1, barely above "low".
- Estimate always set. Both teams are on Fibonacci.

A target date only pays once issues assigned to you sit inside that project. One project is targeted today but sits in a team with no assigned work, so it still moves nothing.

Run `pnpm linear:check` while doing this and watch the spread climb.

@@ISSUE | Deploy to Vercel and wire the scheduler
state: todo
milestone: Deploy and prove
labels: ops
priority: 1
---
Nothing is deployed. Three things cannot be verified without it: pg_cron reaching `/api/tick` (Supabase cannot reach localhost), Linear reaching a webhook endpoint, and a brief actually arriving.

Needs: the Vercel project, every environment variable, the Vault secrets for `app_url` and `tick_secret`, the production redirect URIs added to the Google OAuth client, and `NEXT_PUBLIC_APP_URL` pointed at the deployed origin.

Until then the only ticks that run are manual ones.

@@ISSUE | Prove the recap end to end
state: todo
milestone: Deploy and prove
labels: backend, claude, email
priority: 1
---
`closeDay` has never been executed. Its Claude call, its email and its in-app view are untested against real data.

The pattern on this project has been consistent: every bug that mattered was found by running something for real, never by writing more tests. The sync-inside-the-brief-step bug was invisible to 117 passing tests.

Phase 2's exit criterion is a recap showing correct before/after progress for at least two ventures, which also requires both ventures to have targeted projects with movement.

@@ISSUE | Prove the midday nudge reaches a browser
state: todo
milestone: Deploy and prove
labels: push
priority: 2
---
No browser has ever subscribed, so the push path has never delivered anything.

Enable it in Settings on a laptop, then force a tick after the midday time. Worth checking Safari separately — its push support differs from Chromium's and is the most likely to behave unexpectedly.

@@ISSUE | Register webhooks in Linear for each venture
state: todo
milestone: Deploy and prove
labels: linear, ops
priority: 3
---
The receiving endpoint and its signature verification exist and are tested, but Linear cannot reach localhost so it has never taken a real delivery.

Once deployed: Linear → Settings → API → Webhooks, subscribe to Issues, and paste the URL and secret shown per venture in Settings.

@@ISSUE | Calibrate hours-per-estimate-point
state: todo
milestone: Deploy and prove
labels: scoring
priority: 4
---
Set to 1.5 hours, which is a guess. Both teams are confirmed on Fibonacci, so a single multiplier is the right shape — the scale is built so the number already tracks relative effort.

At 1.5 an 8-pointer reads as about twelve hours. If an 8 means most of a week, it should be nearer 4. It only drives the 10% calendar-fit factor, so this is the least consequential number in the scorer, but it is currently unanchored to anything real.

@@ISSUE | Collaborator link, one per venture
state: backlog
milestone: Phase 3 — Guest links
labels: sharing, backend
priority: 2
---
A read-only link showing today's needle mover (venture name and task title, even when it belongs to another venture), that venture's in-progress issues this week, progress on its project targets, and what is next for them.

Never shows: other ventures' issue lists, descriptions or comments; calendar event titles; the capture inbox.

**The projection must be built server-side.** If the page fetches and filters in React, the private titles are already in the payload. This is the one failure mode on this feature with real-world consequences, and the projection should be a pure function with its own tests.

@@ISSUE | Personal link for friends and family
state: backlog
milestone: Phase 3 — Guest links
labels: sharing
priority: 3
---
Busy and free blocks for today, a plain-words line about the focus, and the current local time.

Never shows venture names, task titles or calendar event titles. The plain-focus line is already generated by the daily pick and stored on the day row.

@@ISSUE | Editable plain-words focus line
state: backlog
milestone: Phase 3 — Guest links
labels: sharing, ui
priority: 4
---
Claude already rewrites the needle mover into one jargon-free line — "Deep work on a new product launch" — and it is stored on the day row.

This is the control to edit it from the Now view before it shows on a personal link.

@@ISSUE | Private venture override
state: backlog
milestone: Phase 3 — Guest links
labels: sharing, data
priority: 2
---
Some work is confidential. A venture can be marked private and issues can carry a `private` label; those items show as "Focused on another project" on every link except that venture's own.

The `is_private` flag already exists on workspaces and is settable in Settings. The issue-level label and the projection logic are not built.

@@ISSUE | Guest link safeguards — revocation, expiry, rate limiting, noindex
state: backlog
milestone: Phase 3 — Guest links
labels: sharing, ops
priority: 2
---
Each link is a long random token at `/s/[token]`, revocable instantly, optionally with an expiry.

Pages marked noindex and rate-limited. Every page shows a "last updated" time rather than a live status, so a forgotten update is never misleading. View counts per link, so it is visible which links are actually used.

The `share_links` table exists with `token`, `expires_at`, `revoked_at` and `view_count`. Nothing reads it yet.

@@ISSUE | Quick-capture text box on a keyboard shortcut
state: backlog
milestone: Phase 4 — Capture
labels: capture, ui
priority: 2
---
The five-second path from "I'll send that over" to a Linear issue. A shortcut opens a box anywhere in the app; what is typed becomes a capture.

Nothing reaches Linear until approved.

@@ISSUE | Voice-note capture
state: backlog
milestone: Phase 4 — Capture
labels: capture, ui
priority: 3
---
A record button producing an audio file, stored in Supabase Storage and deleted once the transcription is approved.

Depends on choosing a speech-to-text provider — Claude's API does not take audio input, so this is a separate service.

@@ISSUE | Choose a speech-to-text provider
state: backlog
milestone: Phase 4 — Capture
labels: capture, ops
priority: 3
---
An open question from the original spec that was never settled, and it blocks voice capture.

Needs: accurate on short, informal, accented speech with product and client names in it; cheap at maybe a dozen clips a day; and a plain HTTP API. Worth weighing a hosted Whisper endpoint against a dedicated speech API, on accuracy for proper nouns rather than on price — the volume is too low for cost to decide it.

@@ISSUE | Claude parses each capture into a proposed issue
state: backlog
milestone: Phase 4 — Capture
labels: capture, claude
priority: 2
---
One small call per capture producing a title, venture, Linear project and optional due date.

Deliberately a faster, cheaper model than the daily pick: turning "call Dayo about pricing" into an issue needs no depth, and this runs many times a day where the pick runs once.

@@ISSUE | Approval inbox that creates issues in Linear
state: backlog
milestone: Phase 4 — Capture
labels: capture, linear, ui
priority: 2
---
Each capture is approved, edited or discarded. Approved items are created in the right workspace, and only then.

The brief already reports a pending count, so the loop closes visibly. The `captures` table exists with `source`, `raw_text`, `proposed_issue`, `status` and `linear_issue_id`; nothing reads or writes it yet.

@@ISSUE | Three-day carry-over split prompt
state: backlog
milestone: Phase 5 — Tuning
labels: scoring
priority: 3
---
An unfinished needle mover already gets a momentum boost the next day, and both the brief and the rail already say when something has been carried three days.

What is missing is the action: a way to split it into smaller issues from the app, or drop its priority, rather than just being told about it.

@@ISSUE | Use the swap log to tune the weights
state: backlog
milestone: Phase 5 — Tuning
labels: scoring, data
priority: 3
---
Every manual swap is already recorded with what was chosen instead — `day_events` type `swapped`, with `related_issue_id` carrying the replacement.

Nothing reads it yet. A swap is the clearest possible signal that the ranking was wrong, and the pair of scores involved says *how* wrong. Enough of them should move the weights off the spec's starting values, which were never more than a reasonable guess.

Phase 5's exit criterion is swaps dropping below one per week.

@@ISSUE | Manual swap control in the Now view
state: backlog
milestone: Phase 5 — Tuning
labels: ui, scoring
priority: 3
---
The spec allows replacing the needle mover from the Now view, and the server action plus the event logging already exist.

There is no control that calls it, so the swap log is currently always empty — which means the tuning work above has no input.

@@ISSUE | A debug view for score breakdowns
state: backlog
milestone: Phase 5 — Tuning
labels: ui, scoring
priority: 4
---
Promised when the throwaway harness was skipped, and largely superseded by what `linear:check` now prints on the command line.

Still worth having in-app when a pick looks wrong and the question is *why* — per-candidate contributions, the weights actually applied, and whether the day ran degraded.

@@MILESTONE | Open source release
---
Ship this as a self-host template, given away free. Not a hosted service: the goal is goodwill in the Linear and indie community ahead of a later paid product, not revenue from this.

That decision settles several open questions rather than deferring them. The singleton schema is correct rather than debt, because one instance per person is the shape. Bring-your-own-keys is right for every service, because there is no operator in the middle to hold anything. Guest links get materially safer, because each person's links live on their own deployment and a projection bug is a personal embarrassment rather than a breach across customers.

What it makes newly important is everything that assumes the person running this was here when it was written.

@@ISSUE | Scrub personal and client information before the repo is public
state: todo
milestone: Open source release
labels: chore, docs
priority: 1
---
Tracked files currently carry things that should not be published.

`context.md` contains a personal email address, the Linear organisation slug, venture names, and a colleague's first name. `docs/linear-backlog.md` and the preview fixtures in `src/app/preview/page.tsx` also name that colleague, in copy that was written as realistic sample data.

The harder half: **git history carries all of it too**, so editing the files does not fix it. Three options, in increasing effort — accept it and scrub only the working tree, rewrite history with filter-repo before the first push, or start a clean public repository and import the code as one commit.

Worth deciding before any push, because the first push is the point of no return.

@@ISSUE | Migrations a stranger can apply
state: todo
milestone: Open source release
labels: data, ops
priority: 1
---
Migrations are currently pasted by hand into the Supabase SQL editor, and `pnpm migrations` exists because there is no migrations table to consult — it probes for a column each one adds to work out what landed.

That is a reasonable arrangement for the person who was present when each migration was written. For someone cloning the repo it is the first thing they hit and the most likely thing to make them give up.

Needs either `supabase db push` against a linked project, or a single setup command that applies everything in order and reports what it did. The probe script stays useful either way, as a verification step rather than the mechanism.

@@ISSUE | README with the deploy story
state: todo
milestone: Open source release
labels: docs
priority: 1
---
There is no README. Someone arriving cold has no idea what this is, who it is for, or what it costs to run.

Needs: what it does in two sentences, a screenshot of the Now view and the recap, the five services it depends on and roughly what each costs, the deploy path end to end, and an honest statement of what is not built.

`.env.example` becomes the contract and should be treated as documentation rather than a checklist.

@@ISSUE | Document the Google OAuth setup and the seven-day refresh token trap
state: todo
milestone: Open source release
labels: calendar, docs
priority: 2
---
The single hardest onboarding step, and the one most likely to fail silently weeks later.

Each self-hoster has to create their own Google Cloud project, enable the Calendar API, configure a consent screen, and register two redirect URIs — one for the calendar grant and one for Supabase Auth. Missing the second produces a `redirect_uri_mismatch` that points at the wrong thing.

The trap worth its own callout: **Google expires refresh tokens after seven days while an OAuth app sits in Testing status.** This app depends on a long-lived refresh token, so calendar access dies every week and the failure looks like a bug in the app. On Workspace, set the consent screen to Internal. On a personal account, publish it and click through the unverified-app warning.

@@ISSUE | Bootstrap a fresh instance in one command
state: todo
milestone: Open source release
labels: ops
priority: 2
---
`pnpm seed` covers the settings row and a workspace, but assumes you already know what those are and in what order they matter.

A fresh instance needs: the settings row, at least one Linear workspace with a verified key, the calendar grant, and the VAPID pair if the nudge is wanted. Today that is four separate things learned from prose.

Should be one command that asks for what it needs, verifies each credential as it goes rather than at 07:00 the next morning, and prints what is still missing.

@@ISSUE | First-run state that teaches rather than reports
state: todo
milestone: Open source release
labels: ui
priority: 2
---
The empty states exist and are designed, but they were written for someone who already knew what the app was going to do. "Add a Linear workspace with a personal API key" assumes you know why.

A first run against an empty database should show what is connected, what is not, and what each unconnected thing will buy you — calendar fit stays neutral without a calendar, no brief arrives without Resend. The setup page already holds all of that state; it just does not present it as a path.

@@ISSUE | Choose a licence
state: todo
milestone: Open source release
labels: chore, docs
priority: 2
---
No licence file, which legally means all rights reserved and nobody may use it.

Worth being deliberate given the goal is goodwill: a permissive licence (MIT, Apache 2.0) invites forks and commercial use, which is probably the point. Apache adds an explicit patent grant. Something copyleft would work against the stated aim.

@@ISSUE | Audit what reaches the client bundle before publishing
state: todo
milestone: Open source release
labels: auth, ops
priority: 2
---
`NEXT_PUBLIC_*` variables are public by design and that is fine. What matters is proving nothing else joins them.

Specifically: the service role key, the Anthropic key, the Resend key, any Linear key, the encryption key and the tick secret must never appear in a built client chunk. The service role key is the one that would be catastrophic, since it bypasses row level security entirely.

Worth a grep over `.next/static` after a production build, and worth keeping as a check that runs before a release rather than once.

@@ISSUE | Replace the personal sample data in the preview route
state: todo
milestone: Open source release
labels: ui, chore
priority: 3
---
`/preview` renders fixtures naming a real colleague and real ventures, because realistic sample data reads better than placeholder text.

For a public repo those need to become invented but still realistic — the reason the fixtures are not "Lorem ipsum" in the first place is that generic sample data makes a design look worse than it is.

@@ISSUE | Decide what docs/spec.md becomes
state: todo
milestone: Open source release
labels: docs
priority: 3
---
The spec is written about one person by name, in the second person, describing their ventures and their working day. It is the origin document and it is genuinely good at explaining why each decision was made.

Either it stays as a historical artifact with a note at the top saying so, or it is rewritten as product documentation and loses the reasoning that makes it worth reading. The first is probably right, but it should be a decision rather than an oversight.

@@UPDATE | 2026-09-18
health: onTrack
---
The Linear restructure paid off, two emails turned out never to have sent, and the project found its distribution shape.

## The ranking is doing real work now

Adding target dates, assignments and milestones in Linear moved every number that matters:

| | Before | After |
| --- | --- | --- |
| Issues assigned | 7 | 42 |
| Projects with a target | 0 of 4 | 7 of 8 |
| Candidates in a targeted project | 0 | 42 |
| Spread, first to last | 0.138 | 0.319 |
| Tied for first | 4 | 2 |

Goal leverage now contributes to every candidate instead of being renormalised away every morning.

The remaining ties have a different cause, and `linear:check` was still blaming the old one. It had a hardcoded line telling you to add target dates, which is advice that had just been acted on. It now derives the diagnosis from signal coverage and correctly reports the real gap: **only 7 of 42 issues carry an estimate**, so scope share falls back to neutral for the rest, and two issues in the same project with the same priority then score identically.

## Both emails were failing silently

Closing the day surfaced a Resend error that scrolled past too quickly to read. Recovering it found that the brief had never sent either: `onboarding@resend.dev` only delivers to the Resend account owner's address, and the brief was addressed elsewhere. The tick released its claim on failure, which is correct behaviour and also why nothing looked broken.

Tracing every send call settled a larger question. All four pass `settings.email`, and guest links are web pages rather than email, so **this app has exactly one recipient**. Resend domain verification is therefore not a prod blocker at all; it is a deliverability question about a shared sender.

`pnpm recap:resend` now retries a delivery that failed, so a closed day no longer strands its recap.

## The recap page was unreadable at real volume

Thirty-six closed issues rendered as one flat list with nothing marking where an item ended. Rebuilt around grouping by project, each group holding its own overflow behind a count, with the headline figures given real weight and the targets section no longer reserving half the layout to say "none".

A closed day can also be reopened now. Closing is a judgement rather than a fact about the world, so it needed to be reversible.

## Distribution decided

This ships as a **self-host template, given away free**, not as a hosted service. That resolves rather than defers several questions: the singleton schema is correct for one instance per person, bring-your-own-keys is right for every service because there is no operator in the middle, and guest links get much safer because a projection bug stays a personal embarrassment.

The new milestone covers what that makes urgent, starting with the fact that tracked files and git history currently carry a personal email, an organisation slug and a colleague's name.

@@MILESTONE | Reduction
---
Removing the scheduler, the calendar, browser push and all outbound email, after a week of real use produced a sharper product than the spec did.

Two rules came out of it. Do not rebuild systems the user already has: meetings live in a calendar with reminders attached, so repeating them on a dashboard is noise, and an email telling you to open an app is a notification with extra steps. Do not supply discipline the user is meant to bring: nudges can be ignored anyway, so they buy nothing and cost a whole subsystem, and suggesting when to work was the same overreach one layer down.

Several issues in earlier milestones describe work that was built, shipped, and then deliberately deleted. They are left closed rather than reworded, because "we built this and then removed it for these reasons" is more useful than a backlog that pretends it never happened.

@@ISSUE | Remove the scheduler, calendar, push and outbound email
state: done
milestone: Reduction
labels: backend, ops
priority: 1
---
Gone: /api/tick and its four steps, the pg_cron migration, web push with VAPID and the service worker, Resend and both email templates, Google Calendar entirely, the backup task, the suggested focus window, and every `*_sent_at` column — those existed only so a cron could not double-send.

Calendar fit's 10% was redistributed proportionally across the remaining four factors rather than reassigned, so the relative ordering the original weighting reasoned about survives exactly.

The knock-on that matters most: self-hosting got far easier. No VAPID, no pg_cron, no Vault secrets, no Resend, and no Calendar consent screen — which removes the seven-day refresh-token trap that was the worst step in the entire setup.

@@ISSUE | Post the recap to Linear as a project update
state: done
milestone: Reduction
labels: linear, backend
priority: 1
---
Closing the day now posts one update per project that had work closed in it, so the day's outcome reaches collaborators where they already are instead of dying in an inbox.

Verified against the live schema before anything depended on it. `health` is deliberately omitted: closing a few issues is not evidence a project is on track, and claiming it would be the app asserting something it cannot know.

This is most of what the guest-link collaborator view was for, at a fraction of the work and with no unauthenticated pages holding private titles.

@@ISSUE | One needle mover plus three, each actionable
state: done
milestone: Reduction
labels: ui, scoring
priority: 2
---
Finishing the needle mover used to fall off a cliff: the card said nothing else was asked of you and the drawer underneath held bare titles with nothing to press, which sent you back to Linear to re-decide.

Deliberately not a queue — the day still has one needle mover and finishing it does not promote the next thing, because an auto-advancing queue rebuilds the ranked task list the one-per-day constraint exists to replace. What changed is that the three underneath carry a reason from Claude, can be started and completed in place, and reflect their own state.

The backup task went with it. With three ranked tasks underneath, a blocked needle mover is answered by doing the next one.

@@ISSUE | Share today's task as an image
state: done
milestone: Reduction
labels: ui, sharing
priority: 3
---
A purpose-built card copied to the clipboard, not a capture of the Now view.

A literal screenshot carries the app's chrome, which means nothing to the recipient, and carries the other three tasks if the list is open — which can name ventures a recipient was never meant to see. Colours are literals rather than tokens and the theme is fixed to light, because the recipient sees a PNG and it should look the same to everyone.

Falls back to a download when the clipboard refuses, which Safari does whenever the write leaves the original gesture.

@@ISSUE | Close the issues describing removed features
state: todo
milestone: Reduction
labels: chore
priority: 3
---
Several closed issues in Phase 1 and Phase 2 describe subsystems that no longer exist: the midday nudge, the close-day reminder, the Google Calendar OAuth grant, the morning brief email, and the pg_cron schedule.

They are accurate history — that work was genuinely done — so the question is only whether the backlog should say so. Leaving them closed and unedited is the honest option; the Reduction milestone explains what happened to them.

The "Deploy and prove" milestone is the one that actually needs editing, since it still lists proving the nudge and registering pg_cron as outstanding work that can never be done.

@@UPDATE | 2026-09-19
health: onTrack
---
A week of use removed about a third of the app, and the remaining third got sharper.

## What went

The scheduler, Google Calendar, browser push and every outbound email. Two rules drove it.

**Do not rebuild systems the user already has.** Meetings live in a calendar with reminders attached, so repeating them on a dashboard is noise. The same test killed the morning brief: an email telling you to open an app is a notification with extra steps.

**Do not supply discipline the user is meant to bring.** Nudges can be ignored anyway, so they buy nothing and cost a whole subsystem. Suggesting a focus window was the same overreach one layer down — deciding when someone should work was never the app's call. That is why the calendar went and not merely the notifications.

## What replaced it

Closing the day posts the recap to Linear as a project update, one per project with work closed in it. That reaches collaborators where they already are, and it quietly does most of what the guest-link collaborator view was designed for, without any unauthenticated pages holding private titles.

The day is now one needle mover plus three ranked tasks, each carrying a reason and startable in place. The backup task is gone: with three underneath, a blocked needle mover is answered by doing the next one.

Sharing is a purpose-built card copied to the clipboard rather than a screenshot, because a literal capture would carry the other three tasks and the app's chrome.

## What it cost and what it bought

Eight routes became seven. Roughly a third of the codebase went, along with two entire external services and the hardest piece of onboarding — the Google Calendar consent screen and its seven-day refresh-token expiry.

The ranking itself was untouched, except that calendar fit's 10% was redistributed proportionally so the original relative ordering survives.

## Next

The repository is being prepared to go public as a self-host template. Personal data is out of the working tree; the git history is the remaining piece. After that, a first deploy.
