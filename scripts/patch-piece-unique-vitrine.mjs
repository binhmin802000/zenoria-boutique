// ZENORIA - Lot 4A-4 (Vitrine)
// ============================================================
// Ce script modifie DEUX fichiers, et seulement si TOUS les controles
// reussissent sur les DEUX fichiers. Si un seul echoue, AUCUNE ecriture
// n'est faite (tout ou rien) — ni sur ProductSheet.js, ni sur index.js.
//
//   - components/ProductSheet.js
//   - pages/index.js
//
// Chantier :
//   A. ProductSheet.js : ajoute un prop optionnel "uniqueNotice" (null
//      par defaut), affiche juste apres le paragraphe "energy" et avant
//      "{extra}". Aucun impact sur pages/quiz.js qui n'utilise pas ce
//      prop (reste null, donc rien ne s'affiche).
//   B. pages/index.js :
//      B1. Ajoute un composant local UniqueNotice(), qui construit le
//          texte pièce unique + un lien de contact (e-mail en priorite,
//          WhatsApp en secours, sinon texte simple sans lien), a partir
//          de contactSettings deja charge par la page.
//      B2. Ajoute un badge "✦ Pièce unique" en bas-gauche de la photo,
//          sur la vignette du catalogue, visible uniquement si
//          p.isUnique === true. Ne touche ni a FamilyPill (haut-gauche)
//          ni a FavoriteButton (haut-droite).
//      B3. Passe uniqueNotice={<UniqueNotice .../>} a <ProductSheet>.
//
// Usage :
//   node scripts/patch-piece-unique-vitrine.mjs --dry-run
//   node scripts/patch-piece-unique-vitrine.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const sheetFile = path.join(process.cwd(), "components", "ProductSheet.js");
const indexFile = path.join(process.cwd(), "pages", "index.js");

for (const f of [sheetFile, indexFile]) {
  if (!fs.existsSync(f)) {
    console.error(`Fichier introuvable : ${f}`);
    console.error("Lancez ce script depuis la racine du projet (dossier zenoria).");
    process.exit(1);
  }
}

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite (ni ProductSheet.js, ni index.js).");
  process.exit(1);
}

function readLines(file) {
  const raw = fs.readFileSync(file, "utf8");
  const hasCRLF = /\r\n/.test(raw);
  const EOL = hasCRLF ? "\r\n" : "\n";
  return { raw, lines: raw.split(/\r\n|\n/), EOL };
}

function linesContaining(lines, needle) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  return idxs;
}

function linesEqualTrim(lines, needleTrim) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.trim() === needleTrim) idxs.push(i); });
  return idxs;
}

function requireUnique(idxs, label, needle) {
  if (idxs.length !== 1) {
    fail(`${label} : attendu 1 occurrence de ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  }
  return idxs[0];
}

function countSubstring(haystack, needle) {
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

// ------------------------------------------------------------
// FICHIER 1 — components/ProductSheet.js
// ------------------------------------------------------------
const sheet = readLines(sheetFile);
let sheetLines = sheet.lines.slice();

// A1 — signature : ajoute uniqueNotice = null
const SHEET_SIG_NEEDLE = "reviewsSlot = null }) {";
const sigIdx = requireUnique(linesContaining(sheetLines, SHEET_SIG_NEEDLE), "ProductSheet.js : signature du composant", SHEET_SIG_NEEDLE);
if ((sheetLines[sigIdx].match(/reviewsSlot = null \}\) \{/g) || []).length !== 1) {
  fail("ProductSheet.js : signature du composant, occurrence multiple sur la meme ligne (cas inattendu).");
}
sheetLines[sigIdx] = sheetLines[sigIdx].replace(SHEET_SIG_NEEDLE, "reviewsSlot = null, uniqueNotice = null }) {");
console.log("OK repere : ProductSheet.js — signature (uniqueNotice ajoute)");

// A2 — insertion apres le paragraphe "energy", avant {extra}
const ENERGY_LINE = '<p className="text-sm leading-6 text-[#70656a] mt-3 italic">{product.energy}</p>';
const energyIdxs = linesEqualTrim(sheetLines, ENERGY_LINE);
const energyIdx = requireUnique(energyIdxs, "ProductSheet.js : paragraphe energy", ENERGY_LINE);
const energyIndentMatch = sheetLines[energyIdx].match(/^(\s*)/);
const energyIndent = energyIndentMatch ? energyIndentMatch[1] : "";
sheetLines = [
  ...sheetLines.slice(0, energyIdx + 1),
  `${energyIndent}{uniqueNotice}`,
  ...sheetLines.slice(energyIdx + 1),
];
console.log("OK repere : ProductSheet.js — {uniqueNotice} insere apres le paragraphe energy");

// Verification que {extra} suit toujours (sanity check : pas d'insertion au mauvais endroit)
const extraIdxsAfter = sheetLines
  .map((l, i) => ({ l, i }))
  .filter(({ i }) => i > energyIdx && i <= energyIdx + 3)
  .filter(({ l }) => l.trim() === "{extra}");
if (extraIdxsAfter.length !== 1) {
  fail("ProductSheet.js : {extra} introuvable juste apres l'insertion de {uniqueNotice} (verification de position).");
}
console.log("OK verification : ProductSheet.js — {extra} toujours present juste apres {uniqueNotice}");

let sheetText = sheetLines.join(sheet.EOL);

if (countSubstring(sheetText, "uniqueNotice") !== 2) {
  fail(`ProductSheet.js : garde-fou final, attendu 2 occurrences de "uniqueNotice" (signature + rendu), trouve ${countSubstring(sheetText, "uniqueNotice")}.`);
}
console.log("OK garde-fou : ProductSheet.js — uniqueNotice present exactement 2 fois (signature + rendu)");

// ------------------------------------------------------------
// FICHIER 2 — pages/index.js
// ------------------------------------------------------------
const idx = readLines(indexFile);
let indexLines = idx.lines.slice();

// B1 — composant UniqueNotice, insere avant "export default function ZenoriaShop() {"
const ZSHOP_NEEDLE = "export default function ZenoriaShop() {";
const zshopIdx = requireUnique(linesContaining(indexLines, ZSHOP_NEEDLE), "index.js : debut du composant ZenoriaShop", ZSHOP_NEEDLE);

const uniqueNoticeComponentForIndex = [
  "// ZENORIA_PIECE_UNIQUE_STEP4_V1 : encart \"pièce unique\" affiché sur la fiche produit ouverte.",
  "// Réutilise contactSettings déjà chargé par la page (aucune nouvelle donnée à lire).",
  "function UniqueNotice({ product, contactSettings }) {",
  "  if (!product || product.isUnique !== true) return null;",
  "  const hasEmail = Boolean(contactSettings.email.enabled && contactSettings.email.value.trim());",
  "  const hasWhatsapp = Boolean(contactSettings.whatsapp.enabled && contactSettings.whatsapp.value.trim());",
  "  const subject = `À propos de « ${product.name} »`;",
  "  const emailBody = `Bonjour,\\n\\nLe modèle « ${product.name} » m'a touchée, et j'aimerais en savoir plus sur une création qui s'en inspire.\\n`;",
  "  const waText = `Bonjour, le modèle « ${product.name} » m'a touchée, j'aimerais en savoir plus sur une création qui s'en inspire.`;",
  "  const contactHref = hasEmail",
  "    ? buildMailtoLink(contactSettings.email.value.trim(), subject, emailBody)",
  "    : hasWhatsapp",
  "    ? buildWhatsAppLink(contactSettings.whatsapp.value.trim(), waText)",
  "    : null;",
  "  return (",
  '    <p className="text-sm leading-6 text-[#54434c] mt-4 rounded-xl bg-[#f5edf1] px-4 py-3">',
  '      <span className="font-medium">✦ Pièce unique</span> — Façonnée une seule fois, elle ne sera jamais reproduite à l\'identique.{" "}',
  "      {contactHref ? (",
  "        <>",
  '          Elle vous touche ?{" "}',
  '          <a href={contactHref} target={hasEmail ? undefined : "_blank"} rel="noopener noreferrer" className="underline text-[#8f6075]">Écrivez-nous</a>',
  '          {" "}: nous pouvons imaginer une création qui s\'en inspire.',
  "        </>",
  "      ) : (",
  '        "Contactez-nous pour en savoir plus sur une création qui s\'en inspire."',
  "      )}",
  "    </p>",
  "  );",
  "}",
  "",
];

indexLines = [
  ...indexLines.slice(0, zshopIdx),
  ...uniqueNoticeComponentForIndex,
  ...indexLines.slice(zshopIdx),
];
console.log("OK repere : index.js — composant UniqueNotice insere avant ZenoriaShop");

// B2 — badge sur la vignette catalogue, apres <FamilyPill .../>
const FAMILYPILL_LINE = '<FamilyPill product={p} families={families} />';
const fpIdxs = linesContaining(indexLines, FAMILYPILL_LINE);
const fpIdx = requireUnique(fpIdxs, "index.js : <FamilyPill .../> dans le catalogue", FAMILYPILL_LINE);
const fpIndentMatch = indexLines[fpIdx].match(/^(\s*)/);
const fpIndent = fpIndentMatch ? fpIndentMatch[1] : "";
const badgeLines = [
  `${fpIndent}{p.isUnique === true && (`,
  `${fpIndent}  <span className="pointer-events-none absolute left-4 bottom-4 z-10 inline-flex items-center gap-1 rounded-full bg-white/85 backdrop-blur px-3 py-1 text-xs text-[#8f6075]">`,
  `${fpIndent}    ✦ Pièce unique`,
  `${fpIndent}  </span>`,
  `${fpIndent})}`,
];
indexLines = [
  ...indexLines.slice(0, fpIdx + 1),
  ...badgeLines,
  ...indexLines.slice(fpIdx + 1),
];
console.log("OK repere : index.js — badge catalogue insere apres FamilyPill (bas-gauche)");

// B3 — passe uniqueNotice a <ProductSheet>, juste apres reviewsSlot={...}
const REVIEWSSLOT_NEEDLE = "reviewsSlot={selected && (reviewsCfg.enabled || isAdmin) ? <ProductReviewsList";
const rsIdxs = linesContaining(indexLines, REVIEWSSLOT_NEEDLE);
const rsIdx = requireUnique(rsIdxs, "index.js : prop reviewsSlot de <ProductSheet>", REVIEWSSLOT_NEEDLE);
const rsIndentMatch = indexLines[rsIdx].match(/^(\s*)/);
const rsIndent = rsIndentMatch ? rsIndentMatch[1] : "";
indexLines = [
  ...indexLines.slice(0, rsIdx + 1),
  `${rsIndent}uniqueNotice={<UniqueNotice product={selected} contactSettings={contactSettings} />}`,
  ...indexLines.slice(rsIdx + 1),
];
console.log("OK repere : index.js — prop uniqueNotice ajoutee a <ProductSheet>");

let indexText = indexLines.join(idx.EOL);

// Garde-fous finaux sur index.js
if (countSubstring(indexText, "function UniqueNotice(") !== 1) {
  fail('index.js : garde-fou final, attendu 1 definition de "function UniqueNotice(".');
}
if (countSubstring(indexText, "uniqueNotice={<UniqueNotice") !== 1) {
  fail('index.js : garde-fou final, attendu 1 occurrence de "uniqueNotice={<UniqueNotice".');
}
if (countSubstring(indexText, "✦ Pièce unique") < 2) {
  fail('index.js : garde-fou final, attendu au moins 2 occurrences de "✦ Pièce unique" (badge catalogue + encart fiche).');
}
if (countSubstring(indexText, '<FamilyPill product={p} families={families} />') !== 1) {
  fail("index.js : garde-fou final, FamilyPill a disparu ou est en double apres modification.");
}
if (countSubstring(indexText, 'active={favIds.includes(p.id)}') !== 1) {
  fail("index.js : garde-fou final, FavoriteButton du catalogue a disparu ou est en double apres modification.");
}
console.log("OK garde-fou : index.js — UniqueNotice, badge, prop et FamilyPill/FavoriteButton intacts");

// ------------------------------------------------------------
// Resultat
// ------------------------------------------------------------
if (sheetText === sheet.raw && indexText === idx.raw) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");
console.log("Modifications preparees :");
console.log("  - ProductSheet.js : prop uniqueNotice (texte complet affiche sur la fiche ouverte)");
console.log("  - index.js : composant UniqueNotice (texte + contact e-mail/WhatsApp), badge catalogue (bas-gauche), prop transmise a <ProductSheet>");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(sheetFile, sheetText, "utf8");
  fs.writeFileSync(indexFile, indexText, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), sheetFile)}`);
  console.log(`Fichier modifie : ${path.relative(process.cwd(), indexFile)}`);
}