// ============================================================
// maintenance.js - Logique partagée de la maintenance du site
//
// Utilisé par :
//  - middleware.js        (avant chaque page : renvoie un vrai code 503 en maintenance totale)
//  - pages/api/health.js  (lecture de l'état côté serveur)
//  - lib/siteStatus.js    (bannière « boutique en pause » dans le site)
//
// Aucune dépendance : le code fonctionne dans le navigateur, sur Vercel (Edge ou Node)
// et dans les tests.
//
// Deux modes (en plus de « ouvert ») :
//  - "full"       : MAINTENANCE TOTALE. Les visiteurs reçoivent une page de maintenance
//                   avec le code HTTP 503 et l'en-tête Retry-After. /admin reste accessible.
//  - "shop_pause" : BOUTIQUE EN PAUSE. Le catalogue reste visible, la commande est fermée.
// ============================================================

export const MODE_OFF = "off";
export const MODE_FULL = "full";
export const MODE_SHOP_PAUSE = "shop_pause";

export const PREVIEW_COOKIE = "zenoria_preview";
export const PREVIEW_MAX_AGE_S = 4 * 3600; // le lien d'aperçu administrateur garde la porte ouverte 4 h

// L'état est relu au plus toutes les 10 s par instance du middleware : un changement
// depuis /admin est donc visible des visiteurs en 10 à 15 s environ.
export const STATUS_CACHE_MS = 10000;
// Si Supabase ne répond plus pendant une maintenance, on garde le dernier état connu
// jusqu'à 10 minutes, pour ne pas rouvrir le site par erreur au milieu d'une intervention.
export const STALE_OK_MS = 10 * 60 * 1000;
export const STATUS_TIMEOUT_MS = 1500;

// Adresse de contact affichée sur la page de maintenance (laisser vide pour ne rien afficher).
export const MAINTENANCE_CONTACT = "";

const TIME_ZONE = "Europe/Paris";

// Chemins jamais bloqués : l'administration, la sonde de santé, le webhook Stripe (à venir),
// les fichiers du site et les images.
const EXCLUDED_EXACT = ["/admin", "/api/health", "/favicon.ico", "/robots.txt"];
const EXCLUDED_PREFIXES = ["/admin/", "/api/stripe/", "/_next/", "/images/"];

export function isExcludedPath(pathname) {
  const p = String(pathname || "/");
  if (EXCLUDED_EXACT.includes(p)) return true;
  if (EXCLUDED_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  return /\.[a-z0-9]{2,5}$/i.test(p); // fichiers statiques : .png, .js, .css, .mp4...
}

export function isValidPreviewToken(token) {
  return typeof token === "string" && /^[a-f0-9]{16,64}$/.test(token);
}

// Convertit la réponse de la fonction SQL get_site_status() en objet simple.
export function normalizeStatus(row) {
  const r = row && typeof row === "object" ? row : {};
  const mode = r.mode === MODE_FULL || r.mode === MODE_SHOP_PAUSE ? r.mode : MODE_OFF;
  if (mode === MODE_OFF) return { mode, message: "", returnAt: null, previewOk: false };
  return {
    mode,
    message: String(r.message || "").slice(0, 500),
    returnAt: r.return_at || r.returnAt || null,
    previewOk: r.preview_ok === true || r.previewOk === true,
  };
}

// Valeur de l'en-tête Retry-After, en secondes : temps restant avant le retour prévu
// (entre 1 minute et 24 h), ou 1 heure si aucune heure de retour n'est connue.
export function retryAfterSeconds(returnAt, nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  if (returnAt) {
    const t = Date.parse(returnAt);
    if (Number.isFinite(t)) {
      return Math.min(86400, Math.max(60, Math.ceil((t - now) / 1000)));
    }
  }
  return 3600;
}

export function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// « 11 octobre 2026 à 18:00 » (heure de Paris), ou "" si la date est invalide.
export function formatReturnAt(returnAt) {
  const t = Date.parse(returnAt);
  if (!returnAt || !Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(new Date(t));
}

// Page de maintenance autonome : aucune image, aucune police, aucun script externe.
// Elle ne dépend ni de la base de données ni du reste du site.
export function buildMaintenanceHtml(options) {
  const o = options || {};
  const text = String(o.message || "").trim() || "Notre boutique est temporairement fermée pour une opération de maintenance.";
  const when = formatReturnAt(o.returnAt);
  const contact = String(o.contact !== undefined ? o.contact : MAINTENANCE_CONTACT).trim();
  return (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<meta http-equiv="refresh" content="300">' +
    "<title>Zenoria — Maintenance en cours</title>" +
    "<style>" +
    "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;" +
    "background:radial-gradient(circle at 70% 30%,#ead5ee 0%,#fbf6f0 45%,#f0dbd4 100%);" +
    "font-family:Georgia,'Times New Roman',serif;color:#412f3b;text-align:center}" +
    "main{max-width:520px}" +
    ".brand{letter-spacing:.3em;font-size:28px;margin:0 0 6px}" +
    ".tag{font-style:italic;color:#755f6e;font-size:13px;margin:0 0 34px}" +
    "h1{font-size:30px;font-weight:normal;margin:0 0 16px}" +
    "p{line-height:1.7;margin:0 0 14px;font-size:16px;color:#54434c}" +
    ".when{display:inline-block;margin-top:6px;padding:10px 20px;border-radius:999px;background:#fff;border:1px solid #eadfe4;color:#8f6075}" +
    "small{display:block;margin-top:36px;color:#8b737e;font-size:12px}" +
    "a{color:#8f6075}" +
    "</style></head><body><main>" +
    '<p class="brand">ZENORIA</p>' +
    '<p class="tag">L&#39;énergie du cristal, l&#39;harmonie de l&#39;âme.</p>' +
    "<h1>Nous revenons très vite</h1>" +
    "<p>" + escapeHtml(text) + "</p>" +
    (when ? '<p class="when">Retour prévu : ' + escapeHtml(when) + "</p>" : "") +
    (contact ? '<p>Une question ? <a href="mailto:' + escapeHtml(contact) + '">' + escapeHtml(contact) + "</a></p>" : "") +
    "<small>Cette page se recharge automatiquement. © 2026 Zenoria</small>" +
    "</main></body></html>"
  );
}

// Décide quoi faire d'une requête. Fonction pure, testée séparément du middleware.
//  - { action: "pass" }                       la requête continue normalement
//  - { action: "block" }                      page de maintenance (503)
//  - { action: "preview-redirect", token }    lien d'aperçu valide : cookie, puis redirection sans le paramètre
export function decideMaintenance(input) {
  const { pathname, status, previewParam } = input;
  if (isExcludedPath(pathname)) return { action: "pass", reason: "excluded" };
  if (!status) return { action: "pass", reason: "status-unknown" }; // en cas de doute, le site reste ouvert
  if (status.mode === MODE_OFF) return { action: "pass", reason: "open" };
  if (status.mode === MODE_SHOP_PAUSE) return { action: "pass", reason: "shop-pause" };
  if (status.previewOk) {
    if (isValidPreviewToken(previewParam)) return { action: "preview-redirect", token: previewParam };
    return { action: "pass", reason: "preview" };
  }
  return { action: "block" };
}

// Lit l'état de la maintenance dans Supabase (fonction SQL publique get_site_status).
// Renvoie null si Supabase ne répond pas ou si le script SQL n'est pas installé.
export async function fetchSiteStatus(options) {
  const o = options || {};
  const fetchImpl = o.fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl || !o.supabaseUrl || !o.anonKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs || STATUS_TIMEOUT_MS);
  try {
    const response = await fetchImpl(String(o.supabaseUrl).replace(/\/+$/, "") + "/rest/v1/rpc/get_site_status", {
      method: "POST",
      headers: { apikey: o.anonKey, Authorization: "Bearer " + o.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ preview: isValidPreviewToken(o.token) ? o.token : null }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!Array.isArray(rows)) return null;
    return normalizeStatus(rows[0]);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// État avec petit cache en mémoire (state = { status, at }, conservé par l'appelant).
export async function getStatusWithCache(state, options) {
  const o = options || {};
  const now = typeof o.now === "number" ? o.now : Date.now();
  const token = isValidPreviewToken(o.token) ? o.token : null;
  if (!token && state.status && now - state.at < STATUS_CACHE_MS) return state.status;
  const fresh = await fetchSiteStatus({ ...o, token });
  if (fresh) {
    state.status = { ...fresh, previewOk: false }; // le droit d'aperçu dépend du jeton : jamais partagé
    state.at = now;
    return fresh;
  }
  if (state.status && now - state.at < STALE_OK_MS) return state.status;
  return null;
}
