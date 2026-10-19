import Link from "next/link";
import { AdminNav, PhoneTabs, type NavItem } from "@/components/admin/AdminNav";
import { Icon } from "@/components/Icon";
import { LogoMark } from "@/components/brand/Logo";
import { SubmitButton } from "@/components/SubmitButton";
import { ToastProvider } from "@/components/Toast";
import { requireAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { db } from "@/lib/db";
import { getEvent } from "@/lib/settings";
import { signOut } from "../login/actions";

const NAV: NavItem[] = [
  {
    href: "/admin",
    label: t("admin.nav.overview"),
    icon: "overview",
    exact: true,
    primary: true,
    short: t("admin.nav.short.overview"),
  },
  {
    href: "/admin/guests",
    label: t("admin.nav.guests"),
    icon: "guests",
    primary: true,
    short: t("admin.nav.short.guests"),
  },
  {
    href: "/admin/payments",
    label: t("admin.nav.payments"),
    icon: "payments",
    badge: "payments",
    primary: true,
    short: t("admin.nav.short.payments"),
  },
  {
    href: "/admin/invite",
    label: t("admin.nav.invite"),
    icon: "invite",
    primary: true,
    short: t("admin.nav.short.invite"),
  },
  { href: "/admin/members", label: t("admin.nav.members"), icon: "members" },
  { href: "/admin/event", label: t("admin.nav.event"), icon: "event" },
  { href: "/admin/account", label: t("admin.nav.account"), icon: "account" },
  { href: "/admin/door", label: t("admin.nav.door"), icon: "door" },
  {
    href: "/board",
    label: t("admin.nav.board"),
    icon: "board",
    external: true,
  },
];
const EVENTS: NavItem = {
  href: "/admin/events",
  label: t("admin.nav.events"),
  icon: "calendar",
};

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const event = admin.eventId != null ? await getEvent(admin.eventId) : null;
  const { count: claims } = event
    ? await db().from("payments").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("status", "claimed")
    : { count: 0 };
  const owner = admin.role === "superadmin";
  // The superadmin gets All events first; an event's own pages follow for the event they have open.
  const nav = owner ? (event ? [EVENTS, ...NAV] : [{ ...EVENTS, primary: true }]) : NAV;
  const where = event?.name ?? t("admin.nav.events");
  const badges = { payments: claims ?? 0 };
  const status = (
    <div className={!event || event.invites_open ? "status-line" : "status-line off"}>
      <i />
      <span>{!event || event.invites_open ? t("admin.event.invites_open_label") : t("guest.closed.title")}</span>
    </div>
  );
  const signOutForm = (
    <form action={signOut}>
      <SubmitButton className="btn btn-quiet">
        <Icon name="logout" />
        <span>
          {admin.first_name} · {t("member.login.signout")}
        </span>
      </SubmitButton>
    </form>
  );
  return (
    <ToastProvider>
      <div className="admin">
        <aside className="side surface-dark">
          <div className="brand">
            <LogoMark size={40} />
            <span>
              <b>{where}</b>
              {owner ? (
                <Link className="switch-link" href="/admin/events">
                  {t("admin.nav.switch")}
                </Link>
              ) : (
                <small>{t("admin.members.host")}</small>
              )}
            </span>
          </div>
          <AdminNav items={nav} label={t("admin.nav.label")} badges={badges} />
          <div className="side-foot">
            {status}
            {signOutForm}
          </div>
        </aside>
        <header className="phone-bar surface-dark">
          <LogoMark size={30} />
          <b>{where}</b>
          {owner ? (
            <Link className="switch-link" href="/admin/events">
              {t("admin.nav.switch")}
            </Link>
          ) : (
            status
          )}
        </header>
        <main className="main" id="view" tabIndex={-1}>
          {children}
        </main>
        <PhoneTabs
          items={nav}
          label={t("admin.nav.label")}
          moreLabel={t("admin.nav.more")}
          closeLabel={t("admin.nav.close")}
          allLabel={t("admin.nav.all_pages")}
          badges={badges}
          footer={signOutForm}
        />
      </div>
    </ToastProvider>
  );
}
