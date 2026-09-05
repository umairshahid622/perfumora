import { redirect } from "next/navigation";
import { ResetPassword } from "../_components/sections/ResetPassword";
import { recoveringCustomer } from "../_lib/auth";

/**
 * Never cached — the same reasoning as `/settings` and `/orders`, and here it is not
 * even nearly shared: what this page renders belongs to whoever opened the last reset
 * link, and the root layout's `revalidate = 300` is what this line is answering.
 */
export const revalidate = 0;

/**
 * The `/reset-password` route — where the emailed reset link ends up, by way of
 * `/auth/confirm`, which spends the token and writes the session before this ever runs.
 *
 * `recoveringCustomer()` rather than `currentCustomer()`, which is the whole of the
 * guard: it answers with an account only when the session came from following a link,
 * so a signed-in customer who types this path in is sent home exactly like a visitor.
 * That is not tidiness — `resetPassword` sets a password without asking for the old
 * one, and if an ordinary session were enough to get here, an unlocked laptop would be
 * enough to take an account over.
 *
 * Home for all three of the ways that check says no — no session, an ordinary session,
 * a link already spent — since the only thing this page could honestly offer any of
 * them is the link they do not have. The form itself explains a link that expires
 * mid-form, because by then there is a page to explain it on.
 */
export default async function ResetPasswordPage() {
  const customer = await recoveringCustomer();
  if (!customer) redirect("/");

  return (
    <main className="bg-bg-light text-ink min-h-screen pt-[4.75rem]">
      <div className="py-10 md:py-12">
        <ResetPassword customer={customer} />
      </div>
    </main>
  );
}
