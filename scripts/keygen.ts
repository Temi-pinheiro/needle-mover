/** Generates the one secret that isn't issued by a third party. */
import { randomBytes } from "node:crypto";

console.log(`
Add this to .env.local (and to your deployment's environment):

ENCRYPTION_KEY=${randomBytes(32).toString("base64")}

It protects the Linear API keys at rest. Rotating it makes every stored key
unreadable, so you would have to re-enter them.
`);
