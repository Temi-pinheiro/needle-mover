/**
 * Reports how the runtime actually parses .env.local, without printing secrets.
 *
 * Inline comments after a value are the trap this exists for: some parsers
 * strip them, some fold them into the value, and a credential with a comment
 * glued to it fails in ways that do not name themselves.
 */
const KEYS = [
  "ALLOWED_EMAIL",
  "BRIEF_FROM_EMAIL",
  "NEXT_PUBLIC_APP_URL",
  "VAPID_SUBJECT",
  "NEXT_PUBLIC_SUPABASE_URL",
  "ENCRYPTION_KEY",
  "TICK_SECRET",
  "ANTHROPIC_API_KEY",
  "GOOGLE_CLIENT_ID",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
];

console.log("\nHow the runtime parses .env.local\n");
let problems = 0;

for (const key of KEYS) {
  const raw = process.env[key];
  if (!raw) {
    console.log(`  ${key.padEnd(30)} MISSING`);
    problems++;
    continue;
  }

  // BRIEF_FROM_EMAIL is legitimately `Display Name <address@domain>`, so the
  // space and angle brackets that are a problem everywhere else are correct here.
  const isFromHeader = key === "BRIEF_FROM_EMAIL";

  const issues: string[] = [];
  if (raw.includes("#")) issues.push("contains # — probably a trailing comment");
  if (raw !== raw.trim()) issues.push("has surrounding whitespace");
  if (!isFromHeader && /\s/.test(raw.trim())) issues.push("contains a space");
  if (!isFromHeader && (raw.includes("<") || raw.includes(">"))) {
    issues.push("looks like an unfilled placeholder");
  }
  if (isFromHeader && !/^[^<>]*<[^<>@\s]+@[^<>@\s]+>$|^[^<>@\s]+@[^<>@\s]+$/.test(raw.trim())) {
    issues.push('should be `Name <address@domain>` or a bare address');
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
