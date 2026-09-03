import { createContext, useContext } from "react";

/* Context object + consumer hook for auth, kept in a non-component module so
   the provider file can export only its component (satisfies react-refresh /
   Fast Refresh). Backed by Supabase Auth — see AuthProvider.tsx. */

export interface AdminUser {
  /** Supabase `auth.users.id` (UUID). */
  id: string;
  email: string;
  /** `user_metadata.name` when set, otherwise derived from the email. */
  name: string;
}

export interface AuthContextValue {
  user: AdminUser | null;
  /** Rejects with a display-ready message when the credentials are refused. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Emails a recovery link that lands on /reset-password. */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password for the currently signed-in (or recovering) user. */
  updatePassword: (password: string) => Promise<void>;
  /** True until the persisted session has been restored and checked. */
  loading: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
