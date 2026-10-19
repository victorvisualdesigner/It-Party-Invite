import type { Metadata } from "next";
import { PageTop } from "@/components/admin/PageTop";
import { eventBreakdown } from "@/lib/admin-data";
import { listAdmins } from "@/lib/admins";
import { requireSuperadmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { formatEventWhen } from "@/lib/event";
import { hostLoginUrl } from "@/lib/host-link";
import { localPhone } from "@/lib/phone";
import { listEvents } from "@/lib/settings";
import { CreateEventButton, EventCard, type EventCardView } from "./EventsClient";

export const metadata: Metadata = { title: t("admin.events.title") };
export const dynamic = "force-dynamic";

// The superadmin's view of the whole platform: every event, its numbers and who runs it.
export default async function EventsPage() {
  const me = await requireSuperadmin();
  const [events, breakdown, admins] = await Promise.all([listEvents(), eventBreakdown(), listAdmins()]);
  const statsOf = new Map(breakdown.rows.map((r) => [r.eventId, r]));
  const cards: EventCardView[] = events.map((e) => {
    const s = statsOf.get(e.id);
    return {
      id: e.id,
      name: e.name,
      when: e.starts_at ? formatEventWhen(e.starts_at, e.end_date) : t("admin.events.no_date"),
      current: e.id === me.eventId,
      hostLink: hostLoginUrl(e.id),
      stats: {
        paid: s?.paid ?? 0,
        awaiting: s?.awaiting ?? 0,
        open: s?.open ?? 0,
        collected: s?.collected ?? "₦0",
        members: s?.members ?? 0,
        taps: s?.taps ?? 0,
      },
      admins: admins.filter((a) => a.eventId === e.id).map((a) => ({ ...a, phone: localPhone(a.phone) })),
    };
  });
  const total = breakdown.total;
  return (
    <>
      <PageTop title={t("admin.events.title")} subtitle={t("admin.events.subtitle")} tools={<CreateEventButton />} />
      <section className="kpis" aria-label={t("admin.events.totals")}>
        {(["paid", "awaiting", "open", "collected"] as const).map((k) => (
          <div className={k === "paid" ? "card kpi hero" : "card kpi"} key={k}>
            <span className="label">{t(`admin.events.stats.${k}` as never)}</span>
            <span className="value">{total[k]}</span>
            <span className="sub">{t("admin.events.totals")}</span>
          </div>
        ))}
      </section>
      {cards.length ? (
        <div className="event-grid">
          {cards.map((c) => (
            <EventCard key={c.id} event={c} />
          ))}
        </div>
      ) : (
        <section className="card empty-state">
          <p>{t("admin.events.empty")}</p>
        </section>
      )}
    </>
  );
}
