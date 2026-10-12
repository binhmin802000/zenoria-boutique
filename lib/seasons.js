// ============================================================
// seasons.js — les SAISONS (familles) côté SITE : logique pure, sans React ni appel réseau
//
// Le site lit les familles dans la table « families » (voir l'onglet Familles de /admin). Ce fichier transforme ces lignes
// en cartes, filtres et libellés, et décide quelle saison animer. Il est testé seul.
//
// Règles :
//  - seules les familles EN LIGNE sont utilisées (un administrateur connecté reçoit aussi les familles masquées) ;
//  - une collection est rattachée à sa famille par products.family_id ; l'ancien texte products.family (« Collection Bleus »)
//    ne sert qu'en secours, quand les familles ne peuvent pas être lues ;
//  - les 4 saisons ont des identifiants fixes : printemps, ete, automne, hiver (le nom affiché, lui, se modifie librement).
//  - ce fichier ne contient AUCUNE classe Tailwind : les couleurs sont des valeurs CSS écrites en ligne.
// ============================================================

export const SEASON_KEYS = ["printemps", "ete", "automne", "hiver"];

// Saison du moment d'après la date : elle change vers le 20 mars, le 21 juin, le 23 septembre et le 21 décembre
export function seasonOf(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const v = (d.getMonth() + 1) * 100 + d.getDate();
  if (v >= 1221 || v < 320) return "hiver";
  if (v < 621) return "printemps";
  if (v < 923) return "ete";
  return "automne";
}

// ------------------------------------------------------------
// Couleurs d'une carte
// ------------------------------------------------------------
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const isHex = (v) => typeof v === "string" && HEX_RE.test(v);

const SEASON_GRADIENTS = {
  printemps: "linear-gradient(135deg,#ffe3d1,#fdf3b8 60%,#d9f0cf)",
  ete: "linear-gradient(135deg,#e6e9fb,#f3dfee 55%,#d8ecf7)",
  automne: "linear-gradient(135deg,#f6d3b3,#e6b27e 55%,#d9a48a)",
  hiver: "linear-gradient(135deg,#dbe6fb,#c9d3ee 55%,#e9e1f5)",
};

// Éclaircit une couleur « #rrggbb » en la mélangeant avec du blanc (amount : 0 = inchangée, 1 = blanc)
export function lightenHex(hex, amount) {
  if (!isHex(hex)) return "#ffffff";
  const k = Math.min(1, Math.max(0, Number(amount) || 0));
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * k);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

// Dégradé d'une famille : celui de sa saison, ou un dégradé tiré de sa couleur d'accent pour une famille supplémentaire
export function gradientFor(family) {
  if (family && family.is_season && SEASON_GRADIENTS[family.key]) return SEASON_GRADIENTS[family.key];
  const accent = family && isHex(family.accent) ? family.accent : "#8f6075";
  return "linear-gradient(135deg," + lightenHex(accent, 0.82) + "," + lightenHex(accent, 0.93) + ")";
}

// ------------------------------------------------------------
// Familles
// ------------------------------------------------------------
// Familles en ligne, dans l'ordre d'affichage
export function visibleFamilies(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && r.key && r.name && r.active !== false)
    .slice()
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));
}

const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

export function familyOfProduct(product, families) {
  if (!product || !Array.isArray(families)) return null;
  return families.find((f) => sameId(f.id, product.familyId)) || null;
}

function countOf(family, products) {
  return (products || []).filter((p) => sameId(p.familyId, family.id)).length;
}

// Les cartes de la section « Quelle saison vous ressemble ? » : les saisons seulement
export function buildSeasonCards(families, products) {
  return (families || [])
    .filter((f) => f.is_season)
    .map((f) => ({
      id: f.id,
      key: f.key,
      name: f.name,
      tagline: f.tagline || "",
      description: f.description || "",
      accent: isHex(f.accent) ? f.accent : "#8f6075",
      palette: (Array.isArray(f.palette) ? f.palette : []).filter(isHex),
      count: countOf(f, products),
      grad: gradientFor(f),
    }));
}

// Les filtres du catalogue : toutes les saisons, puis les autres familles qui contiennent au moins une création
export function buildFamilyChips(families, products) {
  return (families || [])
    .map((f) => ({ key: f.key, name: f.name, accent: isHex(f.accent) ? f.accent : "#8f6075", isSeason: Boolean(f.is_season), count: countOf(f, products) }))
    .filter((c) => c.isSeason || c.count > 0);
}

export function filterByFamily(products, families, key) {
  const family = (families || []).find((f) => f.key === key);
  if (!family) return [];
  return (products || []).filter((p) => sameId(p.familyId, family.id));
}

// Libellé au-dessus du nom d'une bague : « Automne · Ancrage »
//  - famille connue                                -> « Automne · Ancrage »
//  - familles lues, mais collection sans famille   -> « Ancrage »
//  - familles illisibles (secours)                 -> ancien texte « Collection Nature · Ancrage », comme avant
export function productLabel(product, families, familiesReady) {
  const collection = String((product && product.collection) || "").trim();
  const family = familyOfProduct(product, families);
  if (family) return [family.name, collection].filter(Boolean).join(" · ");
  if (familiesReady) return collection;
  return [String((product && product.family) || "").trim(), collection].filter(Boolean).join(" · ");
}

// ------------------------------------------------------------
// Animation saisonnière : réglage et choix de la saison
// ------------------------------------------------------------
export const FX_MODES = ["auto", "forced", "off"];

// Lit le réglage enregistré (ligne de la table site_settings, ou sa valeur). Tout ce qui est illisible donne « automatique ».
export function parseFxSetting(row) {
  const fallback = { mode: "auto", season: null };
  if (!row) return fallback;
  let value = typeof row === "object" && "value" in row ? row.value : row;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  }
  if (!value || typeof value !== "object") return fallback;
  const mode = FX_MODES.includes(value.mode) ? value.mode : "auto";
  if (mode === "forced") return SEASON_KEYS.includes(value.season) ? { mode, season: value.season } : fallback;
  return { mode, season: null };
}

// Saison à animer : null (aucune) si l'animation est désactivée ; sinon le choix de la visiteuse (clic sur une saison),
// la saison forcée, ou la saison du moment.
export function resolveFxSeason(setting, clicked, date) {
  const s = setting && typeof setting === "object" ? setting : { mode: "auto" };
  if (s.mode === "off") return null;
  if (clicked && SEASON_KEYS.includes(clicked)) return clicked;
  if (s.mode === "forced" && SEASON_KEYS.includes(s.season)) return s.season;
  return seasonOf(date);
}

// Texte de la pastille sous le titre : « Saison du moment : Automne » ou « Ambiance : Hiver »
export function fxPillText(setting, clicked, seasonName) {
  if (!seasonName) return null;
  const auto = (!setting || setting.mode === "auto" || setting.mode === undefined) && !clicked;
  return { prefix: auto ? "Saison du moment :" : "Ambiance :", name: seasonName };
}
