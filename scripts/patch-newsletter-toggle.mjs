#!/usr/bin/env node
// ============================================================
// patch-newsletter-toggle.mjs
// ZENORIA_NEWSLETTER_V1
//
// Ajoute un interrupteur "Newsletter" dans Accueil > Configuration, pour afficher/masquer
// la section "Le cercle Zenoria" de l'accueil, sans rien supprimer du code existant.
//
// PRÉ-REQUIS : exécuter sql/supabase_newsletter.sql AVANT ce script (crée la clé, la
// contrainte, et amorce la ligne par défaut { enabled: false }).
//
// Fichiers modifiés :
//   - lib/configToggle.js   : nouvel interrupteur "newsletter_enabled"
//   - lib/configOverview.js : nouvelle section "Newsletter" dans Configuration
//   - pages/index.js        : lecture du réglage + section conditionnée par son état
//
// Usage : node scripts/patch-newsletter-toggle.mjs
// Idempotent : si déjà appliqué, ne fait rien. Si une ancre ne correspond pas EXACTEMENT
// dans l'un des 3 fichiers, le script s'arrête SANS RIEN ÉCRIRE NULLE PART (tout ou rien).
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_NEWSLETTER_V1";
const FILES = {
  toggle: path.join(process.cwd(), "lib", "configToggle.js"),
  overview: path.join(process.cwd(), "lib", "configOverview.js"),
  index: path.join(process.cwd(), "pages", "index.js"),
};

function fail(message) {
  console.error(`[patch-newsletter-toggle] ${message}`);
  process.exit(1);
}

function readNormalized(file) {
  if (!fs.existsSync(file)) fail(`fichier introuvable : ${file} (lancez le script depuis la racine du projet)`);
  const original = fs.readFileSync(file, "utf8");
  const usesCRLF = original.includes("\r\n");
  return { original, usesCRLF, content: original.replace(/\r\n/g, "\n") };
}

const toggleF = readNormalized(FILES.toggle);
const overviewF = readNormalized(FILES.overview);
const indexF = readNormalized(FILES.index);

const alreadyDone = [toggleF, overviewF, indexF].every((f) => f.content.includes(MARK));
if (alreadyDone) {
  console.log("[patch-newsletter-toggle] déjà appliqué dans les 3 fichiers, rien à faire.");
  process.exit(0);
}
if ([toggleF, overviewF, indexF].some((f) => f.content.includes(MARK))) {
  fail("état incohérent : le marqueur est présent dans certains fichiers mais pas tous. Vérifiez manuellement avant de relancer.");
}

// ------------------------------------------------------------
// 1) lib/configToggle.js — nouvel interrupteur
// ------------------------------------------------------------
const toggleAnchor =
  '  contact_signal: { key: "contact", path: ["signal", "enabled"], channel: "signal", on: "Signal affiché dans le pied de page.", off: "Signal masqué dans le pied de page." },\n' +
  '};\n';
if (toggleF.content.split(toggleAnchor).length - 1 !== 1) {
  fail("ancre introuvable (ou en double) dans lib/configToggle.js : fichier modifié depuis ? Rien n'a été écrit dans aucun fichier.");
}
const toggleReplacement =
  '  contact_signal: { key: "contact", path: ["signal", "enabled"], channel: "signal", on: "Signal affiché dans le pied de page.", off: "Signal masqué dans le pied de page." },\n' +
  '  newsletter_enabled: { // ' + MARK + '\n' +
  '    key: "newsletter",\n' +
  '    path: ["enabled"],\n' +
  '    on: "Newsletter activée : la section « Le cercle Zenoria » est visible en bas de l\'accueil.",\n' +
  '    off: "Newsletter désactivée : la section « Le cercle Zenoria » est masquée sur l\'accueil.",\n' +
  '  },\n' +
  '};\n';

// ------------------------------------------------------------
// 2) lib/configOverview.js — nouvelle section + clé lue
// ------------------------------------------------------------
const keysAnchor = 'export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact", "grid_order"]; // ZENORIA_CONFIG_R4_V1 : ordre des bijoux\n';
const ctAnchor = '  const ct = val("contact");\n';
const reviewsBlockAnchor =
  '  const reviews = [\n' +
  '    { id: "reviews_enabled", label: "Module avis", flag: rv ? flag(rv.enabled) : null, sub: "Dépôt, affichage, charte des avis" },\n' +
  '    textItem("reviews_mode", "Affichage", rv ? REVIEW_MODES[rv.mode] || str(rv.mode) : ""),\n' +
  '  ];\n';
const reviewsSectionAnchor = '    { id: "reviews", title: "Avis clientes", keys: "reviews", link: { group: "produits", tab: "site", anchor: "textes-legal", where: "Contenu du site › Textes & légal" }, items: reviews },\n';

for (const [label, anchor] of [
  ["CONFIG_KEYS", keysAnchor],
  ["val(\"contact\")", ctAnchor],
  ["bloc reviews", reviewsBlockAnchor],
  ["section reviews du tableau renvoyé", reviewsSectionAnchor],
]) {
  if (overviewF.content.split(anchor).length - 1 !== 1) {
    fail(`ancre « ${label} » introuvable (ou en double) dans lib/configOverview.js : fichier modifié depuis ? Rien n'a été écrit dans aucun fichier.`);
  }
}

const keysReplacement = 'export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact", "grid_order", "newsletter"]; // ' + MARK + '\n';
const ctReplacement = '  const ct = val("contact");\n  const nl = val("newsletter"); // ' + MARK + '\n';
const reviewsBlockReplacement =
  reviewsBlockAnchor +
  '\n' +
  '  // ---- Newsletter ---- ' + MARK + '\n' +
  '  const newsletter = [\n' +
  '    { id: "newsletter_enabled", label: "Section « Le cercle Zenoria »", flag: nl ? flag(nl.enabled) : null, sub: "Bloc d\'inscription en bas de l\'accueil (collecte non encore active)" },\n' +
  '  ];\n';
const reviewsSectionReplacement =
  reviewsSectionAnchor +
  '    { id: "newsletter", title: "Newsletter", keys: "newsletter", link: { group: "produits", tab: "site", anchor: "vitrine", where: "Contenu du site › Vitrine & ambiance" }, items: newsletter }, // ' + MARK + '\n';

// ------------------------------------------------------------
// 3) pages/index.js — import, clé de lecture, état, parse, affichage conditionnel
// ------------------------------------------------------------
const importAnchor = 'import { SITE_SETTINGS_TABLE, SEASON_FX_KEY, parseSeasonFxSetting, pickFxSeason } from "@/lib/siteSettings";\n';
const stateAnchor = '  const [paymentMethodsCfg, setPaymentMethodsCfg] = useState(DEFAULT_PAYMENT_METHODS);\n';
const keysListAnchor = '.in("key", [SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY, PAYMENT_METHODS_KEY, GRID_ORDER_KEY])';
const parseAnchor =
  '      const reviewsRow = settingRows.find((r) => r.key === REVIEWS_KEY) || null;\n' +
  '      setReviewsCfg(parseReviewsSetting(reviewsRow ? reviewsRow.value : null));\n';
const jsxAnchor =
  '        {/* NEWSLETTER */}\n' +
  '        <section id="newsletter" className="bg-[#d9c5cc] py-16">\n' +
  '          <div className="max-w-5xl mx-auto px-6 text-center">\n' +
  '            <div className="text-xs tracking-[.3em] uppercase mb-3">Le cercle Zenoria</div>\n' +
  '            <h2 className="font-serif text-4xl mb-4">Recevez nos nouveautés</h2>\n' +
  '            <p className="mb-7 text-[#61535a]">Inspirations, nouvelles créations et attentions exclusives.</p>\n' +
  '            <div className="max-w-xl mx-auto flex bg-white rounded-full p-1.5">\n' +
  '              <input placeholder="Votre adresse e-mail" className="flex-1 px-5 bg-transparent outline-none min-w-0" />\n' +
  '              <Button className="rounded-full bg-[#7b5266]">Je m&apos;inscris</Button>\n' +
  '            </div>\n' +
  '          </div>\n' +
  '        </section>\n';

for (const [label, anchor] of [
  ["import de siteSettings", importAnchor],
  ["état paymentMethodsCfg", stateAnchor],
  ["liste des clés lues (.in(\"key\", [...]))", keysListAnchor],
  ["parse de reviewsRow/setReviewsCfg", parseAnchor],
  ["section JSX <section id=\"newsletter\">", jsxAnchor],
]) {
  if (indexF.content.split(anchor).length - 1 !== 1) {
    fail(
      `ancre « ${label} » introuvable (ou en double) dans pages/index.js : fichier modifié depuis, ou texte différent de ce que j'ai supposé. ` +
      `Rien n'a été écrit dans aucun fichier. Envoyez-moi le texte exact autour de cette zone pour corriger l'ancre.`
    );
  }
}

const importReplacement =
  importAnchor +
  'import { NEWSLETTER_KEY, DEFAULT_NEWSLETTER, parseNewsletterSetting } from "@/lib/newsletterSettings"; // ' + MARK + '\n';
const stateReplacement =
  stateAnchor +
  '  const [newsletterCfg, setNewsletterCfg] = useState(DEFAULT_NEWSLETTER); // ' + MARK + '\n';
const keysListReplacement = keysListAnchor.replace(
  "GRID_ORDER_KEY])",
  "GRID_ORDER_KEY, NEWSLETTER_KEY])"
);
const parseReplacement =
  parseAnchor +
  '      // ' + MARK + ' : ligne absente ou illisible -> désactivé (section masquée par défaut)\n' +
  '      const newsletterRow = settingRows.find((r) => r.key === NEWSLETTER_KEY) || null;\n' +
  '      setNewsletterCfg(parseNewsletterSetting(newsletterRow ? newsletterRow.value : null));\n';
// NB : à l'intérieur de "{expr && ( ... )}", on est en contexte JS pur, pas en position
// d'enfant JSX : un commentaire "{/* ... */}" y serait un token invalide à cet endroit.
// Le commentaire explicatif est donc placé AVANT l'expression (position JSX valide, comme
// enfant de <main>) ; le commentaire "{/* NEWSLETTER */}" d'origine est simplement retiré
// (redondant avec celui ajouté juste au-dessus).
const jsxBodyNoComment = jsxAnchor.replace('        {/* NEWSLETTER */}\n', "");
const jsxReplacement =
  '        {/* ' + MARK + ' : section affichée seulement si activée dans Accueil > Configuration */}\n' +
  '        {newsletterCfg.enabled && (\n' +
  jsxBodyNoComment.replace(/\n$/, "") +
  '\n        )}\n';

// ------------------------------------------------------------
// Application : tout ou rien (les 3 fichiers sont réécrits ensemble, ou aucun ne l'est)
// ------------------------------------------------------------
let toggleOut = toggleF.content.replace(toggleAnchor, () => toggleReplacement);

let overviewOut = overviewF.content
  .replace(keysAnchor, () => keysReplacement)
  .replace(ctAnchor, () => ctReplacement)
  .replace(reviewsBlockAnchor, () => reviewsBlockReplacement)
  .replace(reviewsSectionAnchor, () => reviewsSectionReplacement);

let indexOut = indexF.content
  .replace(importAnchor, () => importReplacement)
  .replace(stateAnchor, () => stateReplacement)
  .replace(keysListAnchor, () => keysListReplacement)
  .replace(parseAnchor, () => parseReplacement)
  .replace(jsxAnchor, () => jsxReplacement);

function restoreEOL(f, text) {
  return f.usesCRLF ? text.replace(/\n/g, "\r\n") : text;
}

fs.writeFileSync(FILES.toggle, restoreEOL(toggleF, toggleOut), "utf8");
fs.writeFileSync(FILES.overview, restoreEOL(overviewF, overviewOut), "utf8");
fs.writeFileSync(FILES.index, restoreEOL(indexF, indexOut), "utf8");

console.log("[patch-newsletter-toggle] 3 fichiers mis à jour :");
console.log("[patch-newsletter-toggle]   - lib/configToggle.js   : interrupteur newsletter_enabled ajouté");
console.log("[patch-newsletter-toggle]   - lib/configOverview.js : section « Newsletter » ajoutée à Configuration");
console.log("[patch-newsletter-toggle]   - pages/index.js        : réglage lu, section conditionnée par newsletterCfg.enabled");
console.log("[patch-newsletter-toggle] N'oubliez pas lib/newsletterSettings.js (nouveau fichier, à copier avant de lancer ce script).");
