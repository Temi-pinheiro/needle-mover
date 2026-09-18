"use client";

import { forwardRef } from "react";

export type ShareCardProps = {
  ventureName: string;
  title: string;
  projectName: string | null;
  projectTarget: string | null;
  date: string;
};

/**
 * The image that gets shared.
 *
 * Deliberately not a capture of the Now view. A literal screenshot carries the
 * app's chrome, which means nothing to the recipient, and carries the other
 * three tasks if the drawer is open — which can name ventures or clients that
 * were never meant to leave the machine. This shows one thing on purpose.
 *
 * Every colour is a literal rather than a design token, and the theme is fixed
 * to light regardless of the sender's. A shared PNG should look the same to
 * everyone, and the rasteriser resolves CSS custom properties unreliably.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { ventureName, title, projectName, projectTarget, date },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        width: 720,
        padding: "56px 56px 44px",
        background: "#f7f6f3",
        border: "1px solid #eaeaea",
        borderRadius: 16,
        fontFamily: "var(--font-geist-sans), 'Helvetica Neue', sans-serif",
        color: "#2f3437",
        boxSizing: "border-box",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#9b9a97",
        }}
      >
        Working on today
      </p>

      <h1
        style={{
          fontFamily: "var(--font-display), Georgia, serif",
          fontWeight: 400,
          fontSize: 46,
          lineHeight: 1.1,
          letterSpacing: "-0.028em",
          margin: "22px 0 0",
          color: "#2f3437",
        }}
      >
        {title}
      </h1>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          margin: "30px 0 0",
          paddingTop: 22,
          borderTop: "1px solid #eaeaea",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#787774",
          }}
        >
          {ventureName}
        </span>

        {projectName && (
          <span style={{ fontSize: 13, color: "#787774" }}>
            {projectName}
            {projectTarget ? ` · due ${projectTarget}` : ""}
          </span>
        )}

        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "#9b9a97",
          }}
        >
          {date}
        </span>
      </div>
    </div>
  );
});
