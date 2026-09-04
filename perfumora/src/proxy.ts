import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/* ---------------------------------------------------------------------------
   Keeping the customer's session alive — `proxy.ts`, not `middleware.ts`.

   Next 16 deprecated the `middleware` file convention and renamed it to `proxy`
   (see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
   proxy.md); the function must be named `proxy` too, and it defaults to the
   Node.js runtime. It sits beside `app/`, hence `src/proxy.ts`.

   It exists for one job: refreshing the access token. GoTrue's access token
   expires in about an hour, and only whoever can write a `Set-Cookie` header can
   store the refreshed one — which a Server Component cannot do. Without this
   file the session would work for an hour and then quietly stop resolving on the
   server, the single most common way a Supabase SSR setup breaks. `getUser()`
   below is what triggers the refresh; the result is discarded on purpose, since
   the point is the write-back, not the answer.

   This is *not* an authorisation check, and nothing is gated here. Two reasons:
   Row Level Security is the real boundary, and Next's own docs warn that Server
   Functions are POSTs to whatever route they were called from, so a matcher
   change could silently take a guard off one. Access is decided by the policies
   in perfumora-admin/supabase/schema.sql on every query instead.
--------------------------------------------------------------------------- */

export async function proxy(request: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  // Unset config is already fatal at import in `supabase-server.ts`, with a
  // message naming both variables. Refusing to serve the request from here as
  // well would only replace that with a blank page.
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (written, headers) => {
        // Written twice, to two different places. Onto the *request* so that the
        // render this same visit is about to do already sees the fresh token
        // rather than the expired one it arrived with; onto the *response* so the
        // browser keeps it for next time. The response is rebuilt in between
        // because it has to be constructed from the amended request headers.
        for (const { name, value } of written) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request: { headers: request.headers } });
        for (const { name, value, options } of written) {
          response.cookies.set(name, value, options);
        }
        // `no-store` and friends, supplied by @supabase/ssr. A response carrying
        // a `Set-Cookie` for one visitor's session must never be cached by a CDN
        // and handed to the next one.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Without a matcher this runs on every request, static assets included — which
  // here means a token refresh attempt per font, per sound cue, and per fetch of
  // a multi-megabyte .glb. Pages and Server Actions are all that need it.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|sounds/|.*\\.(?:glb|svg|png|jpg|jpeg|webp|avif|woff2?|mp3|ogg)$).*)",
  ],
};
