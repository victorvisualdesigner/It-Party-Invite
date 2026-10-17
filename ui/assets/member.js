/* Member app: login, home, new invite, guest detail. Hash routes keep the back button honest. */
(function () {
  "use strict";
  var K = window.OYKit, OY = window.OY, t = K.t, esc = K.esc, icon = K.icon;
  var app = document.getElementById("app");
  var me = null, typing = false;

  function routeName() { return (location.hash.replace(/^#\/?/, "") || "home").split("/"); }
  function nav(h) { if (location.hash === "#" + h) render(); else location.hash = h; }
  window.addEventListener("hashchange", render);

  function render() {
    me = OY.session.member();
    if (me && !me.active) { OY.session.setMember(null); me = null; }
    var r = routeName();
    if (!me) return login();
    if (r[0] === "new") return newInvite();
    if (r[0] === "guest" && r[1]) return detail(r[1]);
    return home();
  }

  function bar(left) {
    return '<div class="bar">' + left + '<button class="icon-btn" type="button" id="signout" aria-label="' + esc(t("member.login.signout")) + '">' + icon("logout") + "</button></div>";
  }
  function brand() { return '<span class="brand">' + K.miniSeal("OY") + "<span>" + esc(OY.event().name) + "</span></span>"; }
  function wireBar() {
    var s = document.getElementById("signout");
    if (s) s.addEventListener("click", function () { OY.session.setMember(null); nav("home"); });
  }
  function backBtn(label, to) { return '<button class="back" type="button" data-nav="' + to + '">' + icon("back") + "<span>" + esc(label) + "</span></button>"; }
  app.addEventListener("click", function (e) { var b = e.target.closest("[data-nav]"); if (b) nav(b.getAttribute("data-nav")); });

  /* ---------- Login ---------- */
  function login() {
    app.innerHTML = '<div class="login">' + K.miniSeal("OY") +
      '<div><p class="eyebrow">' + esc(OY.event().name) + '</p><h1 class="display" style="margin-top:10px">' + esc(t("member.login.title")) + '</h1></div><p class="lede">' + esc(t("member.login.body")) + "</p>" +
      '<form novalidate id="login">' +
        '<div class="field"><label for="m-phone">' + esc(t("member.login.phone_label")) + '</label><input class="input num" id="m-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="' + esc(t("guest.lock.phone_placeholder")) + '"></div>' +
        '<div class="field"><label for="m-key">' + esc(t("member.login.key_label")) + '</label><input class="input input-key" id="m-key" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + esc(t("guest.lock.key_placeholder")) + '"></div>' +
        '<p class="error" id="m-err" role="alert" hidden>' + esc(t("member.login.error")) + "</p>" +
        '<button class="btn btn-gold btn-wide cta" type="submit">' + esc(t("member.login.submit")) + "</button>" +
      "</form></div>";
    var ph = document.getElementById("m-phone"), key = document.getElementById("m-key");
    ph.addEventListener("input", function () { if (ph.selectionStart === ph.value.length) ph.value = OY.phone.typing(ph.value); });
    key.addEventListener("paste", function (e) { var k = OY.keys.extract((e.clipboardData || window.clipboardData).getData("text")); if (k) { e.preventDefault(); key.value = k; } });
    document.getElementById("login").addEventListener("submit", function (e) {
      e.preventDefault();
      var p = OY.memberLogin(ph.value, key.value);
      if (!p) { document.getElementById("m-err").hidden = false; if (!K.reduced) K.anim(this, [{ transform: "translateX(-8px)" }, { transform: "translateX(7px)" }, { transform: "none" }], { duration: 280 }); return; }
      OY.session.setMember(p.id); nav("home");
    });
    renderProto();
  }

  /* ---------- Home ---------- */
  function home() {
    var info = OY.slotInfo(me.id), list = OY.invitesBy(me.id);
    var paid = list.filter(function (i) { return i.status === "paid"; }).length;
    var onWay = list.filter(function (i) { return ["opened", "said_yes", "awaiting_confirmation"].indexOf(i.status) >= 0; }).length;
    var slotsHTML;
    if (info.unlimited) {
      slotsHTML = '<p class="slot-big"><b>∞</b>' + esc(t("member.home.slots_unlimited")) + "</p>";
    } else {
      var rest = t("member.home.slots_limited", { left: "\u0001", total: info.total }).replace("\u0001", "").trim();
      slotsHTML = '<p class="slot-big" aria-label="' + esc(t("member.home.slots_limited", { left: info.left, total: info.total })) + '"><b aria-hidden="true">' + info.left + "</b><span aria-hidden=\"true\">" + esc(rest) + "</span></p>";
      var meter = "";
      for (var i = 0; i < info.total; i++) meter += "<i" + (i < info.used ? ' class="used"' : "") + "></i>";
      slotsHTML += '<div class="slot-meter" aria-hidden="true">' + meter + "</div>";
    }
    var noneLeft = !info.unlimited && info.left <= 0;
    app.innerHTML = '<div class="view">' + bar(brand()) +
      '<h1 class="display greeting">' + esc(t(K.greetingKey(), { member: me.first_name })) + "</h1>" +
      '<section class="slots" aria-label="Invites">' + slotsHTML +
        '<div class="slot-stats"><span><b>' + esc(t("member.home.paid_count", { n: paid })) + "</b></span><span>" + esc(t("member.home.waiting_count", { n: onWay })) + "</span></div></section>" +
      (noneLeft ? '<p class="slots-none">' + esc(t("member.home.slots_none")) + "</p>" : '<button class="btn btn-gold btn-wide cta" type="button" data-nav="new">' + icon("plus") + "<span>" + esc(t("member.home.new_invite")) + "</span></button>") +
      '<div class="section-title"><h2>' + esc(t("member.home.list_title")) + "</h2><span>" + list.length + "</span></div>" +
      (list.length ? '<ul class="list">' + list.map(rowHTML).join("") + "</ul>" :
        '<div class="empty">' + K.envelopeHTML({}) + "<p>" + esc(t("member.home.empty")) + "</p></div>") +
      "</div>";
    wireBar(); renderProto();
  }
  function statusChip(inv) {
    var key = inv.status === "awaiting_confirmation" ? "awaiting" : inv.status;
    return '<span class="chip chip-' + inv.status + '">' + esc(t("member.status." + key)) + "</span>";
  }
  function payingChip(inv) {
    var p = OY.memberPayment(inv.id);
    return (inv.covered || (p && p.status !== "not_found")) && inv.status !== "cancelled" ? '<span class="chip chip-covered">' + esc(t("member.status.covered")) + "</span>" : "";
  }
  function tapsText(inv) { return inv.no_taps ? t("member.status.no_taps", { n: inv.no_taps }) : ""; }
  function rowHTML(inv) {
    return '<li><button class="guest-row" type="button" data-nav="guest/' + inv.id + '">' + K.miniSeal(inv.guest_first_name.charAt(0).toUpperCase(), ["expired", "cancelled"].indexOf(inv.status) >= 0) +
      '<span class="who"><span class="name">' + esc(inv.guest_first_name) + '</span><span class="meta">' + statusChip(inv) + payingChip(inv) + (tapsText(inv) ? "<span>" + esc(tapsText(inv)) + "</span>" : "") + "</span></span>" +
      icon("chev", "chev") + "</button></li>";
  }

  /* ---------- New invite ---------- */
  function newInvite() {
    app.innerHTML = '<div class="view">' + '<div class="bar">' + backBtn(t("member.new_invite.back"), "home") + "</div>" + '<div id="composer"></div></div>';
    typing = true;
    OYComposer.mount(document.getElementById("composer"), { inviterId: me.id, onDone: function () { typing = false; nav("home"); } });
    renderProto();
  }

  /* ---------- Guest detail ---------- */
  function detail(id) {
    var inv = OY.invite(id);
    if (!inv || inv.inviter_id !== me.id) { nav("home"); return; }
    var ev = OY.event(), mp = OY.memberPayment(inv.id);
    var steps = [
      ["sent", inv.sent_at], ["opened", inv.opened_at], ["said_yes", inv.yes_at],
      ["awaiting", inv.status === "awaiting_confirmation" || inv.status === "paid" ? claimedAt(inv) : null], ["paid", inv.status === "paid" ? 1 : null]
    ];
    var order = { sent: 0, opened: 1, said_yes: 2, awaiting_confirmation: 3, paid: 4 };
    var at = order[inv.status];
    var tl = steps.map(function (s, i) {
      var done = at != null && i <= at && s[1];
      var cls = done ? "done" : at != null && i === at + 1 ? "now" : "";
      var label = s[0] === "said_yes" ? t("member.status.said_yes").split(",")[0] : t("member.status." + s[0]);
      return '<li class="' + cls + '"><span class="dot">' + (done ? icon("check") : "") + "</span><span>" + esc(label) + "</span><time>" + (done && typeof s[1] === "number" && s[1] > 1 ? esc(K.fmtShort(s[1])) : "") + "</time></li>";
    }).join("");
    if (inv.status === "expired" || inv.status === "cancelled") tl += '<li class="stop"><span class="dot">' + icon("x") + "</span><span>" + esc(t("member.status." + inv.status)) + "</span><time></time></li>";
    var active = ["sent", "opened", "said_yes", "awaiting_confirmation"].indexOf(inv.status) >= 0;
    var revealed = OY.revealed(ev.reveal_date_mode, ev.reveal_date_at, true) || OY.revealed(ev.reveal_venue_mode, ev.reveal_venue_at, true);
    var canPay = active && inv.status !== "awaiting_confirmation" && !inv.covered && !(mp && (mp.status === "claimed" || mp.status === "confirmed"));
    var acts = "";
    if (inv.status === "paid" && revealed) acts += btn("reveal", "spark", t("member.guest_actions.nudge_reveal"), "gold");
    if (canPay) acts += btn("pay", "payments", t("member.guest_actions.pay_for_guest", { guest: inv.guest_first_name }), "gold");
    if (active) acts += btn("resend", "whatsapp", t("member.guest_actions.resend")) + btn("reset", "refresh", t("member.guest_actions.reset_access")) + btn("cancel", "x", t("member.guest_actions.cancel"), "danger");

    app.innerHTML = '<div class="view">' + '<div class="bar">' + backBtn(t("member.home.list_title"), "home") + "</div>" +
      '<div class="profile">' + K.miniSeal(inv.guest_first_name.charAt(0).toUpperCase(), !active && inv.status !== "paid") + '<div><h1 class="display">' + esc(inv.guest_first_name) + "</h1><p>" + esc(OY.phone.local(inv.guest_phone_e164)) + "</p></div></div>" +
      '<div class="chips">' + statusChip(inv) + payingChip(inv) + "</div>" +
      (mp && mp.status === "claimed" ? '<p class="note">' + esc(t("member.detail.paying_note", { guest: inv.guest_first_name })) + "</p>" : "") +
      '<div class="taps"><b>' + inv.no_taps + "</b><span>" + esc(inv.no_taps ? t("member.status.no_taps", { n: inv.no_taps }) : t("member.detail.no_taps_zero")) + "</span></div>" +
      '<div class="section-title"><h2>' + esc(t("member.detail.timeline_title")) + "</h2><span></span></div>" +
      '<ol class="timeline">' + tl + "</ol>" +
      '<div id="newkey"></div>' +
      (acts ? '<div class="actions">' + acts + "</div>" : "") +
      (inv.status !== "cancelled" ? '<a class="demo-link" href="guest.html?t=' + esc(inv.token) + '" target="_blank" rel="noopener">Prototype: open <b>' + esc(inv.guest_first_name) + "'s envelope</b> as them</a>" : "") +
      "</div>";
    app.querySelector(".actions") && app.querySelector(".actions").addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var a = b.getAttribute("data-act");
      if (a === "pay") OYComposer.paySheet(inv.id, me.id, function () { render(); });
      if (a === "reveal") { K.openLink(OY.waLink(inv.guest_phone_e164, OY.revealMessage(inv))); K.toast(t("member.detail.reveal_done")); }
      if (a === "resend") { var m = OY.resend(inv.id, "member"); K.openLink(OY.waLink(inv.guest_phone_e164, m.full)); showKey(inv, m); }
      if (a === "reset") confirmDialog(t("member.guest_actions.reset_access"), t("member.guest_actions.reset_confirm"), t("member.guest_actions.reset_access"), function () { var m = OY.resetAccess(inv.id, "member"); showKey(inv, m); K.toast(t("member.detail.reset_done")); });
      if (a === "cancel") confirmDialog(t("member.guest_actions.cancel"), t("member.guest_actions.cancel_confirm", { guest: inv.guest_first_name }), t("member.guest_actions.cancel"), function () { OY.cancel(inv.id, "member"); K.toast(t("member.detail.cancel_done")); render(); }, true);
    });
    renderProto();
  }
  function claimedAt(inv) {
    var ps = OY.paymentsFor(inv.id).filter(function (p) { return p.claimed_at; }).sort(function (a, b) { return b.claimed_at - a.claimed_at; });
    return ps.length ? ps[0].claimed_at : (inv.yes_at || 1);
  }
  function btn(act, ic, label, kind) { return '<button class="btn btn-' + (kind || "ghost") + '" type="button" data-act="' + act + '">' + icon(ic) + "<span>" + esc(label) + "</span>" + icon("chev") + "</button>"; }
  function showKey(inv, m) {
    var key = m.keyLine.match(/[A-Z]{3,} [2-9]{4}/);
    var box = document.getElementById("newkey");
    box.innerHTML = '<div class="newkey"><div class="keychip">' + icon("key") + "<div><span class=\"label\">" + esc(t("member.detail.key_title")) + "</span><br><b>" + esc(key ? key[0] : "") + "</b></div></div>" +
      "<p>" + esc(t("member.detail.reset_done")) + '</p><button class="btn btn-gold" type="button" id="send-key">' + icon("whatsapp") + "<span>" + esc(t("member.new_invite.send")) + "</span></button></div>";
    document.getElementById("send-key").addEventListener("click", function () { K.openLink(OY.waLink(inv.guest_phone_e164, m.full)); });
  }
  function confirmDialog(title, body, okLabel, onOk, danger) {
    var w = document.createElement("div"); w.className = "overlay center";
    w.innerHTML = '<div class="scrim"></div><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t">' + esc(title) + "</h2><p>" + esc(body) + '</p><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-x>' + esc(t("admin.members.cancel")) + '</button><button class="btn btn-' + (danger ? "danger" : "gold") + ' btn-sm" type="button" data-ok>' + esc(okLabel) + "</button></div></div>";
    document.body.appendChild(w);
    var close = function () { w.remove(); };
    w.querySelector("[data-x]").addEventListener("click", close); w.querySelector(".scrim").addEventListener("click", close);
    w.querySelector("[data-ok]").addEventListener("click", function () { close(); onOk(); });
    w.querySelector("[data-ok]").focus();
  }

  /* ---------- Live updates ---------- */
  OY.subscribe(function () {
    var r = routeName();
    if (!me || r[0] === "new" || document.querySelector(".overlay")) return;
    render();
  });

  /* ---------- Prototype panel ---------- */
  var protoBtn = document.getElementById("proto-btn"), panel = document.getElementById("proto-panel");
  protoBtn.addEventListener("click", function () { var open = panel.hidden; panel.hidden = !open; protoBtn.setAttribute("aria-expanded", String(open)); });
  function renderProto() {
    var ms = OY.members().filter(function (p) { return p.role === "member"; });
    panel.innerHTML = "<p>Sign in as any member. Keys are shown here for testing only.</p>" +
      ms.map(function (p) { return '<button class="btn btn-ghost" type="button" data-as="' + p.id + '">' + esc(p.first_name) + " &middot; <code>" + esc(p.demo_key) + "</code></button>"; }).join("") +
      '<p><a href="admin.html" target="_blank" rel="noopener">Open the Admin portal</a> &middot; <a href="index.html">All screens</a></p>' +
      '<button class="btn btn-ghost" type="button" data-reset>Reset the whole demo</button>';
  }
  panel.addEventListener("click", function (e) {
    var b = e.target.closest("[data-as]");
    if (b) { OY.session.setMember(b.getAttribute("data-as")); panel.hidden = true; nav("home"); return; }
    if (e.target.closest("[data-reset]")) { OY.reset(); OY.session.setMember(OY.members().find(function (p) { return p.first_name === "Tolu"; }).id); nav("home"); panel.hidden = true; }
  });

  render();
})();
