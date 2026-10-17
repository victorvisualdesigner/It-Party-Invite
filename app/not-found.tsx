import { t } from "@/lib/copy";

// Nothing public lives here. Unknown paths, including /, get the same quiet page as a stranger.
export default function NotFound() {
  return (
    <main className="surface-dark bg-club notfound">
      <h1 className="display">{t("guest.stranger.title")}</h1>
      <p className="quiet">{t("guest.stranger.body")}</p>
    </main>
  );
}
