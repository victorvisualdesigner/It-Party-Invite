"use client";

// A member pays for their guest: the same transfer details a guest sees, with Copy on each line,
// then "I've sent it" with the sender's name. The host confirms it in Payments to confirm.
import { useEffect, useId, useState, useTransition } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { callAction } from "@/lib/client-action";
import { t } from "@/lib/copy";

export type PayDetails = {
  paymentId: string;
  status: "open" | "claimed" | "not_found" | "confirmed" | "void";
  amount: string;
  amountDigits: string;
  bank: string;
  accountNumber: string;
  accountNumberDisplay: string;
  accountName: string;
  reference: string;
  refund: string;
  senderName: string | null;
};

type Fail = { ok: false; message?: string; network?: boolean };
export type OpenPayResult = { ok: true; data: PayDetails } | Fail;
export type ClaimPayResult = { ok: true } | (Fail & { errors?: Record<string, string> });

function CopyRow({ label, value, copy }: { label: string; value: string; copy?: string }) {
  const [done, setDone] = useState(false);
  function onCopy() {
    const ok = () => {
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    };
    try {
      navigator.clipboard.writeText(copy ?? value).then(ok, ok);
    } catch {
      ok();
    }
  }
  return (
    <div className="pay-row">
      <div>
        <span className="k">{label}</span>
        <span className="v">{value}</span>
      </div>
      {copy != null ? (
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCopy} aria-label={`${t("guest.transfer.copy")} ${label}`}>
          {done ? t("guest.transfer.copied") : t("guest.transfer.copy")}
        </button>
      ) : null}
    </div>
  );
}

export function PaySheet({
  inviteId,
  guest,
  openAction,
  claimAction,
  onClose,
  onClaimed,
}: {
  inviteId: string;
  guest: string;
  openAction: (inviteId: string) => Promise<OpenPayResult>;
  claimAction: (paymentId: string, senderName: string) => Promise<ClaimPayResult>;
  onClose: () => void;
  onClaimed: () => void;
}) {
  const titleId = useId();
  const [details, setDetails] = useState<PayDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<"details" | "name" | "done">("details");
  const [sender, setSender] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    callAction(() => openAction(inviteId)).then((r) => {
      if (!live) return;
      if (r.ok) {
        setDetails(r.data);
        setSender(r.data.senderName ?? "");
        if (r.data.status === "claimed" || r.data.status === "confirmed") setStep("done");
      } else setLoadError(("message" in r && r.message) || t("admin.common.error_network"));
    });
    return () => {
      live = false;
    };
  }, [inviteId, openAction]);

  function claim() {
    if (!details || pending) return;
    if (sender.trim().length < 2) return setError(t("guest.transfer.sender_name_error"));
    setError(null);
    startTransition(async () => {
      const r = await callAction(() => claimAction(details.paymentId, sender.trim()));
      if (r.ok) {
        setStep("done");
        onClaimed();
      } else setError(("message" in r && r.message) || t("admin.common.error_network"));
    });
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>{t("member.pay_sheet.title", { guest })}</h2>
      {!details && !loadError ? (
        <p className="pay-loading">
          <span className="is-busy" aria-hidden="true" />
          {t("admin.common.saving")}
        </p>
      ) : null}
      {loadError ? (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      ) : null}
      {details && step === "done" ? (
        <div className="pay-done">
          <Icon name="check" />
          <p>{t("member.pay_sheet.sent")}</p>
          <div className="actions">
            <button className="btn btn-gold btn-sm" type="button" data-autofocus onClick={onClose}>
              {t("guest.ticket.save_done")}
            </button>
          </div>
        </div>
      ) : null}
      {details && step !== "done" ? (
        <>
          <p>{t("member.pay_sheet.intro", { guest })}</p>
          <div className="pay-rows">
            <CopyRow label={t("guest.transfer.amount_label")} value={details.amount} copy={details.amountDigits} />
            <CopyRow label={t("guest.transfer.bank_label")} value={details.bank} />
            <CopyRow label={t("guest.transfer.account_number_label")} value={details.accountNumberDisplay} copy={details.accountNumber} />
            <CopyRow label={t("guest.transfer.account_name_label")} value={details.accountName} />
            <CopyRow label={t("guest.transfer.reference_label")} value={details.reference} copy={details.reference} />
          </div>
          <p className="pay-refund">{details.refund}</p>
          {step === "name" ? (
            <div className="field">
              <label htmlFor="pay-sender">{t("guest.transfer.sender_name_label")}</label>
              <input
                className="input"
                id="pay-sender"
                autoComplete="name"
                placeholder={t("guest.transfer.sender_name_placeholder")}
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
              <span className="help">{t("guest.transfer.sender_name_help")}</span>
            </div>
          ) : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="actions">
            <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
              {t("member.pay_sheet.later")}
            </button>
            {step === "details" ? (
              <button className="btn btn-gold btn-sm" type="button" onClick={() => setStep("name")}>
                {t("guest.transfer.sent_button")}
              </button>
            ) : (
              <button className="btn btn-gold btn-sm" type="button" disabled={pending} aria-busy={pending} onClick={claim}>
                {t("guest.transfer.confirm_sent")}
              </button>
            )}
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
