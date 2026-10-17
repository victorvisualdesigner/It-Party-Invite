"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import type { FieldErrors } from "@/lib/action";
import { callAction } from "@/lib/client-action";
import { t, tList } from "@/lib/copy";
import { formatEventDate, fromLagos, isRevealed, revealHint } from "@/lib/event";
import { formatNaira, nairaToKobo } from "@/lib/money";
import type { EventInput } from "@/lib/schemas";
import { REVEAL_MODES, type RevealMode } from "@/lib/types";
import { saveEvent } from "./actions";

// Which input to focus for each server error key.
const FIELD_IDS: Record<string, string> = {
  name: "e-name",
  date: "e-date",
  price: "e-price",
  capacity: "e-cap",
  hold_window_hours: "e-hold",
  unopened_expiry_days: "e-unopened",
  reveal_date_at: "e-rd-at",
  reveal_venue_at: "e-rv-at",
};

function Field({ id, label, help, error, children }: { id: string; label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help ? (
        <span className="help" id={`${id}-help`}>
          {help}
        </span>
      ) : null}
      {error ? (
        <p className="error" id={`${id}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function lagosLocalToIso(value: string): string | null {
  return value.length >= 16 ? fromLagos(value.slice(0, 10), value.slice(11, 16)) : null;
}

function Preview({ v, hostName }: { v: EventInput; hostName: string }) {
  const startsAt = fromLagos(v.date, v.time);
  const dateAt = v.reveal_date_mode === "at_time" ? lagosLocalToIso(v.reveal_date_at) : null;
  const venueAt = v.reveal_venue_mode === "at_time" ? lagosLocalToIso(v.reveal_venue_at) : null;
  const dateShown = isRevealed(v.reveal_date_mode, dateAt, false) && !!startsAt;
  const venueShown = isRevealed(v.reveal_venue_mode, venueAt, false);
  const kobo = nairaToKobo(v.price || "0") ?? 0;
  return (
    <div className="pv-card">
      <p className="ev">{v.name.trim() || " "}</p>
      <p className="sal">{t("guest.card.salutation", { guest: "Ada" })}</p>
      <h3>{t("guest.card.headline", { inviter: hostName })}</h3>
      <dl>
        <dt>{t("guest.card.date_label")}</dt>
        <dd className={dateShown ? "" : "muted"}>{dateShown && startsAt ? formatEventDate(startsAt) : t("guest.card.date_hidden")}</dd>
        <dt>{t("guest.card.venue_label")}</dt>
        <dd className={venueShown ? "" : "muted"}>
          {venueShown ? v.venue_name : t("guest.card.venue_hidden", { venue_reveal_hint: revealHint(v.reveal_venue_mode, venueAt, startsAt) })}
        </dd>
        <dt>{t("guest.card.dress_label")}</dt>
        <dd>{v.dress_code}</dd>
        <dt>{t("guest.card.price_label")}</dt>
        <dd className="price">{formatNaira(kobo)}</dd>
      </dl>
      <p className="q">{t("guest.card.question")}</p>
      <div className="yn" aria-hidden="true">
        <span className="y">{t("guest.card.yes")}</span>
        <span className="n">{t("guest.card.no")}</span>
      </div>
    </div>
  );
}

export function EventForm({ initial, hostName }: { initial: EventInput; hostName: string }) {
  const [v, setV] = useState<EventInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const savedRef = useRef<HTMLSpanElement>(null);
  const modes = tList("admin.event.reveal_options");
  const sections = tList("admin.event.sections");

  function set<K extends keyof EventInput>(key: K, value: EventInput[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }
  const text = (key: keyof EventInput) => ({
    value: v[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });
  const invalid = (key: string) =>
    errors[key] ? { "aria-invalid": true as const, "aria-describedby": `${FIELD_IDS[key]}-err` } : {};

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await callAction(() => saveEvent(v));
      if (result.ok) {
        setErrors({});
        setSaved(true);
        requestAnimationFrame(() => {
          if (savedRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            savedRef.current.animate(
              [
                { opacity: 0, transform: "translateX(6px)" },
                { opacity: 1, transform: "none" },
              ],
              { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" },
            );
          }
        });
        return;
      }
      if ("network" in result && result.network) {
        setFormError(t("admin.common.error_network"));
        return;
      }
      const next = result.errors ?? {};
      setErrors(next);
      if (next.form) setFormError(next.form);
      const first = Object.keys(FIELD_IDS).find((k) => next[k]);
      if (first) document.getElementById(FIELD_IDS[first])?.focus();
    });
  }

  const modeSelect = (id: string, key: "reveal_date_mode" | "reveal_venue_mode") => (
    <select className="input" id={id} value={v[key]} onChange={(e) => set(key, e.target.value as RevealMode)}>
      {REVEAL_MODES.map((m, i) => (
        <option key={m} value={m}>
          {modes[i]}
        </option>
      ))}
    </select>
  );

  return (
    <div className="settings">
      <form className="grid" noValidate onSubmit={submit}>
        <section className="card fieldset" aria-labelledby="sec-night">
          <h2 id="sec-night">{sections[0]}</h2>
          <Field id="e-name" label={t("admin.event.name_label")} help={t("admin.event.name_help")} error={errors.name}>
            <input className="input" id="e-name" autoComplete="off" {...text("name")} {...invalid("name")} />
          </Field>
          <div className="cols">
            <Field id="e-date" label={t("admin.event.date_label")} error={errors.date}>
              <input className="input" type="date" id="e-date" {...text("date")} {...invalid("date")} />
            </Field>
            <Field id="e-time" label={t("admin.event.time_label")}>
              <input className="input" type="time" id="e-time" {...text("time")} aria-invalid={errors.date ? true : undefined} />
            </Field>
          </div>
          <div className="cols">
            <Field id="e-venue" label={t("admin.event.venue_label")}>
              <input className="input" id="e-venue" autoComplete="off" {...text("venue_name")} />
            </Field>
            <Field id="e-addr" label={t("admin.event.venue_address_label")}>
              <input className="input" id="e-addr" autoComplete="off" {...text("venue_address")} />
            </Field>
          </div>
          <Field id="e-dress" label={t("admin.event.dress_label")}>
            <input className="input" id="e-dress" autoComplete="off" {...text("dress_code")} />
          </Field>
        </section>

        <section className="card fieldset" aria-labelledby="sec-money">
          <h2 id="sec-money">{sections[1]}</h2>
          <Field id="e-price" label={t("admin.event.price_label")} error={errors.price}>
            <div className="input-affix">
              <span className="affix">₦</span>
              <input className="input num" inputMode="numeric" id="e-price" {...text("price")} {...invalid("price")} />
            </div>
          </Field>
          <Field id="e-refund" label={t("admin.event.refund_label")}>
            <textarea className="input" id="e-refund" rows={2} {...text("refund_text")} />
          </Field>
        </section>

        <section className="card fieldset" aria-labelledby="sec-rules">
          <h2 id="sec-rules">{sections[2]}</h2>
          <div className="cols">
            <Field id="e-cap" label={t("admin.event.capacity_label")} help={t("admin.event.capacity_help")} error={errors.capacity}>
              <input className="input num" inputMode="numeric" id="e-cap" {...text("capacity")} {...invalid("capacity")} />
            </Field>
            <Field id="e-hold" label={t("admin.event.hold_label")} help={t("admin.event.hold_help")} error={errors.hold_window_hours}>
              <div className="suffix">
                <input className="input num" inputMode="numeric" id="e-hold" {...text("hold_window_hours")} {...invalid("hold_window_hours")} />
                <span>{t("admin.event.hours")}</span>
              </div>
            </Field>
          </div>
          <div className="cols">
            <Field id="e-unopened" label={t("admin.event.unopened_label")} error={errors.unopened_expiry_days}>
              <div className="suffix">
                <input className="input num" inputMode="numeric" id="e-unopened" {...text("unopened_expiry_days")} {...invalid("unopened_expiry_days")} />
                <span>{t("admin.event.days")}</span>
              </div>
            </Field>
            <div />
          </div>
          <label className="switch" htmlFor="e-open" style={{ paddingTop: 4 }}>
            <span>
              <b style={{ fontWeight: 600 }}>{t("admin.event.invites_open_label")}</b>
            </span>
            <input type="checkbox" id="e-open" checked={v.invites_open} onChange={(e) => set("invites_open", e.target.checked)} />
          </label>
        </section>

        <section className="card fieldset" aria-labelledby="sec-reveal">
          <h2 id="sec-reveal">{sections[3]}</h2>
          <div className="reveal-row">
            <Field id="e-rd" label={t("admin.event.reveal_date")}>
              {modeSelect("e-rd", "reveal_date_mode")}
            </Field>
            {v.reveal_date_mode === "at_time" ? (
              <Field id="e-rd-at" label={t("admin.event.reveal_at_label")} error={errors.reveal_date_at}>
                <input className="input" type="datetime-local" id="e-rd-at" {...text("reveal_date_at")} {...invalid("reveal_date_at")} />
              </Field>
            ) : null}
          </div>
          <div className="reveal-row">
            <Field id="e-rv" label={t("admin.event.reveal_venue")}>
              {modeSelect("e-rv", "reveal_venue_mode")}
            </Field>
            {v.reveal_venue_mode === "at_time" ? (
              <Field id="e-rv-at" label={t("admin.event.reveal_at_label")} error={errors.reveal_venue_at}>
                <input className="input" type="datetime-local" id="e-rv-at" {...text("reveal_venue_at")} {...invalid("reveal_venue_at")} />
              </Field>
            ) : null}
          </div>
        </section>

        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="save-bar">
          <span className="saved" ref={savedRef} hidden={!saved} role="status">
            <Icon name="check" />
            <span>{t("admin.event.saved")}</span>
          </span>
          <button className="btn btn-gold" type="submit" disabled={pending} aria-busy={pending}>
            {pending ? t("admin.common.saving") : t("admin.event.save")}
          </button>
        </div>
      </form>

      <aside className="preview" aria-label={t("admin.event.preview_title")}>
        <p className="eyebrow" style={{ color: "var(--gold-700)" }}>
          {t("admin.event.preview_title")}
        </p>
        <div className="stage">
          <Preview v={v} hostName={hostName} />
        </div>
        <p className="help">{t("admin.event.preview_help")}</p>
      </aside>
    </div>
  );
}
