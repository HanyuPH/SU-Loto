const CACHE = "su-loto-c2-beta-v10";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./contests.css",
  "./official-results.css",
  "./data/games-1.js",
  "./data/games-2.js",
  "./data/games-3.js",
  "./data/games-4.js",
  "./data/games-5.js",
  "./data/games-6.js",
  "./data/ultimo-concurso.json",
  "./data/concursos-oficiais.json",
  "./contests.js",
  "./official-results.js",
  "./cloud-sync.js",
  "./ecosystem-ui.js",
  "./ecosystem-backup.js",
  "./prize-analysis.js",
  "./contest-bets.js",
  "./contest-bets-cloud.js",
  "./contest-lock.js",
  "./contest-session.js",
  "./beta-banner.js",
  "./beta-layout-review.js",
  "./app.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("su-loto-") && key !== CACHE).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function officialWithCloud(request) {
  const cache = await caches.open(CACHE);
  let response;
  try {
    response = await fetch(request, { cache: "no-store" });
    if (response.ok) await cache.put(request, response.clone());
  } catch {
    response = await cache.match(request);
  }

  const loader = "\n;import('./beta-banner.js?v=10')"
    + ".then(()=>import('./beta-layout-review.js?v=2'))"
    + ".then(()=>import('./cloud-sync.js'))"
    + ".then(()=>import('./ecosystem-ui.js?v=5'))"
    + ".then(()=>import('./ecosystem-backup.js'))"
    + ".then(()=>import('./prize-analysis.js?v=2'))"
    + ".then(()=>import('./contest-bets.js?v=4'))"
    + ".then(()=>import('./contest-bets-cloud.js?v=3'))"
    + ".then(()=>import('./contest-lock.js?v=1'))"
    + ".then(()=>import('./contest-session.js?v=1'))"
    + ".catch(error=>console.error('SU Loto Beta:',error));\n";

  if (!response) {
    return new Response(loader, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  return new Response((await response.text()) + loader, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname.endsWith("/official-results.js")) {
    event.respondWith(officialWithCloud(event.request));
    return;
  }

  if (
    url.pathname.endsWith("/ecosystem-ui.js") ||
    url.pathname.endsWith("/prize-analysis.js") ||
    url.pathname.endsWith("/contest-bets.js") ||
    url.pathname.endsWith("/contest-bets-cloud.js") ||
    url.pathname.endsWith("/contest-lock.js") ||
    url.pathname.endsWith("/contest-session.js") ||
    url.pathname.endsWith("/beta-banner.js") ||
    url.pathname.endsWith("/beta-layout-review.js") ||
    url.pathname.endsWith("/cloud-sync.js") ||
    url.pathname.endsWith("/ecosystem-backup.js")
  ) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
  );
});