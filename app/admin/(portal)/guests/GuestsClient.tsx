"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog, KeyDialog } from "@/components/admin/Dialogs";
import { Icon } from "@/components/Icon";
import { MiniSeal } from "@/components/Seal";
import { useToast } from "@/components/Toast";
import type { GuestRow } from "@/lib/admin-data";
import { callAction } from "@/lib/client-action";
import { t, tList } from "@/lib/copy";
import type { KeyedMessage } from "@/lib/invites";
import { timeAgo } from "@/lib/time";
import type { InviteStatus } from "@/lib/types";
import { cancelInviteAction, letInFreeAction, resetAccessAction } from "./actions";

const STATUSES: InviteStatus[] = ["sent", "opened", "said_yes", "awaiting_confirmation", "paid", "expired", "cancelled"];
const ACTIVE: InviteStatus[] = ["sent", "opened", "said_yes", "awaiting_confirmation"];
const statusKey = (s: InviteStatus) => `member.status.${s === "awaiting_confirmation" ? "awaiting" : s}` as never;

function csv(rows: GuestRow[]): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Guest", "Invited by", "Ticket code", "Phone", "No taps", "Checked in"];
  return [head, ...rows.map((r) => [r.guest, r.inviter, r.ticketCode, r.phone, r.taps, ""])].map((line) => line.map(cell).join(",")).join("\n");
}

export function ExportPaidButton({ rows }: { rows: GuestRow[] }) {
  const toast = useToast();
  function exportPaid() {
    const blob = new Blob([csv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "paid-guests.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 400);
    toast(t("admin.guests.exported"));
  }
  return (
    <button className="btn btn-gold btn-sm" type="button" onClick={exportPaid}>
      <Icon name="download" />
      <span>{t("admin.guests.export")}</span>
    </button>
  );
}

export function GuestsTable({ rows, inviters }: { rows: GuestRow[]; inviters: { id: string; name: string }[] }) {
  const toast = useToast();
  const [status, setStatus] = useState<"all" | InviteStatus>("all");
  const [inviter, setInviter] = useState("all");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "reset" | "cancel" | "free"; row: GuestRow } | null>(null);
  const [keyed, setKeyed] = useState<KeyedMessage | null>(null);
  const cols = tList("admin.guests.columns");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = rows.filter(
    (r) => (status === "all" || r.status === status) && (inviter === "all" || r.inviterId === inviter) && (!q || r.guest.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <>
      <section className="card">
        <div className="toolbar">
          <label className="search">
            <Icon name="search" />
            <span className="sr">{t("admin.guests.search")}</span>
            <input className="input" type="search" placeholder={t("admin.guests.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="input" aria-label={t("admin.guests.all_inviters")} value={inviter} onChange={(e) => setInviter(e.target.value)}>
            <option value="all">{t("admin.guests.all_inviters")}</option>
            {inviters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="filters" role="group" aria-label="Status">
            <button type="button" aria-pressed={status === "all"} onClick={() => setStatus("all")}>
              {t("admin.guests.all")}
              <span>{rows.length}</span>
            </button>
            {STATUSES.map((s) => (
              <button type="button" key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>
                {t(statusKey(s)).split(",")[0]}
                <span>{counts[s] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.length ? (
                shown.map((r) => {
                  const active = ACTIVE.includes(r.status);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="who">
                          <MiniSeal letter={r.guest.charAt(0).toUpperCase()} quiet={!active && r.status !== "paid"} />
                          <div>
                            <b>{r.guest}</b>
                            <small>{r.masked}</small>
                          </div>
                        </div>
                      </td>
                      <td>{r.inviter}</td>
                      <td>
                        <span className={`chip chip-${r.status}`}>{t(statusKey(r.status))}</span>
                        {r.covered && r.status !== "paid" ? <span className="chip chip-covered">{t("member.status.covered")}</span> : null}
                        {r.asked ? <span className="chip chip-asked">{t("admin.guests.asked")}</span> : null}
                      </td>
                      <td className="taps-cell">
                        <b>{r.taps}</b>
                      </td>
                      <td className="pay-cell">
                        {r.payment ? (
                          <>
                            <span className="ref">{r.payment.reference}</span>
                            <small>
                              {r.payment.status === "confirmed"
                                ? `${r.payment.amount} · ${r.payment.byGuest ? t("admin.payments.paid_by_guest") : r.inviter}`
                                : r.payment.status === "claimed"
                                  ? t("member.status.awaiting")
                                  : r.payment.status === "not_found"
                                    ? t("admin.payments.not_found")
                                    : t("member.status.said_yes").split(",")[0]}
                            </small>
                          </>
                        ) : (
                          <span className="quiet">{t("admin.guests.unpaid")}</span>
                        )}
                      </td>
                      <td className="num-cell quiet">{timeAgo(r.sentAt)}</td>
                      <td>
                        <div className="row-actions">
                          {r.notifyHref ? (
                            <a className="icon-btn" href={r.notifyHref} target="_blank" rel="noopener noreferrer" title={t("admin.payments.notify_guest", { guest: r.guest })} aria-label={t("admin.payments.notify_guest", { guest: r.guest })}>
                              <Icon name="whatsapp" />
                            </a>
                          ) : null}
                          {r.revealHref ? (
                            <a className="icon-btn" href={r.revealHref} target="_blank" rel="noopener noreferrer" title={t("member.guest_actions.nudge_reveal")} aria-label={`${t("member.guest_actions.nudge_reveal")} ${r.guest}`}>
                              <Icon name="spark" />
                            </a>
                          ) : null}
                          {r.canFree ? (
                            <button className="icon-btn" type="button" title={t("admin.guests.actions.let_in_free")} aria-label={t("admin.guests.let_in_free_title", { guest: r.guest })} onClick={() => setConfirm({ kind: "free", row: r })}>
                              <Icon name="check" />
                            </button>
                          ) : null}
                          {active || r.status === "paid" ? (
                            <button className="icon-btn" type="button" title={t("admin.guests.actions.reset")} aria-label={`${t("admin.guests.actions.reset")} ${r.guest}`} onClick={() => setConfirm({ kind: "reset", row: r })}>
                              <Icon name="refresh" />
                            </button>
                          ) : null}
                          {active ? (
                            <button className="icon-btn" type="button" title={t("admin.guests.actions.cancel")} aria-label={`${t("admin.guests.actions.cancel")} ${r.guest}`} onClick={() => setConfirm({ kind: "cancel", row: r })}>
                              <Icon name="x" />
                            </button>
                          ) : null}
                          {r.status !== "cancelled" ? (
                            <a className="icon-btn" href={`/i/${r.token}`} target="_blank" rel="noopener noreferrer" title={t("admin.guests.actions.open")} aria-label={`${t("admin.guests.actions.open")} ${r.guest}`}>
                              <Icon name="eye" />
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="empty-row">
                    {t("admin.guests.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {confirm?.kind === "reset" ? (
        <ConfirmDialog
          title={t("member.guest_actions.reset_access")}
          body={t("member.guest_actions.reset_confirm")}
          okLabel={t("member.guest_actions.reset_access")}
          onClose={() => setConfirm(null)}
          onOk={async () => {
            const r = await callAction(() => resetAccessAction(confirm.row.id));
            setConfirm(null);
            if (r.ok) setKeyed(r.data);
            else toast(t("admin.common.error_network"));
          }}
        />
      ) : null}
      {confirm?.kind === "cancel" ? (
        <ConfirmDialog
          title={t("member.guest_actions.cancel")}
          body={t("member.guest_actions.cancel_confirm", { guest: confirm.row.guest })}
          okLabel={t("member.guest_actions.cancel")}
          danger
          onClose={() => setConfirm(null)}
          onOk={async () => {
            const r = await callAction(() => cancelInviteAction(confirm.row.id));
            setConfirm(null);
            toast(r.ok ? t("member.detail.cancel_done") : t("admin.common.error_network"));
          }}
        />
      ) : null}
      {confirm?.kind === "free" ? (
        <ConfirmDialog
          title={t("admin.guests.let_in_free_title", { guest: confirm.row.guest })}
          body={t("admin.guests.let_in_free_body", { guest: confirm.row.guest, inviter: confirm.row.inviter })}
          okLabel={t("admin.guests.actions.let_in_free")}
          onClose={() => setConfirm(null)}
          onOk={async () => {
            const r = await callAction(() => letInFreeAction(confirm.row.id));
            setConfirm(null);
            toast(r.ok ? t("admin.guests.let_in_free_done", { guest: confirm.row.guest }) : t("admin.common.error_network"));
          }}
        />
      ) : null}
      {keyed ? (
        <KeyDialog
          name={keyed.guest}
          keyText={keyed.key}
          note={t("member.detail.reset_done")}
          waHref={keyed.waHref}
          sendLabel={t("member.new_invite.send")}
          onClose={() => setKeyed(null)}
        />
      ) : null}
    </>
  );
}
