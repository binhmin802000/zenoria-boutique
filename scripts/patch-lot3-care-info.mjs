// ============================================================
// PATCH LOT 3 — ENTRETIEN DU BIJOU — ZENORIA_CARE_INFO_V1
//
// Modifie : components/ProductSheet.js, components/Footer.js, components/AdminSiteMedia.js
// Ajoute  : pages/entretien.js, components/CareInfoText.js, components/CareInfoExcerpt.js,
//           components/AdminCareInfo.js, lib/careInfoSettings.js (a copier AVANT, ce script ne
//           les cree pas — ils n'ont pas besoin de patch, ce sont des fichiers neufs)
// Prerequis base : sql/supabase_lot3_care_info.sql deja execute (politique de lecture publique).
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois dans chaque fichier concerne, sinon le
// script s'arrete sans rien ecrire NULLE PART. Fins de ligne (CRLF/LF) conservees par fichier.
// Relancer apres succes est refuse.
//
// Usage : node scripts/patch-lot3-care-info.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-lot3-care-info]";
const MARKER = "ZENORIA_CARE_INFO_V1";
const REQUIRED_NEW_FILES = [
  "lib/careInfoSettings.js",
  "components/CareInfoText.js",
  "components/CareInfoExcerpt.js",
  "components/AdminCareInfo.js",
  "pages/entretien.js",
];

const productSheetEdits = [
  {
    name: "import de l'encart",
    find: 'import useModalFocus from "@/lib/useModalFocus";',
    replace: [
      'import useModalFocus from "@/lib/useModalFocus";',
      'import CareInfoExcerpt from "@/components/CareInfoExcerpt"; // ZENORIA_CARE_INFO_V1',
    ].join("\n"),
  },
  {
    name: "encart sous la description",
    find: '{product.pitch && (\n                <p className="text-[15px] leading-7 text-[#54434c] mt-5">{product.pitch}</p>\n              )}\n              <p className="text-sm leading-6 text-[#70656a] mt-3 italic">{product.energy}</p>',
    replace: [
      '{product.pitch && (',
      '                <p className="text-[15px] leading-7 text-[#54434c] mt-5">{product.pitch}</p>',
      "              )}",
      '              <p className="text-sm leading-6 text-[#70656a] mt-3 italic">{product.energy}</p>',
      "              <CareInfoExcerpt /> {/* ZENORIA_CARE_INFO_V1 */}",
    ].join("\n"),
  },
];

const footerEdits = [
  {
    name: "lien pied de page",
    find: '<p><a href="/cgv" className="hover:text-white underline-offset-2 hover:underline">Conditions générales de vente</a></p>',
    replace: [
      '<p><a href="/cgv" className="hover:text-white underline-offset-2 hover:underline">Conditions générales de vente</a></p>',
      '            <p><a href="/entretien" className="hover:text-white underline-offset-2 hover:underline">Entretien du bijou</a></p> {/* ZENORIA_CARE_INFO_V1 */}',
    ].join("\n"),
  },
];

const adminSiteMediaEdits = [
  {
    name: "import du composant",
    find: 'import AdminAccountNewsCache from "@/components/AdminAccountNewsCache"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    replace: [
      'import AdminAccountNewsCache from "@/components/AdminAccountNewsCache"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
      'import AdminCareInfo from "@/components/AdminCareInfo"; // ZENORIA_CARE_INFO_V1',
    ].join("\n"),
  },
  {
    name: "compte de cartes du groupe Vitrine & ambiance",
    find: "count={5} // ZENORIA_ACCOUNT_NEWS_BADGE_V1 : 4 -> 5 (carte de la pastille de nouveautes)",
    replace: "count={6} // ZENORIA_CARE_INFO_V1 : 5 -> 6 (carte Entretien du bijou)",
  },
  {
    name: "carte ajoutee apres la pastille de nouveautes",
    find: '<div data-config-card="account_news_cache" style={{ scrollMarginTop: 84 }}> {/* ZENORIA_ACCOUNT_NEWS_BADGE_V1 */}\n          <AdminAccountNewsCache />\n        </div>',
    replace: [
      '<div data-config-card="account_news_cache" style={{ scrollMarginTop: 84 }}> {/* ZENORIA_ACCOUNT_NEWS_BADGE_V1 */}',
      "          <AdminAccountNewsCache />",
      "        </div>",
      '        <div data-config-card="care_info" style={{ scrollMarginTop: 84 }}> {/* ZENORIA_CARE_INFO_V1 */}',
      "          <AdminCareInfo />",
      "        </div>",
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

function prepare(rel, edits, problems) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    problems.push(rel + " : fichier introuvable (lancer le script depuis le dossier du projet)");
    return null;
  }
  const raw = fs.readFileSync(full, "utf8");
  const crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) {
    problems.push(rel + " : deja patche (" + MARKER + " present), rien a faire");
    return null;
  }
  let ok = true;
  for (const e of edits) {
    const n = countOccurrences(text, e.find);
    if (n !== 1) {
      problems.push(rel + " : repere \"" + e.name + "\" trouve " + n + " fois (attendu : 1)");
      ok = false;
    }
  }
  if (!ok) return null;
  for (const e of edits) text = text.replace(e.find, () => e.replace);
  return { full, out: crlf ? text.replace(/\n/g, "\r\n") : text, crlf };
}

const problems = [];
for (const rel of REQUIRED_NEW_FILES) {
  if (!fs.existsSync(path.join(ROOT, rel))) problems.push(rel + " : fichier a copier avant de lancer ce script");
}

const targets = [
  ["components/ProductSheet.js", productSheetEdits],
  ["components/Footer.js", footerEdits],
  ["components/AdminSiteMedia.js", adminSiteMediaEdits],
];
const prepared = {};
for (const [rel, edits] of targets) prepared[rel] = prepare(rel, edits, problems);

if (problems.length > 0 || Object.values(prepared).some((p) => !p)) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

for (const [rel] of targets) {
  const p = prepared[rel];
  fs.writeFileSync(p.full, p.out, "utf8");
  console.log(TAG + " mis a jour : " + rel + " (" + (p.crlf ? "CRLF" : "LF") + ")");
}
