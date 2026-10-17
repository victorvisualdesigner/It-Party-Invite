import { redirect } from "next/navigation";

// Overview arrives in Phase 5. Until then the portal opens on Event settings.
export default function AdminHome() {
  redirect("/admin/event");
}
