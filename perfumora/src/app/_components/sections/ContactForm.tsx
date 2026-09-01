"use client";

import { useState, type FormEvent } from "react";
import { AppInput } from "../ui/AppInput";
import { RippleButton } from "../ui/RippleButton";

/**
 * Contact form (§4.7) — UI ONLY. Local `useState` holds the fields; submit is
 * `preventDefault` + a static "message received" state. Nothing is sent, no API
 * route, no email service, no server action hitting a real service (§1).
 */
export function ContactForm() {
  const [sent, setSent] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // UI-only: no destination exists (§1).
    setSent(true);
  };

  if (sent) {
    return (
      <div className="border-hairline-on-light flex min-h-56 items-center rounded-2xl border p-8">
        <p className="text-body text-muted-on-light">
          Message received — the atelier will be in touch.
          {/* Static confirmation; nothing was transmitted. */}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <AppInput label="Name" required autoComplete="name" placeholder="Your name" />
      <AppInput
        label="Email"
        variant="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
      />
      <AppInput
        label="Message"
        variant="textarea"
        required
        rows={4}
        placeholder="How can we help?"
      />
      <RippleButton type="submit" className="mt-2 self-start" aria-label="Send message">
        Send message
      </RippleButton>
    </form>
  );
}
