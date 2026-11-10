/** In-memory render context only; no draft, identity or credential is persisted here. */
export type ConfirmationContextTicket = symbol;

/** Invalidates delayed prepare results and armed confirmations synchronously on a render context change. */
export function createConfirmationContext(initialScope: string) {
  let scope = initialScope;
  let ticket = Symbol();
  const invalidate = () => { ticket = Symbol(); };
  return {
    update(nextScope: string) { if (nextScope !== scope) { scope = nextScope; invalidate(); } },
    invalidate,
    capture: (): ConfirmationContextTicket => ticket,
    isCurrent: (candidate: ConfirmationContextTicket | undefined): boolean => candidate === ticket,
  };
}
