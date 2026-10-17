"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { ConfirmDialog, KeyDialog as BaseKeyDialog } from "@/components/admin/Dialogs";
import { Icon } from "@/components/Icon";
import { MiniSeal } from "@/components/Seal";
import { useToast } from "@/components/Toast";
import type { FieldErrors } from "@/lib/action";
import { callAction } from "@/lib/client-action";
import { t, tList } from "@/lib/copy";
import type { KeyDelivery } from "@/lib/people";
import { formatPhoneTyping } from "@/lib/phone-typing";
import { addMemberAction, removeMemberAction, resetKeyAction, setSlotsAction } from "./actions";

export type MemberRow = {
  id: string;
  role: "admin" | "member";
  firstName: string;
  phone: string;
  slotLimit: number | null;
  used: number;
  paid: number;
};

const SLOT_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];

/* ---------- Dialogs ---------- */

function KeyDialog({ delivery, onClose }: { delivery: KeyDelivery; onClose: () => void }) {
  return (
    <BaseKeyDialog
      name={delivery.firstName}
      keyText={delivery.key}
      note={t("admin.members.key_ready", { member: delivery.firstName })}
      waHref={delivery.waHref}
      sendLabel={t("admin.members.send_key")}
      onClose={onClose}
    />
  );
}

function AddMemberDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (d: KeyDelivery) => void }) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  const [slots, setSlots] = useState("3");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await callAction(() => addMemberAction({ first_name: name, phone, unlimited, slots }));
      if (result.ok) {
        onAdded(result.data);
        return;
      }
      if ("network" in result && result.network) return setFormError(t("admin.common.error_network"));
      setErrors(result.errors ?? {});
      const first = ["first_name", "phone", "slots"].find((k) => result.errors?.[k]);
      if (first) document.getElementById(`am-${first}`)?.focus();
    });
  }

  const err = (key: string) =>
    errors[key] ? (
      <p className="error" id={`am-${key}-err`}>
        {errors[key]}
      </p>
    ) : null;
  const described = (key: string) => (errors[key] ? { "aria-invalid": true as const, "aria-describedby": `am-${key}-err` } : {});

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>{t("admin.members.add")}</h2>
      <form className="form" noValidate onSubmit={submit} style={{ marginTop: 14 }}>
        <div className="field">
          <label htmlFor="am-first_name">{t("admin.members.name_label")}</label>
          <input
            className="input"
            id="am-first_name"
            autoCapitalize="words"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            {...described("first_name")}
          />
          {err("first_name")}
        </div>
        <div className="field">
          <label htmlFor="am-phone">{t("admin.members.phone_label")}</label>
          <input
            className="input num"
            id="am-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder={t("guest.lock.phone_placeholder")}
            value={phone}
            onChange={(e) => {
              const el = e.target;
              const atEnd = el.selectionStart === el.value.length;
              setPhone(atEnd ? formatPhoneTyping(el.value) : el.value);
            }}
            {...described("phone")}
          />
          {err("phone")}
        </div>
        <div className="field">
          <span className="label" id="am-slots-label">
            {t("admin.members.slots_label")}
          </span>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div className="seg" role="group" aria-labelledby="am-slots-label">
              <button type="button" aria-pressed={!unlimited} onClick={() => setUnlimited(false)}>
                {t("admin.members.slots_number")}
              </button>
              <button type="button" aria-pressed={unlimited} onClick={() => setUnlimited(true)}>
                {t("admin.members.slots_unlimited")}
              </button>
            </div>
            {unlimited ? null : (
              <input
                className="input num"
                id="am-slots"
                inputMode="numeric"
                value={slots}
                onChange={(e) => setSlots(e.target.value)}
                style={{ width: 90, minHeight: 40 }}
                aria-label={t("admin.members.slots_label")}
                {...described("slots")}
              />
            )}
          </div>
          {err("slots")}
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
            {pending ? t("admin.common.saving") : t("admin.members.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Header button ---------- */

export function AddMemberButton() {
  const [open, setOpen] = useState(false);
  const [delivery, setDelivery] = useState<KeyDelivery | null>(null);
  return (
    <>
      <button className="btn btn-gold btn-sm" type="button" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        <span>{t("admin.members.add")}</span>
      </button>
      {open ? (
        <AddMemberDialog
          onClose={() => setOpen(false)}
          onAdded={(d) => {
            setOpen(false);
            setDelivery(d);
          }}
        />
      ) : null}
      {delivery ? <KeyDialog delivery={delivery} onClose={() => setDelivery(null)} /> : null}
    </>
  );
}

/* ---------- Table ---------- */

function SlotSelect({ row }: { row: MemberRow }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const options =
    row.slotLimit != null && !SLOT_OPTIONS.includes(row.slotLimit)
      ? [...SLOT_OPTIONS, row.slotLimit].sort((a, b) => a - b)
      : SLOT_OPTIONS;
  return (
    <select
      className="input"
      aria-label={`${t("admin.members.slots_label")} ${row.firstName}`}
      style={{ minHeight: 36, width: "auto", fontSize: 14 }}
      defaultValue={row.slotLimit == null ? "u" : String(row.slotLimit)}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(async () => {
          const result = await callAction(() => setSlotsAction(row.id, value));
          toast(result.ok ? t("admin.members.slots_saved") : t("admin.common.error_network"));
        });
      }}
    >
      <option value="u">{t("admin.members.slots_unlimited")}</option>
      {options.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

type Pending = { kind: "key" | "remove"; row: MemberRow } | null;

export function MembersTable({ rows }: { rows: MemberRow[] }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<Pending>(null);
  const [delivery, setDelivery] = useState<KeyDelivery | null>(null);
  const cols = tList("admin.members.columns");

  async function resetKey(row: MemberRow) {
    const result = await callAction(() => resetKeyAction(row.id));
    setConfirm(null);
    if (result.ok) setDelivery(result.data);
    else toast(t("admin.common.error_network"));
  }

  async function remove(row: MemberRow) {
    const result = await callAction(() => removeMemberAction(row.id));
    setConfirm(null);
    toast(result.ok ? t("admin.members.removed", { member: result.data.firstName }) : t("admin.common.error_network"));
  }

  return (
    <section className="card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const unlimited = row.role === "admin" || row.slotLimit == null;
              const total = row.slotLimit ?? 0;
              return (
                <tr key={row.id} data-member={row.firstName}>
                  <td>
                    <div className="who">
                      <MiniSeal letter={row.firstName.charAt(0).toUpperCase()} />
                      <div>
                        <b>{row.firstName}</b>
                        {row.role === "admin" ? <span className="role">{t("admin.members.host")}</span> : null}
                      </div>
                    </div>
                  </td>
                  <td className="num-cell">{row.phone}</td>
                  <td>
                    <div className="slot-cell">
                      <div className="slot-edit">
                        {row.role === "admin" ? <span className="quiet">{t("admin.members.slots_unlimited")}</span> : <SlotSelect row={row} />}
                      </div>
                      {unlimited ? null : (
                        <div className="meter">
                          <i
                            className={row.used >= total ? "gold" : ""}
                            style={{ transform: `scaleX(${Math.min(1, row.used / Math.max(1, total)).toFixed(3)})` }}
                          />
                        </div>
                      )}
                      <small>
                        {unlimited
                          ? t("admin.members.slots_used_unlimited", { used: row.used })
                          : t("admin.members.slots_used", { used: row.used, total })}
                      </small>
                    </div>
                  </td>
                  <td className="taps-cell">
                    <b>{row.paid}</b>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-btn"
                        type="button"
                        title={t("admin.members.reset_key")}
                        aria-label={`${t("admin.members.reset_key")} ${row.firstName}`}
                        onClick={() => setConfirm({ kind: "key", row })}
                      >
                        <Icon name="key" />
                      </button>
                      {row.role !== "admin" ? (
                        <button
                          className="icon-btn"
                          type="button"
                          title={t("admin.members.remove")}
                          aria-label={`${t("admin.members.remove")} ${row.firstName}`}
                          onClick={() => setConfirm({ kind: "remove", row })}
                        >
                          <Icon name="x" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirm?.kind === "key" ? (
        <ConfirmDialog
          title={t("admin.members.reset_key")}
          body={t("member.guest_actions.reset_confirm")}
          okLabel={t("admin.members.reset_key")}
          onOk={() => resetKey(confirm.row)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
      {confirm?.kind === "remove" ? (
        <ConfirmDialog
          title={t("admin.members.remove")}
          body={t("admin.members.remove_confirm", { member: confirm.row.firstName })}
          okLabel={t("admin.members.remove")}
          danger
          onOk={() => remove(confirm.row)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
      {delivery ? <KeyDialog delivery={delivery} onClose={() => setDelivery(null)} /> : null}
    </section>
  );
}
