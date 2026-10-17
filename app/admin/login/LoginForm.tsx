"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { callAction } from "@/lib/client-action";
import { signIn } from "./actions";

type Labels = { title: string; email: string; password: string; submit: string; submitting: string; network: string };

export function LoginForm({ labels }: { labels: Labels }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await callAction(() => signIn({ email, password }));
      if (result.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      setError("network" in result && result.network ? labels.network : (result.message ?? labels.network));
    });
  }

  return (
    <form noValidate onSubmit={submit} aria-describedby={error ? "login-error" : undefined}>
      <h1 className="display">{labels.title}</h1>
      <div className="field">
        <label htmlFor="l-email">{labels.email}</label>
        <input
          className="input"
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
      </div>
      <div className="field">
        <label htmlFor="l-pass">{labels.password}</label>
        <input
          className="input"
          id="l-pass"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          required
        />
      </div>
      {error ? (
        <p className="error" id="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn btn-gold btn-wide" type="submit" style={{ minHeight: 52 }} disabled={pending} aria-busy={pending}>
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
