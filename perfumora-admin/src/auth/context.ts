import { createContext, useContext } from "react";

/* Context object + consumer hook for auth, kept in a non-component module so
   the provider file can export only its component (satisfies react-refresh /
   Fast Refresh). Mirrors what a future Firebase Auth wrapper would expose. */

export interface AdminUser {
  email: string;
  name: string;
}

export interface AuthContextValue {
  user: AdminUser | null;
  /** Resolves after a short fake delay to mimic a network round-trip. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Mock is synchronous, so always false here; a real Firebase provider would
      flip this true until the first onAuthStateChanged callback fires. */
  loading: boolean;
}

export const STORAGE_KEY = "perfumora_admin_user";

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
