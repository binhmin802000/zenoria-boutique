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
// En cas d'échec réseau, la sonde renvoie un CODE tiré d'une liste fermée (voir NET_FAMILIES) et une
// famille (certificat, DNS, délai...), jamais le texte brut de l'erreur : l'onglet « Santé » en déduit la
// cause probable et l'action à mener. Elle indique aussi si NODE_EXTRA_CA_CERTS est défini (oui/non seulement).
//
// Rien de secret n'est renvoyé : ni clé, ni adresse de la base, ni chemin de fichier.
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

// ---- Erreurs réseau : liste FERMÉE de codes (tout autre code devient "UNKNOWN") ----
// Node.js (fetch) range la vraie cause dans error.cause.code. Le message brut n'est jamais renvoyé.
const NET_FAMILIES = {
  cert: ["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"],
  cert_date: ["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID"],
  cert_name: ["ERR_TLS_CERT_ALTNAME_INVALID"],
  dns: ["ENOTFOUND", "EAI_AGAIN"],
  timeout: ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"],
  refused: ["ECONNREFUSED"],
  reset: ["ECONNRESET", "UND_ERR_SOCKET", "EPIPE"],
  unreachable: ["EHOSTUNREACH", "ENETUNREACH"],
};
const NET_FAMILY_BY_CODE = {};
for (const family of Object.keys(NET_FAMILIES)) for (const code of NET_FAMILIES[family]) NET_FAMILY_BY_CODE[code] = family;
const NET_LABELS = {
  cert: "certificat de sécurité non reconnu",
  cert_date: "certificat expiré ou pas encore valide",
  cert_name: "certificat qui ne correspond pas à l'adresse",
  dns: "adresse introuvable (DNS)",
  timeout: "délai dépassé",
  refused: "connexion refusée",
  reset: "connexion interrompue",
  unreachable: "réseau injoignable",
  unknown: "injoignable",
};

function rawNetCode(e) {
  const cause = e && e.cause;
  if (cause && cause.code) return String(cause.code);
  if (cause && Array.isArray(cause.errors)) {
    const inner = cause.errors.find((x) => x && x.code);
    if (inner) return String(inner.code);
  }
  return e && e.code ? String(e.code) : "";
}

// -> { code, family, label } ; le code n'est renvoyé que s'il figure dans la liste fermée.
function netInfo(e, timeoutMs) {
  if (e && e.name === "AbortError") return { code: "TIMEOUT", family: "timeout", label: "délai dépassé (" + timeoutMs / 1000 + " s)" };
  const raw = rawNetCode(e);
  const family = NET_FAMILY_BY_CODE[raw] || "unknown";
  return { code: family === "unknown" ? "UNKNOWN" : raw, family, label: NET_LABELS[family] };
}

function failure(e, timeoutMs) {
  const n = netInfo(e, timeoutMs);
  return { ok: false, error: n.label, code: n.code, family: n.family };
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
    // « reached » = la page a répondu (même par une erreur HTTP) : le serveur sort bien vers Internet.
    if (!res.ok) return { ok: null, reached: true, error: "HTTP " + res.status };
    let json;
    try {
      json = await res.json();
    } catch (e) {
      return { ok: null, reached: true, error: "format illisible" };
    }
    const status = json && json.status;
    if (!status || typeof status.indicator !== "string") return { ok: null, reached: true, error: "format illisible" };
    return { ok: status.indicator === "none", reached: true, indicator: status.indicator, description: String(status.description || "").slice(0, 120) };
  } catch (e) {
    const n = netInfo(e, 3000);
    return { ok: null, reached: false, error: n.label, code: n.code, family: n.family };
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
  // Oui/non seulement : jamais le chemin du fichier de certificats.
  const tls = { extraCa: Boolean(process.env.NODE_EXTRA_CA_CERTS) };
  let payload;
  if (!url || !key) {
    const providers = await readProviders();
    payload = { ...base, ok: false, error: "variables NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY absentes sur le serveur", providers, tls };
  } else {
    const [rest, auth, maintenance, providers] = await Promise.all([checkRest(url, key), checkAuth(url, key), checkMaintenance(url, key), readProviders()]);
    payload = { ...base, ok: rest.ok === true, supabase: { rest, auth, maintenance }, providers, tls };
  }
  deepCache.payload = payload;
  deepCache.at = now;
  return res.status(payload.ok ? 200 : 503).json(payload);
}
