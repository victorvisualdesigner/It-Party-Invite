"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import type { FieldErrors } from "@/lib/action";
import { callAction } from "@/lib/client-action";
import { t, tList } from "@/lib/copy";
import { daysDiffer, eventDates, eventDays, formatDayLabel, formatEventWhen, fromLagos, isRevealed, revealHint } from "@/lib/event";
import { formatNaira, nairaToKobo } from "@/lib/money";
import type { EventInput } from "@/lib/schemas";
import { CARD_FOILS, CARD_NOTE_MAX, CARD_PAPERS, CARD_THEMES, REVEAL_MODES, type RevealMode } from "@/lib/types";
import { saveEvent } from "./actions";

/** One row of round colour swatches; a radio group underneath, so keys and screen readers work. */
function Swatches<T extends string>({
  label,
  name,
  options,
  value,
  labelOf,
  onPick,
}: {
  label: string;
  name: string;
  options: readonly T[];
  value: T;
  labelOf: (o: T) => string;
  onPick: (o: T) => void;
}) {
  return (
    <fieldset className="swatches">
      <legend>{label}</legend>
      <div className="swatch-row">
        {options.map((o) => (
          <label key={o} className={o === value ? "swatch on" : "swatch"}>
            <input type="radio" name={`card-${name}`} value={o} checked={o === value} onChange={() => onPick(o)} />
            {/* The dot wears the same token overrides as the guest page, so it shows the real colour. */}
            <span className={`dot dot-${name}`} {...{ [`data-card-${name}`]: o }} aria-hidden="true" />
            <span>{labelOf(o)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Which input to focus for each server error key.
const FIELD_IDS: Record<string, string> = {
  name: "e-name",
  date: "e-date",
  end_date: "e-end",
  price: "e-price",
  capacity: "e-cap",
  hold_window_hours: "e-hold",
  unopened_expiry_days: "e-unopened",
  reveal_date_at: "e-rd-at",
  reveal_venue_at: "e-rv-at",
  card_note: "e-note",
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
  const endDate = v.end_date || null;
  const days = eventDays({
    starts_at: startsAt,
    end_date: endDate,
    days: v.days,
    name: v.name.trim(),
    dress_code: v.dress_code.trim(),
  });
  const showDays = days.length > 1 && daysDiffer(days, { name: v.name.trim(), dress_code: v.dress_code.trim() });
  return (
    <div className="pv-card">
      <p className="ev">{v.name.trim() || " "}</p>
      <p className="sal">{t("guest.card.salutation", { guest: "Ada" })}</p>
      <h3>{t("guest.card.headline", { inviter: hostName })}</h3>
      <dl>
        <dt>{t("guest.card.date_label")}</dt>
        <dd className={dateShown ? "" : "muted"}>
          {dateShown && startsAt ? formatEventWhen(startsAt, endDate) : t("guest.card.date_hidden")}
        </dd>
        <dt>{t("guest.card.venue_label")}</dt>
        <dd className={venueShown ? "" : "muted"}>
          {venueShown
            ? v.venue_name
            : t("guest.card.venue_hidden", {
                venue_reveal_hint: revealHint(v.reveal_venue_mode, venueAt, startsAt),
              })}
        </dd>
        {showDays ? (
          <>
            <dt>{t("guest.card.days_label")}</dt>
            <dd>
              <ul className="pv-days">
                {days.map((d) => (
                  <li key={d.date}>
                    <b>{dateShown ? d.label : t("guest.card.day_n", { n: d.number })}</b>
                    {d.name !== v.name.trim() ? <span>{d.name}</span> : null}
                    {d.dress ? <small>{t("guest.card.day_dress", { dress: d.dress })}</small> : null}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        ) : (
          <>
            <dt>{t("guest.card.dress_label")}</dt>
            <dd>{v.dress_code}</dd>
          </>
        )}
        <dt>{t("guest.card.price_label")}</dt>
        <dd className="price">{formatNaira(kobo)}</dd>
      </dl>
      {v.card.note.trim() ? <p className="pv-note">{v.card.note.trim()}</p> : null}
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
  const [multi, setMulti] = useState(!!initial.end_date);
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
    errors[key]
      ? {
          "aria-invalid": true as const,
          "aria-describedby": `${FIELD_IDS[key]}-err`,
        }
      : {};

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

  const startIso = fromLagos(v.date, v.time || "00:00");
  const dates = multi && v.end_date ? eventDates(startIso, v.end_date) : [];
  const dayOf = (date: string) => v.days.find((d) => d.date === date) ?? { date, name: "", dress_code: "" };
  function setDay(date: string, patch: { name?: string; dress_code?: string }) {
    const next = { ...dayOf(date), ...patch };
    set("days", [...v.days.filter((d) => d.date !== date), next]);
  }
  function toggleMulti(on: boolean) {
    setMulti(on);
    if (!on) set("end_date", "");
    else requestAnimationFrame(() => document.getElementById("e-end")?.focus());
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
            <Field id="e-date" label={multi ? t("admin.event.first_day_label") : t("admin.event.date_label")} error={errors.date}>
              <input className="input" type="date" id="e-date" {...text("date")} {...invalid("date")} />
            </Field>
            <Field id="e-time" label={t("admin.event.time_label")}>
              <input className="input" type="time" id="e-time" {...text("time")} aria-invalid={errors.date ? true : undefined} />
            </Field>
          </div>
          <label className="switch" htmlFor="e-multi">
            <span>
              <b style={{ fontWeight: 600 }}>{t("admin.event.multi_day")}</b>
              <small>{t("admin.event.multi_day_help")}</small>
            </span>
            <input type="checkbox" id="e-multi" checked={multi} onChange={(e) => toggleMulti(e.target.checked)} />
          </label>
          {multi ? (
            <Field id="e-end" label={t("admin.event.end_date_label")} error={errors.end_date}>
              <input className="input" type="date" id="e-end" min={v.date || undefined} {...text("end_date")} {...invalid("end_date")} />
            </Field>
          ) : null}
          {dates.length > 1 ? (
            <div className="days-edit">
              <p className="days-title">{t("admin.event.days_title")}</p>
              <p className="help">{t("admin.event.days_help")}</p>
              <ol>
                {dates.map((date, i) => {
                  const day = dayOf(date);
                  const tag = `${t("guest.card.day_n", { n: i + 1 })}, ${formatDayLabel(date)}`;
                  return (
                    <li key={date}>
                      <span className="day-tag">
                        <b>{t("guest.card.day_n", { n: i + 1 })}</b>
                        <small>{formatDayLabel(date)}</small>
                      </span>
                      <input
                        className="input"
                        autoComplete="off"
                        aria-label={t("admin.event.day_name_label", {
                          day: tag,
                        })}
                        placeholder={v.name.trim() || t("admin.event.name_label")}
                        value={day.name}
                        onChange={(e) => setDay(date, { name: e.target.value })}
                      />
                      <input
                        className="input"
                        autoComplete="off"
                        aria-label={t("admin.event.day_dress_label", {
                          day: tag,
                        })}
                        placeholder={v.dress_code.trim() || t("admin.event.dress_label")}
                        value={day.dress_code}
                        onChange={(e) => setDay(date, { dress_code: e.target.value })}
                      />
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
          <div className="cols">
            <Field id="e-venue" label={t("admin.event.venue_label")}>
              <input className="input" id="e-venue" autoComplete="off" {...text("venue_name")} />
            </Field>
            <Field id="e-addr" label={t("admin.event.venue_address_label")}>
              <input className="input" id="e-addr" autoComplete="off" {...text("venue_address")} />
            </Field>
          </div>
          <Field id="e-dress" label={multi ? t("admin.event.dress_label_main") : t("admin.event.dress_label")}>
            <input className="input" id="e-dress" autoComplete="off" {...text("dress_code")} />
          </Field>
        </section>

        <section className="card fieldset" aria-labelledby="sec-card">
          <h2 id="sec-card">{t("admin.event.card.title")}</h2>
          <p className="help" style={{ margin: "-4px 0 4px" }}>
            {t("admin.event.card.help")}
          </p>
          <Swatches
            label={t("admin.event.card.theme_label")}
            name="theme"
            options={CARD_THEMES}
            value={v.card.theme}
            labelOf={(o) => t(`admin.event.card.themes.${o}` as never)}
            onPick={(o) => set("card", { ...v.card, theme: o })}
          />
          <Swatches
            label={t("admin.event.card.foil_label")}
            name="foil"
            options={CARD_FOILS}
            value={v.card.foil}
            labelOf={(o) => t(`admin.event.card.foils.${o}` as never)}
            onPick={(o) => set("card", { ...v.card, foil: o })}
          />
          <Swatches
            label={t("admin.event.card.paper_label")}
            name="paper"
            options={CARD_PAPERS}
            value={v.card.paper}
            labelOf={(o) => t(`admin.event.card.papers.${o}` as never)}
            onPick={(o) => set("card", { ...v.card, paper: o })}
          />
          <Field id="e-note" label={t("admin.event.card.note_label")} help={t("admin.event.card.note_help")} error={errors.card_note}>
            <input
              className="input"
              id="e-note"
              autoComplete="off"
              maxLength={CARD_NOTE_MAX}
              value={v.card.note}
              onChange={(e) => set("card", { ...v.card, note: e.target.value })}
              {...invalid("card_note")}
            />
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
                <input
                  className="input num"
                  inputMode="numeric"
                  id="e-hold"
                  {...text("hold_window_hours")}
                  {...invalid("hold_window_hours")}
                />
                <span>{t("admin.event.hours")}</span>
              </div>
            </Field>
          </div>
          <div className="cols">
            <Field id="e-unopened" label={t("admin.event.unopened_label")} error={errors.unopened_expiry_days}>
              <div className="suffix">
                <input
                  className="input num"
                  inputMode="numeric"
                  id="e-unopened"
                  {...text("unopened_expiry_days")}
                  {...invalid("unopened_expiry_days")}
                />
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
        <div className="stage" data-card-theme={v.card.theme} data-card-foil={v.card.foil} data-card-paper={v.card.paper}>
          <Preview v={v} hostName={hostName} />
        </div>
        <p className="help">{t("admin.event.preview_help")}</p>
      </aside>
    </div>
  );
}
