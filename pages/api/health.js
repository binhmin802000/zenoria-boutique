// ============================================================
// pages/api/health.js — sonde de santé du site : GET /api/health
//
//  /api/health          réponse immédiate, sans toucher à Supabase : « le site (Vercel) répond ».
//  /api/health?deep=1   vérifie en plus, DEPUIS LE SERVEUR VERCEL : Supabase (données et
//                       authentification), l'état de la maintenance et les pages de statut de
//                       Vercel et de Supabase. Répond 503 si Supabase ne répond pas, pour
//                       qu'un service de surveillance externe puisse vous alerter.
//
// Ce qui est lu côté serveur évite deux pièges du navigateur : le blocage éventuel du réseau
// de l'entreprise, et les restrictions CORS. L'onglet « Santé » compare les deux points de vue.
//
// Rien de secret n'est renvoyé : ni clé, ni adresse de la base.
// ============================================================

const DEEP_CACHE_MS = 15000; // une seule vérification complète toutes les 15 s, quel que soit le nombre d'appels
const PROVIDERS_CACHE_MS = 60000;

const deepCache = { at: 0, payload: null };
const providersCache = { at: 0, value: null };

async function timedFetch(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    return { res, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function failure(e, timeoutMs) {
  return { ok: false, error: e && e.name === "AbortError" ? "délai dépassé (" + timeoutMs / 1000 + " s)" : "injoignable" };
}

async function checkRest(url, key) {
  try {
    const { res, ms } = await timedFetch(url + "/rest/v1/products?select=id&limit=1", { headers: { apikey: key, Authorization: "Bearer " + key } }, 4000);
    if (res.ok) return { ok: true, ms };
    return { ok: false, ms, status: res.status, error: res.status === 404 ? "table products introuvable (HTTP 404)" : "HTTP " + res.status };
  } catch (e) {
    return failure(e, 4000);
  }
}

// Point de contrôle de l'authentification : ok = true (répond), null = non confirmé (réponse inattendue).
async function checkAuth(url, key) {
  try {
    const { res, ms } = await timedFetch(url + "/auth/v1/health", { headers: { apikey: key } }, 4000);
    if (res.ok) return { ok: true, ms };
    return { ok: null, ms, status: res.status };
  } catch (e) {
    return failure(e, 4000);
  }
}

async function checkMaintenance(url, key) {
  try {
    const { res, ms } = await timedFetch(
      url + "/rest/v1/rpc/get_site_status",
      { method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ preview: null }) },
      4000
    );
    if (res.status === 404) return { ok: null, ms, error: "non installé" };
    if (!res.ok) return { ok: false, ms, error: "HTTP " + res.status };
    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    return { ok: true, ms, mode: row && row.mode ? row.mode : "off" };
  } catch (e) {
    return failure(e, 4000);
  }
}

// Pages de statut des fournisseurs (format Statuspage : { status: { indicator, description } }).
async function readStatusPage(url) {
  try {
    const { res } = await timedFetch(url, { headers: { Accept: "application/json" } }, 3000);
    if (!res.ok) return { ok: null, error: "HTTP " + res.status };
    const json = await res.json();
    const status = json && json.status;
    if (!status || typeof status.indicator !== "string") return { ok: null, error: "format illisible" };
    return { ok: status.indicator === "none", indicator: status.indicator, description: String(status.description || "").slice(0, 120) };
  } catch (e) {
    return { ok: null, error: e && e.name === "AbortError" ? "délai dépassé" : "injoignable" };
  }
}

async function readProviders() {
  const now = Date.now();
  if (providersCache.value && now - providersCache.at < PROVIDERS_CACHE_MS) return providersCache.value;
  const [vercel, supabase] = await Promise.all([
    readStatusPage("https://www.vercel-status.com/api/v2/status.json"),
    readStatusPage("https://status.supabase.com/api/v2/status.json"),
  ]);
  providersCache.value = { vercel, supabase };
  providersCache.at = now;
  return providersCache.value;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex");

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);
  const base = {
    ok: true,
    service: "zenoria",
    time: new Date().toISOString(),
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || "inconnu",
    region: process.env.VERCEL_REGION || null,
    commit: sha || null,
  };

  const deep = String((req.query && req.query.deep) || "") === "1";
  if (!deep) return res.status(200).json(base);

  const now = Date.now();
  if (deepCache.payload && now - deepCache.at < DEEP_CACHE_MS) {
    return res.status(deepCache.payload.ok ? 200 : 503).json(deepCache.payload);
  }

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  let payload;
  if (!url || !key) {
    payload = { ...base, ok: false, error: "variables NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY absentes sur le serveur" };
  } else {
    const [rest, auth, maintenance, providers] = await Promise.all([checkRest(url, key), checkAuth(url, key), checkMaintenance(url, key), readProviders()]);
    payload = { ...base, ok: rest.ok === true, supabase: { rest, auth, maintenance }, providers };
  }
  deepCache.payload = payload;
  deepCache.at = now;
  return res.status(payload.ok ? 200 : 503).json(payload);
}
