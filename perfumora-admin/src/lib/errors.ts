/**
 * Pull a display-ready message out of an unknown thrown value.
 *
 * The API layer throws `Error`s with messages written for the screen, so the
 * common path is just `err.message`; `fallback` covers anything else that ends
 * up in a catch block.
 */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
