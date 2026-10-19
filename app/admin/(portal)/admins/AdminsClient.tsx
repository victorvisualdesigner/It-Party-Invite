"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { ConfirmDialog } from "@/components/admin/Dialogs";
import { Icon } from "@/components/Icon";
import { MiniSeal } from "@/components/Seal";
import { useToast } from "@/components/Toast";
import type { FieldErrors } from "@/lib/action";
import type { AdminRow, SetupDelivery } from "@/lib/admins";
import { callAction } from "@/lib/client-action";
import { t } from "@/lib/copy";
import { formatPhoneTyping } from "@/lib/phone-typing";
import { addAdminAction, newLinkAction, removeAdminAction } from "./actions";

export type AdminView = AdminRow & { me: boolean };

/* ---------- The setup link, shown once ---------- */

function LinkDialog({ delivery, onClose }: { delivery: SetupDelivery; onClose: () => void }) {
  const toast = useToast();
  const titleId = useId();
  function copy() {
    const done = () => toast(t("admin.admins.copied"));
    try {
      navigator.clipboard.writeText(delivery.link).then(done, done);
    } catch {
      done();
    }
  }
  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>{t("admin.admins.link_title", { admin: delivery.name })}</h2>
      <p>{t("admin.admins.link_note", { admin: delivery.name })}</p>
      <p className="link-box">{delivery.link}</p>
      <div className="actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={copy}>
          <Icon name="copy" />
          <span>{t("admin.admins.copy_link")}</span>
        </button>
        <a className="btn btn-gold btn-sm" href={delivery.waHref} target="_blank" rel="noopener noreferrer" data-autofocus onClick={onClose}>
          <Icon name="whatsapp" />
          <span>{t("admin.admins.send_link")}</span>
        </a>
      </div>
    </Dialog>
  );
}

/* ---------- Add ---------- */

function AddAdminDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (d: SetupDelivery) => void }) {
  const titleId = useId();
  const [v, setV] = useState({ first_name: "", email: "", phone: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await callAction(() => addAdminAction(v));
      if (result.ok) return onAdded(result.data);
      if ("network" in result && result.network) return setFormError(t("admin.common.error_network"));
      if (result.message) setFormError(result.message);
      setErrors(result.errors ?? {});
      const first = ["first_name", "email", "phone"].find((k) => result.errors?.[k]);
      if (first) document.getElementById(`ad-${first}`)?.focus();
    });
  }

  const err = (key: string) =>
    errors[key] ? (
      <p className="error" id={`ad-${key}-err`}>
        {errors[key]}
      </p>
    ) : null;
  const bind = (key: keyof typeof v) => ({
    id: `ad-${key}`,
    value: v[key],
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `ad-${key}-err` : undefined,
  });

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>{t("admin.admins.add")}</h2>
      <form className="form" noValidate onSubmit={submit} style={{ marginTop: 14 }}>
        <div className="field">
          <label htmlFor="ad-first_name">{t("admin.admins.name_label")}</label>
          <input className="input" autoCapitalize="words" autoComplete="off" {...bind("first_name")} onChange={(e) => setV({ ...v, first_name: e.target.value })} />
          {err("first_name")}
        </div>
        <div className="field">
          <label htmlFor="ad-email">{t("admin.admins.email_label")}</label>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            {...bind("email")}
            onChange={(e) => setV({ ...v, email: e.target.value })}
          />
          <span className="help">{t("admin.admins.email_help")}</span>
          {err("email")}
        </div>
        <div className="field">
          <label htmlFor="ad-phone">{t("admin.admins.phone_label")}</label>
          <input
            className="input num"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder={t("guest.lock.phone_placeholder")}
            {...bind("phone")}
            onChange={(e) => {
              const el = e.target;
              setV({ ...v, phone: el.selectionStart === el.value.length ? formatPhoneTyping(el.value) : el.value });
            }}
          />
          <span className="help">{t("admin.admins.phone_help")}</span>
          {err("phone")}
        </div>
        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
            {t("admin.members.cancel")}
          </button>
          <button className="btn btn-gold btn-sm" type="submit" disabled={pending} aria-busy={pending}>
            {pending ? t("admin.common.saving") : t("admin.admins.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function AddAdminButton() {
  const [open, setOpen] = useState(false);
  const [delivery, setDelivery] = useState<SetupDelivery | null>(null);
  return (
    <>
      <button className="btn btn-gold btn-sm" type="button" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        <span>{t("admin.admins.add")}</span>
      </button>
      {open ? (
        <AddAdminDialog
          onClose={() => setOpen(false)}
          onAdded={(d) => {
            setOpen(false);
            setDelivery(d);
          }}
        />
      ) : null}
      {delivery ? <LinkDialog delivery={delivery} onClose={() => setDelivery(null)} /> : null}
    </>
  );
}

/* ---------- List ---------- */

function NewLinkButton({ row, onLink }: { row: AdminView; onLink: (d: SetupDelivery) => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn btn-ghost btn-sm"
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await callAction(() => newLinkAction(row.id));
          if (result.ok) onLink(result.data);
          else toast(t("admin.common.error_network"));
        })
      }
    >
      <Icon name="key" />
      <span>{t("admin.admins.new_link")}</span>
    </button>
  );
}

export function AdminsList({ rows }: { rows: AdminView[] }) {
  const toast = useToast();
  const [removing, setRemoving] = useState<AdminView | null>(null);
  const [delivery, setDelivery] = useState<SetupDelivery | null>(null);

  async function remove(row: AdminView) {
    const result = await callAction(() => removeAdminAction(row.id));
    setRemoving(null);
    toast(result.ok ? t("admin.admins.removed", { admin: result.data.firstName }) : t("admin.common.error_network"));
  }

  return (
    <>
      <ul className="admin-list">
        {rows.map((row) => (
          <li key={row.id} className="card">
            <MiniSeal letter={row.firstName.charAt(0).toUpperCase()} />
            <div className="admin-who">
              <b>
                {row.firstName}
                {row.role === "superadmin" ? <span className="role">{t("admin.admins.owner")}</span> : null}
                {row.me ? <span className="role role-quiet">{t("admin.admins.you")}</span> : null}
              </b>
              <span>{row.email}</span>
              <small>
                {row.phone}
                {row.pending ? ` · ${t("admin.admins.pending")}` : ""}
              </small>
            </div>
            {row.role === "admin" ? (
              <div className="admin-acts">
                <NewLinkButton row={row} onLink={setDelivery} />
                <button className="btn btn-danger btn-sm" type="button" onClick={() => setRemoving(row)}>
                  <Icon name="x" />
                  <span>{t("admin.admins.remove")}</span>
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {rows.length < 2 ? <p className="quiet admin-empty">{t("admin.admins.empty")}</p> : null}
      {removing ? (
        <ConfirmDialog
          title={t("admin.admins.remove_title", { admin: removing.firstName })}
          body={t("admin.admins.remove_body")}
          okLabel={t("admin.admins.remove")}
          danger
          onOk={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      ) : null}
      {delivery ? <LinkDialog delivery={delivery} onClose={() => setDelivery(null)} /> : null}
    </>
  );
}
