// ZENORIA - Mise a jour du contenu de confidentialite.js + retrait bandeau
// ============================================================
// Ce script modifie UNIQUEMENT pages/confidentialite.js, et
// seulement si TOUS les controles reussissent. Si un seul echoue,
// AUCUNE ecriture n'est faite.
//
// Usage :
//   node scripts/patch-confidentialite-contenu.mjs --dry-run
//   node scripts/patch-confidentialite-contenu.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "confidentialite.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");
const hasCRLF = /\r\n/.test(original);
const EOL = hasCRLF ? "\r\n" : "\n";

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

function countSubstring(haystack, needle) {
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

let text = original;

// ------------------------------------------------------------
// A — Section "responsable" (ligne par ligne)
// ------------------------------------------------------------
let linesA = text.split(/\r\n|\n/);
const RESP_NEEDLE = "Le site Zenoria est édité par <Todo>";
const respIdxs = [];
linesA.forEach((l, i) => { if (l.includes(RESP_NEEDLE)) respIdxs.push(i); });
if (respIdxs.length !== 1) {
  fail(`section "responsable" : attendu 1 ligne contenant ${JSON.stringify(RESP_NEEDLE)}, trouve ${respIdxs.length}.`);
}
const respIdx = respIdxs[0];
if (!linesA[respIdx + 1] || !linesA[respIdx + 1].includes("<Todo>adresse e-mail de contact</Todo>")) {
  fail('section "responsable" : la ligne suivante ne contient pas le <Todo> adresse e-mail attendu.');
}
const respIndentMatch = linesA[respIdx].match(/^(\s*)/);
const respIndent = respIndentMatch ? respIndentMatch[1] : "            ";
const newRespLine = `${respIndent}Le site Zenoria est édité par une entreprise individuelle immatriculée sous le numéro SIRET 821 828 183 00011. Pour toute question sur vos données : bagues.mandala@proton.me.`;
linesA = [...linesA.slice(0, respIdx), newRespLine, ...linesA.slice(respIdx + 2)];
text = linesA.join(EOL);
console.log('OK repere : section "Qui est responsable de vos donnees ?" (ligne par ligne)');

// ------------------------------------------------------------
// B — "Les connexions a votre compte" : retire le <Todo> redondant
// ------------------------------------------------------------
text = (function () {
  const oldStr = "navigateur sont enregistrés. Seuls les administrateurs du site y ont accès, pour la sécurité des comptes. <Todo>durée de conservation</Todo>";
  const count = countSubstring(text, oldStr);
  if (count !== 1) {
    fail(`puce "Les connexions a votre compte" : attendu 1 occurrence exacte, trouve ${count}.`);
  }
  console.log('OK repere : puce "Les connexions a votre compte" (retrait du Todo redondant)');
  return text.replace(oldStr, "navigateur sont enregistrés. Seuls les administrateurs du site y ont accès, pour la sécurité des comptes.");
})();

// ------------------------------------------------------------
// C — "Commandes et paiement" (ligne par ligne)
// ------------------------------------------------------------
let linesC = text.split(/\r\n|\n/);
const PAIEMENT_NEEDLE = "pas encore actif.";
const paiementIdxs = [];
linesC.forEach((l, i) => { if (l.includes(PAIEMENT_NEEDLE) && l.includes("Commandes et paiement")) paiementIdxs.push(i); });
if (paiementIdxs.length !== 1) {
  fail(`puce "Commandes et paiement" : attendu 1 ligne contenant ${JSON.stringify(PAIEMENT_NEEDLE)} et "Commandes et paiement", trouve ${paiementIdxs.length}.`);
}
const paiementIdx = paiementIdxs[0];
if (!linesC[paiementIdx + 1] || !linesC[paiementIdx + 1].includes("durées de conservation légales")) {
  fail('puce "Commandes et paiement" : la ligne suivante ne contient pas "durées de conservation légales".');
}
const paiementIndentMatch = linesC[paiementIdx].match(/^(\s*)/);
const paiementIndent = paiementIndentMatch ? paiementIndentMatch[1] : "              ";
const newPaiementLine = `${paiementIndent}<strong>Commandes et paiement.</strong> Lorsque vous passez commande, nous enregistrons les articles commandés, le montant, votre adresse de livraison et votre numéro de téléphone (facultatif). Le paiement par carte bancaire est traité directement par Stripe, certifié PCI-DSS : vos coordonnées bancaires ne sont à aucun moment transmises ni conservées par Zenoria. Les données de commande sont conservées pendant la durée légale de conservation des documents commerciaux et comptables (10 ans).`;
linesC = [...linesC.slice(0, paiementIdx), newPaiementLine, ...linesC.slice(paiementIdx + 2)];
text = linesC.join(EOL);
console.log('OK repere : puce "Commandes et paiement" (ligne par ligne)');

// ------------------------------------------------------------
// D — Vercel (ligne par ligne)
// ------------------------------------------------------------
let linesD = text.split(/\r\n|\n/);
const VERCEL_NEEDLE = "héberge le site.";
const vercelIdxs = [];
linesD.forEach((l, i) => { if (l.includes(VERCEL_NEEDLE) && l.includes("Vercel")) vercelIdxs.push(i); });
if (vercelIdxs.length !== 1) {
  fail(`puce "Vercel" : attendu 1 ligne contenant ${JSON.stringify(VERCEL_NEEDLE)} et "Vercel", trouve ${vercelIdxs.length}.`);
}
const vercelIdx = vercelIdxs[0];
if (!linesD[vercelIdx].includes("<Todo>")) {
  fail('puce "Vercel" : aucun <Todo> trouve sur la ligne reperee.');
}
const vercelIndentMatch = linesD[vercelIdx].match(/^(\s*)/);
const vercelIndent = vercelIndentMatch ? vercelIndentMatch[1] : "              ";
const newVercelLine = `${vercelIndent}<strong>Vercel</strong> héberge le site. Données hébergées à Dublin, Irlande.`;
linesD = [...linesD.slice(0, vercelIdx), newVercelLine, ...linesD.slice(vercelIdx + 1)];
text = linesD.join(EOL);
console.log('OK repere : puce "Vercel" (ligne par ligne)');

// ------------------------------------------------------------
// E — Supabase (ligne par ligne)
// ------------------------------------------------------------
let linesE = text.split(/\r\n|\n/);
const SUPABASE_NEEDLE = "héberge la base de données";
const supabaseIdxs = [];
linesE.forEach((l, i) => { if (l.includes(SUPABASE_NEEDLE) && l.includes("Supabase")) supabaseIdxs.push(i); });
if (supabaseIdxs.length !== 1) {
  fail(`puce "Supabase" : attendu 1 ligne contenant ${JSON.stringify(SUPABASE_NEEDLE)} et "Supabase", trouve ${supabaseIdxs.length}.`);
}
const supabaseIdx = supabaseIdxs[0];
if (!linesE[supabaseIdx].includes("<Todo>")) {
  fail('puce "Supabase" : aucun <Todo> trouve sur la ligne reperee.');
}
const supabaseIndentMatch = linesE[supabaseIdx].match(/^(\s*)/);
const supabaseIndent = supabaseIndentMatch ? supabaseIndentMatch[1] : "              ";
const newSupabaseLine = `${supabaseIndent}<strong>Supabase</strong> héberge la base de données, l'authentification et les fichiers (photos et vidéos). Données hébergées à Dublin, Irlande.`;
linesE = [...linesE.slice(0, supabaseIdx), newSupabaseLine, ...linesE.slice(supabaseIdx + 1)];
text = linesE.join(EOL);
console.log('OK repere : puce "Supabase" (ligne par ligne)');

// ------------------------------------------------------------
// F — Resend (ligne par ligne)
// ------------------------------------------------------------
let linesF = text.split(/\r\n|\n/);
const RESEND_NEEDLE = "envoie les e-mails liés aux comptes";
const resendIdxs = [];
linesF.forEach((l, i) => { if (l.includes(RESEND_NEEDLE) && l.includes("Resend")) resendIdxs.push(i); });
if (resendIdxs.length !== 1) {
  fail(`puce "Resend" : attendu 1 ligne contenant ${JSON.stringify(RESEND_NEEDLE)} et "Resend", trouve ${resendIdxs.length}.`);
}
const resendIdx = resendIdxs[0];
if (!linesF[resendIdx].includes("<Todo>")) {
  fail('puce "Resend" : aucun <Todo> trouve sur la ligne reperee.');
}
const resendIndentMatch = linesF[resendIdx].match(/^(\s*)/);
const resendIndent = resendIndentMatch ? resendIndentMatch[1] : "              ";
const newResendLine = `${resendIndent}<strong>Resend</strong> envoie les e-mails liés aux comptes. Données hébergées à Dublin, Irlande.`;
linesF = [...linesF.slice(0, resendIdx), newResendLine, ...linesF.slice(resendIdx + 1)];
text = linesF.join(EOL);
console.log('OK repere : puce "Resend" (ligne par ligne)');

// ------------------------------------------------------------
// G — Commentaire VERSION PROVISOIRE (haut du fichier)
// ------------------------------------------------------------
let lines = text.split(/\r\n|\n/);
const commentIdxs = [];
lines.forEach((l, i) => { if (l.includes("VERSION PROVISOIRE")) commentIdxs.push(i); });
if (commentIdxs.length !== 1) {
  fail(`commentaire VERSION PROVISOIRE : attendu 1 occurrence, trouve ${commentIdxs.length}.`);
}
lines = [...lines.slice(0, commentIdxs[0]), ...lines.slice(commentIdxs[0] + 1)];
console.log("OK repere : commentaire VERSION PROVISOIRE supprime");

// ------------------------------------------------------------
// H — Bandeau visuel "Version provisoire"
// ------------------------------------------------------------
const bannerStartIdxs = [];
lines.forEach((l, i) => { if (l.includes('data-testid="draft-notice"')) bannerStartIdxs.push(i); });
if (bannerStartIdxs.length !== 1) {
  fail(`bandeau draft-notice : attendu 1 occurrence, trouve ${bannerStartIdxs.length}.`);
}
const bStart = bannerStartIdxs[0];
let bClose = -1;
for (let i = bStart; i < Math.min(lines.length, bStart + 8); i++) {
  if (lines[i].trim() === "</div>") { bClose = i; break; }
}
if (bClose === -1) fail("bandeau draft-notice : fermeture </div> introuvable.");
const bannerBlock = lines.slice(bStart, bClose + 1).join(" ");
if (!bannerBlock.includes("Version provisoire")) {
  fail("bandeau draft-notice : texte attendu absent du bloc repere.");
}
lines = [...lines.slice(0, bStart), ...lines.slice(bClose + 1)];
console.log('OK repere : bandeau visuel "Version provisoire" supprime');

text = lines.join(EOL);

// ------------------------------------------------------------
// DIAGNOSTIC (toujours affiche, avant les garde-fous)
// ------------------------------------------------------------
console.log("");
console.log("--- DIAGNOSTIC ---");
console.log("Todo restants       :", countSubstring(text, "<Todo>"));
console.log("Version provisoire  :", countSubstring(text, "Version provisoire"));
console.log("SIRET               :", countSubstring(text, "821 828 183 00011"));
console.log("Contact (email)     :", countSubstring(text, "bagues.mandala@proton.me"));
console.log("Dublin, Irlande     :", countSubstring(text, "Dublin, Irlande"));
console.log("Logo                :", countSubstring(text, "logo-facture.png"));
console.log("------------------");
console.log("");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
if (countSubstring(text, "<Todo>") !== 0) fail(`garde-fou final : il reste ${countSubstring(text, "<Todo>")} balise(s) <Todo>.`);
if (countSubstring(text, "Version provisoire") !== 0) fail("garde-fou final : le bandeau est encore present.");
if (countSubstring(text, "821 828 183 00011") !== 1) fail("garde-fou final : le SIRET est absent.");
if (countSubstring(text, "bagues.mandala@proton.me") < 1) fail("garde-fou final : le contact est absent.");
if (countSubstring(text, "Dublin, Irlande") !== 3) fail(`garde-fou final : attendu 3 occurrences de "Dublin, Irlande" (Vercel, Supabase, Resend), trouve ${countSubstring(text, "Dublin, Irlande")}.`);
if (countSubstring(text, "logo-facture.png") !== 1) fail("garde-fou final : le logo a disparu.");
console.log("OK garde-fou : plus aucun <Todo>, bandeau retire, SIRET/contact/hebergeurs presents");

if (text === original) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");

if (dryRun) {
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}