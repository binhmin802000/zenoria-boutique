// ZENORIA - Lot 3a (virement) : choix du moyen de paiement (Carte / Virement)
// ============================================================
// Ce script modifie UNIQUEMENT pages/index.js, et seulement si TOUS les
// controles reussissent. Si un seul echoue, AUCUNE ecriture n'est faite.
//
// Ajoute :
//   - l'etat paymentMethod ("card" par defaut)
//   - deux boutons de selection visuelle juste avant le recapitulatif
//     du total (Carte bancaire / Virement bancaire)
//   - garde-fou de connexion : si virement choisi sans compte, message
//     explicite + liens connexion/creation (pas de blocage silencieux)
//
// Ne touche ni a handleCheckout, ni a la case CGV, ni au bouton
// "Commander" (ce sera l'etape 3d).
//
// Usage :
//   node scripts/patch-virement-choix-paiement.mjs --dry-run
//   node scripts/patch-virement-choix-paiement.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "index.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");
const hasCRLF = /\r\n/.test(original);
const EOL = hasCRLF ? "\r\n" : "\n";

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

function linesContaining(lines, needle) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  return idxs;
}

function requireUnique(idxs, label, needle) {
  if (idxs.length !== 1) {
    fail(`${label} : attendu 1 occurrence de ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  }
  return idxs[0];
}

let lines = original.split(/\r\n|\n/);

// ------------------------------------------------------------
// A — Etat paymentMethod, juste apres l'etat cgvAccepted
// ------------------------------------------------------------
const STATE_ANCHOR = 'const [cgvAccepted, setCgvAccepted] = useState(false);';
const stateIdx = requireUnique(linesContaining(lines, STATE_ANCHOR), "etat cgvAccepted (ancre)", STATE_ANCHOR);
lines = [
  ...lines.slice(0, stateIdx + 1),
  '  const [paymentMethod, setPaymentMethod] = useState("card");',
  ...lines.slice(stateIdx + 1),
];
console.log("OK repere : etat paymentMethod ajoute");

// ------------------------------------------------------------
// B — Boutons de selection + garde-fou connexion, juste avant le
//     bloc {!user && (...)} existant (compte facultatif pour la carte)
// ------------------------------------------------------------
const INSERT_ANCHOR = '{!user && (';
const NEXT_LINE_CHECK = 'account-choice-line';
const anchorCandidates = linesContaining(lines, INSERT_ANCHOR);
const anchorMatches = anchorCandidates.filter((idx) => {
  for (let i = idx; i < Math.min(lines.length, idx + 3); i++) {
    if (lines[i].includes(NEXT_LINE_CHECK)) return true;
  }
  return false;
});
const anchorIdx = requireUnique(anchorMatches, "bloc {!user && (...)} du panier (ancre d'insertion, verifiee par account-choice-line)", INSERT_ANCHOR);
const indentMatch = lines[anchorIdx].match(/^(\s*)/);
const indent = indentMatch ? indentMatch[1] : "                    ";

const newBlockLines = [
  `${indent}<div data-testid="payment-method-choice" className="space-y-2">`,
  `${indent}  <div className="text-[13px] font-medium text-[#412f3b]">Moyen de paiement</div>`,
  `${indent}  <div className="grid grid-cols-2 gap-2">`,
  `${indent}    <button`,
  `${indent}      type="button"`,
  `${indent}      onClick={() => { setPaymentMethod("card"); setCheckoutError(""); }}`,
  `${indent}      data-testid="payment-method-card"`,
  `${indent}      className={\`rounded-xl border px-3 py-2 text-sm text-left transition \${paymentMethod === "card" ? "border-[#8f6075] bg-[#f5edf1] text-[#412f3b]" : "border-[#d9c5cc] text-[#70656a] hover:bg-[#fbf7f9]"}\`}`,
  `${indent}    >`,
  `${indent}      Carte bancaire`,
  `${indent}      <div className="text-[11px] text-[#8b737e] mt-0.5">Paiement immédiat et sécurisé</div>`,
  `${indent}    </button>`,
  `${indent}    <button`,
  `${indent}      type="button"`,
  `${indent}      onClick={() => { setPaymentMethod("transfer"); setCheckoutError(""); }}`,
  `${indent}      data-testid="payment-method-transfer"`,
  `${indent}      className={\`rounded-xl border px-3 py-2 text-sm text-left transition \${paymentMethod === "transfer" ? "border-[#8f6075] bg-[#f5edf1] text-[#412f3b]" : "border-[#d9c5cc] text-[#70656a] hover:bg-[#fbf7f9]"}\`}`,
  `${indent}    >`,
  `${indent}      Virement bancaire`,
  `${indent}      <div className="text-[11px] text-[#8b737e] mt-0.5">Commande réservée, à régler sous 3 jours</div>`,
  `${indent}    </button>`,
  `${indent}  </div>`,
  `${indent}  {paymentMethod === "transfer" && !user && (`,
  `${indent}    <div data-testid="transfer-auth-required" className="rounded-xl bg-[#fbf7f9] border border-[#eee2e5] px-3 py-2.5 text-[12px] text-[#54434c] leading-5">`,
  `${indent}      Un compte Zenoria est nécessaire pour le virement. Il vous permet de retrouver les coordonnées bancaires, votre référence et le suivi de votre commande.`,
  `${indent}      <div className="mt-1.5 flex items-center gap-2">`,
  `${indent}        <button type="button" onClick={() => { setAuthModalMode("login"); setAuthModalOpen(true); }} data-testid="transfer-auth-login" className="underline text-[#8f6075]">Me connecter</button>`,
  `${indent}        <span>·</span>`,
  `${indent}        <button type="button" onClick={() => { setAuthModalMode("signup"); setAuthModalOpen(true); }} data-testid="transfer-auth-signup" className="underline text-[#8f6075]">Créer mon compte</button>`,
  `${indent}        <span>·</span>`,
  `${indent}        <button type="button" onClick={() => setPaymentMethod("card")} data-testid="transfer-auth-back-card" className="underline text-[#8f6075]">Choisir la carte</button>`,
  `${indent}      </div>`,
  `${indent}    </div>`,
  `${indent}  )}`,
  `${indent}</div>`,
  "",
];

lines = [
  ...lines.slice(0, anchorIdx),
  ...newBlockLines,
  ...lines.slice(anchorIdx),
];
console.log("OK repere : boutons de selection + garde-fou connexion inseres");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, "paymentMethod") < 3) {
  fail(`garde-fou final : attendu au moins 3 occurrences de "paymentMethod", trouve ${countSubstring(text, "paymentMethod")}.`);
}
if (countSubstring(text, 'data-testid="payment-method-card"') !== 1) fail("garde-fou final : bouton carte absent ou en double.");
if (countSubstring(text, 'data-testid="payment-method-transfer"') !== 1) fail("garde-fou final : bouton virement absent ou en double.");
if (countSubstring(text, 'data-testid="transfer-auth-required"') !== 1) fail("garde-fou final : garde-fou de connexion absent ou en double.");
if (countSubstring(text, '{!user && (') !== 2) fail(`garde-fou final : attendu exactement 2 occurrences de "{!user && (" (panier + menu mobile), trouve ${countSubstring(text, '{!user && (')}.`);
if (countSubstring(text, 'data-testid="cgv-checkbox"') !== 1) fail("garde-fou final : la case CGV a disparu (ne doit pas etre touchee a cette etape).");
if (countSubstring(text, 'data-testid="checkout-button"') !== 1) fail("garde-fou final : le bouton Commander a disparu (ne doit pas etre touche a cette etape).");
console.log("OK garde-fou : etat, boutons et garde-fou de connexion presents, blocs existants intacts");

// ------------------------------------------------------------
// Resultat
// ------------------------------------------------------------
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