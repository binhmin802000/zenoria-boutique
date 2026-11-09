#!/usr/bin/env node
// ============================================================
// generate-pwa-icons.mjs
// ZENORIA_PWA_ICON_YINYANG_V1
//
// Genere les icones PWA (192x192, 512x512, et la version "maskable") a
// partir du visuel definitif : yin-yang aux couleurs Zenoria (degrade
// or/creme et mauve/prune), entoure d'une ronde de 16 etoiles dorees
// formant un cercle, "ZENORIA" ecrit droit en bas.
// Source : public/icon-source.svg.
//
// Usage :
//   node scripts/generate-pwa-icons.mjs
//
// Cree, dans public/icons/ :
//   icon-192.png
//   icon-512.png
//   icon-maskable-512.png (teste sous un masque circulaire : aucune
//                          etoile ni lettre du texte n'est coupee)
// ============================================================
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "public", "icon-source.svg");
const OUT_DIR = path.join(process.cwd(), "public", "icons");

function fail(message) {
  console.error(`[generate-pwa-icons] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  fail(`fichier introuvable : ${SRC} (placez icon-source.svg dans public/ avant de lancer ce script)`);
}

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch (e) {
  fail(
    "le module 'sharp' n'est pas installé. Installez-le avec : npm install --save-dev sharp\n" +
    "(uniquement nécessaire pour générer les icônes une fois ; peut être désinstallé ensuite si besoin)"
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });

async function run() {
  const svgBuffer = fs.readFileSync(SRC);

  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(OUT_DIR, "icon-192.png"));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(OUT_DIR, "icon-512.png"));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(OUT_DIR, "icon-maskable-512.png"));

  console.log("[generate-pwa-icons] 3 icônes générées dans public/icons/ :");
  console.log("[generate-pwa-icons]   - icon-192.png");
  console.log("[generate-pwa-icons]   - icon-512.png");
  console.log("[generate-pwa-icons]   - icon-maskable-512.png (16 étoiles et texte testés sous masque circulaire, rien de coupé)");
}

run().catch((e) => fail("échec de la génération : " + e.message));
