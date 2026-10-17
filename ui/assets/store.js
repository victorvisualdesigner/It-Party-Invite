/*
  A stand-in backend for the design build. It keeps the whole event in localStorage so the
  Guest page, Member app and Admin portal talk to each other across tabs, and it follows the
  rules in CLAUDE.md (statuses, clocks, slots, capacity, reveals, payments).

  Port note: every function here maps to a server action or route handler in the real build.
  The real server stores keys and device secrets hashed, never sends event data before unlock,
  and computes money server side. This file keeps a plain demo_key only so the prototype panel
  can show testers the key.
*/
(function () {
  "use strict";
  var C = window.OY_CONTENT, K = window.OYKit, t = K.t;
  var DBKEY = "oy.db.v1", VERSION = 1;
  var H = 3600e3, D = 24 * H, MIN = 60e3;
  var ACTIVE = ["sent", "opened", "said_yes", "awaiting_confirmation", "paid"];
  var db = null, subs = [];

  /* ---------- Randomness ---------- */
  function rnd(n) { return Math.floor(Math.random() * n); }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : "id" + Math.random().toString(16).slice(2) + Date.now().toString(16); }
  function randToken() {
    var a = new Uint8Array(16), s = ""; crypto.getRandomValues(a);
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function digits(n) { var s = ""; for (var i = 0; i < n; i++) s += "23456789"[rnd(8)]; return s; }
  var B32 = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  function ticketCode() { var s = "OY-"; for (var i = 0; i < 8; i++) { if (i === 4) s += "-"; s += B32[rnd(B32.length)]; } return s; }

  /* ---------- Phones ---------- */
  var phone = {
    normalize: function (v) {
      var s = String(v || "").trim(), plus = s.charAt(0) === "+", d = s.replace(/\D/g, "");
      if (!d) return null;
      if (plus || (d.indexOf("234") === 0 && d.length >= 13)) {
        if (d.indexOf("234") === 0) { d = d.slice(3); if (d.charAt(0) === "0") d = d.slice(1); return d.length === 10 && /^[789]/.test(d) ? "+234" + d : null; }
        return d.length >= 8 && d.length <= 15 ? "+" + d : null;
      }
      if (d.length === 11 && d.charAt(0) === "0" && /^[789]/.test(d.charAt(1))) return "+234" + d.slice(1);
      if (d.length === 10 && /^[789]/.test(d)) return "+234" + d;
      return null;
    },
    local: function (e) {
      if (!e) return "";
      if (e.indexOf("+234") === 0) { var d = "0" + e.slice(4); return d.slice(0, 4) + " " + d.slice(4, 7) + " " + d.slice(7); }
      return e;
    },
    mask: function (e) {
      if (e.indexOf("+234") === 0) { var d = "0" + e.slice(4); return d.slice(0, 3) + "•••••" + d.slice(-3); }
      var m = e.match(/^\+(\d{1,3})/); return "+" + (m ? m[1] : "") + " •••••" + e.slice(-3);
    },
    // Formats as the guest types: 0803 123 4567
    typing: function (v) {
      var s = String(v), plus = s.trim().charAt(0) === "+", d = s.replace(/\D/g, "");
      if (plus) return "+" + d.replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,4}).*/, function (m, a, b, c, e) { return [a, b, c, e].filter(Boolean).join(" "); });
      d = d.slice(0, 11);
      return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(" ");
    }
  };

  /* ---------- Keys ---------- */
  var keys = {
    generate: function () { var w = C.keyWords.words; return w[rnd(w.length)] + " " + digits(4); },
    normalize: function (v) { return String(v || "").toUpperCase().replace(/[^A-Z2-9]/g, ""); },
    // Pulls a key out of anything pasted, even the whole WhatsApp message.
    extract: function (text) {
      var re = /\b([A-Za-z]{3,12})[\s.\-:]*([2-9]{4})\b/g, m, first = null, words = C.keyWords.words;
      while ((m = re.exec(String(text)))) {
        var k = m[1].toUpperCase() + " " + m[2];
        if (words.indexOf(m[1].toUpperCase()) >= 0) return k;
        if (!first) first = k;
      }
      return first;
    },
    pretty: function (v) { var n = keys.normalize(v), m = n.match(/^([A-Z]+)([2-9]{4})$/); return m ? m[1] + " " + m[2] : n; }
  };

  /* ---------- Money ---------- */
  var money = {
    fmt: function (kobo) { return "₦" + Math.round(kobo / 100).toLocaleString("en-NG"); },
    digits: function (kobo) { return String(Math.round(kobo / 100)); }
  };
  function groupAccount(n) { return String(n).replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3"); }

  /* ---------- Dates ---------- */
  var TZ = K.TZ;
  function fmtEventDate(ts) {
    var d = new Date(ts);
    var wd = d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long" });
    var dm = d.toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "long" });
    var tm = d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(/\s/g, "").toLowerCase();
    return wd + ", " + dm + ", " + tm;
  }
  function fmtDay(ts) { return new Date(ts).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "long" }); }

  /* ---------- Persistence ---------- */
  function load() {
    try { var s = localStorage.getItem(DBKEY); db = s ? JSON.parse(s) : null; } catch (e) { db = null; }
    if (!db || db.v !== VERSION) { db = seed(); persist(); }
  }
  function persist() { try { localStorage.setItem(DBKEY, JSON.stringify(db)); } catch (e) {} }
  function save() { persist(); emit(); }
  function emit() { subs.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  window.addEventListener("storage", function (e) { if (e.key === DBKEY) { load(); emit(); } });
  function subscribe(fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }

  function log(actorType, actorId, inviteId, action, details) {
    db.audit.unshift({ id: uid(), actor_type: actorType, actor_id: actorId, invite_id: inviteId, action: action, details: details || {}, created_at: Date.now() });
    if (db.audit.length > 400) db.audit.length = 400;
  }

  /* ---------- Messages ---------- */
  function pickCombo(list, exceptId) {
    var used = {}; (list || db.invites).forEach(function (i) { if (i.id !== exceptId) used[i.message_combo.join(".")] = 1; });
    var c;
    for (var n = 0; n < 50; n++) { c = [rnd(20), rnd(20), rnd(20), rnd(20)]; if (!used[c.join(".")]) return c; }
    return c;
  }
  function baseUrl() { return location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, ""); }
  function link(inv) { return baseUrl() + "guest.html?t=" + inv.token; }
  function assemble(inv, key) {
    var M = C.messages, inviter = person(inv.inviter_id);
    var v = { guest: inv.guest_first_name, inviter: inviter ? inviter.first_name : "", link: link(inv), key: key };
    var c = inv.message_combo;
    var covered = inv.pay_toggle ? " " + K.fill(M.covered_lines[inv.covered_line_index || 0], v) : "";
    return K.fill(M.assembly.template, {
      opening: K.fill(M.opening[c[0]], v), pull: K.fill(M.pull[c[1]], v), mystery: K.fill(M.mystery[c[2]], v),
      covered: covered, close: K.fill(M.close[c[3]], v), link: v.link, key_line: K.fill(M.key_lines[inv.key_line_index], v)
    });
  }
  function messageParts(inv, key) {
    var full = assemble(inv, key), parts = full.split("\n\n");
    return { full: full, body: parts[0], link: parts[1], keyLine: parts[2] };
  }
  function waLink(e164, text) { return "https://wa.me/" + e164.replace(/\D/g, "") + "?text=" + encodeURIComponent(text); }
  function smsLink(e164, text) { return "sms:" + e164 + "?body=" + encodeURIComponent(text); }

  /* ---------- Seed ---------- */
  function seed() {
    var now = Date.now();
    var startsAt = Date.UTC(2026, 11, 19, 19, 0); // Saturday 19 December, 8pm in Lagos
    var d = {
      v: VERSION,
      event: {
        name: "Only Yes", starts_at: startsAt, venue_name: "The Glasshouse", venue_address: "14 Bourdillon Road, Ikoyi, Lagos",
        dress_code: "Black tie, with a touch of gold", price_kobo: 5000000, capacity: 120, hold_window_hours: 72,
        unopened_expiry_days: 7, refund_text: t("guest.transfer.refund_default"), reveal_date_mode: "card", reveal_date_at: null,
        reveal_venue_mode: "at_time", reveal_venue_at: startsAt - 48 * H, invites_open: true, reference_prefix: "OY"
      },
      accounts: [
        { id: uid(), bank_name: "Providus Bank", account_number: "0123456789", account_name: "Only Yes Hosts", active: true, created_at: now - 9 * D },
        { id: uid(), bank_name: "Wema Bank", account_number: "7012345678", account_name: "Only Yes Events", active: false, created_at: now - 12 * D }
      ],
      people: [], invites: [], payments: [], audit: []
    };
    var P = function (role, name, ph, slots, key) {
      var p = { id: uid(), role: role, first_name: name, phone_e164: phone.normalize(ph), slot_limit: slots, key_norm: keys.normalize(key), demo_key: key, active: true, created_at: now - 10 * D };
      d.people.push(p); return p;
    };
    var kemi = P("admin", "Kemi", "0803 000 0001", null, "MONARCH 7425");
    var tolu = P("member", "Tolu", "0803 111 0001", 5, "LANTERN 5372");
    var dayo = P("member", "Dayo", "0805 222 0002", null, "CROWN 8264");
    var ife = P("member", "Ife", "0809 333 0003", 2, "PEARL 3957");
    var acct = d.accounts[0];

    var mk = function (o) {
      var sent = now - o.sent * H, opened = o.opened != null ? now - o.opened * H : null, yes = o.yes != null ? now - o.yes * H : null;
      var inv = {
        id: uid(), token: o.token || randToken(), inviter_id: o.by.id, guest_first_name: o.guest, guest_phone_e164: phone.normalize(o.phone),
        key_norm: keys.normalize(o.key), demo_key: o.key, key_plain_draft: null, message_combo: pickCombo(d.invites), key_line_index: rnd(5),
        covered_line_index: null, pay_toggle: false, status: o.status, no_taps: o.taps || 0, board_visible: o.board !== false,
        sent_at: sent, opened_at: opened, yes_at: yes, expires_at: null, hold_remaining_ms: null, covered: !!o.covered,
        wrong_attempts: 0, locked_until: null, ticket_code: o.status === "paid" ? ticketCode() : null, checked_in_at: null,
        created_at: sent - 4 * MIN, devices: opened ? ["seed-device"] : [], notice: null
      };
      if (o.status === "sent") inv.expires_at = sent + 7 * D;
      if (o.status === "opened" || o.status === "said_yes") inv.expires_at = opened + 72 * H;
      if (o.status === "expired") inv.expires_at = now - 2 * H;
      if (o.status === "awaiting_confirmation") inv.hold_remaining_ms = 41 * H;
      d.invites.push(inv);
      var L = function (action, at, actor) { d.audit.push({ id: uid(), actor_type: actor || "member", actor_id: o.by.id, invite_id: inv.id, action: action, details: {}, created_at: at }); };
      L("sent", sent);
      if (opened) L("opened", opened, "guest");
      if (yes) L("said_yes", yes, "guest");
      if (o.status === "expired") L("expired", inv.expires_at, "system");
      return inv;
    };
    var pay = function (inv, o) {
      var p = {
        id: uid(), invite_id: inv.id, payer_type: o.member ? "member" : "guest", payer_person_id: o.member ? o.member.id : null,
        reference: "OY" + digits(4), amount_kobo: d.event.price_kobo, account_id: acct.id, status: o.status, sender_name: o.sender || null,
        claimed_at: o.claimed != null ? now - o.claimed * MIN : null, resolved_at: o.status === "confirmed" ? now - (o.claimed || 60) * MIN + 25 * MIN : null,
        resolved_by: o.status === "confirmed" ? kemi.id : null, created_at: now - (o.claimed || 90) * MIN - 8 * MIN
      };
      d.payments.push(p);
      if (o.claimed != null) d.audit.push({ id: uid(), actor_type: o.member ? "member" : "guest", actor_id: inv.inviter_id, invite_id: inv.id, action: "claimed", details: {}, created_at: p.claimed_at });
      if (o.status === "confirmed") d.audit.push({ id: uid(), actor_type: "admin", actor_id: kemi.id, invite_id: inv.id, action: "confirmed", details: {}, created_at: p.resolved_at });
      return p;
    };

    // The demo guest from the brief: Ada, invited by Tolu. Number 0803 123 4234, key VELVET 4827.
    mk({ by: tolu, guest: "Ada", phone: "0803 123 4234", key: "VELVET 4827", status: "sent", sent: 2, token: "q3VxL9aTn2KwPz8RmB4sJd" });
    var kunle = mk({ by: tolu, guest: "Kunle", phone: "0802 441 9087", key: "AMBER 6385", status: "paid", sent: 120, opened: 118, yes: 117, taps: 23 });
    pay(kunle, { status: "confirmed", sender: "Kunle Adebayo", claimed: 116 * 60 });
    var zainab = mk({ by: tolu, guest: "Zainab", phone: "0816 552 7314", key: "SAFFRON 2947", status: "awaiting_confirmation", sent: 30, opened: 26, yes: 1, taps: 7 });
    pay(zainab, { status: "claimed", sender: "Zainab Bello", claimed: 18 });
    var chidi = mk({ by: dayo, guest: "Chidi", phone: "0703 210 8876", key: "EMBER 4583", status: "paid", sent: 140, opened: 139, yes: 138, taps: 41 });
    pay(chidi, { status: "confirmed", sender: "Chidiebere Okafor", claimed: 137 * 60 });
    var bisi = mk({ by: dayo, guest: "Bisi", phone: "0812 905 6643", key: "ORCHID 3826", status: "said_yes", sent: 50, opened: 20, yes: 19, taps: 3 });
    pay(bisi, { status: "open" });
    mk({ by: ife, guest: "Emeka", phone: "0806 774 1209", key: "COBALT 7246", status: "opened", sent: 26, opened: 5, taps: 12 });
    mk({ by: dayo, guest: "Fola", phone: "0909 118 4472", key: "RAVEN 5934", status: "expired", sent: 200 });
    var tobi = mk({ by: dayo, guest: "Tobi", phone: "0813 667 2290", key: "HALO 8352", status: "opened", sent: 22, opened: 21, taps: 2 });
    pay(tobi, { status: "claimed", member: dayo, sender: "Dayo Adeyemi", claimed: 44 });
    var ngozi = mk({ by: ife, guest: "Ngozi", phone: "0817 302 5561", key: "PEARL 6248", status: "paid", sent: 96, opened: 90, yes: 89, taps: 0, covered: true });
    pay(ngozi, { status: "confirmed", member: ife, sender: "Ifeoma Nwosu", claimed: 92 * 60 });
    var seun = mk({ by: dayo, guest: "Seun", phone: "0811 908 3345", key: "TEMPO 2593", status: "paid", sent: 160, opened: 150, yes: 149, taps: 17 });
    pay(seun, { status: "confirmed", sender: "Oluwaseun Ajayi", claimed: 148 * 60 });
    var amara = mk({ by: kemi, guest: "Amara", phone: "0814 223 9910", key: "JASMINE 8724", status: "paid", sent: 75, opened: 74, yes: 73, taps: 9 });
    pay(amara, { status: "confirmed", sender: "Amarachi Eze", claimed: 72 * 60 });
    var lola = mk({ by: kemi, guest: "Lola", phone: "0815 664 0028", key: "GARNET 3674", status: "paid", sent: 60, opened: 58, yes: 57, taps: 31, board: true });
    pay(lola, { status: "confirmed", sender: "Omolola Bakare", claimed: 56 * 60 });
    mk({ by: kemi, guest: "Yemi", phone: "0818 771 6620", key: "CEDAR 9425", status: "sent", sent: 9 });
    d.audit.sort(function (a, b) { return b.created_at - a.created_at; });
    return d;
  }

  /* ---------- Lookups ---------- */
  function person(id) { return db.people.find(function (p) { return p.id === id; }); }
  function invite(id) { return db.invites.find(function (i) { return i.id === id; }); }
  function byToken(tok) { return db.invites.find(function (i) { return i.token === tok; }); }
  function account(id) { return db.accounts.find(function (a) { return a.id === id; }); }
  function activeAccount() { return db.accounts.find(function (a) { return a.active; }); }
  function paymentsFor(inv) { return db.payments.filter(function (p) { return p.invite_id === inv.id; }); }

  /* ---------- Clocks and expiry (evaluated lazily on every read) ---------- */
  function sweep() {
    var now = Date.now(), changed = false;
    db.invites.forEach(function (inv) {
      if (["sent", "opened", "said_yes"].indexOf(inv.status) >= 0 && !inv.covered && inv.expires_at && now > inv.expires_at) {
        inv.status = "expired"; changed = true;
        paymentsFor(inv).forEach(function (p) { if (p.status === "open") p.status = "void"; });
        log("system", null, inv.id, "expired");
      }
    });
    db.invites = db.invites.filter(function (i) { return !(i.status === "draft" && now - i.created_at > D); });
    if (changed) persist();
  }
  function pause(inv) { if (inv.expires_at) { inv.hold_remaining_ms = Math.max(0, inv.expires_at - Date.now()); inv.expires_at = null; } }
  function resume(inv) { inv.expires_at = Date.now() + Math.max(inv.hold_remaining_ms || 0, 6 * H); inv.hold_remaining_ms = null; }

  /* ---------- Reveals ---------- */
  function revealed(mode, at, paid) {
    if (mode === "card") return true;
    if (mode === "after_payment") return !!paid;
    if (mode === "at_time") return !!at && Date.now() >= at;
    return false;
  }
  function revealHint(mode, at) {
    if (mode === "after_payment") return t("guest.card.reveal_after_payment");
    if (mode === "at_time" && at) {
      var hrs = Math.round((db.event.starts_at - at) / H);
      return hrs > 0 && hrs <= 96 ? t("guest.card.reveal_hours_before", { n: hrs }) : t("guest.card.reveal_on_date", { date: fmtDay(at) });
    }
    return t("guest.card.revealed_soon_short");
  }
  function eventView(paid) {
    var e = db.event, ds = revealed(e.reveal_date_mode, e.reveal_date_at, paid), vs = revealed(e.reveal_venue_mode, e.reveal_venue_at, paid);
    return {
      name: e.name, date: ds ? fmtEventDate(e.starts_at) : null, starts_at: ds ? e.starts_at : null,
      venue: vs ? e.venue_name : null, venue_address: vs ? e.venue_address : null,
      venue_hint: revealHint(e.reveal_venue_mode, e.reveal_venue_at), dress: e.dress_code,
      price: money.fmt(e.price_kobo), refund: e.refund_text
    };
  }

  /* ---------- Slots and capacity ---------- */
  function slotInfo(pid) {
    var p = person(pid), used = db.invites.filter(function (i) { return i.inviter_id === pid && ACTIVE.indexOf(i.status) >= 0; }).length;
    var unlimited = p.role === "admin" || p.slot_limit == null;
    return { used: used, total: unlimited ? null : p.slot_limit, left: unlimited ? Infinity : Math.max(0, p.slot_limit - used), unlimited: unlimited };
  }
  function capacityUsed() { return db.invites.filter(function (i) { return ACTIVE.indexOf(i.status) >= 0; }).length; }
  function canSend(pid) {
    if (!db.event.invites_open) return { ok: false, reason: "closed" };
    if (slotInfo(pid).left <= 0) return { ok: false, reason: "slots" };
    var cap = db.event.capacity;
    if (cap && capacityUsed() >= cap) return { ok: false, reason: "capacity" };
    return { ok: true, nearlyFull: !!cap && cap - capacityUsed() <= 3 };
  }

  /* ---------- Inviting ---------- */
  function createDraft(pid, input) {
    sweep();
    var name = String(input.guest_first_name || "").trim().replace(/\s+/g, " ");
    var e164 = phone.normalize(input.phone), errors = {};
    if (!name) errors.name = t("member.new_invite.name_error");
    if (!e164) errors.phone = t("member.new_invite.phone_error");
    else if (db.invites.some(function (i) { return i.guest_phone_e164 === e164 && ["draft", "expired", "cancelled"].indexOf(i.status) < 0; })) errors.phone = t("member.new_invite.duplicate_error");
    var cs = canSend(pid);
    if (!cs.ok) errors.form = cs.reason === "slots" ? t("member.home.slots_none") : cs.reason === "closed" ? t("guest.closed.body", { event: db.event.name }) : t("member.new_invite.capacity_warning");
    if (Object.keys(errors).length) return { errors: errors };
    // Drop any older unsent draft for the same number from this inviter.
    db.invites = db.invites.filter(function (i) { return !(i.status === "draft" && i.inviter_id === pid && i.guest_phone_e164 === e164); });
    var key = keys.generate();
    var inv = {
      id: uid(), token: randToken(), inviter_id: pid, guest_first_name: name.split(" ")[0], guest_phone_e164: e164,
      key_norm: keys.normalize(key), demo_key: key, key_plain_draft: key, message_combo: pickCombo(), key_line_index: rnd(C.messages.key_lines.length),
      covered_line_index: rnd(C.messages.covered_lines.length), pay_toggle: false, status: "draft", no_taps: 0, board_visible: true,
      sent_at: null, opened_at: null, yes_at: null, expires_at: null, hold_remaining_ms: null, covered: false, wrong_attempts: 0,
      locked_until: null, ticket_code: null, checked_in_at: null, created_at: Date.now(), devices: [], notice: null
    };
    db.invites.push(inv); save();
    return { invite: inv, key: key, nearlyFull: cs.nearlyFull };
  }
  function shuffle(id) {
    var inv = invite(id); if (!inv || inv.status !== "draft") return null;
    inv.message_combo = pickCombo(null, id);
    inv.key_line_index = rnd(C.messages.key_lines.length);
    inv.covered_line_index = rnd(C.messages.covered_lines.length);
    save(); return inv;
  }
  function setPayToggle(id, on) { var inv = invite(id); if (inv) { inv.pay_toggle = !!on; save(); } return inv; }
  function draftMessage(id) { var inv = invite(id); return inv && inv.key_plain_draft ? messageParts(inv, inv.key_plain_draft) : null; }
  function send(id) {
    var inv = invite(id); if (!inv || inv.status !== "draft") return null;
    var cs = canSend(inv.inviter_id); if (!cs.ok) return null;
    var msg = messageParts(inv, inv.key_plain_draft);
    inv.status = "sent"; inv.sent_at = Date.now(); inv.expires_at = inv.sent_at + db.event.unopened_expiry_days * D;
    inv.key_plain_draft = null; // The plain key leaves the database the moment it is sent.
    log(person(inv.inviter_id).role, inv.inviter_id, inv.id, "sent");
    save(); return msg;
  }
  function rekey(inv, resetDevices) {
    var key = keys.generate();
    inv.key_norm = keys.normalize(key); inv.demo_key = key; inv.wrong_attempts = 0; inv.locked_until = null;
    if (resetDevices) inv.devices = [];
    return messageParts(inv, key);
  }
  function resend(id, actor) { var inv = invite(id); if (!inv) return null; var m = rekey(inv, false); log(actor || "member", inv.inviter_id, inv.id, "resent"); save(); return m; }
  function resetAccess(id, actor) { var inv = invite(id); if (!inv) return null; var m = rekey(inv, true); log(actor || "member", inv.inviter_id, inv.id, "reset_access"); save(); return m; }
  function cancel(id, actor) {
    var inv = invite(id); if (!inv || inv.status === "paid") return false;
    inv.status = "cancelled"; inv.expires_at = null;
    paymentsFor(inv).forEach(function (p) { if (p.status === "open" || p.status === "claimed") p.status = "void"; });
    log(actor || "member", inv.inviter_id, inv.id, "cancelled"); save(); return true;
  }
  function invitesBy(pid) {
    sweep();
    return db.invites.filter(function (i) { return i.inviter_id === pid && i.status !== "draft"; }).sort(function (a, b) { return (b.sent_at || 0) - (a.sent_at || 0); });
  }
  function allInvites() { sweep(); return db.invites.filter(function (i) { return i.status !== "draft"; }).sort(function (a, b) { return (b.sent_at || 0) - (a.sent_at || 0); }); }

  /* ---------- Devices (cookie stand-in) ---------- */
  function deviceId() {
    try {
      var alt = sessionStorage.getItem("oy.device.alt"); if (alt) return alt;
      var d = localStorage.getItem("oy.device"); if (!d) { d = "dev-" + uid(); localStorage.setItem("oy.device", d); }
      return d;
    } catch (e) { return "dev-memory"; }
  }
  function pretendOtherPhone(on) {
    try { if (on) sessionStorage.setItem("oy.device.alt", "dev-" + uid()); else sessionStorage.removeItem("oy.device.alt"); } catch (e) {}
  }

  /* ---------- Guest ---------- */
  function paymentView(p) {
    if (!p) return null;
    var a = account(p.account_id) || activeAccount();
    return {
      id: p.id, status: p.status, payer_type: p.payer_type, reference: p.reference, amount: money.fmt(p.amount_kobo), amount_digits: money.digits(p.amount_kobo),
      bank: a.bank_name, account_number: a.account_number, account_number_display: groupAccount(a.account_number), account_name: a.account_name,
      sender_name: p.sender_name
    };
  }
  function guest(tok) {
    sweep();
    var inv = byToken(tok);
    if (!inv || inv.status === "draft") return { screen: "stranger" };
    var mine = inv.devices.indexOf(deviceId()) >= 0, inviter = person(inv.inviter_id), now = Date.now();
    var v = { token: tok, masked: phone.mask(inv.guest_phone_e164), demo: { phone: phone.local(inv.guest_phone_e164), key: inv.demo_key, guest: inv.guest_first_name, inviter: inviter.first_name } };
    if (inv.status === "cancelled") { v.screen = "cancelled"; return v; }
    if (inv.status === "expired") { v.screen = "expired"; v.inviter = mine ? inviter.first_name : null; return v; }
    if (!mine) {
      if (inv.locked_until && now < inv.locked_until) { v.screen = "rest"; v.minutes = Math.ceil((inv.locked_until - now) / MIN); return v; }
      v.screen = "lock"; return v;
    }
    v.guest = inv.guest_first_name; v.inviter = inviter.first_name; v.event = eventView(inv.status === "paid");
    v.covered = inv.covered; v.taps = inv.no_taps; v.board = inv.board_visible; v.status = inv.status;
    v.hold_ends = inv.expires_at; v.ticket_code = inv.ticket_code;
    if (inv.status === "paid") { v.screen = "ticket"; return v; }
    if (!db.event.invites_open) { v.screen = "closed"; return v; }
    var ps = paymentsFor(inv);
    if (inv.status === "awaiting_confirmation") {
      var claim = ps.filter(function (p) { return p.status === "claimed"; }).sort(function (a, b) { return b.claimed_at - a.claimed_at; })[0];
      v.payment = paymentView(claim); v.byMember = !!claim && claim.payer_type === "member"; v.screen = "wait"; return v;
    }
    var open = ps.find(function (p) { return p.payer_type === "guest" && (p.status === "open" || p.status === "not_found"); });
    v.payment = paymentView(open);
    v.screen = inv.notice === "not_found" ? "notfound" : "card";
    return v;
  }
  function unlock(tok, ph, key) {
    var inv = byToken(tok), now = Date.now();
    if (!inv || ["draft", "cancelled", "expired"].indexOf(inv.status) >= 0) return { ok: false, stranger: true };
    if (inv.locked_until && now < inv.locked_until) return { ok: false, locked: true, minutes: Math.ceil((inv.locked_until - now) / MIN) };
    var match = phone.normalize(ph) === inv.guest_phone_e164 && keys.normalize(key) === inv.key_norm;
    if (!match) {
      inv.wrong_attempts++;
      log("guest", null, inv.id, "wrong_attempt");
      if (inv.wrong_attempts >= 5) { inv.locked_until = now + 30 * MIN; inv.wrong_attempts = 0; save(); return { ok: false, locked: true, minutes: 30 }; }
      save(); return { ok: false, attemptsLeft: 5 - inv.wrong_attempts };
    }
    inv.wrong_attempts = 0;
    var dev = deviceId();
    if (inv.devices.indexOf(dev) < 0) {
      if (inv.devices.length >= 2) { save(); return { ok: false, claimed: true }; }
      inv.devices.push(dev);
    }
    if (!inv.opened_at) {
      inv.opened_at = now;
      if (inv.status === "sent") { inv.status = "opened"; inv.expires_at = now + db.event.hold_window_hours * H; }
      log("guest", null, inv.id, "opened");
    }
    save(); return { ok: true };
  }
  function noTap(tok, delta) {
    var inv = byToken(tok); if (!inv) return 0;
    inv.no_taps += Math.max(0, Math.min(20, delta | 0)); // capped, as the server does
    persist(); return inv.no_taps;
  }
  function yes(tok) {
    var inv = byToken(tok); if (!inv || inv.devices.indexOf(deviceId()) < 0) return null;
    if (["opened", "said_yes"].indexOf(inv.status) < 0) return null;
    inv.yes_at = inv.yes_at || Date.now();
    if (inv.covered) {
      inv.status = "paid"; inv.ticket_code = inv.ticket_code || ticketCode(); inv.expires_at = null;
      log("guest", null, inv.id, "said_yes"); log("system", null, inv.id, "paid"); save(); return { covered: true };
    }
    var ps = paymentsFor(inv);
    var memberClaim = ps.find(function (p) { return p.payer_type === "member" && p.status === "claimed"; });
    if (memberClaim) { inv.status = "awaiting_confirmation"; pause(inv); log("guest", null, inv.id, "said_yes"); save(); return { byMember: true }; }
    var p = ps.find(function (x) { return x.payer_type === "guest" && (x.status === "open" || x.status === "not_found"); });
    if (!p) {
      var acct = activeAccount();
      p = { id: uid(), invite_id: inv.id, payer_type: "guest", payer_person_id: null, reference: newReference(), amount_kobo: db.event.price_kobo, account_id: acct.id, status: "open", sender_name: null, claimed_at: null, resolved_at: null, resolved_by: null, created_at: Date.now() };
      db.payments.push(p);
    }
    if (inv.status !== "said_yes") { inv.status = "said_yes"; log("guest", null, inv.id, "said_yes"); }
    save(); return { payment: paymentView(p) };
  }
  function newReference() {
    var used = {}; db.payments.forEach(function (p) { used[p.reference] = 1; });
    var r; do { r = db.event.reference_prefix + digits(4); } while (used[r]);
    return r;
  }
  function claim(tok, sender) {
    var inv = byToken(tok); if (!inv) return false;
    var p = paymentsFor(inv).find(function (x) { return x.payer_type === "guest" && (x.status === "open" || x.status === "not_found"); });
    if (!p) return false;
    p.status = "claimed"; p.sender_name = String(sender || p.sender_name || "").trim(); p.claimed_at = Date.now();
    inv.status = "awaiting_confirmation"; inv.notice = null; pause(inv);
    log("guest", null, inv.id, "claimed"); save(); return true;
  }
  function setBoard(tok, on) { var inv = byToken(tok); if (inv) { inv.board_visible = !!on; save(); } }

  /* ---------- Payments (admin) ---------- */
  function claims() {
    return db.payments.filter(function (p) { return p.status === "claimed"; }).sort(function (a, b) { return a.claimed_at - b.claimed_at; }).map(function (p) {
      var inv = invite(p.invite_id), payer = p.payer_person_id ? person(p.payer_person_id) : null;
      var dup = paymentsFor(inv).filter(function (x) { return x.status === "claimed" || x.status === "confirmed"; }).length > 1;
      return { payment: p, invite: inv, inviter: person(inv.inviter_id), payer: payer, amount: money.fmt(p.amount_kobo), duplicate: dup };
    });
  }
  function confirm(paymentId, adminId) {
    var p = db.payments.find(function (x) { return x.id === paymentId; }); if (!p || p.status !== "claimed") return null;
    var inv = invite(p.invite_id);
    p.status = "confirmed"; p.resolved_at = Date.now(); p.resolved_by = adminId || null;
    if (p.payer_type === "member") {
      inv.covered = true;
      if (inv.yes_at) { inv.status = "paid"; inv.ticket_code = inv.ticket_code || ticketCode(); }
    } else { inv.status = "paid"; inv.ticket_code = inv.ticket_code || ticketCode(); }
    inv.expires_at = null; inv.hold_remaining_ms = null;
    log("admin", adminId, inv.id, "confirmed"); if (inv.status === "paid") log("system", null, inv.id, "paid");
    save(); return { invite: inv, cardReady: inv.status === "paid", message: cardReadyMessage(inv) };
  }
  function notFound(paymentId, adminId) {
    var p = db.payments.find(function (x) { return x.id === paymentId; }); if (!p || p.status !== "claimed") return null;
    var inv = invite(p.invite_id);
    p.status = "not_found"; p.resolved_at = Date.now(); p.resolved_by = adminId || null;
    if (p.payer_type === "guest") { inv.status = "said_yes"; inv.notice = "not_found"; resume(inv); }
    else if (inv.status === "awaiting_confirmation") { inv.status = "opened"; resume(inv); }
    log("admin", adminId, inv.id, "not_found"); save(); return inv;
  }
  function memberPay(inviteId, pid) {
    var inv = invite(inviteId); if (!inv) return null;
    var p = paymentsFor(inv).find(function (x) { return x.payer_type === "member" && (x.status === "open" || x.status === "claimed"); });
    if (!p) {
      p = { id: uid(), invite_id: inv.id, payer_type: "member", payer_person_id: pid, reference: newReference(), amount_kobo: db.event.price_kobo, account_id: activeAccount().id, status: "open", sender_name: null, claimed_at: null, resolved_at: null, resolved_by: null, created_at: Date.now() };
      db.payments.push(p); save();
    }
    return paymentView(p);
  }
  function memberClaim(paymentId, sender) {
    var p = db.payments.find(function (x) { return x.id === paymentId; }); if (!p) return false;
    p.status = "claimed"; p.sender_name = String(sender).trim(); p.claimed_at = Date.now();
    log("member", p.payer_person_id, p.invite_id, "claimed"); save(); return true;
  }
  function memberPayment(inviteId) {
    var inv = invite(inviteId); if (!inv) return null;
    var p = paymentsFor(inv).filter(function (x) { return x.payer_type === "member" && x.status !== "void"; }).sort(function (a, b) { return b.created_at - a.created_at; })[0];
    return p ? paymentView(p) : null;
  }
  function matchCandidates(q) {
    q = String(q || "").trim().toLowerCase();
    var digitsQ = q.replace(/\D/g, ""), price = money.digits(db.event.price_kobo);
    return allInvites().filter(function (i) {
      if (["sent", "opened", "said_yes"].indexOf(i.status) < 0) return false;
      if (!q) return true;
      return i.guest_first_name.toLowerCase().indexOf(q) >= 0 || (digitsQ && price.indexOf(digitsQ) === 0);
    });
  }
  function manualConfirm(inviteId, adminId) {
    var inv = invite(inviteId); if (!inv) return null;
    var p = paymentsFor(inv).find(function (x) { return x.payer_type === "guest" && (x.status === "open" || x.status === "not_found"); });
    if (!p) { p = { id: uid(), invite_id: inv.id, payer_type: "guest", payer_person_id: null, reference: newReference(), amount_kobo: db.event.price_kobo, account_id: activeAccount().id, status: "open", sender_name: "Matched by hand", claimed_at: Date.now(), resolved_at: null, resolved_by: null, created_at: Date.now() }; db.payments.push(p); }
    p.status = "claimed";
    if (!inv.yes_at) { p.payer_type = "member"; }
    return confirm(p.id, adminId);
  }
  function cardReadyMessage(inv) {
    var lines = C.messages.card_ready_messages.lines;
    return K.fill(lines[rnd(lines.length)], { guest: inv.guest_first_name, link: link(inv) });
  }
  function revealMessage(inv) {
    var lines = C.messages.reveal_messages.lines;
    return K.fill(lines[rnd(lines.length)], { guest: inv.guest_first_name, link: link(inv) });
  }

  /* ---------- Members (admin) ---------- */
  function members() { return db.people.filter(function (p) { return p.active; }).sort(function (a, b) { return (a.role === "admin" ? -1 : 0) - (b.role === "admin" ? -1 : 0) || a.created_at - b.created_at; }); }
  function admin() { return db.people.find(function (p) { return p.role === "admin" && p.active; }); }
  function memberKeyMessage(p, key) {
    return t("admin.members.key_message", { member: p.first_name, event: db.event.name, link: baseUrl() + "member.html", key: key });
  }
  function addMember(input) {
    var name = String(input.first_name || "").trim(), e164 = phone.normalize(input.phone), errors = {};
    if (!name) errors.name = t("member.new_invite.name_error");
    if (!e164) errors.phone = t("member.new_invite.phone_error");
    else if (db.people.some(function (p) { return p.active && p.phone_e164 === e164; })) errors.phone = t("admin.members.duplicate_error");
    if (Object.keys(errors).length) return { errors: errors };
    var key = keys.generate();
    var p = { id: uid(), role: "member", first_name: name.split(" ")[0], phone_e164: e164, slot_limit: input.slot_limit == null ? null : Math.max(0, input.slot_limit | 0), key_norm: keys.normalize(key), demo_key: key, active: true, created_at: Date.now() };
    db.people.push(p); log("admin", null, null, "member_added", { member: p.first_name }); save();
    return { person: p, key: key, message: memberKeyMessage(p, key) };
  }
  function setSlots(pid, limit) { var p = person(pid); if (p && p.role !== "admin") { p.slot_limit = limit == null ? null : Math.max(0, limit | 0); save(); } }
  function resetMemberKey(pid) { var p = person(pid); if (!p) return null; var key = keys.generate(); p.key_norm = keys.normalize(key); p.demo_key = key; save(); return { key: key, message: memberKeyMessage(p, key) }; }
  function removeMember(pid) {
    var p = person(pid); if (!p || p.role === "admin") return;
    p.active = false;
    db.invites.forEach(function (i) { if (i.inviter_id === pid && i.status !== "paid" && ACTIVE.concat(["draft"]).indexOf(i.status) >= 0) cancel(i.id, "admin"); });
    log("admin", null, null, "member_removed", { member: p.first_name }); save();
  }
  function memberLogin(ph, key) {
    var e164 = phone.normalize(ph), n = keys.normalize(key);
    return db.people.find(function (p) { return p.active && p.phone_e164 === e164 && p.key_norm === n; }) || null;
  }

  /* ---------- Event and accounts (admin) ---------- */
  function updateEvent(patch) {
    Object.keys(patch).forEach(function (k) { db.event[k] = patch[k]; });
    var words = String(db.event.name || "").toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean);
    db.event.reference_prefix = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "OY").slice(0, 2);
    log("admin", null, null, "event_updated"); save();
  }
  function addAccount(input) {
    var num = String(input.account_number || "").replace(/\D/g, ""), errors = {};
    if (!String(input.bank_name || "").trim()) errors.bank = "Add the bank name.";
    if (num.length !== 10) errors.number = "Account numbers have 10 digits.";
    if (!String(input.account_name || "").trim()) errors.name = "Add the name guests will see.";
    if (Object.keys(errors).length) return { errors: errors };
    var a = { id: uid(), bank_name: input.bank_name.trim(), account_number: num, account_name: input.account_name.trim(), active: !activeAccount(), created_at: Date.now() };
    db.accounts.push(a); save(); return { account: a };
  }
  function setActiveAccount(id) { db.accounts.forEach(function (a) { a.active = a.id === id; }); log("admin", null, null, "account_switched"); save(); }

  /* ---------- Door and board ---------- */
  function door(code) {
    var n = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    var inv = db.invites.find(function (i) { return i.ticket_code && i.ticket_code.replace(/-/g, "") === n; });
    if (!inv) return { kind: "invalid" };
    return checkIn(inv.id);
  }
  function checkIn(id) {
    var inv = invite(id); if (!inv) return { kind: "invalid" };
    if (inv.status !== "paid") return { kind: "unpaid", invite: inv };
    if (inv.checked_in_at) return { kind: "already", invite: inv };
    inv.checked_in_at = Date.now(); log("admin", null, inv.id, "checked_in"); save();
    return { kind: "valid", invite: inv };
  }
  function paidList() { return allInvites().filter(function (i) { return i.status === "paid"; }).sort(function (a, b) { return a.guest_first_name.localeCompare(b.guest_first_name); }); }
  function board() {
    return db.invites.filter(function (i) { return i.status === "paid" && i.board_visible; }).sort(function (a, b) { return b.no_taps - a.no_taps; }).slice(0, 10);
  }

  /* ---------- Overview ---------- */
  function stats() {
    sweep();
    var inv = allInvites(), count = function (fn) { return inv.filter(fn).length; };
    var collected = db.payments.filter(function (p) { return p.status === "confirmed"; }).reduce(function (s, p) { return s + p.amount_kobo; }, 0);
    return {
      paid: count(function (i) { return i.status === "paid"; }),
      awaiting: db.payments.filter(function (p) { return p.status === "claimed"; }).length,
      open: count(function (i) { return ["sent", "opened", "said_yes", "awaiting_confirmation"].indexOf(i.status) >= 0; }),
      capacity: db.event.capacity, capacityUsed: capacityUsed(),
      collected: money.fmt(collected), taps: inv.reduce(function (s, i) { return s + i.no_taps; }, 0),
      funnel: [count(function (i) { return !!i.sent_at; }), count(function (i) { return !!i.opened_at; }), count(function (i) { return !!i.yes_at; }), count(function (i) { return i.status === "paid"; })],
      checkedIn: count(function (i) { return !!i.checked_in_at; })
    };
  }
  function activity(n) { return db.audit.slice(0, n || 12); }

  /* ---------- Sessions (cookie stand-ins) ---------- */
  var session = {
    member: function () { try { var id = localStorage.getItem("oy.session.member"); return id ? person(id) : null; } catch (e) { return null; } },
    setMember: function (id) { try { id ? localStorage.setItem("oy.session.member", id) : localStorage.removeItem("oy.session.member"); } catch (e) {} },
    admin: function () { try { return localStorage.getItem("oy.session.admin") === "1"; } catch (e) { return false; } },
    setAdmin: function (on) { try { on ? localStorage.setItem("oy.session.admin", "1") : localStorage.removeItem("oy.session.admin"); } catch (e) {} }
  };

  function reset() {
    db = seed(); persist();
    try { ["oy.session.member", "oy.session.admin"].forEach(function (k) { localStorage.removeItem(k); }); sessionStorage.removeItem("oy.device.alt"); } catch (e) {}
    emit();
  }

  load();

  window.OY = {
    get db() { return db; }, subscribe: subscribe, reset: reset, phone: phone, keys: keys, money: money, fmtEventDate: fmtEventDate,
    link: link, waLink: waLink, smsLink: smsLink, person: person, invite: invite, byToken: byToken, activeAccount: activeAccount, account: account,
    event: function () { return db.event; }, eventView: eventView, revealed: revealed, updateEvent: updateEvent,
    accounts: function () { return db.accounts.slice(); }, addAccount: addAccount, setActiveAccount: setActiveAccount,
    members: members, admin: admin, addMember: addMember, setSlots: setSlots, resetMemberKey: resetMemberKey, removeMember: removeMember, memberLogin: memberLogin,
    slotInfo: slotInfo, canSend: canSend, capacityUsed: capacityUsed,
    createDraft: createDraft, shuffle: shuffle, setPayToggle: setPayToggle, draftMessage: draftMessage, send: send, resend: resend, resetAccess: resetAccess, cancel: cancel,
    invitesBy: invitesBy, allInvites: allInvites, paymentsFor: function (id) { var i = invite(id); return i ? paymentsFor(i) : []; },
    guest: guest, unlock: unlock, noTap: noTap, yes: yes, claim: claim, setBoard: setBoard, deviceId: deviceId, pretendOtherPhone: pretendOtherPhone,
    claims: claims, confirm: confirm, notFound: notFound, memberPay: memberPay, memberClaim: memberClaim, memberPayment: memberPayment,
    matchCandidates: matchCandidates, manualConfirm: manualConfirm, cardReadyMessage: cardReadyMessage, revealMessage: revealMessage,
    door: door, checkIn: checkIn, paidList: paidList, board: board, stats: stats, activity: activity, session: session
  };
})();
