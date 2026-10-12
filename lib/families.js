// ============================================================
// families.js — règles des FAMILLES (saisons) et des couleurs dominantes d'une collection
//
// Logique pure (aucun React, aucun appel réseau) : validation des formulaires, messages d'erreur lisibles,
// décomptes. Elle reprend les contraintes de la table « families » créée par supabase_themes_step2.sql,
// pour afficher une erreur claire AVANT d'envoyer, et traduire celles que la base renvoie malgré tout.
// ============================================================

export const FAMILY_LIMITS = { name: 60, tagline: 80, description: 240, palette: 6, keyMin: 2, keyMax: 30 };
export const DOMINANT_MAX = 3;
export const DOMINANT_NAME_MAX = 30;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const KEY_RE = /^[a-z0-9-]{2,30}$/;

const errText = (e) => String((e && (e.message || e.error)) || e || "");

export const isHex = (v) => typeof v === "string" && HEX_RE.test(v);

// « Édition limitée » -> « edition-limitee ». Renvoie une chaîne vide si rien d'exploitable.
export function slugifyKey(name) {
  const s = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, FAMILY_LIMITS.keyMax)
    .replace(/-+$/g, "");
  return s.length >= FAMILY_LIMITS.keyMin ? s : "";
}

// Ancien libellé de famille, encore lu par le site actuel (« Collection Automne »)
export function legacyFamilyText(name) {
  return "Collection " + String(name || "").trim();
}

// ------------------------------------------------------------
// Couleurs dominantes d'une collection : 0 à 3 éléments { name, hex }
// ------------------------------------------------------------
export function cleanDominantColors(list) {
  return (Array.isArray(list) ? list : []).map((c) => ({
    name: String((c && c.name) || "").trim(),
    hex: String((c && c.hex) || "").trim().toLowerCase(),
  }));
}

// Renvoie un message d'erreur, ou une chaîne vide si tout est valide
export function validateDominantColors(list) {
  const colors = cleanDominantColors(list);
  if (colors.length > DOMINANT_MAX) return "Une collection a au plus " + DOMINANT_MAX + " couleurs dominantes.";
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    if (!c.name) return "Donnez un nom à chaque couleur dominante (par exemple « Brun doré »).";
    if (c.name.length > DOMINANT_NAME_MAX) return "Le nom d'une couleur dominante fait au plus " + DOMINANT_NAME_MAX + " caractères.";
    if (!HEX_RE.test(c.hex)) return "La couleur « " + c.name + " » n'est pas valide.";
  }
  return "";
}

// ------------------------------------------------------------
// Formulaire d'une famille
// ------------------------------------------------------------
export function emptyFamilyForm(sortOrder = 1) {
  return {
    id: null,
    key: "",
    name: "",
    tagline: "",
    description: "",
    accent: "#8f6075",
    palette: ["#8f6075"],
    is_season: false,
    sort_order: sortOrder,
    active: true,
  };
}

export function familyToForm(f) {
  return {
    id: f.id,
    key: f.key,
    name: f.name || "",
    tagline: f.tagline || "",
    description: f.description || "",
    accent: f.accent || "#8f6075",
    palette: Array.isArray(f.palette) ? f.palette.slice() : [],
    is_season: Boolean(f.is_season),
    sort_order: f.sort_order,
    active: Boolean(f.active),
  };
}

export function nextSortOrder(families) {
  return (families || []).reduce((m, f) => Math.max(m, Number(f.sort_order) || 0), 0) + 1;
}

// existing : toutes les familles connues. Renvoie { error } ou { payload }.
// Création : tous les champs, y compris l'identifiant technique. Modification : jamais l'identifiant ni le statut « saison ».
export function validateFamilyForm(form, existing) {
  const isNew = !form.id;
  const name = String(form.name || "").trim();
  const tagline = String(form.tagline || "").trim();
  const description = String(form.description || "").trim();
  const accent = String(form.accent || "").trim().toLowerCase();
  const palette = (Array.isArray(form.palette) ? form.palette : []).map((c) => String(c || "").trim().toLowerCase());
  const others = (existing || []).filter((f) => f.id !== form.id);

  if (!name) return { error: "Le nom de la famille est obligatoire." };
  if (name.length > FAMILY_LIMITS.name) return { error: "Le nom fait au plus " + FAMILY_LIMITS.name + " caractères." };
  if (others.some((f) => String(f.name).trim().toLowerCase() === name.toLowerCase())) return { error: "Une famille porte déjà le nom « " + name + " »." };
  if (tagline.length > FAMILY_LIMITS.tagline) return { error: "La phrase d'accroche fait au plus " + FAMILY_LIMITS.tagline + " caractères." };
  if (description.length > FAMILY_LIMITS.description) return { error: "La description fait au plus " + FAMILY_LIMITS.description + " caractères." };
  if (!HEX_RE.test(accent)) return { error: "La couleur d'accent n'est pas valide." };
  if (palette.length > FAMILY_LIMITS.palette) return { error: "La palette contient au plus " + FAMILY_LIMITS.palette + " couleurs." };
  if (palette.some((c) => !HEX_RE.test(c))) return { error: "Une couleur de la palette n'est pas valide." };

  const payload = { name, tagline, description, accent, palette, active: form.is_season ? true : Boolean(form.active) };

  if (isNew) {
    const key = String(form.key || "").trim().toLowerCase();
    if (!KEY_RE.test(key)) return { error: "L'identifiant technique doit faire 2 à 30 caractères : lettres minuscules, chiffres et tirets." };
    if (others.some((f) => f.key === key)) return { error: "L'identifiant « " + key + " » est déjà utilisé par une autre famille." };
    payload.key = key;
    payload.is_season = false;
    payload.sort_order = Number(form.sort_order) || nextSortOrder(existing);
  }
  return { payload };
}

// Traduit une erreur de la base en phrase lisible
export function familyErrorMessage(err) {
  const msg = errText(err);
  const code = String((err && err.code) || "");
  if (/families_name_unique/.test(msg)) return "Une famille porte déjà ce nom.";
  if (/families_key_unique/.test(msg)) return "Cet identifiant technique est déjà utilisé par une autre famille.";
  if (/est une saison utilis/i.test(msg) || /identifiant technique d une famille/i.test(msg) || /statut .saison du quiz/i.test(msg)) return msg;
  if (/products_family_id_fkey|violates foreign key/i.test(msg)) return "Cette famille contient encore des collections : déplacez-les d'abord vers une autre famille.";
  if (/products_neighbour_differs/.test(msg)) return "La saison voisine doit être différente de la famille de la collection.";
  if (/products_dominant_colors_valid/.test(msg)) return "Les couleurs dominantes ne sont pas valides (3 au plus, avec un nom et une couleur).";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "Droits insuffisants : seul un compte administrateur peut modifier les familles.";
  if (code === "42P01" || code === "PGRST205" || /does not exist|could not find the table|schema cache/i.test(msg)) {
    return "La table des familles n'existe pas encore : exécutez le script supabase_themes_step2.sql dans Supabase (SQL Editor).";
  }
  if (/families_(name_len|tagline_len|description_len|accent_hex|palette_valid|key_format)/.test(msg)) return "Une valeur du formulaire dépasse les limites autorisées.";
  return "Erreur : " + msg;
}

// ------------------------------------------------------------
// Décomptes
// ------------------------------------------------------------
export function countByFamily(products) {
  const map = new Map();
  (products || []).forEach((p) => {
    if (p.family_id === null || p.family_id === undefined) return;
    map.set(Number(p.family_id), (map.get(Number(p.family_id)) || 0) + 1);
  });
  return map;
}

export function productsWithoutFamily(products) {
  return (products || []).filter((p) => p.family_id === null || p.family_id === undefined);
}

// Une saison avec moins de 2 collections donne peu de choix au quiz couleurs
export const QUIZ_MIN_COLLECTIONS = 2;
export function isThinSeason(family, count) {
  return Boolean(family && family.is_season) && count < QUIZ_MIN_COLLECTIONS;
}
