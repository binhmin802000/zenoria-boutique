#!/usr/bin/env node
// ============================================================
// patch-fix-header-overlap.mjs
// ZENORIA_FIX_HEADER_OVERLAP_V1
//
// Corrige le chevauchement du bouton "Installer l'app" avec le lien
// "Contact" (et le resserrement du logo/menu) sur les largeurs d'ecran
// intermediaires (environ 1024-1280px), apparu avec l'ajout du bouton
// d'installation PWA.
//
// Cause : le menu horizontal (<nav>) n'apparait qu'a partir de lg: (1024px).
// Le conteneur du header utilise justify-between entre 3 blocs (logo | nav |
// icones) : des que le bloc icones s'elargit (texte "Installer l'app"
// visible des sm: = 640px), l'espace se redistribue et rapproche le menu du
// logo, jusqu'a chevaucher "Contact".
//
// Correctifs (2 fichiers) :
//   1. components/InstallButton.js : le texte du bouton n'apparait plus
//      qu'a partir de xl: (1280px) au lieu de sm: (640px). En dessous,
//      seule l'icone est visible (bouton plus etroit).
//   2. components/SiteHeader.js : l'espacement du menu (<nav>) est resserre
//      entre lg: et xl: (gap-4 au lieu de gap-7), pour laisser de la place
//      supplementaire a cette largeur intermediaire. A partir de xl:,
//      l'espacement d'origine (gap-7) est retabli.
//
// Usage : node scripts/patch-fix-header-overlap.mjs
// Idempotent : si deja applique, ne fait rien. Si UNE SEULE ancre ne
// correspond pas EXACTEMENT, le script s'arrete SANS RIEN ECRIRE (tout ou rien,
// sur les 2 fichiers a la fois).
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_FIX_HEADER_OVERLAP_V1";

const FILE_BUTTON = path.join(process.cwd(), "components", "InstallButton.js");
const FILE_HEADER = path.join(process.cwd(), "components", "SiteHeader.js");

function fail(message) {
  console.error(`[patch-fix-header-overlap] ${message}`);
  process.exit(1);
}

for (const f of [FILE_BUTTON, FILE_HEADER]) {
  if (!fs.existsSync(f)) fail(`fichier introuvable : ${f} (lancez le script depuis la racine du projet)`);
}

const origButton = fs.readFileSync(FILE_BUTTON, "utf8");
const origHeader = fs.readFileSync(FILE_HEADER, "utf8");

if (origButton.includes(MARK) && origHeader.includes(MARK)) {
  console.log("[patch-fix-header-overlap] déjà appliqué, rien à faire.");
  process.exit(0);
}
if (origButton.includes(MARK) !== origHeader.includes(MARK)) {
  fail("état incohérent : le marqueur est présent dans un seul des deux fichiers. Vérifiez manuellement avant de relancer.");
}

const crlfButton = origButton.includes("\r\n");
const crlfHeader = origHeader.includes("\r\n");
const contentButton = origButton.replace(/\r\n/g, "\n");
const contentHeader = origHeader.replace(/\r\n/g, "\n");

// ------------------------------------------------------------
// Édit 1 : InstallButton.js — texte visible seulement à partir de xl:
// ------------------------------------------------------------
const EDIT_BUTTON = {
  label: "InstallButton.js : texte visible à partir de xl: (au lieu de sm:)",
  from: '      <span className="hidden sm:inline">Installer l&apos;app</span>\n',
  to: '      <span className="hidden xl:inline">Installer l&apos;app</span> {/* ' + MARK + ' : texte masqué entre sm: et xl:, pour laisser de la place au menu */}\n',
};

// ------------------------------------------------------------
// Édit 2 : SiteHeader.js — espacement du menu resserré entre lg: et xl:
// ------------------------------------------------------------
const EDIT_HEADER = {
  label: "SiteHeader.js : espacement du menu resserré entre lg: et xl:",
  from: '        <nav className="hidden lg:flex gap-7 text-sm">\n',
  to: '        <nav className="hidden lg:flex gap-4 xl:gap-7 text-sm"> {/* ' + MARK + ' : espacement resserré entre lg: et xl:, pour laisser de la place au bouton d\'installation */}\n',
};

// ------------------------------------------------------------
// Vérification : chaque ancre doit apparaître EXACTEMENT 1 fois.
// ------------------------------------------------------------
const problems = [];
if (!origButton.includes(MARK)) {
  const count = contentButton.split(EDIT_BUTTON.from).length - 1;
  if (count !== 1) problems.push(`InstallButton.js : « ${EDIT_BUTTON.label} » trouvée ${count} fois au lieu de 1`);
}
if (!origHeader.includes(MARK)) {
  const count = contentHeader.split(EDIT_HEADER.from).length - 1;
  if (count !== 1) problems.push(`SiteHeader.js : « ${EDIT_HEADER.label} » trouvée ${count} fois au lieu de 1`);
}

if (problems.length > 0) {
  fail(
    "au moins une ancre ne correspond pas. Fichier modifié depuis, ou texte différent de ce qui a été vérifié. " +
    "Rien n'a été écrit (ni dans InstallButton.js, ni dans SiteHeader.js). Détail :\n  - " + problems.join("\n  - ")
  );
}

// ------------------------------------------------------------
// Application (tout ou rien, déjà validé ci-dessus)
// ------------------------------------------------------------
const updatedButton = contentButton.replace(EDIT_BUTTON.from, () => EDIT_BUTTON.to);
const updatedHeader = contentHeader.replace(EDIT_HEADER.from, () => EDIT_HEADER.to);

if (!updatedButton.includes(MARK)) fail("contrôle final : le marqueur est absent de InstallButton.js après patch.");
if (!updatedHeader.includes(MARK)) fail("contrôle final : le marqueur est absent de SiteHeader.js après patch.");

fs.writeFileSync(FILE_BUTTON, crlfButton ? updatedButton.replace(/\n/g, "\r\n") : updatedButton, "utf8");
fs.writeFileSync(FILE_HEADER, crlfHeader ? updatedHeader.replace(/\n/g, "\r\n") : updatedHeader, "utf8");

console.log("[patch-fix-header-overlap] 2 fichiers mis à jour :");
console.log("[patch-fix-header-overlap]   - components/InstallButton.js : texte visible à partir de xl: (1280px) au lieu de sm: (640px)");
console.log("[patch-fix-header-overlap]   - components/SiteHeader.js : espacement du menu resserré (gap-4) entre lg: et xl:");
