"use client";

// The member's guests under the composer: who opened, who paid, and a Pay for them button
// while the member can still cover someone.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PaySheet, type ClaimPayResult, type OpenPayResult } from "@/components/invite/PaySheet";
import { t } from "@/lib/copy";

export type GuestLine = {
  id: string;
  guest: string;
  status: string;
  statusLabel: string;
  covered: boolean;
  taps: number;
  paymentLabel: string | null;
  canPay: boolean;
};

export function MemberGuests({
  rows,
  openPayAction,
  claimPayAction,
}: {
  rows: GuestLine[];
  openPayAction: (inviteId: string) => Promise<OpenPayResult>;
  claimPayAction: (paymentId: string, senderName: string) => Promise<ClaimPayResult>;
}) {
  const [paying, setPaying] = useState<GuestLine | null>(null);
  return (
    <section className="my-guests" aria-labelledby="my-guests-title">
      <h2 id="my-guests-title">{t("member.home.guests_title")}</h2>
      {rows.length ? (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <div className="g-main">
                <b>{r.guest}</b>
                <span className="g-meta">
                  <span className={`chip chip-${r.covered && r.status !== "paid" ? "covered" : r.status}`}>{r.statusLabel}</span>
                  {r.taps ? <small>{t("member.status.no_taps", { n: r.taps })}</small> : null}
                </span>
              </div>
              {r.canPay ? (
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPaying(r)}>
                  <Icon name="card" />
                  <span>{t("member.new_invite.pay_button", { guest: r.guest })}</span>
                </button>
              ) : r.paymentLabel ? (
                <span className="g-paid">
                  <Icon name="check" />
                  {r.paymentLabel}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="quiet">{t("member.home.guests_empty")}</p>
      )}
      {paying ? (
        <PaySheet
          inviteId={paying.id}
          guest={paying.guest}
          openAction={openPayAction}
          claimAction={claimPayAction}
          onClose={() => setPaying(null)}
          onClaimed={() => undefined}
        />
      ) : null}
    </section>
  );
}
