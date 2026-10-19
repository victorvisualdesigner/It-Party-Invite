import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loginLabels } from "@/app/admin/login/labels";
import { LoginForm } from "@/app/admin/login/LoginForm";
import { LoginScene } from "@/components/admin/LoginScene";
import { getAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { db } from "@/lib/db";
import { eventFromHostCode } from "@/lib/host-link";

export const metadata: Metadata = { title: t("admin.host_login.page_title") };
export const dynamic = "force-dynamic";

// One event's admin sign in. The super admin shares this link from the event's card. Only that
// event's admins get in, and they land in the event's own portal, never the super admin's.
export default async function EventAdminLoginPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const eventId = eventFromHostCode(code);
  if (eventId == null) notFound();
  const { data: event } = await db().from("event").select("id, name").eq("id", eventId).maybeSingle();
  if (!event) notFound();

  const me = await getAdmin();
  if (me?.role === "admin" && me.event_id === eventId) redirect("/admin");
  const note = me
    ? { text: t("admin.host_login.signed_in_as", { name: me.first_name }), stayLabel: t("admin.host_login.stay", { name: me.first_name }), stayHref: "/admin" }
    : undefined;
  const name = event.name as string;
  return (
    <LoginScene>
      <LoginForm code={code} note={note} labels={loginLabels(t("admin.host_login.title", { event: name }), t("admin.host_login.footnote", { event: name }))} />
    </LoginScene>
  );
}
