// ZENORIA - Lot 3a : correctif de la ligne "Paiement securise via Stripe."
// Corrige l'accolade JSX orpheline dans la branche d'un ternaire.
// Usage : node scripts/fix-stripe-ternaire.mjs --dry-run | --apply
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) { console.error("Utilisez --dry-run ou --apply."); process.exit(2); }

const file = path.join(process.cwd(), "pages", "index.js");
if (!fs.existsSync(file)) { console.error(`Fichier introuvable : ${file}`); process.exit(1); }
const original = fs.readFileSync(file, "utf8");
const fail = (m) => { console.error(`ECHEC : ${m}\nAucune modification n'a ete ecrite.`); process.exit(1); };

// Deja corrige ?
if (/paymentMethod === "card" \? <p className="text-\[11px\] text-center text-\[#7e7378\]">Paiement sécurisé via Stripe\.<\/p> : null/.test(original)) {
  console.log("Deja corrige : rien a faire."); process.exit(0);
}

const re = /\{paymentMethod === "card" && (<p className="text-\[11px\] text-center text-\[#7e7378\]">Paiement sécurisé via Stripe\.<\/p>)\}/g;
const matches = original.match(re) || [];
if (matches.length !== 1) fail(`attendu 1 occurrence de la ligne a corriger, trouve ${matches.length}.`);

// Verifie qu'elle est bien dans la branche finale d'un ternaire : ") : (" avant, ")}" apres.
const idx = original.indexOf(matches[0]);
const before = original.slice(Math.max(0, idx - 80), idx);
const after = original.slice(idx + matches[0].length, idx + matches[0].length + 60);
if (!/\)\s*:\s*\(\s*$/.test(before)) fail("la ligne n'est pas precedee de \") : (\" : structure inattendue.");
if (!/^\s*\)\}/.test(after)) fail("la ligne n'est pas suivie de \")}\" : structure inattendue.");

const text = original.replace(re, 'paymentMethod === "card" ? $1 : null');
if (text === original) fail("aucune modification produite.");
if ((text.match(/Paiement sécurisé via Stripe/g) || []).length !== 1) fail("garde-fou final : texte Stripe absent ou en double.");

console.log("OK repere : ligne Stripe localisee dans la branche finale du ternaire");
console.log("OK garde-fou : une seule occurrence, structure ') : (' ... ')}' conservee");
console.log(`\nMode : ${dryRun ? "DRY-RUN" : "APPLY"}\nTous les controles sont conformes.`);
if (dryRun) console.log("VERIFICATION SEULE : aucun fichier modifie.");
else { fs.writeFileSync(file, text, "utf8"); console.log("Fichier modifie : pages\\index.js"); }
