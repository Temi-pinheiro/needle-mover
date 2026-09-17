/** Generates the app-level secrets that aren't issued by a third party. */
import { randomBytes } from "node:crypto";
import webpush from "web-push";

const vapid = webpush.generateVAPIDKeys();

console.log(`
Add these to .env.local (and to your Vercel project settings):

ENCRYPTION_KEY=${randomBytes(32).toString("base64")}
TICK_SECRET=${randomBytes(32).toString("base64url")}

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=mailto:you@example.com

ENCRYPTION_KEY protects the Linear API keys and the Google refresh token at
rest. Rotating it makes every stored credential unreadable — you would need to
re-enter them. TICK_SECRET is the shared secret pg_cron sends to /api/tick.

The VAPID pair signs browser push for the midday nudge. Rotating it
invalidates every existing subscription, which then has to be re-granted.
Set VAPID_SUBJECT to your own mailto: address — push services use it to
reach you if something goes wrong.
`);
