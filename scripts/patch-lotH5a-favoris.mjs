#!/usr/bin/env node
// ============================================================
// patch-lotH5a-favoris.mjs  -  ZENORIA_FAVORIS_V1
//
// Lot H5a : l'icone favoris du header partage fonctionne sur le quiz et les 4 pages legales
// (elle etait jusqu'ici reservee a l'accueil). Le badge est base sur les favoris du navigateur
// (localStorage, lib/favorites.js), lus une seule fois au chargement de chaque page : c'est la
// « version simple » decidee, sans appel reseau supplementaire. Le clic mene vers « /#favoris »,
// une nouvelle ancre geree par le bloc existant de pages/index.js (meme mecanisme que le lot A2) :
// elle ouvre le panneau des favoris de l'accueil.
//
//  - pages/index.js : nouveau cas "#favoris" dans le bloc d'ancres lues apres chargement -> setFavPanelOpen(true)
//  - pages/quiz.js  : etat favCount, lu avec cartCount au chargement ; showFavorites devient true sur SiteHeader
//  - pages/cgv.js, pages/charte-des-avis.js, pages/confidentialite.js, pages/mentions-legales.js :
//      import de useState/useEffect si absent, lecture des favoris au chargement, showFavorites=true
//
// Hors perimetre de ce lot (prevu au lot H5b) : icone compte, panier sur les pages legales et Mon compte.
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotH5a-favoris.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotH5a-favoris.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_FAVORIS_V1";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

function read(rel) {
  const p = path.join(ROOT, ...rel.split("/"));
  if (!fs.existsSync(p)) stop(rel + " introuvable (lance le script depuis la racine du projet).");
  const raw = fs.readFileSync(p, "utf8");
  const crlf = (raw.match(/\r\n/g) || []).length;
  const lf = (raw.match(/\n/g) || []).length - crlf;
  if (crlf > 0 && lf > 0) stop(rel + " melange des fins de ligne CRLF et LF : je ne touche pas a un fichier dans cet etat.");
  return { rel, path: p, eol: crlf > 0 ? "\r\n" : "\n", text: raw.replace(/\r\n/g, "\n") };
}
function applyEdits(f, edits) {
  let t = f.text;
  for (const e of edits) {
    const n = count(t, e.from);
    if (n !== 1) stop(f.rel + " : ancre « " + e.label + " » trouvee " + n + " fois (attendu : 1). Le fichier a change depuis l'audit.");
    t = t.replace(e.from, () => e.to);
  }
  return t;
}
const toDisk = (f, t) => (f.eol === "\r\n" ? t.replace(/\n/g, "\r\n") : t);

const SITE_HEADER_LEGAL_FROM = '<SiteHeader logoHref="/" showSearch={false} showAccount={false} showFavorites={false} showCart={false} />';
const SITE_HEADER_LEGAL_TO =
  "<SiteHeader\n" +
  '        logoHref="/"\n' +
  "        showSearch={false}\n" +
  "        showAccount={false}\n" +
  "        showFavorites={true}\n" +
  "        showCart={false}\n" +
  "        favCount={favCount}\n" +
  '        onFavClick={() => window.location.assign("/#favoris")}\n' +
  "      />";

const results = [];

// ---------- 1. pages/index.js : nouvelle ancre #favoris ----------
{
  const f = read("pages/index.js");
  if (f.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans pages/index.js : lot deja applique.");
  if (!f.text.includes("const [favPanelOpen, setFavPanelOpen] = useState(false);")) {
    stop("pages/index.js : « setFavPanelOpen » introuvable (declaration attendue). Le fichier a change depuis l'audit.");
  }
  const FROM = "      handled = true;\n    }\n    if (handled) {\n";
  const TO =
    "      handled = true;\n" +
    '    } else if (hash === "#favoris") {\n' +
    "      // " + MARK + " : « /#favoris » venu d'une autre page (quiz, pages legales) ouvre le panneau des favoris de l'accueil\n" +
    "      setFavPanelOpen(true);\n" +
    "      handled = true;\n" +
    "    }\n" +
    "    if (handled) {\n";
  const next = applyEdits(f, [{ label: "fin du bloc d'ancres (avant « if (handled) »)", from: FROM, to: TO }]);
  results.push({ f, next });
}

// ---------- 2. pages/quiz.js ----------
{
  const f = read("pages/quiz.js");
  if (f.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans pages/quiz.js : lot deja applique.");
  const next = applyEdits(f, [
    {
      label: "import SiteHeader (apres H2)",
      from: 'import SiteHeader from "@/components/SiteHeader"; // ZENORIA_SITE_HEADER_H2\n',
      to: 'import SiteHeader from "@/components/SiteHeader"; // ZENORIA_SITE_HEADER_H2\nimport { readLocalFavorites } from "@/lib/favorites"; // ' + MARK + "\n",
    },
    {
      label: "etat cartCount",
      from: "  const [cartCount, setCartCount] = useState(0);\n",
      to: "  const [cartCount, setCartCount] = useState(0);\n  const [favCount, setFavCount] = useState(0);\n",
    },
    {
      label: "lecture du panier au chargement",
      from: "    setCartCount(readCartCount(getLocalStorage()));\n",
      to: "    setCartCount(readCartCount(getLocalStorage()));\n    setFavCount(readLocalFavorites().length);\n",
    },
    {
      label: "balise SiteHeader du quiz (showFavorites)",
      from:
        "      <SiteHeader\n" +
        '        current="quiz"\n' +
        '        logoHref="/"\n' +
        "        showSearch={false}\n" +
        "        showAccount={false}\n" +
        "        showFavorites={false}\n" +
        "        cartCount={cartCount}\n" +
        "        onCartClick={openCart}\n" +
        "      />",
      to:
        "      <SiteHeader\n" +
        '        current="quiz"\n' +
        '        logoHref="/"\n' +
        "        showSearch={false}\n" +
        "        showAccount={false}\n" +
        "        showFavorites={true}\n" +
        "        favCount={favCount}\n" +
        '        onFavClick={() => window.location.assign("/#favoris")}\n' +
        "        cartCount={cartCount}\n" +
        "        onCartClick={openCart}\n" +
        "      />",
    },
  ]);
  results.push({ f, next });
}

// ---------- 3. Les 4 pages legales ----------
const LEGAL_PAGES = [
  {
    rel: "pages/cgv.js",
    hasHooks: true,
    importAnchor: 'import { fetchCgvText } from "@/lib/cgvSettings";\n',
    stateAnchor: "  const [updatedAt, setUpdatedAt] = useState(null);\n",
    effectAnchor:
      "  useEffect(() => {\n" +
      "    let alive = true;\n" +
      "    fetchCgvText(supabase).then((res) => {\n" +
      "      if (!alive) return;\n" +
      "      setText(res.text);\n" +
      "      setUpdatedAt(res.updatedAt);\n" +
      "      setLoading(false);\n" +
      "    });\n" +
      "    return () => { alive = false; };\n" +
      "  }, []);\n",
  },
  {
    rel: "pages/charte-des-avis.js",
    hasHooks: false,
    reactImportFrom: 'import React from "react";\n',
    importAnchor: 'import { fetchReviewsSetting, REVIEWS_RULES } from "@/lib/reviewsSettings";\n',
    componentAnchor: "export default function CharteDesAvis({ mode }) {\n  const r = REVIEWS_RULES;\n",
  },
  {
    rel: "pages/confidentialite.js",
    hasHooks: false,
    reactImportFrom: 'import React from "react";\n',
    importAnchor: 'import SiteHeader from "@/components/SiteHeader"; // ZENORIA_SITE_HEADER_H3\n',
    componentAnchor: "export default function Confidentialite() {\n  return (\n",
  },
  {
    rel: "pages/mentions-legales.js",
    hasHooks: false,
    reactImportFrom: 'import React from "react";\n',
    importAnchor: 'import SiteHeader from "@/components/SiteHeader"; // ZENORIA_SITE_HEADER_H3\n',
    componentAnchor: "export default function MentionsLegales() {\n  return (\n",
  },
];

for (const page of LEGAL_PAGES) {
  const f = read(page.rel);
  if (f.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans " + page.rel + " : lot deja applique.");
  const edits = [];
  if (!page.hasHooks) {
    edits.push({
      label: "import React -> React, { useState, useEffect }",
      from: page.reactImportFrom,
      to: 'import React, { useState, useEffect } from "react"; // ' + MARK + "\n",
    });
  }
  edits.push({
    label: "import readLocalFavorites",
    from: page.importAnchor,
    to: page.importAnchor + 'import { readLocalFavorites } from "@/lib/favorites";\n',
  });
  if (page.stateAnchor) {
    // cgv.js : etat et effet separes (useState/useEffect deja presents)
    edits.push({
      label: "etat favCount",
      from: page.stateAnchor,
      to: page.stateAnchor + "  const [favCount, setFavCount] = useState(0);\n",
    });
    edits.push({
      label: "effet de lecture des favoris",
      from: page.effectAnchor,
      to:
        page.effectAnchor +
        "  useEffect(() => {\n" +
        "    setFavCount(readLocalFavorites().length);\n" +
        "  }, []);\n",
    });
  } else {
    // pages sans etat existant : etat + effet inseres au debut du composant
    edits.push({
      label: "etat et effet de lecture des favoris (debut du composant)",
      from: page.componentAnchor,
      to:
        page.componentAnchor.split("\n")[0] +
        "\n" +
        "  const [favCount, setFavCount] = useState(0);\n" +
        "  useEffect(() => {\n" +
        "    setFavCount(readLocalFavorites().length);\n" +
        "  }, []);\n" +
        page.componentAnchor.split("\n").slice(1).join("\n"),
    });
  }
  edits.push({ label: "balise SiteHeader (showFavorites)", from: SITE_HEADER_LEGAL_FROM, to: SITE_HEADER_LEGAL_TO });
  const next = applyEdits(f, edits);
  results.push({ f, next });
}

// ---------- Rapport et ecriture ----------
console.log("Lot H5a - favoris sur le quiz et les pages legales");
for (const { f, next } of results) {
  console.log(" - " + f.rel + " : " + f.text.split("\n").length + " -> " + next.split("\n").length + " lignes");
}

if (DRY) {
  console.log("\nDRY-RUN OK : toutes les ancres sont uniques et conformes. Rien n'a ete ecrit.");
  process.exit(0);
}
for (const { f, next } of results) fs.writeFileSync(f.path, toDisk(f, next), "utf8");
console.log("\nOK : fichiers ecrits. Lance maintenant : npm run build");
