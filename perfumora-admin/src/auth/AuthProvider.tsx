import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AuthContext, type AdminUser, type AuthContextValue } from "./context";

/* ---------------------------------------------------------------------------
   Supabase Auth provider.

   Sessions live in localStorage (see src/lib/supabase.ts) and are restored
   asynchronously on boot, so `loading` starts true and ProtectedRoute holds
   the route until we know whether anyone is signed in. After that,
   onAuthStateChange is the single source of truth — sign-in, sign-out and
   token refresh all flow through it, so no call site has to set the user.

   There is no sign-up path by design: the admin account is created by hand in
   the Supabase dashboard, with public sign-ups disabled.
--------------------------------------------------------------------------- */

function toAdminUser(session: Session | null): AdminUser | null {
  const user = session?.user;
  if (!user) return null;

  const email = user.email ?? "";
  const metaName = user.user_metadata?.name;
  const fromEmail = email.split("@")[0] || "Admin";

  return {
    id: user.id,
    email,
    name:
      typeof metaName === "string" && metaName.trim()
        ? metaName
        : fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1),
  };
}

/** Supabase's wording for a bad password is blunt; soften just that one. */
function loginMessage(message: string): string {
  return message === "Invalid login credentials"
    ? "That email and password don't match an admin account."
    : message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // First paint: read whatever session was persisted.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(toAdminUser(data.session));
      setLoading(false);
    });

    // Then keep in step with every later change.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAdminUser(session));
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,

      login: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(loginMessage(error.message));
      },

      logout: async () => {
        try {
          await supabase.auth.signOut();
        } catch {
          // Offline, or the token was already dead server-side. Either way the
          // local session is what keeps the panel open, so clear it regardless.
        }
        setUser(null);
      },

      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw new Error(error.message);
      },

      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(error.message);
      },
    }),
    [user, loading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

