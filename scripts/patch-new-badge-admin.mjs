#!/usr/bin/env node
// ============================================================
// patch-new-badge-admin.mjs
// ZENORIA_NEW_BADGE_V2
//
// ETAPE 2 du badge « Nouveaute » : reglage dans l'administration.
//   - components/AdminSiteMedia.js : monte la carte « Badge Nouveaute » dans « Vitrine & ambiance » (le compteur du
//     panneau passe de 3 a 4) ;
//   - pages/index.js : le site lit le reglage (cle site_settings « new_badge ») dans sa requete de reglages habituelle
//     (une cle de plus dans la liste, AUCUN appel de plus) au lieu des valeurs fixes de l'etape 1.
//
// PREREQUIS (verifies : arret SANS RIEN ECRIRE s'il en manque un) :
//   - etape 1 appliquee (marqueur ZENORIA_NEW_BADGE_V1 dans pages/index.js, lib/newBadge.js present) ;
//   - lib/newBadgeSettings.js et components/AdminNewBadge.js copies dans le projet ;
//   - supabase_new_badge.sql execute dans Supabase AVANT le deploiement du code (sinon l'administration enregistre le
//     reglage mais le site ne peut pas le lire : il garde alors 14 jours, active, sans erreur visible).
//
// Usage : node scripts/patch-new-badge-admin.mjs      Idempotent. TOUT OU RIEN.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_NEW_BADGE_V2";
const P = {
  index: path.join(process.cwd(), "pages", "index.js"),
  media: path.join(process.cwd(), "components", "AdminSiteMedia.js"),
  lib1: path.join(process.cwd(), "lib", "newBadge.js"),
  lib2: path.join(process.cwd(), "lib", "newBadgeSettings.js"),
  card: path.join(process.cwd(), "components", "AdminNewBadge.js"),
};
const fail = (m) => { console.error(`[patch-new-badge-admin] ${m}`); process.exit(1); };

for (const [k, f] of Object.entries(P)) if (!fs.existsSync(f)) {
  const hint = k === "lib2" || k === "card" ? " Copiez d'abord ce fichier dans le projet (il est livre avec ce script)." : k === "lib1" ? " L'etape 1 (patch-new-badge.mjs) doit etre appliquee avant." : " Lancez le script depuis la racine du projet.";
  fail(`fichier introuvable : ${path.relative(process.cwd(), f)}.${hint} Rien n'a ete ecrit.`);
}
const read = (f) => { const raw = fs.readFileSync(f, "utf8"); return { raw, crlf: raw.includes("\r\n"), text: raw.replace(/\r\n/g, "\n") }; };
const idx = read(P.index), media = read(P.media), lib1 = read(P.lib1), lib2 = read(P.lib2), card = read(P.card);

const doneIdx = idx.text.includes(MARK), doneMedia = media.text.includes(MARK);
if (doneIdx && doneMedia) { console.log("[patch-new-badge-admin] deja applique, rien a faire."); process.exit(0); }
if (doneIdx !== doneMedia) fail("etat incoherent : le marqueur est present dans un seul des deux fichiers (pages/index.js, components/AdminSiteMedia.js). Verifiez manuellement. Rien n'a ete ecrit.");

const problems = [];
if (!idx.text.includes("ZENORIA_NEW_BADGE_V1")) problems.push("l'etape 1 n'est pas appliquee dans pages/index.js (marqueur ZENORIA_NEW_BADGE_V1 absent)");
for (const sym of ["NEW_BADGE_KEY", "parseNewBadgeSetting", "isNewProduct", "DEFAULT_NEW_BADGE"]) if (!new RegExp("export (const|function) " + sym + "\\b").test(lib1.text)) problems.push(`lib/newBadge.js n'exporte pas ${sym}`);
for (const sym of ["parseDaysInput", "buildNewBadgeValue", "countNewProducts", "previewText"]) if (!new RegExp("export function " + sym + "\\b").test(lib2.text)) problems.push(`lib/newBadgeSettings.js n'exporte pas ${sym}`);
if (!lib2.text.includes(MARK)) problems.push("lib/newBadgeSettings.js n'est pas la bonne version (marqueur " + MARK + " absent)");
if (!card.text.includes(MARK) || !/export default function AdminNewBadge\b/.test(card.text)) problems.push("components/AdminNewBadge.js n'est pas la bonne version (marqueur ou export absent)");
if (/AdminNewBadge/.test(media.text)) problems.push("AdminSiteMedia.js mentionne deja AdminNewBadge sans le marqueur " + MARK);

const one = (text, re, label) => { const n = (text.match(re) || []).length; if (n !== 1) problems.push(`${label} : trouve ${n} fois au lieu de 1`); };

// ---------- AdminSiteMedia.js ----------
const M1 = /^import AdminGridOrder from "@\/components\/AdminGridOrder";[^\n]*\n/gm;
const M2 = /(id="vitrine"\s+title="Vitrine & ambiance"\s+count=\{)3(\})/g;
const M3 = /^([ \t]*)<AdminGridOrder \/>[ \t]*\n/gm;
one(media.text, M1, "AdminSiteMedia.js : import de AdminGridOrder");
one(media.text, M2, "AdminSiteMedia.js : panneau « Vitrine & ambiance » avec count={3}");
one(media.text, M3, "AdminSiteMedia.js : <AdminGridOrder />");

// ---------- pages/index.js ----------
const I1 = /^import \{ DEFAULT_NEW_BADGE, isNewProduct \} from "@\/lib\/newBadge";([^\n]*)\n/gm;
const I2 = /GRID_ORDER_KEY, NEWSLETTER_KEY\]\)/g;
const I3 = /^([ \t]*)const \[newsletterCfg, setNewsletterCfg\] = useState\(DEFAULT_NEWSLETTER\);[^\n]*\n/gm;
const I4 = /^([ \t]*)setNewsletterCfg\(parseNewsletterSetting\(newsletterRow \? newsletterRow\.value : null\)\);[ \t]*\n/gm;
const I5 = /isNewProduct\(p\.createdAt, DEFAULT_NEW_BADGE, Date\.now\(\)\)/g;
one(idx.text, I1, "index.js : import de lib/newBadge (etape 1)");
one(idx.text, I2, "index.js : liste des cles de reglages « ..., GRID_ORDER_KEY, NEWSLETTER_KEY] »");
one(idx.text, I3, "index.js : etat newsletterCfg");
one(idx.text, I4, "index.js : lecture du reglage de la newsletter");
one(idx.text, I5, "index.js : appel du badge isNewProduct(p.createdAt, DEFAULT_NEW_BADGE, ...)");
if (/\bnewBadgeCfg\b|\bsetNewBadgeCfg\b/.test(idx.text)) problems.push("index.js contient deja newBadgeCfg");

if (problems.length) fail("rien n'a ete ecrit :\n  - " + problems.join("\n  - "));

// ---------- application en memoire ----------
let m = media.text
  .replace(M1, (s) => s + `import AdminNewBadge from "@/components/AdminNewBadge"; // ${MARK}\n`)
  .replace(M2, (s, a, b) => a + "4" + b)
  .replace(M3, (s, indent) => s + `${indent}<AdminNewBadge />\n`);
let i = idx.text
  .replace(I1, (s, tail) => `import { DEFAULT_NEW_BADGE, NEW_BADGE_KEY, parseNewBadgeSetting, isNewProduct } from "@/lib/newBadge";${tail}\n`)
  .replace(I2, () => "GRID_ORDER_KEY, NEWSLETTER_KEY, NEW_BADGE_KEY])")
  .replace(I3, (s, indent) => s + `${indent}const [newBadgeCfg, setNewBadgeCfg] = useState(DEFAULT_NEW_BADGE); // ${MARK} : reglage du badge Nouveaute (admin : Contenu du site > Vitrine & ambiance)\n`)
  .replace(I4, (s, indent) => s +
    `${indent}// ${MARK} : ligne absente ou illisible -> valeurs par defaut (active, 14 jours)\n` +
    `${indent}const newBadgeRow = settingRows.find((r) => r.key === NEW_BADGE_KEY) || null;\n` +
    `${indent}setNewBadgeCfg(parseNewBadgeSetting(newBadgeRow ? newBadgeRow.value : null));\n`)
  .replace(I5, () => "isNewProduct(p.createdAt, newBadgeCfg, Date.now())");

// ---------- controles finaux ----------
const checks = [
  [/count=\{4\}/.test(m) && (m.match(/count=\{3\}/g) || []).length === (media.text.match(/count=\{3\}/g) || []).length - 1, "compteur du panneau passe de 3 a 4 (les autres panneaux ne changent pas)"],
  [(m.match(/<AdminNewBadge \/>/g) || []).length === 1, "carte montee une seule fois"],
  [m.indexOf("<AdminGridOrder />") < m.indexOf("<AdminNewBadge />") && m.indexOf("<AdminNewBadge />") < m.indexOf("</AdminAccordionSection>"), "carte placee apres « Ordre des bijoux » et dans le meme panneau"],
  [(m.match(/import AdminNewBadge from/g) || []).length === 1, "import de la carte (1 fois)"],
  [(i.match(/NEW_BADGE_KEY\]\)/g) || []).length === 1, "cle ajoutee a la requete des reglages"],
  [(i.match(/\.in\("key", \[/g) || []).length === (idx.text.match(/\.in\("key", \[/g) || []).length, "aucune requete ajoutee"],
  [!/isNewProduct\(p\.createdAt, DEFAULT_NEW_BADGE/.test(i), "les valeurs fixes de l'etape 1 ont disparu du badge"],
  [/isNewProduct\(p\.createdAt, newBadgeCfg, Date\.now\(\)\)/.test(i), "le badge lit le reglage"],
  [(i.match(/setNewBadgeCfg\(parseNewBadgeSetting/g) || []).length === 1, "reglage lu une seule fois"],
  [/useState\(DEFAULT_NEW_BADGE\)/.test(i), "etat initial = valeurs par defaut"],
  [i.indexOf("const [newBadgeCfg") < i.indexOf("setNewBadgeCfg(parseNewBadgeSetting"), "etat declare avant son usage"],
  [(m.match(new RegExp(MARK, "g")) || []).length >= 1 && (i.match(new RegExp(MARK, "g")) || []).length >= 2, "marqueurs"],
];
for (const [ok, what] of checks) if (!ok) fail(`controle final : ${what} - echec. Rien n'a ete ecrit.`);

fs.writeFileSync(P.media, media.crlf ? m.replace(/\n/g, "\r\n") : m, "utf8");
fs.writeFileSync(P.index, idx.crlf ? i.replace(/\n/g, "\r\n") : i, "utf8");
console.log("[patch-new-badge-admin] 2 fichiers mis a jour :");
console.log("[patch-new-badge-admin]   - components/AdminSiteMedia.js : carte « Badge Nouveaute » dans Vitrine & ambiance (compteur 3 -> 4)");
console.log("[patch-new-badge-admin]   - pages/index.js : le site lit le reglage new_badge (aucun appel de plus)");
console.log("[patch-new-badge-admin] RAPPEL : executez supabase_new_badge.sql dans Supabase AVANT de deployer ce code.");
