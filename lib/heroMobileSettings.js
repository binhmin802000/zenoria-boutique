// ZENORIA_HERO_MOBILE_V1
import { posterPath, isStoragePath } from "./mediaVariants.js";
// ============================================================
// lib/heroMobileSettings.js : réglage « Vidéo d'accueil sur mobile » (logique pure : aucun React, aucun appel réseau).
//
// Clé site_settings « hero_mobile », valeur { "autoplay": true|false } (contrainte SQL site_settings_hero_mobile_valid).
//   - autoplay false, ligne absente ou illisible : image fixe + bouton ▶ sur écran étroit (comportement par défaut, le plus économique) ;
//   - autoplay true : la vidéo démarre aussi sur écran étroit.
// Ce réglage ne passe JAMAIS outre un choix de la visiteuse (économie de données, connexion 2G, « réduire les animations ») :
// c'est shouldAutoplayHero (lib/mediaVariants.js) qui l'applique.
//
// Ce fichier sert aussi à la carte d'administration (components/AdminHeroMobile.js) : valeur à enregistrer, libellés, messages
// d'erreur, et estimation du cached egress (poids réels de la vidéo et de son image fixe lus dans Supabase Storage).
// ============================================================
export const HERO_MOBILE_KEY = "hero_mobile";
export const DEFAULT_HERO_MOBILE = Object.freeze({ autoplay: false });
export const DEFAULT_VISITS = 100;
export const MIN_VISITS = 1;
export const MAX_VISITS = 1000000;
export const EGRESS_QUOTA_MB = 5000; // quota de cached egress de l'offre gratuite : 5 Go

export const LABEL_STILL = "Image fixe + ▶";
export const LABEL_AUTOPLAY = "Lecture automatique";

// Lecture par le site : tout ce qui n'est pas exactement { autoplay: true } donne l'image fixe + ▶.
export function parseHeroMobileSetting(value) {
  const ok = value !== null && typeof value === "object" && !Array.isArray(value) && value.autoplay === true;
  return { autoplay: ok };
}

// La valeur enregistrée est-elle exactement ce que la base accepte ? (objet, « autoplay » booléen, aucune autre clé)
export function isHeroMobileValueReadable(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (typeof value.autoplay !== "boolean") return false;
  return Object.keys(value).every((k) => k === "autoplay");
}

// Valeur enregistrée dans site_settings (exactement le champ attendu par la contrainte SQL).
export function buildHeroMobileValue(autoplay) {
  return { autoplay: autoplay === true };
}

export function sameHeroMobileSetting(a, b) {
  return parseHeroMobileSetting(a).autoplay === parseHeroMobileSetting(b).autoplay;
}

export function heroMobileLabel(autoplay) {
  return autoplay === true ? LABEL_AUTOPLAY : LABEL_STILL;
}

// « Image fixe + ▶ » / « Lecture automatique »
export function describeHeroMobileSetting(setting) {
  return heroMobileLabel(parseHeroMobileSetting(setting).autoplay);
}

// ---------- Saisie du nombre de visites (simulation, jamais enregistrée) ----------
const VISITS_ERROR = "Indiquez un nombre entier de visites, de " + MIN_VISITS + " à 1 000 000.";
export function parseVisitsInput(text) {
  const raw = typeof text === "number" && Number.isFinite(text) ? String(text) : typeof text === "string" ? text.trim() : "";
  if (raw === "") return { ok: false, error: "Indiquez un nombre de visites mobiles." };
  if (!/^[0-9]{1,7}$/.test(raw)) return { ok: false, error: VISITS_ERROR };
  const visits = Number(raw);
  if (visits < MIN_VISITS || visits > MAX_VISITS) return { ok: false, error: VISITS_ERROR };
  return { ok: true, visits };
}

// ---------- Chemins Supabase Storage ----------
// « site/hero_video/123-nom.mp4 » -> { dir: "site/hero_video", name: "123-nom.mp4" } ; null si ce n'est pas un chemin Storage
export function splitStoragePath(path) {
  if (!isStoragePath(path)) return null;
  const i = path.lastIndexOf("/");
  return { dir: path.slice(0, i), name: path.slice(i + 1) };
}

// Taille (octets) d'un fichier dans la liste renvoyée par Storage (champ metadata.size), ou null
export function sizeFromStorageList(items, name) {
  if (!Array.isArray(items)) return null;
  const f = items.find((x) => x && x.name === name);
  const s = f && f.metadata ? Number(f.metadata.size) : NaN;
  return Number.isFinite(s) && s > 0 ? s : null;
}

// Chemin de l'image fixe de la vidéo (poster_...), ou null
export function heroPosterPath(videoPath) {
  return posterPath(videoPath);
}

// ---------- Estimation du cached egress ----------
// Par visite mobile : lecture automatique = vidéo téléchargée dès l'arrivée ; image fixe + ▶ = image fixe seule (la vidéo
// n'est téléchargée que si la visiteuse appuie sur ▶). Écart par visite = poids vidéo - poids image fixe.
// 1 Mo = 1 000 000 octets, 1 Go = 1 000 Mo. Estimation du premier passage sur un appareil : les médias sont mis en cache un an.
export function estimateHeroEgress({ videoBytes, posterBytes, visits, quotaMb = EGRESS_QUOTA_MB }) {
  const v = Number(videoBytes);
  if (videoBytes === null || videoBytes === undefined || !Number.isFinite(v) || v <= 0) return null;
  const k = Number(visits);
  if (visits === null || visits === undefined || !Number.isInteger(k) || k < 0) return null;
  const pRaw = Number(posterBytes);
  const p = posterBytes !== null && posterBytes !== undefined && Number.isFinite(pRaw) && pRaw > 0 ? pRaw : 0;
  const videoMo = v / 1e6;
  const posterMo = p / 1e6;
  const perVisitMo = Math.max(0, videoMo - posterMo);
  const totalMo = perVisitMo * k;
  const percent = quotaMb > 0 ? (totalMo / quotaMb) * 100 : 0;
  return { videoMo, posterMo, posterKnown: p > 0, perVisitMo, totalMo, percent, visits: k };
}

export function formatMo(n) {
  if (!Number.isFinite(n)) return "—";
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  const parts = n.toFixed(digits).split(".");
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return parts[1] ? int + "," + parts[1] : int;
}

export function formatPercent(n) {
  if (!Number.isFinite(n)) return "—";
  if (n > 0 && n < 0.1) return "moins de 0,1";
  return n.toFixed(1).replace(".", ",");
}

// Texte du bloc de chiffres de la carte. autoplay : choix en cours dans la carte (pas forcément enregistré).
export function heroEgressSummary(autoplay, estimate) {
  if (!estimate) {
    return {
      headline: "Calcul indisponible",
      detail: "Le poids de la vidéo d'accueil n'a pas pu être lu dans Supabase : l'estimation ne peut pas être affichée.",
    };
  }
  const visitsText = estimate.visits + (estimate.visits > 1 ? " visites mobiles" : " visite mobile");
  const files = "vidéo " + formatMo(estimate.videoMo) + " Mo, image fixe " + (estimate.posterKnown ? formatMo(estimate.posterMo) + " Mo" : "introuvable (son poids est ignoré)");
  const quota = formatPercent(estimate.percent) + " % du quota de 5 Go";
  if (autoplay === true) {
    return {
      headline: "Surcoût : environ " + formatMo(estimate.totalMo) + " Mo",
      detail: "Par rapport à l'image fixe, pour " + visitsText + " (" + files + "), soit " + quota + ".",
    };
  }
  return {
    headline: "Économie : jusqu'à " + formatMo(estimate.totalMo) + " Mo",
    detail: "Par rapport à la lecture automatique, pour " + visitsText + " (" + files + "), soit " + quota + ". Moins si des visiteuses appuient sur ▶.",
  };
}

// ---------- Erreurs ----------
export function heroMobileErrorMessage(err) {
  const msg = err && err.message ? err.message : typeof err === "string" ? err : "";
  if (/violates check constraint|site_settings_[a-z_]+_valid/i.test(msg)) {
    return "La base refuse cette valeur (règle de validation). Vérifiez que supabase_hero_mobile.sql a bien été exécuté.";
  }
  if (/row-level security|permission denied|not authorized|unauthorized|jwt/i.test(msg)) {
    return "Modification refusée : ce compte n'a pas les droits d'administration.";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages est introuvable. Vérifiez que supabase_site_settings.sql a été exécuté.";
  }
  if (/failed to fetch|network|timeout/i.test(msg)) {
    return "Connexion impossible. Réessayez dans un instant.";
  }
  return "Échec de l'enregistrement" + (msg ? " (" + msg + ")" : "") + ".";
}

export function isDuplicateKeyError(err) {
  const code = err && err.code ? String(err.code) : "";
  const msg = err && err.message ? err.message : "";
  return code === "23505" || /duplicate key/i.test(msg);
}
