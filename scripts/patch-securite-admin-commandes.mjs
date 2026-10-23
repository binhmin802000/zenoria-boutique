// ============================================================
// scripts/patch-securite-admin-commandes.mjs — SÉCURISATION DE /api/admin/orders/update-status
// ZENORIA_API_ADMIN_ORDER_STATUS_V2 / ZENORIA_ADMIN_ORDER_AUTH_V1
//
// Problème corrigé : la route update-status.js n'avait AUCUNE vérification de session (son en-tête le dit :
// elle comptait sur la protection de la page /admin, qui n'existe que dans le navigateur). Toute personne
// connaissant l'adresse de la route pouvait marquer une commande « expédiée » ou « livrée », même non payée.
//
// Ce que fait le script :
//   REMPLACE pages/api/admin/orders/update-status.js
//       1. exige le jeton de connexion de l'administratrice (Authorization: Bearer ...), vérifié par Supabase,
//          puis contrôle que le compte figure dans la table admin_users (la même que la fonction SQL is_admin())
//          -> 401 si non connectée, 403 si connectée mais pas administratrice
//       2. contrôle le statut courant DANS l'écriture elle-même (atomique) :
//          « ship » et « deliver » seulement depuis « paid » ou « shipped » ; sinon 409 et rien n'est modifié
//   MODIFIE components/AdminCrm.js
//       l'appel updateOrderStatus envoie maintenant le jeton de la session administratrice
//
// Comportement conservé : mêmes transporteurs autorisés, mêmes messages d'historique, même format de réponse.
//
// Sécurités du script :
//   - refuse de tourner hors de la branche « securite-admin-commandes »
//   - toutes les vérifications passent AVANT la moindre écriture : si un repère manque, rien n'est modifié
//   - relançable sans risque (ce qui est déjà fait est ignoré)
//   - conserve les fins de ligne (CRLF ou LF) et l'UTF-8
//
// Usage :  node scripts\patch-securite-admin-commandes.mjs --dry-run     (vérification seule)
//          node scripts\patch-securite-admin-commandes.mjs               (application)
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DRY = process.argv.includes("--dry-run");
const BRANCH = "securite-admin-commandes";
const ROUTE_REL = "pages/api/admin/orders/update-status.js";
const CRM_REL = "components/AdminCrm.js";
const ROUTE_OLD_MARK = "ZENORIA_API_ADMIN_ORDER_STATUS_V1";
const ROUTE_NEW_MARK = "ZENORIA_API_ADMIN_ORDER_STATUS_V2";
const CRM_MARK = "ZENORIA_ADMIN_ORDER_AUTH_V1";
const ROOT = process.cwd();

function stop(msg) {
  console.error("  ✗ ARRÊT : " + msg);
  console.error("Aucun fichier n'a été modifié.");
  process.exit(1);
}
function git(args) {
  return execSync("git " + args, { cwd: ROOT, encoding: "utf8" }).trim();
}
const abs = (rel) => path.join(ROOT, rel);

// ------------------------------------------------------------
// Nouveau contenu de la route (aucun backtick ni dollar-accolade dans ce texte)
// ------------------------------------------------------------
const ROUTE_CONTENT = String.raw`// ZENORIA_API_ADMIN_ORDER_STATUS_V2
// ============================================================
// pages/api/admin/orders/update-status.js
//
// Marque une commande comme "expediee" (avec transporteur + numero de
// suivi) ou "livree", depuis l'admin (/admin > CRM > Commandes). Utilise
// la cle service_role (seule autorisee a ecrire dans orders), puisque la
// cle publique interdit toute ecriture sur cette table par securite.
//
// SECURITE (V2) :
//   1. La requete doit porter le jeton de connexion de l'administratrice
//      (en-tete Authorization: Bearer ...). Le jeton est verifie par Supabase,
//      puis le compte doit figurer dans la table admin_users (la meme que la
//      fonction SQL is_admin()).
//        - pas de jeton ou jeton invalide : 401
//        - connectee mais pas administratrice : 403
//        - verification impossible (Supabase indisponible) : 503
//   2. Le statut courant est controle ET applique dans la meme ecriture :
//        - "ship"    : seulement depuis "paid" (ou "shipped", pour corriger un suivi)
//        - "deliver" : seulement depuis "paid" ou "shipped"
//      Une commande en attente, en attente de virement, annulee, expiree ou
//      remboursee ne peut jamais etre expediee ni livree. Si le statut a change
//      entre-temps, l'ecriture ne touche aucune ligne et la route repond 409.
//
// Entree attendue (POST, JSON) :
//   {
//     orderId: number,
//     action: "ship" | "deliver",
//     carrier?: string,         // requis si action === "ship"
//     trackingNumber?: string,  // requis si action === "ship"
//   }
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_CARRIERS = ["Colissimo", "Mondial Relay", "Chronopost", "DPD", "Colis Privé"];
const SHIPPABLE_FROM = ["paid", "shipped"];
const DELIVERABLE_FROM = ["paid", "shipped"];
const MAX_TRACKING_LENGTH = 60;

// Renvoie l'utilisateur administrateur, ou null apres avoir deja repondu a la requete.
async function requireAdmin(req, res) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === "string" && /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) {
    res.status(401).json({ ok: false, error: "Connexion requise." });
    return null;
  }

  let authResult;
  try {
    authResult = await supabaseAdmin.auth.getUser(match[1]);
  } catch {
    res.status(503).json({ ok: false, error: "Verification de connexion indisponible. Reessayez." });
    return null;
  }
  if (authResult.error) {
    const status = Number(authResult.error.status);
    const unavailable = !status || status >= 500 || status === 429;
    res.status(unavailable ? 503 : 401).json({
      ok: false,
      error: unavailable ? "Verification de connexion indisponible. Reessayez." : "Session expiree ou invalide. Reconnectez-vous.",
    });
    return null;
  }
  const user = authResult.data && authResult.data.user;
  if (!user || !user.id) {
    res.status(401).json({ ok: false, error: "Session expiree ou invalide. Reconnectez-vous." });
    return null;
  }

  const { data: adminRow, error: adminErr } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminErr) {
    console.error("[admin-order-status] echec lecture admin_users :", adminErr.message);
    res.status(503).json({ ok: false, error: "Verification des droits indisponible. Reessayez." });
    return null;
  }
  if (!adminRow) {
    res.status(403).json({ ok: false, error: "Acces reserve aux administrateurs." });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { orderId, action, carrier, trackingNumber } = req.body || {};

    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "identifiant de commande invalide" });
    }

    if (action !== "ship" && action !== "deliver") {
      return res.status(400).json({ ok: false, error: "action invalide" });
    }

    if (action === "ship") {
      const trimmedTracking = String(trackingNumber || "").trim();
      if (!ALLOWED_CARRIERS.includes(carrier)) {
        return res.status(400).json({ ok: false, error: "transporteur invalide" });
      }
      if (!trimmedTracking) {
        return res.status(400).json({ ok: false, error: "numéro de suivi requis" });
      }
      if (trimmedTracking.length > MAX_TRACKING_LENGTH) {
        return res.status(400).json({ ok: false, error: "numéro de suivi trop long" });
      }

      // Le controle du statut fait partie de l'ecriture : rien n'est modifie si la commande n'est pas payee.
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("orders")
        .update({
          status: "shipped",
          carrier,
          tracking_number: trimmedTracking,
          shipped_at: new Date().toISOString(),
        })
        .eq("id", id)
        .in("status", SHIPPABLE_FROM)
        .select("id");

      if (updateErr) {
        console.error("[admin-order-status] échec mise à jour (ship) :", updateErr.message);
        return res.status(500).json({ ok: false, error: "échec de la mise à jour" });
      }
      if (!updated || updated.length === 0) {
        return res.status(409).json({ ok: false, error: "Cette commande ne peut pas être expédiée dans son état actuel : elle doit d'abord être payée." });
      }

      const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert({
        order_id: id,
        status: "shipped",
        note: "Expédiée via " + carrier + ", suivi : " + trimmedTracking + ".",
      });
      if (historyErr) {
        console.error("[admin-order-status] échec order_status_history (ship) :", historyErr.message);
      }

      return res.status(200).json({ ok: true });
    }

    // action === "deliver"
    const { data: delivered, error: deliverErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "delivered" })
      .eq("id", id)
      .in("status", DELIVERABLE_FROM)
      .select("id");

    if (deliverErr) {
      console.error("[admin-order-status] échec mise à jour (deliver) :", deliverErr.message);
      return res.status(500).json({ ok: false, error: "échec de la mise à jour" });
    }
    if (!delivered || delivered.length === 0) {
      return res.status(409).json({ ok: false, error: "Cette commande ne peut pas être marquée comme livrée dans son état actuel : elle doit être payée ou expédiée." });
    }

    const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert({
      order_id: id,
      status: "delivered",
      note: "Marquée comme livrée manuellement depuis l'administration.",
    });
    if (historyErr) {
      console.error("[admin-order-status] échec order_status_history (deliver) :", historyErr.message);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[admin-order-status] erreur inattendue :", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: "erreur serveur" });
  }
}
`;

// ------------------------------------------------------------
// Lecture / planification (rien n'est écrit ici)
// ------------------------------------------------------------
function readText(rel) {
  let raw = fs.readFileSync(abs(rel), "utf8");
  const bom = raw.charCodeAt(0) === 0xfeff;
  if (bom) raw = raw.slice(1);
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  return { raw, bom, eol };
}
function countMatches(src, re) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (src.match(g) || []).length;
}

// Liste des fichiers .js d'un dossier (récursif)
function walk(dirRel, acc) {
  const dir = abs(dirRel);
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = dirRel + "/" + name.name;
    if (name.isDirectory()) walk(rel, acc);
    else if (name.name.endsWith(".js")) acc.push(rel);
  }
  return acc;
}

function planRoute() {
  if (!fs.existsSync(abs(ROUTE_REL))) stop(ROUTE_REL + " introuvable.");
  const { raw, bom, eol } = readText(ROUTE_REL);
  if (raw.includes(ROUTE_NEW_MARK)) return { rel: ROUTE_REL, status: "déjà fait" };
  if (!raw.includes(ROUTE_OLD_MARK)) stop(ROUTE_REL + " ne porte pas le repère " + ROUTE_OLD_MARK + " : ce n'est pas la version attendue, je ne l'écrase pas.");
  const expected = ['ALLOWED_CARRIERS', '"ship"', '"deliver"', "order_status_history", "supabaseAdmin"];
  for (const k of expected) {
    if (!raw.includes(k)) stop(ROUTE_REL + " ne contient pas « " + k + " » : version inattendue, je ne l'écrase pas.");
  }
  const content = eol === "\r\n" ? ROUTE_CONTENT.replace(/\r?\n/g, "\r\n") : ROUTE_CONTENT;
  return { rel: ROUTE_REL, status: "remplacé", content, bom };
}

function planCrm() {
  const { raw, bom, eol } = readText(CRM_REL);
  if (raw.includes(CRM_MARK)) return { rel: CRM_REL, status: "déjà fait" };

  const fetchRe = /^([ \t]*)const res = await fetch\("\/api\/admin\/orders\/update-status", \{/m;
  const headersRe = /headers: \{ "Content-Type": "application\/json" \},(\r?\n[ \t]*)body: JSON\.stringify\(\{ orderId, action, \.\.\.extra \}\),/;
  if (countMatches(raw, fetchRe) !== 1) stop("repère introuvable dans " + CRM_REL + " : l'appel fetch vers update-status (attendu 1 fois).");
  if (countMatches(raw, headersRe) !== 1) stop("repère introuvable dans " + CRM_REL + " : les en-têtes de l'appel update-status (attendu 1 fois).");
  if (!/import \{[^}]*\bsupabase\b[^}]*\} from "@\/lib\/supabase"/.test(raw)) stop(CRM_REL + " n'importe pas « supabase » depuis @/lib/supabase.");

  let out = raw.replace(headersRe, (m, nl) =>
    'headers: { "Content-Type": "application/json", ...(adminToken ? { Authorization: "Bearer " + adminToken } : {}) },' +
    nl + "body: JSON.stringify({ orderId, action, ...extra }),"
  );
  out = out.replace(fetchRe, (m, indent) =>
    indent + "const { data: adminAuth } = await supabase.auth.getSession(); // " + CRM_MARK + eol +
    indent + "const adminToken = adminAuth && adminAuth.session ? adminAuth.session.access_token : null;" + eol +
    m
  );
  return { rel: CRM_REL, status: "modifié", content: out, bom };
}

// ------------------------------------------------------------
// Vérifications (AVANT toute écriture)
// ------------------------------------------------------------
console.log("Sécurisation de update-status" + (DRY ? " (VÉRIFICATION SEULE)" : ""));
console.log("");

if (!fs.existsSync(abs("package.json")) || !fs.existsSync(abs(CRM_REL))) {
  stop("lancez ce script depuis le dossier du projet (celui qui contient package.json).");
}

let branch;
try {
  branch = git("rev-parse --abbrev-ref HEAD");
} catch (e) {
  stop("impossible de lire la branche Git (Git est-il installé ?).");
}
if (branch !== BRANCH) stop("branche actuelle « " + branch + " » : passez d'abord sur " + BRANCH + " (git switch main, git pull origin main, puis git switch -c " + BRANCH + ").");
console.log("  ✓ branche " + BRANCH);

for (const rel of [ROUTE_REL, CRM_REL]) {
  const text = fs.readFileSync(abs(rel), "utf8");
  if (text.includes(ROUTE_NEW_MARK) || text.includes(CRM_MARK)) continue;
  let dirty = "";
  try {
    dirty = git('status --porcelain -- "' + rel + '"');
  } catch (e) {
    stop("impossible de lire l'état Git de " + rel + ".");
  }
  if (dirty) stop(rel + " a des modifications non enregistrées. Faites un commit (ou git restore " + rel + ") avant de lancer ce script.");
}
console.log("  ✓ fichiers concernés identiques au dernier commit");

// Aucun autre appelant ne doit utiliser la route : sinon il enverrait une requête sans jeton et serait refusé.
const callers = [];
for (const dir of ["pages", "components", "lib"]) {
  for (const rel of walk(dir, [])) {
    if (rel === ROUTE_REL) continue;
    const text = fs.readFileSync(abs(rel), "utf8");
    if (text.includes("/api/admin/orders/update-status")) callers.push(rel);
  }
}
if (callers.length !== 1 || callers[0] !== CRM_REL) {
  stop("la route update-status est appelée depuis : " + (callers.length ? callers.join(", ") : "aucun fichier") + " (attendu : seulement " + CRM_REL + "). Envoyez-moi ce résultat avant de continuer.");
}
console.log("  ✓ un seul appelant de la route (" + CRM_REL + ")");

const plans = [planRoute(), planCrm()];
console.log("  ✓ tous les repères ont été trouvés");

const toWrite = plans.filter((p) => p.content);

if (DRY) {
  console.log("");
  for (const p of plans) console.log("  · " + p.rel + " : " + (p.content ? "serait " + p.status : p.status));
  console.log("");
  console.log("Vérification réussie : " + toWrite.length + " fichier(s) seraient écrits. Rien n'a été modifié.");
  process.exit(0);
}

// ------------------------------------------------------------
// Écriture
// ------------------------------------------------------------
for (const p of plans) {
  if (!p.content) {
    console.log("  = " + p.rel + " déjà à jour");
    continue;
  }
  fs.writeFileSync(abs(p.rel), (p.bom ? "\uFEFF" : "") + p.content, "utf8");
  console.log("  ✓ " + p.rel + " " + p.status);
}
console.log("");
console.log("Terminé : " + toWrite.length + " fichier(s) écrit(s). Suite : npm run build, puis git status -sb.");
