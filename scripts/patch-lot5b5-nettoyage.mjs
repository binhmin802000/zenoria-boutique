// patch-lot5b5-nettoyage.mjs
// Lot 5b5 : nettoyage de components/AdminCrm.js, SANS changement visible ni fonctionnel.
//
//   1. imports regroupés en tête de fichier (downloadInvoiceAdmin n'est plus entre deux imports)
//   2. calcul « stats » d'AdminOrders supprimé (plus utilisé depuis le retrait des 4 cartes au lot 5b3)
//   3. commentaire d'en-tête d'AdminOrders corrigé (« LECTURE SEULE » est faux)
//   4. variables inutilisées waitingTransfer et toShip supprimées
//
// Usage :  node scripts/patch-lot5b5-nettoyage.mjs --dry-run
//          node scripts/patch-lot5b5-nettoyage.mjs --apply
// Marqueur : ZENORIA_ORDERS_5B5_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_ORDERS_5B5_V1";
const FILE = path.join(process.cwd(), "components", "AdminCrm.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lot5b5-nettoyage.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail("components/AdminCrm.js introuvable (lancez le script depuis la racine du projet).");

const raw = fs.readFileSync(FILE, "utf8");
const hasBom = raw.charCodeAt(0) === 0xfeff;
const crlf = raw.includes("\r\n");
console.log("components/AdminCrm.js (fins de ligne " + (crlf ? "Windows CRLF" : "LF") + ")");

let src = (hasBom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");
const linesBefore = src.split("\n").length;

if (src.includes(MARK)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}

function count(re) {
  const m = src.match(re);
  return m ? m.length : 0;
}
function exactlyOnce(re, label) {
  const n = count(re);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
}

// ------------------------------------------------------------------
// 1. Imports regroupés
// ------------------------------------------------------------------
const reAnchor = /^import \{ parseBankTransfer, BANK_TRANSFER_KEY[^\n]*\n/m;
const reOrderDisplay = /^import \{ orderStatusInfo, formatOrderPrice, formatOrderReference \} from "@\/lib\/orderDisplay";[^\n]*\n/m;
const reDates = /^import \{ parisDay, parisDayDiff, addDaysToParisDay \} from "@\/lib\/dates";[^\n]*\n/m;
exactlyOnce(reAnchor, "Import lib/paymentSettings (point d'insertion)");
exactlyOnce(reOrderDisplay, "Import lib/orderDisplay");
exactlyOnce(reDates, "Import lib/dates");

const lineOrderDisplay = src.match(reOrderDisplay)[0];
const lineDates = src.match(reDates)[0];
src = src.replace(reOrderDisplay, "").replace(reDates, "");
src = src.replace(
  reAnchor,
  (anchor) => anchor + "// " + MARK + " : imports regroupés en tête de fichier\n" + lineOrderDisplay + lineDates
);

// ------------------------------------------------------------------
// 2. Calcul « stats » d'AdminOrders (le « stats » de CrmAccounts n'est pas touché)
// ------------------------------------------------------------------
const adminStart = src.indexOf("export function AdminOrders()");
if (adminStart < 0) fail("export function AdminOrders() introuvable.");
const before = src.slice(0, adminStart);
let admin = src.slice(adminStart);

const reStats = /\n[ \t]*const stats = useMemo\(\(\) => \{\n[ \t]*const paid = filteredOrders[\s\S]*?\}, \[filteredOrders\]\);\n/;
if ((admin.match(new RegExp(reStats.source, "g")) || []).length !== 1) fail("Bloc « const stats = useMemo » d'AdminOrders : introuvable ou ambigu.");
admin = admin.replace(reStats, "\n");
if (/\bstats\b/.test(admin)) fail("« stats » est encore reference dans AdminOrders : suppression annulee par securite.");

// ------------------------------------------------------------------
// 4. Variables inutilisées : on verifie qu'elles ne sont definies qu'une fois et jamais lues
// ------------------------------------------------------------------
for (const name of ["waitingTransfer", "toShip"]) {
  const total = (admin.match(new RegExp("\\b" + name + "\\b", "g")) || []).length;
  if (total !== 1) fail("« " + name + " » apparait " + total + " fois dans AdminOrders (attendu : 1, la definition seule). Suppression annulee.");
  const reLine = new RegExp("^[ \\t]*const " + name + " = [^\\n]*\\n", "m");
  if (!reLine.test(admin)) fail("Ligne de definition de « " + name + " » introuvable.");
  admin = admin.replace(reLine, "");
}
src = before + admin;

// ------------------------------------------------------------------
// 3. Commentaire d'en-tête d'AdminOrders
// ------------------------------------------------------------------
const reHeader = /\/\/ LECTURE SEULE[^\n]*\n\/\/ sont cr[^\n]*\n\/\/ \(pages\/api\/webhooks\/stripe\.js\)[^\n]*\n/;
if ((src.match(new RegExp(reHeader.source, "g")) || []).length !== 1) fail("Commentaire « LECTURE SEULE » : introuvable ou ambigu.");
src = src.replace(
  reHeader,
  "// " + MARK + " : commentaire mis à jour (l'écran n'est plus en lecture seule).\n" +
    "// Les commandes par carte sont créées automatiquement par le webhook de paiement Stripe\n" +
    "// (pages/api/webhooks/stripe.js), jamais à la main. Depuis cet écran, l'administration peut :\n" +
    "//  - pour un virement : confirmer l'encaissement, prolonger l'échéance ou annuler (TransferPanel) ;\n" +
    "//  - pour une commande payée : la marquer expédiée ou livrée, et télécharger la facture.\n"
);

// ------------------------------------------------------------------
// Contrôles finaux
// ------------------------------------------------------------------
const lines = src.split("\n");
const lastImport = lines.map((l, i) => (/^import /.test(l) ? i : -1)).filter((i) => i >= 0).pop();
const fnLine = lines.findIndex((l) => /^async function downloadInvoiceAdmin\(/.test(l));
if (fnLine < 0) fail("downloadInvoiceAdmin introuvable apres modification.");
if (lastImport > fnLine) fail("Un import reste apres downloadInvoiceAdmin.");
if (count(/\buseMemo\b/g) < 3) fail("useMemo n'est plus utilise assez : verifiez l'import.");
if (count(/@\/lib\/orderDisplay/g) !== 1 || count(/@\/lib\/dates/g) !== 1) fail("Import duplique ou manquant apres modification.");

const out = (hasBom ? "\uFEFF" : "") + (crlf ? src.replace(/\n/g, "\r\n") : src);
console.log("");
console.log("  1. imports regroupes en tete (orderDisplay, dates)   OK");
console.log("  2. calcul « stats » d'AdminOrders supprime            OK");
console.log("  3. commentaire d'en-tete d'AdminOrders corrige        OK");
console.log("  4. waitingTransfer et toShip supprimes                OK");
console.log("  Lignes : " + linesBefore + " -> " + lines.length);

if (apply) {
  fs.writeFileSync(FILE, out, "utf8");
  console.log("\nEcrit : components/AdminCrm.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
