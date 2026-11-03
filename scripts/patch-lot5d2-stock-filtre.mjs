// patch-lot5d2-stock-filtre.mjs
// Lot 5d-bis : les tuiles « État du stock » de l'Accueil ouvrent la liste des bijoux CONCERNÉS (filtrée),
// et non plus la page Collections entière. Sans SQL.
//
//   Tuile « Bijoux épuisés »              -> bijoux en ligne dont le stock est à 0 (hors pièces uniques)
//   Tuile « Dernier exemplaire »          -> bijoux en ligne dont le stock est à 1 (hors pièces uniques)
//   Tuile « Pièces uniques réservées »    -> pièces uniques en ligne réservées, avec la référence de la commande qui la réserve
//   Tuile « Pièces uniques (dispo / vendues) » -> toutes les pièces uniques en ligne
//
// Le filtre utilise EXACTEMENT les mêmes règles que les chiffres des tuiles (même fonction de lecture des réservations),
// donc le nombre de bijoux affichés dans la liste est le nombre inscrit sur la tuile.
// Un clic sur le menu (Bijoux) retire le filtre ; un bandeau « Filtre : … » avec « Afficher toutes les collections » le rappelle.
//
// À appliquer sur la branche du lot 5d (marqueur ZENORIA_HOME_5D_V1 requis).
//   - lib/adminCounters.js      : fonction stockFilterMatches + libellés
//   - components/AdminHome.js   : les tuiles de stock appellent onOpenStock(filtre)
//   - pages/admin.js            : état du filtre, liste filtrée, bandeau, référence de commande des pièces réservées
//
// Usage :  node scripts/patch-lot5d2-stock-filtre.mjs --dry-run
//          node scripts/patch-lot5d2-stock-filtre.mjs --apply
// Marqueur : ZENORIA_HOME_5D2_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_HOME_5D2_V1";
const BASE = "ZENORIA_HOME_5D_V1";
const ROOT = process.cwd();
const F_COUNTERS = path.join(ROOT, "lib", "adminCounters.js");
const F_HOME = path.join(ROOT, "components", "AdminHome.js");
const F_ADMIN = path.join(ROOT, "pages", "admin.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lot5d2-stock-filtre.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

for (const f of [F_COUNTERS, F_HOME, F_ADMIN]) {
  if (!fs.existsSync(f)) fail(path.relative(ROOT, f) + " introuvable. Le lot 5d doit etre applique avant ce patch (lancez le script depuis la racine du projet).");
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
function once(doc, needle, label) {
  const n = occurrences(doc.src, needle);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
}
function replaceOnce(doc, needle, replacement, label) {
  once(doc, needle, label);
  doc.src = doc.src.replace(needle, () => replacement);
}
function afterLine(doc, needle, addition, label) {
  once(doc, needle, label);
  const idx = doc.src.indexOf(needle);
  const eol = doc.src.indexOf("\n", idx);
  const end = eol < 0 ? doc.src.length : eol;
  doc.src = doc.src.slice(0, end) + "\n" + addition + doc.src.slice(end);
}
function beforeLine(doc, needle, addition, label) {
  once(doc, needle, label);
  const idx = doc.src.indexOf(needle);
  const start = doc.src.lastIndexOf("\n", idx) + 1;
  doc.src = doc.src.slice(0, start) + addition + "\n" + doc.src.slice(start);
}

const counters = readSrc(F_COUNTERS);
const home = readSrc(F_HOME);
const admin = readSrc(F_ADMIN);
const docs = [counters, home, admin];
const names = ["lib/adminCounters.js", "components/AdminHome.js", "pages/admin.js"];

if (docs.every((d) => d.src.includes(MARK))) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}
if (docs.some((d) => d.src.includes(MARK))) fail("Etat incoherent : le marqueur n'est present que dans une partie des fichiers. Restaurez-les (git checkout) puis relancez.");
docs.forEach((d, i) => {
  if (!d.src.includes(BASE)) fail(names[i] + " ne contient pas " + BASE + " : appliquez d'abord le lot 5d (patch-lot5d-accueil.mjs).");
  console.log(names[i] + " (fins de ligne " + (d.crlf ? "Windows CRLF" : "LF") + ")");
});
const before = docs.map((d) => d.src.split("\n").length);

// ------------------------------------------------------------------
// 1. lib/adminCounters.js : règle de filtre (mêmes règles que les chiffres des tuiles)
// ------------------------------------------------------------------
const HELPER = [
  "// " + MARK + " : filtre de la liste des bijoux ouvert depuis les tuiles « État du stock » de l'Accueil.",
  "// Mêmes règles que les chiffres des tuiles : seuls les bijoux en ligne comptent ; les pièces uniques se lisent",
  "// dans leurs réservations (pieceStateFor), les autres bijoux dans la colonne stock.",
  "export const STOCK_FILTER_LABELS = {",
  '  out: "Bijoux épuisés",',
  '  last: "Dernier exemplaire",',
  '  reserved: "Pièces uniques réservées",',
  '  unique: "Pièces uniques",',
  "};",
  "export function stockFilterMatches(filter, product, holds) {",
  "  if (!product || product.active !== true) return false;",
  "  const unique = product.is_unique === true;",
  "  const stock = Number(product.stock) || 0;",
  '  if (filter === "out") return !unique && stock <= 0;',
  '  if (filter === "last") return !unique && stock === 1;',
  '  if (filter === "reserved") return unique && pieceStateFor(product.id, holds || []).state === "reserved";',
  '  if (filter === "unique") return unique;',
  "  return true;",
  "}",
  "",
].join("\n");
beforeLine(counters, "export const EMPTY_COUNTERS = {", HELPER, "EMPTY_COUNTERS (lib/adminCounters.js)");

// ------------------------------------------------------------------
// 2. components/AdminHome.js : les tuiles de stock appellent onOpenStock
// ------------------------------------------------------------------
replaceOnce(
  home,
  "export default function AdminHome({ counters, onGo }) {",
  "export default function AdminHome({ counters, onGo, onOpenStock }) { // " + MARK,
  "Signature AdminHome"
);
replaceOnce(
  home,
  'onClick={() => onGo("produits", "collections")}',
  'onClick={() => (onOpenStock ? onOpenStock(t.key) : onGo("produits", "collections"))}',
  "Clic sur une tuile de stock"
);
replaceOnce(
  home,
  "Seuls les bijoux visibles sur le site sont comptés. Les pièces uniques se lisent dans leurs réservations ; l&apos;état des autres bijoux vient de la colonne stock.",
  "Seuls les bijoux visibles sur le site sont comptés. Un clic sur une tuile ouvre la liste des bijoux concernés. Les pièces uniques se lisent dans leurs réservations ; l&apos;état des autres bijoux vient de la colonne stock.",
  "Texte sous les tuiles de stock"
);

// ------------------------------------------------------------------
// 3. pages/admin.js : filtre, liste filtrée, bandeau, référence de commande
// ------------------------------------------------------------------
replaceOnce(
  admin,
  'import { useAdminCounters } from "@/lib/adminCounters";',
  'import { useAdminCounters, stockFilterMatches, STOCK_FILTER_LABELS } from "@/lib/adminCounters"; // ' + MARK,
  "Import lib/adminCounters"
);
afterLine(
  admin,
  "const [rgpdPendingCount, setRgpdPendingCount] = useState(0);",
  '  const [stockFilter, setStockFilter] = useState(""); // ' + MARK + " : filtre de la liste des bijoux (venu de l'Accueil)",
  "Etat rgpdPendingCount"
);
replaceOnce(
  admin,
  "setNav({ group, sub: target });",
  "setStockFilter(\"\"); // " + MARK + " : un clic sur le menu retire le filtre de stock\n    setNav({ group, sub: target });",
  "goTo (setNav)"
);
beforeLine(
  admin,
  "const [products, setProducts] = useState([]);",
  "  // " + MARK + " : ouvre la liste des bijoux filtrée (tuiles de l'Accueil) ; la liste est relue pour rester cohérente avec les chiffres\n" +
    "  const openStock = (filter) => {\n" +
    '    goTo("produits", "collections");\n' +
    "    setStockFilter(filter);\n" +
    "    loadProducts();\n" +
    "  };",
  "Etat products"
);
afterLine(
  admin,
  "const [uniqueWarning, setUniqueWarning] = useState(null);",
  "  const visibleProducts = stockFilter ? products.filter((p) => stockFilterMatches(stockFilter, p, pieceHolds)) : products; // " + MARK,
  "Etat uniqueWarning"
);
replaceOnce(admin, "{products.map((p) => (", "{visibleProducts.map((p) => (", "Liste des bijoux (products.map)");
beforeLine(
  admin,
  "{productsLoading ? (",
  "            {/* " + MARK + " : filtre de stock venu de l'Accueil */}\n" +
    "            {stockFilter && !productsLoading && (\n" +
    '              <div data-testid="stock-filter-banner" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#f5edf1] px-4 py-2.5 text-[13px] text-[#54434c]">\n' +
    "                <span>\n" +
    "                  Filtre : <b>{STOCK_FILTER_LABELS[stockFilter] || stockFilter}</b> · {visibleProducts.length} collection{visibleProducts.length > 1 ? \"s\" : \"\"}\n" +
    "                  {visibleProducts.length === 0 && \" : aucune collection ne correspond.\"}\n" +
    "                </span>\n" +
    '                <button type="button" onClick={() => setStockFilter("")} data-testid="stock-filter-clear" className="text-[#8f6075] underline">\n' +
    "                  Afficher toutes les collections\n" +
    "                </button>\n" +
    "              </div>\n" +
    "            )}",
  "Chargement des collections ({productsLoading ? ()"
);
replaceOnce(
  admin,
  "{pieceBadgeLabel(st)}",
  '{pieceBadgeLabel(st)}{stockFilter === "reserved" && st === "reserved" ? " · " + formatOrderReference(holdOrders[pieceStateFor(p.id, pieceHolds).orderId] || { id: pieceStateFor(p.id, pieceHolds).orderId }) : ""}',
  "Badge des pieces uniques"
);
replaceOnce(
  admin,
  "<AdminHome counters={counters} onGo={goTo} />",
  "<AdminHome counters={counters} onGo={goTo} onOpenStock={openStock} />",
  "Rendu de AdminHome"
);

// ------------------------------------------------------------------
// Contrôles finaux
// ------------------------------------------------------------------
if (occurrences(counters.src, MARK) < 1) fail("lib/adminCounters.js : marqueur absent.");
if (occurrences(home.src, MARK) < 1) fail("components/AdminHome.js : marqueur absent.");
if (occurrences(admin.src, MARK) < 6) fail("pages/admin.js : marqueur attendu au moins 6 fois, trouve " + occurrences(admin.src, MARK) + ".");
if (occurrences(admin.src, "const openStock = ") !== 1) fail("openStock doit etre defini une seule fois.");
if (occurrences(admin.src, "visibleProducts") !== 5) fail("visibleProducts : 5 usages attendus (definition, map, 3 dans le bandeau), trouve " + occurrences(admin.src, "visibleProducts") + ".");
if (occurrences(admin.src, "{products.map((p) => (") !== 0) fail("La liste n'utilise plus la liste filtree : controle echoue.");

console.log("");
console.log("  1. lib/adminCounters.js : stockFilterMatches (memes regles que les tuiles)  OK");
console.log("  2. components/AdminHome.js : les tuiles de stock ouvrent la liste filtree   OK");
console.log("  3. pages/admin.js : filtre, liste filtree, bandeau, reference de commande   OK");
console.log("  Lignes adminCounters.js : " + before[0] + " -> " + counters.src.split("\n").length);
console.log("  Lignes AdminHome.js : " + before[1] + " -> " + home.src.split("\n").length);
console.log("  Lignes admin.js : " + before[2] + " -> " + admin.src.split("\n").length);

if (apply) {
  fs.writeFileSync(F_COUNTERS, serialize(counters), "utf8");
  fs.writeFileSync(F_HOME, serialize(home), "utf8");
  fs.writeFileSync(F_ADMIN, serialize(admin), "utf8");
  console.log("\nEcrit : lib/adminCounters.js, components/AdminHome.js, pages/admin.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
