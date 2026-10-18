import { Landing } from "@/components/landing/Landing";

// The front door. Invites live at /i/{token}, members at /m, the host at /admin.
export default function Home() {
  return <Landing />;
}
