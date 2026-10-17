"use client";

// The invite composer: one or more guests at once, each with its own library message, link and key.
// Members use it on /m (number and key on the same page, no portal); the admin uses it under
// Invite someone. Nobody can type or edit a message: Shuffle is the only control.
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Envelope } from "@/components/Envelope";
import { Icon } from "@/components/Icon";
import { MiniSeal } from "@/components/Seal";
import type { FieldErrors } from "@/lib/action";
import { callAction } from "@/lib/client-action";
import { t } from "@/lib/copy";
import { formatPhoneTyping } from "@/lib/phone-typing";

export type DraftView = {
  id: string;
  guest: string;
  phone: string;
  masked: string;
  key: string;
  message: string;
  waHref: string;
  smsHref: string;
};

export type ComposerSlots = { left: number | null; total: number | null; unlimited: boolean };

export type CreateInput = { phone?: string; key?: string; guests: { first_name: string; phone: string }[] };

type Fail = { ok: false; errors?: FieldErrors; message?: string; network?: boolean; identity?: { name: string; slots: ComposerSlots } };
export type CreateResult = { ok: true; data: { drafts: DraftView[]; name: string; slots: ComposerSlots } } | Fail;
export type ShuffleResult = { ok: true; data: DraftView } | Fail;
export type SendResult = { ok: true } | Fail;

type Props = {
  identity: { name: string } | null;
  slots: ComposerSlots | null;
  blocker: string | null;
  nearlyFull: boolean;
  linkHost: string;
  maxRows: number;
  createAction: (input: CreateInput) => Promise<CreateResult>;
  shuffleAction: (id: string) => Promise<ShuffleResult>;
  sendAction: (id: string) => Promise<SendResult>;
  signOutAction?: () => Promise<void>;
};

type Row = { first_name: string; phone: string };
const emptyRow = (): Row => ({ first_name: "", phone: "" });

function Preview({ d, linkHost }: { d: DraftView; linkHost: string }) {
  const [body = "", link = "", keyLine = ""] = d.message.split("\n\n");
  const at = keyLine.indexOf(d.key);
  return (
    <div className="wa" aria-label={t("member.new_invite.preview_title")}>
      <div className="wa-top">
        <span className="av" aria-hidden="true">
          {d.guest.charAt(0).toUpperCase()}
        </span>
        <div>
          <b>{d.guest}</b>
          <small>{d.phone}</small>
        </div>
      </div>
      <div className="wa-body">
        <div className="bubble">
          <div className="og">
            <div className="og-img">
              <Envelope />
            </div>
            <div className="og-text">
              <b>{t("guest.preview_card.og_title")}</b>
              <span>{t("guest.preview_card.og_description")}</span>
              <small>{linkHost}</small>
            </div>
          </div>
          <div className="msg msg-fade" key={d.message}>
            {body}
            {"\n\n"}
            <a href={link} target="_blank" rel="noopener noreferrer">
              {link}
            </a>
            <span className="keyline">
              {at >= 0 ? (
                <>
                  {keyLine.slice(0, at)}
                  <mark>{d.key}</mark>
                  {keyLine.slice(at + d.key.length)}
                </>
              ) : (
                keyLine
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftCard({
  d,
  sent,
  error,
  linkHost,
  onShuffle,
  onSend,
}: {
  d: DraftView;
  sent: boolean;
  error: string | null;
  linkHost: string;
  onShuffle: () => Promise<void>;
  onSend: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  function copy() {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    };
    try {
      navigator.clipboard.writeText(d.message).then(done, done);
    } catch {
      done();
    }
    onSend();
  }
  return (
    <li className="draft">
      <div className="draft-head">
        <div>
          <b>{d.guest}</b>
          <small>{d.phone}</small>
        </div>
        {sent ? <span className="chip chip-opened">{t("member.status.sent")}</span> : null}
      </div>
      <Preview d={d} linkHost={linkHost} />
      <div className="draft-tools">
        <div className="keychip">
          <Icon name="key" />
          <div>
            <span className="label">{t("member.new_invite.key_label")}</span>
            <br />
            <b>{d.key}</b>
          </div>
        </div>
        {sent ? null : (
          <button className="btn btn-ghost btn-sm" type="button" disabled={pending} aria-busy={pending} onClick={() => startTransition(onShuffle)}>
            <Icon name="shuffle" />
            <span>{t("member.new_invite.shuffle")}</span>
          </button>
        )}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="stack">
        <a className="btn btn-gold btn-wide cta" href={d.waHref} target="_blank" rel="noopener noreferrer" onClick={onSend}>
          <Icon name="whatsapp" />
          <span>{t("member.new_invite.send")}</span>
        </a>
        <a className="btn btn-ghost btn-wide" href={d.smsHref} onClick={onSend}>
          <Icon name="sms" />
          <span>{t("member.new_invite.send_sms")}</span>
        </a>
        <button className="btn btn-quiet" type="button" onClick={copy}>
          <Icon name="copy" />
          <span>{copied ? t("member.new_invite.copied") : t("member.new_invite.copy_message")}</span>
        </button>
      </div>
    </li>
  );
}

export function InviteComposer(props: Props) {
  const [identity, setIdentity] = useState(props.identity);
  const [slots, setSlots] = useState(props.slots);
  // The page re-renders with fresh numbers after each send; keep the row limit in step with it.
  useEffect(() => setSlots(props.slots), [props.slots]);
  const [me, setMe] = useState({ phone: "", key: "" });
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftView[] | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const limit = Math.min(props.maxRows, slots && !slots.unlimited && slots.left != null ? Math.max(1, slots.left) : props.maxRows);
  const blocked = !!props.blocker && !!identity;

  function setRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await callAction(() =>
        props.createAction({ phone: identity ? undefined : me.phone, key: identity ? undefined : me.key, guests: rows }),
      );
      if (result.ok) {
        setIdentity({ name: result.data.name });
        setSlots(result.data.slots);
        setErrors({});
        setSent({});
        setSendErrors({});
        setDrafts(result.data.drafts);
        window.scrollTo(0, 0);
        return;
      }
      if ("network" in result && result.network) return setFormError(t("admin.common.error_network"));
      const fail = result as Fail;
      if (fail.identity) {
        setIdentity({ name: fail.identity.name });
        setSlots(fail.identity.slots);
      }
      const next = fail.errors ?? {};
      setErrors(next);
      if (next.form) setFormError(next.form);
      const first = Object.keys(next).find((k) => k !== "form");
      if (first) document.getElementById(`f-${first.replace(/\./g, "-")}`)?.focus();
    });
  }

  async function shuffle(id: string) {
    const result = await callAction(() => props.shuffleAction(id));
    if (result.ok) setDrafts((prev) => (prev ?? []).map((d) => (d.id === id ? result.data : d)));
  }

  function send(id: string) {
    // The link opens in WhatsApp at once; the server records the send alongside.
    callAction(() => props.sendAction(id)).then((result) => {
      if (result.ok) {
        setSent((prev) => ({ ...prev, [id]: true }));
        setSendErrors((prev) => ({ ...prev, [id]: "" }));
      } else {
        const fail = result as Fail;
        setSendErrors((prev) => ({ ...prev, [id]: fail.message ?? t("admin.common.error_network") }));
      }
    });
  }

  function again() {
    setDrafts(null);
    setRows([emptyRow()]);
    setErrors({});
    setFormError(null);
    window.scrollTo(0, 0);
  }

  const err = (key: string) =>
    errors[key] ? (
      <p className="error" id={`f-${key.replace(/\./g, "-")}-err`}>
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: string) =>
    errors[key] ? { "aria-invalid": true as const, "aria-describedby": `f-${key.replace(/\./g, "-")}-err` } : {};

  /* ---------- Ready to send ---------- */
  if (drafts) {
    const allSent = drafts.every((d) => sent[d.id]);
    return (
      <div className="composer">
        <div className="head">
          <h1 className="display">{t("member.new_invite.ready_title")}</h1>
          <p>{t("member.new_invite.ready_help")}</p>
        </div>
        <ul className="drafts">
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              d={d}
              sent={!!sent[d.id]}
              error={sendErrors[d.id] || null}
              linkHost={props.linkHost}
              onShuffle={() => shuffle(d.id)}
              onSend={() => send(d.id)}
            />
          ))}
        </ul>
        {allSent ? (
          <div className="sent">
            <MiniSeal letter="✓" />
            <p>{t("member.new_invite.all_sent")}</p>
          </div>
        ) : null}
        <button className={allSent ? "btn btn-gold btn-wide cta" : "btn btn-ghost btn-wide"} type="button" onClick={again}>
          <Icon name="plus" />
          <span>{t("member.new_invite.another")}</span>
        </button>
      </div>
    );
  }

  /* ---------- Who's coming ---------- */
  return (
    <div className="composer">
      <div className="head">
        <h1 className="display">{t("member.new_invite.title")}</h1>
        {identity ? null : <p>{t("member.login.body")}</p>}
      </div>
      {blocked ? <p className="warn">{props.blocker}</p> : null}
      {!blocked && props.nearlyFull ? <p className="warn">{t("member.new_invite.capacity_warning")}</p> : null}
      {identity && props.signOutAction ? (
        <div className="who-bar">
          <span>{t("member.new_invite.inviting_as", { member: identity.name })}</span>
          <form action={props.signOutAction}>
            <button className="btn btn-quiet btn-sm" type="submit">
              {t("member.home.not_you")} {t("member.login.signout")}
            </button>
          </form>
        </div>
      ) : null}
      <form className="form" noValidate onSubmit={submit}>
        {identity ? null : (
          <>
            <div className="field">
              <label htmlFor="f-me-phone">{t("member.login.phone_label")}</label>
              <input
                className="input num"
                id="f-me-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t("guest.lock.phone_placeholder")}
                value={me.phone}
                onChange={(e) => setMe((m) => ({ ...m, phone: formatPhoneTyping(e.target.value) }))}
                {...invalid("identity")}
              />
            </div>
            <div className="field">
              <label htmlFor="f-me-key">{t("member.login.key_label")}</label>
              <input
                className="input input-key"
                id="f-me-key"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={t("guest.lock.key_placeholder")}
                value={me.key}
                onChange={(e) => setMe((m) => ({ ...m, key: e.target.value }))}
                {...invalid("identity")}
              />
              {err("identity")}
            </div>
          </>
        )}

        <ol className="guest-rows">
          {rows.map((row, i) => (
            <li key={i}>
              <div className="row-head">
                <b>{t("member.new_invite.guest_label", { n: i + 1 })}</b>
                {rows.length > 1 ? (
                  <button className="btn btn-quiet btn-sm" type="button" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
                    {t("member.new_invite.remove_row")}
                  </button>
                ) : null}
              </div>
              <div className="pair">
                <div className="field">
                  <label htmlFor={`f-rows-${i}-first_name`}>{t("member.new_invite.first_name_label")}</label>
                  <input
                    className="input"
                    id={`f-rows-${i}-first_name`}
                    autoComplete="off"
                    autoCapitalize="words"
                    value={row.first_name}
                    onChange={(e) => setRow(i, { first_name: e.target.value })}
                    {...invalid(`rows.${i}.first_name`)}
                  />
                  {err(`rows.${i}.first_name`)}
                </div>
                <div className="field">
                  <label htmlFor={`f-rows-${i}-phone`}>{t("member.new_invite.phone_label")}</label>
                  <input
                    className="input num"
                    id={`f-rows-${i}-phone`}
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder={t("guest.lock.phone_placeholder")}
                    value={row.phone}
                    onChange={(e) => {
                      const el = e.target;
                      setRow(i, { phone: el.selectionStart === el.value.length ? formatPhoneTyping(el.value) : el.value });
                    }}
                    {...invalid(`rows.${i}.phone`)}
                  />
                  {err(`rows.${i}.phone`)}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <span className="help">{t("member.new_invite.phone_help")}</span>
        {rows.length < limit ? (
          <button className="btn btn-ghost btn-sm add-row" type="button" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
            <Icon name="plus" />
            <span>{t("member.new_invite.add_row")}</span>
          </button>
        ) : null}
        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
        <button className="btn btn-gold btn-wide cta" type="submit" disabled={pending || blocked} aria-busy={pending}>
          {pending ? t("member.new_invite.writing") : rows.length > 1 ? t("member.new_invite.continue_many") : t("member.new_invite.continue")}
        </button>
      </form>
    </div>
  );
}
