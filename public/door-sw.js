// Keeps the Door page usable in airplane mode: the page and its static files are cached the first
// time they load, and served from the cache when the network is gone. Scoped to /admin/door only.
const CACHE = "door-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isPage = req.mode === "navigate" && url.pathname.startsWith("/admin/door");
  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname === "/noise.png";
  if (!isPage && !isStatic) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});
