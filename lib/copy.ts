// Every UI string comes from content/copy.json. Paths are checked at compile time.
import copy from "@/content/copy.json";

type Copy = typeof copy;
type Vars = Record<string, string | number>;

// "admin.login.title" style paths to every string leaf, and to every list of strings.
type StringPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends readonly unknown[]
      ? never
      : T[K] extends object
        ? StringPaths<T[K], `${P}${K}.`>
        : never;
}[keyof T & string];

type ListPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends readonly string[]
    ? `${P}${K}`
    : T[K] extends string
      ? never
      : T[K] extends object
        ? ListPaths<T[K], `${P}${K}.`>
        : never;
}[keyof T & string];

export type CopyKey = StringPaths<Copy>;
export type CopyListKey = ListPaths<Copy>;

function lookup(path: string): unknown {
  return path.split(".").reduce<unknown>(
    (node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined),
    copy,
  );
}

export function fill(text: string, vars?: Vars): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (vars && vars[key] != null ? String(vars[key]) : match));
}

export function t(path: CopyKey, vars?: Vars): string {
  const value = lookup(path);
  if (typeof value !== "string") throw new Error(`Missing copy string: ${path}`);
  return fill(value, vars);
}

export function tList(path: CopyListKey): string[] {
  const value = lookup(path);
  if (!Array.isArray(value)) throw new Error(`Missing copy list: ${path}`);
  return value as string[];
}
