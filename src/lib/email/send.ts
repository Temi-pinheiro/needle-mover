import { render } from "@react-email/components";
import { Resend } from "resend";
import { BriefEmail, type BriefEmailProps } from "@/emails/BriefEmail";

let client: Resend | null = null;

function resend(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set.");
    client = new Resend(key);
  }
  return client;
}

function from(): string {
  const value = process.env.BRIEF_FROM_EMAIL;
  if (!value) throw new Error("BRIEF_FROM_EMAIL is not set.");
  return value;
}

export async function sendBrief(to: string, props: BriefEmailProps): Promise<void> {
  const element = BriefEmail(props);
  const [html, text] = await Promise.all([
    render(element),
    // A plain-text part keeps the brief readable on a watch and out of spam.
    render(element, { plainText: true }),
  ]);

  const { error } = await resend().emails.send({
    from: from(),
    to,
    subject: `Needle mover: ${props.title}`,
    html,
    text,
  });

  if (error) throw new Error(`Resend refused the brief: ${error.message}`);
}

export async function sendRecap(
  to: string,
  props: import("@/emails/RecapEmail").RecapEmailProps,
): Promise<void> {
  const { RecapEmail } = await import("@/emails/RecapEmail");
  const element = RecapEmail(props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  const { error } = await resend().emails.send({
    from: from(),
    to,
    subject: `Recap · ${props.date}`,
    html,
    text,
  });

  if (error) throw new Error(`Resend refused the recap: ${error.message}`);
}

/** The close-day reminder. Deliberately one line — it is a nudge, not a report. */
export async function sendCloseReminder(to: string, appUrl: string): Promise<void> {
  const { error } = await resend().emails.send({
    from: from(),
    to,
    subject: "Close the day?",
    text: `The day is still open. Closing it writes the recap and picks tomorrow's candidate.\n\n${appUrl}\n`,
    html: `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2f3437">The day is still open. Closing it writes the recap and picks tomorrow's candidate.</p><p><a href="${appUrl}" style="color:#346538">Open Needle Mover</a></p>`,
  });

  if (error) throw new Error(`Resend refused the reminder: ${error.message}`);
}
