// ZENORIA - Liens vers la fiche produit : ouverture dans un nouvel onglet
// ============================================================
// S'applique aux deux liens crees precedemment dans compte.js :
//   - Mes commandes (nom du bijou)
//   - Mes favoris (nom du bijou)
// Ajoute target="_blank" rel="noopener noreferrer", pour que la cliente
// reste sur /compte au lieu d'etre redirigee vers l'accueil.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "compte.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

function countSubstring(haystack, needle) {
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

let text = original;

// --- Lien "Mes commandes" ---
const OLD_COMMANDES = '<a href={`/#bague=${encodeURIComponent(it.product.slug)}`} className="text-sm font-medium text-[#412f3b] truncate hover:underline block">{it.product_name}</a>';
const countCommandes = countSubstring(text, OLD_COMMANDES);
if (countCommandes !== 1) {
  fail(`lien Mes commandes : attendu 1 occurrence exacte, trouve ${countCommandes}.`);
}
const NEW_COMMANDES = '<a href={`/#bague=${encodeURIComponent(it.product.slug)}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#412f3b] truncate hover:underline block">{it.product_name}</a>';
text = text.replace(OLD_COMMANDES, NEW_COMMANDES);
console.log("OK repere : lien Mes commandes (nouvel onglet)");

// --- Lien "Mes favoris" ---
const OLD_FAVORIS = '<a href={`/#bague=${encodeURIComponent(p.slug)}`} className="font-serif text-base leading-tight truncate hover:underline block">{p.name}</a>';
const countFavoris = countSubstring(text, OLD_FAVORIS);
if (countFavoris !== 1) {
  fail(`lien Mes favoris : attendu 1 occurrence exacte, trouve ${countFavoris}.`);
}
const NEW_FAVORIS = '<a href={`/#bague=${encodeURIComponent(p.slug)}`} target="_blank" rel="noopener noreferrer" className="font-serif text-base leading-tight truncate hover:underline block">{p.name}</a>';
text = text.replace(OLD_FAVORIS, NEW_FAVORIS);
console.log("OK repere : lien Mes favoris (nouvel onglet)");

// Garde-fous finaux
if (countSubstring(text, 'target="_blank"') < 2) {
  fail(`garde-fou final : attendu au moins 2 occurrences de target="_blank", trouve ${countSubstring(text, 'target="_blank"')}.`);
}
if (countSubstring(text, "/#bague=") < 2) {
  fail("garde-fou final : au moins un des deux liens /#bague= a disparu.");
}

if (text === original) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");

if (dryRun) {
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}