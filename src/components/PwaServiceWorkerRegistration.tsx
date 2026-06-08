"use client";

import { useEffect } from "react";

export function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV === "development") {
      void unregisterDevelopmentServiceWorkers();
      return;
    }

    function registerServiceWorker() {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }

    window.addEventListener("load", registerServiceWorker, { once: true });

    return () => {
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  return null;
}

async function unregisterDevelopmentServiceWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);

  await Promise.all(registrations.map((registration) => registration.unregister()));
  await clearPipDevelopmentCaches();

  if (!navigator.serviceWorker.controller) {
    return;
  }

  try {
    const reloadKey = "pip-dev-service-worker-cleared";

    if (window.sessionStorage.getItem(reloadKey)) {
      return;
    }

    window.sessionStorage.setItem(reloadKey, "1");
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

async function clearPipDevelopmentCaches() {
  if (!("caches" in window)) {
    return;
  }

  const cacheNames = await window.caches.keys().catch(() => []);

  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith("pip-"))
      .map((cacheName) => window.caches.delete(cacheName)),
  );
}
