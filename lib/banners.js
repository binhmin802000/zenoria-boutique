// ============================================================
// banners.js — règles des BANDEAUX (message affiché en haut du site) et des DATES des codes promo
//
// Logique pure (aucun React, aucun appel réseau), partagée par l'administration (liste, éditeur, aperçu)
// et, à l'étape 4, par le site lui-même. Elle reprend les contraintes de la table « banners » créée par
// supabase_themes_step2.sql.
//
// Principes :
//  - un bandeau est « en cours » entre starts_at (inclus) et ends_at (exclu) ;
//  - un seul bandeau s'affiche à la fois : le plus prioritaire (1 = en premier) parmi ceux qui sont activés et en cours ;
//  - le message peut contenir {code} et {fin}, remplacés automatiquement : le texte reste cohérent avec le code et la date ;
//  - aucun HTML n'est jamais interprété : le message est découpé en morceaux de texte.
// ============================================================
import { parisLocalToISO, isoToParisLocal, addDaysParis, daysBetween, nextFullHour, formatParis, formatParisDay } from "./parisTime";

export const BANNER_LIMITS = { name: 80, message: 240, buttonLabel: 40, url: 300, priorityMin: 1, priorityMax: 9, daysMin: 1, daysMax: 365 };

export const BUTTON_TARGETS = [
  { value: "collections", label: "Toutes les collections" },
  { value: "quiz", label: "Quiz couleurs" },
  { value: "season:printemps", label: "Saison Printemps" },
  { value: "season:ete", label: "Saison Été" },
  { value: "season:automne", label: "Saison Automne" },
  { value: "season:hiver", label: "Saison Hiver" },
  { value: "custom", label: "Lien personnalisé" },
];
const TARGET_VALUES = BUTTON_TARGETS.map((t) => t.value);

// Lien personnalisé : adresse du site (« / » ou « /page ») ou adresse https. Jamais « // », « http: » ni « javascript: ».
export const CUSTOM_URL_RE = /^(\/|\/[^/\s]\S*|https:\/\/[^\s/]\S*)$/;
export const CODE_RE = /^\S{1,40}$/;

const errText = (e) => String((e && (e.message || e.error)) || e || "");
const DAY = 86400000;

// ------------------------------------------------------------
// Statuts
// ------------------------------------------------------------
export function bannerRange(b) {
  return [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()];
}

// « scheduled » (programmé) | « live » (en cours) | « ended » (terminé)
export function bannerStatus(b, nowMs) {
  const [start, end] = bannerRange(b);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "ended";
  if (nowMs < start) return "scheduled";
  if (nowMs >= end) return "ended";
  return "live";
}

export const BANNER_STATUS_LABEL = {
  live: { label: "En cours", style: "bg-emerald-50 text-emerald-700" },
  scheduled: { label: "Programmé", style: "bg-amber-50 text-amber-700" },
  ended: { label: "Terminé", style: "bg-[#f0e6ea] text-[#8b737e]" },
};

// Le bandeau affiché : activé, en cours, le plus prioritaire (puis le plus récent). Aucun pendant une pause de la boutique.
export function pickCurrentBanner(list, nowMs, options = {}) {
  if (options.paused) return null;
  const live = (list || []).filter((b) => b.enabled && bannerStatus(b, nowMs) === "live");
  live.sort((a, b) => a.priority - b.priority || new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime() || a.id - b.id);
  return live[0] || null;
}

// Pourquoi un bandeau (en cours ou non) est affiché ou pas, pour la colonne « Sur le site » de l'administration
export function bannerVisibility(b, nowMs, shown, siteMode) {
  const st = bannerStatus(b, nowMs);
  if (st !== "live") return { key: "none", label: "—" };
  if (!b.enabled) return { key: "disabled", label: "Désactivé" };
  if (siteMode === "full") return { key: "hidden-full", label: "Masqué (site en maintenance)" };
  if (siteMode === "shop_pause") return { key: "hidden-pause", label: "Masqué (boutique en pause)" };
  if (shown && shown.id === b.id) return { key: "shown", label: "Affiché" };
  return { key: "waiting", label: "En attente (priorité plus basse)" };
}

// ------------------------------------------------------------
// Compte à rebours : jours et heures, jamais de secondes
// ------------------------------------------------------------
export function countdownText(endMs, nowMs) {
  const ms = endMs - nowMs;
  if (!(ms > 0)) return "";
  if (ms < 3600000) return "Moins d'une heure";
  const hours = Math.ceil(ms / 3600000);
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  if (d >= 1) return "Plus que " + d + " j " + h + " h";
  return "Plus que " + hours + " h";
}

// ------------------------------------------------------------
// Message : {code} et {fin}
// ------------------------------------------------------------
// Découpe le message en morceaux : { type: "text", value } | { type: "code", value } | { type: "end", value }.
// Un {code} sans code associé disparaît ; le texte autour est nettoyé pour éviter « avec le code , jusqu'au ».
export function splitMessage(message, ctx = {}) {
  const raw = String(message || "");
  const parts = raw.split(/(\{code\}|\{fin\})/);
  const out = [];
  parts.forEach((p) => {
    if (p === "{code}") {
      if (ctx.code) out.push({ type: "code", value: ctx.code });
    } else if (p === "{fin}") {
      const day = ctx.endIso ? formatParisDay(ctx.endIso) : "";
      if (day) out.push({ type: "end", value: day });
    } else if (p) {
      out.push({ type: "text", value: p });
    }
  });
  return out;
}

// Texte brut équivalent (pour les tests, les lecteurs d'écran et le contrôle de longueur)
export function plainMessage(message, ctx = {}) {
  return splitMessage(message, ctx).map((p) => p.value).join("");
}

export function messageWarnings(message, code) {
  const out = [];
  if (/\{code\}/.test(message || "") && !code) out.push("Le message contient {code} mais aucun code promo n'est associé : ce passage sera supprimé.");
  if (!/\{code\}/.test(message || "") && code) out.push("Un code est associé mais n'apparaît pas dans le message : ajoutez {code} pour que les visiteuses le voient.");
  return out;
}

// ------------------------------------------------------------
// Codes promo : statut selon les dates
// ------------------------------------------------------------
// « always » : actif sans limite de dates ; « live » : dans sa période ; « scheduled » ; « ended » ; « off » : désactivé
export function promoCodeStatus(c, nowMs) {
  const start = c.starts_at ? new Date(c.starts_at).getTime() : null;
  const end = c.ends_at ? new Date(c.ends_at).getTime() : null;
  if (!c.active) return { key: "off", label: "Inactif", style: "bg-[#f0e6ea] text-[#8b737e]" };
  if (start !== null && nowMs < start) return { key: "scheduled", label: "Programmé", style: "bg-amber-50 text-amber-700" };
  if (end !== null && nowMs >= end) return { key: "ended", label: "Expiré", style: "bg-[#f0e6ea] text-[#8b737e]" };
  if (start === null && end === null) return { key: "always", label: "Actif", style: "bg-emerald-50 text-emerald-700" };
  return { key: "live", label: "En cours", style: "bg-emerald-50 text-emerald-700" };
}

// Désynchronisations entre un bandeau (ou sa saisie) et son code. range = [startMs, endMs] ; codeRow = ligne de promo_codes ou undefined.
export function syncIssues(code, range, codeRow) {
  const out = [];
  if (!code) return out;
  if (!codeRow) return [{ level: "warn", text: "Le code « " + code + " » n'existe pas (supprimé ou renommé)." }];
  if (!codeRow.active) out.push({ level: "warn", text: "Le code « " + code + " » est désactivé : les visiteuses ne pourront pas l'utiliser." });
  const cs = codeRow.starts_at ? new Date(codeRow.starts_at).getTime() : null;
  const ce = codeRow.ends_at ? new Date(codeRow.ends_at).getTime() : null;
  if (cs === null && ce === null) {
    out.push({ level: "warn", text: "Le code « " + code + " » n'a pas de dates : il restera valable après la fin du bandeau." });
    return out;
  }
  if (ce !== null && ce < range[1]) out.push({ level: "warn", text: "Le code expire avant la fin du bandeau (le " + formatParis(codeRow.ends_at) + " au lieu du " + formatParis(new Date(range[1]).toISOString()) + ")." });
  if (ce !== null && ce > range[1]) out.push({ level: "info", text: "Le code reste valable après la fin du bandeau (jusqu'au " + formatParis(codeRow.ends_at) + ")." });
  if (cs === null) out.push({ level: "info", text: "Le code n'a pas de date de début : il est utilisable dès maintenant." });
  if (cs !== null && cs > range[0]) out.push({ level: "warn", text: "Le code commence après le bandeau (le " + formatParis(codeRow.starts_at) + ")." });
  return out;
}

// ------------------------------------------------------------
// Formulaire d'un bandeau
// ------------------------------------------------------------
// Dates saisies en heure de Paris (« AAAA-MM-JJTHH:mm »). Un nouveau bandeau est DÉSACTIVÉ : rien ne s'affiche par accident.
export function emptyBannerForm(nowMs) {
  const start = new Date(nextFullHour(nowMs)).toISOString();
  return {
    id: null,
    name: "",
    message: "Offre spéciale avec le code {code}, jusqu'au {fin}.",
    code: "",
    button_label: "Découvrir",
    button_target: "collections",
    button_url: "",
    mode: "dates",
    start: isoToParisLocal(start),
    end: isoToParisLocal(addDaysParis(start, 7)),
    days: 7,
    priority: 1,
    countdown: false,
    enabled: false,
  };
}

export function bannerToForm(b) {
  return {
    id: b.id,
    name: b.name || "",
    message: b.message || "",
    code: b.code || "",
    button_label: b.button_label || "",
    button_target: b.button_target || "collections",
    button_url: b.button_url || "",
    mode: b.mode === "duration" ? "duration" : "dates",
    start: isoToParisLocal(b.starts_at),
    end: isoToParisLocal(b.ends_at),
    days: b.duration_days || daysBetween(b.starts_at, b.ends_at),
    priority: b.priority || 1,
    countdown: Boolean(b.countdown),
    enabled: Boolean(b.enabled),
  };
}

// Début et fin effectifs (ISO) d'un formulaire, ou null si invalides. Mode « début + durée » : la fin est calculée.
export function formRange(form) {
  const startIso = parisLocalToISO(form.start);
  if (!startIso) return null;
  let endIso;
  if (form.mode === "duration") {
    const days = Number(form.days);
    if (!Number.isInteger(days) || days < BANNER_LIMITS.daysMin || days > BANNER_LIMITS.daysMax) return null;
    endIso = addDaysParis(startIso, days);
  } else {
    endIso = parisLocalToISO(form.end);
  }
  if (!endIso) return null;
  return { startIso, endIso };
}

// Renvoie { error } ou { payload } prêt pour la base.
export function validateBanner(form) {
  const name = String(form.name || "").trim();
  const message = String(form.message || "").trim();
  const code = String(form.code || "").trim();
  const label = String(form.button_label || "").trim();
  const target = form.button_target;
  const url = String(form.button_url || "").trim();
  const priority = Number(form.priority);

  if (!name) return { error: "Donnez un nom interne au bandeau (il n'est pas affiché sur le site)." };
  if (name.length > BANNER_LIMITS.name) return { error: "Le nom interne fait au plus " + BANNER_LIMITS.name + " caractères." };
  if (!message) return { error: "Le message du bandeau est obligatoire." };
  if (message.length > BANNER_LIMITS.message) return { error: "Le message fait au plus " + BANNER_LIMITS.message + " caractères (il en fait " + message.length + ")." };
  if (code && !CODE_RE.test(code)) return { error: "Le code associé n'est pas valide." };
  if (label.length > BANNER_LIMITS.buttonLabel) return { error: "Le texte du bouton fait au plus " + BANNER_LIMITS.buttonLabel + " caractères." };
  if (!TARGET_VALUES.includes(target)) return { error: "La destination du bouton n'est pas valide." };
  if (target === "custom") {
    if (!CUSTOM_URL_RE.test(url) || url.length > BANNER_LIMITS.url) {
      return { error: "Le lien personnalisé doit être une adresse du site (par exemple /quiz) ou une adresse commençant par https://." };
    }
  }
  if (!Number.isInteger(priority) || priority < BANNER_LIMITS.priorityMin || priority > BANNER_LIMITS.priorityMax) {
    return { error: "La priorité est un nombre de 1 à 9 (1 = affiché en premier)." };
  }
  if (!parisLocalToISO(form.start)) return { error: "La date de début n'est pas valide." };
  if (form.mode === "duration") {
    const days = Number(form.days);
    if (!Number.isInteger(days) || days < BANNER_LIMITS.daysMin || days > BANNER_LIMITS.daysMax) return { error: "La durée est un nombre entier de jours, de 1 à 365." };
  } else if (!parisLocalToISO(form.end)) {
    return { error: "La date de fin n'est pas valide." };
  }
  const range = formRange(form);
  if (!range) return { error: "Les dates du bandeau ne sont pas valides." };
  if (!(new Date(range.endIso).getTime() > new Date(range.startIso).getTime())) return { error: "La fin doit être après le début." };

  return {
    payload: {
      name,
      message,
      code: code || null,
      button_label: label,
      button_target: target,
      button_url: target === "custom" ? url : null,
      mode: form.mode === "duration" ? "duration" : "dates",
      starts_at: range.startIso,
      ends_at: range.endIso,
      duration_days: form.mode === "duration" ? Number(form.days) : null,
      priority,
      countdown: Boolean(form.countdown),
      enabled: Boolean(form.enabled),
    },
  };
}

// Traduit une erreur de la base en phrase lisible
export function bannerErrorMessage(err) {
  const msg = errText(err);
  const code = String((err && err.code) || "");
  if (/banners_dates_order/.test(msg)) return "La fin doit être après le début.";
  if (/banners_message_len/.test(msg)) return "Le message fait au plus " + BANNER_LIMITS.message + " caractères.";
  if (/banners_name_len/.test(msg)) return "Le nom interne est obligatoire (80 caractères au plus).";
  if (/banners_button_url_valid/.test(msg)) return "Le lien personnalisé doit être une adresse du site (par exemple /quiz) ou une adresse commençant par https://.";
  if (/banners_button_target_valid/.test(msg)) return "La destination du bouton n'est pas valide.";
  if (/banners_priority_valid/.test(msg)) return "La priorité est un nombre de 1 à 9.";
  if (/banners_duration_valid/.test(msg)) return "La durée est un nombre de jours de 1 à 365.";
  if (/banners_code_format/.test(msg)) return "Le code associé n'est pas valide.";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "Droits insuffisants : seul un compte administrateur peut modifier les bandeaux.";
  if (code === "42P01" || code === "PGRST205" || /does not exist|could not find the table|schema cache/i.test(msg)) {
    return "La table des bandeaux n'existe pas encore : exécutez le script supabase_themes_step2.sql dans Supabase (SQL Editor).";
  }
  return "Erreur : " + msg;
}

// ------------------------------------------------------------
// Dates d'un code promo saisies dans le formulaire (heure de Paris)
// ------------------------------------------------------------
// Renvoie { error } ou { startsAt, endsAt } (ISO ou null)
export function validatePromoDates(startLocal, endLocal) {
  const s = String(startLocal || "").trim();
  const e = String(endLocal || "").trim();
  const startsAt = s ? parisLocalToISO(s) : null;
  const endsAt = e ? parisLocalToISO(e) : null;
  if (s && !startsAt) return { error: "La date de début du code n'est pas valide." };
  if (e && !endsAt) return { error: "La date de fin du code n'est pas valide." };
  if (startsAt && endsAt && !(new Date(endsAt).getTime() > new Date(startsAt).getTime())) return { error: "La fin du code doit être après son début." };
  return { startsAt, endsAt };
}

export { formatParis, formatParisDay };
