#!/usr/bin/env node
// ============================================================
// patch-lotH4-compte-header.mjs  -  ZENORIA_SITE_HEADER_H4
//
// Lot H4 : la page /compte utilise l'en-tete partage components/SiteHeader.js, comme l'accueil,
// le quiz et les pages legales. Seule la barre du haut change ; le bandeau « Mon compte / Bonjour »
// avec la photo (section data-testid="account-hero") n'est pas touche.
//
//  - pages/compte.js :
//      - import SiteHeader ajoute apres l'import de Head
//      - la barre du haut (« ZENORIA » texte + « Retour à la boutique », 64 px, non collante) est
//        remplacee par <SiteHeader ... /> (collant, 80 px, menu complet, logo cristal, aucune entree
//        soulignee ; ni recherche, ni compte, ni panier : inertes sur cette page donc masques ; le
//        cœur ouvre directement la rubrique « Mes favoris » de la page, via la fonction go() existante)
//      - la colonne de rubriques (nav collante) passe de lg:top-4 a lg:top-24, pour descendre sous
//        le nouveau header collant de 80 px (a confirmer en Preview)
//
// Decisions deja validees : pas de « Retour à la boutique », pas de bandeau violet, cœur = rubrique
// « Mes favoris ». L'icone compte est masquee ici (choix du script) : cliquer dessus en etant deja
// sur Mon compte n'aurait aucune action, comme la recherche et le panier sur cette page. Si tu
// preferes la garder visible (par exemple mise en evidence), dis-le et on ajustera.
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotH4-compte-header.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotH4-compte-header.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_SITE_HEADER_H4";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

const rel = "pages/compte.js";
const file = path.join(ROOT, ...rel.split("/"));
if (!fs.existsSync(file)) stop(rel + " introuvable (lance le script depuis la racine du projet).");
const raw = fs.readFileSync(file, "utf8");
const crlf = (raw.match(/\r\n/g) || []).length;
const lf = (raw.match(/\n/g) || []).length - crlf;
if (crlf > 0 && lf > 0) stop(rel + " melange des fins de ligne CRLF et LF : je ne touche pas a un fichier dans cet etat.");
const eol = crlf > 0 ? "\r\n" : "\n";
let text = raw.replace(/\r\n/g, "\n");

if (text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans " + rel + " : lot deja applique.");

const EDITS = [
  {
    label: "import SiteHeader apres Head",
    from: 'import Head from "next/head";\n',
    to: 'import Head from "next/head";\nimport SiteHeader from "@/components/SiteHeader"; // ' + MARK + "\n",
  },
  {
    label: "barre du haut (texte ZENORIA)",
    from:
      '      <header className="border-b border-[#eadfe4] bg-[#fbf8f4]/95">\n' +
      '        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">\n' +
      '          <a href="/" className="font-serif text-xl tracking-[.22em] text-[#412f3b]">ZENORIA</a>\n' +
      '          <a href="/" className="text-sm text-[#8f6075] underline">Retour à la boutique</a>\n' +
      "        </div>\n" +
      "      </header>\n",
    to:
      '      <SiteHeader logoHref="/" showSearch={false} showAccount={false} showCart={false} onFavClick={() => go("favoris")} />\n',
  },
  {
    label: "colonne de rubriques : decalage sous le header collant",
    from: '<nav aria-label="Rubriques de mon compte" className="lg:self-start lg:sticky lg:top-4">',
    to: '<nav aria-label="Rubriques de mon compte" className="lg:self-start lg:sticky lg:top-24">',
  },
];

for (const e of EDITS) {
  const n = count(text, e.from);
  if (n !== 1) stop(rel + " : ancre « " + e.label + " » trouvee " + n + " fois (attendu : 1). Le fichier a change depuis l'audit.");
}
// Controle d'ordre : l'import precede le remplacement du header, qui precede la colonne de rubriques
const iImport = text.indexOf(EDITS[0].from);
const iHeader = text.indexOf(EDITS[1].from);
const iNav = text.indexOf(EDITS[2].from);
if (!(iImport < iHeader && iHeader < iNav)) stop("l'ordre des ancres dans le fichier est inattendu.");
// « go » doit etre defini avant le header remplace, pour etre utilisable dans onFavClick
if (!/\bconst go = \(id\) => \{/.test(text) || text.indexOf("const go = (id) => {") > iHeader) {
  stop("la fonction go(id) est absente ou definie apres le header : impossible de l'utiliser pour « Mes favoris ».");
}
// La rubrique « favoris » doit exister dans SECTIONS
if (!text.includes('id: "favoris"')) stop('la rubrique id: "favoris" est introuvable dans SECTIONS.');

for (const e of EDITS) text = text.replace(e.from, () => e.to);
if (!text.includes(MARK)) stop("controle final en echec (marqueur absent apres remplacement).");
if (text.includes("logo-facture.png") || text.includes(">ZENORIA<")) stop("controle final en echec : l'ancienne barre du haut semble encore presente.");

console.log("Lot H4 - en-tete partage sur Mon compte");
console.log(" - fin de ligne detectee : " + (eol === "\r\n" ? "CRLF" : "LF"));
console.log(" - " + rel + " : import SiteHeader ajoute, barre du haut remplacee, colonne de rubriques decalee (lg:top-4 -> lg:top-24)");

if (DRY) {
  console.log("\nDRY-RUN OK : toutes les ancres sont uniques, dans l'ordre attendu. Rien n'a ete ecrit.");
  process.exit(0);
}
fs.writeFileSync(file, eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text, "utf8");
console.log("\nOK : fichier ecrit. Lance maintenant : npm run build");
