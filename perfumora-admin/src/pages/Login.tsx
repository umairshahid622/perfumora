import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/context";
import { Icon } from "../components/Icon";
import { Button } from "../components/Button";
import { TextField } from "../components/Field";

/* Login — design only. Any email/password "works" (see AuthContext). On
   success we return the user to wherever ProtectedRoute bounced them from,
   defaulting to the dashboard. */

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("admin@perfumora.com");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await login(email, password);
    navigate(from, { replace: true });
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your store."
    >
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
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-accent hover:text-accent-hover"
            >
              Forgot?
            </Link>
          </div>
          <TextField
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
            leading={<Icon name="lock" className="h-4 w-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        Admin access is provisioned manually. There is no public sign-up.
      </p>
    </AuthShell>
  );
}

/* Shared centered card used by both auth screens. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
            <Icon name="droplet" className="h-7 w-7" />
          </span>
          <h1 className="text-xl font-bold text-slate-900">Perfumora Admin</h1>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
