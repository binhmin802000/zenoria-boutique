#!/usr/bin/env node
// ============================================================
// patch-new-badge.mjs
// ZENORIA_NEW_BADGE_V1
//
// ETAPE 1 du badge « Nouveauté » : un badge en bas a droite de la photo du bijou, sur la grille de l'accueil,
// pendant 14 jours apres la creation du bijou (products.created_at). Un bijou modifie ne redevient pas « nouveau ».
//
//  - cree lib/newBadge.js (logique pure : duree, dates invalides, reglage) ;
//  - pages/index.js : import, transmission de created_at jusqu'a la vignette, badge (z-10, jamais cliquable : le clic
//    ouvre la fiche comme avant), place a l'oppose du badge « Piece unique » (bas a gauche) et du coeur (haut a droite).
//
// Aucune requete en plus, aucun script SQL. Valeurs fixes pour l'instant : actif, 14 jours.
// L'etape 2 (reglage dans l'administration, cle site_settings « new_badge ») remplacera DEFAULT_NEW_BADGE par ce reglage.
//
// Garde-fous (TOUT OU RIEN : aucun fichier n'est ecrit si l'un d'eux echoue) :
//  - chaque ancre doit exister exactement 1 fois ;
//  - la requete des bijoux doit etre identifiee sans ambiguite ; si elle liste des colonnes sans created_at, il est ajoute ;
//  - si FamilyPill est positionne en bas a droite, le script s'arrete (le badge le recouvrirait).
//
// Usage : node scripts/patch-new-badge.mjs      Idempotent.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_NEW_BADGE_V1";
const LIB_FILE = path.join(process.cwd(), "lib", "newBadge.js");
const INDEX_FILE = path.join(process.cwd(), "pages", "index.js");

const LIB_CONTENT = `// ${MARK}
// ============================================================
// lib/newBadge.js : badge « Nouveauté » des bijoux (logique pure, sans React ni appel réseau).
//
// Un bijou est « nouveau » pendant N jours après sa DATE DE CRÉATION (products.created_at). Modifier un bijou
// ne le rend jamais « nouveau » : updated_at n'est pas utilisé.
// Étape 1 : valeurs par défaut (actif, 14 jours). Étape 2 : réglage d'administration (clé site_settings « new_badge »,
// valeur { enabled: boolean, days: entier de 1 à 90 }), lu avec parseNewBadgeSetting.
// ============================================================
export const NEW_BADGE_KEY = "new_badge";
export const NEW_BADGE_MIN_DAYS = 1;
export const NEW_BADGE_MAX_DAYS = 90;
export const DEFAULT_NEW_BADGE = { enabled: true, days: 14 };
const DAY_MS = 86400000;

// Réglage lu en base -> réglage utilisable. Ligne absente ou illisible : valeurs par défaut (actif, 14 jours).
export function parseNewBadgeSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const enabled = typeof v.enabled === "boolean" ? v.enabled : DEFAULT_NEW_BADGE.enabled;
  const raw = typeof v.days === "string" && v.days.trim() !== "" ? Number(v.days) : v.days;
  const days =
    typeof raw === "number" && Number.isInteger(raw)
      ? Math.min(NEW_BADGE_MAX_DAYS, Math.max(NEW_BADGE_MIN_DAYS, raw))
      : DEFAULT_NEW_BADGE.days;
  return { enabled, days };
}

// createdAt : date de création (texte ISO ou Date). setting : réglage. nowMs : heure courante en millisecondes.
export function isNewProduct(createdAt, setting, nowMs) {
  const cfg = parseNewBadgeSetting(setting);
  if (!cfg.enabled) return false;
  let created = NaN;
  if (createdAt instanceof Date) created = createdAt.getTime();
  else if (typeof createdAt === "string") created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  const age = now - created;
  if (age < -DAY_MS) return false; // création située dans le futur de plus d'un jour : donnée aberrante
  return age < cfg.days * DAY_MS;
}
`;

const fail = (m) => { console.error(`[patch-new-badge] ${m}`); process.exit(1); };

if (!fs.existsSync(INDEX_FILE)) fail(`fichier introuvable : ${INDEX_FILE} (lancez le script depuis la racine du projet). Rien n'a ete ecrit.`);
const original = fs.readFileSync(INDEX_FILE, "utf8");
const libExists = fs.existsSync(LIB_FILE);
const libCurrent = libExists ? fs.readFileSync(LIB_FILE, "utf8").replace(/\r\n/g, "\n") : null;

if (original.includes(MARK)) {
  if (libCurrent === LIB_CONTENT) { console.log("[patch-new-badge] deja applique, rien a faire."); process.exit(0); }
  fail("etat incoherent : pages/index.js porte deja le patch mais lib/newBadge.js est absent ou different. Verifiez manuellement. Rien n'a ete ecrit.");
}
if (libExists && libCurrent !== LIB_CONTENT) fail("lib/newBadge.js existe deja avec un contenu different. Rien n'a ete ecrit.");

const crlf = original.includes("\r\n");
const text = original.replace(/\r\n/g, "\n");
const problems = [];
const count = (re) => (text.match(re) || []).length;

// ---------- E1 : import ----------
const IMPORT_RE = /^import SeasonFx from "@\/components\/SeasonFx";[^\n]*\n/gm;
if (count(IMPORT_RE) !== 1) problems.push(`import de SeasonFx trouve ${count(IMPORT_RE)} fois au lieu de 1`);
if (/\bisNewProduct\b|\bDEFAULT_NEW_BADGE\b/.test(text)) problems.push("isNewProduct ou DEFAULT_NEW_BADGE existe deja dans pages/index.js");

// ---------- E2 : transmettre created_at jusqu'a la vignette (independant de mapDbProduct) ----------
const LOAD_RE = /prodData\.map\(mapDbProduct\)\.map\(\(p\) => \(\{ \.\.\.p, pieceState:/g;
if (count(LOAD_RE) !== 1) problems.push(`chargement des bijoux « prodData.map(mapDbProduct).map((p) => ({ ...p, pieceState: » trouve ${count(LOAD_RE)} fois au lieu de 1`);

// ---------- E3 : la requete des bijoux doit renvoyer created_at ----------
const SELECT_RE = /(from\("products"\)\s*\.select\()(["'])([^"'\n]*)\2(\))/g;
const selects = [...text.matchAll(SELECT_RE)];
let chosen = null;
if (selects.length === 1) chosen = selects[0];
else if (selects.length > 1) {
  const withActive = selects.filter((m) => /^\s*\.eq\("active", true\)/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 60)));
  if (withActive.length === 1) chosen = withActive[0];
  else problems.push(`${selects.length} requetes from("products").select(...) trouvees et aucune ne se distingue par .eq("active", true) : envoyez-moi ces lignes`);
}
else problems.push('aucune requete from("products").select("...") trouvee dans pages/index.js : envoyez-moi la requete qui charge les bijoux');
let selectEdit = null;
if (chosen) {
  const cols = chosen[3];
  const hasAll = /(^|,)\s*\*\s*(,|$)/.test(cols);
  const hasCreated = /(^|[\s,])created_at([\s,]|$)/.test(cols);
  if (!hasAll && !hasCreated) selectEdit = { start: chosen.index, end: chosen.index + chosen[0].length, text: chosen[1] + chosen[2] + cols.replace(/\s+$/, "") + (/,\s/.test(cols) ? ", " : ",") + "created_at" + chosen[2] + chosen[4] };
}

// ---------- E4 : le badge, apres « Piece unique » et avant le coeur ----------
const CARD_RE = /(\u2726 Pi\S{1,3}ce unique\n[ \t]*<\/span>\n[ \t]*\)\}\n)([ \t]*)(<FavoriteButton\n[ \t]*active=\{favIds\.includes\(p\.id\)\})/g;
if (count(CARD_RE) !== 1) problems.push(`vignette du catalogue (« Piece unique » puis <FavoriteButton active={favIds.includes(p.id)} ) trouvee ${count(CARD_RE)} fois au lieu de 1`);

// ---------- Garde-fou : FamilyPill ne doit pas etre en bas a droite ----------
function scanFamilyPill() {
  const files = [{ name: "pages/index.js", text }];
  const dir = path.join(process.cwd(), "components");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith(".js")) files.push({ name: "components/" + f, text: fs.readFileSync(path.join(dir, f), "utf8") });
  for (const f of files) {
    const m = /(?:function|const)\s+FamilyPill\b/.exec(f.text);
    if (!m) continue;
    const chunk = f.text.slice(m.index, m.index + 1500);
    const bad = (chunk.match(/["'`][^"'`\n]*["'`]/g) || []).find((s) => /\babsolute\b/.test(s) && /\bbottom-/.test(s) && /\bright-/.test(s));
    return { where: f.name, bad: bad || null };
  }
  return { where: null, bad: null };
}
const pill = scanFamilyPill();
if (pill.bad) problems.push(`FamilyPill (${pill.where}) est positionne en bas a droite (${pill.bad}) : le badge le recouvrirait. Envoyez-moi ce composant`);

if (problems.length) fail("rien n'a ete ecrit :\n  - " + problems.join("\n  - "));

// ---------- application en memoire ----------
let out = text;
if (selectEdit) out = out.slice(0, selectEdit.start) + selectEdit.text + out.slice(selectEdit.end);
out = out.replace(IMPORT_RE, (m) => m + `import { DEFAULT_NEW_BADGE, isNewProduct } from "@/lib/newBadge"; // ${MARK}\n`);
out = out.replace(LOAD_RE, () => `prodData.map((row) => ({ ...mapDbProduct(row), createdAt: row.created_at /* ${MARK} */ })).map((p) => ({ ...p, pieceState:`);
out = out.replace(CARD_RE, (m, before, indent, fav) =>
  before +
  indent + `{/* ${MARK} : badge « Nouveauté » (bas à droite) pendant la durée réglée après la création du bijou ; jamais cliquable : le clic ouvre la fiche */}\n` +
  indent + `{isNewProduct(p.createdAt, DEFAULT_NEW_BADGE, Date.now()) && (\n` +
  indent + `  <span data-testid="new-badge" className="pointer-events-none absolute right-4 bottom-4 z-10 inline-flex items-center rounded-full bg-[#8f6075] px-3 py-1 text-xs font-medium text-white shadow-sm">\n` +
  indent + `    Nouveauté\n` +
  indent + `  </span>\n` +
  indent + `)}\n` +
  indent + fav);

for (const [ok, what] of [
  [(out.match(/isNewProduct\(p\.createdAt/g) || []).length === 1, "appel isNewProduct (1 fois)"],
  [(out.match(/data-testid="new-badge"/g) || []).length === 1, "badge (1 fois)"],
  [(out.match(/createdAt: row\.created_at/g) || []).length === 1, "created_at transmis (1 fois)"],
  [(out.match(/from "@\/lib\/newBadge"/g) || []).length === 1, "import (1 fois)"],
  [(out.match(new RegExp(MARK, "g")) || []).length >= 3, "marqueur"],
  [out.includes("right-4 bottom-4") && out.includes("left-4 bottom-4"), "les deux badges du bas, a gauche et a droite"],
]) if (!ok) fail(`controle final : ${what} absent apres patch. Rien n'a ete ecrit.`);

fs.mkdirSync(path.dirname(LIB_FILE), { recursive: true });
if (!libExists) fs.writeFileSync(LIB_FILE, crlf ? LIB_CONTENT.replace(/\n/g, "\r\n") : LIB_CONTENT, "utf8");
fs.writeFileSync(INDEX_FILE, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8");

console.log("[patch-new-badge] 2 fichiers mis a jour :");
console.log("[patch-new-badge]   - lib/newBadge.js (nouveau)");
console.log("[patch-new-badge]   - pages/index.js : badge « Nouveauté » bas a droite, 14 jours apres la creation");
console.log(selectEdit ? "[patch-new-badge]   - la requete des bijoux liste ses colonnes : created_at a ete ajoute" : "[patch-new-badge]   - la requete des bijoux renvoie deja created_at");
console.log(pill.where ? `[patch-new-badge]   - FamilyPill verifie (${pill.where}) : pas en bas a droite` : "[patch-new-badge]   - ATTENTION : FamilyPill introuvable, sa position n'a pas pu etre verifiee");
