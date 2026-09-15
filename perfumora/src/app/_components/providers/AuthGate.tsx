"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ---------------------------------------------------------------------------
   Auth-gate context — the bridge between <Checkout> and <Navigation>.

   <Checkout> and <Navigation> are siblings under the root layout's providers.
   Checkout has no way to open Navigation's auth modal directly, and giving it
   one would mean either lifting the panel state into a provider (which couples
   every route to the panel) or reaching through a ref, which is fragile across
   server/client boundaries.

   This context is the lightweight alternative: it carries a single callback
   (`requestAuth`) that any component can call, and the listener on the other
   side (`onAuthRequested` / `authGateOpen`) is whatever owns the auth modal.

   The flow:
     1. Checkout calls `requestAuth(onDismiss)` when a guest presses Place order.
     2. Navigation, subscribed here, opens the auth modal.
     3. When the modal closes (dismiss or sign-in), it calls `resolveAuthGate()`,
        which fires `onDismiss` — Checkout resumes and places the order.
--------------------------------------------------------------------------- */

interface AuthGateContextValue {
  /** Ask the auth modal to open. The `onDismiss` callback fires when the modal
   *  closes, regardless of whether the customer signed in. */
  requestAuth: (onDismiss: () => void) => void;

  /** Whether an auth-gate request is active — Navigation reads this to open
   *  its auth panel. */
  authGateOpen: boolean;

  /** Called by Navigation when the auth modal closes, so the pending
   *  `onDismiss` fires and `authGateOpen` resets. */
  resolveAuthGate: () => void;
}

const AuthGateContext = createContext<AuthGateContextValue>({
  requestAuth: () => {},
  authGateOpen: false,
  resolveAuthGate: () => {},
});

export function useAuthGate() {
  return useContext(AuthGateContext);
}

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dismissRef = useRef<(() => void) | null>(null);

  const requestAuth = useCallback((onDismiss: () => void) => {
    dismissRef.current = onDismiss;
    setOpen(true);
  }, []);

  const resolveAuthGate = useCallback(() => {
    setOpen(false);
    // Fire the dismiss callback asynchronously so the modal's close animation
    // can play out before Checkout starts its transition.
    const cb = dismissRef.current;
    dismissRef.current = null;
    if (cb) setTimeout(cb, 0);
  }, []);

  return (
    <AuthGateContext.Provider
      value={{ requestAuth, authGateOpen: open, resolveAuthGate }}
    >
      {children}
    </AuthGateContext.Provider>
  );
}
