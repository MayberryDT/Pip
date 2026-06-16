const STATIC_CACHE_NAME = "pip-static-v7";

const APP_SHELL_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/brand/pip-logo.png",
  "/brand/pip-profile.png",
  "/brand/pip-profile-clean.png",
  "/brand/pip-character/v001/avatar/normal.png",
  "/brand/pip-character/v001/avatar/happy.png",
  "/brand/pip-character/v001/avatar/thinking.png",
  "/brand/pip-character/v001/avatar/concerned.png",
  "/brand/pip-character/v001/medium/onboarding-wave.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== STATIC_CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (shouldBypassCache(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});

function shouldBypassCache(url) {
  if (url.origin !== self.location.origin) {
    return true;
  }

  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.includes("/oauth") ||
    url.pathname.includes("/providers/") ||
    url.pathname.includes("/sync/") ||
    url.pathname.includes("/agent") ||
    url.pathname.includes("/events") ||
    url.pathname.includes("/pip-cash")
  );
}

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (APP_SHELL_ASSETS.includes(url.pathname) || url.pathname.startsWith("/_next/static/"))
  );
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cachedOfflinePage = await caches.match("/offline.html");
    return cachedOfflinePage || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.put(request, response.clone());
  }

  return response;
}
