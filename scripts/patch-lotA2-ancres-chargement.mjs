#!/usr/bin/env node
// ============================================================
// patch-lotA2-ancres-chargement.mjs  -  ZENORIA_ANCHORS_V2
//
// Lot A2 : les liens « /#section » venus d'une autre page (le quiz) arrivent a la bonne section de l'accueil.
//
// Probleme : le navigateur defile au chargement de la page, quand l'accueil est encore incomplet (catalogue et saisons
// pas encore affiches, section « Les saisons » absente). La cible bouge ensuite et la visiteuse n'arrive « nulle part ».
//
// Correction (pages/index.js seul) : le bloc existant qui lit une seule fois l'adresse, une fois le catalogue charge
// (#panier, #bague=, #saison=), gere aussi #collections, #seasons, #savoir-faire, #philosophie, #contact et #notre-histoire :
//  - il defile vers la section (marge de 80 px deja posee au lot A1) ;
//  - il recommence apres 350 ms et 900 ms pour suivre les images qui s'affichent ;
//  - le moindre geste de la visiteuse (molette, toucher, clavier, clic) arrete ces rappels ;
//  - « Les saisons » absente (familles illisibles) : on va au catalogue ;
//  - « Notre histoire » : meme evenement que le bouton du menu (la section se deplie et vient a l'ecran).
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotA2-ancres-chargement.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotA2-ancres-chargement.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_ANCHORS_V2";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

const rel = "pages/index.js";
const file = path.join(ROOT, ...rel.split("/"));
if (!fs.existsSync(file)) stop(rel + " introuvable (lance le script depuis la racine du projet).");
const raw = fs.readFileSync(file, "utf8");
const crlf = (raw.match(/\r\n/g) || []).length;
const lf = (raw.match(/\n/g) || []).length - crlf;
if (crlf > 0 && lf > 0) stop(rel + " melange des fins de ligne CRLF et LF (" + crlf + " CRLF, " + lf + " LF) : je ne touche pas a un fichier dans cet etat.");
const eol = crlf > 0 ? "\r\n" : "\n";
const text = raw.replace(/\r\n/g, "\n");

if (text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans " + rel + " : lot deja applique.");

// ---------- Ancres ----------
const FROM =
  "        setTimeout(scrollToCatalogue, 80);\n" +
  "      }\n" +
  "      handled = true;\n" +
  "    }\n" +
  "    if (handled) {\n";

const TO =
  "        setTimeout(scrollToCatalogue, 80);\n" +
  "      }\n" +
  "      handled = true;\n" +
  '    } else if (["collections", "seasons", "savoir-faire", "philosophie", "contact", "notre-histoire"].includes(hash.slice(1))) {\n' +
  "      // " + MARK + " : « /#section » venu d'une autre page (le quiz). Le navigateur defile au chargement, quand l'accueil est encore\n" +
  "      // incomplet : la cible bouge ensuite. On defile donc ici, une fois le catalogue charge, puis encore apres 350 ms et 900 ms pour\n" +
  "      // suivre les images qui s'affichent. Le moindre geste de la visiteuse (molette, toucher, clavier, clic) arrete ces rappels.\n" +
  "      const wanted = hash.slice(1);\n" +
  "      const goToSection = () => {\n" +
  '        if (wanted === "notre-histoire") {\n' +
  "          window.dispatchEvent(new Event(OPEN_STORY_EVENT));\n" +
  "          return;\n" +
  "        }\n" +
  "        // « Les saisons » n'existe que si les familles sont lues : sinon on va au catalogue\n" +
  '        const el = document.getElementById(wanted) || (wanted === "seasons" ? document.getElementById("collections") : null);\n' +
  '        if (el) el.scrollIntoView({ behavior: "auto", block: "start" });\n' +
  "      };\n" +
  "      let stopped = false;\n" +
  '      const userEvents = ["wheel", "touchstart", "keydown", "mousedown"];\n' +
  "      const stopFollowing = () => {\n" +
  "        stopped = true;\n" +
  "        userEvents.forEach((ev) => window.removeEventListener(ev, stopFollowing));\n" +
  "      };\n" +
  "      userEvents.forEach((ev) => window.addEventListener(ev, stopFollowing, { passive: true }));\n" +
  "      [0, 350, 900].forEach((ms) =>\n" +
  "        setTimeout(() => {\n" +
  "          if (!stopped) goToSection();\n" +
  "          if (ms === 900) stopFollowing();\n" +
  "        }, ms)\n" +
  "      );\n" +
  "      handled = true;\n" +
  "    }\n" +
  "    if (handled) {\n";

if (count(text, FROM) !== 1) stop("l'ancre de fin du bloc d'adresse (apres #saison=) est trouvee " + count(text, FROM) + " fois (attendu : 1). Le fichier a change depuis l'audit.");
for (const [needle, n] of [
  ["const linkHandled = useRef(false);", 1],
  ['hash.startsWith("#saison=")', 1],
  ['hash.startsWith("#bague=")', 1],
  ["}, [catalogLoading]);", 1],
  ['import StorySection, { OPEN_STORY_EVENT } from "@/components/StorySection";', 1],
  ["const scrollToCatalogue = () =>", 1],
]) {
  if (count(text, needle) !== n) stop("element attendu « " + needle + " » trouve " + count(text, needle) + " fois (attendu : " + n + ").");
}
const iHandled = text.indexOf("const linkHandled = useRef(false);");
const iFrom = text.indexOf(FROM);
const iEnd = text.indexOf("}, [catalogLoading]);", iHandled);
if (!(iHandled < iFrom && iFrom < iEnd)) stop("l'ancre n'est pas dans le bloc « linkHandled » attendu.");

const next = text.replace(FROM, () => TO);
if (!next.includes(MARK) || count(next, MARK) !== 1) stop("controle final en echec.");

console.log("Lot A2 - ancres de section a l'arrivee depuis une autre page");
console.log(" - fin de ligne detectee : " + (eol === "\r\n" ? "CRLF" : "LF"));
console.log(" - " + rel + " : " + text.split("\n").length + " -> " + next.split("\n").length + " lignes (+" + (next.split("\n").length - text.split("\n").length) + ")");

if (DRY) {
  console.log("\nDRY-RUN OK : l'ancre est unique et conforme. Rien n'a ete ecrit.");
  process.exit(0);
}
fs.writeFileSync(file, eol === "\r\n" ? next.replace(/\n/g, "\r\n") : next, "utf8");
console.log("\nOK : fichier ecrit. Lance maintenant : npm run build");
