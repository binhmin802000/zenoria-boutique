// ============================================================
// Correctif lot 3 : apres un refus de blocage, la case « Piece unique »
// est remise dans son etat reel (celui de la base) dans la fiche.
// Marqueur : ZENORIA_PIECE_UNIQUE_RESET_V1
//
// Usage (depuis le dossier zenoria) :
//   node scripts\patch-piece-unique-reset.mjs --dry-run   (verification seule)
//   node scripts\patch-piece-unique-reset.mjs             (applique)
// ============================================================
import fs from "node:fs";
import { execSync } from "node:child_process";

const DRY = process.argv.includes("--dry-run");
const FILE = "pages/admin.js";
const MARK = "ZENORIA_PIECE_UNIQUE_RESET_V1";
const BRANCH = "piece-unique-admin";

const ok = (m) => console.log("  \u2713 " + m);
const ko = (m) => { console.error("  \u2717 " + m); process.exit(1); };

console.log("Correctif : remise a l'etat reel de la case Piece unique" + (DRY ? " (VERIFICATION SEULE)" : ""));

// 1. Branche
try {
  const b = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  if (b !== BRANCH) ko("branche actuelle : " + b + " (attendue : " + BRANCH + ")");
  ok("branche " + b);
} catch {
  ko("impossible de lire la branche git");
}

// 2. Fichier
if (!fs.existsSync(FILE)) ko(FILE + " introuvable (lance la commande depuis le dossier zenoria)");
const src = fs.readFileSync(FILE, "utf8");
ok(FILE + " lu (" + src.length + " caracteres)");

if (src.includes(MARK)) ko("correctif deja applique (marqueur " + MARK + " present)");
ok("correctif pas encore applique");

// 3. Prerequis
if (!/import \{[^}]*parsePieceLockError[^}]*\} from "@\/lib\/pieceLock"/.test(src)) ko("import de parsePieceLockError introuvable");
ok("parsePieceLockError est importe");
if (!src.includes("products.find((x) => x.id === productForm.id)")) ko("lecture de la liste products introuvable");
ok("la liste products est disponible dans la fonction d'enregistrement");

// 4. Point d'insertion : le bloc "if (result.error) {" qui contient pieceLockText(result.error.message)
const eol = src.includes("\r\n") ? "\r\n" : "\n";
const anchor = "pieceLockText(result.error.message)";
const first = src.indexOf(anchor);
if (first === -1) ko("appel " + anchor + " introuvable");
if (src.indexOf(anchor, first + 1) !== -1) ko(anchor + " trouve plusieurs fois (attendu : 1)");
ok(anchor + " trouve une seule fois");

const openTag = "if (result.error) {";
const open = src.lastIndexOf(openTag, first);
if (open === -1) ko("bloc " + openTag + " introuvable avant l'appel");
const between = src.slice(open, first);
if (between.length > 600 || (between.match(/if \(result\.error\) \{/g) || []).length !== 1) ko("structure inattendue entre le debut du bloc et l'appel");
const lineNo = src.slice(0, open).split("\n").length;
ok("bloc d'erreur de l'enregistrement trouve a la ligne " + lineNo);

const afterOpen = open + openTag.length;
const nl = src.slice(afterOpen).match(/^\r?\n/);
if (!nl) ko("retour a la ligne attendu apres " + openTag);
const insertAt = afterOpen + nl[0].length;
const lineStart = src.lastIndexOf("\n", open) + 1;
const indent = src.slice(lineStart, open).match(/^[ \t]*/)[0] + "  ";

const lines = [
  "// " + MARK + " : un refus de blocage n'a rien enregistre, la case reprend la valeur reelle de la base",
  "const lockInfo = parsePieceLockError(result.error.message);",
  "if (lockInfo && lockInfo.kind === \"locked\" && productForm.id) {",
  "  const persisted = products.find((x) => x.id === productForm.id);",
  "  if (persisted) setProductForm((f) => (f ? { ...f, is_unique: persisted.is_unique === true } : f));",
  "}",
];

const out = src.slice(0, insertAt) + lines.map((l) => indent + l + eol).join("") + src.slice(insertAt);

if (out === src) ko("aucune modification produite");
ok("insertion de " + lines.length + " lignes prevue");

if (DRY) {
  console.log("\nVERIFICATION TERMINEE : rien n'a ete modifie. Relance sans --dry-run pour appliquer.");
  process.exit(0);
}

fs.writeFileSync(FILE, out, "utf8");
ok(FILE + " modifie");
console.log("\nTERMINE. Verifie avec : git diff --stat");
