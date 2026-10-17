import type { Metadata } from "next";
import { t } from "@/lib/copy";
import "../composer.css";
import "./member.css";

export const metadata: Metadata = { title: t("member.login.title") };

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <div className="member-root surface-dark bg-club">{children}</div>;
}
