/*
  The guest page. One route, every guest state. Ported from ui/assets/guest.js (which ports
  prototype/guest.html): the envelope, the seal crack, the card reveal, every No chase move, the
  transfer sheet, the waiting state and the card turning over. Plain browser JavaScript, no
  libraries: CSS keyframes and the Web Animations API only. Copy arrives in window.OY_GUEST,
  built from content/*.json by scripts/build-guest.mjs. State comes from the server.
*/
(function () {
  "use strict";
  var C = window.OY_GUEST, NC = C.noChase;
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var $ = function (s) { return document.querySelector(s); };
  var BASE = location.pathname.replace(/\/+$/, "");
  var TZ = "Africa/Lagos";

  /* ---------- Kit ---------- */
  function fill(str, vars) { return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }
  function t(path, vars) {
    var v = path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, C.copy);
    if (v == null) return "";
    return typeof v === "string" ? fill(v, vars) : v;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var E = { out: "cubic-bezier(.22,1,.36,1)", spring: "cubic-bezier(.34,1.56,.64,1)", inout: "cubic-bezier(.65,0,.35,1)", in: "cubic-bezier(.55,0,1,.45)" };
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function anim(el, frames, opts) {
    if (!el || !el.animate) return { finished: Promise.resolve(), cancel: function () {} };
    var a = el.animate(frames, opts);
    var done = (a.finished || new Promise(function (r) { a.onfinish = r; })).catch(function () {});
    // Never let a sequence hang: if frames stall (hidden tab, busy phone), resolve on the deadline.
    var o = typeof opts === "number" ? { duration: opts } : (opts || {});
    if (o.iterations !== Infinity) done = Promise.race([done, wait((o.delay || 0) + (o.duration || 0) * (o.iterations || 1) + 120)]);
    try { Object.defineProperty(a, "finished", { value: done, configurable: true }); } catch (e) { a.done = done; }
    return a;
  }
  function haptic(p) {
    try {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) {}
  }
  var ICON = {
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };
  function icon(n) { return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + "</svg>"; }
  var toastWrap, toastT;
  function toast(msg) {
    if (!toastWrap) { toastWrap = document.createElement("div"); toastWrap.className = "toast-wrap"; toastWrap.setAttribute("role", "status"); toastWrap.setAttribute("aria-live", "polite"); document.body.appendChild(toastWrap); }
    toastWrap.innerHTML = "";
    var el = document.createElement("div"); el.className = "toast"; el.textContent = msg; toastWrap.appendChild(el);
    if (!reduced) anim(el, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: E.out });
    clearTimeout(toastT); toastT = setTimeout(function () { el.remove(); }, 3200);
  }
  // Every button that talks to the server shows it is working. The No button never does: it can't be pressed.
  function working(btn, on) {
    if (!btn) return;
    btn.disabled = !!on;
    if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy");
  }
  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      btn.textContent = t("guest.transfer.copied"); btn.classList.add("done");
      setTimeout(function () { btn.textContent = t("guest.transfer.copy"); btn.classList.remove("done"); }, 1600);
    };
    var fallback = function () {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); done();
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase(); }
  // Dates read like the card: "22nd of Oct, 2026 at 7:21pm". Lagos is UTC+1 all year.
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function ordinal(n) { var v = n % 100; return n + (v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th"); }
  function fmtShort(ts) {
    var d = new Date(new Date(ts).getTime() + 3600e3).toISOString();
    return t("guest.card.date_at", { date: ordinal(+d.slice(8, 10)) + " of " + MONTHS[+d.slice(5, 7) - 1] + ", " + d.slice(0, 4), time: fmtTime(ts) });
  }
  function left(ms) { ms = Math.max(0, ms); var h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3); return h > 0 ? h + "h " + m + "m" : m + "m"; }
  function holdEnds(s) { return s && s.hold_ends ? Date.parse(s.hold_ends) : null; }

  /* ---------- Server ---------- */
  function api(path, body) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    return fetch(BASE + "/api/" + path, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok && r.status !== 400 && r.status !== 403 && r.status !== 429) throw new Error("http " + r.status);
      return r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }

  /* ---------- Static bits ---------- */
  if (/(FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\))/i.test(navigator.userAgent)) $("#inapp").hidden = false;
  $("#inapp-open").addEventListener("click", function (e) {
    e.preventDefault();
    var u = location.href.replace(/^https?:\/\//, "");
    location.href = /Android/i.test(navigator.userAgent) ? "intent://" + u + "#Intent;scheme=https;package=com.android.chrome;end" : location.href;
  });

  var state = null, current = null, seq = false;
  var visibleNow = document.querySelector(".screen:not([hidden])");
  if (visibleNow) current = visibleNow.id;

  /* ---------- Screens ---------- */
  var SCREEN = { lock: "s-lock", rest: "s-rest", stranger: "s-stranger", claimed: "s-claimed", card: "s-card", held: "s-held", wait: "s-wait", asked: "s-asked", notfound: "s-notfound", covered: "s-covered", ticket: "s-ticket", expired: "s-ended", cancelled: "s-ended", closed: "s-ended" };
  function go(id) {
    var from = current && document.getElementById(current), to = document.getElementById(id);
    if (from === to) { if (to) to.hidden = false; return Promise.resolve(); }
    if (id !== "s-card") hideNo(true);
    var enter = function () {
      if (from) from.hidden = true;
      to.hidden = false; current = id;
      window.scrollTo(0, 0);
      if (id === "s-card") hideNo(false);
      if (!reduced && from) anim(to, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: E.out });
      var h = to.querySelector("h1, h2");
      if (h && from) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    };
    if (reduced || !from) { enter(); return Promise.resolve(); }
    var a = anim(from, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" });
    return a.finished.then(function () { enter(); a.cancel(); });
  }
  // The event's card design: background, foil and paper. Only once the guest is in.
  function applyDesign(s) {
    var c = s && s.event && s.event.card, root = document.documentElement;
    ["theme", "foil", "paper"].forEach(function (k) {
      var a = "data-card-" + k;
      if (c && c[k]) root.setAttribute(a, c[k]); else root.removeAttribute(a);
    });
  }
  function subInto(el, s) {
    var sub = s && s.event && s.event.card && s.event.card.subtitle;
    el.textContent = sub || ""; el.hidden = !sub;
  }
  function noteInto(el, s) {
    var n = s && s.event && s.event.card && s.event.card.note;
    el.textContent = n || ""; el.hidden = !n;
  }
  function route(s, opts) {
    opts = opts || {};
    state = s;
    applyDesign(s);
    (RENDER[s.screen] || function () {})(s);
    return go(SCREEN[s.screen]).then(function () {
      if (s.screen === "lock" && opts.arrive) arrive();
      if (s.screen === "card" && opts.reveal) revealCard();
      if (s.screen === "ticket") { fitName(); flipTicket(!!opts.flip); }
      // Coming back to a saved seat: the transfer details come straight up.
      if (s.screen === "held" && (opts.arrive || opts.reveal)) continueToPay($("#held-pay"));
    });
  }

  /* ---------- Renderers ---------- */
  function boldInto(str, value) { return esc(str).replace("\u0001", "<b>" + esc(value) + "</b>"); }
  function detailsHTML(s, forTicket) {
    var ev = s.event, rows = [];
    rows.push([t("guest.card.date_label"), ev.date ? esc(ev.date) : esc(t("guest.card.date_hidden")), ev.date ? "date" : "muted"]);
    rows.push([t("guest.card.venue_label"), ev.venue ? esc(ev.venue) + (ev.venue_address ? "<small>" + esc(ev.venue_address) + "</small>" : "") : esc(t("guest.card.venue_hidden", { venue_reveal_hint: ev.venue_hint })), ev.venue ? "" : "muted"]);
    if (ev.days && ev.days.length && ev.days_differ) {
      // Each day: its number in a filled circle beside its name. No dates here.
      rows.push([t("guest.card.days_label"), '<ul class="days">' + ev.days.map(function (d, i) {
        var n = d.number || i + 1;
        return '<li><span class="day-num" aria-hidden="true">' + n + '</span><span><span class="sr">' + esc(t("guest.card.day_n", { n: n })) + ", </span><b>" + esc(d.name) + "</b>" +
          (d.dress ? "<small>" + esc(t("guest.card.day_dress", { dress: d.dress })) + "</small>" : "") + "</span></li>";
      }).join("") + "</ul>", ""]);
    } else if (ev.dress) rows.push([t("guest.card.dress_label"), esc(ev.dress), ""]);
    if (!forTicket) rows.push([t("guest.card.price_label"), s.covered ? esc(t("guest.card.covered_value", { inviter: s.inviter })) : esc(ev.price), s.covered ? "muted" : "price"]);
    return rows.map(function (r) { return "<dt>" + esc(r[0]) + '</dt><dd class="' + r[2] + '">' + r[1] + "</dd>"; }).join("");
  }
  function ended(title, body) { $("#ended-title").textContent = title; $("#ended-body").textContent = body; }
  var RENDER = {
    lock: function (s) {
      $("#lock-masked").innerHTML = icon("lock") + "<span>" + boldInto(t("guest.lock.masked_line", { masked_phone: "\u0001" }), s.masked) + "</span>";
    },
    rest: function (s) { $("#rest-body").textContent = t("guest.lock.error_locked", { minutes: s.minutes, inviter_hint: t("guest.lock.inviter_hint_fallback") }); },
    card: function (s) {
      $("#card-event").textContent = s.event.name;
      subInto($("#card-sub"), s);
      var sal = t("guest.card.salutation", { guest: s.guest });
      $("#salute").setAttribute("aria-label", sal);
      $("#salute").innerHTML = sal.split("").map(function (c) { return '<span class="ch" aria-hidden="true">' + esc(c) + "</span>"; }).join("");
      $("#card-headline").textContent = t("guest.card.headline", { inviter: s.inviter });
      $("#card-details").innerHTML = detailsHTML(s);
      noteInto($("#card-note"), s);
      taps = Math.max(taps, s.taps || 0); growYes();
      var note = $("#later-note");
      if (s.status === "said_yes" && holdEnds(s)) { note.textContent = t("guest.transfer.not_now_note", { expires_at: fmtShort(holdEnds(s)) }); note.hidden = false; }
      else note.hidden = true;
    },
    wait: function (s) {
      $("#wait-title").textContent = s.by_member ? t("guest.awaiting.member_title", { inviter: s.inviter }) : t("guest.awaiting.title");
      $("#wait-body").textContent = s.by_member ? t("guest.awaiting.member_body") : t("guest.awaiting.body");
      var r = $("#wait-recap");
      if (s.payment && s.payment.sender_name && !s.by_member) {
        r.innerHTML = icon("check") + "<span>" + esc(t("guest.awaiting.recap", { sender_name: s.payment.sender_name, reference: "\u0002" })).replace("\u0002", "<b>" + esc(s.payment.reference) + "</b>") + "</span>";
        r.hidden = false;
      } else r.hidden = true;
      var to = $("#env-wait .to"); if (to) to.textContent = t("guest.card.letter_to", { guest: s.guest });
    },
    held: function (s) {
      var ends = holdEnds(s), parts = s.parts;
      if (parts && parts.paid) {
        // Part paid: what is in, what is left. The seat has no deadline now.
        $("#held-title").textContent = t("guest.held.part_title", { paid: parts.paid });
        $("#held-body").textContent = t("guest.held.part_body", { balance: parts.balance });
      } else {
        $("#held-title").textContent = t("guest.held.title");
        $("#held-body").textContent = ends ? t("guest.held.body", { expires_at: fmtShort(ends) }) : t("guest.transfer.not_now_note", { expires_at: "" });
      }
      var to = $("#env-held .to"); if (to) to.textContent = t("guest.card.letter_to", { guest: s.guest });
    },
    asked: function (s) {
      $("#asked-title").textContent = t("guest.asked.title", { inviter: s.inviter });
      $("#asked-body").textContent = t("guest.asked.body", { inviter: s.inviter });
      var held = $("#asked-held"), ends = holdEnds(s);
      if (ends) { held.innerHTML = icon("clock") + "<span>" + esc(t("guest.asked.held", { expires_at: fmtShort(ends) })) + "</span>"; held.hidden = false; }
      else held.hidden = true;
      $("#asked-wa-label").textContent = t("guest.asked.whatsapp", { inviter: s.inviter });
      var wa = $("#asked-wa");
      if (s.ask_href) { wa.href = s.ask_href; wa.hidden = false; } else wa.hidden = true;
      var to = $("#env-asked .to"); if (to) to.textContent = t("guest.card.letter_to", { guest: s.guest });
    },
    notfound: function (s) {
      var p = s.payment || {};
      $("#nf-body").innerHTML = esc(t("guest.not_found.body", { amount: "\u0001", account_name: "\u0002" })).replace("\u0001", "<b>" + esc(p.amount) + "</b>").replace("\u0002", "<b>" + esc(p.account_name) + "</b>");
    },
    covered: function (s) { $("#cov-body").textContent = t("guest.covered.body", { inviter: s.inviter }); var to = $("#env-covered .to"); if (to) to.textContent = t("guest.card.letter_to", { guest: s.guest }); },
    ticket: function (s) {
      $("#t-event").textContent = s.event.name;
      subInto($("#t-sub"), s);
      $("#t-name").textContent = s.guest;
      $("#t-by").textContent = t("guest.ticket.invited_by", { inviter: s.inviter });
      $("#t-back-to").textContent = t("guest.card.letter_to", { guest: s.guest });
      $("#t-details").innerHTML = detailsHTML(s, true);
      noteInto($("#t-note"), s);
      $("#qr").innerHTML = s.qr || "";
      $("#t-code").textContent = s.ticket_code || "";
      var n = s.taps || 0;
      $("#nocount").textContent = n === 0 ? t("guest.ticket.no_count_zero") : n === 1 ? t("guest.ticket.no_count_one") : t("guest.ticket.no_count", { n: n });
      $("#add-cal").setAttribute("aria-disabled", s.event.starts_at ? "false" : "true");
    },
    expired: function (s) { ended(t("guest.expired.title"), t("guest.expired.body", { inviter: s.inviter || t("guest.lock.inviter_hint_fallback") })); },
    cancelled: function () { ended(t("guest.cancelled.title"), t("guest.cancelled.body")); },
    closed: function (s) { ended(t("guest.closed.title"), t("guest.closed.body", { event: s.event ? s.event.name : "" })); }
  };

  /* ---------- Lock ---------- */
  function arrive() {
    if (reduced) return;
    var env = $("#env-lock .envelope");
    anim(env, [{ opacity: 0, transform: "translateY(40px)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: E.out });
    var seal = env.querySelector(".seal");
    setTimeout(function () { seal.classList.add("shining"); setTimeout(function () { seal.classList.remove("shining"); }, 1000); }, 650);
  }
  var phoneEl = $("#phone"), keyEl = $("#key");
  function typingPhone(v) {
    var s = String(v), d = s.replace(/\D/g, "");
    if (s.trim().charAt(0) === "+") return "+" + [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 13)].filter(Boolean).join(" ");
    d = d.slice(0, 11);
    return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(" ");
  }
  function extractKey(text) {
    var re = /\b([A-Za-z]{3,12})[\s.\-:]*([2-9]{4})\b/g, m, first = null;
    while ((m = re.exec(String(text)))) {
      var k = m[1].toUpperCase() + " " + m[2];
      if (C.words.indexOf(m[1].toUpperCase()) >= 0) return k;
      if (!first) first = k;
    }
    return first;
  }
  function prettyKey(v) { var n = String(v || "").toUpperCase().replace(/[^A-Z2-9]/g, ""), m = n.match(/^([A-Z]+)([2-9]{4})$/); return m ? m[1] + " " + m[2] : n; }
  phoneEl.addEventListener("input", function () { if (phoneEl.selectionStart === phoneEl.value.length) phoneEl.value = typingPhone(phoneEl.value); });
  keyEl.addEventListener("paste", function (e) {
    var k = extractKey((e.clipboardData || window.clipboardData).getData("text"));
    if (k) { e.preventDefault(); keyEl.value = k; }
  });
  keyEl.addEventListener("blur", function () { if (keyEl.value) keyEl.value = prettyKey(keyEl.value); });
  // Typing VELVET4827 shows VELVET 4827: the space appears as soon as the first digit does.
  function typingKey(v) {
    var raw = String(v).toUpperCase(), n = raw.replace(/[^A-Z0-9]/g, ""), m = n.match(/^([A-Z]*)([0-9]*)/);
    var word = m[1].slice(0, 12), digits = m[2].slice(0, 4);
    if (digits) return word + (word ? " " : "") + digits;
    return word + (word && /\s$/.test(raw) ? " " : "");
  }
  keyEl.addEventListener("input", function () { if (keyEl.selectionStart === keyEl.value.length) keyEl.value = typingKey(keyEl.value); });

  var unlocking = false;
  $("#lock-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (unlocking) return;
    var btn = $("#unlock"), err = $("#lock-error");
    err.hidden = true;
    var showErr = function (msg) {
      err.textContent = msg; err.hidden = false;
      if (!reduced) anim($("#lock-form"), [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(7px)" }, { transform: "translateX(-4px)" }, { transform: "none" }], { duration: 320 });
    };
    if (navigator.onLine === false) { showErr(t("guest.lock.error_network")); return; }
    unlocking = true; working(btn, true); btn.textContent = t("guest.lock.submitting");
    api("unlock", { phone: phoneEl.value, key: keyEl.value }).then(function (r) {
      unlocking = false; working(btn, false); btn.textContent = t("guest.lock.submit");
      if (r.result === "ok") { unlockSeq(r.state); return; }
      if (r.result === "stranger") { route({ screen: "stranger" }); return; }
      if (r.result === "claimed") { route({ screen: "claimed" }); return; }
      if (r.result === "locked") { route({ screen: "rest", minutes: r.minutes }); return; }
      var msg = t("guest.lock.error_mismatch");
      if (r.attemptsLeft != null && r.attemptsLeft <= 3) msg += " " + t("guest.lock.error_attempts_left", { n: r.attemptsLeft });
      showErr(msg);
    }).catch(function () {
      unlocking = false; working(btn, false); btn.textContent = t("guest.lock.submit");
      showErr(t("guest.lock.error_network"));
    });
  });

  async function unlockSeq(s) {
    haptic(18);
    var env = $("#env-lock .envelope");
    env.querySelector(".to").textContent = t("guest.card.letter_to", { guest: s.guest || "" });
    if (reduced || s.screen !== "card") { route(s, { reveal: true }); return; }
    seq = true;
    document.querySelectorAll("#s-lock [data-fade]").forEach(function (el) { anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" }); });
    var seal = env.querySelector(".seal"), l = seal.querySelector(".l"), r = seal.querySelector(".r");
    await anim(seal, [{ transform: "rotate(0)" }, { transform: "rotate(-7deg)" }, { transform: "rotate(6deg)" }, { transform: "rotate(-3deg)" }, { transform: "rotate(0)" }], { duration: 280 }).finished;
    var fall = { duration: 700, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" };
    anim(l, [{ transform: "none", opacity: 1 }, { transform: "translate(-24px,78px) rotate(-30deg)", opacity: 0 }], fall);
    anim(r, [{ transform: "none", opacity: 1 }, { transform: "translate(22px,88px) rotate(26deg)", opacity: 0 }], Object.assign({ delay: 70 }, fall));
    await wait(240);
    env.querySelector(".env-flap-shadow").style.opacity = "0";
    var flap = env.querySelector(".env-flap");
    await anim(flap, [{ transform: "rotateX(0deg)" }, { transform: "rotateX(180deg)" }], { duration: 520, easing: E.inout, fill: "forwards" }).finished;
    flap.style.zIndex = "0";
    await anim(env.querySelector(".env-letter"), [{ transform: "translateY(0)" }, { transform: "translateY(-52%)" }], { duration: 560, easing: E.out, fill: "forwards" }).finished;
    await wait(140);
    seq = false;
    await route(s, { reveal: true });
  }
  // A tap anywhere skips a running signature animation.
  document.addEventListener("pointerdown", function () {
    if (!seq || !document.getAnimations) return;
    document.getAnimations().forEach(function (a) { var tm = a.effect && a.effect.getTiming && a.effect.getTiming(); if (tm && tm.iterations !== Infinity) { try { a.finish(); } catch (e) {} } });
  }, true);

  /* ---------- Card reveal ---------- */
  function revealCard() {
    if (reduced) return;
    anim($("#invite"), [{ opacity: 0, transform: "translateY(34px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 900, easing: E.out });
    $("#salute").querySelectorAll("span").forEach(function (s, i) {
      anim(s, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 380 + i * 90, easing: E.out, fill: "backwards" });
    });
    anim($("#card-headline"), [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: 720, easing: E.out, fill: "backwards" });
  }

  /* ---------- The No chase ---------- */
  var yes = $("#yes"), no = $("#no"), slot = $("#no-slot"), lineEl = $("#chase-line"), lbl = no.querySelector(".lbl");
  var taps = 0, pending = 0, flushT = null;
  var detached = false, busy = false, idling = false, gone = false, leftCount = 0, idleT = null, sheetOpen = false;
  var pos = { x: 0, y: 0 }, lastPointer = { x: -999, y: -999 };
  var DECK = { 1: [], 2: [], 3: [] }, LEFT_MAX = 2;
  NC.moves.forEach(function (m) { DECK[m.tier].push(m.id); if (m.max_per_session) LEFT_MAX = m.max_per_session; });
  var LINES = { 1: NC.lines.tier_1, 2: NC.lines.tier_2, 3: NC.lines.tier_3 };
  var RM_LABELS = NC.reduced_motion.labels, YG = NC.yes_growth;
  var bags = { 1: [], 2: [], 3: [] }, lastMove = null, recent = [];
  var NO = t("guest.card.no"), YES = t("guest.card.yes");

  function shuffleArr(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function tierFor(n) { var tr = NC.tiers; for (var i = tr.length - 1; i >= 0; i--) if (n >= tr[i].from_tap) return tr[i].tier; return 1; }
  function draw(tier) {
    if (!bags[tier].length) bags[tier] = shuffleArr(DECK[tier].filter(function (m) { return !(m === "left_the_chat" && leftCount >= LEFT_MAX); }));
    var m = bags[tier].pop();
    if (m === lastMove && bags[tier].length) { var other = bags[tier].pop(); bags[tier].push(m); m = other; }
    lastMove = m; return m;
  }
  function setLabel(s) { lbl.textContent = s; }
  function T() { return "translate(" + pos.x + "px," + pos.y + "px)"; }
  function setPos(x, y) { pos = { x: x, y: y }; no.style.transform = T(); }
  function size() { return { w: no.offsetWidth, h: no.offsetHeight }; }
  var M = NC.placement.edge_margin_px;
  function bounds(w, h) { return { w: w, h: h, minX: M, maxX: Math.max(M, innerWidth - w - M), minY: M, maxY: Math.max(M, innerHeight - h - M) }; }
  function hit(box, r, pad) { return !(box.x + box.w + pad < r.left || box.x - pad > r.right || box.y + box.h + pad < r.top || box.y - pad > r.bottom); }
  function pickSpot(w, h) {
    if (w == null) { var s = size(); w = s.w; h = s.h; }
    var b = bounds(w, h), yr = yes.getBoundingClientRect(), hr = $("#card-headline").getBoundingClientRect(), best = null, bestScore = -1;
    for (var i = 0; i < 48; i++) {
      var x = b.minX + Math.random() * (b.maxX - b.minX), y = b.minY + Math.random() * (b.maxY - b.minY), box = { x: x, y: y, w: w, h: h };
      if (hit(box, yr, 16) || hit(box, hr, 4)) continue;
      var dPtr = Math.hypot(x + w / 2 - lastPointer.x, y + h / 2 - lastPointer.y), dCur = Math.hypot(x - pos.x, y - pos.y);
      if (dPtr > 120 && dCur > 90) return { x: x, y: y };
      var score = Math.min(dPtr, 400) + Math.min(dCur, 300) / 2;
      if (score > bestScore) { bestScore = score; best = { x: x, y: y }; }
    }
    return best || { x: b.minX, y: b.minY };
  }
  function moveTo(x, y, dur, easing) { var from = T(); setPos(x, y); return anim(no, [{ transform: from }, { transform: T() }], { duration: dur || 280, easing: easing || E.spring }).finished; }
  function clampNo(animated) {
    var s = size(), b = bounds(s.w, s.h);
    var x = Math.min(Math.max(pos.x, b.minX), b.maxX), y = Math.min(Math.max(pos.y, b.minY), b.maxY);
    if (x === pos.x && y === pos.y) return Promise.resolve();
    return animated && !reduced ? moveTo(x, y, 220, E.out) : (setPos(x, y), Promise.resolve());
  }
  function detach() {
    if (detached) return;
    var r = no.getBoundingClientRect(), hadFocus = document.activeElement === no;
    slot.style.minHeight = r.height + "px";
    document.body.appendChild(no);
    no.classList.add("roaming");
    setPos(r.left, r.top);
    detached = true;
    if (hadFocus) no.focus({ preventScroll: true });
  }
  function hideNo(h) { if (detached) no.hidden = h; }
  function growYes() {
    var s = Math.min(1 + YG.per_tap_scale * taps, YG.max_scale);
    yes.style.transform = "scale(" + s.toFixed(3) + ")";
    yes.classList.toggle("glow", taps >= YG.glow_from_tap);
  }
  function setLine(tier) {
    var pool = LINES[tier].filter(function (l) { return recent.indexOf(l) < 0; });
    var l = pool[(Math.random() * pool.length) | 0] || LINES[tier][0];
    recent.push(l); if (recent.length > 3) recent.shift();
    lineEl.classList.remove("system"); lineEl.textContent = l;
    if (!reduced) anim(lineEl, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 260 });
  }
  function systemLine(s) { lineEl.classList.add("system"); lineEl.textContent = s; }
  // At most one request every 400 ms. A failed send keeps its taps for the next one.
  function record() {
    pending++;
    if (flushT) return;
    flushT = setTimeout(function flush() {
      var d = pending; pending = 0; flushT = null;
      if (!d) return;
      api("no-tap", { delta: d }).then(function (r) { if (r && typeof r.taps === "number" && r.taps > taps) { taps = r.taps; growYes(); } }).catch(function () {
        pending += d;
        if (!flushT) flushT = setTimeout(flush, 4000);
      });
    }, 400);
  }

  var MOVES = {
    hop: function () { var s = pickSpot(); return moveTo(s.x, s.y, 280, E.spring); },
    shy: function () {
      var tr = T();
      return anim(no, [{ transform: tr + " scale(1)" }, { transform: tr + " scale(.5)", offset: 0.25 }, { transform: tr + " scale(.5)", offset: 0.55 }, { transform: tr + " scale(1)" }], { duration: 900, easing: "ease-in-out" }).finished;
    },
    slide: function () {
      var s = size(), b = bounds(s.w, s.h), leftSide = pos.x + s.w / 2 < innerWidth / 2;
      var x = leftSide ? b.minX : b.maxX;
      if (Math.abs(x - pos.x) < 24) x = leftSide ? b.maxX : b.minX;
      var y = Math.min(Math.max(pos.y + (Math.random() * 160 - 80), b.minY), b.maxY);
      if (hit({ x: x, y: y, w: s.w, h: s.h }, yes.getBoundingClientRect(), 12)) y = y < innerHeight / 2 ? b.minY + 40 : b.maxY - 40;
      return moveTo(x, y, 420, E.out);
    },
    wink: async function () {
      setLabel(YES); var tr = T();
      await anim(no, [{ transform: tr }, { transform: tr + " rotate(-6deg)", offset: 0.2 }, { transform: tr + " rotate(4deg)", offset: 0.5 }, { transform: tr }], { duration: 1100 }).finished;
      setLabel(NO);
    },
    hide: function () {
      var yr = yes.getBoundingClientRect(), s = size(), b = bounds(s.w, s.h);
      var x = yr.right - s.w * 0.55;
      if (x > b.maxX) x = yr.left - s.w * 0.45;
      var y = yr.top + (yr.height - s.h) / 2;
      return moveTo(Math.min(Math.max(x, b.minX), b.maxX), Math.min(Math.max(y, b.minY), b.maxY), 600, E.out);
    },
    decoy: async function () {
      var fade = anim(no, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" });
      await fade.finished;
      var next = pickSpot(), ds = [];
      for (var i = 0; i < 3; i++) {
        var d = document.createElement("button");
        d.type = "button"; d.className = "decoy"; d.textContent = t("guest.chase.wrong_one"); d.tabIndex = -1; d.setAttribute("aria-hidden", "true");
        document.body.appendChild(d);
        var p = pickSpot(d.offsetWidth, d.offsetHeight); d._p = p;
        d.style.transform = "translate(" + p.x + "px," + p.y + "px)";
        anim(d, [{ transform: d.style.transform + " scale(0)" }, { transform: d.style.transform + " scale(1)" }], { duration: 280, delay: i * 90, easing: E.spring, fill: "backwards" });
        d.addEventListener("pointerdown", function (ev) { ev.preventDefault(); var el = ev.currentTarget; anim(el, [{ transform: el.style.transform + " scale(1)", opacity: 1 }, { transform: el.style.transform + " scale(0)", opacity: 0 }], { duration: 200, fill: "forwards" }); });
        ds.push(d);
      }
      await wait(1500);
      await Promise.all(ds.map(function (d) {
        return anim(d, [{ transform: "translate(" + d._p.x + "px," + d._p.y + "px)", opacity: 1 }, { transform: "translate(" + next.x + "px," + next.y + "px) scale(.4)", opacity: 0 }], { duration: 380, easing: E.inout, fill: "forwards" }).finished;
      }));
      ds.forEach(function (d) { d.remove(); });
      setPos(next.x, next.y);
      var pop = anim(no, [{ opacity: 0, transform: T() + " scale(.6)" }, { opacity: 1, transform: T() }], { duration: 280, easing: E.spring });
      fade.cancel();
      await pop.finished;
    },
    loading: async function () {
      setLabel(t("guest.chase.processing")); await clampNo(true);
      await wait(950);
      no.classList.add("err"); setLabel(t("guest.chase.not_found")); await clampNo(true);
      var tr = T();
      await anim(no, [{ transform: tr }, { transform: tr + " translateX(-5px)" }, { transform: tr + " translateX(5px)" }, { transform: tr + " translateX(-3px)" }, { transform: tr }], { duration: 320 }).finished;
      await wait(650);
      no.classList.remove("err"); setLabel(NO); clampNo(true);
    },
    gravity: function () {
      var s = size(), b = bounds(s.w, s.h), x = pos.x, y0 = pos.y, yb = b.maxY;
      var tr = function (y) { return "translate(" + x + "px," + y + "px)"; };
      var down = "cubic-bezier(.55,0,1,.45)", up = "cubic-bezier(0,.55,.45,1)";
      setPos(x, yb);
      return anim(no, [
        { transform: tr(y0), easing: down }, { transform: tr(yb), offset: 0.42, easing: up },
        { transform: tr(yb - 70), offset: 0.6, easing: down }, { transform: tr(yb), offset: 0.76, easing: up },
        { transform: tr(yb - 22), offset: 0.88, easing: down }, { transform: tr(yb) }
      ], { duration: 900 }).finished;
    },
    tired: async function () {
      no.classList.add("tired"); setLabel(t("guest.chase.tired")); await clampNo(true);
      var drop = document.createElement("span"); drop.className = "sweat"; no.appendChild(drop);
      var tr = T();
      await anim(no, [{ transform: tr }, { transform: tr + " translateY(5px) rotate(5deg)", offset: 0.25 }, { transform: tr + " translateY(5px) rotate(5deg)", offset: 0.8 }, { transform: tr }], { duration: 1600, easing: "ease-in-out" }).finished;
      drop.remove(); no.classList.remove("tired"); setLabel(NO); clampNo(true);
    },
    earthquake: async function () {
      haptic([30, 40, 30, 40, 30]);
      anim($("#invite"), [{ transform: "none" }, { transform: "translateX(-9px) rotate(-.6deg)" }, { transform: "translateX(8px) rotate(.5deg)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-2px)" }, { transform: "none" }], { duration: 620 });
      var x0 = pos.x, y0 = pos.y;
      var fall = anim(no, [{ transform: T() }, { transform: "translate(" + x0 + "px," + (y0 - 14) + "px) rotate(-8deg)", offset: 0.2 }, { transform: "translate(" + (x0 + 20) + "px," + (innerHeight + 40) + "px) rotate(40deg)" }], { duration: 560, easing: E.in, fill: "forwards" });
      await fall.finished;
      var s = pickSpot(); setPos(s.x, s.y);
      var climb = anim(no, [{ transform: "translate(" + s.x + "px," + (innerHeight + 40) + "px)" }, { transform: "translate(" + s.x + "px," + (s.y - 10) + "px)", offset: 0.75 }, { transform: T() }], { duration: 640, easing: E.out });
      fall.cancel();
      await climb.finished;
    },
    stamp: async function () {
      var st = document.createElement("div"); st.className = "stamp"; st.textContent = t("guest.chase.stamp"); st.setAttribute("aria-hidden", "true");
      document.body.appendChild(st);
      var s = size(), sx = pos.x + s.w / 2 - st.offsetWidth / 2, sy = pos.y + s.h / 2 - st.offsetHeight / 2, base = "translate(" + sx + "px," + sy + "px)";
      setTimeout(function () { haptic([20, 40, 20]); var tr = T(); anim(no, [{ transform: tr }, { transform: tr + " scale(.88)" }, { transform: tr }], { duration: 260 }); }, 220);
      await anim(st, [
        { transform: base + " scale(2.6) rotate(-4deg)", opacity: 0 }, { transform: base + " scale(1) rotate(-12deg)", opacity: 1, offset: 0.18 },
        { transform: base + " scale(1) rotate(-12deg)", opacity: 1, offset: 0.7 }, { transform: base + " translateY(-14px) scale(1.05) rotate(-12deg)", opacity: 0 }
      ], { duration: 1300, easing: E.out }).finished;
      st.remove();
    },
    left_the_chat: async function () {
      leftCount++;
      var bag = document.createElement("span"); bag.className = "bag"; no.appendChild(bag);
      var s = size(), right = pos.x + s.w / 2 > innerWidth / 2, tx = right ? innerWidth + 40 : -s.w - 40, frames = [];
      if (right) { bag.style.left = "auto"; bag.style.right = "-14px"; }
      for (var i = 0; i <= 10; i++) {
        var x = pos.x + (tx - pos.x) * i / 10;
        frames.push({ transform: "translate(" + x + "px," + (pos.y + (i % 2 ? -6 : 0)) + "px) rotate(" + (i % 2 ? (right ? 5 : -5) : 0) + "deg)" });
      }
      var walk = anim(no, frames, { duration: 1500, easing: "linear", fill: "forwards" });
      await walk.finished;
      bag.remove();
      gone = true; systemLine(t("guest.chase.left"));
      await wait(3000 + Math.random() * 3000);
      if (!gone) { walk.cancel(); return; }
      returnNo(walk);
    }
  };
  async function returnNo(walk) {
    var p = pickSpot(); setPos(p.x, p.y);
    var back = anim(no, [{ transform: T() + " scale(0)", opacity: 0 }, { transform: T() + " scale(1.1)", opacity: 1, offset: 0.7 }, { transform: T() }], { duration: 420, easing: "ease-out" });
    if (walk) walk.cancel();
    gone = false; systemLine(t("guest.chase.back"));
    await back.finished;
  }

  async function onNo(ev) {
    if (busy || gone || sheetOpen || seq || current !== "s-card") return;
    if (ev && ev.clientX != null) lastPointer = { x: ev.clientX, y: ev.clientY };
    else { var r = no.getBoundingClientRect(); lastPointer = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    // A tap during an idle fidget interrupts it: every tap counts and gets its own move.
    if (idling) { idling = false; no.getAnimations().forEach(function (a) { a.cancel(); }); no.style.transform = T(); }
    taps++; record(); growYes();
    var tier = tierFor(taps);
    haptic(tier === 3 ? NC.haptics.tier_3_pattern_ms : NC.haptics.pattern_ms);
    if (reduced) { setLabel(RM_LABELS[(taps - 1) % RM_LABELS.length]); setLine(tier); return; }
    setLine(tier);
    detach();
    busy = true; clearTimeout(idleT);
    try { await MOVES[draw(tier)](); } catch (e) { /* a move that fails still leaves No unpressable */ }
    busy = false;
    scheduleIdle();
  }
  var lastPress = 0;
  no.addEventListener("pointerdown", function (e) { e.preventDefault(); lastPress = Date.now(); onNo(e); });
  no.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !busy) { lastPress = Date.now(); onNo(e); } });
  // Keyboard and screen readers: Enter or Space fires click, which only ever runs the chase.
  no.addEventListener("click", function (e) {
    e.preventDefault();
    if (Date.now() - lastPress > 700) {
      var live = $("#sr-live"); live.textContent = "";
      setTimeout(function () { live.textContent = NC.screen_reader.on_activate_announce; }, 30);
      onNo(null);
    }
  });
  // "Left the chat": on the next tap anywhere, No reappears somewhere new.
  document.addEventListener("pointerdown", function (e) { if (gone && current === "s-card" && !sheetOpen && e.target !== yes) returnNo(null); });

  function scheduleIdle() {
    clearTimeout(idleT);
    if (reduced || !detached || taps < NC.idle.only_after_tap) return;
    var span = (NC.idle.max_seconds - NC.idle.min_seconds) * 1000;
    idleT = setTimeout(async function () {
      if (busy || idling || gone || sheetOpen || current !== "s-card") { scheduleIdle(); return; }
      idling = true;
      var s = size(), b = bounds(s.w, s.h), x = Math.min(Math.max(pos.x + (Math.random() * 90 - 45), b.minX), b.maxX), y = Math.min(Math.max(pos.y + (Math.random() * 90 - 45), b.minY), b.maxY);
      if (Math.random() < 0.5 || hit({ x: x, y: y, w: s.w, h: s.h }, yes.getBoundingClientRect(), 12)) {
        var tr = T();
        await anim(no, [{ transform: tr }, { transform: tr + " rotate(-7deg)", offset: 0.2 }, { transform: tr + " rotate(6deg)", offset: 0.45 }, { transform: tr + " rotate(-3deg)", offset: 0.7 }, { transform: tr }], { duration: 650 }).finished;
      } else {
        await moveTo(x, y, 900, E.inout);
      }
      if (!idling) return; // a tap took over
      idling = false; scheduleIdle();
    }, NC.idle.min_seconds * 1000 + Math.random() * span);
  }
  window.addEventListener("resize", function () { if (detached && !gone) clampNo(false); });

  /* ---------- Yes and the transfer ---------- */
  var sheet = $("#sheet"), sheetPanel = sheet.querySelector(".sheet"), sentStep = 0, holdT = null, sheetPayment = null, yesBusy = false;
  yes.addEventListener("click", async function () {
    if (seq || yesBusy) return;
    clearTimeout(idleT);
    haptic(24);
    yesBusy = true; yes.setAttribute("aria-busy", "true"); yes.classList.add("pending");
    var press = reduced ? Promise.resolve() : anim(yes, [{ transform: yes.style.transform || "scale(1)" }, { transform: (yes.style.transform || "scale(1)") + " translateY(-3px) scale(1.04)" }, { transform: yes.style.transform || "scale(1)" }], { duration: 300, easing: E.out }).finished;
    var r;
    var done = function () { yesBusy = false; yes.removeAttribute("aria-busy"); yes.classList.remove("pending"); };
    try { r = await api("yes", {}); } catch (e) { done(); toast(t("guest.network")); return; }
    await press; done();
    if (r.state) state = r.state;
    if (r.kind === "payment") { openSheet(r.payment, false); return; }
    if (r.kind === "covered") { RENDER.covered(r.state); go("s-covered"); return; }
    if (r.kind === "paid") { landed(r.state); return; }
    if (r.kind === "no_account") { toast(t("guest.transfer.no_account")); return; }
    if (r.state) route(r.state);
  });
  function rowHTML(k, v, copyVal, label, cls) {
    return '<div class="row' + (cls ? " " + cls : "") + '"><div><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + "</div></div>" +
      (copyVal ? '<button class="copy" type="button" data-copy="' + esc(copyVal) + '" aria-label="' + esc(t("guest.transfer.copy") + " " + label) + '">' + esc(t("guest.transfer.copy")) + "</button>" : "") + "</div>";
  }
  function renderHold() {
    var ends = holdEnds(state);
    $("#held").innerHTML = ends ? icon("clock") + "<span>" + esc(t("guest.transfer.held_chip", { time_left: left(ends - Date.now()) })) + "</span>" : "";
    $("#held").hidden = !ends;
    $("#hold-line").textContent = ends ? t("guest.transfer.hold_line", { time_left: left(ends - Date.now()) }) : "";
    $("#hold-line").hidden = true;
  }
  function openSheet(p, atSentStep) {
    sheetPayment = p;
    var parts = state && state.parts;
    $("#rows").innerHTML =
      (parts && parts.paid ? rowHTML(t("guest.transfer.paid_so_far_label"), parts.paid, null, "", "so-far") : "") +
      rowHTML(t("guest.transfer.amount_label"), p.amount, p.amount_digits, t("guest.transfer.amount_label"), "amt") +
      rowHTML(t("guest.transfer.bank_label"), p.bank) +
      rowHTML(t("guest.transfer.account_number_label"), p.account_number_display, p.account_number, t("guest.transfer.account_number_label")) +
      rowHTML(t("guest.transfer.account_name_label"), p.account_name) +
      rowHTML(t("guest.transfer.reference_label"), p.reference, p.reference, t("guest.transfer.reference_label"), "ref");
    $("#refund").textContent = t("guest.transfer.refund_line", { refund_rule: (state && state.event && state.event.refund) || t("guest.transfer.refund_default") });
    if (p.sender_name) $("#sender").value = p.sender_name;
    $("#btn-ask").textContent = t("guest.transfer.ask_inviter", { inviter: (state && state.inviter) || "" });
    $("#sheet-error").hidden = true;
    setupParts(p);
    sheetOpen = true; sheet.hidden = false;
    renderHold(); clearInterval(holdT); holdT = setInterval(renderHold, 30000);
    setSentStep(atSentStep ? 1 : 0);
    if (!reduced) {
      anim($("#scrim"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      anim(sheetPanel, [{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 500, easing: E.out });
    }
    $("#sheet-title").focus({ preventScroll: true });
  }
  async function closeSheet() {
    clearInterval(holdT);
    if (!reduced) {
      anim($("#scrim"), [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" });
      var a = anim(sheetPanel, [{ transform: "none" }, { transform: "translateY(100%)" }], { duration: 320, easing: E.in, fill: "forwards" });
      await a.finished;
      sheet.hidden = true;
      sheet.querySelectorAll("*").forEach(function (el) { if (el.getAnimations) el.getAnimations().forEach(function (x) { x.cancel(); }); });
      if ($("#scrim").getAnimations) $("#scrim").getAnimations().forEach(function (x) { x.cancel(); });
    } else sheet.hidden = true;
    sheetOpen = false; scheduleIdle();
    yes.focus({ preventScroll: true });
  }
  function setSentStep(n) {
    sentStep = n;
    $("#sent-step").hidden = n === 0;
    $("#sender-error").hidden = true;
    $("#btn-sent").textContent = n === 0 ? t("guest.transfer.sent_button") : t("guest.transfer.confirm_sent");
    // Asking the inviter is a choice before the transfer, not after the guest says they sent it.
    $("#btn-ask").hidden = n !== 0 || !(state && state.inviter);
    if (n === 1) setTimeout(function () { $("#sender").focus(); }, 60);
  }
  $("#rows").addEventListener("click", function (e) {
    var b = e.target.closest(".copy"); if (!b) return;
    copyText(b.getAttribute("data-copy"), b);
  });
  var claiming = false;
  $("#btn-sent").addEventListener("click", async function () {
    if (partMode && partAmount() == null) { partError(); return; }
    if (sentStep === 0) { setSentStep(1); return; }
    if (claiming || asking) return;
    var name = $("#sender").value.trim();
    if (name.length < 2) { $("#sender-error").hidden = false; $("#sender").setAttribute("aria-invalid", "true"); $("#sender").focus(); return; }
    $("#sender").removeAttribute("aria-invalid");
    claiming = true; working($("#btn-sent"), true);
    var r;
    var body = { sender_name: name };
    if (partMode) body.amount = String(partAmount());
    try { r = await api("claim", body); } catch (e) {
      claiming = false; working($("#btn-sent"), false);
      $("#sheet-error").textContent = t("guest.network"); $("#sheet-error").hidden = false; return;
    }
    claiming = false; working($("#btn-sent"), false);
    if (r && r.error === "amount") { if (r.state) state = r.state; setupParts(sheetPayment, true); partError(); return; }
    await closeSheet();
    route(r.state);
  });
  // Leaving the transfer sheet without paying goes to the screen the server says this guest is on:
  // a saved seat, a transfer that wasn't found, and so on. Never back to Yes or No once they said Yes.
  async function leaveSheet() {
    await closeSheet();
    if (state && state.screen && state.screen !== "card") { route(state); return true; }
    return false;
  }
  $("#btn-later").addEventListener("click", async function () {
    if (await leaveSheet()) return;
    var note = $("#later-note"), ends = holdEnds(state);
    note.textContent = t("guest.transfer.not_now_note", { expires_at: ends ? fmtShort(ends) : "" });
    note.hidden = false;
    if (!reduced) anim(note, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  });
  // The guest says their inviter is paying. The server records it; the guest sends the WhatsApp line.
  var asking = false;
  $("#btn-ask").addEventListener("click", async function () {
    if (asking || claiming) return;
    var b = this; asking = true; working(b, true);
    var r;
    try { r = await api("ask-inviter", { ask: true }); } catch (e) {
      asking = false; working(b, false);
      $("#sheet-error").textContent = t("guest.network"); $("#sheet-error").hidden = false; return;
    }
    asking = false; working(b, false);
    await closeSheet();
    if (r && r.state) route(r.state);
  });
  $("#scrim").addEventListener("click", leaveSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheetOpen) leaveSheet(); });
  $("#held-pay").addEventListener("click", function () { continueToPay(this); });
  // Back to paying: the open transfer if there is one, or a fresh one for what is left after a part payment.
  var continuing = false;
  async function continueToPay(btn) {
    if (state && state.payment && state.payment.status === "open") { openSheet(state.payment, false); return; }
    if (continuing) return;
    continuing = true; working(btn, true);
    var r;
    try { r = await api("yes", {}); } catch (e) { continuing = false; working(btn, false); toast(t("guest.network")); return; }
    continuing = false; working(btn, false);
    if (r.state) state = r.state;
    if (r.kind === "payment") openSheet(r.payment, false);
    else if (r.kind === "no_account") toast(t("guest.transfer.no_account"));
    else if (r.state) route(r.state);
  }

  /* ---------- Pay small small ---------- */
  var partMode = false;
  function groupDigits(d) { return String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function partAmount() {
    var parts = state && state.parts, n = Number(($("#part-amount").value || "").replace(/\D/g, ""));
    if (!parts || !n) return null;
    return n >= Number(parts.min_digits) && n <= Number(parts.balance_digits) ? n : null;
  }
  function partError() {
    var parts = state.parts, el = $("#part-error");
    el.textContent = t("guest.transfer.part_error", { min: parts.min, balance: parts.balance }); el.hidden = false;
    $("#part-amount").setAttribute("aria-invalid", "true"); $("#part-amount").focus();
  }
  // The Amount row shows what the guest is sending now, and its Copy button copies those digits.
  function showAmount(text, digits) {
    var row = $("#rows .amt"); if (!row) return;
    row.querySelector(".v").textContent = text;
    var b = row.querySelector(".copy"); if (b) b.setAttribute("data-copy", digits);
  }
  function setPartMode(on) {
    partMode = on;
    $("#part-step").hidden = !on;
    $("#part-toggle").textContent = on ? t("guest.transfer.part_full") : t("guest.transfer.part_toggle");
    $("#part-toggle").setAttribute("aria-expanded", on ? "true" : "false");
    $("#part-error").hidden = true; $("#part-amount").removeAttribute("aria-invalid");
    var n = on ? partAmount() : null;
    if (n) showAmount("₦" + groupDigits(n), String(n));
    else if (sheetPayment) showAmount(sheetPayment.amount, sheetPayment.amount_digits);
    if (on) setTimeout(function () { $("#part-amount").focus(); }, 60);
  }
  function setupParts(p, keep) {
    var parts = state && state.parts;
    $("#parts").hidden = !parts;
    if (!parts) { partMode = false; return; }
    $("#part-help").textContent = t("guest.transfer.part_help", { min: parts.min, balance: parts.balance });
    if (!keep) { $("#part-amount").value = ""; setPartMode(false); }
  }
  $("#part-toggle").addEventListener("click", function () { setPartMode(!partMode); });
  $("#part-amount").addEventListener("input", function () {
    var el = this, d = el.value.replace(/\D/g, "").slice(0, 9);
    el.value = d ? groupDigits(d) : "";
    $("#part-error").hidden = true; el.removeAttribute("aria-invalid");
    var n = partAmount();
    if (n) showAmount("₦" + groupDigits(n), String(n));
    else if (sheetPayment) showAmount(sheetPayment.amount, sheetPayment.amount_digits);
  });

  /* ---------- Not found and covered ---------- */
  $("#nf-retry").addEventListener("click", async function () {
    var b = this; if (b.disabled) return; working(b, true);
    try {
      var r = await api("claim", { sender_name: (state.payment && state.payment.sender_name) || "" });
      route(r.state);
    } catch (e) { toast(t("guest.network")); }
    working(b, false);
  });
  $("#nf-details").addEventListener("click", function () {
    var s = Object.assign({}, state, { screen: "card" });
    route(s).then(function () { if (s.payment) openSheet(s.payment, false); });
  });
  $("#cov-open").addEventListener("click", function () { landed(state); });

  /* ---------- Asked the inviter ---------- */
  $("#asked-self").addEventListener("click", async function () {
    var b = this; if (b.disabled) return; working(b, true);
    var r;
    try { r = await api("ask-inviter", { ask: false }); } catch (e) { working(b, false); toast(t("guest.network")); return; }
    working(b, false);
    var s = r && r.state;
    if (!s) return;
    // Straight back to the transfer sheet, with the same reference and account as before.
    route(s).then(function () { if ((s.screen === "card" || s.screen === "held") && s.payment) openSheet(s.payment, false); });
  });

  async function landed(s) {
    if (seq) return;
    seq = true;
    haptic([20, 60, 20]);
    if (!reduced && (current === "s-wait" || current === "s-asked" || current === "s-held" || current === "s-covered")) {
      var seal = document.querySelector("#" + current + " .seal");
      anim(seal, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.7)", opacity: 0 }], { duration: 560, easing: E.in, fill: "forwards" });
      await wait(260);
    }
    confetti();
    seq = false;
    await route(s, { flip: true });
  }

  /* ---------- The premium card ---------- */
  var ticket = $("#ticket"), fitCtx = null;
  // Long names (Oluwaseyifunmi, Chukwuemeka) shrink to one line instead of breaking mid-word.
  function fitName() {
    var el = $("#t-name"); if (!el) return;
    el.style.fontSize = "";
    var max = parseFloat(getComputedStyle(el).fontSize) || 88, avail = el.clientWidth * 0.94;
    if (!avail || !el.textContent) return;
    fitCtx = fitCtx || document.createElement("canvas").getContext("2d");
    fitCtx.font = "700 " + max + "px Tangerine";
    var w = fitCtx.measureText(el.textContent).width;
    if (w > avail) el.style.fontSize = Math.max(40, Math.floor(max * avail / w)) + "px";
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (current === "s-ticket") fitName(); });
  window.addEventListener("resize", function () { if (current === "s-ticket") fitName(); });
  function flipTicket(animate) {
    var scene = $("#ticket-scene");
    var back = ticket.querySelector(".t-back");
    if (reduced || !animate) { ticket.style.transform = "rotateY(180deg)"; back.classList.add("gone"); scene.classList.add("landed"); foilLoop(); return; }
    scene.classList.remove("landed"); back.classList.remove("gone");
    ticket.style.transform = "rotateY(0deg)";
    setTimeout(function () { back.classList.add("gone"); }, 380 + 500);
    setTimeout(function () {
      var a = anim(ticket, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], { duration: 1000, easing: E.inout, fill: "forwards" });
      a.finished.then(function () {
        ticket.style.transform = "rotateY(180deg)"; a.cancel(); scene.classList.add("landed");
        anim($("#t-name"), [{ backgroundPosition: "100% 0" }, { backgroundPosition: "0% 0" }], { duration: 1000, easing: E.out });
        anim($("#qr"), [{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: 500, easing: E.out, fill: "backwards" });
        foilLoop();
      });
    }, 380);
  }
  var foilAnim = null;
  function foilLoop() {
    if (reduced || foilAnim) return;
    foilAnim = anim($("#foil"), [{ transform: "translateX(0) skewX(-18deg)", offset: 0 }, { transform: "translateX(460%) skewX(-18deg)", offset: 0.34 }, { transform: "translateX(460%) skewX(-18deg)", offset: 1 }], { duration: 5200, iterations: Infinity, easing: "ease-in-out" });
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "invite"; }
  function download(name, blob) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $("#add-cal").addEventListener("click", function () {
    var s = state;
    if (!s.event.starts_at) { toast(t("guest.ticket.calendar_locked")); return; }
    var start = Date.parse(s.event.starts_at), ev = s.event;
    var z = function (ts) { return new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var icsText = function (v) { return String(v).replace(/\\/g, "\\\\").replace(/[,;]/g, function (c) { return "\\" + c; }).replace(/\n/g, "\\n"); };
    // One calendar entry per day, each at the same start time, with that day's name and dress code.
    var days = ev.days && ev.days.length ? ev.days : [{ name: ev.name, dress: ev.dress }];
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + icsText(ev.name) + "//Invite//EN"];
    days.forEach(function (d, i) {
      var at = start + i * 24 * 3600e3;
      lines.push("BEGIN:VEVENT", "UID:" + (s.ticket_code || "card") + "-" + (i + 1) + "@invite", "DTSTAMP:" + z(Date.now()), "DTSTART:" + z(at), "DTEND:" + z(at + 5 * 3600e3),
        "SUMMARY:" + icsText(d.name || ev.name));
      if (ev.venue) lines.push("LOCATION:" + icsText(ev.venue + (ev.venue_address ? ", " + ev.venue_address : "")));
      lines.push("DESCRIPTION:" + icsText(t("guest.ticket.invited_by", { inviter: s.inviter }) + (d.dress ? ". " + t("guest.card.dress_label") + ": " + d.dress : "")), "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    download(slug(s.event.name) + ".ics", new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  });
  $("#save-card").addEventListener("click", function () {
    var b = $("#save-card"); if (b.disabled) return; working(b, true);
    saveCard().catch(function () { toast(t("guest.network")); }).then(function () { working(b, false); });
  });

  function loadSvg(svg) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(new Blob([svg.replace("<svg ", '<svg width="600" height="600" ')], { type: "image/svg+xml" }));
      var img = new Image(); img.onload = function () { res(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }; img.onerror = rej; img.src = url;
    });
  }
  async function saveCard() {
    var s = state; if (document.fonts && document.fonts.ready) await document.fonts.ready;
    var W = 1080, STUB = 440, VX = 330, VW = W - 90 - VX;
    var css = getComputedStyle(document.documentElement), v = function (n) { return css.getPropertyValue(n).trim(); };
    var UI = "'Urbanist', 'Plus Jakarta Sans'";
    // Measure first, so the card is exactly as tall as what is on it.
    var m = document.createElement("canvas").getContext("2d");
    var wrap = function (text, font, width) {
      m.font = font; var words = String(text || "").split(/\s+/), lines = [], line = "";
      words.forEach(function (w) { var next = line ? line + " " + w : w; if (line && m.measureText(next).width > width) { lines.push(line); line = w; } else line = next; });
      if (line) lines.push(line);
      return lines;
    };
    var ev = s.event, VALUE = "400 40px " + UI, SMALL = "400 30px " + UI, BOLD = "600 36px " + UI, rows = [];
    var add = function (label, parts) { rows.push({ label: label, parts: parts }); };
    var DATE = "400 34px " + UI;
    add(t("guest.card.date_label"), [{ font: DATE, color: "--mist-100", lines: wrap(ev.date || t("guest.card.date_hidden"), DATE, VW) }]);
    var where = [{ font: VALUE, color: "--mist-100", lines: wrap(ev.venue || t("guest.card.venue_hidden", { venue_reveal_hint: ev.venue_hint }), VALUE, VW) }];
    if (ev.venue && ev.venue_address) where.push({ font: SMALL, color: "--mist-400", lines: wrap(ev.venue_address, SMALL, VW) });
    add(t("guest.card.venue_label"), where);
    var DAY_PAD = 60;
    if (ev.days && ev.days.length && ev.days_differ) {
      var dayParts = [];
      ev.days.forEach(function (d, i) {
        dayParts.push({ font: BOLD, color: "--mist-100", lines: wrap(d.name, BOLD, VW - DAY_PAD), gap: i ? 22 : 0, num: d.number || i + 1 });
        if (d.dress) dayParts.push({ font: SMALL, color: "--mist-400", lines: wrap(t("guest.card.day_dress", { dress: d.dress }), SMALL, VW - DAY_PAD), indent: DAY_PAD });
      });
      add(t("guest.card.days_label"), dayParts);
    } else if (ev.dress) add(t("guest.card.dress_label"), [{ font: VALUE, color: "--mist-100", lines: wrap(ev.dress, VALUE, VW) }]);
    var lineH = function (font) { return parseInt(/(\d+)px/.exec(font)[1], 10) * 1.3; };
    var subtitle = ev.card && ev.card.subtitle, SUB = "italic 400 32px " + UI, OFF = subtitle ? 50 : 0;
    var rowsTop = 606 + OFF, y = rowsTop;
    rows.forEach(function (r) { r.y = y; r.parts.forEach(function (p) { y += (p.gap || 0) + p.lines.length * lineH(p.font); }); y += 46; });
    var NOTE = "italic 400 34px " + UI, note = ev.card && ev.card.note ? wrap(ev.card.note, NOTE, W - 180) : [], noteY = y + 10;
    y += note.length ? note.length * lineH(NOTE) + 24 : 0;
    var Hh = Math.max(1160, Math.round(y + 30 + STUB));

    var c = document.createElement("canvas"); c.width = W; c.height = Hh;
    var x = c.getContext("2d");
    var rr = function (X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
    var g = x.createRadialGradient(W / 2, -200, 50, W / 2, 0, Hh * 1.1);
    g.addColorStop(0, v("--green-650")); g.addColorStop(0.55, v("--green-900")); g.addColorStop(1, v("--green-950"));
    rr(0, 0, W, Hh, 60); x.fillStyle = g; x.fill();
    x.save(); x.globalCompositeOperation = "destination-out";
    [0, W].forEach(function (cx) { x.beginPath(); x.arc(cx, Hh - STUB, 34, 0, Math.PI * 2); x.fill(); });
    x.restore();
    x.strokeStyle = "rgba(200,162,74,.6)"; x.lineWidth = 3; rr(2, 2, W - 4, Hh - 4, 58); x.stroke();
    x.strokeStyle = "rgba(200,162,74,.28)"; x.lineWidth = 2; rr(28, 28, W - 56, Hh - STUB - 56, 36); x.stroke();
    var track = function (px) { if ("letterSpacing" in x) x.letterSpacing = px; };
    x.textBaseline = "alphabetic";
    x.fillStyle = v("--gold-400"); x.font = "600 30px " + UI; track("5px");
    x.textAlign = "left"; x.fillText(ev.name.toUpperCase(), 90, 132);
    x.textAlign = "right"; x.fillText(t("guest.ticket.admits").toUpperCase(), W - 90, 132); x.textAlign = "left"; track("0px");
    if (subtitle) { x.fillStyle = v("--mist-400"); x.font = SUB; x.fillText(subtitle, 90, 186); }
    var size = 260; x.font = "700 " + size + "px 'Tangerine'"; while (x.measureText(s.guest).width > W - 200 && size > 96) { size -= 8; x.font = "700 " + size + "px 'Tangerine'"; }
    var fg = x.createLinearGradient(90, 0, 90 + x.measureText(s.guest).width, 0);
    fg.addColorStop(0, v("--foil-dark")); fg.addColorStop(0.36, v("--foil-light")); fg.addColorStop(0.54, v("--gold-500")); fg.addColorStop(0.74, v("--gold-300")); fg.addColorStop(1, v("--foil-dark"));
    x.fillStyle = fg; x.fillText(s.guest, 90, 340 + OFF);
    x.fillStyle = v("--gold-300"); x.font = "700 84px 'Tangerine'"; x.fillText(t("guest.ticket.invited_by", { inviter: s.inviter }), 90, 462 + OFF);
    x.fillStyle = "rgba(200,162,74,.3)"; x.fillRect(90, 516 + OFF, W - 180, 2);
    rows.forEach(function (r) {
      x.fillStyle = v("--mist-400"); x.font = "600 26px " + UI; track("4px"); x.fillText(r.label.toUpperCase(), 90, r.y); track("0px");
      var yy = r.y + 4;
      r.parts.forEach(function (p) {
        yy += p.gap || 0;
        if (p.num) {
          // The day's number in a filled circle, like the card.
          x.fillStyle = v("--gold-500"); x.beginPath(); x.arc(VX + 22, yy - 12, 22, 0, Math.PI * 2); x.fill();
          x.fillStyle = v("--ink-900"); x.font = "700 24px " + UI; x.textAlign = "center"; x.fillText(String(p.num), VX + 22, yy - 3); x.textAlign = "left";
        }
        x.fillStyle = v(p.color); x.font = p.font;
        var px = VX + (p.num || p.indent ? DAY_PAD : 0);
        p.lines.forEach(function (l, i) { x.fillText(l, px, yy + i * lineH(p.font)); });
        yy += p.lines.length * lineH(p.font);
      });
    });
    if (note.length) { x.fillStyle = v("--gold-300"); x.font = NOTE; note.forEach(function (l, i) { x.fillText(l, 90, noteY + i * lineH(NOTE)); }); }
    x.setLineDash([14, 12]); x.strokeStyle = "rgba(200,162,74,.4)"; x.lineWidth = 3;
    x.beginPath(); x.moveTo(60, Hh - STUB); x.lineTo(W - 60, Hh - STUB); x.stroke(); x.setLineDash([]);
    var qx = 90, qy = Hh - STUB + 70, qs = 300;
    rr(qx, qy, qs, qs, 26); x.fillStyle = v("--cream-50"); x.fill();
    if (s.qr) { try { var img = await loadSvg(s.qr); x.drawImage(img, qx + 20, qy + 20, qs - 40, qs - 40); } catch (e) {} }
    var note = t("guest.ticket.qr_note").split(". ");
    x.fillStyle = v("--mist-100"); x.font = "600 40px " + UI; x.fillText(t("guest.ticket.qr_caption"), 450, qy + 80);
    x.fillStyle = v("--mist-400"); x.font = "400 30px " + UI; x.fillText(note[0] + (note[1] ? "." : ""), 450, qy + 134); x.fillText(note[1] || "", 450, qy + 176);
    x.fillStyle = v("--gold-400"); x.font = "600 30px ui-monospace, Menlo, monospace"; track("4px"); x.fillText(s.ticket_code || "", 450, qy + 250);
    var blob = await new Promise(function (res) { c.toBlob(res, "image/png"); });
    showSaved(blob, slug(ev.name) + "-card-" + slug(s.guest) + ".png");
  }
  // In-app browsers often drop downloads, so the card opens as an image the guest can press and hold.
  function showSaved(blob, name) {
    var url = URL.createObjectURL(blob), w = document.createElement("div");
    w.className = "overlay center sheet-root";
    w.innerHTML = '<div class="scrim"></div><div class="dialog saved-card" role="dialog" aria-modal="true" aria-labelledby="sv-t"><h2 id="sv-t">' + esc(t("guest.ticket.save_title")) + "</h2>" +
      '<img src="' + url + '" alt="' + esc(t("guest.ticket.save_title")) + '"><p>' + esc(t("guest.ticket.save_hint")) + "</p>" +
      '<div class="actions"><a class="btn btn-ghost btn-sm" href="' + url + '" download="' + esc(name) + '">' + esc(t("guest.ticket.save_download")) + '</a><button class="btn btn-gold btn-sm" type="button" data-x>' + esc(t("guest.ticket.save_done")) + "</button></div></div>";
    document.body.appendChild(w);
    var close = function () { w.remove(); document.removeEventListener("keydown", onKey); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); $("#save-card").focus(); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    w.querySelector(".scrim").addEventListener("click", close);
    w.querySelector("[data-x]").addEventListener("click", close);
    w.querySelector("[data-x]").focus();
  }

  /* ---------- Confetti: gold, 60 pieces at most ---------- */
  function confetti() {
    if (reduced) return;
    var c = $("#confetti"); c.hidden = false;
    var css = getComputedStyle(document.documentElement), v = function (n) { return css.getPropertyValue(n).trim(); };
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, Hh = innerHeight;
    c.width = W * dpr; c.height = Hh * dpr; c.style.width = W + "px"; c.style.height = Hh + "px";
    var x = c.getContext("2d"); x.scale(dpr, dpr);
    var colors = [v("--gold-500"), v("--gold-300"), v("--gold-400"), v("--cream-100"), v("--foil-dark")], P = [];
    var max = parseInt(v("--confetti-max-pieces"), 10) || 60;
    for (var i = 0; i < max; i++) P.push({ x: W / 2 + (Math.random() * 80 - 40), y: Hh * 0.42, vx: Math.random() * 12 - 6, vy: -(Math.random() * 11 + 5), w: Math.random() * 5 + 5, h: Math.random() * 3 + 3, r: Math.random() * 6, vr: Math.random() * 0.3 - 0.15, c: colors[i % colors.length] });
    var start = performance.now();
    (function frame(now) {
      var el = now - start; x.clearRect(0, 0, W, Hh);
      P.forEach(function (p) { p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.globalAlpha = Math.max(0, 1 - el / 1500); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); });
      if (el < 1500) requestAnimationFrame(frame); else { x.clearRect(0, 0, W, Hh); c.hidden = true; }
    })(start);
  }

  /* ---------- Waiting: poll every 10 seconds while visible ---------- */
  var polling = false;
  function refresh() {
    if (seq || polling || !state || document.hidden) return;
    if (current !== "s-wait" && current !== "s-asked" && current !== "s-held" && current !== "s-card" && current !== "s-notfound") return;
    polling = true;
    api("state").then(function (s) {
      polling = false;
      if ((current === "s-wait" || current === "s-asked" || current === "s-held") && s.screen === "ticket") { if (sheetOpen) closeSheet(); landed(s); return; }
      if (s.screen === state.screen) { state = s; return; }
      if (current === "s-card" && (s.screen === "card" || sheetOpen)) { state = s; return; }
      if (sheetOpen) closeSheet();
      route(s);
    }).catch(function () { polling = false; });
  }
  setInterval(refresh, 10000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });

  /* ---------- Start ---------- */
  var initial = JSON.parse($("#oy-state").textContent);
  route(initial, { arrive: true, flip: false });
})();
