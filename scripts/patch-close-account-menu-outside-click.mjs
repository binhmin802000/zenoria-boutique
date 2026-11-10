#!/usr/bin/env node
// ============================================================
// patch-close-account-menu-outside-click.mjs
// ZENORIA_ACCOUNT_MENU_OUTSIDE_CLICK_V1
//
// Ferme automatiquement le menu "Connecté(e) en tant que..." (SiteHeader.js)
// des qu'on clique n'importe ou EN DEHORS de ce menu et de son bouton,
// au lieu d'exiger un second clic sur l'icone compte.
//
// Mecanisme : un useEffect ajoute un ecouteur "mousedown" sur tout le
// document tant que le menu est ouvert (accountMenuOpen = true). Si le
// clic a lieu en dehors de la zone du menu (reperee par une ref), le menu
// se ferme via la nouvelle prop optionnelle onAccountMenuClose.
//
// Cote appelant (pages/index.js, pages/quiz.js, etc.) : AUCUN changement
// necessaire si la prop n'est pas fournie - le comportement actuel (clic
// sur l'icone pour basculer) reste identique. Pour beneficier de la
// fermeture automatique, il suffit de passer :
//   onAccountMenuClose={() => setAccountMenuOpen(false)}
// (a faire separement, cote pages/index.js, une fois ce patch applique)
//
// Usage : node scripts/patch-close-account-menu-outside-click.mjs
// Idempotent : si deja applique, ne fait rien. Si UNE SEULE ancre ne
// correspond pas EXACTEMENT, le script s'arrete SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_ACCOUNT_MENU_OUTSIDE_CLICK_V1";
const FILE = path.join(process.cwd(), "components", "SiteHeader.js");

function fail(message) {
  console.error(`[patch-close-account-menu-outside-click] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-close-account-menu-outside-click] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

// ------------------------------------------------------------
// Édit 1 : import de useEffect et useRef (en plus de useState déjà présent)
// ------------------------------------------------------------
const EDIT_IMPORT = {
  label: "import React : ajout de useEffect, useRef",
  from: 'import React, { useState } from "react";\n',
  to: 'import React, { useState, useEffect, useRef } from "react"; // ' + MARK + ' : useEffect/useRef pour la fermeture au clic extérieur\n',
};

// ------------------------------------------------------------
// Édit 2 : ajout de la prop onAccountMenuClose, après onAccountClick
// ------------------------------------------------------------
const EDIT_PROP = {
  label: "ajout de la prop onAccountMenuClose",
  from: '  onAccountClick,\n',
  to: '  onAccountClick,\n  onAccountMenuClose, // ' + MARK + ' : optionnelle, appelée au clic en dehors du menu compte\n',
};

// ------------------------------------------------------------
// Édit 3 : ajout de la ref + useEffect, juste après la déclaration de closeMenu
// ------------------------------------------------------------
const EDIT_EFFECT = {
  label: "ref + useEffect de fermeture au clic extérieur",
  from:
    '  const closeMenu = () => {\n' +
    '    if (controlled) {\n' +
    '      if (onMenuClose) onMenuClose();\n' +
    '    } else {\n' +
    '      setInnerMenu(false);\n' +
    '    }\n' +
    '  };\n',
  to:
    '  const closeMenu = () => {\n' +
    '    if (controlled) {\n' +
    '      if (onMenuClose) onMenuClose();\n' +
    '    } else {\n' +
    '      setInnerMenu(false);\n' +
    '    }\n' +
    '  };\n' +
    '\n' +
    '  // ' + MARK + ' : ferme le menu compte au clic (ou au focus clavier) en dehors de sa zone\n' +
    '  const accountMenuRef = useRef(null);\n' +
    '  useEffect(() => {\n' +
    '    if (!accountMenuOpen || !onAccountMenuClose) return undefined;\n' +
    '    const handlePointerDown = (e) => {\n' +
    '      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {\n' +
    '        onAccountMenuClose();\n' +
    '      }\n' +
    '    };\n' +
    '    document.addEventListener("mousedown", handlePointerDown);\n' +
    '    document.addEventListener("touchstart", handlePointerDown);\n' +
    '    return () => {\n' +
    '      document.removeEventListener("mousedown", handlePointerDown);\n' +
    '      document.removeEventListener("touchstart", handlePointerDown);\n' +
    '    };\n' +
    '  }, [accountMenuOpen, onAccountMenuClose]);\n',
};

// ------------------------------------------------------------
// Édit 4 : attacher la ref au conteneur du bouton + menu compte
// ------------------------------------------------------------
const EDIT_REF_ATTACH = {
  label: "attache la ref au conteneur du menu compte",
  from: '          <div className="relative hidden sm:block">\n',
  to: '          <div className="relative hidden sm:block" ref={accountMenuRef}> {/* ' + MARK + ' */}\n',
};

const EDITS = [EDIT_IMPORT, EDIT_PROP, EDIT_EFFECT, EDIT_REF_ATTACH];

// ------------------------------------------------------------
// Vérification : chaque ancre doit apparaître EXACTEMENT 1 fois.
// ------------------------------------------------------------
const problems = [];
for (const e of EDITS) {
  const count = content.split(e.from).length - 1;
  if (count !== 1) problems.push(`« ${e.label} » trouvée ${count} fois au lieu de 1`);
}

if (problems.length > 0) {
  fail(
    "au moins une ancre ne correspond pas. Fichier modifié depuis, ou texte différent de ce qui a été vérifié. " +
    "Rien n'a été écrit. Détail :\n  - " + problems.join("\n  - ")
  );
}

// ------------------------------------------------------------
// Application (tout ou rien, déjà validé ci-dessus)
// ------------------------------------------------------------
let updated = content;
for (const e of EDITS) {
  updated = updated.replace(e.from, () => e.to);
}

if ((updated.match(new RegExp(MARK, "g")) || []).length !== 4) {
  fail("contrôle final : le marqueur devrait apparaître exactement 4 fois après patch.");
}

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-close-account-menu-outside-click] components/SiteHeader.js mis à jour :");
console.log("[patch-close-account-menu-outside-click]   - fermeture automatique du menu compte au clic en dehors");
console.log("[patch-close-account-menu-outside-click]");
console.log("[patch-close-account-menu-outside-click] ÉTAPE SUIVANTE MANUELLE : dans pages/index.js (et toute autre page");
console.log("[patch-close-account-menu-outside-click] qui utilise <SiteHeader accountMenuOpen={...}>), ajoutez :");
console.log("[patch-close-account-menu-outside-click]   onAccountMenuClose={() => setAccountMenuOpen(false)}");
console.log("[patch-close-account-menu-outside-click] sur l'appel du composant, sinon la fermeture automatique restera inactive.");
