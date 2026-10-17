import { AdminNav, type NavItem } from "@/components/admin/AdminNav";
import { Icon } from "@/components/Icon";
import { MiniSeal } from "@/components/Seal";
import { ToastProvider } from "@/components/Toast";
import { requireAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { getEvent } from "@/lib/settings";
import { signOut } from "../login/actions";

// Phase 1 screens. Later phases add Overview, Guests, Payments, Invite someone, Door and the Board.
const NAV: NavItem[] = [
  { href: "/admin/members", label: t("admin.nav.members"), icon: "members" },
  { href: "/admin/event", label: t("admin.nav.event"), icon: "event" },
  { href: "/admin/account", label: t("admin.nav.account"), icon: "account" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const event = await getEvent();
  return (
    <ToastProvider>
      <div className="admin">
        <aside className="side surface-dark">
          <div className="brand">
            <MiniSeal letter={event.reference_prefix} />
            <span>
              <b>{event.name}</b>
              <small>{t("admin.members.host")}</small>
            </span>
          </div>
          <AdminNav items={NAV} label={t("admin.nav.label")} />
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
