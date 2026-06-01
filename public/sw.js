/* Service worker — PWA cache-first pour assets JS/CSS, network-first pour HTML */
const CACHE = "ac-crm-v3";
const SHELL = ["./manifest.json", "./logo.png", "./icon.ico"];

function isHtmlRequest(req) {
  if (req.mode === "navigate") return true;
  const p = new URL(req.url).pathname;
  return p === "/" || p.endsWith(".html");
}

function isStaticAsset(req) {
  const url = new URL(req.url);
  // Assets Vite : noms hachés .js/.css/.woff2/.png dans /assets/
  return /\/assets\/.*\.(js|css|woff2?|png|jpg|svg|webp)(\?.*)?$/.test(url.pathname);
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Requêtes Supabase/API : toujours réseau
  if (url.hostname !== self.location.hostname) {
    return; // pas d'interception
  }

  // HTML : network-first, fallback cache
  if (isHtmlRequest(e.request)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("./")))
    );
    return;
  }

  // Assets statiques Vite (hachés) : cache-first
  if (isStaticAsset(e.request)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Shell statique (manifest, logo)
  if (SHELL.some((a) => url.pathname.endsWith(a.replace("./", "")))) {
    e.respondWith(
      caches.match(e.request).then((r) => r || fetch(e.request))
    );
    return;
  }

  // Tout le reste : réseau simple
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
