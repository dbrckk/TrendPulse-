// sw.js (Service Worker)

const CACHE_NAME = "trendpulse-v1";

const urlsToCache = [
  "/",
  "/index.html",
  "/deals.html",
  "/deal.html",
  "/best-sellers.html",
  "/cheap-tech.html",
  "/best-gifts.html",
  "/affiliate-disclosure.html",
  "/privacy.html",
  "/terms.html",
  "/contact.html",
  "/manifest.json",
  "/assets/js/trendpulse-data.js",
  "/assets/js/trendpulse-ui.js"
];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate (cleanup old cache)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      )
    )
  );
});

// Fetch (cache first)
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request).then((fetchResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        }).catch(() => {
          return caches.match("/index.html");
        })
      );
    })
  );
});
