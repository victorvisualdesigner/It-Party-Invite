"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { callAction } from "@/lib/client-action";
import { signIn, signInToEvent } from "./actions";

export type LoginLabels = {
  title: string;
  email: string;
  password: string;
  submit: string;
  submitting: string;
  network: string;
  show: string;
  hide: string;
  footnote: string;
};

/** Someone else is already signed in on this browser: say who, and offer to stay as them. */
export type SignedInNote = { text: string; stayLabel: string; stayHref: string };

/**
 * Email and password. With `code`, this is one event's admin sign in: only that event's admins get in.
 */
export function LoginForm({ labels, code, note }: { labels: LoginLabels; code?: string; note?: SignedInNote }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await callAction(() => (code ? signInToEvent(code, { email, password }) : signIn({ email, password })));
      if (result.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      setError("network" in result && result.network ? labels.network : (result.message ?? labels.network));
    });
  }

  return (
    <form className="login-card" noValidate onSubmit={submit} aria-describedby={error ? "login-error" : undefined}>
      <h1 className="login-title">{labels.title}</h1>
      {note ? (
        <p className="login-note">
          {note.text} <a href={note.stayHref}>{note.stayLabel}</a>
        </p>
      ) : null}
      <div className="line-field">
        <label htmlFor="l-email">{labels.email}</label>
        <div className="line-input">
          <input
            id="l-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            required
          />
          <span className="line-icon" aria-hidden="true">
            <Icon name="mail" />
          </span>
        </div>
      </div>
      <div className="line-field">
        <label htmlFor="l-pass">{labels.password}</label>
        <div className="line-input">
          <input
            id="l-pass"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            required
          />
          <button
            className="line-eye"
            type="button"
            aria-label={visible ? labels.hide : labels.show}
            aria-pressed={visible}
            aria-controls="l-pass"
            onClick={() => setVisible((v) => !v)}
          >
            <Icon name={visible ? "eyeOff" : "eye"} />
          </button>
        </div>
      </div>
      {error ? (
        <p className="error" id="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn btn-gold btn-wide login-submit" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? labels.submitting : labels.submit}
      </button>
      <p className="login-footnote">{labels.footnote}</p>
    </form>
  );
}
