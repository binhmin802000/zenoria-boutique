// patch-lot5h-ergonomie.mjs
// Lot 5h : ergonomie de l'administration. Sans SQL.
//
//   1. CRM > Commandes : la date de fin reste sur la même ligne que la date de début (bloc insécable) ;
//      la recherche passe sur une 2e ligne, alignée à gauche.
//   2. CRM > Commandes : quand un filtre est choisi (bloc du « Parcours des commandes », ou tuile de l'Accueil),
//      la page se cale sur le parcours : les blocs et le début de la liste sont visibles sans faire défiler.
//   3. Menu vertical : replié en colonne d'icônes par défaut. Il se déplie quand le curseur va vers le bord gauche
//      (ou sur la colonne d'icônes), par-dessus la page (le contenu ne bouge pas), et se replie :
//        - au clic sur un sous-onglet (ou sur un groupe sans sous-onglet : Accueil),
//        - au clic ou à la saisie n'importe où dans la page,
//        - avec la touche Échap,
//        - quand le curseur quitte le menu (après 0,3 s).
//      Les pastilles (compteurs, points d'alerte) restent visibles sur les icônes repliées.
//      Le bouton rond en haut du menu garde le menu ouvert en permanence (comportement d'avant) ou rétablit le repli automatique.
//
// Prérequis : lots 5d (ZENORIA_HOME_5D_V1 dans pages/admin.js) et 5e (ZENORIA_FLAGGED_5E_V1 dans AdminCrm.js).
//
// Usage :  node scripts/patch-lot5h-ergonomie.mjs --dry-run
//          node scripts/patch-lot5h-ergonomie.mjs --apply
// Marqueur : ZENORIA_NAV_5H_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_NAV_5H_V1";
const ROOT = process.cwd();
const F_ADMIN = path.join(ROOT, "pages", "admin.js");
const F_CRM = path.join(ROOT, "components", "AdminCrm.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lot5h-ergonomie.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

for (const f of [F_ADMIN, F_CRM]) {
  if (!fs.existsSync(f)) fail(path.relative(ROOT, f) + " introuvable (lancez le script depuis la racine du projet).");
}

// Les blocs ci-dessous utilisent deux repères pour éviter les conflits avec les caractères spéciaux du code :
//   § = accent grave (backtick)     ¤{ = ${
const code = (s) => s.replaceAll("§", "`").replaceAll("¤{", "${");

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
function replaceOnce(doc, needle, replacement, label) {
  const n = occurrences(doc.src, needle);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  doc.src = doc.src.replace(needle, () => replacement);
}
function replaceRegexOnce(doc, re, make, label) {
  const g = new RegExp(re.source, "g");
  const n = (doc.src.match(g) || []).length;
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  doc.src = doc.src.replace(re, (...m) => make(...m));
}
function afterLine(doc, needle, addition, label) {
  const n = occurrences(doc.src, needle);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  const idx = doc.src.indexOf(needle);
  const eol = doc.src.indexOf("\n", idx);
  const end = eol < 0 ? doc.src.length : eol;
  doc.src = doc.src.slice(0, end) + "\n" + addition + doc.src.slice(end);
}

const admin = readSrc(F_ADMIN);
const crm = readSrc(F_CRM);

if (admin.src.includes(MARK) && crm.src.includes(MARK)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}
if (admin.src.includes(MARK) || crm.src.includes(MARK)) fail("Etat incoherent : le marqueur n'est present que dans un des deux fichiers. Restaurez-les (git checkout) puis relancez.");
if (!admin.src.includes("ZENORIA_HOME_5D_V1")) fail("pages/admin.js ne contient pas ZENORIA_HOME_5D_V1 : appliquez d'abord le lot 5d (patch-lot5d-accueil.mjs).");
if (!crm.src.includes("ZENORIA_FLAGGED_5E_V1")) fail("components/AdminCrm.js ne contient pas ZENORIA_FLAGGED_5E_V1 : le lot 5e doit etre applique avant.");
console.log("pages/admin.js (fins de ligne " + (admin.crlf ? "Windows CRLF" : "LF") + ")");
console.log("components/AdminCrm.js (fins de ligne " + (crm.crlf ? "Windows CRLF" : "LF") + ")");
const before = { admin: admin.src.split("\n").length, crm: crm.src.split("\n").length };

// ==================================================================
// components/AdminCrm.js
// ==================================================================

// a. useRef
replaceOnce(
  crm,
  'import React, { useCallback, useEffect, useMemo, useState } from "react";',
  'import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"; // ' + MARK + " : useRef",
  "Import React (AdminCrm.js)"
);

// b. ligne 2 : période en haut, recherche dessous (à gauche)
replaceRegexOnce(
  crm,
  /<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">(\s*<div className="flex flex-wrap items-center gap-2">\s*\{\[\s*\["today")/,
  (m, rest) =>
    "{/* " + MARK + " : période sur une ligne (la date de fin reste avec la date de début), recherche en dessous, à gauche */}\n" +
    '        <div className="flex flex-col items-start gap-3 mb-3">' + rest,
  "Barre période et recherche"
);

// c. la date de fin ne se sépare jamais de la date de début
replaceRegexOnce(
  crm,
  /<input\s+type="date"\s+value=\{dateFrom\}[\s\S]*?aria-label="Date de fin"\s+className="[^"]*"\s*\/>/,
  (m) => '<span className="inline-flex items-center gap-2 whitespace-nowrap" data-testid="orders-date-range">' + m + "</span>",
  "Champs date de début / date de fin"
);

// d. défilement vers le parcours quand un filtre est choisi
afterLine(
  crm,
  "const flaggedAccounts = useFlaggedAccounts(orders);",
  [
    "  // " + MARK + " : quand un filtre est choisi (bloc du parcours ou tuile de l'Accueil), la page se cale sur le parcours des commandes",
    "  const ordersFlowRef = useRef(null);",
    "  useEffect(() => {",
    '    if (statusFilter === "all") return undefined;',
    "    const t = setTimeout(() => {",
    "      const el = ordersFlowRef.current;",
    '      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });',
    "    }, 80);",
    "    return () => clearTimeout(t);",
    "  }, [statusFilter]);",
  ].join("\n"),
  "Etat flaggedAccounts (AdminOrders)"
);
replaceOnce(
  crm,
  'data-testid="orders-flow"',
  'ref={ordersFlowRef} style={{ scrollMarginTop: 84 }} data-testid="orders-flow"',
  "Bloc « Parcours des commandes »"
);

// ==================================================================
// pages/admin.js
// ==================================================================

// a. états du menu : replié par défaut, déplié au survol (ou épinglé)
replaceOnce(
  admin,
  "const [sidebarCollapsed, setSidebarCollapsed] = useState(false);",
  [
    "// " + MARK + " : menu replié par défaut ; il se déplie au survol du bord gauche et se replie au clic. « Épinglé » = gardé ouvert en permanence.",
    "  const [sidebarPinned, setSidebarPinned] = useState(false);",
    "  const [sidebarHover, setSidebarHover] = useState(false);",
    "  const sidebarCollapsed = !(sidebarPinned || sidebarHover); // vrai quand seules les icônes sont affichées",
    "  const sidebarTimer = useRef(null);",
    "  const queueSidebarOpen = () => {",
    "    if (sidebarTimer.current) clearTimeout(sidebarTimer.current);",
    "    sidebarTimer.current = setTimeout(() => setSidebarHover(true), 120); // court délai : pas d'ouverture par accident",
    "  };",
    "  const queueSidebarClose = () => {",
    "    if (sidebarTimer.current) clearTimeout(sidebarTimer.current);",
    "    sidebarTimer.current = setTimeout(() => setSidebarHover(false), 300);",
    "  };",
    "  const closeSidebarNow = () => {",
    "    if (sidebarTimer.current) clearTimeout(sidebarTimer.current);",
    "    sidebarTimer.current = null;",
    "    setSidebarHover(false);",
    "  };",
    "  useEffect(() => {",
    '    const onKey = (e) => {',
    '      if (e.key === "Escape") {',
    "        if (sidebarTimer.current) clearTimeout(sidebarTimer.current);",
    "        sidebarTimer.current = null;",
    "        setSidebarHover(false);",
    "      }",
    "    };",
    '    window.addEventListener("keydown", onKey);',
    "    return () => {",
    '      window.removeEventListener("keydown", onKey);',
    "      if (sidebarTimer.current) clearTimeout(sidebarTimer.current);",
    "    };",
    "  }, []);",
  ].join("\n"),
  "Etat sidebarCollapsed"
);

// b. ouverture de <aside> : largeur réservée = colonne d'icônes ; le menu déplié passe par-dessus la page
replaceRegexOnce(
  admin,
  /<aside\s+data-testid="admin-sidebar-accordion"\s+aria-label="Navigation de l'administration"\s+className=\{`shrink-0 sticky top-20 self-start transition-all \$\{sidebarCollapsed \? "w-14" : "w-60"\}`\}\s*>/,
  () =>
    code(
      [
        "<aside",
        '          data-testid="admin-sidebar-accordion"',
        '          aria-label="Navigation de l\'administration"',
        '          className={§shrink-0 sticky top-20 self-start z-20 ¤{sidebarPinned ? "w-60" : "w-14"}§}',
        "          onMouseEnter={queueSidebarOpen}",
        "          onMouseLeave={queueSidebarClose}",
        "        >",
        "          {/* " + MARK + " : zone sensible le long du bord gauche de l'écran (le menu s'y déplie) */}",
        "          {!sidebarPinned && (",
        '            <div aria-hidden="true" data-testid="sidebar-hotzone" className="fixed left-0" style={{ top: 64, bottom: 0, width: "max(12px, calc((100vw - 72rem) / 2 + 76px))" }} />',
        "          )}",
        "          <div",
        '            data-testid="sidebar-panel"',
        '            className={!sidebarPinned && !sidebarCollapsed ? "absolute -left-2 -top-2 z-30 w-64 rounded-2xl bg-[#fbf8f4] p-2 shadow-xl ring-1 ring-[#eadfe4]" : "relative"}',
        "          >",
      ].join("\n")
    ),
  "Ouverture de <aside>"
);
replaceOnce(admin, "</aside>", "</div>\n        </aside>", "Fermeture de </aside>");

// c. bouton rond : garder le menu ouvert / rétablir le repli automatique
replaceOnce(
  admin,
  "onClick={() => setSidebarCollapsed((v) => !v)}",
  "onClick={() => {\n              setSidebarPinned((v) => !v);\n              setSidebarHover(false);\n            }}",
  "Bouton sidebar-toggle (clic)"
);
replaceOnce(
  admin,
  'aria-label={sidebarCollapsed ? "Agrandir la navigation" : "Réduire la navigation"}',
  'aria-label={sidebarPinned ? "Rétablir le repli automatique du menu" : "Garder le menu ouvert"}\n            title={sidebarPinned ? "Rétablir le repli automatique du menu" : "Garder le menu ouvert"}',
  "Bouton sidebar-toggle (libelle)"
);
replaceOnce(
  admin,
  "{sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}",
  "{sidebarPinned ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}",
  "Bouton sidebar-toggle (icone)"
);

// d. fermeture : clic sur un sous-onglet (ou sur un groupe sans sous-onglet), clic ou saisie dans la page
replaceOnce(
  admin,
  "onClick={() => goTo(g.id, t.id)}",
  "onClick={() => {\n                              goTo(g.id, t.id);\n                              closeSidebarNow();\n                            }}",
  "Clic sur un sous-onglet"
);
replaceOnce(
  admin,
  "onClick={() => goTo(g.id)}",
  "onClick={() => {\n                      goTo(g.id);\n                      if (g.tabs.length === 1) closeSidebarNow(); // groupe sans sous-onglet (Accueil) : on y va et le menu se replie\n                    }}",
  "Clic sur un groupe"
);
replaceOnce(
  admin,
  '<main className="flex-1 min-w-0 py-8">',
  '<main className="flex-1 min-w-0 py-8" onMouseDownCapture={closeSidebarNow} onFocusCapture={closeSidebarNow}>',
  "Ouverture de <main>"
);

// e. pastilles visibles sur les icônes quand le menu est replié
replaceOnce(
  admin,
  "className={§flex items-center gap-2 rounded-full px-3.5 h-10 text-sm font-medium transition whitespace-nowrap w-full ¤{".replaceAll("§", "`").replaceAll("¤{", "${"),
  "className={§relative flex items-center gap-2 rounded-full px-3.5 h-10 text-sm font-medium transition whitespace-nowrap w-full ¤{".replaceAll("§", "`").replaceAll("¤{", "${"),
  "Bouton de groupe (classe)"
);
replaceOnce(
  admin,
  '{!sidebarCollapsed && (g.id === "accueil" || g.id === "crm") && counters.todoTotal > 0 && (',
  '{(g.id === "accueil" || g.id === "crm") && counters.todoTotal > 0 && (',
  "Pastille de groupe (condition, lot 5d)"
);
replaceOnce(
  admin,
  'className={"min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-medium flex items-center justify-center shrink-0 " + (activeGroup',
  'className={(sidebarCollapsed ? "absolute -top-1 -right-1 " : "") + "min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-medium flex items-center justify-center shrink-0 " + (activeGroup',
  "Pastille de groupe (position, lot 5d)"
);

// ------------------------------------------------------------------
// Controles finaux
// ------------------------------------------------------------------
if (occurrences(admin.src, "setSidebarCollapsed") !== 0) fail("pages/admin.js : setSidebarCollapsed est encore utilise.");
if (occurrences(admin.src, MARK) < 2) fail("pages/admin.js : marqueur attendu au moins 2 fois, trouve " + occurrences(admin.src, MARK) + ".");
if (occurrences(admin.src, "queueSidebarOpen") !== 2) fail("queueSidebarOpen : 2 occurrences attendues (definition et usage).");
if (occurrences(admin.src, "queueSidebarClose") !== 2) fail("queueSidebarClose : 2 occurrences attendues (definition et usage).");
if (occurrences(admin.src, "closeSidebarNow") < 5) fail("closeSidebarNow : au moins 5 occurrences attendues.");
if (occurrences(admin.src, "<aside") !== 1 || occurrences(admin.src, "</aside>") !== 1) fail("<aside> doit apparaitre une seule fois.");
if (occurrences(crm.src, MARK) < 3) fail("AdminCrm.js : marqueur attendu au moins 3 fois, trouve " + occurrences(crm.src, MARK) + ".");
if (occurrences(crm.src, "ordersFlowRef") !== 3) fail("ordersFlowRef : 3 occurrences attendues (definition, effet, bloc).");
if (occurrences(crm.src, "orders-date-range") !== 1) fail("orders-date-range doit apparaitre une seule fois.");

console.log("");
console.log("  1. Commandes : date de fin avec la date de debut, recherche en 2e ligne a gauche   OK");
console.log("  2. Commandes : la page se cale sur le parcours quand un filtre est choisi          OK");
console.log("  3. Menu : replie par defaut, deplie au bord gauche, replie au clic                 OK");
console.log("  4. Menu : pastilles visibles sur les icones repliees                               OK");
console.log("  Lignes admin.js : " + before.admin + " -> " + admin.src.split("\n").length);
console.log("  Lignes AdminCrm.js : " + before.crm + " -> " + crm.src.split("\n").length);

if (apply) {
  fs.writeFileSync(F_ADMIN, serialize(admin), "utf8");
  fs.writeFileSync(F_CRM, serialize(crm), "utf8");
  console.log("\nEcrit : pages/admin.js, components/AdminCrm.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
