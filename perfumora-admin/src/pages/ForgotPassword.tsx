import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Button } from "../components/Button";
import { TextField } from "../components/Field";
import { AuthShell } from "./Login";

/* Forgot password — design only. "Sends" nothing; on submit we just show the
   success confirmation state that a real reset flow would land on. */

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Mimic a network round-trip, then flip to the confirmation state.
    setTimeout(() => {
      setSubmitting(false);
      setSent(true);
    }, 600);
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send a reset link."
    >
      {sent ? (
        <div className="animate-fade-in text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Icon name="check" className="h-6 w-6" />
          </span>
          <p className="text-sm text-slate-600">
            If an account exists for{" "}
            <span className="font-medium text-slate-900">{email}</span>, a reset
            link is on its way.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
          >
            <Icon name="arrow-left" className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <TextField
            id="email"
            type="email"
            label="Email"
            placeholder="you@perfumora.com"
            autoComplete="email"
            required
            leading={<Icon name="mail" className="h-4 w-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              "Send reset link"
            )}
          </Button>
          <Link
            to="/login"
            className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <Icon name="arrow-left" className="h-4 w-4" />
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
