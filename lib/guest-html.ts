// Server HTML for the guest page. Plain HTML, no framework runtime: it paints on a budget phone
// over 3G before any script runs. Markup mirrors ui/guest.html.
import "server-only";
import { t, tList } from "@/lib/copy";
import type { GuestView } from "@/lib/guest";
import { SEAL_D } from "@/lib/seal";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

let sealId = 0;

function sealSvg(mono: string): string {
  const id = `s${++sealId}`;
  return (
    `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>` +
    `<radialGradient id="${id}a" cx="34%" cy="28%" r="78%"><stop offset="0" style="stop-color:var(--wax-light)"/><stop offset=".55" style="stop-color:var(--seal-600)"/><stop offset="1" style="stop-color:var(--wax-dark)"/></radialGradient>` +
    `<radialGradient id="${id}b" cx="62%" cy="68%" r="62%"><stop offset="0" style="stop-color:var(--wax-dark)"/><stop offset="1" style="stop-color:var(--seal-500)"/></radialGradient></defs>` +
    `<path d="${SEAL_D}" transform="translate(0 2.5)" fill="rgba(0,0,0,.35)"/><path d="${SEAL_D}" fill="url(#${id}a)"/>` +
    `<circle cx="50" cy="50" r="31" fill="url(#${id}b)" opacity=".9"/><circle cx="50" cy="50" r="31" fill="none" stroke="rgba(232,209,147,.38)" stroke-width="1"/>` +
    `<circle cx="50" cy="50" r="26.5" fill="none" stroke="rgba(232,209,147,.22)" stroke-width=".8" stroke-dasharray="1.2 2.6"/>` +
    (mono
      ? `<text x="50" y="58.5" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-style="italic" font-weight="600" font-size="23" fill="rgba(0,0,0,.35)">${esc(mono)}</text>` +
        `<text x="50" y="57.5" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-style="italic" font-weight="600" font-size="23" fill="rgba(232,209,147,.93)">${esc(mono)}</text>`
      : "") +
    `<ellipse cx="34" cy="27" rx="13" ry="5.5" fill="rgba(255,255,255,.13)" transform="rotate(-32 34 27)"/></svg>`
  );
}

export function sealHtml(mono = "OY"): string {
  return `<div class="seal"><span class="seal-half l">${sealSvg(mono)}</span><span class="seal-half r">${sealSvg(mono)}</span><span class="seal-shine"></span></div>`;
}

export function envelopeHtml(o: { mark?: string; dim?: boolean; glow?: boolean } = {}): string {
  return (
    `<div class="envelope${o.dim ? " dim" : ""}" aria-hidden="true">` +
    (o.glow ? `<div class="env-layer env-glow"></div>` : "") +
    `<div class="env-layer env-back"></div>` +
    `<div class="env-layer env-letter"><span class="to"></span><span class="rule"></span><span class="rule short"></span></div>` +
    `<div class="env-layer env-front"><i class="side-l"></i><i class="side-r"></i><i class="bottom"></i><i class="grain"></i></div>` +
    (o.mark ? `<span class="env-mark">${esc(o.mark)}</span>` : "") +
    `<div class="env-layer env-flap-shadow"></div><div class="env-layer env-flap"><i class="out"></i><i class="in"></i></div>` +
    sealHtml() +
    `</div>`
  );
}

const ICON: Record<string, string> = {
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
};
const icon = (name: string) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const CORNER = `<path d="M2 24V8a6 6 0 0 1 6-6h16"/><path d="M6 24V11a5 5 0 0 1 5-5h13"/><circle cx="6" cy="6" r="1.4" fill="currentColor" stroke="none"/>`;
const corner = (pos: string) => `<svg class="corner ${pos}" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${CORNER}</svg>`;

/** The section the server can paint before scripts run. Screens with guest data wait for the script. */
function visibleSection(s: GuestView): string | null {
  switch (s.screen) {
    case "lock":
      return "s-lock";
    case "rest":
      return "s-rest";
    case "stranger":
      return "s-stranger";
    case "claimed":
      return "s-claimed";
    case "cancelled":
    case "expired":
      return "s-ended";
    default:
      return null;
  }
}

export type GuestAssets = { css: string; js: string };

export function guestPageHtml(state: GuestView, assets: GuestAssets, appUrl: string): string {
  sealId = 0;
  const show = visibleSection(state);
  const hidden = (id: string) => (show === id ? "" : " hidden");
  const mark = t("guest.lock.envelope_mark");

  const masked =
    state.screen === "lock"
      ? `${icon("lock")}<span>${esc(t("guest.lock.masked_line", { masked_phone: "\u0001" })).replace("\u0001", `<b>${esc(state.masked)}</b>`)}</span>`
      : "";
  const restBody =
    state.screen === "rest"
      ? esc(t("guest.lock.error_locked", { minutes: state.minutes, inviter_hint: t("guest.lock.inviter_hint_fallback") }))
      : "";
  let endedTitle = "";
  let endedBody = "";
  if (state.screen === "cancelled") {
    endedTitle = t("guest.cancelled.title");
    endedBody = t("guest.cancelled.body");
  } else if (state.screen === "expired") {
    endedTitle = t("guest.expired.title");
    endedBody = t("guest.expired.body", { inviter: state.inviter ?? t("guest.lock.inviter_hint_fallback") });
  }

  const steps = tList("guest.transfer.steps")
    .map((s, i) => `<li><b>${i + 1}</b><span>${esc(s)}</span></li>`)
    .join("");

  // State goes to the script as inert JSON. Escaping "<" keeps it from ever closing the script tag.
  const json = JSON.stringify(state).replace(/</g, "\\u003c");
  const ogImage = `${appUrl.replace(/\/+$/, "")}/og-envelope.png`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#0F2A22">
<title>${esc(t("guest.preview_card.og_title"))}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(t("guest.preview_card.og_title"))}">
<meta property="og:description" content="${esc(t("guest.preview_card.og_description"))}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(t("guest.preview_card.og_image_alt"))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;600&display=swap">
<link rel="stylesheet" href="${esc(assets.css)}">
<script src="${esc(assets.js)}" defer></script>
</head>
<body class="surface-dark bg-club">
<div class="motes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
<main class="app">

<section class="screen" id="s-lock"${hidden("s-lock")} aria-labelledby="lock-title">
  <p class="eyebrow" data-fade>${esc(t("guest.lock.eyebrow"))}</p>
  <div class="env-mount" id="env-lock">${envelopeHtml({ mark })}</div>
  <h1 class="display" id="lock-title" data-fade>${esc(t("guest.lock.title"))}</h1>
  <p class="masked" data-fade id="lock-masked">${masked}</p>
  <form class="lock-form" id="lock-form" novalidate data-fade>
    <div class="field">
      <label for="phone">${esc(t("guest.lock.phone_label"))}</label>
      <input class="input num" id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="${esc(t("guest.lock.phone_placeholder"))}">
    </div>
    <div class="field">
      <label for="key">${esc(t("guest.lock.key_label"))}</label>
      <input class="input input-key" id="key" name="key" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" required aria-describedby="key-help" placeholder="${esc(t("guest.lock.key_placeholder"))}">
      <span class="help" id="key-help">${esc(t("guest.lock.key_help"))}</span>
    </div>
    <p class="error" id="lock-error" role="alert" hidden></p>
    <button class="btn btn-gold btn-wide" id="unlock" type="submit">${esc(t("guest.lock.submit"))}</button>
  </form>
</section>

<section class="screen" id="s-rest"${hidden("s-rest")} aria-labelledby="rest-title">
  <div class="env-mount">${envelopeHtml({ mark, dim: true })}</div>
  <h1 class="display" id="rest-title">${esc(t("guest.lock.rest_title"))}</h1>
  <p class="lede" id="rest-body">${restBody}</p>
</section>

<section class="screen" id="s-stranger"${hidden("s-stranger")} aria-labelledby="stranger-title">
  <p class="eyebrow">${esc(t("guest.lock.eyebrow"))}</p>
  <div class="env-mount">${envelopeHtml({ mark })}</div>
  <h1 class="display" id="stranger-title">${esc(t("guest.stranger.title"))}</h1>
  <p class="lede">${esc(t("guest.stranger.body"))}</p>
</section>

<section class="screen" id="s-claimed"${hidden("s-claimed")} aria-labelledby="claimed-title">
  <div class="env-mount">${envelopeHtml({ mark, dim: true })}</div>
  <h1 class="display" id="claimed-title">${esc(t("guest.stranger.claimed_title"))}</h1>
  <p class="lede">${esc(t("guest.stranger.already_claimed"))}</p>
</section>

<section class="screen" id="s-card" hidden aria-labelledby="card-headline">
  <article class="invite" id="invite">
    ${corner("tl")}${corner("tr")}${corner("bl")}${corner("br")}
    <p class="card-eyebrow" id="card-event"></p>
    <p class="salute" id="salute"></p>
    <h2 class="display headline" id="card-headline"></h2>
    <dl class="details" id="card-details"></dl>
    <div class="question">
      <span class="orn" aria-hidden="true"></span>
      <p class="q">${esc(t("guest.card.question"))}</p>
      <div class="choices">
        <button class="btn-yes" id="yes" type="button">${esc(t("guest.card.yes"))}</button>
        <span id="no-slot"><button class="btn-no" id="no" type="button" aria-describedby="chase-line"><span class="lbl">${esc(t("guest.card.no"))}</span></button></span>
      </div>
      <p class="chase-line" id="chase-line" aria-live="polite"></p>
      <p class="later-note" id="later-note" hidden></p>
    </div>
  </article>
</section>

<section class="screen" id="s-wait" hidden aria-labelledby="wait-title">
  <div class="env-mount" id="env-wait">${envelopeHtml({ glow: true })}</div>
  <h1 class="display" id="wait-title"></h1>
  <p class="lede" id="wait-body"></p>
  <p class="recap" id="wait-recap" hidden></p>
  <p class="small">${esc(t("guest.awaiting.small"))}</p>
</section>

<section class="screen" id="s-notfound" hidden aria-labelledby="nf-title">
  <div class="env-mount">${envelopeHtml({ mark })}</div>
  <h1 class="display" id="nf-title">${esc(t("guest.not_found.title"))}</h1>
  <p class="lede" id="nf-body"></p>
  <button class="btn btn-gold btn-wide" type="button" id="nf-retry">${esc(t("guest.not_found.retry"))}</button>
  <button class="btn btn-ghost btn-wide" type="button" id="nf-details">${esc(t("guest.not_found.details"))}</button>
</section>

<section class="screen" id="s-covered" hidden aria-labelledby="cov-title">
  <div class="env-mount" id="env-covered">${envelopeHtml({ glow: true })}</div>
  <h1 class="display" id="cov-title">${esc(t("guest.covered.title"))}</h1>
  <p class="lede" id="cov-body"></p>
  <button class="btn btn-gold btn-wide" type="button" id="cov-open">${esc(t("guest.covered.continue"))}</button>
</section>

<section class="screen" id="s-ticket" hidden aria-labelledby="t-name">
  <div class="ticket-scene" id="ticket-scene">
    <div class="ticket" id="ticket">
      <div class="t-face t-back" aria-hidden="true"><div>${sealHtml()}</div><p id="t-back-to"></p></div>
      <div class="t-face t-front">
        <span class="foil-sweep" id="foil" aria-hidden="true"></span>
        <div class="t-main">
          <div class="t-top"><span id="t-event"></span><span>${esc(t("guest.ticket.admits"))}</span></div>
          <h1 class="t-name" id="t-name"></h1>
          <p class="t-by" id="t-by"></p>
          <dl class="t-details" id="t-details"></dl>
        </div>
        <div class="t-perf" aria-hidden="true"></div>
        <div class="t-stub">
          <div class="qr" id="qr" role="img" aria-label="${esc(t("guest.ticket.qr_caption"))}"></div>
          <p><strong>${esc(t("guest.ticket.qr_caption"))}</strong><span>${esc(t("guest.ticket.qr_note"))}</span><span class="t-code" id="t-code"></span></p>
        </div>
      </div>
    </div>
  </div>
  <p class="nocount" id="nocount"></p>
  <div class="ticket-actions">
    <button class="btn btn-ghost" type="button" id="save-card">${icon("image")}<span>${esc(t("guest.ticket.save_image"))}</span></button>
    <button class="btn btn-ghost" type="button" id="add-cal">${icon("calendar")}<span>${esc(t("guest.ticket.add_calendar"))}</span></button>
  </div>
  <label class="switch panel-switch" for="board"><span>${esc(t("guest.ticket.board_toggle"))}</span><input type="checkbox" id="board"></label>
</section>

<section class="screen" id="s-ended"${hidden("s-ended")} aria-labelledby="ended-title">
  <div class="env-mount">${envelopeHtml({ mark, dim: true })}</div>
  <h1 class="display" id="ended-title">${esc(endedTitle)}</h1>
  <p class="lede" id="ended-body">${esc(endedBody)}</p>
</section>

<p class="inapp" id="inapp" hidden><span>${esc(t("guest.in_app_browser.hint"))}</span>. <a href="#" id="inapp-open">${esc(t("guest.in_app_browser.button"))}</a></p>
</main>

<div class="overlay sheet-root" id="sheet" hidden>
  <div class="scrim" id="scrim"></div>
  <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="grabber" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 id="sheet-title" tabindex="-1">${esc(t("guest.transfer.title"))}</h2>
      <span class="held" id="held"></span>
    </div>
    <p class="intro">${esc(t("guest.transfer.intro"))}</p>
    <ol class="steps" id="steps">${steps}</ol>
    <div class="rows" id="rows"></div>
    <p class="note" id="hold-line"></p>
    <p class="refund" id="refund"></p>
    <div id="sent-step" hidden>
      <div class="field">
        <label for="sender">${esc(t("guest.transfer.sender_name_label"))}</label>
        <input class="input" id="sender" type="text" autocomplete="name" placeholder="${esc(t("guest.transfer.sender_name_placeholder"))}">
        <span class="help">${esc(t("guest.transfer.sender_name_help"))}</span>
      </div>
      <p class="error" id="sender-error" role="alert" hidden>${esc(t("guest.transfer.sender_name_error"))}</p>
    </div>
    <p class="error" id="sheet-error" role="alert" hidden></p>
    <div class="sheet-actions">
      <button class="btn btn-gold" type="button" id="btn-sent"></button>
      <button class="btn btn-ghost" type="button" id="btn-later">${esc(t("guest.transfer.not_now"))}</button>
    </div>
  </section>
</div>

<p class="sr" id="sr-live" aria-live="assertive"></p>
<canvas id="confetti" hidden></canvas>
<script id="oy-state" type="application/json">${json}</script>
</body>
</html>`;
}
