// scripts/add-account-choice.mjs
//
// Chantier paiement, point 2 de la feuille de route : ajoute, dans le
// panier, un bloc visible UNIQUEMENT si la cliente n'est pas deja
// connectee (!user), juste avant la case a cocher CGV. Il propose deux
// choix clairs :
//   - Creer un compte Zenoria (ouvre AuthModal, reutilise le mecanisme
//     deja existant pour "Connexion / Creer un compte")
//   - Continuer sans compte (aucune action : le parcours invite deja en
//     place continue de fonctionner tel quel)
//
// IMPORTANT : la mention "nouveautes / nouvelles collections" est
// volontairement absente du texte ci-dessous, tant que le domaine et
// Resend (chantier 7) ne sont pas prets : on ne promet pas un envoi
// d'e-mails marketing qu'on ne peut pas encore tenir. A completer plus
// tard, une fois ce chantier livre.
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/add-account-choice.mjs

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

if (raw.includes("account-choice-block")) {
  console.log("✓ Rien à modifier : le choix compte/invité est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const needle =
  '                    <label className="flex items-start gap-2 text-[12px] text-[#54434c] leading-5">' + eol +
  '                      <input' + eol +
  '                        type="checkbox"' + eol +
  "                        checked={cgvAccepted}" + eol +
  '                        onChange={(e) => { setCgvAccepted(e.target.checked); setCheckoutError(""); }}' + eol +
  '                        data-testid="cgv-checkbox"';

const count = countOccurrences(raw, needle);
if (count !== 1) {
  console.error(`✗ 1 repère à adapter — aucun fichier n'a été modifié.\n`);
  console.error(`  • début de la case CGV attendu, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de pages/index.js et collez-moi les lignes concernées.");
  process.exit(1);
}

if (!raw.includes("const [user, setUser] = useState(null);")) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error("  • déclaration de l'état « user » introuvable (const [user, setUser] = useState(null);)");
  process.exit(1);
}

const accountChoiceBlock =
  '                    {!user && (' + eol +
  '                      <div data-testid="account-choice-block" className="rounded-xl bg-[#faf6f8] border border-[#eadfe4] px-3.5 py-3 text-[12px] text-[#54434c] leading-5">' + eol +
  '                        <p className="mb-2">Vous avez deux choix pour cette commande :</p>' + eol +
  '                        <ul className="list-disc pl-4 space-y-1 mb-2.5">' + eol +
  '                          <li><strong>Créer un compte Zenoria</strong>, pour retrouver facilement vos commandes et être informée en avant-première de nos nouvelles collections.</li>' + eol +
  '                          <li><strong>Continuer sans compte</strong>, en renseignant simplement vos informations de livraison.</li>' + eol +
  '                        </ul>' + eol +
  '                        <button' + eol +
  '                          type="button"' + eol +
  '                          onClick={() => setAuthModalOpen(true)}' + eol +
  '                          data-testid="account-choice-login"' + eol +
  '                          className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white px-4 h-8 text-xs font-medium transition"' + eol +
  '                        >' + eol +
  '                          Se connecter / Créer un compte' + eol +
  '                        </button>' + eol +
  '                      </div>' + eol +
  '                    )}' + eol +
  eol;

const updated = raw.replace(needle, accountChoiceBlock + needle);
fs.writeFileSync(filePath, updated, "utf8");

console.log(`✓ ${filePath} : bloc de choix compte/invité ajouté, juste avant la case CGV.`);
console.log("\nTerminé.");
