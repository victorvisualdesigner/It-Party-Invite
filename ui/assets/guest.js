/*
  The guest page. One route, every guest state. Ports prototype/guest.html faithfully
  (envelope, seal crack, card reveal, every No chase move, transfer sheet, waiting state,
  card turning over) and reads all state from the stand-in backend in store.js.
*/
(function () {
  "use strict";
  var K = window.OYKit, OY = window.OY, t = K.t, esc = K.esc, anim = K.anim, wait = K.wait, haptic = K.haptic, reduced = K.reduced, E = K.EASE;
  var $ = function (s) { return document.querySelector(s); };
  var TOK = new URLSearchParams(location.search).get("t") || (location.hash.match(/t=([\w-]+)/) || [])[1] || "";
  var NC = K.C.noChase;
  var state = null, current = null, seq = false, quiet = 0;

  function act(fn) { quiet++; try { return fn(); } finally { quiet--; } }

  /* ---------- Static copy and art ---------- */
  document.querySelectorAll("[data-t]").forEach(function (el) { el.textContent = t(el.getAttribute("data-t")); });
  $("#phone").placeholder = t("guest.lock.phone_placeholder");
  $("#key").placeholder = t("guest.lock.key_placeholder");
  $("#sender").placeholder = t("guest.transfer.sender_name_placeholder");
  $("#save-card").innerHTML = K.icon("image") + "<span>" + esc(t("guest.ticket.save_image")) + "</span>";
  $("#add-cal").innerHTML = K.icon("calendar") + "<span>" + esc(t("guest.ticket.add_calendar")) + "</span>";
  $("#steps").innerHTML = t("guest.transfer.steps").map(function (s, i) { return "<li><b>" + (i + 1) + "</b><span>" + esc(s) + "</span></li>"; }).join("");
  var mark = t("guest.lock.envelope_mark");
  $("#env-lock").innerHTML = K.envelopeHTML({ mark: mark });
  $("#env-rest").innerHTML = K.envelopeHTML({ mark: mark, dim: true });
  $("#env-stranger").innerHTML = K.envelopeHTML({ mark: mark });
  $("#env-claimed").innerHTML = K.envelopeHTML({ mark: mark, dim: true });
  $("#env-wait").innerHTML = K.envelopeHTML({ glow: true });
  $("#env-notfound").innerHTML = K.envelopeHTML({ mark: mark });
  $("#env-covered").innerHTML = K.envelopeHTML({ glow: true });
  $("#t-seal").innerHTML = K.sealHTML();
  if (/(FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\))/i.test(navigator.userAgent)) $("#inapp").hidden = false;
  $("#inapp-open").addEventListener("click", function (e) {
    e.preventDefault();
    var u = location.href.replace(/^https?:\/\//, "");
    location.href = /Android/i.test(navigator.userAgent) ? "intent://" + u + "#Intent;scheme=https;package=com.android.chrome;end" : location.href;
  });

  /* ---------- Screens ---------- */
  var SCREEN = { lock: "s-lock", rest: "s-rest", stranger: "s-stranger", claimed: "s-claimed", card: "s-card", wait: "s-wait", notfound: "s-notfound", covered: "s-covered", ticket: "s-ticket", expired: "s-ended", cancelled: "s-ended", closed: "s-ended" };
  function go(id) {
    var from = current && document.getElementById(current), to = document.getElementById(id);
    if (from === to) return Promise.resolve();
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
  function route(s, opts) {
    opts = opts || {};
    state = s;
    (RENDER[s.screen] || function () {})(s);
    renderProto();
    return go(SCREEN[s.screen]).then(function () {
      if (s.screen === "lock" && opts.arrive) arrive();
      if (s.screen === "card" && opts.reveal) revealCard();
      if (s.screen === "ticket") flipTicket(!!opts.flip);
    });
  }

  /* ---------- Renderers ---------- */
  function boldInto(str, value) { return esc(str).replace("\u0001", "<b>" + esc(value) + "</b>"); }
  function detailsHTML(s, forTicket) {
    var ev = s.event, rows = [];
    rows.push([t("guest.card.date_label"), ev.date ? esc(ev.date) : esc(t("guest.card.date_hidden")), ev.date ? "" : "muted"]);
    rows.push([t("guest.card.venue_label"), ev.venue ? esc(ev.venue) + "<small>" + esc(ev.venue_address) + "</small>" : esc(t("guest.card.venue_hidden", { venue_reveal_hint: ev.venue_hint })), ev.venue ? "" : "muted"]);
    rows.push([t("guest.card.dress_label"), esc(ev.dress), ""]);
    if (!forTicket) rows.push([t("guest.card.price_label"), s.covered ? esc(t("guest.card.covered_value", { inviter: s.inviter })) : esc(ev.price), s.covered ? "muted" : "price"]);
    return rows.map(function (r) { return "<dt>" + esc(r[0]) + '</dt><dd class="' + r[2] + '">' + r[1] + "</dd>"; }).join("");
  }
  var RENDER = {
    lock: function (s) {
      $("#lock-masked").innerHTML = K.icon("lock") + "<span>" + boldInto(t("guest.lock.masked_line", { masked_phone: "\u0001" }), s.masked) + "</span>";
    },
    rest: function (s) { $("#rest-body").textContent = t("guest.lock.error_locked", { minutes: s.minutes, inviter_hint: t("guest.lock.inviter_hint_fallback") }); },
    stranger: function () {}, claimed: function () {},
    card: function (s) {
      $("#card-event").textContent = s.event.name;
      $("#salute").setAttribute("aria-label", t("guest.card.salutation", { guest: s.guest }));
      $("#salute").innerHTML = t("guest.card.salutation", { guest: s.guest }).split("").map(function (c) { return '<span class="ch" aria-hidden="true">' + esc(c) + "</span>"; }).join("");
      $("#card-headline").textContent = t("guest.card.headline", { inviter: s.inviter });
      $("#card-details").innerHTML = detailsHTML(s);
      taps = s.taps || 0; growYes();
      var note = $("#later-note");
      if (s.status === "said_yes" && s.hold_ends) { note.textContent = t("guest.transfer.not_now_note", { expires_at: K.fmtShort(s.hold_ends) }); note.hidden = false; }
      else note.hidden = true;
    },
    wait: function (s) {
      $("#wait-title").textContent = s.byMember ? t("guest.awaiting.member_title", { inviter: s.inviter }) : t("guest.awaiting.title");
      $("#wait-body").textContent = s.byMember ? t("guest.awaiting.member_body") : t("guest.awaiting.body");
      var r = $("#wait-recap");
      if (s.payment && s.payment.sender_name && !s.byMember) {
        r.innerHTML = K.icon("check") + "<span>" + esc(t("guest.awaiting.recap", { sender_name: s.payment.sender_name, reference: "\u0002" })).replace("\u0002", "<b>" + esc(s.payment.reference) + "</b>") + "</span>";
        r.hidden = false;
      } else r.hidden = true;
      var to = $("#env-wait .to"); if (to) to.textContent = t("guest.card.letter_to", { guest: s.guest });
    },
    notfound: function (s) {
      var p = s.payment || {};
      $("#nf-body").innerHTML = esc(t("guest.not_found.body", { amount: "\u0001", account_name: "\u0002" })).replace("\u0001", "<b>" + esc(p.amount) + "</b>").replace("\u0002", "<b>" + esc(p.account_name) + "</b>");
    },
    covered: function (s) { $("#cov-body").textContent = t("guest.covered.body", { inviter: s.inviter }); var to = $("#env-covered .to"); if (to) to.textContent = t("guest.card.letter_to", { guest: s.guest }); },
    ticket: function (s) {
      $("#t-event").textContent = s.event.name;
      $("#t-name").textContent = s.guest;
      $("#t-by").textContent = t("guest.ticket.invited_by", { inviter: s.inviter });
      $("#t-back-to").textContent = t("guest.card.letter_to", { guest: s.guest });
      $("#t-details").innerHTML = detailsHTML(s, true);
      $("#qr").innerHTML = K.qrSVG(s.ticket_code || "PENDING");
      $("#t-code").textContent = s.ticket_code || "";
      var n = s.taps || 0;
      $("#nocount").textContent = n === 0 ? t("guest.ticket.no_count_zero") : n === 1 ? t("guest.ticket.no_count_one") : t("guest.ticket.no_count", { n: n });
      $("#board").checked = !!s.board;
      $("#add-cal").setAttribute("aria-disabled", s.event.starts_at ? "false" : "true");
    },
    expired: function (s) { ended(t("guest.expired.title"), t("guest.expired.body", { inviter: s.inviter || t("guest.lock.inviter_hint_fallback") })); },
    cancelled: function () { ended(t("guest.cancelled.title"), t("guest.cancelled.body")); },
    closed: function (s) { ended(t("guest.closed.title"), t("guest.closed.body", { event: s.event ? s.event.name : "" })); }
  };
  function ended(title, body) {
    $("#env-ended").innerHTML = K.envelopeHTML({ dim: true, mark: mark });
    $("#ended-title").textContent = title; $("#ended-body").textContent = body;
  }

  /* ---------- Lock ---------- */
  function arrive() {
    if (reduced) return;
    var env = $("#env-lock .envelope");
    anim(env, [{ opacity: 0, transform: "translateY(40px)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: E.out });
    var seal = env.querySelector(".seal");
    setTimeout(function () { seal.classList.add("shining"); setTimeout(function () { seal.classList.remove("shining"); }, 1000); }, 650);
  }
  var phoneEl = $("#phone"), keyEl = $("#key");
  phoneEl.addEventListener("input", function () {
    var atEnd = phoneEl.selectionStart === phoneEl.value.length;
    if (atEnd) phoneEl.value = OY.phone.typing(phoneEl.value);
  });
  keyEl.addEventListener("paste", function (e) {
    var text = (e.clipboardData || window.clipboardData).getData("text");
    var k = OY.keys.extract(text);
    if (k) { e.preventDefault(); keyEl.value = k; }
  });
  keyEl.addEventListener("blur", function () { if (keyEl.value) keyEl.value = OY.keys.pretty(keyEl.value); });

  $("#lock-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#unlock"), err = $("#lock-error");
    err.hidden = true;
    if (navigator.onLine === false) { err.textContent = t("guest.lock.error_network"); err.hidden = false; return; }
    btn.disabled = true; btn.textContent = t("guest.lock.submitting");
    setTimeout(function () {
      var r = act(function () { return OY.unlock(TOK, phoneEl.value, keyEl.value); });
      btn.disabled = false; btn.textContent = t("guest.lock.submit");
      if (r.ok) { unlockSeq(); return; }
      if (r.stranger) { route({ screen: "stranger" }); return; }
      if (r.claimed) { route({ screen: "claimed" }); return; }
      if (r.locked) { route(OY.guest(TOK)); return; }
      var msg = t("guest.lock.error_mismatch");
      if (r.attemptsLeft <= 3) msg += " " + t("guest.lock.error_attempts_left", { n: r.attemptsLeft });
      err.textContent = msg; err.hidden = false;
      if (!reduced) anim($("#lock-form"), [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(7px)" }, { transform: "translateX(-4px)" }, { transform: "none" }], { duration: 320 });
    }, 650);
  });

  async function unlockSeq() {
    haptic(18);
    var s = OY.guest(TOK);
    var env = $("#env-lock .envelope");
    env.querySelector(".to").textContent = t("guest.card.letter_to", { guest: s.guest });
    if (reduced) { route(s, { reveal: true }); return; }
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
  var detached = false, busy = false, gone = false, leftCount = 0, idleT = null, sheetOpen = false;
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
    var b = bounds(w, h), yr = yes.getBoundingClientRect(), pr = $("#proto-btn").getBoundingClientRect(), hr = $("#card-headline").getBoundingClientRect(), best = null, bestScore = -1;
    for (var i = 0; i < 48; i++) {
      var x = b.minX + Math.random() * (b.maxX - b.minX), y = b.minY + Math.random() * (b.maxY - b.minY), box = { x: x, y: y, w: w, h: h };
      if (hit(box, yr, 16) || hit(box, pr, 8) || hit(box, hr, 4)) continue;
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
  function record() {
    pending++;
    if (flushT) return;
    flushT = setTimeout(function () { var d = pending; pending = 0; flushT = null; act(function () { OY.noTap(TOK, d); }); }, 400);
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
    taps++; record(); growYes();
    var tier = tierFor(taps);
    haptic(tier === 3 ? NC.haptics.tier_3_pattern_ms : NC.haptics.pattern_ms);
    if (reduced) { setLabel(RM_LABELS[(taps - 1) % RM_LABELS.length]); setLine(tier); renderProto(); return; }
    setLine(tier);
    detach();
    busy = true; clearTimeout(idleT);
    try { await MOVES[draw(tier)](); } catch (e) { console.error(e); }
    busy = false;
    renderProto();
    scheduleIdle();
  }
  var lastPress = 0;
  no.addEventListener("pointerdown", function (e) { e.preventDefault(); lastPress = Date.now(); onNo(e); });
  no.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !busy) { lastPress = Date.now(); onNo(e); } });
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
      if (busy || gone || sheetOpen || current !== "s-card") { scheduleIdle(); return; }
      busy = true;
      var s = size(), b = bounds(s.w, s.h), x = Math.min(Math.max(pos.x + (Math.random() * 90 - 45), b.minX), b.maxX), y = Math.min(Math.max(pos.y + (Math.random() * 90 - 45), b.minY), b.maxY);
      if (Math.random() < 0.5 || hit({ x: x, y: y, w: s.w, h: s.h }, yes.getBoundingClientRect(), 12)) {
        var tr = T();
        await anim(no, [{ transform: tr }, { transform: tr + " rotate(-7deg)", offset: 0.2 }, { transform: tr + " rotate(6deg)", offset: 0.45 }, { transform: tr + " rotate(-3deg)", offset: 0.7 }, { transform: tr }], { duration: 650 }).finished;
      } else {
        await moveTo(x, y, 900, E.inout);
      }
      busy = false; scheduleIdle();
    }, NC.idle.min_seconds * 1000 + Math.random() * span);
  }
  window.addEventListener("resize", function () { if (detached && !gone) clampNo(false); });

  /* ---------- Yes and the transfer ---------- */
  var sheet = $("#sheet"), sheetPanel = sheet.querySelector(".sheet"), sentStep = 0, holdT = null, sheetPayment = null;
  yes.addEventListener("click", async function () {
    if (seq) return;
    clearTimeout(idleT);
    haptic(24);
    var r = act(function () { return OY.yes(TOK); });
    if (!r) { route(OY.guest(TOK)); return; }
    if (!reduced) {
      var base = yes.style.transform || "scale(1)";
      await anim(yes, [{ transform: base }, { transform: base + " translateY(-3px) scale(1.04)" }, { transform: base }], { duration: 300, easing: E.out }).finished;
    }
    if (r.covered) { var s = OY.guest(TOK); RENDER.covered(s); state = s; go("s-covered"); return; }
    if (r.byMember) { route(OY.guest(TOK)); return; }
    state = OY.guest(TOK);
    openSheet(r.payment, false);
  });
  function rowHTML(k, v, copyVal, label, cls) {
    return '<div class="row' + (cls ? " " + cls : "") + '"><div><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + "</div></div>" +
      (copyVal ? '<button class="copy" type="button" data-copy="' + esc(copyVal) + '" aria-label="' + esc(t("guest.transfer.copy") + " " + label) + '">' + esc(t("guest.transfer.copy")) + "</button>" : "") + "</div>";
  }
  function renderHold() {
    var ends = state && state.hold_ends;
    $("#held").innerHTML = ends ? K.icon("clock") + "<span>" + esc(t("guest.transfer.held_chip", { time_left: K.left(ends - Date.now()) })) + "</span>" : "";
    $("#held").hidden = !ends;
    $("#hold-line").textContent = ends ? t("guest.transfer.hold_line", { time_left: K.left(ends - Date.now()) }) : "";
    $("#hold-line").hidden = true;
  }
  function openSheet(p, atSentStep) {
    sheetPayment = p;
    $("#rows").innerHTML =
      rowHTML(t("guest.transfer.amount_label"), p.amount, p.amount_digits, t("guest.transfer.amount_label")) +
      rowHTML(t("guest.transfer.bank_label"), p.bank) +
      rowHTML(t("guest.transfer.account_number_label"), p.account_number_display, p.account_number, t("guest.transfer.account_number_label")) +
      rowHTML(t("guest.transfer.account_name_label"), p.account_name) +
      rowHTML(t("guest.transfer.reference_label"), p.reference, p.reference, t("guest.transfer.reference_label"), "ref");
    $("#refund").textContent = t("guest.transfer.refund_line", { refund_rule: (state && state.event && state.event.refund) || t("guest.transfer.refund_default") });
    if (p.sender_name) $("#sender").value = p.sender_name;
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
      sheet.querySelectorAll("*").forEach(function (el) { el.getAnimations && el.getAnimations().forEach(function (x) { x.cancel(); }); });
      $("#scrim").getAnimations && $("#scrim").getAnimations().forEach(function (x) { x.cancel(); });
    } else sheet.hidden = true;
    sheetOpen = false; scheduleIdle();
  }
  function setSentStep(n) {
    sentStep = n;
    $("#sent-step").hidden = n === 0;
    $("#sender-error").hidden = true;
    $("#btn-sent").textContent = n === 0 ? t("guest.transfer.sent_button") : t("guest.transfer.confirm_sent");
    if (n === 1) setTimeout(function () { $("#sender").focus(); }, 60);
  }
  $("#rows").addEventListener("click", function (e) {
    var b = e.target.closest(".copy"); if (!b) return;
    K.copyText(b.getAttribute("data-copy"), b);
  });
  $("#btn-sent").addEventListener("click", async function () {
    if (sentStep === 0) { setSentStep(1); return; }
    var name = $("#sender").value.trim();
    if (name.length < 2) { $("#sender-error").hidden = false; $("#sender").setAttribute("aria-invalid", "true"); $("#sender").focus(); return; }
    $("#sender").removeAttribute("aria-invalid");
    act(function () { OY.claim(TOK, name); });
    await closeSheet();
    route(OY.guest(TOK));
  });
  $("#btn-later").addEventListener("click", async function () {
    await closeSheet();
    var s = OY.guest(TOK); state = s;
    var note = $("#later-note");
    note.textContent = t("guest.transfer.not_now_note", { expires_at: s.hold_ends ? K.fmtShort(s.hold_ends) : "" });
    note.hidden = false;
    if (!reduced) anim(note, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  });
  $("#scrim").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheetOpen) closeSheet(); });

  /* ---------- Waiting, not found, covered ---------- */
  $("#demo-confirm").addEventListener("click", function () { if (state.payment) OY.confirm(state.payment.id, OY.admin().id); });
  $("#demo-notfound").addEventListener("click", function () { if (state.payment) OY.notFound(state.payment.id, OY.admin().id); });
  $("#nf-retry").addEventListener("click", function () { act(function () { OY.claim(TOK, null); }); route(OY.guest(TOK)); });
  $("#nf-details").addEventListener("click", function () {
    var s = OY.guest(TOK); s.screen = "card";
    route(s).then(function () { if (s.payment) openSheet(s.payment, false); });
  });
  $("#cov-open").addEventListener("click", function () { landed(OY.guest(TOK)); });

  async function landed(s) {
    if (seq) return;
    seq = true;
    haptic([20, 60, 20]);
    if (!reduced && (current === "s-wait" || current === "s-covered")) {
      var seal = document.querySelector("#" + current + " .seal");
      anim(seal, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.7)", opacity: 0 }], { duration: 560, easing: E.in, fill: "forwards" });
      await wait(260);
    }
    confetti();
    seq = false;
    await route(s, { flip: true });
  }

  /* ---------- The premium card ---------- */
  var ticket = $("#ticket");
  function flipTicket(animate) {
    var scene = $("#ticket-scene");
    if (reduced || !animate) { ticket.style.transform = "rotateY(180deg)"; scene.classList.add("landed"); foilLoop(); return; }
    scene.classList.remove("landed");
    ticket.style.transform = "rotateY(0deg)";
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
  function download(name, blob) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $("#add-cal").addEventListener("click", function () {
    var s = state;
    if (!s.event.starts_at) { K.toast(t("guest.ticket.calendar_locked")); return; }
    var z = function (ts) { return new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Only Yes//Invite//EN", "BEGIN:VEVENT", "UID:" + (s.ticket_code || "card") + "@onlyyes",
      "DTSTAMP:" + z(Date.now()), "DTSTART:" + z(s.event.starts_at), "DTEND:" + z(s.event.starts_at + 5 * 3600e3), "SUMMARY:" + s.event.name,
      s.event.venue ? "LOCATION:" + s.event.venue + ", " + s.event.venue_address.replace(/,/g, "\\,") : null,
      "DESCRIPTION:" + t("guest.ticket.invited_by", { inviter: s.inviter }) + ". " + t("guest.card.dress_label") + ": " + s.event.dress.replace(/,/g, "\\,"),
      "END:VEVENT", "END:VCALENDAR"].filter(Boolean);
    download("only-yes.ics", new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  });
  $("#board").addEventListener("change", function (e) {
    act(function () { OY.setBoard(TOK, e.target.checked); });
    K.toast(e.target.checked ? t("guest.ticket.board_on") : t("guest.ticket.board_off"));
  });
  $("#save-card").addEventListener("click", function () { saveCard().catch(function (e) { console.error(e); }); });

  async function saveCard() {
    var s = state; if (document.fonts && document.fonts.ready) await document.fonts.ready;
    var W = 1080, Hh = 1680, STUB = 440, c = document.createElement("canvas"); c.width = W; c.height = Hh;
    var x = c.getContext("2d"), css = getComputedStyle(document.documentElement), v = function (n) { return css.getPropertyValue(n).trim(); };
    var rr = function (X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
    var g = x.createRadialGradient(W / 2, -200, 50, W / 2, 0, Hh * 1.1);
    g.addColorStop(0, "#1D4738"); g.addColorStop(0.55, v("--green-900")); g.addColorStop(1, v("--green-950"));
    rr(0, 0, W, Hh, 60); x.fillStyle = g; x.fill();
    x.save(); x.globalCompositeOperation = "destination-out";
    [0, W].forEach(function (cx) { x.beginPath(); x.arc(cx, Hh - STUB, 34, 0, Math.PI * 2); x.fill(); });
    x.restore();
    x.strokeStyle = "rgba(200,162,74,.6)"; x.lineWidth = 3; rr(2, 2, W - 4, Hh - 4, 58); x.stroke();
    x.strokeStyle = "rgba(200,162,74,.28)"; x.lineWidth = 2; rr(28, 28, W - 56, Hh - STUB - 56, 36); x.stroke();
    var track = function (px) { if ("letterSpacing" in x) x.letterSpacing = px; };
    x.fillStyle = v("--gold-400"); x.font = "600 30px Inter"; track("5px");
    x.textAlign = "left"; x.fillText(s.event.name.toUpperCase(), 90, 132);
    x.textAlign = "right"; x.fillText(t("guest.ticket.admits").toUpperCase(), W - 90, 132); x.textAlign = "left"; track("0px");
    var size = 168; x.font = "600 " + size + "px Fraunces"; while (x.measureText(s.guest).width > W - 180 && size > 60) { size -= 6; x.font = "600 " + size + "px Fraunces"; }
    var fg = x.createLinearGradient(90, 0, 90 + x.measureText(s.guest).width, 0);
    fg.addColorStop(0, v("--foil-dark")); fg.addColorStop(0.36, v("--foil-light")); fg.addColorStop(0.54, v("--gold-500")); fg.addColorStop(0.74, "#EAD49A"); fg.addColorStop(1, v("--foil-dark"));
    x.fillStyle = fg; x.fillText(s.guest, 90, 360);
    x.fillStyle = v("--gold-300"); x.font = "italic 500 52px Fraunces"; x.fillText(t("guest.ticket.invited_by", { inviter: s.inviter }), 90, 440);
    x.fillStyle = "rgba(200,162,74,.3)"; x.fillRect(90, 510, W - 180, 2);
    var ev = s.event, rows = [[t("guest.card.date_label"), ev.date || t("guest.card.date_hidden")], [t("guest.card.venue_label"), ev.venue || t("guest.card.venue_hidden", { venue_reveal_hint: ev.venue_hint })], [t("guest.card.dress_label"), ev.dress]];
    rows.forEach(function (r, i) {
      var y = 590 + i * 110;
      x.fillStyle = v("--mist-400"); x.font = "600 26px Inter"; track("4px"); x.fillText(r[0].toUpperCase(), 90, y); track("0px");
      x.fillStyle = v("--mist-100"); x.font = "400 40px Inter"; x.fillText(r[1], 330, y + 4);
    });
    x.setLineDash([14, 12]); x.strokeStyle = "rgba(200,162,74,.4)"; x.lineWidth = 3;
    x.beginPath(); x.moveTo(60, Hh - STUB); x.lineTo(W - 60, Hh - STUB); x.stroke(); x.setLineDash([]);
    var qx = 90, qy = Hh - STUB + 70, qs = 300;
    rr(qx, qy, qs, qs, 26); x.fillStyle = v("--cream-50"); x.fill();
    try {
      var q = window.qrcode(0, "M"); q.addData(s.ticket_code || "PENDING"); q.make();
      var n = q.getModuleCount(), cell = (qs - 40) / n; x.fillStyle = v("--ink-900");
      for (var r = 0; r < n; r++) for (var col = 0; col < n; col++) if (q.isDark(r, col)) x.fillRect(qx + 20 + col * cell, qy + 20 + r * cell, Math.ceil(cell), Math.ceil(cell));
    } catch (e) {}
    x.fillStyle = v("--mist-100"); x.font = "600 40px Inter"; x.fillText(t("guest.ticket.qr_caption"), 450, qy + 80);
    x.fillStyle = v("--mist-400"); x.font = "400 30px Inter"; x.fillText(t("guest.ticket.qr_note").split(". ")[0] + ".", 450, qy + 134); x.fillText(t("guest.ticket.qr_note").split(". ")[1] || "", 450, qy + 176);
    x.fillStyle = v("--gold-400"); x.font = "600 30px ui-monospace, Menlo, monospace"; track("4px"); x.fillText(s.ticket_code || "", 450, qy + 250);
    c.toBlob(function (b) { showSaved(b, "only-yes-card-" + s.guest.toLowerCase() + ".png"); }, "image/png");
  }
  // In-app browsers often drop downloads, so the card opens as an image the guest can press and hold.
  function showSaved(blob, name) {
    var url = URL.createObjectURL(blob), w = document.createElement("div");
    w.className = "overlay center sheet-root";
    w.innerHTML = '<div class="scrim"></div><div class="dialog saved-card" role="dialog" aria-modal="true" aria-labelledby="sv-t"><h2 id="sv-t">' + esc(t("guest.ticket.save_title")) + '</h2>' +
      '<img src="' + url + '" alt="' + esc(t("guest.ticket.save_title")) + '"><p>' + esc(t("guest.ticket.save_hint")) + '</p>' +
      '<div class="actions"><a class="btn btn-ghost btn-sm" href="' + url + '" download="' + esc(name) + '">' + esc(t("guest.ticket.save_download")) + '</a><button class="btn btn-gold btn-sm" type="button" data-x>' + esc(t("guest.ticket.save_done")) + "</button></div></div>";
    document.body.appendChild(w);
    var close = function () { w.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
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

  /* ---------- Live updates: the host confirms in another tab, the card turns over here ---------- */
  function refresh() {
    if (quiet || seq) return;
    var s = OY.guest(TOK);
    if (!state) return;
    if (current === "s-wait" && s.screen === "ticket") { landed(s); return; }
    if (s.screen !== state.screen && !(current === "s-covered" && s.screen === "ticket")) {
      if (current === "s-card" && s.screen === "card") { state = s; return; }
      if (sheetOpen) closeSheet();
      route(s, { arrive: s.screen === "lock" });
    } else { state = s; renderProto(); }
  }
  OY.subscribe(refresh);
  setInterval(function () { if (!document.hidden && (current === "s-wait" || current === "s-card")) refresh(); }, 10000);

  /* ---------- Prototype panel ---------- */
  var protoBtn = $("#proto-btn"), panel = $("#proto-panel");
  protoBtn.addEventListener("click", function () { var open = panel.hidden; panel.hidden = !open; protoBtn.setAttribute("aria-expanded", String(open)); });
  function renderProto() {
    var s = state || {}, d = s.demo, other = false;
    try { other = !!sessionStorage.getItem("oy.device.alt"); } catch (e) {}
    var html = "";
    if (d) {
      html += "<p>" + esc(d.guest) + ", invited by " + esc(d.inviter) + ". Event details are sample values the host sets.</p>";
      html += "<p>Number <code>" + esc(d.phone) + "</code><br>Key <code>" + esc(d.key) + "</code></p>";
      if (s.screen === "lock") html += '<button class="btn btn-ghost" type="button" data-p="fill">Fill it in</button>';
      if (s.screen === "card") html += "<p>No taps so far: <code>" + taps + "</code></p>";
    } else html += "<p>This link doesn't match any invite. This is what a forwarded or made up link shows.</p>";
    html += '<button class="btn btn-ghost" type="button" data-p="other">' + (other ? "Back to the guest's phone" : "Pretend to be another phone") + "</button>";
    html += '<a class="btn btn-ghost" href="guest.html?t=not-a-real-invite">See what a stranger sees</a>';
    html += '<p><a href="admin.html" target="_blank" rel="noopener">Open the Admin portal</a> &middot; <a href="member.html" target="_blank" rel="noopener">Member app</a> &middot; <a href="index.html">All screens</a></p>';
    html += '<button class="btn btn-ghost" type="button" data-p="reset">Reset the whole demo</button>';
    panel.innerHTML = html;
  }
  panel.addEventListener("click", function (e) {
    var b = e.target.closest("[data-p]"); if (!b) return;
    var p = b.getAttribute("data-p");
    if (p === "fill" && state.demo) { phoneEl.value = state.demo.phone; keyEl.value = state.demo.key; panel.hidden = true; $("#unlock").focus(); }
    if (p === "other") { var on = false; try { on = !sessionStorage.getItem("oy.device.alt"); } catch (er) {} OY.pretendOtherPhone(on); location.reload(); }
    if (p === "reset") { OY.reset(); location.href = "guest.html?t=q3VxL9aTn2KwPz8RmB4sJd"; }
  });

  /* ---------- Start ---------- */
  route(OY.guest(TOK), { arrive: true, flip: false });
})();
