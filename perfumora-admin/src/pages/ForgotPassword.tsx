import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { errorMessage } from "../lib/errors";
import { Icon } from "../components/Icon";
import { Button } from "../components/Button";
import { TextField } from "../components/Field";
import { AuthShell } from "./Login";

/* Forgot password — asks Supabase to email a recovery link. The link lands on
   /reset-password, where the new password is actually set.

   The confirmation is deliberately vague about whether the address exists, and
   Supabase's own response is too: that's what stops this form being used to
   discover accounts. */

export function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Could not send the reset link."));
    } finally {
      setSubmitting(false);
    }
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
          {error && (
            <p
              role="alert"
              className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
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
