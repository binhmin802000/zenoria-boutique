// ============================================================================
// ZENORIA — Quiz couleurs : état partageable, panier, catalogue (logique pure : aucun React, aucune classe Tailwind)
//
//  - Le résultat du quiz peut s'écrire dans l'adresse de la page, APRÈS le « # » (par exemple /quiz#r=6.1.4.1).
//    Ce qui suit le « # » n'est jamais envoyé au serveur : rien n'est enregistré, et le bouton « retour » du navigateur
//    ramène au résultat quand on revient d'une fiche bague.
//  - Le panier est celui de la boutique (même clé, même forme que dans pages/index.js).
//  - Le catalogue lu dans la base est converti en collections pour le moteur de couleurs.
// ============================================================================
import { SEASON_KEYS, HAIR, EYES, SKIN, isValidProfile } from "./colorEngine.js";

// ------------------------------------------------------------------ adresse du résultat
export const RESULT_HASH_PREFIX = "#r=";

// profile = { hair, eye, skin, metal } -> "#r=6.1.4.1" ("" si le profil est incomplet)
export function encodeResultHash(profile) {
  if (!isValidProfile(profile)) return "";
  const m = profile.metal === 1 || profile.metal === -1 ? profile.metal : 0;
  return RESULT_HASH_PREFIX + [profile.hair, profile.eye, profile.skin, m].join(".");
}

// "#r=6.1.4.1" -> { hair, eye, skin, metal } ; null pour tout ce qui n'est pas un résultat valide
export function parseResultHash(hash) {
  if (typeof hash !== "string" || !hash.startsWith(RESULT_HASH_PREFIX)) return null;
  const parts = hash.slice(RESULT_HASH_PREFIX.length).split(".");
  if (parts.length !== 4 || !parts.every((p) => /^-?\d{1,2}$/.test(p))) return null;
  const [hair, eye, skin, metal] = parts.map(Number);
  const profile = { hair, eye, skin, metal: metal === 1 || metal === -1 ? metal : 0 };
  return isValidProfile(profile) ? profile : null;
}

// ------------------------------------------------------------------ panier (même clé et même forme que la boutique)
export const CART_STORAGE_KEY = "zenoria_cart_v2";
export const MAX_QTY_PER_PRODUCT = 10;

export function readStoredCart(storage) {
  const empty = { items: [], promo: "" };
  try {
    const raw = storage ? storage.getItem(CART_STORAGE_KEY) : null;
    if (!raw) return empty;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return empty;
    const items = (Array.isArray(saved.items) ? saved.items : [])
      .filter((i) => i && i.id !== undefined && i.id !== null)
      .map((i) => ({ id: i.id, qty: Math.min(MAX_QTY_PER_PRODUCT, Math.max(1, Number(i.qty) || 1)) }));
    return { items, promo: typeof saved.promo === "string" ? saved.promo : "" };
  } catch (e) {
    return empty; // panier illisible : la boutique repart elle aussi d'un panier vide
  }
}

export function cartCount(storage) {
  return readStoredCart(storage).items.reduce((s, i) => s + i.qty, 0);
}

// Ajoute une bague au panier. Renvoie { ok: true, qty } ou { ok: false, reason: "max" | "storage" | "invalid" }.
export function addToStoredCart(storage, productId) {
  if (productId === undefined || productId === null || productId === "") return { ok: false, reason: "invalid" };
  const cart = readStoredCart(storage);
  const current = cart.items.find((i) => String(i.id) === String(productId));
  if (current && current.qty >= MAX_QTY_PER_PRODUCT) return { ok: false, reason: "max" };
  const items = current ? cart.items.map((i) => (i === current ? { ...i, qty: i.qty + 1 } : i)) : [...cart.items, { id: productId, qty: 1 }];
  try {
    if (!storage) return { ok: false, reason: "storage" };
    storage.setItem(CART_STORAGE_KEY, JSON.stringify({ items, promo: cart.promo }));
  } catch (e) {
    return { ok: false, reason: "storage" };
  }
  return { ok: true, qty: current ? current.qty + 1 : 1 };
}

// ------------------------------------------------------------------ catalogue
const HEX = /^#[0-9a-fA-F]{6}$/;
export const DOMINANT_MAX = 3;

// Couleurs dominantes saisies dans l'administration : 3 au plus, un nom et une couleur valides
export function cleanDominantColors(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const d of value) {
    const name = d && typeof d.name === "string" ? d.name.trim().slice(0, 40) : "";
    if (name && d && typeof d.hex === "string" && HEX.test(d.hex)) out.push({ name, hex: d.hex });
    if (out.length >= DOMINANT_MAX) break;
  }
  return out;
}

const text = (v) => (typeof v === "string" ? v.trim() : "");

// productRows : lignes de la table « products » (en ligne) ; familyRows : familles visibles.
// Renvoie { products, collections } :
//  - products    : toutes les bagues affichables (avec ou sans saison)
//  - collections : celles qui appartiennent à une saison, au format du moteur de couleurs
export function mapCatalog(productRows, familyRows) {
  const families = Array.isArray(familyRows) ? familyRows.filter((f) => f && f.key) : [];
  const byId = new Map(families.map((f) => [String(f.id), f]));
  const seasonKeyOf = (id) => {
    if (id === undefined || id === null) return null;
    const f = byId.get(String(id));
    return f && f.is_season && SEASON_KEYS.includes(f.key) ? f.key : null;
  };
  const products = [];
  for (const r of Array.isArray(productRows) ? productRows : []) {
    if (!r || r.active === false || r.id === undefined || r.id === null || !text(r.slug)) continue;
    const price = Number(r.price);
    const promo = r.promo_price === null || r.promo_price === undefined ? null : Number(r.promo_price);
    products.push({
      id: r.id,
      slug: r.slug,
      name: text(r.name),
      collection: text(r.collection),
      energy: text(r.energy),
      price: Number.isFinite(price) ? price : null,
      promoPrice: Number.isFinite(promo) && Number.isFinite(price) && promo < price ? promo : null,
      photos: Array.isArray(r.photos) ? r.photos.filter((p) => typeof p === "string" && p) : [],
      color: text(r.color) || "from-rose-300 via-pink-100 to-white",
      stone: text(r.stone) || "💎",
      seasonKey: seasonKeyOf(r.family_id),
      neighbourKey: seasonKeyOf(r.neighbour_family_id),
      dominantColors: cleanDominantColors(r.dominant_colors),
    });
  }
  const collections = products.filter((p) => p.seasonKey).map((p) => ({ slug: p.slug, name: p.name, price: p.promoPrice !== null ? p.promoPrice : p.price, seasonKey: p.seasonKey, neighbourKey: p.neighbourKey, dominantColors: p.dominantColors }));
  return { products, collections };
}

// Noms affichés des saisons, lus dans l'onglet Familles (une saison renommée garde sa clé technique)
export function seasonNamesFrom(familyRows, fallback) {
  const names = { ...(fallback || {}) };
  for (const f of Array.isArray(familyRows) ? familyRows : []) {
    if (f && f.is_season && SEASON_KEYS.includes(f.key) && text(f.name)) names[f.key] = text(f.name);
  }
  return names;
}

// Les trois questions du quiz : clé du choix, titre, aide, et liste des teintes proposées
export const QUIZ_STEPS = [
  { key: "hair", title: "Vos cheveux", help: "Choisissez la teinte la plus proche de vos cheveux au naturel, sans coloration.", list: HAIR },
  { key: "eye", title: "Vos yeux", help: "Regardez-vous à la lumière du jour, près d'une fenêtre.", list: EYES },
  { key: "skin", title: "Votre peau", help: "Pensez à votre teint au naturel, sans bronzage récent.", list: SKIN },
];
