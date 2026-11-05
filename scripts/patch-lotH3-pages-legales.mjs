#!/usr/bin/env node
// ============================================================
// patch-lotH3-pages-legales.mjs  -  ZENORIA_SITE_HEADER_H3
//
// Lot H3 : les 4 pages legales (cgv, charte-des-avis, confidentialite, mentions-legales) utilisent
// l'en-tete partage components/SiteHeader.js, comme l'accueil et le quiz.
//
//  - components/SiteHeader.js : nouvelle option showCart (true par defaut : l'accueil et le quiz ne changent
//                               pas) pour pouvoir masquer le panier tant qu'il n'est pas branche (lot H5)
//  - pages/cgv.js, pages/charte-des-avis.js, pages/confidentialite.js, pages/mentions-legales.js :
//      la barre du haut (logo-facture.png + « Retour à la boutique », 64 px, non collante) est remplacee
//      par <SiteHeader ... /> (collant, 80 px, menu complet, logo cristal, aucune entree soulignee ;
//      ni recherche, ni compte, ni favoris, ni panier : ils viendront au lot H5)
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotH3-pages-legales.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotH3-pages-legales.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_SITE_HEADER_H3";

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
    if (n !== 1) stop(f.rel + " : ancre « " + e.label + " » trouvee " + n + " fois (attendu : 1).");
    t = t.replace(e.from, () => e.to);
  }
  return t;
}
const toDisk = (f, t) => (f.eol === "\r\n" ? t.replace(/\n/g, "\r\n") : t);

// ---------- 1. components/SiteHeader.js : option showCart ----------
const header = read("components/SiteHeader.js");
if (header.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans components/SiteHeader.js : lot deja applique.");
const headerNext = applyEdits(header, [
  {
    label: "props : showCart",
    from: "  cartCount = 0,\n  onCartClick,\n",
    to: "  showCart = true, // " + MARK + "\n  cartCount = 0,\n  onCartClick,\n",
  },
  {
    label: "panier : bouton entoure par showCart",
    from:
      '          <Button variant="ghost" size="icon" onClick={onCartClick} className="relative" aria-label="Ouvrir le panier" data-testid="header-cart">\n' +
      "            <ShoppingBag size={19} />\n" +
      "            {cartCount > 0 && (\n" +
      '              <span data-testid="header-cart-count" className="absolute right-0 top-0 h-5 min-w-5 px-1 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">\n' +
      "                {cartCount}\n" +
      "              </span>\n" +
      "            )}\n" +
      "          </Button>\n",
    to:
      "          {showCart && (\n" +
      '          <Button variant="ghost" size="icon" onClick={onCartClick} className="relative" aria-label="Ouvrir le panier" data-testid="header-cart">\n' +
      "            <ShoppingBag size={19} />\n" +
      "            {cartCount > 0 && (\n" +
      '              <span data-testid="header-cart-count" className="absolute right-0 top-0 h-5 min-w-5 px-1 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">\n' +
      "                {cartCount}\n" +
      "              </span>\n" +
      "            )}\n" +
      "          </Button>\n" +
      "          )}\n",
  },
]);

// ---------- 2. Les 4 pages legales ----------
const PAGES = ["pages/cgv.js", "pages/charte-des-avis.js", "pages/confidentialite.js", "pages/mentions-legales.js"];
const HEADER_BLOCK =
  '      <header className="border-b border-[#eadfe4] bg-[#fbf8f4]/95">\n' +
  '        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">\n' +
  '          <a href="/"><img src="/images/logo-facture.png" alt="Zenoria" className="h-9 w-auto" /></a>\n' +
  '          <a href="/" className="text-sm text-[#8f6075] underline">Retour à la boutique</a>\n' +
  "        </div>\n" +
  "      </header>\n";
const SITE_HEADER_TAG = '      <SiteHeader logoHref="/" showSearch={false} showAccount={false} showFavorites={false} showCart={false} />\n';
const IMPORT_ANCHOR = 'import Head from "next/head";\n';
const IMPORT_LINE = 'import SiteHeader from "@/components/SiteHeader"; // ' + MARK + "\n";

const pageFiles = [];
for (const rel of PAGES) {
  const f = read(rel);
  if (f.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans " + rel + " : lot deja applique.");
  const next = applyEdits(f, [
    { label: "import Head", from: IMPORT_ANCHOR, to: IMPORT_ANCHOR + IMPORT_LINE },
    { label: "barre du haut (logo-facture.png)", from: HEADER_BLOCK, to: SITE_HEADER_TAG },
  ]);
  if (next.includes("logo-facture.png")) stop(rel + " : « logo-facture.png » est encore reference apres remplacement.");
  pageFiles.push({ f, next });
}

// ---------- Rapport et ecriture ----------
console.log("Lot H3 - en-tete partage sur les pages legales");
console.log(" - components/SiteHeader.js : option showCart ajoutee (" + header.text.split("\n").length + " -> " + headerNext.split("\n").length + " lignes)");
for (const { f, next } of pageFiles) {
  console.log(" - " + f.rel + " : barre du haut remplacee par SiteHeader (" + f.text.split("\n").length + " -> " + next.split("\n").length + " lignes)");
}

if (DRY) {
  console.log("\nDRY-RUN OK : toutes les ancres sont uniques et conformes. Rien n'a ete ecrit.");
  process.exit(0);
}
fs.writeFileSync(header.path, toDisk(header, headerNext), "utf8");
for (const { f, next } of pageFiles) fs.writeFileSync(f.path, toDisk(f, next), "utf8");
console.log("\nOK : fichiers ecrits. Lance maintenant : npm run build");
