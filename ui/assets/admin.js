/* Admin portal: every screen in CLAUDE.md section 10, wired to the stand-in backend. */
(function () {
  "use strict";
  var K = window.OYKit, OY = window.OY, t = K.t, esc = K.esc, icon = K.icon;
  var root = document.getElementById("root");
  var NAV = ["overview", "guests", "payments", "members", "invite", "event", "account", "door", "board"];
  var ICON = { overview: "overview", guests: "guests", payments: "payments", members: "members", invite: "invite", event: "event", account: "account", door: "door", board: "board" };
  var LIVE = { overview: 1, guests: 1, payments: 1, door: 1, account: 1, members: 1 };
  var current = null, gf = { status: "all", inviter: "all", q: "" }, doorQ = "", lastResult = null, stream = null;

  function route() { var r = (location.hash.replace(/^#\/?/, "") || "overview").split("/")[0]; return NAV.indexOf(r) >= 0 && r !== "board" ? r : "overview"; }
  window.addEventListener("hashchange", render);

  function render() {
    stopCamera();
    if (!OY.session.admin()) { current = null; return login(); }
    var r = route();
    if (!document.querySelector(".admin")) shell();
    current = r;
    updateNav();
    var view = document.getElementById("view");
    view.innerHTML = "";
    VIEWS[r](view);
    view.focus({ preventScroll: true });
  }

  /* ---------- Shell ---------- */
  function shell() {
    var me = OY.admin();
    root.innerHTML = '<div class="admin">' +
      '<aside class="side surface-dark"><div class="brand">' + K.miniSeal("OY") + "<span><b>" + esc(OY.event().name) + "</b><small>Host</small></span></div>" +
      '<nav aria-label="Host portal"><ul class="nav">' + NAV.map(function (n) {
        var href = n === "board" ? "board.html" : "#" + n;
        return '<li><a href="' + href + '" data-n="' + n + '"' + (n === "board" ? ' target="_blank" rel="noopener"' : "") + ">" + icon(ICON[n]) + "<span>" + esc(t("admin.nav." + n)) + "</span>" + (n === "payments" ? '<span class="badge" id="pay-badge" hidden></span>' : "") + "</a></li>";
      }).join("") + "</ul></nav>" +
      '<div class="side-foot"><div class="status-line" id="status-line"><i></i><span></span></div>' +
      '<button class="btn btn-quiet" type="button" id="signout">' + icon("logout") + "<span>" + esc(me ? me.first_name : "") + " &middot; " + esc(t("member.login.signout")) + "</span></button></div></aside>" +
      '<main class="main" id="view" tabindex="-1"></main></div>';
    document.getElementById("signout").addEventListener("click", function () { OY.session.setAdmin(false); render(); });
  }
  function updateNav() {
    document.querySelectorAll(".nav a").forEach(function (a) { if (a.getAttribute("data-n") === current) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    var n = OY.claims().length, b = document.getElementById("pay-badge");
    if (b) { b.textContent = n; b.hidden = !n; }
    var e = OY.event(), sl = document.getElementById("status-line");
    if (sl) { sl.classList.toggle("off", !e.invites_open); sl.querySelector("span").textContent = e.invites_open ? t("admin.event.invites_open_label") : t("guest.closed.title"); }
  }
  function top(title, sub, tools) {
    return '<header class="top"><div><h1 class="display">' + esc(title) + "</h1>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div>" + (tools ? '<div class="tools">' + tools + "</div>" : "") + "</header>";
  }
  function dialog(html, onMount) {
    var w = document.createElement("div"); w.className = "overlay center surface-paper";
    w.innerHTML = '<div class="scrim"></div><div class="dialog" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(w);
    var close = function () { w.remove(); document.removeEventListener("keydown", key); };
    var key = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    w.querySelector(".scrim").addEventListener("click", close);
    w.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", close); });
    if (!K.reduced) K.anim(w.querySelector(".dialog"), [{ opacity: 0, transform: "translateY(10px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: K.EASE.out });
    if (onMount) onMount(w.querySelector(".dialog"), close);
    var f = w.querySelector("input, button[data-ok]"); if (f) f.focus();
    return close;
  }
  function confirmBox(title, body, okLabel, onOk, danger) {
    dialog("<h2>" + esc(title) + "</h2><p>" + esc(body) + '</p><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-close>' + esc(t("admin.members.cancel")) + '</button><button class="btn btn-' + (danger ? "danger" : "gold") + ' btn-sm" type="button" data-ok>' + esc(okLabel) + "</button></div>", function (d, close) {
      d.querySelector("[data-ok]").addEventListener("click", function () { close(); onOk(); });
    });
  }
  function download(name, text, type) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  function chip(inv) {
    var key = inv.status === "awaiting_confirmation" ? "awaiting" : inv.status;
    return '<span class="chip chip-' + inv.status + '">' + esc(t("member.status." + key)) + "</span>";
  }
  function who(name, sub, quiet) { return '<div class="who">' + K.miniSeal(name.charAt(0).toUpperCase(), quiet) + "<div><b>" + esc(name) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div></div>"; }

  var VIEWS = {};

  /* ---------- Overview ---------- */
  VIEWS.overview = function (v) {
    var s = OY.stats(), e = OY.event();
    var cap = s.capacity ? Math.min(1, s.capacityUsed / s.capacity) : 0;
    var html = top(t("admin.overview.title"), t("admin.overview.subtitle"), '<a class="btn btn-ghost btn-sm" href="board.html" target="_blank" rel="noopener">' + icon("board") + "<span>" + esc(t("admin.nav.board")) + "</span></a>");
    html += '<div class="kpis">' +
      '<div class="card kpi hero"><span class="label">' + esc(t("admin.overview.paid")) + '</span><span class="value">' + s.paid + '</span><span class="sub">' + esc(t("admin.overview.paid_sub")) + "</span></div>" +
      '<a class="card kpi' + (s.awaiting ? " alert" : "") + '" href="#payments"><span class="label">' + esc(t("admin.overview.awaiting")) + '</span><span class="value">' + s.awaiting + '</span><span class="sub">' + esc(t("admin.overview.awaiting_sub")) + "</span>" + (s.awaiting ? '<span class="go">' + esc(t("admin.overview.review")) + " →</span>" : "") + "</a>" +
      '<div class="card kpi"><span class="label">' + esc(t("admin.overview.open")) + '</span><span class="value">' + s.open + '</span><span class="sub">' + esc(t("admin.overview.open_sub")) + "</span></div>" +
      '<div class="card kpi"><span class="label">' + esc(t("admin.overview.collected")) + '</span><span class="value">' + esc(s.collected) + '</span><span class="sub">' + esc(t("admin.overview.collected_sub")) + "</span></div>" +
      '<div class="card kpi"><span class="label">' + esc(t("admin.overview.capacity")) + "</span>" +
        (s.capacity ? '<span class="value">' + s.capacityUsed + '<span style="font-size:20px;color:var(--fg-quiet)"> / ' + s.capacity + '</span></span><div class="meter"><i class="' + (cap > 0.9 ? "gold" : "") + '" style="transform:scaleX(' + cap.toFixed(3) + ')"></i></div><span class="sub">' + esc(t("admin.overview.capacity_note", { left: Math.max(0, s.capacity - s.capacityUsed) })) + "</span>"
          : '<span class="value" style="font-size:22px">' + esc(t("admin.overview.capacity_off")) + "</span>") + "</div>" +
      '<div class="card kpi"><span class="label">' + esc(t("admin.overview.no_taps_total")) + '</span><span class="value">' + s.taps + '</span><span class="sub">' + esc(t("admin.overview.taps_sub")) + "</span></div>" +
      "</div>";
    var labels = t("admin.overview.funnel"), max = Math.max(1, s.funnel[0]);
    var funnel = s.funnel.map(function (n, i) {
      var pct = i === 0 ? "" : Math.round((n / Math.max(1, s.funnel[i - 1])) * 100) + "%";
      return '<div class="f-row"><span>' + esc(labels[i]) + '</span><div class="bar"><i style="transform:scaleX(' + (n / max).toFixed(3) + ')"></i></div><b>' + n + (pct ? "<small>" + pct + "</small>" : "") + "</b></div>";
    }).join("");
    var team = OY.members().map(function (p) {
      var si = OY.slotInfo(p.id), paid = OY.invitesBy(p.id).filter(function (i) { return i.status === "paid"; }).length;
      return '<div class="f-row" style="grid-template-columns: 1fr auto auto"><span>' + who(p.first_name, p.role === "admin" ? t("admin.members.host") : null) + '</span><span class="quiet num" style="font-size:13px">' + esc(si.unlimited ? t("admin.members.slots_used_unlimited", { used: si.used }) : t("admin.members.slots_used", { used: si.used, total: si.total })) + "</span><b>" + paid + "<small>" + esc(t("admin.overview.paid").toLowerCase()) + "</small></b></div>";
    }).join("");
    html += '<div class="two"><div class="grid"><section class="card card-pad"><h2>' + esc(t("admin.overview.funnel_title")) + '</h2><div class="funnel">' + funnel + "</div></section>" +
      '<section class="card card-pad"><h2>' + esc(t("admin.overview.members_title")) + '</h2><div class="funnel">' + team + "</div></section></div>" +
      '<section class="card card-pad"><h2>' + esc(t("admin.overview.activity_title")) + '</h2><ul class="feed">' + activityHTML(14) + "</ul></section></div>";
    v.innerHTML = html;
    if (!K.reduced) v.querySelectorAll(".f-row .bar i, .meter i").forEach(function (el, i) {
      var to = el.style.transform; K.anim(el, [{ transform: "scaleX(0)" }, { transform: to }], { duration: 700, delay: 60 * i, easing: K.EASE.out, fill: "backwards" });
    });
  };
  var ACT = {
    sent: ["invite", ""], opened: ["lock", ""], said_yes: ["check", "gold"], claimed: ["payments", "gold"], confirmed: ["spark", "gold"],
    not_found: ["x", "red"], expired: ["clock", ""], cancelled: ["x", "red"], resent: ["key", ""], reset_access: ["key", ""],
    wrong_attempt: ["lock", "red"], checked_in: ["door", "gold"], member_added: ["members", ""], member_removed: ["members", ""],
    event_updated: ["event", ""], account_switched: ["account", ""]
  };
  function activityHTML(n) {
    var items = OY.activity(60).filter(function (a) { return ACT[a.action]; }).slice(0, n);
    if (!items.length) return '<li style="grid-template-columns:1fr"><span class="quiet">' + esc(t("admin.activity.empty")) + "</span></li>";
    return items.map(function (a) {
      var inv = a.invite_id ? OY.invite(a.invite_id) : null, inviter = inv ? OY.person(inv.inviter_id) : null;
      var key = a.action === "claimed" && a.actor_type === "member" ? "claimed_member" : a.action;
      var line = t("admin.activity." + key, { guest: inv ? inv.guest_first_name : "", inviter: inviter ? inviter.first_name : "", member: (a.details && a.details.member) || "" });
      return '<li><span class="dot ' + ACT[a.action][1] + '">' + icon(ACT[a.action][0]) + "</span><span>" + esc(line) + "</span><time>" + esc(K.timeAgo(a.created_at)) + "</time></li>";
    }).join("");
  }

  /* ---------- Guests ---------- */
  var STATUSES = ["sent", "opened", "said_yes", "awaiting_confirmation", "paid", "expired", "cancelled"];
  VIEWS.guests = function (v) {
    var all = OY.allInvites(), people = OY.members();
    var counts = {}; all.forEach(function (i) { counts[i.status] = (counts[i.status] || 0) + 1; });
    var rows = all.filter(function (i) {
      return (gf.status === "all" || i.status === gf.status) && (gf.inviter === "all" || i.inviter_id === gf.inviter) && (!gf.q || i.guest_first_name.toLowerCase().indexOf(gf.q.toLowerCase()) >= 0);
    });
    var html = top(t("admin.guests.title"), t("admin.guests.subtitle"), '<button class="btn btn-gold btn-sm" type="button" id="export">' + icon("download") + "<span>" + esc(t("admin.guests.export")) + "</span></button>");
    html += '<section class="card"><div class="toolbar">' +
      '<label class="search">' + icon("search") + '<span class="sr">' + esc(t("admin.guests.search")) + '</span><input class="input" type="search" id="g-q" placeholder="' + esc(t("admin.guests.search")) + '" value="' + esc(gf.q) + '"></label>' +
      '<select class="input" id="g-inviter" aria-label="' + esc(t("admin.guests.all_inviters")) + '"><option value="all">' + esc(t("admin.guests.all_inviters")) + "</option>" + people.map(function (p) { return '<option value="' + p.id + '"' + (gf.inviter === p.id ? " selected" : "") + ">" + esc(p.first_name) + "</option>"; }).join("") + "</select>" +
      '<div class="filters" role="group" aria-label="Status">' + ['<button type="button" data-s="all" aria-pressed="' + (gf.status === "all") + '">' + esc(t("admin.guests.all")) + "<span>" + all.length + "</span></button>"].concat(STATUSES.map(function (s) {
        var key = s === "awaiting_confirmation" ? "awaiting" : s;
        return '<button type="button" data-s="' + s + '" aria-pressed="' + (gf.status === s) + '">' + esc(t("member.status." + key).split(",")[0]) + "<span>" + (counts[s] || 0) + "</span></button>";
      })).join("") + "</div></div>";
    var cols = t("admin.guests.columns");
    html += '<div class="table-wrap"><table><thead><tr>' + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "<th></th></tr></thead><tbody>";
    html += rows.length ? rows.map(function (i) {
      var inviter = OY.person(i.inviter_id), ps = OY.paymentsFor(i.id).filter(function (p) { return p.status !== "void"; }).sort(function (a, b) { return b.created_at - a.created_at; });
      var p = ps.find(function (x) { return x.status === "confirmed"; }) || ps[0];
      var payCell = p ? '<span class="ref">' + esc(p.reference) + "</span><small>" + esc(p.status === "confirmed" ? OY.money.fmt(p.amount_kobo) + " · " + (p.payer_type === "member" ? inviter.first_name : t("admin.payments.paid_by_guest")) : p.status === "claimed" ? t("member.status.awaiting") : p.status === "not_found" ? t("admin.payments.not_found") : t("member.status.said_yes").split(",")[0]) + "</small>" : '<span class="quiet">' + esc(t("admin.guests.unpaid")) + "</span>";
      var active = ["sent", "opened", "said_yes", "awaiting_confirmation"].indexOf(i.status) >= 0;
      return "<tr><td>" + who(i.guest_first_name, OY.phone.mask(i.guest_phone_e164), !active && i.status !== "paid") + "</td><td>" + esc(inviter.first_name) + "</td><td>" + chip(i) + (i.covered && i.status !== "paid" ? ' <span class="chip chip-covered">' + esc(t("member.status.covered")) + "</span>" : "") + '</td><td class="taps-cell"><b>' + i.no_taps + '</b></td><td class="pay-cell">' + payCell + '</td><td class="num-cell quiet">' + esc(i.sent_at ? K.timeAgo(i.sent_at) : "") + "</td>" +
        '<td><div class="row-actions">' +
          (active ? '<button class="icon-btn" type="button" data-a="reset" data-id="' + i.id + '" title="' + esc(t("admin.guests.actions.reset")) + '" aria-label="' + esc(t("admin.guests.actions.reset") + " " + i.guest_first_name) + '">' + icon("refresh") + "</button>" +
            '<button class="icon-btn" type="button" data-a="cancel" data-id="' + i.id + '" title="' + esc(t("admin.guests.actions.cancel")) + '" aria-label="' + esc(t("admin.guests.actions.cancel") + " " + i.guest_first_name) + '">' + icon("x") + "</button>" : "") +
          (i.status !== "cancelled" ? '<a class="icon-btn" href="guest.html?t=' + esc(i.token) + '" target="_blank" rel="noopener" title="' + esc(t("admin.guests.actions.open")) + '" aria-label="' + esc(t("admin.guests.actions.open")) + '">' + icon("eye") + "</a>" : "") +
        "</div></td></tr>";
    }).join("") : '<tr><td colspan="7" class="empty-row">' + esc(t("admin.guests.empty")) + "</td></tr>";
    html += "</tbody></table></div></section>";
    v.innerHTML = html;
    var q = v.querySelector("#g-q");
    q.addEventListener("input", function () { gf.q = q.value; var pos = q.selectionStart; VIEWS.guests(v); var nq = v.querySelector("#g-q"); nq.focus(); nq.setSelectionRange(pos, pos); });
    v.querySelector("#g-inviter").addEventListener("change", function (e) { gf.inviter = e.target.value; VIEWS.guests(v); });
    v.querySelector(".filters").addEventListener("click", function (e) { var b = e.target.closest("[data-s]"); if (b) { gf.status = b.getAttribute("data-s"); VIEWS.guests(v); } });
    v.querySelector("#export").addEventListener("click", function () {
      var lines = [["Guest", "Invited by", "Ticket code", "Phone", "No taps"]].concat(OY.paidList().map(function (i) { return [i.guest_first_name, OY.person(i.inviter_id).first_name, i.ticket_code, i.guest_phone_e164, i.no_taps]; }));
      download("paid-guests.csv", lines.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"), "text/csv");
      K.toast(t("admin.guests.exported"));
    });
    v.querySelector("tbody").addEventListener("click", function (e) {
      var b = e.target.closest("[data-a]"); if (!b) return;
      var inv = OY.invite(b.getAttribute("data-id"));
      if (b.getAttribute("data-a") === "reset") confirmBox(t("member.guest_actions.reset_access"), t("member.guest_actions.reset_confirm"), t("member.guest_actions.reset_access"), function () {
        var m = OY.resetAccess(inv.id, "admin");
        keyDialog(inv.guest_first_name, m.keyLine.match(/[A-Z]{3,} [2-9]{4}/)[0], OY.waLink(inv.guest_phone_e164, m.full), t("member.detail.reset_done"));
      });
      if (b.getAttribute("data-a") === "cancel") confirmBox(t("member.guest_actions.cancel"), t("member.guest_actions.cancel_confirm", { guest: inv.guest_first_name }), t("member.guest_actions.cancel"), function () { OY.cancel(inv.id, "admin"); }, true);
    });
  };
  function keyDialog(name, key, waHref, note) {
    dialog("<h2>" + esc(t("admin.members.key_title")) + "</h2>" + '<div class="keybox" style="margin:12px 0 4px"><div class="keychip">' + icon("key") + "<div><span class=\"label\">" + esc(name) + "</span><br><b>" + esc(key) + "</b></div></div><p style=\"margin:0;color:#5C4410\">" + esc(note) + '</p></div><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-close>' + esc(t("admin.members.cancel")) + '</button><a class="btn btn-gold btn-sm" href="' + esc(waHref) + '" target="_blank" rel="noopener" data-ok>' + icon("whatsapp") + "<span>" + esc(t("member.new_invite.send")) + "</span></a></div>");
  }

  /* ---------- Payments to confirm ---------- */
  VIEWS.payments = function (v) {
    var list = OY.claims(), adminId = OY.admin().id;
    var html = top(t("admin.payments.title"), t("admin.payments.subtitle"), '<button class="btn btn-ghost btn-sm" type="button" id="match">' + icon("search") + "<span>" + esc(t("admin.payments.manual_match")) + "</span></button>");
    html += '<div class="warning" role="note">' + icon("lock") + "<div><b>" + esc(t("admin.payments.warning")) + "</b></div></div>";
    if (!list.length) html += '<section class="card empty-state">' + K.miniSeal("✓") + "<p>" + esc(t("admin.payments.empty")) + "</p></section>";
    else html += '<div class="claims">' + list.map(function (c) {
      var p = c.payment, paidBy = c.payer ? c.payer.first_name : c.invite.guest_first_name;
      return '<section class="card claim">' +
        "<div>" + who(c.invite.guest_first_name, t("admin.payments.columns")[1] + " " + paidBy) + "</div>" +
        '<div><span class="k">' + esc(t("admin.payments.columns")[2]) + '</span><span class="amount">' + esc(c.amount) + '</span></div>' +
        '<div><span class="k">' + esc(t("admin.payments.columns")[3]) + '</span><span class="ref">' + esc(p.reference) + '</span><span class="k" style="margin-top:8px">' + esc(t("admin.payments.columns")[4]) + "</span>" + esc(p.sender_name || "") + ' <span class="quiet" style="font-size:12px">&middot; ' + esc(K.timeAgo(p.claimed_at)) + "</span></div>" +
        '<div class="acts"><button class="btn btn-ghost btn-sm" type="button" data-nf="' + p.id + '">' + esc(t("admin.payments.not_found")) + '</button><button class="btn btn-gold btn-sm" type="button" data-ok="' + p.id + '" title="' + esc(t("admin.payments.confirm_note")) + '">' + icon("check") + "<span>" + esc(t("admin.payments.confirm")) + "</span></button></div>" +
        (c.duplicate ? '<p class="dup">' + esc(t("admin.payments.duplicate")) + "</p>" : "") +
        "</section>";
    }).join("") + "</div>";
    v.innerHTML = html;
    v.querySelectorAll("[data-ok]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = OY.confirm(b.getAttribute("data-ok"), adminId); if (!r) return;
        var inv = r.invite;
        K.toast(t("admin.payments.confirmed_toast", { guest: inv.guest_first_name }), r.cardReady ? { label: t("admin.payments.notify_guest", { guest: inv.guest_first_name }), run: function () { K.openLink(OY.waLink(inv.guest_phone_e164, r.message)); } } : null);
      });
    });
    v.querySelectorAll("[data-nf]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = list.find(function (x) { return x.payment.id === b.getAttribute("data-nf"); });
        confirmBox(t("admin.payments.not_found"), t("admin.payments.not_found_confirm", { guest: c.invite.guest_first_name }), t("admin.payments.not_found"), function () {
          OY.notFound(c.payment.id, adminId); K.toast(t("admin.payments.not_found_toast", { guest: c.invite.guest_first_name }));
        });
      });
    });
    v.querySelector("#match").addEventListener("click", function () {
      dialog("<h2>" + esc(t("admin.payments.match_title")) + "</h2><p>" + esc(t("admin.payments.match_help")) + '</p><div class="field" style="margin-top:14px"><input class="input" id="m-q" type="search" placeholder="' + esc(t("admin.guests.search")) + '"></div><div class="match-list" id="m-list"></div><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-close>' + esc(t("admin.members.cancel")) + "</button></div>", function (d, close) {
        var draw = function () {
          var items = OY.matchCandidates(d.querySelector("#m-q").value);
          d.querySelector("#m-list").innerHTML = items.length ? items.map(function (i) { return '<div class="item">' + who(i.guest_first_name, OY.person(i.inviter_id).first_name + " · " + t("member.status." + (i.status === "said_yes" ? "said_yes" : i.status))) + '<button class="btn btn-gold btn-sm" type="button" data-m="' + i.id + '">' + esc(t("admin.payments.match_confirm")) + "</button></div>"; }).join("") : '<p class="quiet">' + esc(t("admin.payments.match_empty")) + "</p>";
        };
        d.querySelector("#m-q").addEventListener("input", draw); draw();
        d.querySelector("#m-list").addEventListener("click", function (e) {
          var b = e.target.closest("[data-m]"); if (!b) return;
          var r = OY.manualConfirm(b.getAttribute("data-m"), adminId); close();
          if (r) K.toast(t("admin.payments.confirmed_toast", { guest: r.invite.guest_first_name }));
        });
      });
    });
  };

  /* ---------- Members ---------- */
  var SLOT_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];
  VIEWS.members = function (v) {
    var ms = OY.members(), cols = t("admin.members.columns");
    var html = top(t("admin.members.title"), t("admin.members.subtitle"), '<button class="btn btn-gold btn-sm" type="button" id="add">' + icon("plus") + "<span>" + esc(t("admin.members.add")) + "</span></button>");
    html += '<section class="card"><div class="table-wrap"><table><thead><tr>' + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      ms.map(function (p) {
        var si = OY.slotInfo(p.id), paid = OY.invitesBy(p.id).filter(function (i) { return i.status === "paid"; }).length;
        var opts = SLOT_OPTIONS.indexOf(p.slot_limit) < 0 && p.slot_limit != null ? SLOT_OPTIONS.concat([p.slot_limit]).sort(function (a, b) { return a - b; }) : SLOT_OPTIONS;
        var slots = p.role === "admin" ? '<span class="quiet">' + esc(t("admin.members.slots_unlimited")) + "</span>" :
          '<select class="input" data-slots="' + p.id + '" aria-label="' + esc(t("admin.members.slots_label") + " " + p.first_name) + '" style="min-height:36px;width:auto;font-size:14px"><option value="u"' + (p.slot_limit == null ? " selected" : "") + ">" + esc(t("admin.members.slots_unlimited")) + "</option>" + opts.map(function (n) { return '<option value="' + n + '"' + (p.slot_limit === n ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select>";
        var meter = si.unlimited ? "" : '<div class="meter"><i class="' + (si.left === 0 ? "gold" : "") + '" style="transform:scaleX(' + Math.min(1, si.used / Math.max(1, si.total)).toFixed(3) + ')"></i></div>';
        return "<tr><td>" + '<div class="who">' + K.miniSeal(p.first_name.charAt(0)) + "<div><b>" + esc(p.first_name) + "</b>" + (p.role === "admin" ? '<span class="role">' + esc(t("admin.members.host")) + "</span>" : "") + "</div></div></td>" +
          '<td class="num-cell">' + esc(OY.phone.local(p.phone_e164)) + "</td>" +
          '<td><div class="slot-cell"><div class="slot-edit">' + slots + "</div>" + meter + "<small>" + esc(si.unlimited ? t("admin.members.slots_used_unlimited", { used: si.used }) : t("admin.members.slots_used", { used: si.used, total: si.total })) + "</small></div></td>" +
          '<td class="taps-cell"><b>' + paid + "</b></td>" +
          '<td><div class="row-actions"><button class="icon-btn" type="button" data-key="' + p.id + '" title="' + esc(t("admin.members.reset_key")) + '" aria-label="' + esc(t("admin.members.reset_key") + " " + p.first_name) + '">' + icon("key") + "</button>" +
          (p.role !== "admin" ? '<button class="icon-btn" type="button" data-rm="' + p.id + '" title="' + esc(t("admin.members.remove")) + '" aria-label="' + esc(t("admin.members.remove") + " " + p.first_name) + '">' + icon("x") + "</button>" : "") + "</div></td></tr>";
      }).join("") + "</tbody></table></div></section>";
    v.innerHTML = html;
    v.querySelectorAll("[data-slots]").forEach(function (s) {
      s.addEventListener("change", function () { OY.setSlots(s.getAttribute("data-slots"), s.value === "u" ? null : Number(s.value)); K.toast(t("admin.members.slots_saved")); });
    });
    v.querySelectorAll("[data-key]").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = OY.person(b.getAttribute("data-key"));
        confirmBox(t("admin.members.reset_key"), t("member.guest_actions.reset_confirm"), t("admin.members.reset_key"), function () {
          var r = OY.resetMemberKey(p.id); keyDialog(p.first_name, r.key, OY.waLink(p.phone_e164, r.message), t("admin.members.key_ready", { member: p.first_name }));
        });
      });
    });
    v.querySelectorAll("[data-rm]").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = OY.person(b.getAttribute("data-rm"));
        confirmBox(t("admin.members.remove"), t("admin.members.remove_confirm", { member: p.first_name }), t("admin.members.remove"), function () { OY.removeMember(p.id); K.toast(t("admin.members.removed", { member: p.first_name })); }, true);
      });
    });
    v.querySelector("#add").addEventListener("click", addMember);
  };
  function addMember() {
    var mode = "number";
    dialog("<h2>" + esc(t("admin.members.add")) + '</h2><form class="form" novalidate style="margin-top:14px" id="am">' +
      '<div class="field"><label for="am-name">' + esc(t("admin.members.name_label")) + '</label><input class="input" id="am-name" autocapitalize="words" autocomplete="off"><p class="error" id="am-name-err" hidden></p></div>' +
      '<div class="field"><label for="am-phone">' + esc(t("admin.members.phone_label")) + '</label><input class="input num" id="am-phone" type="tel" inputmode="tel" placeholder="' + esc(t("guest.lock.phone_placeholder")) + '"><p class="error" id="am-phone-err" hidden></p></div>' +
      '<div class="field"><span class="label">' + esc(t("admin.members.slots_label")) + '</span><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="seg" role="group"><button type="button" data-m="number" aria-pressed="true">' + esc(t("admin.members.slots_number")) + '</button><button type="button" data-m="unlimited" aria-pressed="false">' + esc(t("admin.members.slots_unlimited")) + '</button></div><input class="input num" id="am-slots" type="number" min="1" max="50" value="3" style="width:90px;min-height:40px" aria-label="' + esc(t("admin.members.slots_label")) + '"></div></div>' +
      '<div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-close>' + esc(t("admin.members.cancel")) + '</button><button class="btn btn-gold btn-sm" type="submit">' + esc(t("admin.members.save")) + "</button></div></form>", function (d, close) {
      var ph = d.querySelector("#am-phone");
      ph.addEventListener("input", function () { if (ph.selectionStart === ph.value.length) ph.value = OY.phone.typing(ph.value); });
      d.querySelector(".seg").addEventListener("click", function (e) {
        var b = e.target.closest("[data-m]"); if (!b) return; mode = b.getAttribute("data-m");
        d.querySelectorAll(".seg button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        d.querySelector("#am-slots").hidden = mode === "unlimited";
      });
      d.querySelector("#am").addEventListener("submit", function (e) {
        e.preventDefault();
        var r = OY.addMember({ first_name: d.querySelector("#am-name").value, phone: ph.value, slot_limit: mode === "unlimited" ? null : Number(d.querySelector("#am-slots").value || 1) });
        ["name", "phone"].forEach(function (k) { var el = d.querySelector("#am-" + k + "-err"); el.hidden = !(r.errors && r.errors[k]); el.textContent = r.errors && r.errors[k] || ""; });
        if (r.errors) return;
        close();
        keyDialog(r.person.first_name, r.key, OY.waLink(r.person.phone_e164, r.message), t("admin.members.key_ready", { member: r.person.first_name }));
      });
    });
  }

  /* ---------- Invite someone ---------- */
  VIEWS.invite = function (v) {
    v.innerHTML = top(t("admin.nav.invite"), t("admin.invite.subtitle")) + '<section class="card card-pad composer-wrap" id="composer"></section>';
    OYComposer.mount(v.querySelector("#composer"), { inviterId: OY.admin().id, onDone: function () { location.hash = "guests"; } });
  };

  /* ---------- Event settings ---------- */
  var MODES = ["card", "after_payment", "at_time", "hidden"];
  function lagosDate(ts) { return new Date(ts + 3600e3).toISOString().slice(0, 10); }
  function lagosTime(ts) { return new Date(ts + 3600e3).toISOString().slice(11, 16); }
  function lagosLocal(ts) { return ts ? new Date(ts + 3600e3).toISOString().slice(0, 16) : ""; }
  function fromLagos(date, time) { var v = Date.parse(date + "T" + (time || "00:00") + ":00Z"); return isNaN(v) ? null : v - 3600e3; }
  VIEWS.event = function (v) {
    var e = OY.event(), opts = t("admin.event.reveal_options"), sec = t("admin.event.sections");
    var sel = function (id, val) { return '<select class="input" id="' + id + '">' + MODES.map(function (m, i) { return '<option value="' + m + '"' + (val === m ? " selected" : "") + ">" + esc(opts[i]) + "</option>"; }).join("") + "</select>"; };
    var f = function (id, label, input, help) { return '<div class="field"><label for="' + id + '">' + esc(label) + "</label>" + input + (help ? '<span class="help">' + esc(help) + "</span>" : "") + "</div>"; };
    v.innerHTML = top(t("admin.event.title"), t("admin.event.subtitle")) +
      '<div class="settings"><form class="grid" id="ev" novalidate>' +
        '<section class="card fieldset"><h2>' + esc(sec[0]) + "</h2>" +
          f("e-name", t("admin.event.name_label"), '<input class="input" id="e-name" value="' + esc(e.name) + '">', t("admin.event.name_help")) +
          '<div class="cols">' + f("e-date", t("admin.event.date_label"), '<input class="input" type="date" id="e-date" value="' + lagosDate(e.starts_at) + '">') + f("e-time", t("admin.event.time_label"), '<input class="input" type="time" id="e-time" value="' + lagosTime(e.starts_at) + '">') + "</div>" +
          '<div class="cols">' + f("e-venue", t("admin.event.venue_label"), '<input class="input" id="e-venue" value="' + esc(e.venue_name) + '">') + f("e-addr", t("admin.event.venue_address_label"), '<input class="input" id="e-addr" value="' + esc(e.venue_address) + '">') + "</div>" +
          f("e-dress", t("admin.event.dress_label"), '<input class="input" id="e-dress" value="' + esc(e.dress_code) + '">') +
        "</section>" +
        '<section class="card fieldset"><h2>' + esc(sec[1]) + "</h2>" +
          f("e-price", t("admin.event.price_label"), '<div class="input-affix"><span class="affix">₦</span><input class="input num" type="number" min="0" step="500" id="e-price" value="' + Math.round(e.price_kobo / 100) + '"></div>') +
          f("e-refund", t("admin.event.refund_label"), '<textarea class="input" id="e-refund" rows="2">' + esc(e.refund_text) + "</textarea>") +
        "</section>" +
        '<section class="card fieldset"><h2>' + esc(sec[2]) + "</h2>" +
          '<div class="cols">' + f("e-cap", t("admin.event.capacity_label"), '<input class="input num" type="number" min="0" id="e-cap" value="' + (e.capacity || "") + '">', t("admin.event.capacity_help")) +
          f("e-hold", t("admin.event.hold_label"), '<div class="suffix"><input class="input num" type="number" min="1" id="e-hold" value="' + e.hold_window_hours + '"><span>' + esc(t("admin.event.hours")) + "</span></div>", t("admin.event.hold_help")) + "</div>" +
          '<div class="cols">' + f("e-unopened", t("admin.event.unopened_label"), '<div class="suffix"><input class="input num" type="number" min="1" id="e-unopened" value="' + e.unopened_expiry_days + '"><span>' + esc(t("admin.event.days")) + "</span></div>") + "<div></div></div>" +
          '<label class="switch" for="e-open" style="padding-top:4px"><span><b style="font-weight:600">' + esc(t("admin.event.invites_open_label")) + '</b></span><input type="checkbox" id="e-open"' + (e.invites_open ? " checked" : "") + "></label>" +
        "</section>" +
        '<section class="card fieldset"><h2>' + esc(sec[3]) + "</h2>" +
          '<div class="reveal-row">' + f("e-rd", t("admin.event.reveal_date"), sel("e-rd", e.reveal_date_mode)) + '<div class="field" id="e-rd-at-wrap"' + (e.reveal_date_mode === "at_time" ? "" : " hidden") + '><label for="e-rd-at">' + esc(t("admin.event.reveal_at_label")) + '</label><input class="input" type="datetime-local" id="e-rd-at" value="' + lagosLocal(e.reveal_date_at) + '"></div></div>' +
          '<div class="reveal-row">' + f("e-rv", t("admin.event.reveal_venue"), sel("e-rv", e.reveal_venue_mode)) + '<div class="field" id="e-rv-at-wrap"' + (e.reveal_venue_mode === "at_time" ? "" : " hidden") + '><label for="e-rv-at">' + esc(t("admin.event.reveal_at_label")) + '</label><input class="input" type="datetime-local" id="e-rv-at" value="' + lagosLocal(e.reveal_venue_at) + '"></div></div>' +
        "</section>" +
        '<div class="save-bar"><span class="saved" id="saved" hidden>' + icon("check") + "<span>" + esc(t("admin.event.saved")) + '</span></span><button class="btn btn-gold" type="submit">' + esc(t("admin.event.save")) + "</button></div>" +
      "</form>" +
      '<aside class="preview" aria-label="' + esc(t("admin.event.preview_title")) + '"><p class="eyebrow" style="color:var(--gold-700)">' + esc(t("admin.event.preview_title")) + '</p><div class="stage"><div class="pv-card" id="pv"></div></div><p class="help">' + esc(t("admin.event.preview_help")) + "</p></aside></div>";
    var form = v.querySelector("#ev"), $ = function (id) { return v.querySelector("#" + id); };
    function read() {
      return {
        name: $("e-name").value.trim() || e.name, starts_at: fromLagos($("e-date").value, $("e-time").value) || e.starts_at,
        venue_name: $("e-venue").value.trim(), venue_address: $("e-addr").value.trim(), dress_code: $("e-dress").value.trim(),
        price_kobo: Math.max(0, Math.round(Number($("e-price").value || 0) * 100)), refund_text: $("e-refund").value.trim() || t("admin.event.refund_default"),
        capacity: $("e-cap").value ? Math.max(0, Number($("e-cap").value)) : null, hold_window_hours: Math.max(1, Number($("e-hold").value || 72)),
        unopened_expiry_days: Math.max(1, Number($("e-unopened").value || 7)), invites_open: $("e-open").checked,
        reveal_date_mode: $("e-rd").value, reveal_date_at: $("e-rd").value === "at_time" ? fromLagos($("e-rd-at").value.slice(0, 10), $("e-rd-at").value.slice(11, 16)) : null,
        reveal_venue_mode: $("e-rv").value, reveal_venue_at: $("e-rv").value === "at_time" ? fromLagos($("e-rv-at").value.slice(0, 10), $("e-rv-at").value.slice(11, 16)) : null
      };
    }
    function hint(mode, at, starts) {
      if (mode === "after_payment") return t("guest.card.reveal_after_payment");
      if (mode === "at_time" && at) { var h = Math.round((starts - at) / 3600e3); return h > 0 && h <= 96 ? t("guest.card.reveal_hours_before", { n: h }) : t("guest.card.reveal_on_date", { date: new Date(at).toLocaleDateString("en-GB", { timeZone: K.TZ, day: "numeric", month: "long" }) }); }
      return t("guest.card.revealed_soon_short");
    }
    function preview() {
      var d = read(), me = OY.admin();
      var ds = OY.revealed(d.reveal_date_mode, d.reveal_date_at, false), vs = OY.revealed(d.reveal_venue_mode, d.reveal_venue_at, false);
      $("pv").innerHTML = '<p class="ev">' + esc(d.name) + '</p><p class="sal">Ada,</p><h3>' + esc(t("guest.card.headline", { inviter: me.first_name })) + "</h3><dl>" +
        "<dt>" + esc(t("guest.card.date_label")) + '</dt><dd class="' + (ds ? "" : "muted") + '">' + esc(ds ? OY.fmtEventDate(d.starts_at) : t("guest.card.date_hidden")) + "</dd>" +
        "<dt>" + esc(t("guest.card.venue_label")) + '</dt><dd class="' + (vs ? "" : "muted") + '">' + esc(vs ? d.venue_name : t("guest.card.venue_hidden", { venue_reveal_hint: hint(d.reveal_venue_mode, d.reveal_venue_at, d.starts_at) })) + "</dd>" +
        "<dt>" + esc(t("guest.card.dress_label")) + "</dt><dd>" + esc(d.dress_code) + "</dd>" +
        "<dt>" + esc(t("guest.card.price_label")) + '</dt><dd class="price">' + esc(OY.money.fmt(d.price_kobo)) + "</dd></dl>" +
        '<p class="q">' + esc(t("guest.card.question")) + '</p><div class="yn"><span class="y">' + esc(t("guest.card.yes")) + '</span><span class="n">' + esc(t("guest.card.no")) + "</span></div>";
      $("e-rd-at-wrap").hidden = d.reveal_date_mode !== "at_time";
      $("e-rv-at-wrap").hidden = d.reveal_venue_mode !== "at_time";
    }
    form.addEventListener("input", function () { $("saved").hidden = true; preview(); });
    form.addEventListener("change", preview);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      OY.updateEvent(read()); $("saved").hidden = false; updateNav();
      document.querySelector(".side .brand b").textContent = OY.event().name;
      if (!K.reduced) K.anim($("saved"), [{ opacity: 0, transform: "translateX(6px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: K.EASE.out });
    });
    preview();
  };

  /* ---------- Payout account ---------- */
  VIEWS.account = function (v) {
    var accts = OY.accounts().sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0); });
    v.innerHTML = top(t("admin.account.title"), t("admin.account.subtitle")) +
      '<p class="quiet" style="margin:-12px 0 20px">' + esc(t("admin.account.body")) + " " + esc(t("admin.account.switch_note")) + "</p>" +
      (accts.length ? '<div class="accounts">' + accts.map(function (a) {
        return '<article class="bank' + (a.active ? "" : " inactive") + '"><div class="bank-top"><b>' + esc(a.bank_name) + "</b>" + (a.active ? '<span class="chip chip-paid">' + esc(t("admin.account.active")) + "</span>" : "") + '</div><div class="acct">' + esc(a.account_number.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3")) + '</div><div class="name">' + esc(a.account_name) + "</div>" +
          (a.active ? "" : '<button class="btn btn-ghost btn-sm" type="button" data-act="' + a.id + '">' + esc(t("admin.account.set_active")) + "</button>") + "</article>";
      }).join("") + "</div>" : '<section class="card empty-state"><p>' + esc(t("admin.account.empty")) + "</p></section>") +
      '<section class="card fieldset" style="margin-top:22px;max-width:640px"><h2>' + esc(t("admin.account.add")) + '</h2><form class="form" id="acct" novalidate>' +
        '<div class="cols"><div class="field"><label for="a-bank">' + esc(t("admin.account.bank_label")) + '</label><input class="input" id="a-bank"><p class="error" id="a-bank-err" hidden></p></div>' +
        '<div class="field"><label for="a-num">' + esc(t("admin.account.number_label")) + '</label><input class="input num" id="a-num" inputmode="numeric" maxlength="10"><p class="error" id="a-number-err" hidden></p></div></div>' +
        '<div class="field"><label for="a-name">' + esc(t("admin.account.name_label")) + '</label><input class="input" id="a-name"><span class="help">' + esc(t("admin.account.name_help")) + '</span><p class="error" id="a-name-err" hidden></p></div>' +
        '<div><button class="btn btn-gold" type="submit">' + esc(t("admin.account.save")) + "</button></div></form></section>";
    v.querySelectorAll("[data-act]").forEach(function (b) { b.addEventListener("click", function () { OY.setActiveAccount(b.getAttribute("data-act")); K.toast(t("admin.account.switch_note")); }); });
    v.querySelector("#acct").addEventListener("submit", function (e) {
      e.preventDefault();
      var r = OY.addAccount({ bank_name: v.querySelector("#a-bank").value, account_number: v.querySelector("#a-num").value, account_name: v.querySelector("#a-name").value });
      ["bank", "number", "name"].forEach(function (k) { var el = v.querySelector("#a-" + k + "-err"); el.hidden = !(r.errors && r.errors[k]); el.textContent = r.errors && r.errors[k] || ""; });
    });
  };

  /* ---------- Door ---------- */
  VIEWS.door = function (v) {
    var paid = OY.paidList(), inside = paid.filter(function (i) { return i.checked_in_at; }).length;
    var list = paid.filter(function (i) { return !doorQ || i.guest_first_name.toLowerCase().indexOf(doorQ.toLowerCase()) >= 0; });
    v.innerHTML = top(t("admin.door.title"), t("admin.door.subtitle"), '<button class="btn btn-ghost btn-sm" type="button" id="dl">' + icon("download") + "<span>" + esc(t("admin.door.download")) + "</span></button>") +
      '<div class="door"><section class="card scan"><div class="viewfinder" id="vf"><div class="idle">' + icon("qr") + '<button class="btn btn-gold" type="button" id="scan">' + esc(t("admin.door.scan")) + "</button></div></div>" +
        '<form class="code-row" id="code" novalidate><label class="sr" for="d-code">' + esc(t("admin.door.code_placeholder")) + '</label><input class="input" id="d-code" placeholder="' + esc(t("admin.door.code_placeholder")) + '" autocomplete="off" autocapitalize="characters"><button class="btn btn-gold" type="submit">' + esc(t("admin.door.check")) + "</button></form>" +
        '<div id="result" aria-live="assertive">' + resultHTML() + "</div></section>" +
      '<section class="card"><div class="toolbar"><span class="inside">' + esc(t("admin.door.checked_in", { n: inside, total: paid.length })) + '</span><label class="search" style="margin-left:auto">' + icon("search") + '<span class="sr">' + esc(t("admin.door.search")) + '</span><input class="input" type="search" id="d-q" placeholder="' + esc(t("admin.door.search")) + '" value="' + esc(doorQ) + '"></label></div>' +
        '<div class="list-rows">' + (list.length ? list.map(function (i) {
          return '<div class="item">' + who(i.guest_first_name, t("guest.ticket.invited_by", { inviter: OY.person(i.inviter_id).first_name }) + " · " + i.ticket_code) +
            (i.checked_in_at ? '<span class="in-tag">' + icon("check") + esc(t("admin.door.inside")) + " " + esc(K.fmtTime(i.checked_in_at)) + "</span>" : '<button class="btn btn-ghost btn-sm" type="button" data-in="' + i.id + '">' + esc(t("admin.door.check")) + "</button>") + "</div>";
        }).join("") : '<p class="empty-row">' + esc(t("admin.guests.empty")) + "</p>") + "</div></section></div>";
    var q = v.querySelector("#d-q");
    q.addEventListener("input", function () { doorQ = q.value; var pos = q.selectionStart; VIEWS.door(v); var nq = v.querySelector("#d-q"); nq.focus(); nq.setSelectionRange(pos, pos); });
    v.querySelector("#code").addEventListener("submit", function (e) { e.preventDefault(); handle(OY.door(v.querySelector("#d-code").value)); });
    v.querySelectorAll("[data-in]").forEach(function (b) { b.addEventListener("click", function () { handle(OY.checkIn(b.getAttribute("data-in"))); }); });
    v.querySelector("#dl").addEventListener("click", function () {
      try { localStorage.setItem("oy.door.offline", JSON.stringify(OY.paidList().map(function (i) { return { name: i.guest_first_name, inviter: OY.person(i.inviter_id).first_name, code: i.ticket_code }; }))); } catch (er) {}
      K.toast(t("admin.door.downloaded", { n: paid.length }));
    });
    v.querySelector("#scan").addEventListener("click", startCamera);
  };
  function handle(r) {
    lastResult = r; K.haptic(r.kind === "valid" ? 30 : [40, 60, 40]);
    if (current === "door") VIEWS.door(document.getElementById("view"));
  }
  function resultHTML() {
    var r = lastResult; if (!r) return "";
    var name = r.invite ? r.invite.guest_first_name : "";
    var line = r.kind === "valid" ? t("admin.door.valid", { guest: name }) : r.kind === "already" ? t("admin.door.already", { time: K.fmtTime(r.invite.checked_in_at) }) : r.kind === "unpaid" ? t("admin.door.unpaid") : t("admin.door.invalid");
    var sub = r.invite ? t("guest.ticket.invited_by", { inviter: OY.person(r.invite.inviter_id).first_name }) : "";
    return '<div class="result ' + r.kind + '">' + K.miniSeal(r.kind === "valid" ? "✓" : r.kind === "already" ? "!" : "×", r.kind !== "valid") + "<div>" + esc(line) + (sub ? "<small>" + esc(name + " · " + sub) + "</small>" : "") + "</div></div>";
  }
  function startCamera() {
    var vf = document.getElementById("vf");
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices) { K.toast(t("admin.door.camera_unavailable")); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function (s) {
      stream = s;
      vf.innerHTML = '<video playsinline muted autoplay></video><span class="frame"></span><button class="btn btn-ghost btn-sm" type="button" id="stop" style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);color:var(--mist-100)">' + esc(t("admin.door.camera_stop")) + "</button>";
      var video = vf.querySelector("video"); video.srcObject = s;
      vf.querySelector("#stop").addEventListener("click", function () { stopCamera(); VIEWS.door(document.getElementById("view")); });
      var det = new window.BarcodeDetector({ formats: ["qr_code"] });
      var loop = function () {
        if (!stream) return;
        det.detect(video).then(function (codes) {
          if (codes.length) { var val = codes[0].rawValue; stopCamera(); handle(OY.door(val)); return; }
          setTimeout(loop, 300);
        }).catch(function () { setTimeout(loop, 500); });
      };
      loop();
    }).catch(function () { K.toast(t("admin.door.camera_unavailable")); });
  }
  function stopCamera() { if (stream) { stream.getTracks().forEach(function (tr) { tr.stop(); }); stream = null; } }

  /* ---------- Login ---------- */
  function login() {
    var e = OY.event();
    root.innerHTML = '<div class="login-wrap"><div class="login-art surface-dark bg-club">' + K.envelopeHTML({ mark: t("guest.lock.envelope_mark") }) + "<p>" + esc(t("guest.preview_card.og_description")) + "</p></div>" +
      '<div class="login-form"><form novalidate id="login"><p class="eyebrow">' + esc(e.name) + '</p><h1 class="display">' + esc(t("admin.login.title")) + '</h1><p class="lede">' + esc(t("admin.login.body", { event: e.name })) + "</p>" +
        '<div class="field"><label for="l-email">' + esc(t("admin.login.email_label")) + '</label><input class="input" id="l-email" type="email" autocomplete="username"></div>' +
        '<div class="field"><label for="l-pass">' + esc(t("admin.login.password_label")) + '</label><input class="input" id="l-pass" type="password" autocomplete="current-password"></div>' +
        '<button class="btn btn-gold btn-wide" type="submit" style="min-height:52px">' + esc(t("admin.login.submit")) + '</button><p class="help" style="text-align:center">' + esc(t("admin.login.prototype")) + "</p></form></div></div>";
    document.getElementById("login").addEventListener("submit", function (ev) { ev.preventDefault(); OY.session.setAdmin(true); render(); });
  }

  /* ---------- Live updates ---------- */
  OY.subscribe(function () {
    if (!current || document.querySelector(".overlay")) { updateNav(); return; }
    updateNav();
    if (LIVE[current] && !(document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) {
      var view = document.getElementById("view"), y = window.scrollY;
      VIEWS[current](view); window.scrollTo(0, y);
    }
  });
  setInterval(function () { if (current === "payments" && !document.hidden) updateNav(); }, 20000);

  /* ---------- Prototype panel ---------- */
  var protoBtn = document.getElementById("proto-btn"), panel = document.getElementById("proto-panel");
  protoBtn.addEventListener("click", function () { var open = panel.hidden; panel.hidden = !open; protoBtn.setAttribute("aria-expanded", String(open)); });
  document.getElementById("proto-reset").addEventListener("click", function () { OY.reset(); OY.session.setAdmin(true); panel.hidden = true; root.innerHTML = ""; render(); });

  render();
})();
