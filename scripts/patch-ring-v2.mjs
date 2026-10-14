// ============================================================
// patch-ring-v2.mjs : mise à jour de l'animation « Le geste » (version 6)
//   - animation vraiment transparente (aucun fond : la couleur du site est le fond)
//   - bague glissée de l'ongle de l'annulaire jusqu'au bout du doigt (durée 13,9 s)
//
// À lancer depuis la racine du projet (le dossier « zenoria »), APRÈS avoir extrait le zip :
//     node scripts/patch-ring-v2.mjs
//
// Il fait deux choses, et rien d'autre :
//   1. lib/ringSettings.js : met à jour les durées affichées pour chaque vitesse dans l'administration
//      (« Environ 17 s », « 13,9 s », « Environ 11 s »)
//   2. supprime public/animations/zenoria-geste.webm, l'ancienne vidéo à fond blanc, que plus rien n'utilise
//      (la nouvelle vidéo transparente s'appelle zenoria-geste-alpha.webm)
//
// Sûr : il vérifie que les nouveaux fichiers sont bien là avant de toucher à quoi que ce soit, conserve les
// fins de ligne, et peut être relancé sans effet. Pour annuler : git restore lib/ringSettings.js public/animations
// ============================================================
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const P = (...a) => path.join(root, ...a);
const rel = (p) => path.relative(root, p).replace(/\\/g, "/");
function fail(msg) { console.error("\n✗ " + msg + "\n  Aucun fichier n'a été modifié."); process.exit(1); }

for (const f of [["public", "animations", "zenoria-geste-alpha.webm"], ["public", "animations", "zenoria-geste.mp4"], ["public", "animations", "zenoria-geste-fin.png"], ["components", "RingHandsVideo.js"], ["lib", "ringSettings.js"]]) {
  if (!fs.existsSync(P(...f))) fail(`Fichier introuvable : ${rel(P(...f))}. Lancez la commande depuis le dossier « zenoria », après avoir extrait le zip.`);
}
if (!fs.readFileSync(P("components", "RingHandsVideo.js"), "utf8").includes("srcAlpha")) {
  fail("components/RingHandsVideo.js n'est pas la version 6 (celle du zip). Extrayez le zip à la racine du projet en acceptant de remplacer les fichiers, puis relancez.");
}
if (fs.statSync(P("public", "animations", "zenoria-geste-alpha.webm")).size < 100000) fail("public/animations/zenoria-geste-alpha.webm semble incomplet. Extrayez de nouveau le zip.");

const file = P("lib", "ringSettings.js");
const raw = fs.readFileSync(file, "utf8");
if (raw.includes("\uFFFD")) fail("lib/ringSettings.js n'est pas encodé en UTF-8 : je ne le modifie pas pour ne pas abîmer les accents.");
const crlf = raw.includes("\r\n");
let text = raw.replace(/\r\n/g, "\n");

const edits = [
  ['text: "Environ 16 s au total"', 'text: "Environ 17 s au total"'],
  ['text: "12,8 s"', 'text: "13,9 s"'],
  ['text: "Environ 10 s"', 'text: "Environ 11 s"'],
];
let changed = 0;
for (const [from, to] of edits) {
  const n = text.split(from).length - 1;
  if (n === 0 && text.includes(to)) continue; // déjà à jour
  if (n !== 1) fail(`lib/ringSettings.js : repère « ${from} » trouvé ${n} fois (1 attendu). Envoyez-moi ce fichier et je l'adapte.`);
  text = text.replace(from, () => to);
  changed++;
}
if (changed) {
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text, "utf8");
  console.log(`✓ lib/ringSettings.js : ${changed} durée(s) mise(s) à jour`);
} else {
  console.log("= lib/ringSettings.js : déjà à jour");
}

const old = P("public", "animations", "zenoria-geste.webm");
if (fs.existsSync(old)) {
  fs.unlinkSync(old);
  console.log("✓ public/animations/zenoria-geste.webm supprimé (ancienne vidéo à fond blanc)");
} else {
  console.log("= public/animations/zenoria-geste.webm : déjà supprimé");
}
console.log("\nTerminé. Étape suivante : git status -sb, puis npm run build.");
