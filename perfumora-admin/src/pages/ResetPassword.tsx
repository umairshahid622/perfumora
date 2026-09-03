import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context";
import { errorMessage } from "../lib/errors";
import { Icon } from "../components/Icon";
import { Button } from "../components/Button";
import { TextField } from "../components/Field";
import { AuthShell } from "./Login";

/* ---------------------------------------------------------------------------
   Where the recovery email lands.

   Supabase turns the link's token into a real session before this renders
   (detectSessionInUrl is on by default), so "am I allowed to set a new
   password?" is simply "is there a user?". No session means the link was
   already used, expired, or someone opened this page directly.
--------------------------------------------------------------------------- */

const MIN_LENGTH = 6; // Supabase's own default minimum.

export function ResetPassword() {
  const { user, loading, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await updatePassword(password);
      // The recovery link already signed them in, so go straight in.
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Could not set the password."));
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthShell title="Checking your link" subtitle="One moment.">
        <div className="flex justify-center py-4">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-accent" />
        </div>
      </AuthShell>
    );
  }

  if (!user) {
    return (
      <AuthShell
        title="This link has expired"
        subtitle="Reset links can only be used once."
      >
        <div className="animate-fade-in text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Icon name="alert" className="h-6 w-6" />
          </span>
          <p className="text-sm text-slate-600">
            Request a new one and open it from the most recent email.
          </p>
          <Link
            to="/forgot-password"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
          >
            Send a new link
            <Icon name="chevron-right" className="h-4 w-4" />
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle={`Signed in as ${user.email}.`}
    >
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
          id="password"
          type="password"
          label="New password"
          placeholder="••••••••"
          autoComplete="new-password"
          required
          leading={<Icon name="lock" className="h-4 w-4" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          id="confirm"
          type="password"
          label="Confirm password"
          placeholder="••••••••"
          autoComplete="new-password"
          required
          leading={<Icon name="lock" className="h-4 w-4" />}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            "Save password"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
