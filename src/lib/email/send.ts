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
