import "../admin/admin.css";

// Each event's admin sign in lives outside /admin, so it never lands in the super admin's portal.
export default function HostRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-root surface-paper bg-paper">{children}</div>;
}
