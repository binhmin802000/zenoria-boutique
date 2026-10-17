// scripts/fix-account-choice-compact.mjs
//
// Corrige DEUX problemes lies au chantier "choix compte/invite" :
//
//   1. REGRESSION : pickCartDensity() ne tenait pas compte de la hauteur
//      ajoutee par le bloc de choix compte/invite ni par la case CGV.
//      Resultat observe : la liste des articles du panier se retrouvait
//      compressee/tronquee, meme avec un seul article. Ce script ajoute
//      ces deux hauteurs a extraHeight, selon la meme convention deja
//      utilisee dans le fichier (incrementaux en dur, pas une mesure
//      dynamique - c'est deja comme ca pour promoOpen/cartNotice/quizReturn).
//
//   2. DESIGN : remplace le bloc verbeux (encart avec puces, un seul
//      bouton) par une ligne compacte a trois intentions clairement
//      separees :
//        - Se connecter (ouvre AuthModal en mode "login")
//        - Créer un compte (ouvre AuthModal en mode "signup")
//        - Continuer sans compte (aucune action, texte informatif)
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne du fichier ; peut etre relance sans effet.
//
// Usage : node scripts/fix-account-choice-compact.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "index.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

// ---------------------------------------------------------------------
// Idempotence globale
// ---------------------------------------------------------------------
const alreadyDone =
  raw.includes("account-choice-line") &&
  raw.includes("(!user ? 24 : 0) + 44");

if (alreadyDone) {
  console.log("✓ Rien à modifier : la correction est déjà en place.");
  process.exit(0);
}

// ---------------------------------------------------------------------
// Repère 1 : l'appel à pickCartDensity
// ---------------------------------------------------------------------
const densityNeedle =
  "  const cartDensity = pickCartDensity(" + eol +
  "    cartLines.length," + eol +
  "    viewportH," + eol +
  '    (promoOpen && !promo ? 44 : 0) + (cartNotice ? 44 : 0) + (quizReturn ? 56 : 0)' + eol +
  "  );";

// ---------------------------------------------------------------------
// Repère 2 : le bloc verbeux complet, tel qu'ajouté par
// add-account-choice.mjs (de "{!user && (" jusqu'à la ligne vide qui suit
// la fermeture ")}").
// ---------------------------------------------------------------------
const verboseBlockNeedle =
  "                    {!user && (" + eol +
  '                      <div data-testid="account-choice-block" className="rounded-xl bg-[#faf6f8] border border-[#eadfe4] px-3.5 py-3 text-[12px] text-[#54434c] leading-5">' + eol +
  '                        <p className="mb-2">Vous avez deux choix pour cette commande :</p>' + eol +
  '                        <ul className="list-disc pl-4 space-y-1 mb-2.5">' + eol +
  '                          <li><strong>Créer un compte Zenoria</strong>, pour retrouver facilement vos commandes et être informée en avant-première de nos nouvelles collections.</li>' + eol +
  '                          <li><strong>Continuer sans compte</strong>, en renseignant simplement vos informations de livraison.</li>' + eol +
  "                        </ul>" + eol +
  "                        <button" + eol +
  '                          type="button"' + eol +
  "                          onClick={() => setAuthModalOpen(true)}" + eol +
  '                          data-testid="account-choice-login"' + eol +
  '                          className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white px-4 h-8 text-xs font-medium transition"' + eol +
  "                        >" + eol +
  "                          Se connecter / Créer un compte" + eol +
  "                        </button>" + eol +
  "                      </div>" + eol +
  "                    )}" + eol +
  eol;

// ---------------------------------------------------------------------
// Vérification des deux repères
// ---------------------------------------------------------------------
const missing = [];

const densityCount = countOccurrences(raw, densityNeedle);
if (densityCount !== 1) {
  missing.push({ key: "appel à pickCartDensity()", count: densityCount });
}

const verboseCount = countOccurrences(raw, verboseBlockNeedle);
if (verboseCount !== 1) {
  missing.push({ key: "bloc verbeux « account-choice-block »", count: verboseCount });
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • ${m.key} (${m.count} correspondance(s) trouvée(s), 1 attendue)`);
  }
  console.error("\nVérifiez le contenu actuel de pages/index.js et collez-moi les lignes concernées.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// Remplacement 1 : pickCartDensity, avec les 2 nouvelles hauteurs
// ---------------------------------------------------------------------
const densityReplacement =
  "  const cartDensity = pickCartDensity(" + eol +
  "    cartLines.length," + eol +
  "    viewportH," + eol +
  "    (promoOpen && !promo ? 44 : 0) + (cartNotice ? 44 : 0) + (quizReturn ? 56 : 0) + (!user ? 24 : 0) + 44" + eol +
  "  );";

let out = raw.replace(densityNeedle, densityReplacement);

// ---------------------------------------------------------------------
// Remplacement 2 : ligne compacte, 3 intentions claires
// ---------------------------------------------------------------------
const compactReplacement =
  "                    {!user && (" + eol +
  '                      <p data-testid="account-choice-line" className="text-[12px] text-[#70656a] leading-5">' + eol +
  "                        Déjà cliente ?{\" \"}" + eol +
  "                        <button" + eol +
  '                          type="button"' + eol +
  '                          onClick={() => { setAuthModalMode("login"); setAuthModalOpen(true); }}' + eol +
  '                          data-testid="account-choice-login"' + eol +
  '                          className="underline text-[#8f6075]"' + eol +
  "                        >" + eol +
  "                          Se connecter" + eol +
  "                        </button>" + eol +
  "                        {\" \"}·{\" \"}Nouvelle ?{\" \"}" + eol +
  "                        <button" + eol +
  '                          type="button"' + eol +
  '                          onClick={() => { setAuthModalMode("signup"); setAuthModalOpen(true); }}' + eol +
  '                          data-testid="account-choice-signup"' + eol +
  '                          className="underline text-[#8f6075]"' + eol +
  "                        >" + eol +
  "                          Créer un compte" + eol +
  "                        </button>" + eol +
  "                        {\" \"}(facultatif, vous pouvez continuer sans)" + eol +
  "                      </p>" + eol +
  "                    )}" + eol +
  eol;

out = out.replace(verboseBlockNeedle, compactReplacement);

// ---------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : 2 correction(s) appliquée(s)`);
console.log("  • pickCartDensity() tient désormais compte de la case CGV et du bloc compte/invité");
console.log("  • bloc verbeux remplacé par une ligne compacte (Se connecter · Créer un compte · continuer sans)");
console.log("\nTerminé.");
