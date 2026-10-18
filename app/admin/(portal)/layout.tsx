import { AdminNav, type NavItem } from "@/components/admin/AdminNav";
import { Icon } from "@/components/Icon";
import { LogoMark } from "@/components/brand/Logo";
import { ToastProvider } from "@/components/Toast";
import { requireAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { db } from "@/lib/db";
import { getEvent } from "@/lib/settings";
import { signOut } from "../login/actions";

const NAV: NavItem[] = [
  { href: "/admin", label: t("admin.nav.overview"), icon: "overview", exact: true },
  { href: "/admin/guests", label: t("admin.nav.guests"), icon: "guests" },
  { href: "/admin/payments", label: t("admin.nav.payments"), icon: "payments", badge: "payments" },
  { href: "/admin/members", label: t("admin.nav.members"), icon: "members" },
  { href: "/admin/invite", label: t("admin.nav.invite"), icon: "invite" },
  { href: "/admin/event", label: t("admin.nav.event"), icon: "event" },
  { href: "/admin/account", label: t("admin.nav.account"), icon: "account" },
  { href: "/admin/door", label: t("admin.nav.door"), icon: "door" },
  { href: "/board", label: t("admin.nav.board"), icon: "board", external: true },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const event = await getEvent();
  const { count: claims } = await db().from("payments").select("id", { count: "exact", head: true }).eq("status", "claimed");
  return (
    <ToastProvider>
      <div className="admin">
        <aside className="side surface-dark">
          <div className="brand">
            <LogoMark size={40} />
            <span>
              <b>{event.name}</b>
              <small>{t("admin.members.host")}</small>
            </span>
          </div>
          <AdminNav items={NAV} label={t("admin.nav.label")} badges={{ payments: claims ?? 0 }} />
          <div className="side-foot">
            <div className={event.invites_open ? "status-line" : "status-line off"}>
              <i />
              <span>{event.invites_open ? t("admin.event.invites_open_label") : t("guest.closed.title")}</span>
            </div>
            <form action={signOut}>
              <button className="btn btn-quiet" type="submit">
                <Icon name="logout" />
                <span>
                  {admin.first_name} · {t("member.login.signout")}
                </span>
              </button>
            </form>
          </div>
        </aside>
        <main className="main" id="view" tabIndex={-1}>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
