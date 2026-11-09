// ZENORIA_PWA_V1 : nouveau fichier.
// Service worker MINIMAL, volontairement prudent pour une boutique en ligne :
// il ne met en cache QUE les fichiers strictement STATIQUES et JAMAIS les
// pages HTML ni les appels Supabase (API, stock, panier, commandes, prix).
// Objectif unique ici : rendre le site "installable" (condition technique
// pour qu'iOS/Android proposent "Ajouter à l'écran d'accueil"), pas de
// fonctionnement hors-ligne complet.
//
// Rien de dynamique n'est jamais mis en cache : une cliente verra toujours
// le stock, les prix et l'état de ses commandes à jour, exactement comme
// aujourd'hui sans service worker.

const CACHE_NAME = "zenoria-static-v1";
const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Stratégie "cache d'abord" UNIQUEMENT pour les 3 fichiers listés ci-dessus
// (icônes, manifest). Toute autre requête (pages, API, images produits,
// Supabase...) passe directement au réseau, sans jamais être interceptée
// ni mise en cache.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isTrackedStaticAsset = STATIC_ASSETS.some((asset) => url.pathname === asset);
  if (!isTrackedStaticAsset) return; // laisse passer : comportement réseau normal, inchangé

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
