/*
  The invite composer (form, message preview, Shuffle, paying toggle, send) and the pay sheet.
  Members and the admin use the same flow, so it lives here once.
*/
(function () {
  "use strict";
  var K = window.OYKit, OY = window.OY, t = K.t, esc = K.esc, icon = K.icon;

  function previewHTML(inv, parts) {
    var key = inv.key_plain_draft || "";
    var body = esc(parts.body);
    var keyLine = esc(parts.keyLine).replace(esc(key), "<mark>" + esc(key) + "</mark>");
    var host = parts.link.replace(/^https?:\/\//, "").split("/")[0];
    return '<div class="wa" aria-label="' + esc(t("member.new_invite.preview_title")) + '">' +
      '<div class="wa-top"><span class="av" aria-hidden="true">' + esc(inv.guest_first_name.charAt(0).toUpperCase()) + '</span><div><b>' + esc(inv.guest_first_name) + '</b><small>' + esc(OY.phone.local(inv.guest_phone_e164)) + "</small></div></div>" +
      '<div class="wa-body"><div class="bubble">' +
        '<div class="og"><div class="og-img">' + K.envelopeHTML({}) + '</div><div class="og-text"><b>' + esc(t("guest.preview_card.og_title")) + "</b><span>" + esc(t("guest.preview_card.og_description")) + "</span><small>" + esc(host) + "</small></div></div>" +
        '<div class="msg msg-fade">' + body + '\n\n<a href="' + esc(parts.link) + '" target="_blank" rel="noopener">' + esc(parts.link) + '</a><span class="keyline">' + keyLine + "</span></div>" +
        '<div class="ts">' + esc(K.fmtTime(Date.now())) + ' <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8.5l3 3 6-7M7 11.5l1 0.5 6-7"/></svg></div>' +
      "</div></div></div>";
  }

  function mount(el, opts) {
    var pid = opts.inviterId, draft = null, key = null;

    function form(values, errors) {
      values = values || {}; errors = errors || {};
      var cs = OY.canSend(pid);
      el.innerHTML = '<div class="composer">' +
        '<div class="head"><h1 class="display">' + esc(t("member.new_invite.title")) + "</h1></div>" +
        (cs.ok ? "" : '<p class="warn">' + esc(cs.reason === "slots" ? t("member.home.slots_none") : cs.reason === "closed" ? t("guest.closed.body", { event: OY.event().name }) : t("member.new_invite.capacity_warning")) + "</p>") +
        (cs.ok && cs.nearlyFull ? '<p class="warn">' + esc(t("member.new_invite.capacity_warning")) + "</p>" : "") +
        '<form class="form" novalidate>' +
          '<div class="field"><label for="c-name">' + esc(t("member.new_invite.first_name_label")) + '</label><input class="input" id="c-name" autocomplete="off" autocapitalize="words" value="' + esc(values.name || "") + '"' + (errors.name ? ' aria-invalid="true" aria-describedby="c-name-err"' : "") + ">" + (errors.name ? '<p class="error" id="c-name-err">' + esc(errors.name) + "</p>" : "") + "</div>" +
          '<div class="field"><label for="c-phone">' + esc(t("member.new_invite.phone_label")) + '</label><input class="input num" id="c-phone" type="tel" inputmode="tel" autocomplete="off" placeholder="' + esc(t("guest.lock.phone_placeholder")) + '" value="' + esc(values.phone || "") + '" aria-describedby="c-phone-help' + (errors.phone ? " c-phone-err" : "") + '"' + (errors.phone ? ' aria-invalid="true"' : "") + '><span class="help" id="c-phone-help">' + esc(t("member.new_invite.phone_help")) + "</span>" + (errors.phone ? '<p class="error" id="c-phone-err">' + esc(errors.phone) + "</p>" : "") + "</div>" +
          (errors.form ? '<p class="error">' + esc(errors.form) + "</p>" : "") +
          '<button class="btn btn-gold btn-wide cta" type="submit"' + (cs.ok ? "" : " disabled") + ">" + esc(t("member.new_invite.continue")) + "</button>" +
        "</form></div>";
      var ph = el.querySelector("#c-phone");
      ph.addEventListener("input", function () { if (ph.selectionStart === ph.value.length) ph.value = OY.phone.typing(ph.value); });
      el.querySelector("form").addEventListener("submit", function (e) {
        e.preventDefault();
        var v = { name: el.querySelector("#c-name").value, phone: ph.value };
        var r = OY.createDraft(pid, { guest_first_name: v.name, phone: v.phone });
        if (r.errors) { form(v, r.errors); var bad = el.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
        draft = r.invite; key = r.key; preview();
      });
      if (!values.name) setTimeout(function () { var n = el.querySelector("#c-name"); if (n) n.focus(); }, 50);
    }

    function preview() {
      var parts = OY.draftMessage(draft.id);
      el.innerHTML = '<div class="composer">' +
        '<div class="head"><h1 class="display">' + esc(t("member.new_invite.preview_title")) + "</h1><p>" + esc(t("member.new_invite.preview_help", { guest: draft.guest_first_name })) + "</p></div>" +
        '<div id="c-preview">' + previewHTML(draft, parts) + "</div>" +
        '<div class="tools"><span class="help"></span><button class="btn btn-ghost btn-sm" type="button" id="c-shuffle">' + icon("shuffle") + "<span>" + esc(t("member.new_invite.shuffle")) + "</span></button></div>" +
        '<label class="opt switch" for="c-pay"><span><b style="font-weight:600">' + esc(t("member.new_invite.pay_toggle")) + '</b><p class="help">' + esc(t("member.new_invite.pay_help")) + '</p></span><input type="checkbox" id="c-pay"' + (draft.pay_toggle ? " checked" : "") + "></label>" +
        '<div class="opt"><div class="keychip">' + icon("key") + "<div><span class=\"label\">" + esc(t("member.new_invite.key_label")) + "</span><br><b>" + esc(key) + '</b></div></div><p class="help">' + esc(t("member.new_invite.key_help")) + "</p></div>" +
        '<div class="stack">' +
          '<button class="btn btn-gold btn-wide cta" type="button" id="c-send">' + icon("whatsapp") + "<span>" + esc(t("member.new_invite.send")) + "</span></button>" +
          '<button class="btn btn-ghost btn-wide" type="button" id="c-sms">' + icon("sms") + "<span>" + esc(t("member.new_invite.send_sms")) + "</span></button>" +
          '<button class="btn btn-quiet" type="button" id="c-copy">' + icon("copy") + "<span>" + esc(t("member.new_invite.copy_message")) + "</span></button>" +
          '<button class="btn btn-quiet" type="button" id="c-back">' + esc(t("member.new_invite.back")) + "</button>" +
        "</div></div>";
      el.querySelector("#c-shuffle").addEventListener("click", function () {
        draft = OY.shuffle(draft.id);
        el.querySelector("#c-preview").innerHTML = previewHTML(draft, OY.draftMessage(draft.id));
      });
      el.querySelector("#c-pay").addEventListener("change", function (e) {
        draft = OY.setPayToggle(draft.id, e.target.checked);
        el.querySelector("#c-preview").innerHTML = previewHTML(draft, OY.draftMessage(draft.id));
      });
      var deliver = function (via) {
        var msg = OY.send(draft.id);
        if (!msg) { form({}, { form: t("member.home.slots_none") }); return; }
        if (via === "copy") { K.copyText(msg.full, null); K.toast(t("member.new_invite.copied")); }
        else K.openLink(via === "sms" ? OY.smsLink(draft.guest_phone_e164, msg.full) : OY.waLink(draft.guest_phone_e164, msg.full));
        sent();
      };
      el.querySelector("#c-send").addEventListener("click", function () { deliver("wa"); });
      el.querySelector("#c-sms").addEventListener("click", function () { deliver("sms"); });
      el.querySelector("#c-copy").addEventListener("click", function () { deliver("copy"); });
      el.querySelector("#c-back").addEventListener("click", function () { form({ name: draft.guest_first_name, phone: OY.phone.local(draft.guest_phone_e164) }); });
    }

    function sent() {
      var inv = OY.invite(draft.id);
      el.innerHTML = '<div class="composer"><div class="sent">' + K.miniSeal("✓") +
        '<h1 class="display">' + esc(t("member.new_invite.sent_note")) + "</h1>" +
        "<p>" + esc(inv.guest_first_name) + " &middot; " + esc(OY.phone.mask(inv.guest_phone_e164)) + "</p></div>" +
        '<div class="stack">' +
          (inv.pay_toggle ? '<button class="btn btn-gold btn-wide cta" type="button" id="c-pay-now">' + esc(t("member.guest_actions.pay_for_guest", { guest: inv.guest_first_name })) + "</button>" : "") +
          '<button class="btn btn-' + (inv.pay_toggle ? "ghost" : "gold") + ' btn-wide" type="button" id="c-again">' + icon("plus") + "<span>" + esc(t("member.new_invite.another")) + "</span></button>" +
          '<button class="btn btn-quiet" type="button" id="c-done">' + esc(t("member.new_invite.done")) + "</button>" +
          '<a class="demo-link" href="guest.html?t=' + esc(inv.token) + '" target="_blank" rel="noopener">Prototype: open <b>' + esc(inv.guest_first_name) + "'s envelope</b> as them</a>" +
        "</div></div>";
      var pay = el.querySelector("#c-pay-now");
      if (pay) pay.addEventListener("click", function () { paySheet(inv.id, pid); });
      el.querySelector("#c-again").addEventListener("click", function () { draft = null; form(); });
      el.querySelector("#c-done").addEventListener("click", function () { if (opts.onDone) opts.onDone(); });
    }

    form();
  }

  /* ---------- Pay for a guest ---------- */
  function paySheet(inviteId, pid, onDone) {
    var inv = OY.invite(inviteId), p = OY.memberPay(inviteId, pid), g = inv.guest_first_name, step = 0;
    var wrap = document.createElement("div");
    wrap.className = "overlay surface-dark";
    var row = function (k, v, c, cls) { return '<div class="row' + (cls ? " " + cls : "") + '"><div><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + "</div></div>" + (c ? '<button class="copy" type="button" data-copy="' + esc(c) + '">' + esc(t("guest.transfer.copy")) + "</button>" : "") + "</div>"; };
    wrap.innerHTML = '<div class="scrim"></div><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="ps-title"><div class="grabber"></div>' +
      '<h2 id="ps-title" tabindex="-1">' + esc(t("member.pay_for_guest.title", { guest: g })) + "</h2>" +
      '<p class="intro">' + esc(t("member.pay_for_guest.intro", { guest: g })) + "</p>" +
      '<div class="rows">' + row(t("guest.transfer.amount_label"), p.amount, p.amount_digits) + row(t("guest.transfer.bank_label"), p.bank) +
        row(t("guest.transfer.account_number_label"), p.account_number_display, p.account_number) + row(t("guest.transfer.account_name_label"), p.account_name) +
        row(t("guest.transfer.reference_label"), p.reference, p.reference, "ref") + "</div>" +
      '<p class="refund">' + esc(OY.event().refund_text) + "</p>" +
      '<div class="ps-name" hidden><div class="field"><label for="ps-sender">' + esc(t("guest.transfer.sender_name_label")) + '</label><input class="input" id="ps-sender" autocomplete="name" placeholder="' + esc(t("guest.transfer.sender_name_placeholder")) + '"><span class="help">' + esc(t("guest.transfer.sender_name_help")) + '</span></div><p class="error" hidden id="ps-err">' + esc(t("guest.transfer.sender_name_error")) + "</p></div>" +
      '<div class="sheet-actions" style="display:grid;gap:10px"><button class="btn btn-gold" type="button" id="ps-sent">' + esc(t("member.pay_for_guest.sent_button")) + '</button><button class="btn btn-ghost" type="button" id="ps-close">' + esc(t("guest.transfer.not_now")) + "</button></div></section>";
    document.body.appendChild(wrap);
    var sheet = wrap.querySelector(".sheet");
    if (!K.reduced) { K.anim(wrap.querySelector(".scrim"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); K.anim(sheet, [{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 480, easing: K.EASE.out }); }
    wrap.querySelector("#ps-title").focus({ preventScroll: true });
    var close = function () { wrap.remove(); document.removeEventListener("keydown", onKey); if (onDone) onDone(); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    wrap.querySelector(".scrim").addEventListener("click", close);
    wrap.querySelector("#ps-close").addEventListener("click", close);
    wrap.querySelector(".rows").addEventListener("click", function (e) { var b = e.target.closest(".copy"); if (b) K.copyText(b.getAttribute("data-copy"), b); });
    wrap.querySelector("#ps-sent").addEventListener("click", function () {
      if (step === 0) { step = 1; wrap.querySelector(".ps-name").hidden = false; this.textContent = t("guest.transfer.confirm_sent"); wrap.querySelector("#ps-sender").focus(); return; }
      var name = wrap.querySelector("#ps-sender").value.trim();
      if (name.length < 2) { wrap.querySelector("#ps-err").hidden = false; return; }
      OY.memberClaim(p.id, name);
      K.toast(t("member.pay_for_guest.done", { guest: g }));
      close();
    });
  }

  window.OYComposer = { mount: mount, paySheet: paySheet, previewHTML: previewHTML };
})();
