#!/usr/bin/env node
// ============================================================
// patch-new-badge-config.mjs
// ZENORIA_NEW_BADGE_V3
//
// ETAPE 2b du badge « Nouveaute » : affichage dans Accueil › Configuration et dans le journal des reglages.
//
//  - lib/configOverview.js : nouvelle section « Badge Nouveaute » (lecture seule, apres « Ordre des bijoux »), avec
//    un lien vers Contenu du site › Vitrine & ambiance ; la cle « new_badge » est ajoutee a CONFIG_KEYS (la lecture
//    des reglages de cet ecran : AUCUNE requete de plus) ;
//  - lib/configLog.js : le journal affiche « Badge Nouveaute » au lieu de la cle brute « new_badge », « Duree
//    d'affichage » au lieu de « days », et « 14 jours » au lieu de « 14 ». Il ajoute aussi « Newsletter » : sans cela le
//    journal affiche la cle brute « newsletter » pour les changements de l'interrupteur de la newsletter.
//
// PREREQUIS : etape 2 appliquee (lib/newBadge.js present) et lib/newBadgeOverview.js copie dans le projet.
// Usage : node scripts/patch-new-badge-config.mjs      Idempotent. TOUT OU RIEN : si une ancre ne correspond pas, rien n'est ecrit.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_NEW_BADGE_V3";
const P = {
  overview: path.join(process.cwd(), "lib", "configOverview.js"),
  log: path.join(process.cwd(), "lib", "configLog.js"),
  lib: path.join(process.cwd(), "lib", "newBadge.js"),
  items: path.join(process.cwd(), "lib", "newBadgeOverview.js"),
};
const fail = (m) => { console.error(`[patch-new-badge-config] ${m}`); process.exit(1); };

for (const [k, f] of Object.entries(P)) if (!fs.existsSync(f)) {
  const hint = k === "items" ? " Copiez d'abord ce fichier dans le projet (il est livre avec ce script)." : k === "lib" ? " L'etape 2 du badge doit etre appliquee avant." : " Lancez le script depuis la racine du projet.";
  fail(`fichier introuvable : ${path.relative(process.cwd(), f)}.${hint} Rien n'a ete ecrit.`);
}
const read = (f) => { const raw = fs.readFileSync(f, "utf8"); return { raw, crlf: raw.includes("\r\n"), text: raw.replace(/\r\n/g, "\n") }; };
const ov = read(P.overview), lg = read(P.log), items = read(P.items), lib = read(P.lib);

const doneOv = ov.text.includes(MARK), doneLg = lg.text.includes(MARK);
if (doneOv && doneLg) { console.log("[patch-new-badge-config] deja applique, rien a faire."); process.exit(0); }
if (doneOv !== doneLg) fail("etat incoherent : le marqueur est present dans un seul des deux fichiers (lib/configOverview.js, lib/configLog.js). Verifiez manuellement. Rien n'a ete ecrit.");

const problems = [];
if (!/export function newBadgeOverviewItems\b/.test(items.text) || !items.text.includes(MARK)) problems.push("lib/newBadgeOverview.js n'est pas la bonne version (export ou marqueur " + MARK + " absent)");
if (!/export function parseNewBadgeSetting\b/.test(lib.text)) problems.push("lib/newBadge.js n'exporte pas parseNewBadgeSetting");
const one = (text, re, label) => { const n = (text.match(re) || []).length; if (n !== 1) problems.push(`${label} : trouve ${n} fois au lieu de 1`); };

// ---------- lib/configOverview.js ----------
const O1 = /^import \{ gridOrderOverviewItems \} from "@\/lib\/gridOrderOverview";[^\n]*\n/gm;
const O2 = /^export const CONFIG_KEYS = \[([^\]\n]*)\];/gm;
const O3 = /^([ \t]*)const gridOrderItems = gridOrderOverviewItems\(rows\.grid_order \|\| null, formatWhen\);[^\n]*\n/gm;
const O4 = /^([ \t]*)\{ id: "grid_order", title: "Ordre des bijoux", keys: "grid_order",[^\n]*\n/gm;
one(ov.text, O1, "configOverview.js : import de gridOrderOverviewItems");
one(ov.text, O2, "configOverview.js : liste CONFIG_KEYS");
one(ov.text, O3, "configOverview.js : const gridOrderItems = ...");
one(ov.text, O4, "configOverview.js : section « Ordre des bijoux »");
const keysInner = (ov.text.match(/^export const CONFIG_KEYS = \[([^\]\n]*)\];/m) || [, ""])[1];
if (/"new_badge"/.test(keysInner)) problems.push("CONFIG_KEYS contient deja « new_badge » sans le marqueur " + MARK);
if (/newBadgeOverviewItems|newBadgeItems/.test(ov.text)) problems.push("configOverview.js mentionne deja newBadgeOverviewItems sans le marqueur " + MARK);
// la cle ne sert a rien si CONFIG_KEYS n'est pas utilise pour lire les reglages : on exige au moins une utilisation en plus de la definition
const keyUses = (ov.text.match(/\bCONFIG_KEYS\b/g) || []).length;
if (keyUses < 2) problems.push("CONFIG_KEYS n'est utilise nulle part dans configOverview.js en dehors de sa definition : la lecture des reglages est ailleurs, la ligne s'afficherait toujours « par defaut ». Envoyez-moi loadSiteConfig (Get-Content lib\\configOverview.js)");

// ---------- lib/configLog.js ----------
const keyBlock = (lg.text.match(/export const LOG_KEY_LABELS = \{([\s\S]*?)\n\};/) || [, null])[1];
const fieldBlock = (lg.text.match(/export const LOG_FIELD_LABELS = \{([\s\S]*?)\n\};/) || [, null])[1];
if (keyBlock === null) problems.push("configLog.js : bloc LOG_KEY_LABELS introuvable");
if (fieldBlock === null) problems.push("configLog.js : bloc LOG_FIELD_LABELS introuvable");
const L1 = /^([ \t]*)grid_order: "Ordre des bijoux",[^\n]*\n/gm;
const L2 = /^([ \t]*)shuffledAt: "Dernier mélange manuel",[^\n]*\n/gm;
const L3 = /if \(field === "delay_days" \|\| field === "grace_days"\) \{/g;
one(lg.text, L1, "configLog.js : libelle grid_order");
one(lg.text, L2, "configLog.js : libelle shuffledAt");
one(lg.text, L3, "configLog.js : formatage des jours (delay_days / grace_days)");
if (keyBlock !== null && /^\s*new_badge:/m.test(keyBlock)) problems.push("LOG_KEY_LABELS contient deja new_badge");
if (fieldBlock !== null && /^\s*days:/m.test(fieldBlock)) problems.push("LOG_FIELD_LABELS contient deja « days »");
const needNewsletter = keyBlock !== null && !/^\s*newsletter:/m.test(keyBlock);

if (problems.length) fail("rien n'a ete ecrit :\n  - " + problems.join("\n  - "));

// ---------- application en memoire ----------
let o = ov.text
  .replace(O1, (s) => s + `import { newBadgeOverviewItems } from "@/lib/newBadgeOverview"; // ${MARK}\n`)
  .replace(O2, (s, inner) => `export const CONFIG_KEYS = [${inner.replace(/\s+$/, "")}, "new_badge"];`) // le commentaire d'origine de la ligne est conserve tel quel
  .replace(O3, (s, indent) => s + `${indent}const newBadgeItems = newBadgeOverviewItems(rows.new_badge || null); // ${MARK}\n`)
  .replace(O4, (s, indent) => s + `${indent}{ id: "new_badge", title: "Badge Nouveauté", keys: "new_badge", link: { group: "produits", tab: "site", anchor: "vitrine", where: "Contenu du site › Vitrine & ambiance" }, items: newBadgeItems }, // ${MARK}\n`);
let g = lg.text
  .replace(L1, (s, indent) => s + `${indent}new_badge: "Badge Nouveauté", // ${MARK}\n` + (needNewsletter ? `${indent}newsletter: "Newsletter", // ${MARK}\n` : ""))
  .replace(L2, (s, indent) => s + `${indent}days: "Durée d'affichage", // ${MARK}\n`)
  .replace(L3, () => `if (field === "delay_days" || field === "grace_days" || field === "days") { // ${MARK} : « days » = durée du badge Nouveauté`);

// ---------- controles finaux ----------
const checks = [
  [/CONFIG_KEYS = \[[^\]\n]*"new_badge"\];/.test(o) && (o.match(/"new_badge"/g) || []).length >= 3, "cle new_badge dans CONFIG_KEYS, et sections"],
  [(o.match(/newBadgeOverviewItems\(rows\.new_badge \|\| null\)/g) || []).length === 1, "items calcules une seule fois"],
  [(o.match(/items: newBadgeItems/g) || []).length === 1, "section ajoutee une seule fois"],
  [o.indexOf('id: "grid_order"') < o.indexOf('id: "new_badge"'), "section placee apres « Ordre des bijoux »"],
  [(o.match(/\{ id: "[a-z_]+", title:/g) || []).length === (ov.text.match(/\{ id: "[a-z_]+", title:/g) || []).length + 1, "exactement une section de plus"],
  [(g.match(/new_badge: "Badge Nouveauté"/g) || []).length === 1 && (g.match(/days: "Durée d'affichage"/g) || []).length === 1, "libelles du journal"],
  [/field === "grace_days" \|\| field === "days"\) \{/.test(g), "formatage des jours"],
  [!needNewsletter || (g.match(/newsletter: "Newsletter"/g) || []).length === 1, "libelle newsletter"],
  [o.split("\n").length - ov.text.split("\n").length === 3 && g.split("\n").length - lg.text.split("\n").length === (needNewsletter ? 3 : 2), "nombre de lignes ajoutees attendu (aucune ligne retiree)"],
];
for (const [ok, what] of checks) if (!ok) fail(`controle final : ${what} - echec. Rien n'a ete ecrit.`);

fs.writeFileSync(P.overview, ov.crlf ? o.replace(/\n/g, "\r\n") : o, "utf8");
fs.writeFileSync(P.log, lg.crlf ? g.replace(/\n/g, "\r\n") : g, "utf8");
console.log("[patch-new-badge-config] 2 fichiers mis a jour :");
console.log("[patch-new-badge-config]   - lib/configOverview.js : section « Badge Nouveaute » dans Accueil › Configuration");
console.log("[patch-new-badge-config]   - lib/configLog.js : libelles du journal (Badge Nouveaute, Duree d'affichage, jours" + (needNewsletter ? ", Newsletter" : "") + ")");
