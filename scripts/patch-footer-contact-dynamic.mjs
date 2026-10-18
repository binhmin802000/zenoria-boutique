// scripts/patch-footer-contact-dynamic.mjs
//
// Remplace le lien de contact e-mail code en dur (ajoute par
// add-footer-contact-email.mjs) par une lecture dynamique du reglage
// "contact" (variable contactSettings, chargee par
// patch-index-load-contact-setting.mjs) : e-mail, WhatsApp et Signal
// s'affichent desormais uniquement si actives ET renseignes dans
// /admin > Produits > Contenu du site.
//
// Prerequis, dans l'ordre :
//   1. setup-contact-settings.mjs (cree lib/contactSettings.js)
//   2. patch-index-load-contact-setting.mjs (charge contactSettings)
//   3. ce script (branche l'affichage du footer sur contactSettings)
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne du fichier ; peut etre relance sans effet.
//
// Usage : node scripts/patch-footer-contact-dynamic.mjs

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

if (raw.includes("footer-contact-whatsapp")) {
  console.log("✓ Rien à modifier : les canaux de contact dynamiques sont déjà en place.");
  process.exit(0);
}

if (!raw.includes("contactSettings")) {
  console.error("✗ La variable « contactSettings » est introuvable dans pages/index.js.");
  console.error("Exécutez d'abord node scripts/patch-index-load-contact-setting.mjs, puis relancez ce script.");
  process.exit(1);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const hardcodedEmailBlock =
  '            <div className="mt-4 pt-4 border-t border-white/10 text-sm">' + eol +
  "              <a" + eol +
  '                href="mailto:bagues.mandala@proton.me?subject=Question%20depuis%20le%20site%20Zenoria&body=Bonjour%2C%0D%0A%0D%0A"' + eol +
  '                data-testid="footer-contact-email"' + eol +
  '                className="flex items-center gap-2 hover:text-white underline-offset-2 hover:underline"' + eol +
  "              >" + eol +
  '                <Mail size={15} className="shrink-0" /> bagues.mandala@proton.me' + eol +
  "              </a>" + eol +
  "            </div>";

const count = countOccurrences(raw, hardcodedEmailBlock);
if (count !== 1) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error(`  • bloc e-mail codé en dur (add-footer-contact-email.mjs) attendu, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de pages/index.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const dynamicContactBlock =
  '            <div className="mt-4 pt-4 border-t border-white/10 text-sm space-y-2">' + eol +
  "              {contactSettings.email.enabled && contactSettings.email.value.trim() && (" + eol +
  "                <a" + eol +
  "                  href={buildMailtoLink(contactSettings.email.value)}" + eol +
  '                  data-testid="footer-contact-email"' + eol +
  '                  className="flex items-center gap-2 hover:text-white underline-offset-2 hover:underline"' + eol +
  "                >" + eol +
  '                  <Mail size={15} className="shrink-0" /> {contactSettings.email.value}' + eol +
  "                </a>" + eol +
  "              )}" + eol +
  "              {contactSettings.whatsapp.enabled && contactSettings.whatsapp.value.trim() && (" + eol +
  "                <a" + eol +
  "                  href={buildWhatsAppLink(contactSettings.whatsapp.value)}" + eol +
  '                  target="_blank"' + eol +
  '                  rel="noopener noreferrer"' + eol +
  '                  data-testid="footer-contact-whatsapp"' + eol +
  '                  className="flex items-center gap-2 hover:text-white underline-offset-2 hover:underline"' + eol +
  "                >" + eol +
  "                  WhatsApp" + eol +
  "                </a>" + eol +
  "              )}" + eol +
  "              {contactSettings.signal.enabled && contactSettings.signal.value.trim() && (" + eol +
  "                <a" + eol +
  "                  href={buildSignalLink(contactSettings.signal.value)}" + eol +
  '                  target="_blank"' + eol +
  '                  rel="noopener noreferrer"' + eol +
  '                  data-testid="footer-contact-signal"' + eol +
  '                  className="flex items-center gap-2 hover:text-white underline-offset-2 hover:underline"' + eol +
  "                >" + eol +
  "                  Signal" + eol +
  "                </a>" + eol +
  "              )}" + eol +
  "            </div>";

const out = raw.replace(hardcodedEmailBlock, dynamicContactBlock);
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : canaux de contact du footer rendus dynamiques`);
console.log("  • e-mail, WhatsApp, Signal affichés uniquement si activés ET renseignés dans l'admin");
console.log("  • s'appuie sur la variable contactSettings déjà chargée dans le composant");
console.log("\nTerminé.");
