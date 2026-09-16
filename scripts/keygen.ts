/** Generates the app-level secrets that aren't issued by a third party. */
import { randomBytes } from "node:crypto";

console.log(`
Add these to .env.local (and to your Vercel project settings):

ENCRYPTION_KEY=${randomBytes(32).toString("base64")}
TICK_SECRET=${randomBytes(32).toString("base64url")}

ENCRYPTION_KEY protects the Linear API keys and the Google refresh token at
rest. Rotating it makes every stored credential unreadable — you would need to
re-enter them. TICK_SECRET is the shared secret pg_cron sends to /api/tick.
`);
