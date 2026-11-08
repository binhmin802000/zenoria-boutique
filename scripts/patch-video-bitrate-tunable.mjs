// ============================================================
// patch-video-bitrate-tunable.mjs
// ZENORIA_VIDEO_BITRATE_TUNABLE_V1
//
// N'ajuste AUCUN comportement : extrait le facteur et les bornes de
// videoBitrate() (lib/cropMath.js) en constantes NOMMEES et EXPORTEES,
// pour pouvoir tester facilement un debit cible different (donc un
// poids different pour les FUTURES videos de produit), sans toucher
// a la formule elle-meme.
//
// Valeurs d'origine (inchangees par ce patch) :
//   VIDEO_BITRATE_FACTOR = 0.11
//   VIDEO_BITRATE_MIN    = 1 500 000 (1,5 Mbit/s)
//   VIDEO_BITRATE_MAX    = 5 000 000 (5 Mbit/s)
//
// Pour TESTER un debit plus bas (ex. -27 % de poids), modifier ensuite
// A LA MAIN uniquement VIDEO_BITRATE_FACTOR dans lib/cropMath.js,
// par exemple 0.11 -> 0.08, puis :
//   1. Ajouter une bague de test via /admin > Produits > Bijoux
//   2. Comparer le poids du fichier dans Supabase Storage
//   3. Verifier VISUELLEMENT la qualite de la video resultante
//   4. Si satisfaisant : garder la nouvelle valeur ; sinon : revenir a 0.11
//
// Usage :
//   node scripts/patch-video-bitrate-tunable.mjs
//
// Idempotent : si deja applique, ne fait rien. Si l'ancre ne correspond
// pas EXACTEMENT, s'arrete sans rien ecrire.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "lib", "cropMath.js");

function fail(message) {
  console.error(`[patch-video-bitrate-tunable] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
}

const original = fs.readFileSync(FILE, "utf8");

if (original.includes("ZENORIA_VIDEO_BITRATE_TUNABLE_V1")) {
  console.log("[patch-video-bitrate-tunable] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
let content = original.replace(/\r\n/g, "\n");

const anchor =
  '// Debit de la video (bits par seconde) selon sa taille : environ 2 Mbit/s en 896 x 720.\n' +
  'export function videoBitrate(width, height, fps = 30) {\n' +
  '  return Math.round(clamp(width * height * fps * 0.11, 1500000, 5000000));\n' +
  '}\n';

const count = content.split(anchor).length - 1;
if (count !== 1) {
  fail(`ancre de videoBitrate() trouvée ${count} fois au lieu de 1. Fichier modifié depuis ? Rien n'a été écrit.`);
}

const replacement =
  '// Debit de la video (bits par seconde) selon sa taille : environ 2 Mbit/s en 896 x 720.\n' +
  '// ZENORIA_VIDEO_BITRATE_TUNABLE_V1 : facteur et bornes extraits en constantes nommees, pour\n' +
  '// pouvoir tester facilement un debit different (poids different) sans toucher a la formule.\n' +
  '// Valeur d\'origine du facteur : 0.11. La diminuer reduit le poids (et legerement la qualite)\n' +
  '// des PROCHAINES videos ajoutees ; les videos deja en ligne ne sont jamais retouchees.\n' +
  'export const VIDEO_BITRATE_FACTOR = 0.11;\n' +
  'export const VIDEO_BITRATE_MIN = 1500000; // 1,5 Mbit/s\n' +
  'export const VIDEO_BITRATE_MAX = 5000000; // 5 Mbit/s\n' +
  'export function videoBitrate(width, height, fps = 30) {\n' +
  '  return Math.round(clamp(width * height * fps * VIDEO_BITRATE_FACTOR, VIDEO_BITRATE_MIN, VIDEO_BITRATE_MAX));\n' +
  '}\n';

content = content.replace(anchor, replacement);

if (usesCRLF) content = content.replace(/\n/g, "\r\n");

fs.writeFileSync(FILE, content, "utf8");
console.log("[patch-video-bitrate-tunable] lib/cropMath.js mis à jour : constantes VIDEO_BITRATE_FACTOR / MIN / MAX exportées.");
console.log("[patch-video-bitrate-tunable] Comportement INCHANGÉ pour l'instant (0.11, 1.5 Mbit/s, 5 Mbit/s).");
console.log("[patch-video-bitrate-tunable] Pour tester un débit plus bas, modifiez VIDEO_BITRATE_FACTOR dans lib/cropMath.js (ex. 0.08), puis testez une nouvelle bague.");
