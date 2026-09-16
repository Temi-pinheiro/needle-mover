import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type BriefEmailProps = {
  date: string;
  ventureName: string;
  identifier: string;
  title: string;
  issueUrl: string | null;
  projectName: string | null;
  projectTarget: string | null;
  reason: string;
  firstStep: string;
  focusWindow: string | null;
  inboxCount: number;
  carryOverDays: number;
  needsSplit: boolean;
  degraded: boolean;
  appUrl: string;
};

// Inline styles throughout: email clients strip stylesheets.
const body = { backgroundColor: "#f6f6f4", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" };
const container = { backgroundColor: "#ffffff", borderRadius: "10px", margin: "0 auto", maxWidth: "560px", padding: "32px" };
const eyebrow = { color: "#8a8a80", fontSize: "12px", letterSpacing: "0.08em", margin: "0 0 4px", textTransform: "uppercase" as const };
const heading = { color: "#16160f", fontSize: "24px", lineHeight: "1.25", margin: "0 0 8px" };
const meta = { color: "#6b6b60", fontSize: "13px", margin: "0 0 20px" };
const label = { color: "#8a8a80", fontSize: "12px", letterSpacing: "0.06em", margin: "0 0 6px", textTransform: "uppercase" as const };
const paragraph = { color: "#33332b", fontSize: "15px", lineHeight: "1.55", margin: "0 0 20px" };
const firstStepBox = { backgroundColor: "#f3f6f0", borderLeft: "3px solid #4f7a3f", borderRadius: "4px", padding: "14px 16px" };
const firstStepText = { color: "#23321c", fontSize: "15px", fontWeight: 600, lineHeight: "1.5", margin: 0 };
const note = { color: "#8a5a2b", fontSize: "13px", lineHeight: "1.5", margin: "0 0 16px" };
const footer = { color: "#9a9a90", fontSize: "12px", margin: 0 };
const rule = { borderColor: "#e8e8e2", margin: "24px 0" };

export function BriefEmail(props: BriefEmailProps) {
  const {
    ventureName, identifier, title, issueUrl, projectName, projectTarget,
    reason, firstStep, focusWindow, inboxCount, carryOverDays, needsSplit,
    degraded, appUrl,
  } = props;

  return (
    <Html>
      <Head />
      {/* The preview line is what shows in the inbox list, so it carries the task itself. */}
      <Preview>{`${ventureName}: ${title}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={eyebrow}>Today&apos;s needle mover</Text>
          <Heading style={heading}>
            {issueUrl ? <Link href={issueUrl} style={{ color: "#16160f", textDecoration: "none" }}>{title}</Link> : title}
          </Heading>
          <Text style={meta}>
            {ventureName} · {identifier}
            {projectName ? ` · ${projectName}` : ""}
            {projectTarget ? ` · target ${projectTarget}` : ""}
          </Text>

          <Text style={label}>First step</Text>
          <Section style={firstStepBox}>
            <Text style={firstStepText}>{firstStep}</Text>
          </Section>

          <Hr style={rule} />

          <Text style={label}>Why this one</Text>
          <Text style={paragraph}>{reason}</Text>

          {focusWindow ? (
            <>
              <Text style={label}>Focus window</Text>
              <Text style={paragraph}>{focusWindow}</Text>
            </>
          ) : (
            <Text style={paragraph}>No free block long enough today — steal the first gap you get.</Text>
          )}

          {needsSplit ? (
            <Text style={note}>
              This has been the needle mover {carryOverDays} days running. Split it into
              smaller issues, or drop its priority and let something else through.
            </Text>
          ) : carryOverDays > 0 ? (
            <Text style={note}>Carried over from yesterday.</Text>
          ) : null}

          {degraded ? (
            <Text style={note}>
              Few of your active projects have target dates, so this ranking leaned on
              deadlines and momentum rather than goal leverage.
            </Text>
          ) : null}

          <Hr style={rule} />

          <Text style={footer}>
            <Link href={appUrl} style={{ color: "#4f7a3f" }}>Open the Now view</Link>
            {inboxCount > 0 ? ` · ${inboxCount} capture${inboxCount === 1 ? "" : "s"} waiting` : ""}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default BriefEmail;
