#!/usr/bin/env node
// ============================================================
// patch-pwa-setup.mjs
// ZENORIA_PWA_V1
//
// Ajoute dans pages/_app.js l'enregistrement du service worker PWA
// (public/sw.js), pour que le site devienne "installable" sur l'écran
// d'accueil (iOS/Android), en plus des fichiers déjà créés séparément :
//   - pages/_document.js   (nouveau fichier, lien manifest + balises iOS)
//   - public/manifest.json (nouveau fichier)
//   - public/sw.js          (nouveau fichier, cache minimal, statique uniquement)
//   - public/icons/*.png    (générés par scripts/generate-pwa-icons.mjs)
//
// Ce script ne modifie QUE pages/_app.js (les autres fichiers sont à copier
// directement, ils n'ont pas besoin d'être "patchés" dans un fichier existant).
//
// Usage : node scripts/patch-pwa-setup.mjs
// Idempotent : si déjà appliqué, ne fait rien. Si l'ancre ne correspond
// pas EXACTEMENT, le script s'arrête SANS RIEN ÉCRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_PWA_V1";
const FILE = path.join(process.cwd(), "pages", "_app.js");

function fail(message) {
  console.error(`[patch-pwa-setup] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
}

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-pwa-setup] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

const importAnchor = "import { installErrorLogger } from '@/lib/errorLogger';\n";
const bodyAnchor = "  useEffect(() => installErrorLogger(), []);\n";

for (const [label, anchor] of [["import installErrorLogger", importAnchor], ["useEffect installErrorLogger", bodyAnchor]]) {
  const count = content.split(anchor).length - 1;
  if (count !== 1) {
    fail(`ancre « ${label} » trouvée ${count} fois au lieu de 1 dans pages/_app.js. Fichier modifié depuis ? Rien n'a été écrit.`);
  }
}

let updated = content.replace(
  importAnchor,
  importAnchor
);
updated = updated.replace(
  bodyAnchor,
  bodyAnchor +
    "\n" +
    "  // " + MARK + " : enregistre le service worker (installabilité PWA). Ne touche jamais au\n" +
    "  // panier, aux commandes ni aux prix : public/sw.js ne met en cache que des fichiers statiques.\n" +
    "  useEffect(() => {\n" +
    '    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;\n' +
    "    navigator.serviceWorker.register(\"/sw.js\").catch(() => {\n" +
    "      // Échec silencieux : l'absence de service worker ne doit jamais bloquer le site.\n" +
    "    });\n" +
    "  }, []);\n"
);

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-pwa-setup] pages/_app.js mis à jour : enregistrement du service worker ajouté.");
console.log("[patch-pwa-setup] Rappel : copier aussi pages/_document.js, public/manifest.json, public/sw.js et public/icons/*.png (générés via scripts/generate-pwa-icons.mjs).");
