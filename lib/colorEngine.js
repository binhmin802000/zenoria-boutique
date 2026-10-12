// ============================================================================
// ZENORIA — Moteur de colorimétrie du quiz (logique pure : ni React, ni réseau, aucune classe Tailwind)
//
// Principe (colorimétrie des quatre saisons, version simplifiée) :
//   1. TEMPÉRATURE : le teint, les cheveux et les yeux ont-ils un sous-ton chaud ou froid ?
//   2. VALEUR      : l'ensemble est-il clair ou profond ?
//   Chaud + clair = Printemps · Froid + clair = Été · Chaud + profond = Automne · Froid + profond = Hiver.
//   La saison « voisine » est celle où l'on arriverait si l'axe le moins marqué basculait.
//
// Ce que le moteur ne prétend pas : c'est un conseil d'inspiration, pas une analyse professionnelle.
//  - La TEMPÉRATURE est la seule valeur saisie à la main pour chaque choix (un sous-ton ne se lit pas
//    de façon fiable sur un écran). La réponse « or ou argent » n'y ajoute qu'un petit poids.
//  - La VALEUR est calculée à partir de la couleur AFFICHÉE de chaque choix (clarté L* de Lab).
//  - La « netteté » (couleurs vives ou douces) n'est PAS utilisée pour décider : sur des pastilles à l'écran,
//    elle double surtout la température et faisait basculer des profils roux vers le Printemps.
//  - Chaque axe est centré et normalisé sur l'ensemble des combinaisons possibles : aucun biais caché
//    vers une saison, et l'ajout d'un choix recalibre tout seul.
// ============================================================================

export const SEASON_KEYS = ["printemps", "ete", "automne", "hiver"];

// Noms de secours : le site utilise les noms de l'onglet Familles (une saison renommée garde sa clé technique).
export const SEASON_NAMES = { printemps: "Printemps", ete: "Été", automne: "Automne", hiver: "Hiver" };

// Portrait de chaque saison : [température, valeur] avec +1 = chaud / clair.
const PROTOTYPES = {
  printemps: [1, 1],
  ete: [-1, 1],
  automne: [1, -1],
  hiver: [-1, -1],
};
// Description de la saison (pour l'affichage) : la netteté y est décrite, mais ne sert pas au calcul.
export const SEASON_TRAITS = {
  printemps: { temperature: "chaud", value: "clair", chroma: "net" },
  ete: { temperature: "froid", value: "clair", chroma: "doux" },
  automne: { temperature: "chaud", value: "profond", chroma: "doux" },
  hiver: { temperature: "froid", value: "profond", chroma: "net" },
};

// Poids de chaque axe, et poids de la réponse « or ou argent » (sur l'échelle de température d'origine).
export const WEIGHTS = { temperature: 1, value: 1 };
export const METAL_WEIGHT = 0.18;
// En dessous de cet écart entre les deux meilleures saisons, le résultat est « à la frontière ».
export const BORDERLINE_MARGIN = 0.3;

// ------------------------------------------------------------------ choix proposés (8 cheveux, 6 yeux, 8 peaux)
// warmth : sous-ton, de -2 (très froid) à +2 (très chaud). La clarté vient de la couleur « hex » affichée.
export const HAIR = [
  { name: "Noir", hex: "#1c1b20", warmth: -1 },
  { name: "Brun foncé", hex: "#3a2a22", warmth: 0 },
  { name: "Châtain", hex: "#6a4a35", warmth: 0.5 },
  { name: "Châtain clair", hex: "#8b6a4a", warmth: 0.5 },
  { name: "Blond cendré", hex: "#c8bda8", warmth: -1.5 },
  { name: "Blond doré", hex: "#d9b36a", warmth: 1.5 },
  { name: "Roux cuivré", hex: "#b4552b", warmth: 2 },
  { name: "Gris argenté", hex: "#c9ccd2", warmth: -2 },
];
export const EYES = [
  { name: "Marron foncé", hex: "#3b2417", warmth: 0.5 },
  { name: "Noisette", hex: "#8a5a2b", warmth: 1.5 },
  { name: "Ambre", hex: "#b9772b", warmth: 2 },
  { name: "Vert", hex: "#5a8a4f", warmth: 0.8 },
  { name: "Bleu", hex: "#6fa4d6", warmth: -1.5 },
  { name: "Gris-bleu", hex: "#7f95a8", warmth: -1 },
];
export const SKIN = [
  { name: "Porcelaine", hex: "#f6e3d9", warmth: -1 },
  { name: "Ivoire rosé", hex: "#f0d2c2", warmth: -0.5 },
  { name: "Beige clair", hex: "#ecc9a8", warmth: 0.5 },
  { name: "Beige doré", hex: "#e0b184", warmth: 1.5 },
  { name: "Hâlé doré", hex: "#cf9561", warmth: 1.5 },
  { name: "Caramel", hex: "#b57a4a", warmth: 1 },
  { name: "Brun rosé", hex: "#7d4c45", warmth: -0.8 },
  { name: "Brun profond", hex: "#5a3a2a", warmth: 0.5 },
];

// ------------------------------------------------------------------ couleurs
export function hexToRgb(hex) {
  if (typeof hex !== "string") return null; // un nombre ou un objet n'est jamais une couleur
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
export function hexToLab(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [R, G, B] = rgb.map(lin);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const lightness = (hex) => {
  const lab = hexToLab(hex);
  return lab ? lab[0] : null;
};
// Écart de couleur (CIE76) : 0 = identiques ; environ 2 à peine visible ; au-delà de 50, couleurs très différentes.
export function deltaE(hexA, hexB) {
  const a = hexToLab(hexA);
  const b = hexToLab(hexB);
  if (!a || !b) return null;
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
// Mélange deux couleurs « #rrggbb » : pct % de b et le reste de a (même résultat que color-mix(in srgb, a, b pct%)).
export function mixHex(a, b, pct) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return A ? "#" + A.map((c) => c.toString(16).padStart(2, "0")).join("") : "#000000";
  const p = Math.min(100, Math.max(0, Number(pct) || 0)) / 100;
  return "#" + [0, 1, 2].map((i) => Math.round(A[i] * (1 - p) + B[i] * p).toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------------ palette du mannequin
// Quatre couleurs de base -> toutes les couleurs du dessin. Les nuances dérivées (ombre de la peau, sourcils, cils, joues,
// lèvres) sont calculées avec mixHex(), ce qui donne le même résultat que color-mix() sans dépendre du navigateur.
// Sans couleur (ou avec une couleur invalide), une couleur neutre est utilisée.
export const MANNEQUIN_DEFAULTS = { hair: "#bdb7b1", eye: "#8a8a8a", skin: "#e8d6cb", garment: "#e9dfe3" };
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const validHex = (value, fallback) => (typeof value === "string" && HEX6.test(value) ? value : fallback);
export function mannequinPalette(colors) {
  const c = colors || {};
  const base = {
    hair: validHex(c.hair, MANNEQUIN_DEFAULTS.hair),
    eye: validHex(c.eye, MANNEQUIN_DEFAULTS.eye),
    skin: validHex(c.skin, MANNEQUIN_DEFAULTS.skin),
    garment: validHex(c.garment, MANNEQUIN_DEFAULTS.garment),
  };
  return {
    ...base,
    skinDark: mixHex(base.skin, "#000000", 16),
    brow: mixHex(base.hair, "#000000", 22),
    lash: mixHex(base.hair, "#000000", 55),
    blush: mixHex(base.skin, "#d9536a", 42),
    lip: mixHex(base.skin, "#b3445a", 58),
  };
}

// ------------------------------------------------------------------ signaux bruts et calibrage
const LIGHT = {
  hair: HAIR.map((o) => lightness(o.hex)),
  eye: EYES.map((o) => lightness(o.hex)),
  skin: SKIN.map((o) => lightness(o.hex)),
};

function rawSignals(h, e, s) {
  const temperature = 0.5 * SKIN[s].warmth + 0.3 * HAIR[h].warmth + 0.2 * EYES[e].warmth;
  const lum = 0.45 * LIGHT.skin[s] + 0.4 * LIGHT.hair[h] + 0.15 * LIGHT.eye[e];
  return { temperature, lum };
}

// Moyenne et écart-type de chaque signal sur toutes les combinaisons (sans réponse « métal »).
export function calibrate() {
  const rows = [];
  for (let h = 0; h < HAIR.length; h++) for (let e = 0; e < EYES.length; e++) for (let s = 0; s < SKIN.length; s++) rows.push(rawSignals(h, e, s));
  const stat = (key) => {
    const v = rows.map((r) => r[key]);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
    return { mean, sd };
  };
  return { temperature: stat("temperature"), lum: stat("lum") };
}
export const CALIB = calibrate();

// ------------------------------------------------------------------ classement
const isIndex = (i, list) => Number.isInteger(i) && i >= 0 && i < list.length;
export function isValidProfile(p) {
  return Boolean(p) && isIndex(p.hair, HAIR) && isIndex(p.eye, EYES) && isIndex(p.skin, SKIN);
}
const metalValue = (m) => (m === 1 || m === -1 ? m : 0);

// Renvoie null si le profil est incomplet : jamais d'erreur levée pour une réponse manquante.
// profile = { hair, eye, skin } (indices dans HAIR, EYES, SKIN) et metal : 1 (or), -1 (argent) ou 0 / absent.
export function classify(profile, opts) {
  if (!isValidProfile(profile)) return null;
  const o = opts || {};
  const w = o.weights || WEIGHTS;
  const borderlineMargin = typeof o.borderline === "number" ? o.borderline : BORDERLINE_MARGIN;
  const metalW = typeof o.metalWeight === "number" ? o.metalWeight : METAL_WEIGHT;
  const raw = rawSignals(profile.hair, profile.eye, profile.skin);
  raw.temperature += metalW * metalValue(profile.metal);
  const T = (raw.temperature - CALIB.temperature.mean) / CALIB.temperature.sd; // + = chaud
  const V = (raw.lum - CALIB.lum.mean) / CALIB.lum.sd; // + = clair
  const scores = {};
  for (const k of SEASON_KEYS) scores[k] = w.temperature * PROTOTYPES[k][0] * T + w.value * PROTOTYPES[k][1] * V;
  const ranked = SEASON_KEYS.slice().sort((a, b) => scores[b] - scores[a]);
  const gap = scores[ranked[0]] - scores[ranked[1]];
  return {
    primary: ranked[0],
    secondary: ranked[1],
    margin: gap,
    borderline: gap < borderlineMargin,
    scores,
    axes: { temperature: T, value: V },
    traits: SEASON_TRAITS[ranked[0]],
  };
}

// ------------------------------------------------------------------ textes fixes
export const SEASON_LINE = {
  printemps: "Elle prolonge la chaleur et la clarté de votre coloris.",
  ete: "Elle reste douce et fraîche, comme votre coloris.",
  automne: "Elle épouse la chaleur et la profondeur de votre coloris.",
  hiver: "Elle répond à la netteté et au contraste de votre coloris.",
};
export const SEASON_WHY = {
  printemps: "Votre coloris est chaud et lumineux : les teintes fraîches, nettes et dorées éclairent votre teint.",
  ete: "Votre coloris est frais et délicat : les teintes douces, poudrées et légèrement froides s'harmonisent avec vous.",
  automne: "Votre coloris est chaud et profond : les teintes riches, terreuses et enveloppantes vous mettent en valeur.",
  hiver: "Votre coloris est net et contrasté : les teintes franches, froides ou très profondes vous subliment.",
};
const NEIGHBOUR_LINE = "Palette voisine de votre saison principale : elle peut aussi vous flatter.";
const WARM_SEASONS = ["printemps", "automne"];
// Les bagues sont montées sur laiton de couleur cuivre, un métal chaud : on le dit honnêtement.
export function metalRemark(primarySeason) {
  return WARM_SEASONS.includes(primarySeason)
    ? "Montée sur laiton de couleur cuivre, une teinte chaude, elle prolonge la chaleur de votre teint."
    : "Montée sur laiton de couleur cuivre, une teinte chaude : c'est ici la pierre qui fait l'accord avec votre coloris.";
}
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// Les trois mots qui décrivent la saison, par exemple ["Chaud", "Profond", "Doux"]
export function traitLabels(seasonKey) {
  const t = SEASON_TRAITS[seasonKey];
  return t ? [capitalize(t.temperature), capitalize(t.value), capitalize(t.chroma)] : [];
}
// Note affichée quand le résultat est « à la frontière » de deux saisons ("" sinon)
export function borderlineNote(result, names) {
  if (!result || !result.borderline) return "";
  const n = { ...SEASON_NAMES, ...(names || {}) };
  return "Votre coloris est à la frontière entre " + n[result.primary] + " et " + n[result.secondary] + " : les bagues " + n[result.secondary] + " peuvent aussi vous flatter.";
}

// ------------------------------------------------------------------ explications : toujours une phrase
// Trois niveaux, du plus précis au plus général, pour qu'une bague ait TOUJOURS une explication honnête :
//   "echo"    : la couleur dominante de la bague est vraiment proche des yeux ou des cheveux (ΔE ≤ ECHO_MAX)
//   "near"    : elle s'en rapproche (ΔE ≤ NEAR_MAX)
//   "palette" : on dit seulement à quelle palette de saison appartient la bague (aucune ressemblance affirmée)
export const ECHO_MAX = 18;
export const NEAR_MAX = 32;
const EYE_ADJ = { "Marron foncé": "marron foncé", Noisette: "noisette", Ambre: "ambre", Vert: "verts", Bleu: "bleus", "Gris-bleu": "gris-bleu" };
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const cleanName = (dc) => (dc && typeof dc.name === "string" ? dc.name.trim() : "");

// Couleur dominante de la bague la plus proche des yeux ou des cheveux : { d, target, name } ou null
function bestMatch(profile, collection) {
  if (!isValidProfile(profile) || !collection || !Array.isArray(collection.dominantColors)) return null;
  const eyesHex = EYES[profile.eye].hex;
  const hairHex = HAIR[profile.hair].hex;
  let best = null;
  for (const dc of collection.dominantColors) {
    const name = cleanName(dc);
    if (!name) continue;
    const dEyes = deltaE(dc.hex, eyesHex);
    const dHair = deltaE(dc.hex, hairHex);
    if (dEyes === null || dHair === null) continue;
    const target = dEyes <= dHair ? "eyes" : "hair";
    const d = Math.min(dEyes, dHair);
    if (!best || d < best.d) best = { d, target, name };
  }
  return best;
}
const eyeWord = (profile) => EYE_ADJ[EYES[profile.eye].name] || EYES[profile.eye].name.toLowerCase();

// Phrase d'écho STRICTE : null si aucune couleur n'est vraiment proche (utile pour les tests et l'administration)
export function echoSentence(profile, collection) {
  const m = bestMatch(profile, collection);
  if (!m || m.d > ECHO_MAX) return null;
  return m.target === "eyes"
    ? "Sa teinte " + lowerFirst(m.name) + " fait écho à vos yeux " + eyeWord(profile) + "."
    : "Sa teinte " + lowerFirst(m.name) + " rappelle vos cheveux.";
}
function nearSentence(profile, collection) {
  const m = bestMatch(profile, collection);
  if (!m || m.d > NEAR_MAX) return null;
  return m.target === "eyes"
    ? "Sa teinte " + lowerFirst(m.name) + " se rapproche de vos yeux " + eyeWord(profile) + "."
    : "Sa teinte " + lowerFirst(m.name) + " se rapproche de la couleur de vos cheveux.";
}
function firstColorName(collection) {
  const list = collection && Array.isArray(collection.dominantColors) ? collection.dominantColors : [];
  for (const dc of list) {
    const n = cleanName(dc);
    if (n) return lowerFirst(n);
  }
  return "";
}

// « Pourquoi elle vous va » : une phrase, jamais vide. pick = { collection, kind } ; ctx = { primary, names }.
// kind : "best" / "season" (saison principale), "also" (autre saison, pensée aussi pour la vôtre), "neighbour" (saison voisine).
export function whyText(profile, pick, ctx) {
  const c = (pick && pick.collection) || {};
  const kind = (pick && (pick.origin || pick.kind)) || "season";
  const names = { ...SEASON_NAMES, ...((ctx && ctx.names) || {}) };
  const primary = ctx && SEASON_KEYS.includes(ctx.primary) ? ctx.primary : "automne";
  const primaryName = names[primary];
  const ownName = names[c.seasonKey] || "";
  const tail = kind === "neighbour" ? NEIGHBOUR_LINE : kind === "also" ? "Elle est aussi pensée pour la palette " + primaryName + "." : SEASON_LINE[primary];
  const strict = echoSentence(profile, c);
  if (strict) return { level: "echo", text: strict + " " + tail };
  const near = nearSentence(profile, c);
  if (near) return { level: "near", text: near + " " + tail };
  const dom = firstColorName(c);
  const subject = dom ? "Sa teinte " + dom : "Cette bague";
  if (kind === "neighbour") return { level: "palette", text: subject + " fait partie de la palette " + ownName + ", voisine de votre saison principale : elle peut aussi vous flatter." };
  if (kind === "also") return { level: "palette", text: subject + " est de la palette " + ownName + ", mais elle est aussi pensée pour la vôtre, " + primaryName + "." };
  return { level: "palette", text: subject + " fait partie de votre palette, " + primaryName + ". " + SEASON_LINE[primary] };
}

// ------------------------------------------------------------------ recommandation des collections
// collections : [{ slug, name, price, seasonKey, neighbourKey, dominantColors }] (collections EN LIGNE seulement : l'appelant filtre).
//  seasonKey    : clé de la famille (saison) de la collection
//  neighbourKey : « saison voisine » choisie dans l'administration (facultatif)
// opts : { max (3 par défaut), seasonNames : { printemps: "Printemps", ... } (noms de l'onglet Familles), + options de classify }
// Renvoie { result, picks, thin, primaryCount } ou null si le profil est incomplet.
//  kind : "best"      la meilleure correspondance (de la saison, ou d'une collection pensée aussi pour elle)
//         "season"    une bague de la saison principale
//         "also"      une bague d'une autre saison, pensée aussi pour la saison principale
//         "neighbour" une bague de la saison voisine
//  chaque pick : { collection, kind, origin, echo (phrase stricte ou null), level, why (phrase, jamais vide), score }
export function recommend(profile, collections, opts) {
  const result = classify(profile, opts);
  if (!result) return null;
  const max = opts && Number.isInteger(opts.max) && opts.max > 0 ? opts.max : 3;
  const names = (opts && opts.seasonNames) || {};
  const list = Array.isArray(collections) ? collections.filter((c) => c && typeof c.slug === "string" && SEASON_KEYS.includes(c.seasonKey)) : [];
  const scored = [];
  for (const c of list) {
    let tier = 0;
    let kind = null;
    if (c.seasonKey === result.primary) { tier = 10; kind = "season"; }
    else if (c.neighbourKey === result.primary) { tier = 6; kind = "also"; }
    else if (c.seasonKey === result.secondary) { tier = 4; kind = "neighbour"; }
    else if (c.neighbourKey === result.secondary) { tier = 2; kind = "neighbour"; }
    if (!tier) continue;
    const echo = echoSentence(profile, c);
    scored.push({ collection: c, kind, origin: kind, echo, score: tier + (echo ? 1 : 0) });
  }
  const price = (c) => (Number.isFinite(Number(c.price)) ? Number(c.price) : Infinity);
  scored.sort((a, b) => b.score - a.score || price(a.collection) - price(b.collection) || String(a.collection.name).localeCompare(String(b.collection.name), "fr"));
  const picks = scored.slice(0, max);
  if (picks.length && (picks[0].kind === "season" || picks[0].kind === "also")) picks[0] = { ...picks[0], kind: "best" };
  const ctx = { primary: result.primary, names };
  for (let i = 0; i < picks.length; i++) {
    const w = whyText(profile, picks[i], ctx);
    picks[i] = { ...picks[i], level: w.level, why: w.text };
  }
  const primaryCount = list.filter((c) => c.seasonKey === result.primary).length;
  return { result, picks, thin: primaryCount < 2, primaryCount };
}
