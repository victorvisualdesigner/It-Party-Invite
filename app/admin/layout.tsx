import "./admin.css";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-root surface-paper bg-paper">{children}</div>;
}
