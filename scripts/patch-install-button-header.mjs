#!/usr/bin/env node
// ============================================================
// patch-install-button-header.mjs
// ZENORIA_INSTALL_BUTTON_V1
//
// Ajoute le bouton d'installation de l'application (components/InstallButton.js)
// dans le header partagé (components/SiteHeader.js), en premiere position du
// groupe d'icones a droite (avant la recherche/le compte), pour qu'il soit bien
// visible sur toutes les pages qui utilisent SiteHeader.
//
// Le bouton lui-meme (InstallButton.js) gere sa propre visibilite : il reste
// invisible tant que le navigateur ne confirme pas que l'installation est
// possible (jamais de bouton inutile sur iOS/Safari, ou si deja installe).
//
// Usage : node scripts/patch-install-button-header.mjs
// Idempotent : si deja applique, ne fait rien. Si une ancre ne correspond pas
// EXACTEMENT, le script s'arrete SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_INSTALL_BUTTON_V1";
const FILE = path.join(process.cwd(), "components", "SiteHeader.js");

function fail(message) {
  console.error(`[patch-install-button-header] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
}

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-install-button-header] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

// ------------------------------------------------------------
// 1) Import du composant, juste après l'import de CrystalLogo
// ------------------------------------------------------------
const importAnchor = 'import CrystalLogo from "@/components/CrystalLogo";\n';
const importCount = content.split(importAnchor).length - 1;
if (importCount !== 1) {
  fail(`ancre d'import (CrystalLogo) trouvée ${importCount} fois au lieu de 1. Fichier modifié depuis ? Rien n'a été écrit.`);
}
const importReplacement =
  importAnchor +
  'import InstallButton from "@/components/InstallButton"; // ' + MARK + '\n';

// ------------------------------------------------------------
// 2) Insertion du bouton, en premiere position du groupe d'icones a droite
// ------------------------------------------------------------
const groupAnchor =
  '        <div className="flex items-center gap-2">\n' +
  '          {showSearch && (\n';
const groupCount = content.split(groupAnchor).length - 1;
if (groupCount !== 1) {
  fail(`ancre du groupe d'icônes (avant showSearch) trouvée ${groupCount} fois au lieu de 1. Fichier modifié depuis ? Rien n'a été écrit.`);
}
const groupReplacement =
  '        <div className="flex items-center gap-2">\n' +
  '          {/* ' + MARK + ' : mis en évidence, première position pour une bonne visibilité */}\n' +
  '          <InstallButton />\n' +
  '          {showSearch && (\n';

// ------------------------------------------------------------
// Application
// ------------------------------------------------------------
let updated = content.replace(importAnchor, () => importReplacement);
updated = updated.replace(groupAnchor, () => groupReplacement);

if (updated.split('<InstallButton />').length - 1 !== 1) {
  fail("contrôle final : <InstallButton /> devrait apparaître exactement 1 fois après patch. Rien n'a été écrit.");
}

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-install-button-header] components/SiteHeader.js mis à jour :");
console.log("[patch-install-button-header]   - import de InstallButton ajouté");
console.log("[patch-install-button-header]   - <InstallButton /> inséré en première position du groupe d'icônes à droite");
console.log("[patch-install-button-header] Rappel : copier aussi components/InstallButton.js avant de lancer ce script.");
