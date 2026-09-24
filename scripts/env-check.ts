/**
 * Reports how the runtime actually parses .env.local, without printing secrets.
 *
 * Inline comments after a value are the trap this exists for: some parsers
 * strip them, some fold them into the value, and a credential with a comment
 * glued to it fails in ways that do not name themselves.
 */
const KEYS = [
  "ALLOWED_EMAIL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

/** Features that switch off cleanly without these, so absence is not a problem. */
const OPTIONAL: Record<string, string> = {
  DEEPGRAM_API_KEY: "voice capture off",
  DEEPGRAM_KEYTERMS: "no extra names for transcription",
};

console.log("\nHow the runtime parses .env.local\n");
let problems = 0;

for (const key of [...KEYS, ...Object.keys(OPTIONAL)]) {
  const raw = process.env[key];
  if (!raw) {
    if (key in OPTIONAL) {
      console.log(`  ${key.padEnd(30)} not set (${OPTIONAL[key]})`);
      continue;
    }
    console.log(`  ${key.padEnd(30)} MISSING`);
    problems++;
    continue;
  }

  const issues: string[] = [];
  if (raw.includes("#")) issues.push("contains # — probably a trailing comment");
  if (raw !== raw.trim()) issues.push("has surrounding whitespace");
  // Keyterms are names, and names have spaces in them.
  if (key !== "DEEPGRAM_KEYTERMS" && /\s/.test(raw.trim())) issues.push("contains a space");
  if (raw.includes("<") || raw.includes(">")) issues.push("looks like an unfilled placeholder");

  // A trailing slash on the origin produces `https://host//auth/callback`,
  // which OAuth providers match as a different URI and reject.
  if (key === "NEXT_PUBLIC_APP_URL" && raw.trim().endsWith("/")) {
    issues.push("has a trailing slash — strip it, or OAuth redirects will not match");
  }

  if (issues.length > 0) problems++;
  console.log(
    `  ${key.padEnd(30)} ${String(raw.length).padStart(4)} chars  ${
      issues.length ? `PROBLEM: ${issues.join(", ")}` : "ok"
    }`,
  );
}

console.log(
  problems === 0
    ? "\nAll clean.\n"
    : `\n${problems} value(s) need attention. An inline comment after a value is the usual cause —\nput comments on their own line.\n`,
);
