#!/usr/bin/env node
// ============================================================
// patch-lotR2-grille-aleatoire.mjs  -  ZENORIA_GRID_ORDER_V2
//
// Lot R2 : la grille « Nos créations » de l'accueil suit l'ordre calculé par lib/gridOrder.js (lot R1).
// Reglage par defaut (rien n'est encore lu en base : ce sera le lot R3) : aleatoire, renouvele chaque jour a 3 h, heure de Paris.
//
//  - pages/index.js :
//      - import de gridOrderIds et applyIdOrder
//      - nouvel etat gridOrder (liste d'identifiants), calcule UNE seule fois, au chargement du catalogue
//        (les mises a jour de stock ensuite changent les pastilles, jamais les positions)
//      - filteredProducts lit la liste ordonnee ; products n'est JAMAIS reordonne : le visuel d'en-tete et le bloc
//        Savoir-faire continuent de lire products[0] dans l'ordre de la base
//      - si le calcul echoue, la grille garde l'ordre de la base (le catalogue ne reste jamais bloque)
//
// Hors perimetre : quiz, favoris, panier, fiches (ils lisent products, inchange).
//
// Prerequis : le lot R1 est fusionne (lib/gridOrder.js existe).
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotR2-grille-aleatoire.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotR2-grille-aleatoire.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_GRID_ORDER_V2";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

// ---------- Prerequis : lot R1 applique ----------
const libPath = path.join(ROOT, "lib", "gridOrder.js");
if (!fs.existsSync(libPath)) stop("lib/gridOrder.js introuvable : le lot R1 doit etre applique et fusionne avant R2.");
const lib = fs.readFileSync(libPath, "utf8");
for (const fn of ["gridOrderIds", "applyIdOrder"]) {
  if (!new RegExp("export function " + fn + "\\(").test(lib)) stop("lib/gridOrder.js : la fonction exportee " + fn + " est introuvable.");
}

// ---------- pages/index.js ----------
const rel = "pages/index.js";
const file = path.join(ROOT, ...rel.split("/"));
if (!fs.existsSync(file)) stop(rel + " introuvable (lance le script depuis la racine du projet).");
const raw = fs.readFileSync(file, "utf8");
const crlf = (raw.match(/\r\n/g) || []).length;
const lf = (raw.match(/\n/g) || []).length - crlf;
if (crlf > 0 && lf > 0) stop(rel + " melange des fins de ligne CRLF et LF (" + crlf + " CRLF, " + lf + " LF) : je ne touche pas a un fichier dans cet etat.");
const eol = crlf > 0 ? "\r\n" : "\n";
const text = raw.replace(/\r\n/g, "\n");

if (text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans " + rel + " : lot deja applique.");

// Elements dont le code insere depend
if (!/import React, \{[^}]*\buseMemo\b[^}]*\} from "react";/.test(text)) stop("useMemo n'est pas importe depuis react dans " + rel + ".");
if (!/import \{[^}]*\bgetAvailability\b[^}]*\} from "@\/lib\/shopUtils";/.test(text)) stop("getAvailability n'est pas importe depuis @/lib/shopUtils dans " + rel + ".");

const EDITS = [
  {
    label: "import de gridOrder (apres l'import de shopUtils)",
    from: 'import { formatPrice, getAvailability, pieceStateMap, maxQtyFor, stockStateMap } from "@/lib/shopUtils"; // ZENORIA_STOCK_UI3_V1\n',
    to:
      'import { formatPrice, getAvailability, pieceStateMap, maxQtyFor, stockStateMap } from "@/lib/shopUtils"; // ZENORIA_STOCK_UI3_V1\n' +
      'import { gridOrderIds, applyIdOrder } from "@/lib/gridOrder"; // ' + MARK + "\n",
  },
  {
    label: "etat gridOrder (apres l'etat products)",
    from: "  const [products, setProducts] = useState([]);\n",
    to:
      "  const [products, setProducts] = useState([]);\n" +
      "  const [gridOrder, setGridOrder] = useState(null); // " + MARK + " : ordre (liste d'identifiants) de la grille, calcule une seule fois au chargement du catalogue\n",
  },
  {
    label: "calcul de l'ordre au chargement du catalogue",
    from: "      setProducts(loadedProducts);\n",
    to:
      "      setProducts(loadedProducts);\n" +
      "      // " + MARK + " : ordre de la grille « Nos créations », calculé UNE fois ici. Réglage par défaut (le réglage d'administration viendra au lot R3) :\n" +
      "      // aléatoire, renouvelé chaque jour à 3 h (heure de Paris), bagues commandables d'abord. Les mises à jour de stock faites ensuite\n" +
      "      // changent les pastilles, jamais les positions. products reste dans l'ordre de la base (visuel d'en-tête et Savoir-faire lisent products[0]).\n" +
      "      let gridIds = null;\n" +
      "      try {\n" +
      "        gridIds = gridOrderIds(loadedProducts, { setting: null, nowMs: Date.now(), isOrderable: (p) => getAvailability(p).orderable });\n" +
      "      } catch (e) {\n" +
      "        gridIds = null; // calcul impossible : la grille garde l'ordre de la base\n" +
      "      }\n" +
      "      setGridOrder(gridIds);\n",
  },
  {
    label: "filteredProducts lit la liste ordonnee",
    from: "  const filteredProducts = selectedFamily ? filterByFamily(products, families, selectedFamily) : products;\n",
    to:
      "  // " + MARK + " : seule la grille lit cette liste ordonnée ; products n'est jamais réordonné\n" +
      "  const gridProducts = useMemo(() => applyIdOrder(products, gridOrder), [products, gridOrder]);\n" +
      "  const filteredProducts = selectedFamily ? filterByFamily(gridProducts, families, selectedFamily) : gridProducts;\n",
  },
];

for (const e of EDITS) {
  const n = count(text, e.from);
  if (n !== 1) stop(rel + " : ancre « " + e.label + " » trouvee " + n + " fois (attendu : 1). Le fichier a change depuis l'audit.");
}
// Ordre dans le fichier : import < etat < chargement < filteredProducts
const pos = EDITS.map((e) => text.indexOf(e.from));
for (let i = 1; i < pos.length; i++) {
  if (!(pos[i - 1] < pos[i])) stop("l'ordre des ancres dans le fichier est inattendu (« " + EDITS[i - 1].label + " » doit preceder « " + EDITS[i].label + " »).");
}
// filteredProducts ne doit etre lu que par la grille : si d'autres usages sont apparus, on s'arrete
const usages = (text.match(/\bfilteredProducts\b/g) || []).length;
if (usages !== 5) stop("filteredProducts apparait " + usages + " fois dans " + rel + " (attendu : 5 : definition, compteur x2, test de liste vide, grille). Un nouvel usage est apparu : a verifier avant de modifier.");
// Aucun return anticipe dans le composant avant l'endroit ou le hook est place
const compStart = text.indexOf("export default function ZenoriaShop()");
if (compStart < 0 || compStart > pos[3]) stop("le composant ZenoriaShop est introuvable avant filteredProducts.");
const before = text.slice(compStart, pos[3]);
if (/^ {2}if \(.*\) return\b/m.test(before) || /^ {2}return\b/m.test(before)) stop("un return se trouve dans ZenoriaShop avant l'endroit du nouveau hook (useMemo) : a verifier.");

let next = text;
for (const e of EDITS) next = next.replace(e.from, () => e.to);
if (count(next, MARK) !== 4) stop("controle final : le marqueur devrait apparaitre 4 fois, il apparait " + count(next, MARK) + " fois.");
if (!next.includes("applyIdOrder(products, gridOrder)") || !next.includes("filterByFamily(gridProducts,")) stop("controle final en echec.");

console.log("Lot R2 - grille « Nos créations » dans un ordre aléatoire (réglage par défaut)");
console.log(" - fin de ligne detectee : " + (eol === "\r\n" ? "CRLF" : "LF"));
console.log(" - " + rel + " : " + text.split("\n").length + " -> " + next.split("\n").length + " lignes (+" + (next.split("\n").length - text.split("\n").length) + ")");

if (DRY) {
  console.log("\nDRY-RUN OK : toutes les ancres sont uniques, dans l'ordre attendu. Rien n'a ete ecrit.");
  process.exit(0);
}
fs.writeFileSync(file, eol === "\r\n" ? next.replace(/\n/g, "\r\n") : next, "utf8");
console.log("\nOK : fichier ecrit. Lance maintenant : npm run build");
