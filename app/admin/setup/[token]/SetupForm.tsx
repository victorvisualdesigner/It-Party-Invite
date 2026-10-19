"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import type { FieldErrors } from "@/lib/action";
import { callAction } from "@/lib/client-action";
import { setPasswordAction } from "./actions";

type Labels = { password: string; again: string; help: string; submit: string; submitting: string; show: string; hide: string; network: string };

export function SetupForm({ token, email, labels }: { token: string; email: string; labels: Labels }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await callAction(() => setPasswordAction(token, password, again));
      if (result.ok) return window.location.assign("/admin");
      if ("network" in result && result.network) return setFormError(labels.network);
      setErrors(result.errors ?? {});
      if (result.message) setFormError(result.message);
      document.getElementById(result.errors?.again ? "s-again" : "s-pass")?.focus();
    });
  }

  return (
    <form className="setup-form" noValidate onSubmit={submit}>
      {/* Lets password managers save the new password against the right email. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <div className="line-field">
        <label htmlFor="s-pass">{labels.password}</label>
        <div className="line-input">
          <input
            id="s-pass"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby="s-pass-help"
          />
          <button className="line-eye" type="button" aria-label={visible ? labels.hide : labels.show} aria-pressed={visible} onClick={() => setVisible((v) => !v)}>
            <Icon name={visible ? "eyeOff" : "eye"} />
          </button>
        </div>
        <span className="help" id="s-pass-help">
          {errors.password ?? labels.help}
        </span>
      </div>
      <div className="line-field">
        <label htmlFor="s-again">{labels.again}</label>
        <div className="line-input">
          <input
            id="s-again"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            aria-invalid={errors.again ? true : undefined}
          />
        </div>
        {errors.again ? <p className="error">{errors.again}</p> : null}
      </div>
      {formError ? (
        <p className="error" role="alert">
          {formError}
        </p>
      ) : null}
      <button className="btn btn-gold btn-wide login-submit" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
