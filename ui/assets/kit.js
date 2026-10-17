/*
  Shared helpers for the design build: copy lookup, motion helpers, toast, clipboard,
  and the art (wax seal, envelope, icons, QR). No dependencies besides content.js.
*/
(function () {
  "use strict";
  var C = window.OY_CONTENT;
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------- Copy ---------- */
  function fill(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }
  function t(path, vars) {
    var v = path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, C.copy);
    if (v == null) { console.warn("Missing copy: " + path); return path; }
    return typeof v === "string" ? fill(v, vars) : v;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  /* ---------- Motion ---------- */
  var EASE = { out: "cubic-bezier(.22,1,.36,1)", spring: "cubic-bezier(.34,1.56,.64,1)", inout: "cubic-bezier(.65,0,.35,1)", in: "cubic-bezier(.55,0,1,.45)" };
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function anim(el, frames, opts) {
    if (!el || !el.animate) return { finished: Promise.resolve(), cancel: function () {} };
    var a = el.animate(frames, opts);
    var done = a.finished || new Promise(function (r) { a.onfinish = r; });
    done = done.catch(function () {});
    // Never let a sequence hang: if frames stall (hidden tab, busy phone), resolve on the deadline.
    var o = typeof opts === "number" ? { duration: opts } : (opts || {});
    if (o.iterations !== Infinity) {
      var total = (o.delay || 0) + (o.duration || 0) * (o.iterations || 1);
      done = Promise.race([done, wait(total + 120)]);
    }
    try { Object.defineProperty(a, "finished", { value: done, configurable: true }); } catch (e) { a.done = done; }
    return a;
  }
  function haptic(p) {
    try {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // only after a real tap
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) {}
  }

  /* ---------- Paper grain, generated once ---------- */
  try {
    var nc = document.createElement("canvas"); nc.width = nc.height = 140;
    var nx = nc.getContext("2d"), nd = nx.createImageData(140, 140);
    for (var i = 0; i < nd.data.length; i += 4) { var g = (Math.random() * 255) | 0; nd.data[i] = nd.data[i + 1] = nd.data[i + 2] = g; nd.data[i + 3] = (Math.random() * 16) | 0; }
    nx.putImageData(nd, 0, 0);
    document.documentElement.style.setProperty("--noise", "url(" + nc.toDataURL() + ")");
  } catch (e) {}

  /* ---------- Toast ---------- */
  var toastWrap, toastT;
  function toast(msg, action) {
    if (!toastWrap) { toastWrap = document.createElement("div"); toastWrap.className = "toast-wrap"; toastWrap.setAttribute("role", "status"); toastWrap.setAttribute("aria-live", "polite"); document.body.appendChild(toastWrap); }
    toastWrap.innerHTML = "";
    var el = document.createElement("div"); el.className = "toast";
    var span = document.createElement("span"); span.textContent = msg; el.appendChild(span);
    if (action) {
      var b = document.createElement("button"); b.className = "btn btn-gold"; b.type = "button"; b.textContent = action.label;
      b.addEventListener("click", function () { action.run(); el.remove(); }); el.appendChild(b);
    }
    toastWrap.appendChild(el);
    if (!reduced) anim(el, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE.out });
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.remove(); }, action ? 6500 : 2800);
  }

  /* ---------- Links ---------- */
  // Opens WhatsApp, SMS and other outside links with a real anchor, which in-app browsers and
  // sandboxed frames honour more reliably than window.open.
  function openLink(url) {
    var a = document.createElement("a"); a.href = url; a.rel = "noopener";
    if (/^https?:/i.test(url)) a.target = "_blank";
    document.body.appendChild(a); a.click(); a.remove();
  }
  // Inside a frame (a shared preview), pages of this build open in place instead of a new tab.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[target="_blank"]');
    if (!a || window.top === window.self) return;
    try { var u = new URL(a.href, location.href); if (u.origin === location.origin) { e.preventDefault(); location.href = u.href; } } catch (er) {}
  });

  /* ---------- Clipboard ---------- */
  function copyText(text, btn, labels) {
    labels = labels || { idle: t("guest.transfer.copy"), done: t("guest.transfer.copied") };
    var done = function () {
      if (!btn) return;
      btn.textContent = labels.done; btn.classList.add("done");
      setTimeout(function () { btn.textContent = labels.idle; btn.classList.remove("done"); }, 1600);
    };
    var fallback = function () {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); done();
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }

  /* ---------- Art: wax seal ---------- */
  var sid = 0;
  function sealPath() {
    var pts = [], n = 40;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var r = 45.5 + 2.4 * Math.sin(a * 5 + 1.1) + 1.5 * Math.sin(a * 9 + 2.3) + 0.9 * Math.sin(a * 15 + 0.4);
      pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
    }
    var mid = function (p, q) { return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
    var m0 = mid(pts[0], pts[1]), d = "M" + m0[0].toFixed(2) + " " + m0[1].toFixed(2);
    for (var j = 1; j <= n; j++) {
      var p = pts[j % n], m = mid(p, pts[(j + 1) % n]);
      d += " Q" + p[0].toFixed(2) + " " + p[1].toFixed(2) + " " + m[0].toFixed(2) + " " + m[1].toFixed(2);
    }
    return d + "Z";
  }
  var SEAL_D = sealPath();
  function sealSVG(mono, quiet) {
    var id = "seal" + (++sid);
    mono = mono == null ? "OY" : mono;
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><radialGradient id="' + id + 'a" cx="34%" cy="28%" r="78%"><stop offset="0" style="stop-color:var(--wax-light)"/><stop offset=".55" style="stop-color:var(--seal-600)"/><stop offset="1" style="stop-color:var(--wax-dark)"/></radialGradient>' +
      '<radialGradient id="' + id + 'b" cx="62%" cy="68%" r="62%"><stop offset="0" style="stop-color:var(--wax-dark)"/><stop offset="1" style="stop-color:var(--seal-500)"/></radialGradient></defs>' +
      '<path d="' + SEAL_D + '" transform="translate(0 2.5)" fill="rgba(0,0,0,.35)"/>' +
      '<path d="' + SEAL_D + '" fill="url(#' + id + 'a)"/>' +
      '<circle cx="50" cy="50" r="31" fill="url(#' + id + 'b)" opacity=".9"/>' +
      '<circle cx="50" cy="50" r="31" fill="none" stroke="rgba(232,209,147,.38)" stroke-width="1"/>' +
      '<circle cx="50" cy="50" r="26.5" fill="none" stroke="rgba(232,209,147,.22)" stroke-width=".8" stroke-dasharray="1.2 2.6"/>' +
      (mono ? '<text x="50" y="58.5" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-style="italic" font-weight="600" font-size="23" fill="rgba(0,0,0,.35)">' + esc(mono) + '</text>' +
        '<text x="50" y="57.5" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-style="italic" font-weight="600" font-size="23" fill="rgba(232,209,147,.93)">' + esc(mono) + '</text>' : "") +
      '<ellipse cx="34" cy="27" rx="13" ry="5.5" fill="rgba(255,255,255,.13)" transform="rotate(-32 34 27)"/>' +
      "</svg>";
  }
  function sealHTML(mono) {
    var s = sealSVG(mono);
    return '<div class="seal"><span class="seal-half l">' + s + '</span><span class="seal-half r">' + sealSVG(mono) + '</span><span class="seal-shine"></span></div>';
  }
  function miniSeal(letter, quiet) {
    return '<span class="seal-mini' + (quiet ? " quiet" : "") + '" aria-hidden="true">' + sealSVG("") + "<b>" + esc(letter) + "</b></span>";
  }

  /* ---------- Art: envelope ---------- */
  function envelopeHTML(o) {
    o = o || {};
    return '<div class="envelope' + (o.dim ? " dim" : "") + '" aria-hidden="true">' +
      (o.glow ? '<div class="env-layer env-glow"></div>' : "") +
      '<div class="env-layer env-back"></div>' +
      '<div class="env-layer env-letter"><span class="to">' + esc(o.to || "") + '</span><span class="rule"></span><span class="rule short"></span></div>' +
      '<div class="env-layer env-front"><i class="side-l"></i><i class="side-r"></i><i class="bottom"></i><i class="grain"></i></div>' +
      (o.mark ? '<span class="env-mark">' + esc(o.mark) + "</span>" : "") +
      '<div class="env-layer env-flap-shadow"></div>' +
      '<div class="env-layer env-flap"><i class="out"></i><i class="in"></i></div>' +
      sealHTML(o.mono) + "</div>";
  }

  /* ---------- Icons (24px, stroke) ---------- */
  var P = {
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    guests: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
    payments: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
    members: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
    invite: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
    event: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    account: '<path d="M3 9.5L12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
    door: '<path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21M3 21h18"/><circle cx="15" cy="12.5" r="1" fill="currentColor"/>',
    board: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.4M17 6h2.5a2.5 2.5 0 0 1-2.6 3.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    whatsapp: '<path d="M4 20l1.3-4A8.5 8.5 0 1 1 8.4 19z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8a5 5 0 0 1-2.2-2.2l.8-1-1-2z" fill="currentColor" stroke="none"/>',
    sms: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.8A8 8 0 1 1 21 12z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    key: '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8L20 3M16.5 6.5l3 3M14 9l2 2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
    logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16.5L5.5 12 10 7.5M5.5 12H15"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    qr: '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2v2M20.5 14.5v.01M18.5 18.5h2v2M14.5 20.5h2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>',
    card: '<path d="M4 7.5L12 3l8 4.5v9L12 21l-8-4.5z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || "ico") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || "") + "</svg>";
  }

  /* ---------- QR ---------- */
  function qrSVG(text) {
    try {
      var q = window.qrcode(0, "M"); q.addData(text); q.make();
      var n = q.getModuleCount(), d = "";
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += "M" + c + " " + r + "h1v1h-1z";
      return '<svg viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges" aria-hidden="true"><path d="' + d + '" fill="var(--ink-900)"/></svg>';
    } catch (e) {
      var cells = 25, html = '<svg viewBox="0 0 25 25" shape-rendering="crispEdges" aria-hidden="true">';
      for (var y = 0; y < cells; y++) for (var x = 0; x < cells; x++) {
        var inF = (x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16);
        if (!inF && ((x * 7 + y * 13 + x * y) % 3 === 0)) html += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
      }
      var f = function (x, y) { return '<rect x="' + x + '" y="' + y + '" width="7" height="7"/><rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" fill="var(--cream-50)"/><rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3"/>'; };
      return html + f(0, 0) + f(18, 0) + f(0, 18) + "</svg>";
    }
  }

  /* ---------- Time ---------- */
  var TZ = "Africa/Lagos";
  function timeAgo(ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase(); }
  function fmtShort(ts) {
    return new Date(ts).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }) + ", " + fmtTime(ts);
  }
  function left(ms) {
    ms = Math.max(0, ms);
    var h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
    return h > 0 ? h + "h " + m + "m" : m + "m";
  }
  function greetingKey() {
    var h = Number(new Date().toLocaleString("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }));
    return h < 12 ? "member.home.greeting_morning" : h < 17 ? "member.home.greeting_afternoon" : "member.home.greeting";
  }

  window.OYKit = {
    C: C, t: t, fill: fill, esc: esc, reduced: reduced, EASE: EASE, wait: wait, anim: anim, haptic: haptic,
    toast: toast, copyText: copyText, openLink: openLink, sealSVG: sealSVG, sealHTML: sealHTML, miniSeal: miniSeal,
    envelopeHTML: envelopeHTML, icon: icon, qrSVG: qrSVG, timeAgo: timeAgo, fmtShort: fmtShort, fmtTime: fmtTime,
    left: left, greetingKey: greetingKey, TZ: TZ
  };
})();
