#!/usr/bin/env node
// ============================================================
// patch-lotR4-ligne-configuration.mjs  -  ZENORIA_CONFIG_R4_V1
//
// Lot R4 : l'onglet Configuration (Accueil › Configuration, lecture seule) affiche l'état du réglage « Ordre des bijoux ».
// Nouvelle carte « Ordre des bijoux », placee juste apres « Animations », avec trois lignes :
//   Ordre d'affichage (Aleatoire / Manuel), Renouvellement (chaque jour a 3 h, tous les N jours...), Dernier melange manuel.
// Son lien « Modifier › » ouvre Contenu du site › Vitrine & ambiance (le groupe « vitrine » est deja gere par SITE_MEDIA_GROUPS).
//
//  - lib/gridOrderOverview.js         (nouveau) : logique pure des trois lignes (valeurs par defaut, valeur illisible)
//  - tests/gridOrderOverview.test.mjs (nouveau) : controles automatiques (node tests/gridOrderOverview.test.mjs)
//  - lib/configOverview.js : import, cle « grid_order » ajoutee a CONFIG_KEYS (meme requete, une cle de plus),
//                            construction des lignes et carte dans la liste renvoyee
//
// Prerequis : les lots R1 et R3 sont fusionnes (le panneau components/AdminGridOrder.js existe et est monte dans AdminSiteMedia.js).
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotR4-ligne-configuration.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotR4-ligne-configuration.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_CONFIG_R4_V1";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;
const abs = (rel) => path.join(ROOT, ...rel.split("/"));

const NEW_FILES = [
  { rel: "lib/gridOrderOverview.js", content: "import { parseGridOrderSetting, GRID_ORDER_MIN_DAYS, GRID_ORDER_MAX_DAYS } from \"./gridOrder.js\";\n\n// ============================================================\n// LIGNES DE L'ONGLET CONFIGURATION POUR « ORDRE DES BIJOUX » — ZENORIA_CONFIG_R4_V1\n//\n// Logique pure (aucun appel réseau, aucun React) : elle transforme la ligne « grid_order » de site_settings en trois lignes\n// de lecture seule pour lib/configOverview.js (Accueil › Configuration). Rien ne s'écrit ici : le réglage se modifie dans\n// Contenu du site › Vitrine & ambiance (components/AdminGridOrder.js).\n//\n// Même principe que le reste de la page : on n'invente jamais de valeur.\n//  - ligne absente : le site applique son réglage par défaut (aléatoire, chaque jour) ; c'est un comportement défini,\n//    donc affiché « (par défaut) » et jamais « Non défini » (comme l'effet saisonnier : « Automatique (par défaut) ») ;\n//  - ligne présente mais illisible (la contrainte SQL de la base l'interdit) : « Valeur illisible », en alerte, et le site\n//    applique alors le réglage par défaut.\n// formatWhen : la fonction de date de configOverview.js (heure de Paris), transmise pour que le format reste le même partout.\n// ============================================================\n\nfunction plural(n) {\n  return n + (n > 1 ? \" jours\" : \" jour\");\n}\n\n// La valeur enregistrée est-elle exactement ce que la base accepte ? (mode connu, jours entiers de 1 à 30, date lisible)\nexport function isGridOrderValueReadable(value) {\n  if (!value || typeof value !== \"object\" || Array.isArray(value)) return false;\n  if (value.mode !== \"random\" && value.mode !== \"manual\") return false;\n  const n = Number(value.everyDays);\n  if (!Number.isInteger(n) || n < GRID_ORDER_MIN_DAYS || n > GRID_ORDER_MAX_DAYS) return false;\n  if (value.shuffledAt !== undefined && value.shuffledAt !== \"\") {\n    if (typeof value.shuffledAt !== \"string\" || !Number.isFinite(Date.parse(value.shuffledAt))) return false;\n  }\n  return true;\n}\n\n// row : la ligne de site_settings ({ value, updated_at, ... }) ou null si rien n'est enregistré\nexport function gridOrderOverviewItems(row, formatWhen) {\n  const fmt = typeof formatWhen === \"function\" ? formatWhen : (v) => String(v);\n  const hasRow = Boolean(row) && typeof row === \"object\";\n\n  if (hasRow && !isGridOrderValueReadable(row.value)) {\n    return [\n      {\n        id: \"grid_mode\",\n        label: \"Ordre d'affichage\",\n        text: \"Valeur illisible\",\n        tone: \"warn\",\n        sub: \"Le site applique le réglage par défaut : aléatoire, chaque jour.\",\n        missing: false,\n      },\n    ];\n  }\n\n  const s = parseGridOrderSetting(hasRow ? row.value : null);\n  const manual = s.mode === \"manual\";\n\n  const mode = {\n    id: \"grid_mode\",\n    label: \"Ordre d'affichage\",\n    text: hasRow ? (manual ? \"Manuel\" : \"Aléatoire\") : \"Aléatoire (par défaut)\",\n    sub: !hasRow ? \"Rien d'enregistré : réglage par défaut\" : manual ? \"Ordre de la base, comme avant\" : \"Le même ordre pour tous les visiteurs\",\n    missing: false,\n  };\n\n  let everyText = \"\";\n  let everySub = \"\";\n  if (manual) {\n    everyText = \"Sans effet en mode manuel\";\n    everySub = \"Fréquence conservée : \" + plural(s.everyDays);\n  } else {\n    everyText = (s.everyDays === 1 ? \"Chaque jour\" : \"Tous les \" + s.everyDays + \" jours\") + \" à 3 h\" + (hasRow ? \"\" : \" (par défaut)\");\n    everySub = \"Heure de Paris\";\n  }\n  const every = { id: \"grid_every\", label: \"Renouvellement\", text: everyText, sub: everySub, missing: false };\n\n  const when = s.shuffledAt ? String(fmt(s.shuffledAt) || \"\") : \"\";\n  const shuffle = {\n    id: \"grid_shuffle\",\n    label: \"Dernier mélange manuel\",\n    text: when || \"Jamais\",\n    missing: false,\n  };\n\n  return [mode, every, shuffle];\n}\n" },
  { rel: "tests/gridOrderOverview.test.mjs", content: "// Tests de lib/gridOrderOverview.js (lot R4) — se lancent avec : node tests/gridOrderOverview.test.mjs\nimport { gridOrderOverviewItems, isGridOrderValueReadable } from \"../lib/gridOrderOverview.js\";\n\nlet ok = true;\nconst check = (c, m) => {\n  ok = ok && c;\n  console.log((c ? \"OK  \" : \"KO  \") + m);\n};\n// Même format que formatWhen de lib/configOverview.js (heure de Paris)\nconst formatWhen = (value) => {\n  if (!value) return \"\";\n  const d = new Date(value);\n  if (Number.isNaN(d.getTime())) return \"\";\n  return d.toLocaleString(\"fr-FR\", { dateStyle: \"short\", timeStyle: \"short\", timeZone: \"Europe/Paris\" });\n};\nconst by = (items, id) => items.find((i) => i.id === id);\nconst row = (value) => ({ key: \"grid_order\", value, updated_at: \"2026-11-06T14:00:00.000Z\", updated_by_email: \"admin@exemple.fr\" });\n\n// 1. Aucune ligne : comportement par défaut, jamais « Non défini »\nconst none = gridOrderOverviewItems(null, formatWhen);\ncheck(none.length === 3 && none.map((i) => i.id).join() === \"grid_mode,grid_every,grid_shuffle\", \"rien d'enregistré : 3 lignes (grid_mode, grid_every, grid_shuffle)\");\ncheck(by(none, \"grid_mode\").text === \"Aléatoire (par défaut)\" && by(none, \"grid_mode\").sub === \"Rien d'enregistré : réglage par défaut\", \"rien d'enregistré : « Aléatoire (par défaut) » — \" + by(none, \"grid_mode\").text);\ncheck(by(none, \"grid_every\").text === \"Chaque jour à 3 h (par défaut)\" && by(none, \"grid_every\").sub === \"Heure de Paris\", \"rien d'enregistré : « Chaque jour à 3 h (par défaut) » — \" + by(none, \"grid_every\").text);\ncheck(by(none, \"grid_shuffle\").text === \"Jamais\", \"rien d'enregistré : dernier mélange « Jamais »\");\ncheck(none.every((i) => i.missing === false && !JSON.stringify(i).includes(\"Non défini\") && i.tone === undefined), \"rien d'enregistré : aucune ligne « manquante », aucune alerte\");\ncheck(JSON.stringify(gridOrderOverviewItems(undefined, formatWhen)) === JSON.stringify(none) && JSON.stringify(gridOrderOverviewItems(false, formatWhen)) === JSON.stringify(none), \"undefined et false : comme null\");\n\n// 2. Aléatoire enregistré\nconst r1 = gridOrderOverviewItems(row({ mode: \"random\", everyDays: 1, shuffledAt: \"\" }), formatWhen);\ncheck(by(r1, \"grid_mode\").text === \"Aléatoire\" && by(r1, \"grid_mode\").sub === \"Le même ordre pour tous les visiteurs\", \"aléatoire enregistré : « Aléatoire » (sans « par défaut »)\");\ncheck(by(r1, \"grid_every\").text === \"Chaque jour à 3 h\", \"N = 1 : « Chaque jour à 3 h »\");\nconst r7 = gridOrderOverviewItems(row({ mode: \"random\", everyDays: 7, shuffledAt: \"\" }), formatWhen);\ncheck(by(r7, \"grid_every\").text === \"Tous les 7 jours à 3 h\" && by(r7, \"grid_every\").sub === \"Heure de Paris\", \"N = 7 : « Tous les 7 jours à 3 h »\");\ncheck(by(gridOrderOverviewItems(row({ mode: \"random\", everyDays: 30, shuffledAt: \"\" }), formatWhen), \"grid_every\").text === \"Tous les 30 jours à 3 h\", \"N = 30 : « Tous les 30 jours à 3 h »\");\ncheck(by(gridOrderOverviewItems(row({ mode: \"random\", everyDays: 2, shuffledAt: \"\" }), formatWhen), \"grid_every\").text === \"Tous les 2 jours à 3 h\", \"N = 2 : « Tous les 2 jours à 3 h »\");\n\n// 3. Manuel\nconst m = gridOrderOverviewItems(row({ mode: \"manual\", everyDays: 7, shuffledAt: \"\" }), formatWhen);\ncheck(by(m, \"grid_mode\").text === \"Manuel\" && by(m, \"grid_mode\").sub === \"Ordre de la base, comme avant\", \"manuel : « Manuel », « Ordre de la base, comme avant »\");\ncheck(by(m, \"grid_every\").text === \"Sans effet en mode manuel\" && by(m, \"grid_every\").sub === \"Fréquence conservée : 7 jours\", \"manuel : « Sans effet en mode manuel », « Fréquence conservée : 7 jours »\");\ncheck(by(gridOrderOverviewItems(row({ mode: \"manual\", everyDays: 1, shuffledAt: \"\" }), formatWhen), \"grid_every\").sub === \"Fréquence conservée : 1 jour\", \"manuel, N = 1 : « 1 jour » au singulier\");\n\n// 4. Dernier mélange : heure de Paris, pas celle du navigateur\nconst sh = gridOrderOverviewItems(row({ mode: \"random\", everyDays: 1, shuffledAt: \"2026-11-09T15:00:32.123Z\" }), formatWhen);\ncheck(by(sh, \"grid_shuffle\").text === \"09/11/2026 16:00\", \"dernier mélange 15:00 UTC = 16:00 à Paris : « 09/11/2026 16:00 » — \" + by(sh, \"grid_shuffle\").text);\nconst shSummer = gridOrderOverviewItems(row({ mode: \"random\", everyDays: 1, shuffledAt: \"2026-07-01T10:00:00Z\" }), formatWhen);\ncheck(by(shSummer, \"grid_shuffle\").text === \"01/07/2026 12:00\", \"en été : 10:00 UTC = 12:00 à Paris\");\ncheck(by(gridOrderOverviewItems(row({ mode: \"random\", everyDays: 1, shuffledAt: \"2026-11-09T15:00:32Z\" }), (v) => \"[\" + v + \"]\"), \"grid_shuffle\").text === \"[2026-11-09T15:00:32.000Z]\", \"la fonction de date transmise est bien celle utilisée (valeur normalisée en ISO)\");\ncheck(by(gridOrderOverviewItems(row({ mode: \"random\", everyDays: 1, shuffledAt: \"2026-11-09T15:00:32Z\" }), () => \"\"), \"grid_shuffle\").text === \"Jamais\", \"date que la fonction ne sait pas formater : « Jamais » plutôt qu'une ligne vide\");\ncheck(by(gridOrderOverviewItems(row({ mode: \"random\", everyDays: 1, shuffledAt: \"2026-11-09T15:00:32Z\" })), \"grid_shuffle\").text.length > 0, \"sans fonction de date : valeur affichée tout de même\");\n\n// 5. Valeur illisible : une seule ligne, en alerte (la contrainte SQL l'interdit, mais la page ne doit jamais planter)\nconst bad = [\n  null, \"texte\", 5, [], [1, 2], {}, { mode: \"n_importe_quoi\", everyDays: 7, shuffledAt: \"\" }, { mode: \"random\", everyDays: 0, shuffledAt: \"\" }, { mode: \"random\", everyDays: 31, shuffledAt: \"\" },\n  { mode: \"random\", everyDays: 2.5, shuffledAt: \"\" }, { mode: \"random\", everyDays: \"x\", shuffledAt: \"\" }, { mode: \"random\", shuffledAt: \"\" }, { mode: \"random\", everyDays: 7, shuffledAt: 5 },\n  { mode: \"random\", everyDays: 7, shuffledAt: \"pas une date\" }, { everyDays: 7 }, { mode: \"manual\" },\n];\ncheck(bad.every((v) => { const it = gridOrderOverviewItems(row(v), formatWhen); return it.length === 1 && it[0].id === \"grid_mode\" && it[0].text === \"Valeur illisible\" && it[0].tone === \"warn\" && it[0].missing === false && it[0].sub.includes(\"réglage par défaut\"); }), \"valeur illisible (\" + bad.length + \" cas : texte, nombre, tableau, mode inconnu, jours hors bornes ou décimaux, date illisible…) : une ligne « Valeur illisible » en alerte\");\ncheck(gridOrderOverviewItems({ key: \"grid_order\" }, formatWhen)[0].text === \"Valeur illisible\", \"ligne sans champ value : « Valeur illisible »\");\n\n// 6. Valeurs acceptées par la base = valeurs lisibles ici (même règle que la contrainte site_settings_grid_order_valid)\nconst good = [{ mode: \"random\", everyDays: 1, shuffledAt: \"\" }, { mode: \"manual\", everyDays: 30, shuffledAt: \"2026-11-06T14:32:10.123Z\" }, { mode: \"random\", everyDays: 7 }, { mode: \"random\", everyDays: 1.0, shuffledAt: \"\" }];\ncheck(good.every((v) => isGridOrderValueReadable(v) && gridOrderOverviewItems(row(v), formatWhen).length === 3), \"les 4 valeurs que la base accepte (test SQL) sont lisibles : 3 lignes chacune\");\ncheck([\"random\", \"manual\"].every((md) => [1, 2, 7, 15, 30].every((n) => isGridOrderValueReadable({ mode: md, everyDays: n, shuffledAt: \"\" }))), \"tous les modes et fréquences valides sont lisibles\");\n\n// 7. Forme des lignes : celle que lib/configOverview.js et son affichage attendent\nconst all = [none, r1, r7, m, sh].flat();\ncheck(all.every((i) => typeof i.id === \"string\" && typeof i.label === \"string\" && typeof i.text === \"string\" && i.text.length > 0 && typeof i.missing === \"boolean\" && (i.sub === undefined || typeof i.sub === \"string\") && (i.tone === undefined || [\"ok\", \"warn\", \"crit\"].includes(i.tone)) && i.flag === undefined), \"forme des lignes : { id, label, text, sub?, tone?, missing } comme les autres réglages (jamais de flag)\");\ncheck(new Set(all.map((i) => i.id)).size === 3, \"identifiants stables : grid_mode, grid_every, grid_shuffle\");\ncheck(all.every((i) => !/undefined|NaN|null|\\[object/.test(i.label + \" \" + i.text + \" \" + (i.sub || \"\"))), \"aucun « undefined », « NaN », « null » ni « [object » dans les textes affichés\");\n\n// 8. Pas d'effet de bord\nconst frozenRow = Object.freeze(row(Object.freeze({ mode: \"random\", everyDays: 7, shuffledAt: \"\" })));\nlet threw = false;\ntry { gridOrderOverviewItems(frozenRow, formatWhen); } catch (e) { threw = true; }\ncheck(!threw, \"ligne figée (Object.freeze) : aucune modification de l'entrée\");\n\nconsole.log(ok ? \"\\nTOUS LES CONTROLES OK\" : \"\\nECHEC\");\nprocess.exit(ok ? 0 : 1);\n" },
];

function read(rel) {
  if (!fs.existsSync(abs(rel))) stop(rel + " introuvable (lance le script depuis la racine du projet).");
  const raw = fs.readFileSync(abs(rel), "utf8");
  const crlf = (raw.match(/\r\n/g) || []).length;
  const lf = (raw.match(/\n/g) || []).length - crlf;
  if (crlf > 0 && lf > 0) stop(rel + " melange des fins de ligne CRLF et LF : je ne touche pas a un fichier dans cet etat.");
  return { rel, eol: crlf > 0 ? "\r\n" : "\n", text: raw.replace(/\r\n/g, "\n") };
}

// ---------- Prerequis : R1 et R3 ----------
const grid = read("lib/gridOrder.js");
for (const sym of ["parseGridOrderSetting", "GRID_ORDER_MIN_DAYS", "GRID_ORDER_MAX_DAYS", "DEFAULT_GRID_ORDER"]) {
  if (!new RegExp("export (function|const) " + sym + "\\b").test(grid.text)) stop("lib/gridOrder.js : « " + sym + " » n'est pas exporte : le lot R1 est-il fusionne ?");
}
if (!fs.existsSync(abs("components/AdminGridOrder.js"))) stop("components/AdminGridOrder.js est introuvable : le lot R3 doit etre fusionne avant R4 (le lien « Modifier › » mene a ce panneau).");
const media = read("components/AdminSiteMedia.js");
if (!media.text.includes("<AdminGridOrder />")) stop("components/AdminSiteMedia.js ne monte pas <AdminGridOrder /> : le lot R3 est-il fusionne ?");
if (!/export const SITE_MEDIA_GROUPS = \[[^\]]*"vitrine"[^\]]*\];/.test(read("lib/configOverview.js").text)) stop("lib/configOverview.js : SITE_MEDIA_GROUPS ne contient plus « vitrine » : le lien « Modifier › » ne pourrait pas ouvrir le groupe.");
for (const f of NEW_FILES) if (fs.existsSync(abs(f.rel))) stop(f.rel + " existe deja : lot deja applique ?");
if (!fs.existsSync(abs("tests"))) stop("le dossier tests/ est introuvable.");

// ---------- Garde-fou : l'affichage de la page ne doit pas dependre d'une liste fixe de cartes ----------
// Je n'ai pas lu le composant qui affiche ces cartes. S'il associait chaque carte a son identifiant (icone, couleur...), la carte ajoutee
// n'aurait pas d'entree. L'identifiant « animations » n'est ecrit nulle part ailleurs : si on le retrouve hors de configOverview.js,
// le script s'arrete et indique ou.
const canary = [];
for (const dir of ["components", "pages", "lib"]) {
  if (!fs.existsSync(abs(dir))) continue;
  for (const name of fs.readdirSync(abs(dir))) {
    const rel = dir + "/" + name;
    if (!/\.(js|jsx|mjs)$/.test(name) || rel === "lib/configOverview.js") continue;
    const lines = fs.readFileSync(abs(rel), "utf8").split(/\r?\n/);
    lines.forEach((l, i) => {
      if (/["'`]animations["'`]/.test(l)) canary.push(rel + ":" + (i + 1) + ": " + l.trim().slice(0, 120));
    });
  }
}
if (canary.length) {
  stop("l'identifiant de carte « animations » est utilise hors de lib/configOverview.js. L'affichage depend peut-etre d'une liste de cartes a completer :\n   " + canary.join("\n   ") + "\nEnvoyez-moi ces lignes (et le composant concerne) avant d'appliquer R4.");
}

// ---------- lib/configOverview.js ----------
const ov = read("lib/configOverview.js");
if (ov.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans lib/configOverview.js : lot deja applique.");

const EDITS = [
  {
    label: "import de gridOrderOverview (apres l'import de paymentSettings)",
    from: 'import { isTransferReady } from "@/lib/paymentSettings"; // ZENORIA_CONFIG_C3B_V1\n',
    to: 'import { isTransferReady } from "@/lib/paymentSettings"; // ZENORIA_CONFIG_C3B_V1\nimport { gridOrderOverviewItems } from "@/lib/gridOrderOverview"; // ' + MARK + "\n",
  },
  {
    label: "liste des reglages lus (CONFIG_KEYS)",
    from: 'export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact"];\n',
    to: 'export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact", "grid_order"]; // ' + MARK + " : ordre des bijoux\n",
  },
  {
    label: "lignes de l'ordre des bijoux (avant « Avis »)",
    from: "  // ---- Avis ----\n  const reviews = [\n",
    to:
      "  // ---- Ordre des bijoux ---- " + MARK + "\n" +
      "  // Reglage absent : le site applique son reglage par defaut (aleatoire, chaque jour), affiche « (par defaut) » et non « Non defini ».\n" +
      "  const gridOrderItems = gridOrderOverviewItems(rows.grid_order || null, formatWhen);\n" +
      "\n" +
      "  // ---- Avis ----\n  const reviews = [\n",
  },
  {
    label: "carte « Ordre des bijoux » (apres « Animations »)",
    from: '    { id: "animations", title: "Animations", keys: "season_fx · ring_animation", link: { group: "produits", tab: "site", anchor: "vitrine", where: "Contenu du site › Vitrine & ambiance" }, items: animations },\n',
    to:
      '    { id: "animations", title: "Animations", keys: "season_fx · ring_animation", link: { group: "produits", tab: "site", anchor: "vitrine", where: "Contenu du site › Vitrine & ambiance" }, items: animations },\n' +
      '    { id: "grid_order", title: "Ordre des bijoux", keys: "grid_order", link: { group: "produits", tab: "site", anchor: "vitrine", where: "Contenu du site › Vitrine & ambiance" }, items: gridOrderItems },\n',
  },
];
let ovNext = ov.text;
for (const e of EDITS) {
  const n = count(ovNext, e.from);
  if (n !== 1) stop("lib/configOverview.js : ancre « " + e.label + " » trouvee " + n + " fois (attendu : 1). Le fichier a change depuis l'audit.");
  ovNext = ovNext.replace(e.from, () => e.to);
}
// Controles : ordre des insertions, une seule carte, un seul « rows.grid_order »
const iKeys = ovNext.indexOf("\"grid_order\"]; // " + MARK);
const iItems = ovNext.indexOf("const gridOrderItems = ");
const iCard = ovNext.indexOf('{ id: "grid_order", title');
const iBuild = ovNext.indexOf("export function buildConfigOverview");
if (!(iKeys > 0 && iKeys < iBuild && iBuild < iItems && iItems < iCard)) stop("lib/configOverview.js : l'ordre des insertions est inattendu.");
if (count(ovNext, 'id: "grid_order"') !== 1) stop("controle final : la carte « grid_order » devrait apparaitre une seule fois.");
if (count(ovNext, MARK) !== 3) stop("controle final : le marqueur devrait apparaitre 3 fois, il apparait " + count(ovNext, MARK) + " fois.");
// La carte est bien juste apres « Animations » et avant « Avis clientes »
const iAnim = ovNext.indexOf('{ id: "animations", title');
const iRev = ovNext.indexOf('{ id: "reviews", title');
if (!(iAnim < iCard && iCard < iRev)) stop("controle final : la carte n'est pas placee entre « Animations » et « Avis clientes ».");

// ---------- Rapport et ecriture ----------
console.log("Lot R4 - ligne « Ordre des bijoux » dans l'onglet Configuration");
for (const f of NEW_FILES) console.log(" - " + f.rel + " : nouveau fichier (" + f.content.split("\n").length + " lignes)");
console.log(" - lib/configOverview.js : " + ov.text.split("\n").length + " -> " + ovNext.split("\n").length + " lignes (import, CONFIG_KEYS +1 cle, lignes, carte apres « Animations »)");
console.log(" - garde-fou : aucun usage de l'identifiant « animations » hors de lib/configOverview.js");

if (DRY) {
  console.log("\nDRY-RUN OK : toutes les ancres sont uniques et conformes. Rien n'a ete ecrit.");
  process.exit(0);
}
for (const f of NEW_FILES) fs.writeFileSync(abs(f.rel), f.content, "utf8");
fs.writeFileSync(abs(ov.rel), ov.eol === "\r\n" ? ovNext.replace(/\n/g, "\r\n") : ovNext, "utf8");
console.log("\nOK : fichiers ecrits. Lance maintenant : node tests/gridOrderOverview.test.mjs   puis   npm run build");
