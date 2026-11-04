// patch-lotC1b-liens-configuration.mjs
// Lot C1-bis : les liens « Modifier › » de l'onglet Configuration ouvrent directement le BON RÉGLAGE. Sans SQL.
//
// Constat : Livraison, Animations, Avis, Contact et Contenus pointaient vers « Contenu du site », dont les réglages sont
// rangés dans quatre sections d'accordéon (une seule ouverte au chargement). Le lien arrivait sur la bonne page mais pas
// sur le réglage visé.
//
//   Livraison  -> Contenu du site › « Vente & livraison »
//   Animations -> Contenu du site › « Vitrine & ambiance »
//   Avis       -> Contenu du site › « Textes & légal »   (AdminLegalPages porte les avis)
//   Contenus   -> Contenu du site › « Textes & légal »
//   Contact    -> Contenu du site › « Contact »
//
// Au clic : la section visée s'ouvre et la page défile jusqu'à elle. L'accordéon se comporte comme avant dans tous les autres cas
// (ouverture par le menu : « Vitrine & ambiance » ouverte). La destination est aussi affichée sous le titre de chaque carte.
//
//   - lib/configOverview.js          : ancre de chaque lien, destination affichée, passage de la cible (lu une seule fois)
//   - components/AdminConfig.js      : le clic enregistre la cible ; la destination s'affiche sous le titre
//   - components/AdminSiteMedia.js   : ouvre la section visée, défile jusqu'à elle (4 repères <div data-config-anchor> autour des accordéons)
//
// Prérequis : lot C1 (ZENORIA_CONFIG_C1_V1). Le lien Maintenance n'est pas modifié.
//
// Usage :  node scripts/patch-lotC1b-liens-configuration.mjs --dry-run
//          node scripts/patch-lotC1b-liens-configuration.mjs --apply
// Marqueur : ZENORIA_CONFIG_C1B_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_CONFIG_C1B_V1";
const BASE = "ZENORIA_CONFIG_C1_V1";
const ROOT = process.cwd();
const F_LIB = path.join(ROOT, "lib", "configOverview.js");
const F_CFG = path.join(ROOT, "components", "AdminConfig.js");
const F_MEDIA = path.join(ROOT, "components", "AdminSiteMedia.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lotC1b-liens-configuration.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

for (const f of [F_LIB, F_CFG, F_MEDIA]) {
  if (!fs.existsSync(f)) fail(path.relative(ROOT, f) + " introuvable (lancez le script depuis la racine du projet, avec le lot C1 applique).");
}

function readSrc(file) {
  const raw = fs.readFileSync(file, "utf8");
  const bom = raw.charCodeAt(0) === 0xfeff;
  return { bom, crlf: raw.includes("\r\n"), src: (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n") };
}
function occurrences(str, sub) {
  let n = 0;
  let i = str.indexOf(sub);
  while (i >= 0) {
    n += 1;
    i = str.indexOf(sub, i + sub.length);
  }
  return n;
}
function serialize(doc) {
  return (doc.bom ? "\uFEFF" : "") + (doc.crlf ? doc.src.replace(/\n/g, "\r\n") : doc.src);
}
// Affiche, avec les espaces rendus visibles, les lignes reelles autour d'un repere (aide au diagnostic)
function showContext(doc, hints) {
  const lines = doc.src.split("\n");
  for (const hint of hints || []) {
    const at = lines.findIndex((l) => l.includes(hint));
    if (at < 0) {
      console.error("  Repere « " + hint + " » : introuvable.");
      continue;
    }
    console.error("  Repere « " + hint + " » trouve ligne " + (at + 1) + " :");
    for (let i = Math.max(0, at - 1); i <= Math.min(lines.length - 1, at + 1); i += 1) {
      console.error("    " + (i + 1) + " | " + JSON.stringify(lines[i]));
    }
  }
}
function replaceOnce(doc, needle, replacement, label, hints) {
  const n = occurrences(doc.src, needle);
  if (n !== 1) {
    if (n === 0) showContext(doc, hints || [needle.split("\n")[0].trim()]);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  doc.src = doc.src.replace(needle, () => replacement);
}
function replaceRegexOnce(doc, re, replacement, label, hints) {
  const n = (doc.src.match(new RegExp(re.source, "g")) || []).length;
  if (n !== 1) {
    if (n === 0) showContext(doc, hints);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  doc.src = doc.src.replace(re, (...m) => (typeof replacement === "function" ? replacement(...m) : replacement));
}
function afterLineRegex(doc, re, addition, label, hints) {
  const m = doc.src.match(re);
  const n = (doc.src.match(new RegExp(re.source, "gm")) || []).length;
  if (!m || n !== 1) {
    if (n === 0) showContext(doc, hints);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  const idx = doc.src.search(re);
  const eol = doc.src.indexOf("\n", idx);
  const end = eol < 0 ? doc.src.length : eol;
  doc.src = doc.src.slice(0, end) + "\n" + addition + doc.src.slice(end);
}

const lib = readSrc(F_LIB);
const cfg = readSrc(F_CFG);
const media = readSrc(F_MEDIA);
const docs = [lib, cfg, media];
const names = ["lib/configOverview.js", "components/AdminConfig.js", "components/AdminSiteMedia.js"];

if (docs.every((d) => d.src.includes(MARK))) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}
if (docs.some((d) => d.src.includes(MARK))) fail("Etat incoherent : le marqueur n'est present que dans une partie des fichiers. Restaurez-les (git checkout) puis relancez.");
if (!lib.src.includes(BASE) || !cfg.src.includes(BASE)) fail("Le lot C1 doit etre applique avant (" + BASE + " absent de configOverview.js ou AdminConfig.js).");
docs.forEach((d, i) => console.log(names[i] + " (fins de ligne " + (d.crlf ? "Windows CRLF" : "LF") + ")"));
const before = docs.map((d) => d.src.split("\n").length);

// ------------------------------------------------------------------
// 1. lib/configOverview.js : ancres, destination affichee, passage de la cible
// ------------------------------------------------------------------
const TARGETS = [
  ["shipping", "vente-livraison", "Contenu du site › Vente & livraison"],
  ["animations", "vitrine", "Contenu du site › Vitrine & ambiance"],
  ["reviews", "textes-legal", "Contenu du site › Textes & légal"],
  ["contact", "contact", "Contenu du site › Contact"],
  ["contents", "textes-legal", "Contenu du site › Textes & légal"],
];
for (const [items, anchor, where] of TARGETS) {
  replaceOnce(
    lib,
    'link: { group: "produits", tab: "site" }, items: ' + items + " },",
    'link: { group: "produits", tab: "site", anchor: "' + anchor + '", where: "' + where + '" }, items: ' + items + " },",
    "Lien de la carte « " + items + " » (configOverview.js)",
    ["items: " + items]
  );
}
replaceOnce(
  lib,
  'const RING_MODES = { once: "Une fois" };',
  [
    "// " + MARK + " : cible d'un lien « Modifier › » vers « Contenu du site » (section d'accordéon à ouvrir et à rejoindre).",
    "// Lue une seule fois à l'ouverture de AdminSiteMedia, comme le filtre transmis de l'Accueil vers Commandes.",
    'export const SITE_MEDIA_GROUPS = ["vitrine", "textes-legal", "vente-livraison", "contact"];',
    "let siteMediaTarget = null;",
    "export function setSiteMediaTarget(id) {",
    "  siteMediaTarget = SITE_MEDIA_GROUPS.includes(id) ? id : null;",
    "}",
    "export function peekSiteMediaTarget() {",
    "  return siteMediaTarget;",
    "}",
    "export function clearSiteMediaTarget() {",
    "  siteMediaTarget = null;",
    "}",
    "",
    'const RING_MODES = { once: "Une fois" };',
  ].join("\n"),
  "Constante RING_MODES (configOverview.js)"
);

// ------------------------------------------------------------------
// 2. components/AdminConfig.js : le clic enregistre la cible ; la destination est affichee
// ------------------------------------------------------------------
replaceOnce(
  cfg,
  'import { useSiteConfig, buildConfigOverview } from "@/lib/configOverview";',
  'import { useSiteConfig, buildConfigOverview, setSiteMediaTarget } from "@/lib/configOverview"; // ' + MARK,
  "Import configOverview (AdminConfig.js)"
);
replaceOnce(
  cfg,
  "onClick={() => onGo(s.link.group, s.link.tab)}",
  "onClick={() => {\n                    setSiteMediaTarget(s.link.anchor || null); // " + MARK + " : ouvre la bonne section de « Contenu du site »\n                    onGo(s.link.group, s.link.tab);\n                  }}",
  "Clic sur « Modifier › » (AdminConfig.js)"
);
replaceOnce(
  cfg,
  'data-testid={"config-link-" + s.id}',
  'data-testid={"config-link-" + s.id}\n                  title={s.link.where ? "Ouvre " + s.link.where : undefined}',
  "Attribut data-testid du lien (AdminConfig.js)"
);
replaceOnce(
  cfg,
  '<div className="text-[11px] text-[#8b737e] mb-1.5">{s.keys}</div>',
  '<div className="text-[11px] text-[#8b737e] mb-1.5">\n                {s.keys}\n                {s.link.where ? " · " + s.link.where : ""}\n              </div>',
  "Ligne des cles sous le titre (AdminConfig.js)"
);

// ------------------------------------------------------------------
// 3. components/AdminSiteMedia.js : ouvre la section visee et defile jusqu'a elle
// ------------------------------------------------------------------
replaceRegexOnce(
  media,
  /import React, \{ useCallback, useEffect, useState \} from "react";/,
  'import React, { useCallback, useEffect, useRef, useState } from "react"; // ' + MARK + " : useRef",
  "Import React (AdminSiteMedia.js)",
  ['from "react"']
);
afterLineRegex(
  media,
  /^import AdminAccordionSection from "@\/components\/AdminAccordionSection";[ \t]*$/m,
  "// " + MARK + " : section visée par un lien de l'onglet Accueil › Configuration\n" +
    'import { peekSiteMediaTarget, clearSiteMediaTarget } from "@/lib/configOverview";',
  "Import AdminAccordionSection (AdminSiteMedia.js)",
  ["import AdminAccordionSection"]
);
replaceRegexOnce(
  media,
  /const \[openGroup, setOpenGroup\] = useState\("vitrine"\);/,
  "const targetRef = useRef(peekSiteMediaTarget()); // " + MARK + " : section à ouvrir (lien de Configuration), sinon « Vitrine & ambiance »\n" +
    '  const [openGroup, setOpenGroup] = useState(targetRef.current || "vitrine");',
  "Etat openGroup (AdminSiteMedia.js)",
  ["openGroup"]
);
afterLineRegex(
  media,
  /^[ \t]*const toggleGroup = \(id\) => setOpenGroup\(\(prev\) => \(prev === id \? null : id\)\);[ \t]*$/m,
  [
    "  // " + MARK + " : la cible n'est utilisée qu'à l'ouverture ; la page défile ensuite jusqu'à la section visée",
    "  useEffect(() => {",
    "    const target = targetRef.current;",
    "    clearSiteMediaTarget();",
    "    if (!target) return undefined;",
    "    const timer = setTimeout(() => {",
    '      const el = document.querySelector(\'[data-config-anchor="\' + target + \'"]\');',
    '      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });',
    "    }, 250);",
    "    return () => clearTimeout(timer);",
    "  }, []);",
  ].join("\n"),
  "Fonction toggleGroup (AdminSiteMedia.js)",
  ["toggleGroup"]
);
for (const id of ["vitrine", "textes-legal", "vente-livraison", "contact"]) {
  const re = new RegExp('([ \\t]*)<AdminAccordionSection\\s+id="' + id + '"[\\s\\S]*?</AdminAccordionSection>');
  replaceRegexOnce(
    media,
    re,
    (block, indent) => indent + '<div data-config-anchor="' + id + '" style={{ scrollMarginTop: 84 }}>\n' + block + "\n" + indent + "</div>",
    "Section d'accordeon « " + id + " » (AdminSiteMedia.js)",
    ['id="' + id + '"', "AdminAccordionSection"]
  );
}

// ------------------------------------------------------------------
// Controles finaux
// ------------------------------------------------------------------
if (occurrences(lib.src, "anchor:") !== 5) fail("configOverview.js : 5 ancres attendues, trouve " + occurrences(lib.src, "anchor:") + ".");
if (occurrences(lib.src, "export function setSiteMediaTarget") !== 1) fail("configOverview.js : setSiteMediaTarget doit etre defini une seule fois.");
if (occurrences(cfg.src, "setSiteMediaTarget(") !== 1) fail("AdminConfig.js : setSiteMediaTarget doit etre appele une seule fois.");
if (occurrences(media.src, "data-config-anchor=") < 5) fail("AdminSiteMedia.js : 4 reperes data-config-anchor attendus (+ la requete de defilement).");
if (occurrences(media.src, "<AdminAccordionSection") !== 4 || occurrences(media.src, "</AdminAccordionSection>") !== 4) fail("AdminSiteMedia.js : 4 accordeons attendus, trouve " + occurrences(media.src, "<AdminAccordionSection") + ".");
{
  const o = occurrences(media.src, "<div");
  const c = occurrences(media.src, "</div>");
  if (o !== c) fail("AdminSiteMedia.js : <div> / </div> desequilibres (" + o + " / " + c + ").");
}

console.log("");
console.log("  1. configOverview.js : ancres des 5 liens + passage de la cible        OK");
console.log("  2. AdminConfig.js : le clic enregistre la cible, destination affichee  OK");
console.log("  3. AdminSiteMedia.js : section ouverte + defilement, 4 reperes          OK");
docs.forEach((d, i) => console.log("  Lignes " + names[i] + " : " + before[i] + " -> " + d.src.split("\n").length));

if (apply) {
  fs.writeFileSync(F_LIB, serialize(lib), "utf8");
  fs.writeFileSync(F_CFG, serialize(cfg), "utf8");
  fs.writeFileSync(F_MEDIA, serialize(media), "utf8");
  console.log("\nEcrit : lib/configOverview.js, components/AdminConfig.js, components/AdminSiteMedia.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
