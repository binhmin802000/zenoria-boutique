// ============================================================
// scripts/patch-cache-media.mjs — Optimisation du cache navigateur des médias (photos/vidéos)
// ZENORIA_CACHE_MEDIA_V1
//
// Contexte (22/10/2026) : le quota « Cached Egress » du plan gratuit Supabase (5 Go) était dépassé
// (119 %). Cause probable : cacheControl trop court (1 heure) sur les envois de photos/vidéos, ce
// qui force un retéléchargement fréquent depuis Supabase, même pour un contenu inchangé.
//
// Ce script :
//  1. Remplace cacheControl: "3600" (1 heure) par "31536000" (1 an) aux 2 emplacements d'envoi de
//     lib/supabase.js. N'affecte QUE les fichiers envoyés après ce changement : les médias déjà en
//     ligne gardent leur ancien réglage tant qu'ils ne sont pas remplacés.
//  2. Réduit HERO_VIDEO_MAX_SECONDS à 20 dans lib/cropMath.js (limite maximale autorisée à l'envoi
//     de la vidéo d'accueil, pour éviter qu'une prochaine vidéo soit trop lourde). Les vidéos déjà
//     en ligne ne sont pas affectées ; seul un nouvel envoi sera plafonné à 20 s.
//
// Usage (dossier zenoria, branche optimisation-cache-media) :
//   node scripts\patch-cache-media.mjs --dry-run
//   node scripts\patch-cache-media.mjs
// ============================================================
import fs from "node:fs";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_CACHE_MEDIA_V1";
const BRANCH = "optimisation-cache-media";
const DRY = process.argv.includes("--dry-run");

const ok = (m) => console.log("  \u2713 " + m);
const info = (m) => console.log("  \u00b7 " + m);
class Stop extends Error {}
const fail = (m) => { throw new Stop(m); };
const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();

function read(rel) {
  if (!fs.existsSync(rel)) fail(`fichier introuvable : ${rel} (lancez le script depuis le dossier zenoria)`);
  let text = fs.readFileSync(rel, "utf8");
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { rel, bom, eol, text: text.replace(/\r\n/g, "\n") };
}
const toDisk = (f, text) => (f.bom ? "\uFEFF" : "") + (f.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);

try {
  console.log(`\nOptimisation du cache des médias${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
  let branch = "";
  try { branch = git("rev-parse --abbrev-ref HEAD"); } catch (e) { fail("git introuvable ou dossier hors dépôt"); }
  if (branch !== BRANCH) fail(`branche actuelle « ${branch} » : créez-la ou passez dessus (git switch -c ${BRANCH})`);
  ok(`branche ${BRANCH}`);

  const supa = read("lib/supabase.js");
  const crop = read("lib/cropMath.js");

  const touched = [];
  if (!supa.text.includes(MARK)) touched.push("lib/supabase.js");
  if (!crop.text.includes(MARK)) touched.push("lib/cropMath.js");
  const dirty = touched.length ? git(`status --porcelain -- ${touched.join(" ")}`) : "";
  if (dirty) fail(`modifications locales non commitées :\n${dirty}\n  (commit ou git restore avant de relancer)`);
  ok("fichiers concernés identiques au dernier commit");

  const writes = [];

  if (supa.text.includes(MARK)) {
    info("lib/supabase.js : déjà modifié, laissé tel quel");
  } else {
    const n = (supa.text.match(/cacheControl: "3600",/g) || []).length;
    if (n !== 2) fail(`repère « cacheControl: "3600" » trouvé ${n} fois dans lib/supabase.js (2 attendus)`);
    const newText = supa.text.replace(/cacheControl: "3600",/g, `cacheControl: "31536000", // ${MARK} : 1 an au lieu d'1 heure (quota "Cached Egress" Supabase)`);
    writes.push({ rel: "lib/supabase.js", data: toDisk(supa, newText), label: "modifié (2 occurrences cacheControl)" });
  }

  if (crop.text.includes(MARK)) {
    info("lib/cropMath.js : déjà modifié, laissé tel quel");
  } else {
    const needle = /export const HERO_VIDEO_MAX_SECONDS = \d+;/;
    const n = (crop.text.match(new RegExp(needle.source, "g")) || []).length;
    if (n !== 1) fail(`repère « HERO_VIDEO_MAX_SECONDS » trouvé ${n} fois dans lib/cropMath.js (1 attendu)`);
    const newText = crop.text.replace(needle, `export const HERO_VIDEO_MAX_SECONDS = 20; // ${MARK} : limite réduite (poids/egress), modifiable à tout moment`);
    writes.push({ rel: "lib/cropMath.js", data: toDisk(crop, newText), label: "modifié (HERO_VIDEO_MAX_SECONDS -> 20)" });
  }

  ok("tous les repères ont été trouvés");
  if (DRY) { console.log(`\nVérification réussie : ${writes.length} fichier(s) seraient écrits. Rien n'a été modifié.\n`); process.exit(0); }
  for (const w of writes) { fs.writeFileSync(w.rel, w.data, "utf8"); ok(`${w.rel} ${w.label}`); }
  console.log(`\nTerminé : ${writes.length} fichier(s) écrit(s). Suite : npm run build, puis remplacez la vidéo d'accueil (15-20 s) et vos photos principales depuis l'admin pour qu'elles profitent du nouveau cache.\n`);
} catch (e) {
  if (e instanceof Stop) { console.error(`\n\u2717 ARRÊT : ${e.message}\nAucun fichier n'a été modifié.\n`); process.exit(1); }
  throw e;
}
