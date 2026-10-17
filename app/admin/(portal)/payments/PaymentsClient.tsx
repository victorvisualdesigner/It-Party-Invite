"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/Dialogs";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { MiniSeal } from "@/components/Seal";
import { useToast } from "@/components/Toast";
import { callAction } from "@/lib/client-action";
import { t, tList } from "@/lib/copy";
import type { ConfirmResult, MatchCandidate } from "@/lib/payments";
import { timeAgo } from "@/lib/time";
import { confirmAction, manualConfirmAction, matchAction, notFoundAction } from "./actions";

export type ClaimRow = {
  id: string;
  guest: string;
  inviter: string;
  payer: string;
  amount: string;
  reference: string;
  sender: string;
  claimedAt: string;
  duplicate: boolean;
};

function useConfirmedToast() {
  const toast = useToast();
  return (r: ConfirmResult) =>
    toast(
      t("admin.payments.confirmed_toast", { guest: r.guest }),
      r.notifyHref ? { label: t("admin.payments.notify_guest", { guest: r.guest }), href: r.notifyHref } : undefined,
    );
}

/** Refreshes every 20 seconds and raises a browser notification for new claims while the tab is open. */
function useLiveClaims(ids: string[]) {
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [router]);
  useEffect(() => {
    if (seen.current) {
      const fresh = ids.filter((id) => !seen.current?.has(id));
      if (fresh.length && "Notification" in window && Notification.permission === "granted") {
        new Notification(t("admin.payments.title"), { body: t("admin.payments.subtitle"), tag: "claims" });
      }
    }
    seen.current = new Set(ids);
  }, [ids]);
}

export function ClaimsList({ rows }: { rows: ClaimRow[] }) {
  const toast = useToast();
  const confirmed = useConfirmedToast();
  const [pending, setPending] = useState<{ kind: "confirm" | "not_found"; row: ClaimRow } | null>(null);
  const cols = tList("admin.payments.columns");
  useLiveClaims(rows.map((r) => r.id));

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      const ask = () => Notification.requestPermission().catch(() => {});
      window.addEventListener("pointerdown", ask, { once: true });
      return () => window.removeEventListener("pointerdown", ask);
    }
  }, []);

  if (!rows.length) {
    return (
      <section className="card empty-state">
        <MiniSeal letter="✓" />
        <p>{t("admin.payments.empty")}</p>
      </section>
    );
  }
  return (
    <div className="claims">
      {rows.map((c) => (
        <section className="card claim" key={c.id} aria-label={c.guest}>
          <div className="who">
            <MiniSeal letter={c.guest.charAt(0).toUpperCase()} />
            <div>
              <b>{c.guest}</b>
              <small>
                {cols[1]} {c.payer}
              </small>
            </div>
          </div>
          <div>
            <span className="k">{cols[2]}</span>
            <span className="amount">{c.amount}</span>
          </div>
          <div>
            <span className="k">{cols[3]}</span>
            <span className="ref">{c.reference}</span>
            <span className="k" style={{ marginTop: 8 }}>
              {cols[4]}
            </span>
            {c.sender} <span className="quiet" style={{ fontSize: 12 }}>· {timeAgo(c.claimedAt)}</span>
          </div>
          <div className="acts">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPending({ kind: "not_found", row: c })}>
              {t("admin.payments.not_found")}
            </button>
            <button className="btn btn-gold btn-sm" type="button" title={t("admin.payments.confirm_note")} onClick={() => setPending({ kind: "confirm", row: c })}>
              <Icon name="check" />
              <span>{t("admin.payments.confirm")}</span>
            </button>
          </div>
          {c.duplicate ? <p className="dup">{t("admin.payments.duplicate")}</p> : null}
        </section>
      ))}
      {pending?.kind === "confirm" ? (
        <ConfirmDialog
          title={`${t("admin.payments.confirm")} ${pending.row.amount} · ${pending.row.reference}`}
          body={t("admin.payments.warning")}
          okLabel={t("admin.payments.confirm")}
          onClose={() => setPending(null)}
          onOk={async () => {
            const r = await callAction(() => confirmAction(pending.row.id));
            setPending(null);
            if (r.ok) confirmed(r.data);
            else toast(t("admin.common.error_network"));
          }}
        />
      ) : null}
      {pending?.kind === "not_found" ? (
        <ConfirmDialog
          title={t("admin.payments.not_found")}
          body={t("admin.payments.not_found_confirm", { guest: pending.row.guest })}
          okLabel={t("admin.payments.not_found")}
          danger
          onClose={() => setPending(null)}
          onOk={async () => {
            const r = await callAction(() => notFoundAction(pending.row.id));
            setPending(null);
            toast(r.ok ? t("admin.payments.not_found_toast", { guest: r.data.guest }) : t("admin.common.error_network"));
          }}
        />
      ) : null}
    </div>
  );
}

function MatchDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const confirmed = useConfirmedToast();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MatchCandidate[]>([]);
  const [chosen, setChosen] = useState<MatchCandidate | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      callAction(() => matchAction(q)).then((r) => {
        if (r.ok) setItems(r.data);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  if (chosen) {
    return (
      <ConfirmDialog
        title={t("admin.payments.match_confirm")}
        body={t("admin.payments.warning")}
        okLabel={t("admin.payments.match_confirm")}
        onClose={() => setChosen(null)}
        onOk={async () => {
          const r = await callAction(() => manualConfirmAction(chosen.id));
          onClose();
          if (r.ok) confirmed(r.data);
          else toast(t("admin.common.error_network"));
        }}
      >
        <p style={{ marginTop: 10 }}>
          <b>{chosen.guest}</b> · {chosen.inviter}
          {chosen.reference ? ` · ${chosen.reference}` : ""}
        </p>
      </ConfirmDialog>
    );
  }
  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>{t("admin.payments.match_title")}</h2>
      <p>{t("admin.payments.match_help")}</p>
      <div className="field" style={{ marginTop: 14 }}>
        <label className="sr" htmlFor="m-q">
          {t("admin.guests.search")}
        </label>
        <input className="input" id="m-q" type="search" placeholder={t("admin.guests.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="match-list" aria-busy={pending}>
        {items.length ? (
          items.map((i) => (
            <div className="item" key={i.id}>
              <div className="who">
                <MiniSeal letter={i.guest.charAt(0).toUpperCase()} />
                <div>
                  <b>{i.guest}</b>
                  <small>
                    {i.inviter} · {t(`member.status.${i.status === "awaiting_confirmation" ? "awaiting" : i.status}` as never)}
                    {i.reference ? ` · ${i.reference}` : ""}
                  </small>
                </div>
              </div>
              <button className="btn btn-gold btn-sm" type="button" onClick={() => startTransition(() => setChosen(i))}>
                {t("admin.payments.match_confirm")}
              </button>
            </div>
          ))
        ) : (
          <p className="quiet">{t("admin.payments.match_empty")}</p>
        )}
      </div>
      <div className="actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
          {t("admin.members.cancel")}
        </button>
      </div>
    </Dialog>
  );
}

export function MatchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(true)}>
        <Icon name="search" />
        <span>{t("admin.payments.manual_match")}</span>
      </button>
      {open ? <MatchDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}
