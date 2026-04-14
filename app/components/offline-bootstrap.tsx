"use client";

import { useEffect } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const CACHE_NAME = "aidesuka-offline-v1";

function withBasePath(path: string) {
  return `${BASE_PATH}${path}`;
}

export default function OfflineBootstrap() {
  useEffect(() => {
    async function warmOfflineCache() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("caches" in window)
      ) {
        return;
      }

      const cache = await caches.open(CACHE_NAME);
      const urls = new Set<string>([
        withBasePath("/"),
        withBasePath("/favicon.ico"),
        withBasePath("/models/model_quantized.onnx"),
        withBasePath("/models/config.json"),
        withBasePath("/models/preprocessor_config.json"),
        withBasePath("/models/ort_config.json"),
        withBasePath("/ort/ort-wasm-simd-threaded.wasm"),
        withBasePath("/ort/ort-wasm-simd-threaded.mjs"),
      ]);

      const assetElements = document.querySelectorAll(
        'script[src], link[rel="stylesheet"][href], link[as="script"][href]',
      );

      for (const element of assetElements) {
        const src =
          element instanceof HTMLScriptElement
            ? element.src
            : element instanceof HTMLLinkElement
              ? element.href
              : "";

        if (!src) {
          continue;
        }

        const url = new URL(src, window.location.origin);

        if (url.origin === window.location.origin) {
          urls.add(url.toString());
        }
      }

      await Promise.all(
        Array.from(urls).map(async (url) => {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn("Offline cache warm failed for", url, error);
          }
        }),
      );
    }

    async function setupOffline() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
        return;
      }

      try {
        await navigator.serviceWorker.register(withBasePath("/sw.js"), {
          scope: withBasePath("/"),
          updateViaCache: "none",
        });
        await warmOfflineCache();
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    }

    void setupOffline();
  }, []);

  return null;
}
