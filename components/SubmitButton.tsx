"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** A submit button for plain server action forms: it shows the working spinner until the action answers. */
export function SubmitButton({ className, children }: { className: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {children}
    </button>
  );
}
