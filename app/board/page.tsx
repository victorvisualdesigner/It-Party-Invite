import type { Metadata } from "next";
import { Envelope } from "@/components/Envelope";
import { LogoMark } from "@/components/brand/Logo";
import { boardRows } from "@/lib/admin-data";
import { getAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { formatEventDate } from "@/lib/event";
import { getEvent } from "@/lib/settings";
import { BoardRefresh } from "./BoardRefresh";
import "./board.css";

export const metadata: Metadata = { title: t("admin.nav.board") };
export const dynamic = "force-dynamic";

// For a TV at the party. Admin session required; refreshes every 30 seconds.
export default async function BoardPage() {
  const admin = await getAdmin();
  if (!admin) {
    return (
      <main className="board-root surface-dark bg-club">
        <div className="gate">
          <Envelope mark={t("guest.lock.envelope_mark")} />
          <h1 className="display">{t("admin.login.title")}</h1>
          <a className="btn btn-gold" href="/admin/login">
            {t("admin.login.submit")}
          </a>
        </div>
      </main>
    );
  }
  const [event, rows] = await Promise.all([getEvent(), boardRows()]);
  const year = event.starts_at ? new Date(event.starts_at).getUTCFullYear() : new Date().getUTCFullYear();
  const max = Math.max(1, rows[0]?.taps ?? 1);
  const tapsLabel = (t("admin.board.row", { guest: "\u0001", n: "\u0002" }).split(" · ")[1] ?? "").replace("\u0002", "").trim();
  return (
    <main className="board-root surface-dark bg-club">
      <BoardRefresh />
      <div className="board">
        <header className="b-head">
          <div>
            <p className="eyebrow">{event.name}</p>
            <h1 className="display">{t("admin.board.title", { year })}</h1>
            <p className="sub">{t("admin.board.subtitle")}</p>
          </div>
          <LogoMark size={110} />
        </header>
        {rows.length ? (
          <ol className="rows-b">
            {rows.map((r, i) => (
              <li className={i === 0 ? "r first" : "r"} key={r.id} style={{ animationDelay: `${i * 70}ms` }}>
                <span className="rank">{i + 1}</span>
                <span className="nm">{r.guest}</span>
                <span className="bar">
                  <i style={{ transform: `scaleX(${(r.taps / max).toFixed(3)})` }} />
                </span>
                <span className="n">
                  <b>{r.taps}</b>
                  {tapsLabel}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-b">{t("admin.activity.empty")}</div>
        )}
        <footer className="b-foot">
          <span>{event.starts_at ? formatEventDate(event.starts_at) : ""}</span>
          <span>{t("guest.ticket.board_toggle")}</span>
        </footer>
      </div>
    </main>
  );
}
