// What one guest pays. A host can give a guest their own price; otherwise it is the event's.
import type { EventRow, Invite } from "@/lib/types";

/** This guest's price in kobo: their own when a host set one (zero means free), else the event's. */
export function seatPrice(inv: Pick<Invite, "price_kobo">, event: Pick<EventRow, "price_kobo">): number {
  return inv.price_kobo ?? event.price_kobo;
}

/** Can a host change this guest's price now? Not once they paid or while a transfer is being checked. */
export function priceEditable(inv: Pick<Invite, "status">): boolean {
  return ["sent", "opened", "said_yes"].includes(inv.status);
}
