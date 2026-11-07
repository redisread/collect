const CACHE_NAME = "collect-public-__BUILD_ID__";
const PUBLIC_FILES = [
  "/offline", "/collect.svg", "/manifest.webmanifest",
  "/icons/collect-192.png", "/icons/collect-512.png", "/icons/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_FILES)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("collect-public-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  // Authentication, article data and Google requests keep their normal network behavior.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match("/offline") || Response.error();
    }));
  } else if (PUBLIC_FILES.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      return await cache.match(url.pathname) || fetch(request);
    }));
  }
});
