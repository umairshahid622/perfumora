import { useMemo, useState, type ReactNode } from "react";
import {
  AuthContext,
  STORAGE_KEY,
  type AdminUser,
  type AuthContextValue,
} from "./context";

/* ---------------------------------------------------------------------------
   Mock auth provider — design-phase only. Persists a fake "session" to
   localStorage so refreshes stay logged in and ProtectedRoute has something to
   check. No real credential check happens — any email + password "succeeds".

   Shaped to mirror a future Firebase Auth provider: swap this body for
   onAuthStateChanged / signInWithEmailAndPassword and every `useAuth()`
   consumer stays identical.
--------------------------------------------------------------------------- */

// Read any persisted session synchronously on first render (no mount flash).
function readStoredUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null; // Ignore malformed storage.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(readStoredUser);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: false,
      login: (email) =>
        new Promise((resolve) => {
          // Fake latency so the button's loading state is visible.
          setTimeout(() => {
            const derivedName = email.split("@")[0] || "Admin";
            const next: AdminUser = {
              email,
              name: derivedName.charAt(0).toUpperCase() + derivedName.slice(1),
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            setUser(next);
            resolve();
          }, 600);
        }),
      logout: () => {
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
