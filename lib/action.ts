// The shape every admin server action returns, so forms can show field errors and keep what was typed.

export type FieldErrors = Record<string, string>;

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; errors?: FieldErrors; message?: string; signedOut?: boolean; network?: boolean };

export const signedOut = { ok: false, signedOut: true } as const;
