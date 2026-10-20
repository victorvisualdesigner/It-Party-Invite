"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/Dialog";
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
import { cancelInviteAction, letInFreeAction, rejectAskAction, resetAccessAction, setAskAllowedAction, setPriceAction, setVipAction } from "./actions";

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

/* ---------- One guest's controls: price, VIP card, inviter paying ---------- */

function ManageDialog({ row, onClose }: { row: GuestRow; onClose: () => void }) {
  const toast = useToast();
  const titleId = useId();
  const [price, setPrice] = useState(row.ownPriceDigits);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [vip, setVip] = useState(row.vip);
  const [askOn, setAskOn] = useState(row.askOn);
  const [asking, setAsking] = useState(!!row.askedAt);
  const [rejecting, setRejecting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const vars = { guest: row.guest, inviter: row.inviter };

  function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    startTransition(async () => {
      await work();
      setBusy(null);
    });
  }
  function savePrice(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPriceError(null);
    run("price", async () => {
      const r = await callAction(() => setPriceAction(row.id, price));
      if (r.ok) toast(r.data.paid ? t("admin.guests.manage.price_free_done", vars) : t("admin.guests.manage.price_saved", vars));
      else if ("errors" in r && r.errors?.price) setPriceError(r.errors.price);
      else toast(t("admin.common.error_network"));
    });
  }
  function toggleVip(on: boolean) {
    setVip(on);
    run("vip", async () => {
      const r = await callAction(() => setVipAction(row.id, on));
      if (r.ok) toast(on ? t("admin.guests.manage.vip_on", vars) : t("admin.guests.manage.vip_off", vars));
      else {
        setVip(!on);
        toast(t("admin.common.error_network"));
      }
    });
  }
  function toggleAsk(on: boolean) {
    setAskOn(on);
    run("ask", async () => {
      const r = await callAction(() => setAskAllowedAction(row.id, on));
      if (r.ok) {
        if (!on) setAsking(false);
        toast(on ? t("admin.guests.manage.ask_on_done", vars) : t("admin.guests.manage.ask_off_done", vars));
      } else {
        setAskOn(!on);
        toast(t("admin.common.error_network"));
      }
    });
  }
  function reject() {
    run("reject", async () => {
      const r = await callAction(() => rejectAskAction(row.id));
      setRejecting(false);
      if (r.ok) {
        setAsking(false);
        setAskOn(false);
        toast(t("admin.guests.manage.reject_done", vars));
      } else toast(t("admin.common.error_network"));
    });
  }

  if (rejecting) {
    return (
      <ConfirmDialog
        title={t("admin.guests.manage.reject_title", vars)}
        body={t("admin.guests.manage.reject_body", vars)}
        okLabel={t("admin.guests.manage.reject")}
        danger
        onClose={() => setRejecting(false)}
        onOk={async () => reject()}
      />
    );
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <div className="manage">
        <header className="manage-head">
          <MiniSeal letter={row.guest.charAt(0).toUpperCase()} />
          <div>
            <h2 id={titleId}>{row.guest}</h2>
            <small>{t("admin.guests.manage.subtitle", vars)}</small>
          </div>
          <span className={`chip chip-${row.status}`}>{t(statusKey(row.status))}</span>
        </header>

        <section className="manage-part" aria-labelledby={`${titleId}-price`}>
          <h3 id={`${titleId}-price`}>{t("admin.guests.manage.price_title")}</h3>
          {row.canPrice ? (
            <form className="manage-price" noValidate onSubmit={savePrice}>
              <label htmlFor={`${titleId}-p`}>{t("admin.guests.manage.price_label", vars)}</label>
              <div className="manage-price-row">
                <div className="input-affix">
                  <span className="affix">₦</span>
                  <input
                    className="input num"
                    id={`${titleId}-p`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={row.eventPrice.replace(/[₦,]/g, "")}
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d,]/g, ""))}
                    aria-invalid={priceError ? true : undefined}
                    aria-describedby={`${titleId}-ph`}
                  />
                </div>
                <button className="btn btn-gold btn-sm" type="submit" disabled={pending} aria-busy={busy === "price"}>
                  {t("admin.guests.manage.price_save")}
                </button>
              </div>
              <span className="help" id={`${titleId}-ph`}>
                {t("admin.guests.manage.price_help", { price: row.eventPrice })}
              </span>
              {priceError ? (
                <p className="error" role="alert">
                  {priceError}
                </p>
              ) : null}
            </form>
          ) : (
            <p className="quiet">{t("admin.guests.manage.price_locked")}</p>
          )}
        </section>

        <section className="manage-part" aria-labelledby={`${titleId}-vip`}>
          <h3 id={`${titleId}-vip`}>{t("admin.guests.manage.vip_title")}</h3>
          <label className="switch" htmlFor={`${titleId}-v`}>
            <span>
              <b>{t("admin.guests.manage.vip_label", vars)}</b>
              <small>{t("admin.guests.manage.vip_help")}</small>
            </span>
            <input type="checkbox" id={`${titleId}-v`} checked={vip} disabled={busy === "vip"} aria-busy={busy === "vip"} onChange={(e) => toggleVip(e.target.checked)} />
          </label>
        </section>

        <section className="manage-part" aria-labelledby={`${titleId}-ask`}>
          <h3 id={`${titleId}-ask`}>{t("admin.guests.manage.ask_title")}</h3>
          {asking && row.askedAt ? (
            <div className="manage-note">
              <p>{t("admin.guests.manage.asking_note", { ...vars, when: timeAgo(row.askedAt) })}</p>
              <button className="btn btn-danger btn-sm" type="button" disabled={pending} aria-busy={busy === "reject"} onClick={() => setRejecting(true)}>
                <Icon name="x" />
                <span>{t("admin.guests.manage.reject")}</span>
              </button>
            </div>
          ) : null}
          <label className="switch" htmlFor={`${titleId}-a`}>
            <span>
              <b>{t("admin.guests.manage.ask_label", vars)}</b>
              <small>{t("admin.guests.manage.ask_help", vars)}</small>
            </span>
            <input type="checkbox" id={`${titleId}-a`} checked={askOn} disabled={busy === "ask"} aria-busy={busy === "ask"} onChange={(e) => toggleAsk(e.target.checked)} />
          </label>
          {!askOn && row.askRejected ? <p className="quiet">{t("admin.guests.manage.rejected_note", vars)}</p> : null}
        </section>

        <div className="actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose} data-autofocus>
            {t("admin.guests.manage.done")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function GuestsTable({ rows, inviters }: { rows: GuestRow[]; inviters: { id: string; name: string }[] }) {
  const toast = useToast();
  const [status, setStatus] = useState<"all" | InviteStatus>("all");
  const [inviter, setInviter] = useState("all");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "reset" | "cancel" | "free"; row: GuestRow } | null>(null);
  const [managing, setManaging] = useState<GuestRow | null>(null);
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
                        {r.vip ? <span className="chip chip-vip">{t("admin.guests.manage.vip_chip")}</span> : null}
                        {r.ownPrice ? <span className="chip chip-price">{t("admin.guests.manage.own_price_chip", { price: r.ownPrice })}</span> : null}
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
                        {r.partPaid ? <small className="part-paid">{r.partPaid}</small> : null}
                      </td>
                      <td className="num-cell quiet">{timeAgo(r.sentAt)}</td>
                      <td>
                        <div className="row-actions">
                          {r.status !== "cancelled" ? (
                            <button className="btn btn-ghost btn-sm manage-btn" type="button" aria-label={`${t("admin.guests.manage.button")} ${r.guest}`} onClick={() => setManaging(r)}>
                              <Icon name="more" />
                              <span>{t("admin.guests.manage.button")}</span>
                            </button>
                          ) : null}
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
      {managing ? <ManageDialog row={managing} onClose={() => setManaging(null)} /> : null}
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
