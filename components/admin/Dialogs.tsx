"use client";

import { useId, useTransition, type ReactNode } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { t } from "@/lib/copy";

export function ConfirmDialog({
  title,
  body,
  okLabel,
  danger = false,
  onOk,
  onClose,
  children,
}: {
  title: string;
  body: string;
  okLabel: string;
  danger?: boolean;
  onOk: () => Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>{title}</h2>
      <p>{body}</p>
      {children}
      <div className="actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
          {t("admin.members.cancel")}
        </button>
        <button
          className={danger ? "btn btn-danger btn-sm" : "btn btn-gold btn-sm"}
          type="button"
          data-autofocus
          disabled={pending}
          aria-busy={pending}
          onClick={() => startTransition(onOk)}
        >
          {pending ? t("admin.common.saving") : okLabel}
        </button>
      </div>
    </Dialog>
  );
}

/** Shows a fresh key once, with the one tap WhatsApp send. */
export function KeyDialog({
  name,
  keyText,
  note,
  waHref,
  sendLabel,
  onClose,
}: {
  name: string;
  keyText: string;
  note: string;
  waHref: string;
  sendLabel: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const titleId = useId();
  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>{t("admin.members.key_title")}</h2>
      <div className="keybox" style={{ margin: "12px 0 4px" }}>
        <div className="keychip">
          <Icon name="key" />
          <div>
            <span className="label">{name}</span>
            <br />
            <b data-key>{keyText}</b>
          </div>
        </div>
        <p className="note">{note}</p>
      </div>
      <div className="actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
          {t("admin.members.cancel")}
        </button>
        <a
          className="btn btn-gold btn-sm"
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          data-autofocus
          data-send-key
          onClick={() => toast(t("admin.members.key_sent"))}
        >
          <Icon name="whatsapp" />
          <span>{sendLabel}</span>
        </a>
      </div>
    </Dialog>
  );
}
