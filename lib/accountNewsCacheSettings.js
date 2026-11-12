// ZENORIA_ACCOUNT_NEWS_BADGE_V1
import { SITE_SETTINGS_TABLE } from "./siteSettings";
// ============================================================
// RÉGLAGE « PASTILLE DE NOUVEAUTÉS SUR TOUTES LES PAGES » (clé site_settings « account_news_cache »)
//
// Deux réglages, sur le modèle de lib/newBadge.js :
//  - enabled : interrupteur. Si faux, l'Accueil et le quiz ne font AUCUN appel pour cette pastille
//              (filet de sécurité quota, independant de la pastille de Mon compte, deja en production
//              et jamais coupee par ce reglage).
//  - minutes : duree du cache en memoire du navigateur avant un nouvel appel, de 5 a 60, 15 par defaut.
// Ligne absente ou illisible -> valeurs par defaut (actif, 15 minutes).
// ============================================================
export const ACCOUNT_NEWS_CACHE_KEY = "account_news_cache";
export const ACCOUNT_NEWS_CACHE_MIN_MINUTES = 5;
export const ACCOUNT_NEWS_CACHE_MAX_MINUTES = 60;
export const DEFAULT_ACCOUNT_NEWS_CACHE = { enabled: true, minutes: 15 };

export function parseAccountNewsCacheSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const enabled = typeof v.enabled === "boolean" ? v.enabled : DEFAULT_ACCOUNT_NEWS_CACHE.enabled;
  const raw = typeof v.minutes === "string" && v.minutes.trim() !== "" ? Number(v.minutes) : v.minutes;
  const minutes =
    typeof raw === "number" && Number.isInteger(raw)
      ? Math.min(ACCOUNT_NEWS_CACHE_MAX_MINUTES, Math.max(ACCOUNT_NEWS_CACHE_MIN_MINUTES, raw))
      : DEFAULT_ACCOUNT_NEWS_CACHE.minutes;
  return { enabled, minutes };
}

// Texte saisi dans l'admin -> { ok, minutes } ou { ok: false, error }.
export function parseMinutesInput(text) {
  const t = String(text == null ? "" : text).trim();
  if (t === "") return { ok: false, error: "Indiquez une durée." };
  if (!/^[0-9]+$/.test(t)) return { ok: false, error: "Un nombre entier, sans décimale." };
  const n = Number(t);
  if (n < ACCOUNT_NEWS_CACHE_MIN_MINUTES || n > ACCOUNT_NEWS_CACHE_MAX_MINUTES) {
    return { ok: false, error: `Entre ${ACCOUNT_NEWS_CACHE_MIN_MINUTES} et ${ACCOUNT_NEWS_CACHE_MAX_MINUTES} minutes.` };
  }
  return { ok: true, minutes: n };
}

export function buildAccountNewsCacheValue(enabled, minutes) {
  return { enabled: Boolean(enabled), minutes };
}

// Deux réglages sont-ils identiques ? (active/désactive le bouton Enregistrer)
export function sameAccountNewsCacheSetting(a, b) {
  const x = parseAccountNewsCacheSetting(a);
  const y = parseAccountNewsCacheSetting(b);
  return x.enabled === y.enabled && x.minutes === y.minutes;
}

export function describeAccountNewsCacheSetting(value) {
  const cfg = parseAccountNewsCacheSetting(value);
  return cfg.enabled ? `activée, cache de ${cfg.minutes} min` : "désactivée";
}

export function isDuplicateKeyError(err) {
  const msg = (err && err.message) || "";
  return /duplicate key|already exists|23505/i.test(msg);
}

export function accountNewsCacheErrorMessage(err) {
  const msg = (err && err.message) || String(err || "");
  if (/does not exist|schema cache|relation|42P01/i.test(msg)) {
    return "Le réglage n'a pas pu être lu ou écrit (table absente ou droits insuffisants).";
  }
  return "Une erreur est survenue" + (msg ? " (" + msg + ")" : "") + ".";
}

// Lecture seule, jamais bloquante (modele : fetchShippingSetting de lib/shippingSettings.js, utilise par quiz.js).
export async function fetchAccountNewsCacheSetting(supabase) {
  try {
    const { data, error } = await supabase.from(SITE_SETTINGS_TABLE).select("value").eq("key", ACCOUNT_NEWS_CACHE_KEY).maybeSingle();
    if (error) return DEFAULT_ACCOUNT_NEWS_CACHE;
    return parseAccountNewsCacheSetting(data ? data.value : null);
  } catch (e) {
    return DEFAULT_ACCOUNT_NEWS_CACHE;
  }
}
