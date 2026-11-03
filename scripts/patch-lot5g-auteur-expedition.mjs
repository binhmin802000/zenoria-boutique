// patch-lot5g-auteur-expedition.mjs
// Lot 5g : l'auteur des expéditions et des livraisons est enregistré dans le journal des commandes. Sans SQL.
//
// pages/api/admin/orders/update-status.js : les deux écritures dans order_status_history (action « ship » et action « deliver »)
// ajoutent actor_email = e-mail du compte administrateur identifié par requireAdmin (celui du jeton de connexion).
//
//   - expédition : ligne « shipped » avec actor_email
//   - livraison  : ligne « delivered » avec actor_email
//
// Rien d'autre ne change : mêmes contrôles de sécurité, mêmes statuts, mêmes messages, même note.
// Les lignes déjà présentes dans le journal (13 expéditions, 9 livraisons) ne sont pas modifiées : elles restent sans auteur.
// Si le compte n'a pas d'e-mail, actor_email reste vide et l'historique affiche « Automatique ou non renseigné ».
//
// Usage :  node scripts/patch-lot5g-auteur-expedition.mjs --dry-run
//          node scripts/patch-lot5g-auteur-expedition.mjs --apply
// Marqueur : ZENORIA_ORDER_ACTOR_5G_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_ORDER_ACTOR_5G_V1";
const FILE = path.join(process.cwd(), "pages", "api", "admin", "orders", "update-status.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lot5g-auteur-expedition.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail("pages/api/admin/orders/update-status.js introuvable (lancez le script depuis la racine du projet).");

const raw = fs.readFileSync(FILE, "utf8");
const hasBom = raw.charCodeAt(0) === 0xfeff;
const crlf = raw.includes("\r\n");
console.log("pages/api/admin/orders/update-status.js (fins de ligne " + (crlf ? "Windows CRLF" : "LF") + ")");

let src = (hasBom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");
const linesBefore = src.split("\n").length;

if (src.includes(MARK)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
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
function once(needle, label) {
  const n = occurrences(src, needle);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
}
// Ajoute une ligne juste apres la ligne qui contient le morceau unique, avec la meme indentation
function afterLineSameIndent(needle, text, label) {
  once(needle, label);
  const idx = src.indexOf(needle);
  const lineStart = src.lastIndexOf("\n", idx) + 1;
  const eol = src.indexOf("\n", idx);
  const end = eol < 0 ? src.length : eol;
  const indent = src.slice(lineStart).match(/^[ \t]*/)[0];
  src = src.slice(0, end) + "\n" + indent + text + src.slice(end);
}

// ------------------------------------------------------------------
// Prérequis : la route identifie bien l'administratrice (requireAdmin renvoie l'utilisateur) et l'utilise
// ------------------------------------------------------------------
once("const admin = await requireAdmin(req, res);", "Appel de requireAdmin");
once("  return user;\n}", "Retour de requireAdmin (return user)");
if (occurrences(src, '.from("order_status_history").insert({') !== 2) fail("Ecritures dans order_status_history : 2 attendues, trouvees " + occurrences(src, '.from("order_status_history").insert({') + ".");
if (src.includes("actor_email")) fail("actor_email est deja present dans le fichier sans le marqueur : verifiez-le a la main.");

// ------------------------------------------------------------------
// 1. Expédition
// ------------------------------------------------------------------
afterLineSameIndent(
  'note: "Expédiée via " + carrier + ", suivi : " + trimmedTracking + ".",',
  "actor_email: admin.email || null, // " + MARK + " : auteur de l'expédition (compte administrateur connecté)",
  "Ecriture du journal (expedition)"
);

// ------------------------------------------------------------------
// 2. Livraison
// ------------------------------------------------------------------
afterLineSameIndent(
  'note: "Marquée comme livrée manuellement depuis l\'administration.",',
  "actor_email: admin.email || null, // " + MARK + " : auteur de la livraison (compte administrateur connecté)",
  "Ecriture du journal (livraison)"
);

// ------------------------------------------------------------------
// 3. Commentaire d'en-tête (une ligne)
// ------------------------------------------------------------------
once("// ZENORIA_API_ADMIN_ORDER_STATUS_V2", "Marqueur d'en-tete V2");
src = src.replace(
  "// ZENORIA_API_ADMIN_ORDER_STATUS_V2",
  () => "// ZENORIA_API_ADMIN_ORDER_STATUS_V2\n// " + MARK + " : l'auteur (e-mail de l'administratrice connectee) est enregistre dans order_status_history, pour l'expedition et la livraison."
);

// ------------------------------------------------------------------
// Contrôles finaux
// ------------------------------------------------------------------
if (occurrences(src, "actor_email: admin.email || null") !== 2) fail("actor_email : 2 ajouts attendus.");
if (occurrences(src, MARK) !== 3) fail("Marqueur : 3 occurrences attendues, trouve " + occurrences(src, MARK) + ".");
const after = src.split("\n").length;
if (after - linesBefore !== 3) fail("3 lignes ajoutees attendues, trouve " + (after - linesBefore) + ".");

const out = (hasBom ? "\uFEFF" : "") + (crlf ? src.replace(/\n/g, "\r\n") : src);
console.log("");
console.log("  1. expedition : actor_email dans le journal   OK");
console.log("  2. livraison  : actor_email dans le journal   OK");
console.log("  3. commentaire d'en-tete                      OK");
console.log("  Lignes : " + linesBefore + " -> " + after);

if (apply) {
  fs.writeFileSync(FILE, out, "utf8");
  console.log("\nEcrit : pages/api/admin/orders/update-status.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
