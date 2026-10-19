import type { Metadata } from "next";
import { PageTop } from "@/components/admin/PageTop";
import { requireEventAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { toLagosParts } from "@/lib/event";
import type { EventInput } from "@/lib/schemas";
import { getEvent } from "@/lib/settings";
import { EventForm } from "./EventForm";

export const metadata: Metadata = { title: t("admin.event.title") };

function lagosLocal(iso: string | null): string {
  const { date, time } = toLagosParts(iso);
  return date ? `${date}T${time}` : "";
}

export default async function EventPage() {
  const admin = await requireEventAdmin();
  const event = await getEvent(admin.eventId);
  const starts = toLagosParts(event.starts_at);
  const initial: EventInput = {
    name: event.name,
    date: starts.date,
    time: starts.time,
    end_date: event.end_date ?? "",
    days: event.days.map((d) => ({ date: d.date, name: d.name ?? "", dress_code: d.dress_code ?? "" })),
    venue_name: event.venue_name,
    venue_address: event.venue_address,
    dress_code: event.dress_code,
    price: String(Math.round(event.price_kobo / 100)),
    refund_text: event.refund_text,
    capacity: event.capacity == null ? "" : String(event.capacity),
    hold_window_hours: String(event.hold_window_hours),
    unopened_expiry_days: String(event.unopened_expiry_days),
    invites_open: event.invites_open,
    installments: event.installments,
    reveal_date_mode: event.reveal_date_mode,
    reveal_date_at: lagosLocal(event.reveal_date_at),
    reveal_venue_mode: event.reveal_venue_mode,
    reveal_venue_at: lagosLocal(event.reveal_venue_at),
    card: { ...event.card },
  };
  return (
    <>
      <PageTop title={t("admin.event.title")} subtitle={t("admin.event.subtitle")} />
      <EventForm initial={initial} hostName={admin.first_name} />
    </>
  );
}
