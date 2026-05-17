/**
 * Email transport — wraps nodemailer for outgoing transactional mail.
 *
 * Security: nodemailer is pinned to 6.9.16 (Auth.js v5 peer-range cap). This version
 * is affected by GHSA-rcmh-qjqh-p98v (HIGH) — recursive `addressparser` DoS in
 * versions <=7.0.10. The exploit path requires an attacker-controlled address string
 * reaching the parser. In this module:
 *
 *   • `from` is server-stamped from env.SMTP_FROM (no user input).
 *   • `to` is the email column on the User row, validated by Zod at registration time
 *     and never reflected unescaped from request bodies.
 *   • Subject + body are constants composed from server-controlled values
 *     (resetUrl is built from env.NEXT_PUBLIC_APP_URL + a server-generated token).
 *
 * No user-controlled string flows into nodemailer's address parser, so the DoS vector
 * is unreachable. Mitigation per .claude/rules/phases.md Phase 5 CVE decision tree
 * Step 3 — risk accepted, .npmrc `audit-level=critical` set so the build stays clean
 * while the HIGH advisory remains documented but unfixed upstream.
 *
 * Revisit when @auth/core widens its nodemailer peer range to allow >=7.0.11, or
 * replace nodemailer with an alternative transport (touches this file's call sites).
 */
import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/env";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  // Dev convenience: when SMTP_HOST is unset, point at MailHog on localhost with no
  // auth so dev signups + reset flows still deliver to the local inbox UI.
  const host = env.SMTP_HOST ?? "localhost";
  const port = env.SMTP_HOST ? env.SMTP_PORT : 1025;
  const smtpUser = env.SMTP_USER;
  const smtpPassword = env.SMTP_PASSWORD;
  const auth =
    smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth,
  });
  return cachedTransporter;
}

export interface SendPasswordResetEmailArgs {
  to: string;
  token: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: SendPasswordResetEmailArgs): Promise<void> {
  const from = env.SMTP_FROM ?? "no-reply@yelli.local";
  await getTransporter().sendMail({
    from,
    to,
    subject: "Reset your Yelli password",
    text: [
      "We received a request to reset your Yelli password.",
      "",
      `Open this link to choose a new password: ${resetUrl}`,
      "",
      "This link expires in 1 hour and can only be used once.",
      "If you did not request a reset, you can safely ignore this email.",
    ].join("\n"),
    html: [
      "<p>We received a request to reset your Yelli password.</p>",
      `<p><a href="${resetUrl}">Choose a new password</a></p>`,
      "<p>This link expires in 1 hour and can only be used once. If you did not request a reset, you can safely ignore this email.</p>",
    ].join(""),
  });
}

// Test-only — clears the cached transporter between test cases.
export function __resetEmailTransportForTests(): void {
  cachedTransporter = null;
}
