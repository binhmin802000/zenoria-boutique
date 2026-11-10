#!/usr/bin/env node
// ============================================================
// patch-install-button-vertical.mjs
// ZENORIA_INSTALL_BUTTON_VERTICAL_V1
//
// Remplace la disposition HORIZONTALE du bouton "Installer l'app"
// (icone + texte cote a cote, texte masque sous xl:) par une disposition
// VERTICALE (icone au-dessus, petit texte "Installer" en dessous, toujours
// visible). Objectif : garder le bouton visible et explicite sans elargir
// sa largeur horizontale (donc sans repousser le menu/Contact, cf. le
// correctif precedent ZENORIA_FIX_HEADER_OVERLAP_V1).
//
// Largeur du bouton globalement inchangee (w-9, comme une icone seule) ;
// seule sa HAUTEUR augmente legerement (h-12 au lieu de h-9), ce qui reste
// large sous la hauteur du header (h-20 = 80px).
//
// Usage : node scripts/patch-install-button-vertical.mjs
// Idempotent : si deja applique, ne fait rien. Si UNE SEULE ancre ne
// correspond pas EXACTEMENT, le script s'arrete SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_INSTALL_BUTTON_VERTICAL_V1";
const FILE = path.join(process.cwd(), "components", "InstallButton.js");

function fail(message) {
  console.error(`[patch-install-button-vertical] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-install-button-vertical] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

const FROM =
  '      className={\n' +
  '        "inline-flex items-center gap-1.5 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3.5 h-9 text-xs font-medium transition shadow-sm " +\n' +
  '        className\n' +
  '      }\n' +
  '    >\n' +
  '      <Download size={15} />\n' +
  '      <span className="hidden xl:inline">Installer l&apos;app</span> {/* ZENORIA_FIX_HEADER_OVERLAP_V1 : texte masqué entre sm: et xl:, pour laisser de la place au menu */}\n' +
  '    </button>\n';

const TO =
  '      className={\n' +
  '        "flex flex-col items-center justify-center gap-0.5 rounded-xl bg-[#8f6075] hover:bg-[#71485b] text-white w-12 h-12 text-[9px] leading-none font-medium transition shadow-sm " + // ' + MARK + '\n' +
  '        className\n' +
  '      }\n' +
  '    >\n' +
  '      <Download size={15} />\n' +
  '      <span>Installer</span> {/* ' + MARK + ' : disposition verticale, toujours visible, sans elargir la largeur */}\n' +
  '    </button>\n';

const count = content.split(FROM).length - 1;
if (count !== 1) {
  fail(
    `ancre introuvable (ou en double) : trouvée ${count} fois au lieu de 1. ` +
    `Fichier modifié depuis, ou texte différent de ce qui a été vérifié (le correctif ZENORIA_FIX_HEADER_OVERLAP_V1 ` +
    `doit déjà être appliqué avant de lancer ce script). Rien n'a été écrit.`
  );
}

const updated = content.replace(FROM, () => TO);

if (!updated.includes(MARK)) fail("contrôle final : le marqueur est absent après patch.");

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-install-button-vertical] components/InstallButton.js mis à jour :");
console.log("[patch-install-button-vertical]   - disposition verticale (icône + \"Installer\" en dessous), toujours visible");
console.log("[patch-install-button-vertical]   - largeur inchangée (w-12), seule la hauteur augmente légèrement (h-12)");
