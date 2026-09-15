"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/* ---------------------------------------------------------------------------
   Human-readable messages for the error codes Supabase sends back in the URL
   when a token-based flow fails. The URL shape is:

     /?error=access_denied&error_code=otp_expired
      &error_description=Email+link+is+invalid+or+has+expired
      #error=access_denied&error_code=otp_expired&...

   Supabase puts the same fields in both the query string and the hash fragment.
   We read from whichever is available.
--------------------------------------------------------------------------- */

const FRIENDLY: Record<string, { title: string; body: string }> = {
  otp_expired: {
    title: "Link expired",
    body: "The password-reset link you used has expired. Please request a new one and try again.",
  },
  otp_disabled: {
    title: "Link disabled",
    body: "This link has been disabled. Please request a new password-reset link.",
  },
  access_denied: {
    title: "Access denied",
    body: "We couldn't verify your identity with that link. It may have been used already or expired.",
  },
};

const FALLBACK = {
  title: "Something went wrong",
  body: "There was a problem with your authentication link. Please try again or request a new link.",
};

/**
 * A toast-style banner that appears at the top of the page when the URL carries
 * Supabase auth error parameters. Dismissible, auto-fades in, and cleans the URL
 * so the error doesn't persist in the address bar or browser history.
 */
export function AuthErrorBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 1. Try query string first
    let errorCode = searchParams.get("error_code");
    let errorDesc = searchParams.get("error_description");
    let errorType = searchParams.get("error");

    // 2. Fall back to hash fragment (Supabase implicit flow puts params there)
    if (!errorCode && !errorType && typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("error")) {
        const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
        errorCode = hashParams.get("error_code");
        errorDesc = hashParams.get("error_description");
        errorType = hashParams.get("error");
      }
    }

    // 3. Also handle our own `?confirm=expired` / `?confirm=invalid` from /auth/confirm
    const confirm = searchParams.get("confirm");
    if (confirm === "expired" || confirm === "invalid") {
      errorCode = "otp_expired";
    }

    if (!errorCode && !errorType) return;

    // Resolve the message
    const message =
      FRIENDLY[errorCode ?? ""] ??
      FRIENDLY[errorType ?? ""] ??
      FALLBACK;

    setError(message);
    // Trigger the fade-in on the next frame
    requestAnimationFrame(() => setVisible(true));

    // Clean the URL without a navigation (removes both query and hash)
    if (typeof window !== "undefined") {
      const clean = window.location.pathname;
      window.history.replaceState(null, "", clean);
    }
  }, [searchParams]);

  if (!error) return null;

  return (
    <div
      role="alert"
      className={`fixed top-20 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 transition-all duration-500 ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-4 opacity-0"
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-red-200 bg-white/95 shadow-xl backdrop-blur-md">
        {/* Top accent bar */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-400 via-rose-400 to-amber-400" />

        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          {/* Icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-5 w-5 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              {error.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              {error.body}
            </p>
          </div>

          {/* Dismiss */}
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              // Let the fade-out complete before removing from the DOM
              setTimeout(() => setError(null), 500);
            }}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
