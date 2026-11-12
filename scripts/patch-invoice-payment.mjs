// ============================================================
// PATCH — FACTURE PDF : « REGLEMENT » ET « PAYEE LE » — ZENORIA_INVOICE_PAYMENT_V1
//
// Modifie : lib/invoicePdf.js (uniquement). La route pages/api/invoice/[orderId].js n'a PAS besoin
// de changer : elle transmet deja toute la ligne de la facture (invoice) au generateur.
//
// Ajoute, sous « Emise le ... » dans l'en-tete de la facture :
//     Reglement : Virement bancaire        (ou « Carte bancaire »)
//     Payee le 12/11/2026
// Les valeurs viennent EXCLUSIVEMENT de l'instantane de la facture (colonnes payment_method et
// paid_at de la table invoices), jamais recalculees : une facture figee le reste. Une valeur absente
// s'affiche « A completer » en evidence (meme principe que les champs vendeur), jamais un blanc.
// L'en-tete ne change pas de hauteur : aucune incidence sur le reste de la mise en page.
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois, sur une ligne entiere, sinon rien n'est
// ecrit. Indentation et fins de ligne (CRLF/LF) du fichier reel conservees. Relancer est refuse.
//
// Usage : node scripts/patch-invoice-payment.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const TAG = "[patch-invoice-payment]";
const FILE = "lib/invoicePdf.js";
const MARKER = "ZENORIA_INVOICE_PAYMENT_V1";

// Reperes : une ligne entiere (sans son indentation, relevee dans le fichier reel).
const ANCHOR_DATE_LINE = 'page.drawText(dateTxt, { x: right - measure(regular, dateTxt, 9), y: y - 46, size: 9, font: regular, color: COLORS.muted });';
const ANCHOR_MEASURE_FN = "function measure(font, text, size) {";

const HELPERS = [
  "// " + MARKER + " : libelles et date du reglement, lus dans l'instantane de facture (colonnes payment_method et paid_at)",
  'const PAYMENT_METHOD_LABELS = { transfer: "Virement bancaire", card: "Carte bancaire" };',
  "export function paymentMethodLabel(value) {",
  '  const raw = typeof value === "string" ? value.trim() : "";',
  '  if (!raw) return "";',
  "  return PAYMENT_METHOD_LABELS[raw.toLowerCase()] || raw;",
  "}",
  "export function paymentDateText(value) {",
  '  if (!value) return "";',
  "  const d = new Date(value);",
  '  if (!Number.isFinite(d.getTime())) return "";',
  '  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });',
  "}",
];

const HEADER_LINES = [
  "// " + MARKER + " : mode de reglement et date de paiement (instantane de facture) ; valeur absente = « A completer » en evidence",
  "const drawPaymentLine = (label, value, lineY) => {",
  "  if (value) {",
  "    const t = label + value;",
  "    page.drawText(t, { x: right - measure(regular, t, 8.5), y: lineY, size: 8.5, font: regular, color: COLORS.muted });",
  "  } else {",
  '    const chipW = measure(regular, "À compléter", 8.5) + 10;',
  "    const labelW = measure(regular, label, 8.5);",
  "    const x0 = right - chipW - labelW;",
  "    page.drawText(label, { x: x0, y: lineY, size: 8.5, font: regular, color: COLORS.muted });",
  "    todoChip(page, regular, x0 + labelW, lineY, 8.5);",
  "  }",
  "};",
  'drawPaymentLine("Règlement : ", paymentMethodLabel(invoice.payment_method), y - 60);',
  'drawPaymentLine("Payée le ", paymentDateText(invoice.paid_at), y - 72);',
];

function occurrences(text, needle) {
  let n = 0;
  let i = text.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = text.indexOf(needle, i + needle.length);
  }
  return n;
}

// Localise une ligne entiere (hors indentation) : renvoie { lineStart, lineEnd, indent } ou { error }.
function locateLine(text, anchor, name) {
  const n = occurrences(text, anchor);
  if (n !== 1) return { error: 'repere "' + name + '" trouve ' + n + " fois (attendu : 1)" };
  const idx = text.indexOf(anchor);
  const lineStart = text.lastIndexOf("\n", idx) + 1;
  let lineEnd = text.indexOf("\n", idx);
  if (lineEnd === -1) lineEnd = text.length;
  const indent = text.slice(lineStart, idx);
  if (indent.trim() !== "") return { error: 'repere "' + name + '" n\'est pas en debut de ligne' };
  if (text.slice(idx + anchor.length, lineEnd).trim() !== "") return { error: 'repere "' + name + '" n\'occupe pas la ligne entiere' };
  return { lineStart, lineEnd, indent };
}

const full = path.join(process.cwd(), FILE);
if (!fs.existsSync(full)) {
  console.error(TAG + " " + FILE + " : fichier introuvable (lancer le script depuis le dossier du projet). RIEN n'a ete ecrit.");
  process.exit(1);
}
const raw = fs.readFileSync(full, "utf8");
const crlf = raw.includes("\r\n");
const text = raw.replace(/\r\n/g, "\n");

if (text.includes(MARKER)) {
  console.error(TAG + " deja applique (" + MARKER + " present). RIEN n'a ete ecrit.");
  process.exit(1);
}

const dateLine = locateLine(text, ANCHOR_DATE_LINE, "ligne « Emise le » de l'en-tete");
const measureLine = locateLine(text, ANCHOR_MEASURE_FN, "fonction measure");
const problems = [dateLine, measureLine].filter((l) => l.error).map((l) => l.error);
if (problems.length > 0) {
  console.error(TAG + " au moins un probleme, RIEN n'a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

// Insertion de la fin vers le debut du fichier : les positions deja relevees restent valables.
const indentBlock = (lines, indent) => lines.map((l) => (l === "" ? "" : indent + l)).join("\n");
let out = text;
const sorted = [
  { at: dateLine.lineEnd, insert: "\n" + indentBlock(HEADER_LINES, dateLine.indent) }, // apres la ligne « Emise le »
  { at: measureLine.lineStart, insert: indentBlock(HELPERS, measureLine.indent) + "\n" }, // avant la fonction measure
].sort((a, b) => b.at - a.at);
for (const s of sorted) out = out.slice(0, s.at) + s.insert + out.slice(s.at);

if (!out.includes(MARKER) || out === text) {
  console.error(TAG + " l'insertion n'a rien change. RIEN n'a ete ecrit.");
  process.exit(1);
}
fs.writeFileSync(full, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
