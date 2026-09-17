import { db } from "@/lib/db/client";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Stores or removes this browser's push subscription. */
export async function POST(request: Request) {
  if (!(await currentUser())) {
    return Response.json({ error: "not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;

  if (!body?.endpoint || !body.keys?.p256dh || !body.keys.auth) {
    return Response.json({ error: "malformed subscription" }, { status: 400 });
  }

  const { error } = await db().from("push_subscriptions").upsert(
    {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!(await currentUser())) {
    return Response.json({ error: "not signed in" }, { status: 401 });
  }

  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return Response.json({ error: "no endpoint" }, { status: 400 });

  await db().from("push_subscriptions").delete().eq("endpoint", endpoint);
  return Response.json({ ok: true });
}
