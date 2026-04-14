const CACHE_NAME = "aidesuka-offline-v1";
const swUrl = new URL(self.location.href);
const basePath = swUrl.pathname.replace(/\/sw\.js$/, "");

function withBasePath(path) {
  return `${basePath}${path}`;
}

const CORE_URLS = [
  withBasePath("/"),
  withBasePath("/favicon.ico"),
  withBasePath("/models/model_quantized.onnx"),
  withBasePath("/models/config.json"),
  withBasePath("/models/preprocessor_config.json"),
  withBasePath("/models/ort_config.json"),
  withBasePath("/ort/ort-wasm-simd-threaded.wasm"),
  withBasePath("/ort/ort-wasm-simd-threaded.mjs"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }

          return Promise.resolve(false);
        }),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const isNavigation = request.mode === "navigate";
  const isModelAsset =
    url.pathname.startsWith(withBasePath("/models/")) ||
    url.pathname.startsWith(withBasePath("/ort/"));

  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cached =
            (await caches.match(request)) || (await caches.match(withBasePath("/")));

          if (cached) {
            return cached;
          }

          throw new Error("Offline and no cached navigation response available");
        }
      })(),
    );
    return;
  }

  if (isModelAsset) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);

        if (cached) {
          return cached;
        }

        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      if (cached) {
        return cached;
      }

      const response = await fetch(request);

      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }

      return response;
    })(),
  );
});
