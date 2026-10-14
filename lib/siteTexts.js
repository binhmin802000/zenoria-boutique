// ============================================================
// TEXTES MODIFIABLES DU SITE (Savoir-faire et page d'accueil)
//
// Fichier SANS dépendance : il est utilisé par la page d'accueil (pages/index.js), la section Savoir-faire
// (components/SavoirFaire.js) et l'administration (components/AdminSiteTexts.js, onglet « Contenu du site »).
// Le script patch-textes-etape3.mjs lit aussi ce fichier : n'y ajoutez ni import, ni syntaxe particulière.
//
// Enregistrement : table « site_settings », clé « site_texts », valeur JSON = SEULEMENT les textes modifiés :
//     { "hero_intro": "Mon nouveau texte…", "sf_step2_title": "…" }
// Un texte absent (ou vide, trop long, abîmé) retombe sur le texte d'origine défini ci-dessous : le site n'est
// donc jamais vide, et reste identique à l'original tant que rien n'est enregistré.
//
// Règles :
//  - texte brut uniquement : aucun HTML (« < » s'affiche tel quel), les sauts de ligne sont conservés là où ils
//    sont permis (multiline), les autres textes tiennent sur une seule ligne ;
//  - longueur limitée pour chaque texte (max), et nombre de lignes limité (maxLines).
// Voir aussi : components/TextLines.js (affiche les sauts de ligne) et components/AdminSiteTexts.js.
// ============================================================

export const SITE_TEXTS_KEY = "site_texts";

export const TEXT_GROUPS = [
  { id: "sf", title: "Section Savoir-faire", hint: "Le bloc « Notre savoir-faire », avec les chiffres clés et les quatre étapes." },
  { id: "hero", title: "Accueil : haut de page", hint: "Le grand bloc avec ZENORIA, la phrase d'accueil et la vignette sur le visuel." },
  { id: "seasons", title: "Accueil : les saisons", hint: "Le titre et la phrase au-dessus des quatre cartes saisons." },
  { id: "philo", title: "Accueil : notre philosophie", hint: "Le bloc sombre avec le titre, le paragraphe et le bouton." },
  { id: "quiz", title: "Accueil : invitation au quiz", hint: "Le bloc en dégradé qui invite à faire le quiz couleurs." },
];

// key : identifiant technique (ne pas le changer) ; def : texte d'origine ; multiline : sauts de ligne permis ;
// max : longueur maximale en caractères ; maxLines : nombre de lignes maximal ; rows : hauteur du champ dans l'admin
export const TEXT_FIELDS = [
  // ---------- Savoir-faire ----------
  { key: "sf_title", group: "sf", label: "Titre (3 lignes)", def: "Une bague,\ncinquante cristaux Swarovski,\nun geste à la main.", multiline: true, max: 160, maxLines: 4, rows: 3 },
  {
    key: "sf_intro", group: "sf", label: "Paragraphe", multiline: true, max: 600, maxLines: 6, rows: 4,
    def: "Chez Zenoria, chaque bague est entièrement réalisée à la main. Cinquante mini cristaux Swarovski sont assemblés autour d'un cabochon central, dans une palette de couleurs pensée pour chaque modèle.",
  },
  { key: "sf_fig1_value", group: "sf", label: "Chiffre clé 1 : valeur", def: "50", max: 12 },
  { key: "sf_fig1_label", group: "sf", label: "Chiffre clé 1 : libellé", def: "mini cristaux Swarovski par bague", max: 60 },
  { key: "sf_fig2_value", group: "sf", label: "Chiffre clé 2 : valeur", def: "1", max: 12 },
  { key: "sf_fig2_label", group: "sf", label: "Chiffre clé 2 : libellé", def: "cabochon central", max: 60 },
  { key: "sf_fig3_value", group: "sf", label: "Chiffre clé 3 : valeur", def: "100 %", max: 12 },
  { key: "sf_fig3_label", group: "sf", label: "Chiffre clé 3 : libellé", def: "fait main", max: 60 },
  { key: "sf_step1_title", group: "sf", label: "Étape 01 : titre", def: "Le choix des couleurs", max: 80 },
  {
    key: "sf_step1_text", group: "sf", label: "Étape 01 : texte", multiline: true, max: 400, maxLines: 5, rows: 3,
    def: "Chaque modèle suit sa propre palette : les mini cristaux Swarovski sont choisis dans des couleurs différentes pour composer l'harmonie de la bague.",
  },
  { key: "sf_step2_title", group: "sf", label: "Étape 02 : titre", def: "Le cabochon central", max: 80 },
  {
    key: "sf_step2_text", group: "sf", label: "Étape 02 : texte", multiline: true, max: 400, maxLines: 5, rows: 3,
    def: "Au cœur de la bague, un cabochon aux couleurs propres à chaque modèle devient le point de départ de la création.",
  },
  { key: "sf_step3_title", group: "sf", label: "Étape 03 : titre", def: "L'assemblage à la main", max: 80 },
  {
    key: "sf_step3_text", group: "sf", label: "Étape 03 : texte", multiline: true, max: 400, maxLines: 5, rows: 3,
    def: "Superposés puis liés par un fil de nylon, les 50 mini cristaux Swarovski prennent forme entre nos mains, avec la précision et l'exigence que demande chaque bague.",
  },
  { key: "sf_step4_title", group: "sf", label: "Étape 04 : titre", def: "La monture en laiton cuivré", max: 80 },
  {
    key: "sf_step4_text", group: "sf", label: "Étape 04 : texte", multiline: true, max: 400, maxLines: 5, rows: 3,
    def: "Les cristaux reposent sur une monture en laiton aux reflets cuivrés, traitée d'un vernis spécial pour métaux, qui protège la peau et encadre la création.",
  },

  // ---------- Accueil : haut de page ----------
  {
    key: "hero_label", group: "hero", label: "Étiquette au-dessus de ZENORIA", def: "Façonnées à la main · 4 saisons", max: 60,
    note: "Le nombre de collections (« 9 collections · ») s'affiche automatiquement devant ce texte.",
  },
  { key: "hero_tagline", group: "hero", label: "Phrase sous ZENORIA (2 lignes)", def: "L'énergie du cristal,\nl'harmonie de l'âme.", multiline: true, max: 100, maxLines: 3, rows: 2 },
  {
    key: "hero_intro", group: "hero", label: "Phrase d'accueil", multiline: true, max: 400, maxLines: 5, rows: 4,
    def: "Façonnées à la main avec exigence et précision, nos bagues en cristaux Swarovski suivent les quatre saisons pour sublimer celles qui les portent. Trouvez celle qui s'accorde à votre teint, à vos yeux et à vos cheveux.",
  },
  { key: "hero_badge_title", group: "hero", label: "Vignette sur le visuel : ligne 1", def: "Façonnée à la main", max: 40 },
  { key: "hero_badge_sub", group: "hero", label: "Vignette sur le visuel : ligne 2", def: "Cristaux Swarovski", max: 40 },

  // ---------- Accueil : saisons ----------
  { key: "seasons_eyebrow", group: "seasons", label: "Étiquette", def: "Une palette pour chaque saison", max: 60 },
  { key: "seasons_title", group: "seasons", label: "Titre", def: "Quelle saison vous ressemble ?", max: 80 },
  {
    key: "seasons_intro", group: "seasons", label: "Phrase", multiline: true, max: 300, maxLines: 4, rows: 3,
    def: "Chaque saison réunit des bagues dont les teintes se répondent, pour révéler votre carnation.",
  },

  // ---------- Accueil : philosophie ----------
  { key: "philo_title", group: "philo", label: "Titre (2 lignes)", def: "Quatre saisons,\nun geste à la main.", multiline: true, max: 100, maxLines: 3, rows: 2 },
  {
    key: "philo_text", group: "philo", label: "Paragraphe", multiline: true, max: 600, maxLines: 6, rows: 4,
    def: "Chaque bague Zenoria est façonnée à la main, avec soin, en cristaux Swarovski. Nous l'avons rangée par saison : une façon de choisir un bijou comme on choisit une couleur, avec le cœur et avec l'œil.",
  },
  { key: "philo_button", group: "philo", label: "Texte du bouton", def: "Découvrir notre histoire", max: 40 },

  // ---------- Accueil : invitation au quiz ----------
  { key: "quiz_title", group: "quiz", label: "Titre", def: "Quelle bague vous convient le mieux ?", max: 80 },
  {
    key: "quiz_text", group: "quiz", label: "Paragraphe", multiline: true, max: 400, maxLines: 5, rows: 3,
    def: "Choisissez la couleur de vos cheveux, de vos yeux et de votre peau. Nous vous proposons les bagues — et les couleurs de vêtements — qui vous mettent en valeur.",
  },
];

export const DEFAULT_TEXTS = Object.freeze(
  TEXT_FIELDS.reduce((acc, f) => {
    acc[f.key] = f.def;
    return acc;
  }, {})
);

const FIELD_BY_KEY = TEXT_FIELDS.reduce((acc, f) => {
  acc[f.key] = f;
  return acc;
}, {});

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Nettoie un texte saisi : retours à la ligne normalisés, caractères de contrôle retirés, espaces multiples réduits.
// Une ligne seule (multiline faux) : tout saut de ligne devient une espace. Le HTML n'est pas interprété : il reste du texte.
export function normalizeText(value, multiline) {
  if (typeof value !== "string") return "";
  const s = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F\u2028\u2029]/g, " ");
  if (!multiline) return s.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countLines(text) {
  return String(text === null || text === undefined ? "" : text).split("\n").length;
}

// Un texte est-il acceptable pour ce champ ? Renvoie "" si oui, sinon le motif du refus.
export function textProblem(field, text) {
  if (text.length > field.max) return `Ce texte est trop long : ${text.length} caractères sur ${field.max} au maximum.`;
  if (field.multiline && countLines(text) > field.maxLines) return `Trop de lignes : ${countLines(text)} sur ${field.maxLines} au maximum.`;
  return "";
}

// Lit la valeur enregistrée : seuls les textes connus, valides et non vides sont retenus.
export function parseOverrides(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  TEXT_FIELDS.forEach((f) => {
    if (!has(v, f.key)) return;
    const n = normalizeText(v[f.key], Boolean(f.multiline));
    if (n && !textProblem(f, n)) out[f.key] = n;
  });
  return out;
}

// Tous les textes du site : les textes enregistrés, complétés par les textes d'origine
export function resolveSiteTexts(value) {
  return Object.assign({}, DEFAULT_TEXTS, parseOverrides(value));
}

// Depuis le formulaire (clé -> texte saisi) : les textes à enregistrer (seulement ceux qui diffèrent de l'origine)
// et les erreurs par champ. Un champ vide revient au texte d'origine : il n'est pas enregistré, ce n'est pas une erreur.
export function buildTextsValue(drafts) {
  const d = drafts && typeof drafts === "object" ? drafts : {};
  const overrides = {};
  const errors = {};
  TEXT_FIELDS.forEach((f) => {
    const n = normalizeText(d[f.key], Boolean(f.multiline));
    if (n === "") return;
    const why = textProblem(f, n);
    if (why) {
      errors[f.key] = why;
      return;
    }
    if (n !== normalizeText(f.def, Boolean(f.multiline))) overrides[f.key] = n;
  });
  return { overrides, errors, valid: Object.keys(errors).length === 0 };
}

export function sameOverrides(a, b) {
  const ka = Object.keys(a || {}).sort();
  const kb = Object.keys(b || {}).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

// Taille maximale que pourrait atteindre la valeur enregistrée, en octets UTF-8 (la base la limite à 40 000 octets)
export function maxStoredBytes() {
  return TEXT_FIELDS.reduce((s, f) => s + f.key.length + f.max * 4 + 8, 2);
}

// Lecture côté site. Ne lève jamais d'erreur : en cas de problème, les textes d'origine sont renvoyés.
export async function fetchSiteTexts(client, table = "site_settings") {
  try {
    const res = await client.from(table).select("value").eq("key", SITE_TEXTS_KEY).maybeSingle();
    if (res && !res.error && res.data) return resolveSiteTexts(res.data.value);
  } catch (e) {
    // réglage illisible : textes d'origine
  }
  return DEFAULT_TEXTS;
}

export function fieldOf(key) {
  return FIELD_BY_KEY[key] || null;
}
