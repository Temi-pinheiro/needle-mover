import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import type { ClosedIssue, ProjectMovement } from "@/lib/recap";

export type RecapEmailProps = {
  date: string;
  summary: string;
  needleMover: { identifier: string; title: string; ventureName: string } | null;
  needleMoverDone: boolean;
  blockReason: string | null;
  closed: ClosedIssue[];
  movements: ProjectMovement[];
  tomorrow: { identifier: string; title: string; ventureName: string } | null;
  tomorrowNote: string;
  appUrl: string;
};

const body = { backgroundColor: "#f7f6f3", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" };
const container = { backgroundColor: "#ffffff", border: "1px solid #eaeaea", borderRadius: "12px", margin: "0 auto", maxWidth: "560px", padding: "32px" };
const label = { color: "#9b9a97", fontSize: "11px", fontWeight: 500, letterSpacing: "0.08em", margin: "0 0 10px", textTransform: "uppercase" as const };
const heading = { color: "#2f3437", fontSize: "26px", lineHeight: "1.2", margin: "0 0 18px" };
const paragraph = { color: "#2f3437", fontSize: "15px", lineHeight: "1.6", margin: "0 0 22px" };
const item = { color: "#57595a", fontSize: "14px", lineHeight: "1.5", margin: "0 0 6px" };
const meta = { color: "#787774", fontSize: "13px", lineHeight: "1.5", margin: "0 0 4px" };
const rule = { borderColor: "#eaeaea", margin: "24px 0" };
const footer = { color: "#9b9a97", fontSize: "12px", margin: 0 };

export function RecapEmail(props: RecapEmailProps) {
  const {
    date, summary, needleMover, needleMoverDone, blockReason,
    closed, movements, tomorrow, tomorrowNote, appUrl,
  } = props;

  const byVenture = closed.reduce<Record<string, ClosedIssue[]>>((acc, issue) => {
    (acc[issue.ventureName] ??= []).push(issue);
    return acc;
  }, {});

  return (
    <Html>
      <Head />
      <Preview>{summary.slice(0, 120)}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={label}>{date}</Text>
          <Heading style={heading}>
            {needleMover
              ? needleMoverDone
                ? "Needle mover finished."
                : "Needle mover unfinished."
              : "No needle mover today."}
          </Heading>

          <Text style={paragraph}>{summary}</Text>

          {needleMover && !needleMoverDone && blockReason && (
            <>
              <Text style={label}>Blocked by</Text>
              <Text style={paragraph}>{blockReason}</Text>
            </>
          )}

          <Hr style={rule} />

          <Text style={label}>Closed today · {closed.length}</Text>
          {closed.length === 0 ? (
            <Text style={item}>Nothing.</Text>
          ) : (
            Object.entries(byVenture).map(([venture, issues]) => (
              <div key={venture} style={{ marginBottom: "14px" }}>
                <Text style={meta}>{venture}</Text>
                {issues.map((issue) => (
                  <Text key={issue.identifier} style={item}>
                    {issue.url ? (
                      <Link href={issue.url} style={{ color: "#57595a" }}>
                        {issue.identifier} {issue.title}
                      </Link>
                    ) : (
                      `${issue.identifier} ${issue.title}`
                    )}
                  </Text>
                ))}
              </div>
            ))
          )}

          <Hr style={rule} />

          <Text style={label}>Targets moved</Text>
          {movements.length === 0 ? (
            <Text style={item}>None moved today.</Text>
          ) : (
            movements.map((m) => (
              <Text key={m.name} style={item}>
                {m.name} — {Math.round(m.before * 100)}% → <strong>{Math.round(m.after * 100)}%</strong>
                {m.targetDate ? ` (target ${m.targetDate})` : ""}
              </Text>
            ))
          )}

          {tomorrow && (
            <>
              <Hr style={rule} />
              <Text style={label}>Tomorrow</Text>
              <Text style={{ ...item, color: "#2f3437", fontSize: "15px" }}>
                {tomorrow.identifier} {tomorrow.title}
              </Text>
              <Text style={meta}>{tomorrowNote}</Text>
            </>
          )}

          <Hr style={rule} />
          <Text style={footer}>
            <Link href={appUrl} style={{ color: "#346538" }}>
              Open Needle Mover
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default RecapEmail;
