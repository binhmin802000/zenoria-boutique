// ============================================================
// scripts/patch-compte-correctifs-1.mjs — Espace cliente : 2 correctifs après tests de l'étape 1.4
// ZENORIA_ACCOUNT_FIX1_V1
//
// Correctif 1 (important) : « Mes commandes » et le raccourci de l'accueil lisaient la table
// `orders` sans filtrer explicitement sur le compte connecté. Pour une administratrice, la règle
// de sécurité RLS (is_admin() OR user_id = auth.uid()) renvoie ALORS LES COMMANDES DE TOUTES LES
// CLIENTES, pas seulement les siennes — d'où des commandes « livrées » qui n'appartiennent pas à
// l'administratrice, inexplicables dans « Mes avis » (qui, lui, filtre bien sur auth.uid() côté
// base, dans list_reviewable_items). Correction : ajout explicite de .eq("user_id", user.id).
//
// Correctif 2 (confort) : chaque clic sur une rubrique du menu forçait un retour en haut de la
// page entière (au-dessus du bandeau), même en plein milieu d'une longue liste. Le menu étant
// « sticky », ce saut n'est pas nécessaire : il est retiré.
//
// Usage (dossier zenoria, branche espace-client, étape 1.4 appliquée) :
//   node scripts\patch-compte-correctifs-1.mjs --dry-run
//   node scripts\patch-compte-correctifs-1.mjs
// ============================================================
import fs from "node:fs";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_ACCOUNT_FIX1_V1";
const REL = "pages/compte.js";
const DRY = process.argv.includes("--dry-run");
const fail = (m) => { console.error(`\n\u2717 ARRÊT : ${m}\nAucun fichier n'a été modifié.\n`); process.exit(1); };

console.log(`\nEspace cliente : correctifs après tests (commandes + défilement)${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
let branch = "";
try { branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim(); } catch (e) { fail("git introuvable ou dossier hors dépôt"); }
if (branch !== "espace-client") fail(`branche actuelle « ${branch} » : passez sur espace-client`);
console.log("  \u2713 branche espace-client");

if (!fs.existsSync(REL)) fail(`${REL} introuvable`);
const raw = fs.readFileSync(REL, "utf8");
const bom = raw.charCodeAt(0) === 0xfeff;
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
let t = (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");

if (t.includes(MARK)) { console.log("  \u00b7 déjà appliqué, rien à faire.\n"); process.exit(0); }
if (!t.includes("ZENORIA_ACCOUNT_STEP14_V1")) fail("l'étape 1.4 n'est pas appliquée sur pages/compte.js");
console.log("  \u2713 étape 1.4 présente");

const ORDERS_OLD = `supabase.from("orders").select("*").in("status", CUSTOMER_VISIBLE_STATUSES).order("created_at", { ascending: false }),`;
const ORDERS_NEW = `supabase.from("orders").select("*").eq("user_id", user.id).in("status", CUSTOMER_VISIBLE_STATUSES).order("created_at", { ascending: false }), // ${MARK} : filtre explicite (ne pas dépendre de la RLS, qui laisse un compte admin tout voir)`;
let n = t.split(ORDERS_OLD).length - 1;
if (n !== 1) fail(`repère « requête orders » trouvé ${n} fois (1 attendu)`);
t = t.replace(ORDERS_OLD, ORDERS_NEW);
console.log("  \u2713 correctif 1 appliqué (commandes filtrées sur le compte connecté)");

const SCROLL_OLD = `    window.scrollTo({ top: 0, behavior: "smooth" });\n`;
n = t.split(SCROLL_OLD).length - 1;
if (n !== 1) fail(`repère « défilement en haut de page » trouvé ${n} fois (1 attendu)`);
t = t.replace(SCROLL_OLD, `    // ${MARK} : plus de retour forcé en haut de page (le menu reste visible, sticky)\n`);
console.log("  \u2713 correctif 2 appliqué (plus de saut de défilement au clic sur une rubrique)");

if (DRY) { console.log("\nVérification réussie : 1 fichier serait écrit. Rien n'a été modifié.\n"); process.exit(0); }
fs.writeFileSync(REL, (bom ? "\uFEFF" : "") + (eol === "\r\n" ? t.replace(/\n/g, "\r\n") : t), "utf8");
console.log(`\n  \u2713 ${REL} modifié\n\nTerminé. Suite : npm run build, puis testez à nouveau Mes commandes et Mes avis.\n`);
