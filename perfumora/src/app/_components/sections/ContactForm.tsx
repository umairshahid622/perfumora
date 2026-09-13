"use client";

import { useState, type FormEvent } from "react";
import { AppInput } from "../ui/AppInput";
import { RippleButton } from "../ui/RippleButton";
import { sendContactInquiry } from "../../_lib/contact";

/**
 * Contact form — integrates with Resend to dispatch customer inquiries
 * directly to the atelier inbox while providing immediate feedback.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await sendContactInquiry({ name, email, message });
      if (res.ok) {
        setSent(true);
        setName("");
        setEmail("");
        setMessage("");
      } else {
        setError(res.error || "We could not send your message just now. Please try again.");
      }
    } catch {
      setError("An unexpected network error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="border-hairline-on-light flex flex-col min-h-56 items-center justify-center gap-6 rounded-2xl border p-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <span className="text-micro text-accent-on-light font-medium tracking-[0.16em] uppercase">
            Dispatched
          </span>
          <p className="text-body text-ink font-light">
            Message received — the atelier will be in touch shortly.
          </p>
        </div>
        <RippleButton
          onClick={() => {
            setSent(false);
            setError(null);
          }}
          aria-label="Send another message"
        >
          Send another message
        </RippleButton>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <AppInput
        label="Name"
        required
        autoComplete="name"
        placeholder="Your name"
        value={name}
        onChange={setName}
      />
      <AppInput
        label="Email"
        variant="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={setEmail}
      />
      <AppInput
        label="Message"
        variant="textarea"
        required
        rows={4}
        placeholder="How can we help?"
        value={message}
        onChange={setMessage}
      />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs text-rose-700"
        >
          {error}
        </div>
      )}

      <RippleButton
        type="submit"
        disabled={submitting}
        className="mt-2 self-start"
        aria-label="Send message"
      >
        {submitting ? "Sending message…" : "Send message"}
      </RippleButton>
    </form>
  );
}
