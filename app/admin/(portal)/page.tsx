import type { Metadata } from "next";
import Link from "next/link";
import { PageTop } from "@/components/admin/PageTop";
import { Icon, type IconName } from "@/components/Icon";
import { MiniSeal } from "@/components/Seal";
import { overview } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { t, tList } from "@/lib/copy";
import { getEvent } from "@/lib/settings";
import { timeAgo } from "@/lib/time";
import { isHost } from "@/lib/types";

export const metadata: Metadata = { title: t("admin.overview.title") };
export const dynamic = "force-dynamic";

const ACT: Record<string, [IconName, string]> = {
  sent: ["invite", ""], opened: ["lock", ""], said_yes: ["check", "gold"], claimed: ["payments", "gold"], confirmed: ["spark", "gold"],
  not_found: ["x", "red"], expired: ["clock", ""], cancelled: ["x", "red"], resent: ["key", ""], reset_access: ["key", ""],
  wrong_attempt: ["lock", "red"], checked_in: ["door", "gold"], member_added: ["members", ""], member_removed: ["members", ""],
  event_updated: ["event", ""], account_switched: ["account", ""],
};

export default async function OverviewPage() {
  await requireAdmin();
  const event = await getEvent();
  const s = await overview(event.capacity);
  const cap = s.capacity ? Math.min(1, s.capacityUsed / s.capacity) : 0;
  const labels = tList("admin.overview.funnel");
  const max = Math.max(1, s.funnel[0]);
  return (
    <>
      <PageTop
        title={t("admin.overview.title")}
        subtitle={t("admin.overview.subtitle")}
        tools={
          <a className="btn btn-ghost btn-sm" href="/board" target="_blank" rel="noopener noreferrer">
            <Icon name="board" />
            <span>{t("admin.nav.board")}</span>
          </a>
        }
      />
      <div className="kpis">
        <div className="card kpi hero">
          <span className="label">{t("admin.overview.paid")}</span>
          <span className="value">{s.paid}</span>
          <span className="sub">{t("admin.overview.paid_sub")}</span>
        </div>
        <Link className={s.awaiting ? "card kpi alert" : "card kpi"} href="/admin/payments">
          <span className="label">{t("admin.overview.awaiting")}</span>
          <span className="value">{s.awaiting}</span>
          <span className="sub">{t("admin.overview.awaiting_sub")}</span>
          {s.awaiting ? <span className="go">{t("admin.overview.review")} →</span> : null}
        </Link>
        <div className="card kpi">
          <span className="label">{t("admin.overview.open")}</span>
          <span className="value">{s.open}</span>
          <span className="sub">{t("admin.overview.open_sub")}</span>
        </div>
        <div className="card kpi">
          <span className="label">{t("admin.overview.collected")}</span>
          <span className="value">{s.collected}</span>
          <span className="sub">{t("admin.overview.collected_sub")}</span>
        </div>
        <div className="card kpi">
          <span className="label">{t("admin.overview.capacity")}</span>
          {s.capacity ? (
            <>
              <span className="value">
                {s.capacityUsed}
                <span style={{ fontSize: 20, color: "var(--fg-quiet)" }}> / {s.capacity}</span>
              </span>
              <div className="meter">
                <i className={cap > 0.9 ? "gold" : ""} style={{ transform: `scaleX(${cap.toFixed(3)})` }} />
              </div>
              <span className="sub">{t("admin.overview.capacity_note", { left: Math.max(0, s.capacity - s.capacityUsed) })}</span>
            </>
          ) : (
            <span className="value" style={{ fontSize: 22 }}>
              {t("admin.overview.capacity_off")}
            </span>
          )}
        </div>
        <div className="card kpi">
          <span className="label">{t("admin.overview.no_taps_total")}</span>
          <span className="value">{s.taps}</span>
          <span className="sub">{t("admin.overview.taps_sub")}</span>
        </div>
      </div>
      <div className="two">
        <div className="grid">
          <section className="card card-pad">
            <h2>{t("admin.overview.funnel_title")}</h2>
            <div className="funnel">
              {s.funnel.map((n, i) => (
                <div className="f-row" key={labels[i]}>
                  <span>{labels[i]}</span>
                  <div className="bar">
                    <i style={{ transform: `scaleX(${(n / max).toFixed(3)})` }} />
                  </div>
                  <b>
                    {n}
                    {i ? <small>{Math.round((n / Math.max(1, s.funnel[i - 1])) * 100)}%</small> : null}
                  </b>
                </div>
              ))}
            </div>
          </section>
          <section className="card card-pad">
            <h2>{t("admin.overview.members_title")}</h2>
            <div className="funnel">
              {s.team.map((p) => (
                <div className="f-row" style={{ gridTemplateColumns: "1fr auto auto" }} key={p.id}>
                  <span className="who">
                    <MiniSeal letter={p.first_name.charAt(0).toUpperCase()} />
                    <span>
                      <b>{p.first_name}</b>
                      {isHost(p.role) ? <small>{t("admin.members.host")}</small> : null}
                    </span>
                  </span>
                  <span className="quiet num" style={{ fontSize: 13 }}>
                    {isHost(p.role) || p.slot_limit == null
                      ? t("admin.members.slots_used_unlimited", { used: p.used })
                      : t("admin.members.slots_used", { used: p.used, total: p.slot_limit })}
                  </span>
                  <b>
                    {p.paid}
                    <small>{t("admin.overview.paid").toLowerCase()}</small>
                  </b>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="card card-pad">
          <h2>{t("admin.overview.activity_title")}</h2>
          <ul className="feed">
            {s.activity.length ? (
              s.activity.map((a) => (
                <li key={a.id}>
                  <span className={`dot ${ACT[a.action]?.[1] ?? ""}`}>
                    <Icon name={ACT[a.action]?.[0] ?? "spark"} />
                  </span>
                  <span>{a.line}</span>
                  <time dateTime={a.at}>{timeAgo(a.at)}</time>
                </li>
              ))
            ) : (
              <li style={{ gridTemplateColumns: "1fr" }}>
                <span className="quiet">{t("admin.activity.empty")}</span>
              </li>
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
