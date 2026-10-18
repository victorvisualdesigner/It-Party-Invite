import { Landing } from "@/components/landing/Landing";

// Unknown paths get the same front door, so a mistyped link still feels like part of the event.
export default function NotFound() {
  return <Landing />;
}
