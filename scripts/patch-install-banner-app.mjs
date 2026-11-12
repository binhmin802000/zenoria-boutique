// ============================================================
// PATCH — MONTAGE DU BANDEAU D'INSTALLATION DANS _app.js — ZENORIA_INSTALL_BANNER_V1
//
// Modifie : pages/_app.js (uniquement)
// Prerequis (fichier a copier AVANT, ce script ne le cree pas) :
//   components/InstallBanner.js
// Prerequis : patch-install-banner.mjs deja applique (InstallButton.js utilise le hook partage).
//
// Monte <InstallBanner /> UNE SEULE FOIS, ici, pour qu'il apparaisse sur TOUTES les pages sans
// dupliquer son montage dans index.js, quiz.js, compte.js, etc.
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois, sinon rien n'est ecrit.
// Fins de ligne (CRLF/LF) conservees. Relancer apres succes est refuse.
//
// Usage : node scripts/patch-install-banner-app.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-install-banner-app]";
const FILE = "pages/_app.js";
const MARKER = "ZENORIA_INSTALL_BANNER_V1";
const REQUIRED_NEW_FILE = "components/InstallBanner.js";

const edits = [
  {
    name: "import du bandeau",
    find: "import { installErrorLogger } from '@/lib/errorLogger';",
    replace: [
      "import { installErrorLogger } from '@/lib/errorLogger';",
      "import InstallBanner from '@/components/InstallBanner'; // ZENORIA_INSTALL_BANNER_V1",
    ].join("\n"),
  },
  {
    name: "montage du bandeau",
    find: "    <ErrorBoundary>\n      <Component {...pageProps} />\n    </ErrorBoundary>",
    replace: [
      "    <ErrorBoundary>",
      "      <Component {...pageProps} />",
      "      <InstallBanner /> {/* ZENORIA_INSTALL_BANNER_V1 : une seule fois ici, sur toutes les pages */}",
      "    </ErrorBoundary>",
    ].join("\n"),
  },
];

function countOccurrences(text, needle) {
  let n = 0;
  let i = text.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = text.indexOf(needle, i + needle.length);
  }
  return n;
}

const problems = [];
if (!fs.existsSync(path.join(ROOT, REQUIRED_NEW_FILE))) {
  problems.push(REQUIRED_NEW_FILE + " : fichier a copier avant de lancer ce script");
}

const full = path.join(ROOT, FILE);
let out = null;
let crlf = false;
if (!fs.existsSync(full)) {
  problems.push(FILE + " : fichier introuvable (lancer le script depuis le dossier du projet)");
} else {
  const raw = fs.readFileSync(full, "utf8");
  crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) {
    problems.push(FILE + " : deja patche (" + MARKER + " present), rien a faire");
  } else {
    let ok = true;
    for (const e of edits) {
      const n = countOccurrences(text, e.find);
      if (n !== 1) {
        problems.push(FILE + " : repere \"" + e.name + "\" trouve " + n + " fois (attendu : 1)");
        ok = false;
      }
    }
    if (ok) {
      for (const e of edits) text = text.replace(e.find, () => e.replace);
      out = crlf ? text.replace(/\n/g, "\r\n") : text;
    }
  }
}

if (problems.length > 0 || out === null) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

fs.writeFileSync(full, out, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
