import { notFound } from "next/navigation";

// There is nothing public at the root. Invites live at /i/{token}, members at /m, the host at /admin.
export default function Home() {
  notFound();
}
