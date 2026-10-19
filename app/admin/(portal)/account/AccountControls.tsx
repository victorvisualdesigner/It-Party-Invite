"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/admin/Dialogs";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { FieldErrors } from "@/lib/action";
import { callAction } from "@/lib/client-action";
import { t } from "@/lib/copy";
import { addAccountAction, deleteAccountAction, setActiveAccountAction } from "./actions";

export function MakeActiveButton({ accountId }: { accountId: string }) {
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
          const result = await callAction(() => setActiveAccountAction(accountId));
          toast(result.ok ? t("admin.account.switch_note") : t("admin.common.error_network"));
        })
      }
    >
      {pending ? t("admin.common.saving") : t("admin.account.set_active")}
    </button>
  );
}

export function DeleteAccountButton({ accountId, bank, number, active }: { accountId: string; bank: string; number: string; active: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  async function remove() {
    const result = await callAction(() => deleteAccountAction(accountId));
    setOpen(false);
    if (!result.ok) return toast(("message" in result && result.message) || t("admin.common.error_network"));
    const done = result.data.archived ? t("admin.account.archived") : t("admin.account.deleted");
    toast(result.data.nowActive ? `${done} ${t("admin.account.now_active", { bank: result.data.nowActive })}` : done);
  }
  return (
    <>
      <button className="btn btn-quiet btn-sm bank-remove" type="button" onClick={() => setOpen(true)} aria-label={`${t("admin.account.delete")} ${bank} ${number}`}>
        <Icon name="x" />
        <span>{t("admin.account.delete")}</span>
      </button>
      {open ? (
        <ConfirmDialog
          title={t("admin.account.delete_title", { bank, number })}
          body={active ? t("admin.account.delete_body_active") : t("admin.account.delete_body")}
          okLabel={t("admin.account.delete")}
          danger
          onOk={remove}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const EMPTY = { bank_name: "", account_number: "", account_name: "" };

export function AddAccountForm() {
  const toast = useToast();
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const bind = (key: keyof typeof EMPTY) => ({
    id: `a-${key}`,
    value: v[key],
    onChange: (e: { target: { value: string } }) => setV((prev) => ({ ...prev, [key]: e.target.value })),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `a-${key}-err` : undefined,
  });
  const err = (key: keyof typeof EMPTY) =>
    errors[key] ? (
      <p className="error" id={`a-${key}-err`}>
        {errors[key]}
      </p>
    ) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await callAction(() => addAccountAction(v));
      if (result.ok) {
        setV(EMPTY);
        setErrors({});
        toast(t("admin.account.added"));
        return;
      }
      if ("network" in result && result.network) return setFormError(t("admin.common.error_network"));
      setErrors(result.errors ?? {});
      const first = (Object.keys(EMPTY) as (keyof typeof EMPTY)[]).find((k) => result.errors?.[k]);
      if (first) document.getElementById(`a-${first}`)?.focus();
    });
  }

  return (
    <form className="form" noValidate onSubmit={submit}>
      <div className="cols">
        <div className="field">
          <label htmlFor="a-bank_name">{t("admin.account.bank_label")}</label>
          <input className="input" autoComplete="off" {...bind("bank_name")} />
          {err("bank_name")}
        </div>
        <div className="field">
          <label htmlFor="a-account_number">{t("admin.account.number_label")}</label>
          <input className="input num" inputMode="numeric" autoComplete="off" maxLength={13} {...bind("account_number")} />
          {err("account_number")}
        </div>
      </div>
      <div className="field">
        <label htmlFor="a-account_name">{t("admin.account.name_label")}</label>
        <input className="input" autoComplete="off" {...bind("account_name")} />
        <span className="help">{t("admin.account.name_help")}</span>
        {err("account_name")}
      </div>
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      <div>
        <button className="btn btn-gold" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? t("admin.common.saving") : t("admin.account.save")}
        </button>
      </div>
    </form>
  );
}
