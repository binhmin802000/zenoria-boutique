// ============================================================
// patch-ring-admin.mjs
// Branche les réglages de l'animation « Le geste » dans le site et dans l'administration.
//
// À lancer depuis la racine du projet (le dossier « zenoria », celui qui contient package.json),
// APRÈS avoir copié les nouveaux fichiers du zip (components/, lib/, sql/, public/) :
//     node scripts/patch-ring-admin.mjs
//
// Il modifie 2 fichiers, sans toucher à un seul de vos textes :
//   - components/SavoirFaire.js     : l'animation est désormais affichée par <RingAnimationSection />, qui lit les
//                                     réglages de l'administration (bague, couleur du cœur, vitesse, lecture)
//   - components/AdminSiteMedia.js  : ajoute la carte « Animation Le geste » sous l'animation saisonnière
//
// Sûr : il vérifie chaque repère avant d'écrire (un seul endroit trouvé, sinon il s'arrête sans rien modifier),
// conserve les fins de ligne du fichier, et peut être relancé sans effet.
// Pour annuler : git restore components/SavoirFaire.js components/AdminSiteMedia.js
// ============================================================
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rel = (p) => path.relative(root, p).replace(/\\/g, "/");
const P = (...a) => path.join(root, ...a);

function fail(msg) {
  console.error("\n✗ " + msg + "\n  Aucun fichier n'a été modifié.");
  process.exit(1);
}

// ---- Les fichiers à modifier et les fichiers à installer doivent tous être là ----
const mustExist = [
  P("components", "SavoirFaire.js"),
  P("components", "AdminSiteMedia.js"),
  P("components", "RingHandsVideo.js"),
  P("components", "RingAnimationSection.js"),
  P("components", "AdminRingAnimation.js"),
  P("lib", "ringSettings.js"),
  P("lib", "ringCutout.js"),
  P("public", "animations", "ring-bleu.png"),
];
for (const p of mustExist) {
  if (!fs.existsSync(p)) {
    fail(`Fichier introuvable : ${rel(p)}. Lancez la commande depuis le dossier « zenoria », après avoir copié tous les fichiers du zip.`);
  }
}
if (!fs.readFileSync(P("components", "RingHandsVideo.js"), "utf8").includes("createPlayer")) {
  fail("components/RingHandsVideo.js n'est pas la dernière version de l'animation (celle du zip). Recopiez-le, puis relancez.");
}

function read(p) {
  const raw = fs.readFileSync(p, "utf8");
  if (raw.includes("\uFFFD")) fail(`${rel(p)} n'est pas encodé en UTF-8 : je ne le modifie pas pour ne pas abîmer les accents.`);
  return { crlf: raw.includes("\r\n"), text: raw.replace(/\r\n/g, "\n") };
}
function write(p, o) {
  fs.writeFileSync(p, o.crlf ? o.text.replace(/\n/g, "\r\n") : o.text, "utf8");
}
function replaceOnce(o, from, to, label) {
  const n = o.text.split(from).length - 1;
  if (n !== 1) fail(`${label} : repère trouvé ${n} fois (1 attendu). Envoyez-moi ce fichier et je l'adapte.`);
  o.text = o.text.replace(from, () => to);
}
function replaceRegexOnce(o, re, to, label) {
  const found = o.text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
  const n = found ? found.length : 0;
  if (n !== 1) fail(`${label} : repère trouvé ${n} fois (1 attendu). Envoyez-moi ce fichier et je l'adapte.`);
  o.text = o.text.replace(re, to);
}

const done = [];

// ---------- components/SavoirFaire.js ----------
const sf = read(P("components", "SavoirFaire.js"));
if (sf.text.includes("RingAnimationSection")) {
  console.log("= components/SavoirFaire.js : déjà modifié, rien à faire");
} else {
  if (!sf.text.includes("RingHandsVideo")) {
    fail("components/SavoirFaire.js n'affiche pas encore l'animation. Lancez d'abord patch-savoir-faire-animation.mjs (étape précédente), puis relancez ce script.");
  }
  replaceOnce(
    sf,
    'import RingHandsVideo from "@/components/RingHandsVideo";',
    'import RingAnimationSection from "@/components/RingAnimationSection";',
    "SavoirFaire.js (import)"
  );
  // le bloc posé à l'étape précédente : <div className="max-w-4xl mx-auto px-6 mt-20"><RingHandsVideo ... /></div>
  replaceRegexOnce(
    sf,
    /^([ \t]*)<div className="max-w-4xl mx-auto px-6 mt-20">\s*<RingHandsVideo\b[^>]*\/>\s*<\/div>/m,
    '$1<RingAnimationSection accent={heartColor} />',
    "SavoirFaire.js (bloc de l'animation)"
  );
  // commentaire au-dessus du bloc (facultatif)
  const c = sf.text.match(/\{\/\* Animation [^\n]*\*\/\}/g);
  if (c && c.length === 1) sf.text = sf.text.replace(c[0], () => "{/* Animation « Le geste » : bague, couleur du cœur, vitesse et lecture réglées depuis /admin (Contenu du site) */}");
  done.push(["components/SavoirFaire.js", P("components", "SavoirFaire.js"), sf]);
}

// ---------- components/AdminSiteMedia.js ----------
const am = read(P("components", "AdminSiteMedia.js"));
if (am.text.includes("AdminRingAnimation")) {
  console.log("= components/AdminSiteMedia.js : déjà modifié, rien à faire");
} else {
  replaceOnce(
    am,
    'import AdminSeasonFx from "@/components/AdminSeasonFx";',
    'import AdminSeasonFx from "@/components/AdminSeasonFx";\nimport AdminRingAnimation from "@/components/AdminRingAnimation";',
    "AdminSiteMedia.js (import)"
  );
  replaceOnce(
    am,
    "<AdminSeasonFx />",
    "<AdminSeasonFx />\n\n      {/* ANIMATION « LE GESTE » : bague, couleur du cœur, vitesse et mode de lecture */}\n      <AdminRingAnimation />",
    "AdminSiteMedia.js (carte)"
  );
  done.push(["components/AdminSiteMedia.js", P("components", "AdminSiteMedia.js"), am]);
}

// Tout est vérifié : on écrit
for (const [name, file, o] of done) {
  write(file, o);
  console.log("✓ " + name + " modifié");
}
console.log(done.length ? "\nTerminé. Étape suivante : git diff --stat, puis npm run build." : "\nRien à modifier.");
