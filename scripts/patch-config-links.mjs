#!/usr/bin/env node
// ============================================================
// patch-config-links.mjs
// ZENORIA_CONFIG_LINKS_V1
//
// Corrige les liens « Modifier › » de Accueil › Configuration :
//
//  1. NEWSLETTER : le lien menait a « Vitrine & ambiance », ou aucune carte ne concerne la newsletter (son interrupteur est
//     deja dans la carte de Configuration). Le bouton est retire de cette carte ; une courte phrase l'explique.
//  2. ORDRE DES BIJOUX et BADGE NOUVEAUTE : le lien ouvrait la section « Vitrine & ambiance » (4 cartes) et s'arretait en haut
//     de la section. Il rejoint maintenant la CARTE visee (nouveau repere « card », a cote du repere de section).
//     Le texte du lien precise la carte : « Vitrine & ambiance › Ordre des bijoux ».
//  3. PAIEMENT, FACTURATION, MAINTENANCE : ces liens n'avaient aucun repere, donc la page gardait sa position de defilement
//     (en bas de Configuration) : la Maintenance s'ouvrait sur son « Historique », dernier bloc de l'onglet. Un lien sans
//     repere remonte maintenant en haut de page.
//
// Fichiers modifies (TOUT OU RIEN) : lib/configOverview.js · components/AdminConfig.js · components/AdminSiteMedia.js
// Aucune requete, aucun SQL. Les cartes AdminGridOrder.js et AdminNewBadge.js ne sont PAS modifiees : le repere est pose
// sur un conteneur autour d'elles dans AdminSiteMedia.js.
//
// Usage : node scripts/patch-config-links.mjs      Idempotent.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_CONFIG_LINKS_V1";
const P = {
  overview: path.join(process.cwd(), "lib", "configOverview.js"),
  config: path.join(process.cwd(), "components", "AdminConfig.js"),
  media: path.join(process.cwd(), "components", "AdminSiteMedia.js"),
};
const fail = (m) => { console.error(`[patch-config-links] ${m}`); process.exit(1); };
for (const f of Object.values(P)) if (!fs.existsSync(f)) fail(`fichier introuvable : ${path.relative(process.cwd(), f)} (lancez le script depuis la racine du projet). Rien n'a ete ecrit.`);
const read = (f) => { const raw = fs.readFileSync(f, "utf8"); return { crlf: raw.includes("\r\n"), text: raw.replace(/\r\n/g, "\n") }; };
const ov = read(P.overview), cf = read(P.config), md = read(P.media);

const done = [ov, cf, md].map((x) => x.text.includes(MARK));
if (done.every(Boolean)) { console.log("[patch-config-links] deja applique, rien a faire."); process.exit(0); }
if (done.some(Boolean)) fail("etat incoherent : le marqueur n'est present que dans certains des 3 fichiers. Verifiez manuellement. Rien n'a ete ecrit.");

const problems = [];
const count = (t, re) => (t.match(re) || []).length;
const one = (t, re, label) => { const n = count(t, re); if (n !== 1) problems.push(`${label} : trouve ${n} fois au lieu de 1`); };

// ---------- configOverview.js ----------
const O_TARGET = /^export function setSiteMediaTarget\(id\) \{\n  siteMediaTarget = SITE_MEDIA_GROUPS\.includes\(id\) \? id : null;\n\}\n/gm;
const O_CLEAR = /^export function clearSiteMediaTarget\(\) \{\n  siteMediaTarget = null;\n\}\n/gm;
const O_PEEK = /^export function peekSiteMediaTarget\(\) \{\n  return siteMediaTarget;\n\}\n/gm;
const O_GRID = /(\{ id: "grid_order", title: "Ordre des bijoux", keys: "grid_order", link: \{ group: "produits", tab: "site", anchor: "vitrine", )where: "Contenu du site › Vitrine & ambiance"( \})/g;
const O_BADGE = /(\{ id: "new_badge", title: "Badge Nouveauté", keys: "new_badge", link: \{ group: "produits", tab: "site", anchor: "vitrine", )where: "Contenu du site › Vitrine & ambiance"( \})/g;
const O_NEWS = /(\{ id: "newsletter", title: "Newsletter", keys: "newsletter", )link: \{ group: "produits", tab: "site", anchor: "vitrine", where: "Contenu du site › Vitrine & ambiance" \}(, items: newsletter \})/g;
one(ov.text, O_TARGET, "configOverview.js : setSiteMediaTarget");
one(ov.text, O_CLEAR, "configOverview.js : clearSiteMediaTarget");
one(ov.text, O_PEEK, "configOverview.js : peekSiteMediaTarget");
one(ov.text, O_GRID, "configOverview.js : section « Ordre des bijoux »");
one(ov.text, O_BADGE, "configOverview.js : section « Badge Nouveauté »");
one(ov.text, O_NEWS, "configOverview.js : section « Newsletter »");
if (/SITE_MEDIA_CARDS|siteMediaCard/.test(ov.text)) problems.push("configOverview.js contient deja SITE_MEDIA_CARDS ou siteMediaCard sans le marqueur " + MARK);

// ---------- AdminConfig.js ----------
const C_ONGO = /^([ \t]*)setSiteMediaTarget\(s\.link\.anchor \|\| null\);[^\n]*\n([ \t]*)onGo\(s\.link\.group, s\.link\.tab\);\n/gm;
const C_BTN = /^([ \t]*)<button\n[ \t]*type="button"\n[ \t]*onClick=\{\(\) => \{\n[\s\S]*?\n[ \t]*Modifier ›\n[ \t]*<\/button>\n/gm;
one(cf.text, C_ONGO, "AdminConfig.js : onClick du lien (setSiteMediaTarget puis onGo)");
one(cf.text, C_BTN, "AdminConfig.js : bouton « Modifier › » complet");

// ---------- AdminSiteMedia.js ----------
const M_IMPORT = /^import \{ peekSiteMediaTarget, clearSiteMediaTarget \} from "@\/lib\/configOverview";\n/gm;
const M_REF = /^([ \t]*)const targetRef = useRef\(peekSiteMediaTarget\(\)\);[^\n]*\n/gm;
const M_EFFECT = /^([ \t]*)const target = targetRef\.current;\n[ \t]*clearSiteMediaTarget\(\);\n[ \t]*if \(!target\) return undefined;\n[ \t]*const timer = setTimeout\(\(\) => \{\n[ \t]*const el = document\.querySelector\('\[data-config-anchor="' \+ target \+ '"\]'\);\n[ \t]*if \(el && typeof el\.scrollIntoView === "function"\) el\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\);\n[ \t]*\}, 250\);\n/gm;
const M_GRID = /^([ \t]*)<AdminGridOrder \/>\n/gm;
const M_BADGE = /^([ \t]*)<AdminNewBadge \/>\n/gm;
one(md.text, M_IMPORT, "AdminSiteMedia.js : import de peekSiteMediaTarget / clearSiteMediaTarget");
one(md.text, M_REF, "AdminSiteMedia.js : const targetRef");
one(md.text, M_EFFECT, "AdminSiteMedia.js : effet de defilement vers la cible");
one(md.text, M_GRID, "AdminSiteMedia.js : <AdminGridOrder />");
one(md.text, M_BADGE, "AdminSiteMedia.js : <AdminNewBadge />");
if (/peekSiteMediaCard|data-config-card/.test(md.text)) problems.push("AdminSiteMedia.js contient deja data-config-card sans le marqueur " + MARK);

// ---------- garde-fou : un AUTRE fichier lit-il section.link.* ? (la carte Newsletter n'aura plus de lien : link = null) ----------
function listJs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") out.push(...listJs(full)); }
    else if (/\.(js|jsx|mjs)$/.test(e.name)) out.push(full);
  }
  return out;
}
const mine = new Set(Object.values(P).map((f) => path.resolve(f)));
const otherReaders = [];
for (const dir of ["components", "lib", "pages"]) for (const f of listJs(path.join(process.cwd(), dir))) {
  if (mine.has(path.resolve(f))) continue;
  // Les commentaires sont retires avant l'analyse : un mot cite dans un commentaire n'est pas un usage (c'etait le cas de
  // lib/configToggle.js : « id de la ligne (buildConfigOverview) -> ... »). Limite connue : un « // » au milieu d'une chaine
  // precede d'un espace serait pris pour un commentaire ; aucun cas de ce genre dans ce projet.
  const t = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/[ \t]\/\/.*$/gm, "");
  const readsLink = /\.link\??\.(group|tab|anchor|where|card)\b/.test(t);
  const usesBuilder = /\bbuildConfigOverview\b/.test(t); // importe, appele ou reexporte : un usage reel une fois les commentaires retires
  if (readsLink || usesBuilder) otherReaders.push(path.relative(process.cwd(), f));
}
if (otherReaders.length) problems.push("un autre fichier lit les sections de Configuration (section.link.* ou buildConfigOverview) : " + otherReaders.join(", ") + ". La carte Newsletter n'aura plus de lien (link = null) : envoyez-moi ce(s) fichier(s) avant d'appliquer ce patch");

if (problems.length) fail("rien n'a ete ecrit :\n  - " + problems.join("\n  - "));

// ---------- application en memoire ----------
let o = ov.text
  .replace(O_TARGET, () =>
    `// ${MARK} : cartes de « Vitrine & ambiance » qu'un lien de Configuration peut viser directement (repere data-config-card).\n` +
    `export const SITE_MEDIA_CARDS = ["grid_order", "new_badge"];\n` +
    `let siteMediaCard = null;\n` +
    `export function setSiteMediaTarget(id, card) {\n` +
    `  siteMediaTarget = SITE_MEDIA_GROUPS.includes(id) ? id : null;\n` +
    `  siteMediaCard = siteMediaTarget && SITE_MEDIA_CARDS.includes(card) ? card : null; // ${MARK}\n` +
    `}\n` +
    `export function peekSiteMediaCard() {\n` +
    `  return siteMediaCard;\n` +
    `}\n`)
  .replace(O_CLEAR, () => `export function clearSiteMediaTarget() {\n  siteMediaTarget = null;\n  siteMediaCard = null; // ${MARK}\n}\n`)
  .replace(O_GRID, (s, a, b) => `${a}card: "grid_order", where: "Contenu du site › Vitrine & ambiance › Ordre des bijoux"${b}`)
  .replace(O_BADGE, (s, a, b) => `${a}card: "new_badge", where: "Contenu du site › Vitrine & ambiance › Badge Nouveauté"${b}`)
  .replace(O_NEWS, (s, a, b) => `${a}link: null${b}`); // ${MARK} : aucun ecran dedie, l'interrupteur est dans cette carte

let c = cf.text
  .replace(C_ONGO, (s, i1, i2) =>
    `${i1}setSiteMediaTarget(s.link.anchor || null, s.link.card || null); // ZENORIA_CONFIG_C1B_V1 : ouvre la bonne section de « Contenu du site » ; ${MARK} : et la carte visee\n` +
    `${i2}onGo(s.link.group, s.link.tab);\n` +
    `${i2}if (!s.link.anchor && typeof window !== "undefined" && typeof window.scrollTo === "function") window.scrollTo({ top: 0, behavior: "smooth" }); // ${MARK} : sans repere, on arrive en haut de l'onglet (et non sur son pied de page)\n`);
c = c.replace(C_BTN, (btn, indent) => `${indent}{s.link ? ( /* ${MARK} : pas de lien quand il n'y a aucun ecran dedie (Newsletter) */\n${btn.replace(/^/gm, "  ").replace(/^  $/gm, "")}${indent}) : null}\n`);
c = c.replace(/(\{s\.keys\}\n[ \t]*)\{s\.link\.where \? " · " \+ s\.link\.where : ""\}/, (m, pre) => `${pre}{s.link && s.link.where ? " · " + s.link.where : ""}`);

let m = md.text
  .replace(M_IMPORT, () => `import { peekSiteMediaTarget, peekSiteMediaCard, clearSiteMediaTarget } from "@/lib/configOverview"; // ${MARK}\n`)
  .replace(M_REF, (s, indent) => s + `${indent}const cardRef = useRef(peekSiteMediaCard()); // ${MARK} : carte visee dans la section (Ordre des bijoux, Badge Nouveaute), sinon la section\n`)
  .replace(M_EFFECT, (s, indent) =>
    `${indent}const target = targetRef.current;\n` +
    `${indent}const card = cardRef.current; // ${MARK}\n` +
    `${indent}clearSiteMediaTarget();\n` +
    `${indent}if (!target) return undefined;\n` +
    `${indent}const timer = setTimeout(() => {\n` +
    `${indent}  const cardEl = card ? document.querySelector('[data-config-card="' + card + '"]') : null; // ${MARK}\n` +
    `${indent}  const el = cardEl || document.querySelector('[data-config-anchor="' + target + '"]');\n` +
    `${indent}  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });\n` +
    `${indent}}, 250);\n`)
  .replace(M_GRID, (s, indent) => `${indent}<div data-config-card="grid_order" style={{ scrollMarginTop: 84 }}> {/* ${MARK} */}\n${indent}  <AdminGridOrder />\n${indent}</div>\n`)
  .replace(M_BADGE, (s, indent) => `${indent}<div data-config-card="new_badge" style={{ scrollMarginTop: 84 }}> {/* ${MARK} */}\n${indent}  <AdminNewBadge />\n${indent}</div>\n`);

// ---------- controles finaux ----------
const checks = [
  [/export function setSiteMediaTarget\(id, card\)/.test(o) && (o.match(/export function clearSiteMediaTarget/g) || []).length === 1 && (o.match(/export function peekSiteMediaTarget/g) || []).length === 1, "fonctions de cible : une seule definition chacune"],
  [/card: "grid_order", where: "Contenu du site › Vitrine & ambiance › Ordre des bijoux"/.test(o) && /card: "new_badge", where: "Contenu du site › Vitrine & ambiance › Badge Nouveauté"/.test(o), "textes et reperes des deux cartes"],
  [/\{ id: "newsletter", title: "Newsletter", keys: "newsletter", link: null, items: newsletter \}/.test(o), "newsletter sans lien"],
  [(o.match(/anchor: "vitrine"/g) || []).length === (ov.text.match(/anchor: "vitrine"/g) || []).length - 1, "un repere « vitrine » de moins (newsletter), les autres conserves"],
  [/s\.link\.card \|\| null/.test(c) && /window\.scrollTo\(\{ top: 0/.test(c) && /\{s\.link \? \(/.test(c) && /\) : null\}/.test(c), "AdminConfig : carte transmise, retour en haut, bouton conditionnel"],
  [(() => { // aucun acces a s.link.* hors du bloc « {s.link ? ( ... ) : null} » (sinon : plantage sur la carte Newsletter, dont link vaut null)
    const open = c.indexOf("{s.link ? ("), close = c.indexOf(") : null}", open);
    if (open < 0 || close < 0) return false;
    const outside = c.slice(0, open) + c.slice(close);
    return !/\bs\.link\.[a-z]/.test(outside.replace('s.link && s.link.where ? " · " + s.link.where : ""', "")); // seule expression gardee par « s.link && » autorisee hors du bloc
  })(), "AdminConfig : aucun acces a s.link.* en dehors du bloc protege"],
  [(c.match(/Modifier ›/g) || []).length === 1, "AdminConfig : le bouton existe toujours une seule fois"],
  [(m.match(/data-config-card="grid_order"/g) || []).length === 1 && (m.match(/data-config-card="new_badge"/g) || []).length === 1, "AdminSiteMedia : deux conteneurs de repere"],
  [m.indexOf('data-config-card="grid_order"') < m.indexOf("<AdminGridOrder />") && m.indexOf("<AdminGridOrder />") < m.indexOf("</div>", m.indexOf("<AdminGridOrder />")), "AdminSiteMedia : AdminGridOrder dans son conteneur"],
  [m.indexOf("<AdminNewBadge />") < m.indexOf("</AdminAccordionSection>"), "AdminSiteMedia : les cartes restent dans la section « Vitrine »"],
  [/peekSiteMediaCard/.test(m) && /document\.querySelector\('\[data-config-anchor="' \+ target \+ '"\]'\)/.test(m), "AdminSiteMedia : repli sur la section si la carte est introuvable"],
];
for (const [ok, what] of checks) if (!ok) fail(`controle final : ${what} - echec. Rien n'a ete ecrit.`);

const out = [[P.overview, ov, o], [P.config, cf, c], [P.media, md, m]];
for (const [f, src, text] of out) fs.writeFileSync(f, src.crlf ? text.replace(/\n/g, "\r\n") : text, "utf8");
console.log("[patch-config-links] 3 fichiers mis a jour :");
console.log("[patch-config-links]   - lib/configOverview.js : reperes de carte, Newsletter sans lien");
console.log("[patch-config-links]   - components/AdminConfig.js : lien conditionnel, carte visee, retour en haut de page");
console.log("[patch-config-links]   - components/AdminSiteMedia.js : defilement jusqu'a la carte (repli sur la section)");
