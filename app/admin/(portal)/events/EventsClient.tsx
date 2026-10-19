"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { addEventAdminAction, createEventAction, newLinkAction, openEventAction, removeAdminAction } from "./actions";

export type EventCardView = {
  id: number;
  name: string;
  when: string;
  current: boolean;
  stats: {
    paid: number;
    awaiting: number;
    open: number;
    collected: string;
    members: number;
    taps: number;
  };
  admins: (AdminRow & { phone: string })[];
};

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
        <a
          className="btn btn-gold btn-sm"
          href={delivery.waHref}
          target="_blank"
          rel="noopener noreferrer"
          data-autofocus
          onClick={onClose}
        >
          <Icon name="whatsapp" />
          <span>{t("admin.admins.send_link")}</span>
        </a>
      </div>
    </Dialog>
  );
}

/* ---------- Admin fields, shared by both dialogs ---------- */

type AdminFields = { first_name: string; email: string; phone: string };
const EMPTY_ADMIN: AdminFields = { first_name: "", email: "", phone: "" };

function AdminInputs({ v, set, errors, prefix }: { v: AdminFields; set: (v: AdminFields) => void; errors: FieldErrors; prefix: string }) {
  const err = (key: string) =>
    errors[`${prefix}${key}`] ? (
      <p className="error" id={`ev-${key}-err`}>
        {errors[`${prefix}${key}`]}
      </p>
    ) : null;
  const bind = (key: keyof AdminFields) => ({
    id: `ev-${key}`,
    value: v[key],
    "aria-invalid": errors[`${prefix}${key}`] ? true : undefined,
    "aria-describedby": errors[`${prefix}${key}`] ? `ev-${key}-err` : undefined,
  });
  return (
    <>
      <div className="field">
        <label htmlFor="ev-first_name">{t("admin.admins.name_label")}</label>
        <input
          className="input"
          autoCapitalize="words"
          autoComplete="off"
          {...bind("first_name")}
          onChange={(e) => set({ ...v, first_name: e.target.value })}
        />
        {err("first_name")}
      </div>
      <div className="field">
        <label htmlFor="ev-email">{t("admin.admins.email_label")}</label>
        <input
          className="input"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          {...bind("email")}
          onChange={(e) => set({ ...v, email: e.target.value })}
        />
        <span className="help">{t("admin.admins.email_help")}</span>
        {err("email")}
      </div>
      <div className="field">
        <label htmlFor="ev-phone">{t("admin.admins.phone_label")}</label>
        <input
          className="input num"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder={t("guest.lock.phone_placeholder")}
          {...bind("phone")}
          onChange={(e) => {
            const el = e.target;
            set({
              ...v,
              phone: el.selectionStart === el.value.length ? formatPhoneTyping(el.value) : el.value,
            });
          }}
        />
        <span className="help">{t("admin.admins.phone_help")}</span>
        {err("phone")}
      </div>
    </>
  );
}

/* ---------- Create an event ---------- */

export function CreateEventButton() {
  const toast = useToast();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [admin, setAdmin] = useState<AdminFields>(EMPTY_ADMIN);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<SetupDelivery | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setName("");
    setAdmin(EMPTY_ADMIN);
    setErrors({});
    setFormError(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await callAction(() => createEventAction({ name, admin }));
      if (result.ok) {
        toast(t("admin.events.created", { event: result.data.event }));
        close();
        if (result.data.delivery) setDelivery(result.data.delivery);
        return;
      }
      if ("network" in result && result.network) return setFormError(t("admin.common.error_network"));
      if (result.message) setFormError(result.message);
      setErrors(result.errors ?? {});
      const first = ["name", "admin.first_name", "admin.email", "admin.phone"].find((k) => result.errors?.[k]);
      if (first) document.getElementById(first === "name" ? "ev-name" : `ev-${first.slice(6)}`)?.focus();
    });
  }

  return (
    <>
      <button className="btn btn-gold btn-sm" type="button" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        <span>{t("admin.events.create")}</span>
      </button>
      {open ? (
        <Dialog labelledBy={titleId} onClose={close}>
          <h2 id={titleId}>{t("admin.events.create_title")}</h2>
          <form className="form" noValidate onSubmit={submit} style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="ev-name">{t("admin.events.name_label")}</label>
              <input
                className="input"
                id="ev-name"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "ev-name-err" : "ev-name-help"}
              />
              <span className="help" id="ev-name-help">
                {t("admin.events.name_help")}
              </span>
              {errors.name ? (
                <p className="error" id="ev-name-err">
                  {errors.name}
                </p>
              ) : null}
            </div>
            <div className="sub-head">
              <b>{t("admin.events.admin_title")}</b>
              <span className="help">{t("admin.events.admin_help")}</span>
            </div>
            <AdminInputs v={admin} set={setAdmin} errors={errors} prefix="admin." />
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="actions">
              <button className="btn btn-ghost btn-sm" type="button" onClick={close}>
                {t("admin.members.cancel")}
              </button>
              <button className="btn btn-gold btn-sm" type="submit" disabled={pending} aria-busy={pending}>
                {pending ? t("admin.common.saving") : t("admin.events.save")}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
      {delivery ? <LinkDialog delivery={delivery} onClose={() => setDelivery(null)} /> : null}
    </>
  );
}

/* ---------- One event ---------- */

function AddAdminDialog({ event, onClose, onAdded }: { event: EventCardView; onClose: () => void; onAdded: (d: SetupDelivery) => void }) {
  const titleId = useId();
  const [v, setV] = useState<AdminFields>(EMPTY_ADMIN);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await callAction(() => addEventAdminAction(event.id, v));
      if (result.ok) return onAdded(result.data);
      if ("network" in result && result.network) return setFormError(t("admin.common.error_network"));
      if (result.message) setFormError(result.message);
      setErrors(result.errors ?? {});
    });
  }
  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>{t("admin.events.add_admin_title", { event: event.name })}</h2>
      <form className="form" noValidate onSubmit={submit} style={{ marginTop: 14 }}>
        <AdminInputs v={v} set={setV} errors={errors} prefix="" />
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

function Busy({ label, icon, className, run }: { label: string; icon?: "key" | "chev"; className: string; run: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <button className={className} type="button" disabled={pending} aria-busy={pending} onClick={() => startTransition(run)}>
      {icon ? <Icon name={icon} /> : null}
      <span>{label}</span>
    </button>
  );
}

export function EventCard({ event }: { event: EventCardView }) {
  const toast = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<EventCardView["admins"][number] | null>(null);
  const [delivery, setDelivery] = useState<SetupDelivery | null>(null);
  const stat = (key: keyof EventCardView["stats"]) => (
    <div>
      <dt>{t(`admin.events.stats.${key}` as never)}</dt>
      <dd>{event.stats[key]}</dd>
    </div>
  );

  async function openIt() {
    const result = await callAction(() => openEventAction(event.id));
    if (result.ok) router.push("/admin");
    else toast(t("admin.common.error_network"));
  }
  async function newLink(id: string) {
    const result = await callAction(() => newLinkAction(id));
    if (result.ok) setDelivery(result.data);
    else toast(t("admin.common.error_network"));
  }
  async function remove(id: string) {
    const result = await callAction(() => removeAdminAction(id));
    setRemoving(null);
    toast(result.ok ? t("admin.admins.removed", { admin: result.data.firstName }) : t("admin.common.error_network"));
  }

  return (
    <article className={event.current ? "card event-card is-current" : "card event-card"}>
      <header className="ev-head">
        <div>
          <h2>{event.name}</h2>
          <small>{event.when}</small>
        </div>
        {event.current ? (
          <span className="chip chip-paid">{t("admin.events.current")}</span>
        ) : (
          <Busy className="btn btn-gold btn-sm" label={t("admin.events.open")} icon="chev" run={openIt} />
        )}
      </header>
      <dl className="ev-stats">
        {stat("paid")}
        {stat("awaiting")}
        {stat("open")}
        {stat("collected")}
        {stat("members")}
        {stat("taps")}
      </dl>
      <section className="ev-admins">
        <div className="ev-admins-head">
          <b>{t("admin.events.admins_title")}</b>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            <span>{t("admin.events.add_admin")}</span>
          </button>
        </div>
        {event.admins.length ? (
          <ul>
            {event.admins.map((a) => (
              <li key={a.id}>
                <MiniSeal letter={a.firstName.charAt(0).toUpperCase()} />
                <div className="admin-who">
                  <b>{a.firstName}</b>
                  <span>{a.email}</span>
                  <small>
                    {a.phone}
                    {a.pending ? ` · ${t("admin.admins.pending")}` : ""}
                  </small>
                </div>
                <div className="admin-acts">
                  <Busy className="btn btn-ghost btn-sm" label={t("admin.admins.new_link")} icon="key" run={() => newLink(a.id)} />
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => setRemoving(a)}>
                    <Icon name="x" />
                    <span>{t("admin.admins.remove")}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="quiet">{t("admin.events.no_admins")}</p>
        )}
      </section>
      {adding ? (
        <AddAdminDialog
          event={event}
          onClose={() => setAdding(false)}
          onAdded={(d) => {
            setAdding(false);
            setDelivery(d);
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={t("admin.admins.remove_title", { admin: removing.firstName })}
          body={t("admin.admins.remove_body")}
          okLabel={t("admin.admins.remove")}
          danger
          onOk={() => remove(removing.id)}
          onClose={() => setRemoving(null)}
        />
      ) : null}
      {delivery ? <LinkDialog delivery={delivery} onClose={() => setDelivery(null)} /> : null}
    </article>
  );
}
