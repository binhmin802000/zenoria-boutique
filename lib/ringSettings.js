// ============================================================
// RÉGLAGES DE L'ANIMATION « LE GESTE » (bague, couleur du cœur, vitesse, lecture)
//
// Fichier SANS dépendance : il est utilisé par le site (components/RingAnimationSection.js) et par l'administration
// (components/AdminRingAnimation.js).
//
// Enregistrement :
//  - les réglages dans la table « site_settings », clé « ring_animation » (une valeur JSON) ;
//  - la photo détourée de la bague dans « site_media », emplacement « ring_animation_photo »
//    (fichier PNG transparent rangé dans le stockage, dossier site/ring_animation_photo/).
//  La couleur dominante de la bague est écrite dans le nom du fichier (« 1700000000000-2e75c6.png ») : elle reste
//  toujours liée à la bonne photo, sans colonne supplémentaire.
//
// Valeurs possibles de « ring_animation » :
//   { "speed": "slow" | "normal" | "fast",
//     "mode": "once" | "loop" | "vanish",
//     "heart_color": "ring" | "season" }
// Voir supabase_ring_animation.sql.
// ============================================================

export const RING_SETTING_KEY = "ring_animation";
export const RING_SLOT = "ring_animation_photo";

// Bague utilisée tant qu'aucune photo n'est choisie dans l'administration (fichier du dossier public/animations)
export const DEFAULT_RING_PHOTO = "/animations/ring-bleu.png";
export const DEFAULT_RING_COLOR = "#2e75c6";
export const FALLBACK_ACCENT = "#8f6075"; // mauve Zenoria, comme le reste du site

export const RING_SPEEDS = [
  { id: "slow", label: "Lent", value: 0.8, text: "Environ 17 s au total" },
  { id: "normal", label: "Normal", value: 1, text: "13,9 s" },
  { id: "fast", label: "Rapide", value: 1.25, text: "Environ 11 s" },
];

export const RING_MODES = [
  {
    id: "once",
    title: "Une fois, puis reste affichée",
    badge: "recommandé",
    text: "L'animation se joue quand la visiteuse arrive dessus, puis reste à l'écran : le cœur flotte doucement et un reflet traverse la bague.",
  },
  {
    id: "loop",
    title: "En boucle",
    badge: "",
    text: "Après 3 secondes de pause sur l'image finale, elle repart du début, en fondu. Elle se met en pause dès qu'elle sort de l'écran.",
  },
  {
    id: "vanish",
    title: "Disparaît après la lecture",
    badge: "",
    text: "Elle reste affichée 4 secondes, s'efface en fondu, puis la zone se replie : le contenu suivant remonte, sans vide dans la page.",
  },
];

export const RING_HEART_COLORS = [
  { id: "ring", title: "Couleur de la bague", badge: "recommandé", text: "Le cœur, le halo et les étincelles reprennent la couleur dominante de la bague." },
  { id: "season", title: "Couleur de la saison active", badge: "", text: "Ils prennent l'accent de la famille de la saison active (réglé dans l'onglet Familles)." },
];

export const DEFAULT_RING_SETTING = { speed: "normal", mode: "once", heart_color: "ring" };

const HEX = /^#[0-9a-fA-F]{6}$/;
const isId = (list, id) => list.some((x) => x.id === id);

export function isHexColor(v) {
  return typeof v === "string" && HEX.test(v);
}

// Lit la valeur enregistrée. Tout ce qui n'est pas reconnu redonne la valeur par défaut :
// le site n'affiche jamais une vitesse ou un mode inventé.
export function parseRingSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    speed: isId(RING_SPEEDS, v.speed) ? v.speed : DEFAULT_RING_SETTING.speed,
    mode: isId(RING_MODES, v.mode) ? v.mode : DEFAULT_RING_SETTING.mode,
    heart_color: isId(RING_HEART_COLORS, v.heart_color) ? v.heart_color : DEFAULT_RING_SETTING.heart_color,
  };
}

// Valeur à enregistrer depuis le formulaire (toujours complète et valide)
export function buildRingSettingValue(s) {
  return parseRingSetting(s);
}

export function sameRingSetting(a, b) {
  const x = parseRingSetting(a);
  const y = parseRingSetting(b);
  return x.speed === y.speed && x.mode === y.mode && x.heart_color === y.heart_color;
}

export function speedValue(id) {
  const s = RING_SPEEDS.find((x) => x.id === id);
  return s ? s.value : 1;
}

// Couleur de la bague, lue dans le nom du fichier envoyé depuis l'administration ; bague par défaut sinon
export function ringColorFromPath(path) {
  if (typeof path !== "string") return DEFAULT_RING_COLOR;
  const m = path.match(/-([0-9a-fA-F]{6})\.png$/);
  return m ? "#" + m[1].toLowerCase() : DEFAULT_RING_COLOR;
}

// Nom du fichier à envoyer : site/ring_animation_photo/<horodatage>-<couleur>.png
export function buildRingPath(color, now) {
  const hex = isHexColor(color) ? color.slice(1).toLowerCase() : DEFAULT_RING_COLOR.slice(1);
  return `site/${RING_SLOT}/${now}-${hex}.png`;
}

// Couleur du cœur, du halo et des étincelles
//  - « season » : l'accent de la saison active (s'il est valide)
//  - « ring »   : la couleur de la bague
export function resolveHeartColor(setting, ringColor, accent) {
  const s = parseRingSetting(setting);
  if (s.heart_color === "season") return isHexColor(accent) ? accent : FALLBACK_ACCENT;
  return isHexColor(ringColor) ? ringColor : DEFAULT_RING_COLOR;
}

// Saison du moment d'après la date (hémisphère nord). Sert seulement à l'aperçu de l'administration :
// le site, lui, utilise la saison active calculée par pages/index.js.
export function currentSeasonKey(date) {
  const d = date instanceof Date ? date : new Date();
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  if (md >= 320 && md <= 620) return "printemps";
  if (md >= 621 && md <= 922) return "ete";
  if (md >= 923 && md <= 1220) return "automne";
  return "hiver";
}

// Texte du réglage enregistré, pour l'administration
export function describeRingSetting(setting) {
  const s = parseRingSetting(setting);
  const speed = RING_SPEEDS.find((x) => x.id === s.speed);
  const mode = RING_MODES.find((x) => x.id === s.mode);
  const heart = RING_HEART_COLORS.find((x) => x.id === s.heart_color);
  return `${mode.title.toLowerCase()} · vitesse ${speed.label.toLowerCase()} · cœur : ${heart.title.toLowerCase()}`;
}
