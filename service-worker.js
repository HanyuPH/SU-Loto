const CACHE = "su-loto-c2-v23-sync-v7";

const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./contests.css",
  "./official-results.css",
  "./bootstrap.js",
  "./firebase-ios-transport.js",
  "./sync-local-first-guard.js",
  "./sync-events.js",
  "./app.js",
  "./contests.js",
  "./official-results.js",
  "./beta-banner.js",
  "./beta-layout-review.js",
  "./cloud-sync.js",
  "./ios-rest-status-refresh.js",
  "./cloud-resume-refresh.js",
  "./ecosystem-ui.js",
  "./ecosystem-backup.js",
  "./prize-analysis.js",
  "./contest-bets.js",
  "./contest-bets-cloud.js",
  "./contest-lock.js",
  "./contest-session.js",
  "./contest-selection-highlight.js",
  "./data/carteira-c2/manifest.json",
  "./data/carteira-c2/games-001-050.json",
  "./data/carteira-c2/games-051-100.json",
  "./data/carteira-c2/games-101-150.json",
  "./data/carteira-c2/games-151-200.json",
  "./data/carteira-c2/games-201-250.json",
  "./data/carteira-c2/games-251-300.json",
  "./data/migrations/v11-operational-seed.json",
  "./data/ultimo-concurso.json",
  "./data/concursos-oficiais.json",
  "./data/concursos-oficiais.csv",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => (
          key.startsWith("stable-su-loto-c2-") ||
          key.startsWith("su-loto-c2-stable-") ||
          key.startsWith("su-loto-c2-beta-") ||
          key.startsWith("su-loto-c2-v23-")
        ) && key !== CACHE)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function cachedIgnoringVersion(request) {
  return caches.match(request, { ignoreSearch: true });
}

async function networkFirst(request, { navigation = false } = {}) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cachedIgnoringVersion(request);
    if (cached) return cached;
    if (navigation) {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, { navigation: true }));
    return;
  }
  event.respondWith(networkFirst(event.request));
});