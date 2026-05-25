/* Service worker minimal — PWA shell (no cache on index.html to avoid stale chunk 404s) */
const CACHE = "ac-crm-shell-v2";
const STATIC_ASSETS = ["./manifest.json", "./logo.png"];

function isHtmlRequest(request) {
  if (request.mode === "navigate") return true;
  const path = new URL(request.url).pathname;
  return path === "/" || path.endsWith(".html");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (isHtmlRequest(event.request)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)),
    );
    return;
  }

  const path = new URL(event.request.url).pathname;
  const isStaticShell = STATIC_ASSETS.some((asset) => path.endsWith(asset.replace("./", "")));
  if (isStaticShell) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request)),
    );
    return;
  }

  event.respondWith(fetch(event.request));
});
