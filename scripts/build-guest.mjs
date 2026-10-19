// Builds the guest page's script and stylesheet into public/g/ with content hashes, and writes
// lib/generated/guest-assets.json so the page links the right files. Runs before dev, build and tests.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { transform } from "esbuild";

const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

const copy = JSON.parse(read("content/copy.json"));
const noChase = JSON.parse(read("content/no-chase.json"));
const words = JSON.parse(read("content/key-words.json")).words;
// Only what the guest page needs travels to the phone: guest copy, the chase deck, the key words.
const data = { copy: { guest: copy.guest }, noChase, words };

const js = await transform(`window.OY_GUEST=${JSON.stringify(data)};\n${read("guest/guest.js")}`, {
  loader: "js",
  minify: true,
  target: "es2017",
  legalComments: "none",
});
const css = await transform([read("design/tokens.css"), read("design/card-themes.css"), read("app/base.css"), read("guest/guest.css")].join("\n"), {
  loader: "css",
  minify: true,
  target: ["chrome80", "safari13"],
});

const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);
const out = new URL("public/g/", root);
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (/^guest\./.test(f)) rmSync(new URL(f, out));
const jsName = `guest.${hash(js.code)}.js`;
const cssName = `guest.${hash(css.code)}.css`;
writeFileSync(new URL(jsName, out), js.code);
writeFileSync(new URL(cssName, out), css.code);

mkdirSync(new URL("lib/generated/", root), { recursive: true });
writeFileSync(new URL("lib/generated/guest-assets.json", root), JSON.stringify({ js: `/g/${jsName}`, css: `/g/${cssName}` }, null, 2) + "\n");
console.log(`guest assets: /g/${jsName} (${js.code.length} B), /g/${cssName} (${css.code.length} B)`);
