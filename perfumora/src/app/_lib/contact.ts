"use server";

import { Resend } from "resend";

export interface ContactPayload {
  name: string;
  email: string;
  message: string;
}

export interface ContactResult {
  ok: boolean;
  message?: string;
  error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Dispatches customer inquiries submitted via the Contact section
 * to the atelier email address via Resend.
 */
export async function sendContactInquiry(
  payload: ContactPayload,
): Promise<ContactResult> {
  const name = (payload.name ?? "").trim();
  const email = (payload.email ?? "").trim().toLowerCase();
  const message = (payload.message ?? "").trim();

  // Validate fields with safe bounds
  if (!name || name.length > 120) {
    return {
      ok: false,
      error: "Please provide a valid name (up to 120 characters).",
    };
  }

  if (!email || !EMAIL_REGEX.test(email) || email.length > 200) {
    return {
      ok: false,
      error: "Please provide a valid email address.",
    };
  }

  if (!message || message.length < 5 || message.length > 3000) {
    return {
      ok: false,
      error: "Please write a message between 5 and 3,000 characters.",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;

  // Development fallback: if no key is configured yet, log clearly and simulate success
  if (!apiKey) {
    console.warn(
      "[ContactForm] RESEND_API_KEY is not configured in .env. Simulating email dispatch:\n" +
        `  From: ${name} <${email}>\n` +
        `  Message: ${message.slice(0, 100)}...`,
    );
    return {
      ok: true,
      message: "Message received (Development mode: RESEND_API_KEY not configured).",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const fromAddress =
      process.env.RESEND_FROM_EMAIL || "Usman Zeb <onboarding@resend.dev>";
    const toAddress = process.env.CONTACT_TO_EMAIL || "delivered@resend.dev";

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: toAddress,
      replyTo: email,
      subject: `Atelier Inquiry: ${name}`,
      text: `Client: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n\n---\nSent via Perfumora Atelier Storefront`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #faf6ee; color: #1a1918; margin: 0; padding: 40px 20px; }
              .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid rgba(26,25,24,0.08); padding: 36px 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
              .eyebrow { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #8c827a; font-weight: 600; }
              .title { font-size: 22px; font-weight: 400; margin: 8px 0 24px; color: #1a1918; font-family: Georgia, serif; }
              .meta-box { background: #faf6ee; border-radius: 10px; padding: 16px; margin-bottom: 24px; font-size: 14px; }
              .meta-item { margin-bottom: 6px; }
              .meta-label { color: #8c827a; font-weight: 500; display: inline-block; width: 70px; }
              .message-box { font-size: 15px; line-height: 1.6; color: #2e2a24; white-space: pre-wrap; margin-top: 16px; }
              .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(26,25,24,0.08); font-size: 12px; color: #8c827a; text-align: center; }
            </style>
          </head>
          <body>
            <div class="card">
              <span class="eyebrow">Perfumora Atelier</span>
              <h1 class="title">New Client Inquiry</h1>
              <div class="meta-box">
                <div class="meta-item"><span class="meta-label">Client:</span> <strong>${escapeHtml(name)}</strong></div>
                <div class="meta-item"><span class="meta-label">Email:</span> <a href="mailto:${escapeHtml(email)}" style="color: #6b6244;">${escapeHtml(email)}</a></div>
              </div>
              <p class="eyebrow" style="margin-bottom: 8px;">Message</p>
              <div class="message-box">${escapeHtml(message)}</div>
              <div class="footer">
                Replying directly to this email will reach <strong>${escapeHtml(email)}</strong>.
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error("[ContactForm] Resend API error:", error);
      return {
        ok: false,
        error: error.message || "Failed to deliver message via Resend.",
      };
    }

    return { ok: true, message: "Message sent successfully." };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "An unexpected error occurred.";
    console.error("[ContactForm] Unexpected error dispatching email:", err);
    return {
      ok: false,
      error: errorMsg,
    };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
