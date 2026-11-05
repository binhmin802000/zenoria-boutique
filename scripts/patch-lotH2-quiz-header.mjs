#!/usr/bin/env node
// ============================================================
// patch-lotH2-quiz-header.mjs  -  ZENORIA_SITE_HEADER_H2
//
// Lot H2 : la page /quiz utilise l'en-tete partage components/SiteHeader.js, comme l'accueil.
//
//  - components/SiteHeader.js : nouvelles options showAccount et showFavorites (true par defaut : l'accueil ne change pas) ;
//                               le menu mobile devient autonome quand la page ne le pilote pas (onMenuToggle absent)
//  - pages/quiz.js            : <QuizHeader ... /> est remplace par <SiteHeader ... /> (menu aligne, « Quiz » souligne,
//                               logo vers l'accueil, panier conserve, ni recherche, ni compte, ni favoris : ils viendront au lot H4)
//  - components/QuizChrome.js : il ne garde que ShippingStrip (QuizHeader, CrystalLogo local, QuizFooter et NAV sont retires :
//                               le pied de page du quiz est deja components/Footer.js)
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotH2-quiz-header.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotH2-quiz-header.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_SITE_HEADER_H2";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

// Lit un fichier en normalisant les fins de ligne (LF) ; memorise la fin de ligne d'origine pour la reecriture
function read(rel) {
  const p = path.join(ROOT, ...rel.split("/"));
  if (!fs.existsSync(p)) stop(rel + " introuvable (lance le script depuis la racine du projet).");
  const raw = fs.readFileSync(p, "utf8");
  return { rel, path: p, eol: raw.includes("\r\n") ? "\r\n" : "\n", text: raw.replace(/\r\n/g, "\n") };
}
function applyEdits(f, edits) {
  let t = f.text;
  for (const e of edits) {
    const n = count(t, e.from);
    if (n !== 1) stop(f.rel + " : ancre « " + e.label + " » trouvee " + n + " fois (attendu : 1).");
    t = t.replace(e.from, () => e.to);
  }
  return t;
}

// ---------- 1. components/SiteHeader.js ----------
const header = read("components/SiteHeader.js");
if (header.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans components/SiteHeader.js : lot deja applique.");
const headerNext = applyEdits(header, [
  {
    label: "import React",
    from: 'import React from "react";',
    to: 'import React, { useState } from "react"; // ' + MARK,
  },
  {
    label: "props : menuOpen",
    from: "  menuOpen = false,\n",
    to: "  menuOpen,\n",
  },
  {
    label: "props : showAccount et showFavorites",
    from: "  showSearch = true,\n",
    to: "  showSearch = true,\n  showAccount = true,\n  showFavorites = true,\n",
  },
  {
    label: "closeMenu",
    from: "  const closeMenu = () => {\n    if (onMenuClose) onMenuClose();\n  };\n",
    to:
      "  // Menu mobile : pilote par la page quand elle fournit onMenuToggle (accueil), sinon gere par le composant (quiz, pages simples)\n" +
      "  const [innerMenu, setInnerMenu] = useState(false);\n" +
      "  const controlled = typeof onMenuToggle === \"function\";\n" +
      "  const isOpen = controlled ? Boolean(menuOpen) : innerMenu;\n" +
      "  const toggleMenu = controlled ? onMenuToggle : () => setInnerMenu((o) => !o);\n" +
      "  const closeMenu = () => {\n" +
      "    if (controlled) {\n" +
      "      if (onMenuClose) onMenuClose();\n" +
      "    } else {\n" +
      "      setInnerMenu(false);\n" +
      "    }\n" +
      "  };\n",
  },
  {
    label: "compte (bureau) : debut",
    from: '          {/* Compte utilisateur */}\n          <div className="relative hidden sm:block">\n',
    to: '          {/* Compte utilisateur */}\n          {showAccount && (\n          <div className="relative hidden sm:block">\n',
  },
  {
    label: "compte (bureau) : fin, favoris (bureau) : debut",
    from: '          </div>\n          <Button variant="ghost" size="icon" onClick={onFavClick}',
    to: '          </div>\n          )}\n          {showFavorites && (\n          <Button variant="ghost" size="icon" onClick={onFavClick}',
  },
  {
    label: "favoris (bureau) : fin",
    from: '          </Button>\n          <Button variant="ghost" size="icon" onClick={onCartClick}',
    to: '          </Button>\n          )}\n          <Button variant="ghost" size="icon" onClick={onCartClick}',
  },
  {
    label: "burger : action",
    from: "onClick={onMenuToggle}>",
    to: "onClick={toggleMenu}>",
  },
  {
    label: "burger : icone",
    from: "{menuOpen ? <X /> : <Menu />}",
    to: "{isOpen ? <X /> : <Menu />}",
  },
  {
    label: "menu mobile : affichage",
    from: "      {menuOpen && (\n",
    to: "      {isOpen && (\n",
  },
  {
    label: "menu mobile : fermeture des entrees",
    from: "onStory={onStory} onMenuClose={onMenuClose} />",
    to: "onStory={onStory} onMenuClose={closeMenu} />",
  },
  {
    label: "menu mobile : favoris et compte",
    from:
      "          <button\n" +
      "            onClick={() => {\n" +
      "              if (onFavClick) onFavClick();\n" +
      "              closeMenu();\n" +
      "            }}\n" +
      '            className="text-left"\n' +
      "          >\n" +
      '            Mes favoris{favCount > 0 ? " (" + favCount + ")" : ""}\n' +
      "          </button>\n" +
      "          {!authLoading &&\n",
    to:
      "          {showFavorites && (\n" +
      "            <button\n" +
      "              onClick={() => {\n" +
      "                if (onFavClick) onFavClick();\n" +
      "                closeMenu();\n" +
      "              }}\n" +
      '              className="text-left"\n' +
      "            >\n" +
      '              Mes favoris{favCount > 0 ? " (" + favCount + ")" : ""}\n' +
      "            </button>\n" +
      "          )}\n" +
      "          {showAccount &&\n" +
      "            !authLoading &&\n",
  },
]);
if (count(headerNext, "menuOpen") !== 2) stop("controle final de SiteHeader.js : « menuOpen » devrait apparaitre 2 fois (props, isOpen), il apparait " + count(headerNext, "menuOpen") + " fois.");

// ---------- 2. pages/quiz.js ----------
const quiz = read("pages/quiz.js");
if (quiz.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans pages/quiz.js : lot deja applique.");
const quizNext = applyEdits(quiz, [
  {
    label: "import QuizChrome",
    from: 'import { QuizHeader, ShippingStrip } from "@/components/QuizChrome";',
    to: 'import { ShippingStrip } from "@/components/QuizChrome";\nimport SiteHeader from "@/components/SiteHeader"; // ' + MARK,
  },
  {
    label: "balise QuizHeader",
    from: "<QuizHeader cartCount={cartCount} onCartClick={openCart} />",
    to:
      "<SiteHeader\n" +
      '        current="quiz"\n' +
      '        logoHref="/"\n' +
      "        showSearch={false}\n" +
      "        showAccount={false}\n" +
      "        showFavorites={false}\n" +
      "        cartCount={cartCount}\n" +
      "        onCartClick={openCart}\n" +
      "      />",
  },
]);
if (quizNext.includes("QuizHeader")) stop("controle final de quiz.js : « QuizHeader » est encore reference.");

// ---------- 3. components/QuizChrome.js : ne garde que ShippingStrip ----------
const chrome = read("components/QuizChrome.js");
for (const needle of ["export function QuizHeader(", "export function QuizFooter(", "export function ShippingStrip("]) {
  if (count(chrome.text, needle) !== 1) stop("components/QuizChrome.js : « " + needle + " » trouve " + count(chrome.text, needle) + " fois (attendu : 1).");
}
const sStart = chrome.text.indexOf("export function ShippingStrip(");
const sEnd = chrome.text.indexOf("\n}\n", sStart);
if (sEnd < 0) stop("components/QuizChrome.js : fin de ShippingStrip introuvable.");
const strip = chrome.text.slice(sStart, sEnd + 3);
if (!strip.includes("shippingStripText(setting)") || strip.includes("export function QuizFooter")) stop("components/QuizChrome.js : le bloc ShippingStrip extrait est inattendu.");
const chromeNext =
  'import React from "react";\n' +
  'import { DEFAULT_SHIPPING, shippingStripText } from "@/lib/shippingSettings";\n' +
  "\n" +
  "// ============================================================\n" +
  "// BANDE DE LIVRAISON de la page /quiz - " + MARK + "\n" +
  "//\n" +
  "// L'en-tête du quiz est le composant partagé components/SiteHeader.js (comme l'accueil) et son pied de page est\n" +
  "// components/Footer.js. Il ne reste ici que la bande de livraison, au-dessus de l'en-tête.\n" +
  "// ============================================================\n" +
  "\n" +
  "// Bande de livraison, au-dessus de l'en-tête (comme sur l'accueil)\n" +
  strip;
for (const bad of ["QuizHeader", "QuizFooter", "useState", "lucide-react"]) {
  if (chromeNext.includes(bad)) stop("controle final de QuizChrome.js : « " + bad + " » est encore present.");
}

// ---------- Rapport et ecriture ----------
const toDisk = (f, t) => (f.eol === "\r\n" ? t.replace(/\n/g, "\r\n") : t);
console.log("Lot H2 - en-tete partage sur le quiz");
console.log(" - components/SiteHeader.js : options showAccount/showFavorites, menu mobile autonome (" + header.text.split("\n").length + " -> " + headerNext.split("\n").length + " lignes)");
console.log(" - pages/quiz.js : QuizHeader remplace par SiteHeader");
console.log(" - components/QuizChrome.js : " + chrome.text.split("\n").length + " -> " + chromeNext.split("\n").length + " lignes (ShippingStrip seul)");
console.log(" - fins de ligne : SiteHeader " + (header.eol === "\r\n" ? "CRLF" : "LF") + ", quiz " + (quiz.eol === "\r\n" ? "CRLF" : "LF") + ", QuizChrome " + (chrome.eol === "\r\n" ? "CRLF" : "LF"));

if (DRY) {
  console.log("\nDRY-RUN OK : toutes les ancres sont uniques et conformes. Rien n'a ete ecrit.");
  process.exit(0);
}
fs.writeFileSync(header.path, toDisk(header, headerNext), "utf8");
fs.writeFileSync(quiz.path, toDisk(quiz, quizNext), "utf8");
fs.writeFileSync(chrome.path, toDisk(chrome, chromeNext), "utf8");
console.log("\nOK : fichiers ecrits. Lance maintenant : npm run build");
