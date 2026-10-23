// ============================================================
// scripts/patch-piece-unique-admin.mjs — LOT 3 : case « Pièce unique » dans l'admin (Collections)
// ZENORIA_PIECE_UNIQUE_STEP3_V1
//
// Prérequis : lot 1 (SQL) exécuté dans Supabase : products.is_unique, product_holds, fonctions admin_*,
// déclencheurs de blocage (supabase_lot1_1 à supabase_lot1_3).
//
// Ce que fait le script :
//   CRÉE    lib/pieceLock.js     traduction des erreurs de blocage de la base (PIECE_LOCKED, PRODUCT_HAS_REVIEWS),
//                                état d'une pièce (disponible / réservée / vendue) calculé depuis product_holds
//   MODIFIE pages/admin.js
//       - case « Pièce unique » à côté de « Visible sur le site » ; champ « Stock disponible » grisé quand elle est cochée
//       - is_unique envoyé à l'enregistrement
//       - avertissement non bloquant quand on coche « unique » sur une bague déjà commandée
//         (deuxième clic : « Enregistrer quand même »)
//       - liste des collections : badge « Unique » / « Réservée » / « Vendue », stock affiché « — » pour une pièce unique
//       - formulaire : encadré d'état d'une pièce réservée ou vendue (avec la référence ZEN-...) et bouton
//         « Remettre en vente » (seulement si la commande de la pièce vendue est « Remboursée »)
//       - suppression et masquage : l'erreur de blocage est enfin affichée (fenêtre du navigateur) au lieu d'être ignorée
//
// Ce que le script NE fait PAS : rien côté site public (badges, bouton de contact, quantité limitée à 1 : lot 4),
// aucune écriture en base. Tant qu'aucune bague n'est cochée « unique », le site se comporte comme avant.
//
// Sécurités :
//   - refuse de tourner hors de la branche « piece-unique-admin »
//   - toutes les vérifications passent AVANT la moindre écriture : si un repère manque, rien n'est modifié
//   - relançable sans risque (ce qui est déjà fait est ignoré)
//   - conserve les fins de ligne (CRLF ou LF) et l'UTF-8
//
// Usage :  node scripts\patch-piece-unique-admin.mjs --dry-run     (vérification seule)
//          node scripts\patch-piece-unique-admin.mjs               (application)
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DRY = process.argv.includes("--dry-run");
const BRANCH = "piece-unique-admin";
const MARK = "ZENORIA_PIECE_UNIQUE_STEP3_V1";
const ADMIN_REL = "pages/admin.js";
const LIB_REL = "lib/pieceLock.js";
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

// Découpe un bloc écrit tel quel, applique l'indentation et les fins de ligne du fichier cible
function block(text, indent, eol) {
  return text
    .replace(/^\r?\n/, "")
    .replace(/\r?\n$/, "")
    .split("\n")
    .map((l) => (l.length ? indent + l : l))
    .join(eol);
}

// ------------------------------------------------------------
// Nouveau fichier : lib/pieceLock.js (aucun backtick ni dollar-accolade dans ce texte)
// ------------------------------------------------------------
const LIB_CONTENT = String.raw`// ============================================================
// PIÈCES UNIQUES — blocages et état — ZENORIA_PIECE_UNIQUE_STEP3_V1
//
// Fichier SANS dépendance, utilisé par pages/admin.js.
//
// Erreurs renvoyées par la base (déclencheurs du lot 1.3, supabase_lot1_3_blocages.sql) :
//   PIECE_LOCKED:<id de la commande>:<reserved|sold>
//        décocher « Pièce unique », désactiver (si réservée) ou supprimer une pièce réservée ou vendue ;
//        supprimer une vraie commande qui détient une pièce
//   PRODUCT_HAS_REVIEWS
//        supprimer une bague qui a des avis (ils seraient supprimés avec elle)
//
// État d'une pièce : calculé depuis les lignes actives et vendues de product_holds (lisibles par l'administratrice) :
//   sold       : une réservation « consumed »
//   reserved   : une réservation « active » sans fin (virement) ou dont la fin n'est pas dépassée (carte)
//   available  : le reste (une réservation de carte échue ne bloque plus)
// ============================================================

export function parsePieceLockError(message) {
  const m = String(message === null || message === undefined ? "" : message);
  const lock = /PIECE_LOCKED:(\d+):(reserved|sold)/.exec(m);
  if (lock) return { kind: "locked", orderId: Number(lock[1]), state: lock[2] };
  if (m.indexOf("PRODUCT_HAS_REVIEWS") !== -1) return { kind: "reviews" };
  return null;
}

// action : "delete" (suppression), "toggle" (masquage) ou rien (enregistrement du formulaire)
export function pieceLockMessage(parsed, orderRef, action) {
  if (!parsed) return "";
  if (parsed.kind === "reviews") {
    return "Cette bague a des avis : désactivez-la (bouton « En ligne » de la liste) plutôt que de la supprimer, sinon ses avis seraient supprimés avec elle.";
  }
  const ref = orderRef ? "la commande " + orderRef : "une commande";
  if (parsed.state === "reserved") {
    return "Impossible : cette pièce est réservée par " + ref + ". Annulez ou confirmez d'abord cette commande.";
  }
  return (
    "Impossible : cette pièce est vendue (" + (orderRef ? "commande " + orderRef : "commande inconnue") + "). Marquez la commande comme remboursée, puis remettez la pièce en vente." +
    (action === "delete" ? " Pour la retirer de la vitrine, désactivez-la plutôt (bouton « En ligne » de la liste)." : "")
  );
}

export function pieceStateFor(productId, holds, now) {
  const t = typeof now === "number" ? now : Date.now();
  let reserved = null;
  const list = Array.isArray(holds) ? holds : [];
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (Number(h.product_id) !== Number(productId)) continue;
    if (h.status === "consumed") return { state: "sold", orderId: h.order_id };
    if (h.status === "active" && (!h.expires_at || new Date(h.expires_at).getTime() > t)) {
      reserved = { state: "reserved", orderId: h.order_id };
    }
  }
  return reserved || { state: "available", orderId: null };
}

export function pieceBadgeLabel(state) {
  if (state === "reserved") return "Réservée";
  if (state === "sold") return "Vendue";
  return "Unique";
}

// Erreurs de la fonction admin_relist_piece
export function relistErrorMessage(message) {
  const m = String(message === null || message === undefined ? "" : message);
  if (m.indexOf("ORDER_STATE") !== -1) return "Cette commande n'est pas (ou plus) au statut « Remboursée ».";
  if (m.indexOf("NOTHING_TO_RELIST") !== -1) return "Il n'y a plus de pièce à remettre en vente pour cette commande.";
  if (m.indexOf("FORBIDDEN") !== -1) return "Droits insuffisants pour remettre cette pièce en vente.";
  if (m.indexOf("ORDER_NOT_FOUND") !== -1) return "Commande introuvable.";
  return "Remise en vente impossible : " + m;
}
`;

// ------------------------------------------------------------
// Blocs insérés dans pages/admin.js (aucun backtick ni dollar-accolade : texte brut)
// ------------------------------------------------------------
const IMPORTS = String.raw`
import { formatOrderReference } from "@/lib/orderDisplay"; // ZENORIA_PIECE_UNIQUE_STEP3_V1
import { parsePieceLockError, pieceLockMessage, pieceStateFor, pieceBadgeLabel, relistErrorMessage } from "@/lib/pieceLock";
`;

const STATE = String.raw`
// ZENORIA_PIECE_UNIQUE_STEP3_V1 : pièces uniques (réservations lues pour l'administratrice)
const [pieceHolds, setPieceHolds] = useState([]);
const [holdOrders, setHoldOrders] = useState({});
const [uniqueWarning, setUniqueWarning] = useState(null);
`;

const FUNCTIONS = String.raw`
// ZENORIA_PIECE_UNIQUE_STEP3_V1 : réservations actives et pièces vendues, avec leur commande (pour la référence ZEN-...)
// Une panne de lecture n'empêche pas d'afficher la liste : on affiche simplement sans état de réservation.
const loadPieceHolds = async () => {
  try {
    const { data: holds, error: holdsErr } = await supabase
      .from("product_holds")
      .select("product_id, order_id, status, expires_at")
      .in("status", ["active", "consumed"]);
    if (holdsErr || !holds) {
      setPieceHolds([]);
      setHoldOrders({});
      return;
    }
    setPieceHolds(holds);
    const ids = Array.from(new Set(holds.map((h) => h.order_id)));
    if (ids.length === 0) {
      setHoldOrders({});
      return;
    }
    const { data: ords, error: ordsErr } = await supabase.from("orders").select("id, status, created_at").in("id", ids);
    if (ordsErr || !ords) {
      setHoldOrders({});
      return;
    }
    const map = {};
    ords.forEach((o) => {
      map[o.id] = o;
    });
    setHoldOrders(map);
  } catch {
    setPieceHolds([]);
    setHoldOrders({});
  }
};
// Message lisible pour une erreur de blocage de la base ("" si ce n'est pas une erreur de blocage)
const pieceLockText = (message, action) => {
  const parsed = parsePieceLockError(message);
  if (!parsed) return "";
  const order = parsed.orderId ? holdOrders[parsed.orderId] || { id: parsed.orderId } : null;
  return pieceLockMessage(parsed, order ? formatOrderReference(order) : "", action);
};
const relistPiece = async (orderId) => {
  const { error } = await supabase.rpc("admin_relist_piece", { p_order_id: orderId });
  if (error) {
    window.alert(relistErrorMessage(error.message));
    return;
  }
  setToast("Pièce remise en vente.");
  loadPieceHolds();
};
`;

const WARNING_CHECK = String.raw`
// ZENORIA_PIECE_UNIQUE_STEP3_V1 : avertissement (non bloquant) quand on coche « Pièce unique » sur une bague déjà commandée
if (productForm.id && productForm.is_unique === true) {
  const before = products.find((x) => x.id === productForm.id);
  const alreadyAsked = uniqueWarning && uniqueWarning.productId === productForm.id;
  if (before && before.is_unique !== true && !alreadyAsked) {
    try {
      const { data: stats, error: statsErr } = await supabase.rpc("admin_product_order_stats", { p_product_id: productForm.id });
      if (!statsErr && stats && (Number(stats.sold_orders) > 0 || Number(stats.open_orders) > 0)) {
        setUniqueWarning({
          productId: productForm.id,
          sold: Number(stats.sold_orders) || 0,
          open: Number(stats.open_orders) || 0,
          last: stats.last_sold_at || null,
        });
        return;
      }
    } catch {
      // l'avertissement est facultatif : l'enregistrement continue
    }
  }
}
`;

const UNIQUE_CHECKBOX = String.raw`
<label className="text-sm flex items-end sm:col-span-2" data-testid="unique-checkbox">
  <span className="flex items-start gap-2">
    <input type="checkbox" checked={productForm.is_unique === true} onChange={(e) => { setUniqueWarning(null); setProductForm({ ...productForm, is_unique: e.target.checked }); }} className="h-4 w-4 mt-0.5" />
    <span>
      <b>Pièce unique</b>{" "}
      <span className="text-xs text-[#8b737e]">(un seul exemplaire : réservée dès la validation d&apos;une commande, vendue une seule fois, quantité limitée à 1)</span>
    </span>
  </span>
</label>
{productForm.id && (() => {
  const info = pieceStateFor(productForm.id, pieceHolds);
  if (info.state === "available") return null;
  const order = holdOrders[info.orderId] || { id: info.orderId };
  const ref = formatOrderReference(order);
  const canRelist = info.state === "sold" && order.status === "refunded";
  return (
    <div className="sm:col-span-2 rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-xs leading-5" data-testid="piece-state-box">
      {info.state === "reserved"
        ? "Cette pièce est réservée par la commande " + ref + ". Annulez ou confirmez d'abord cette commande."
        : "Cette pièce est vendue (commande " + ref + ")." + (canRelist ? " La commande est remboursée : vous pouvez remettre la pièce en vente." : " Pour la remettre en vente, marquez d'abord la commande comme remboursée.")}
      {canRelist && (
        <div className="mt-2">
          <button type="button" onClick={() => relistPiece(info.orderId)} className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-8 text-xs">Remettre en vente</button>
        </div>
      )}
    </div>
  );
})()}
`;

const WARNING_BOX = String.raw`
{uniqueWarning && uniqueWarning.productId === productForm.id && (
  <div className="mt-4 rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-xs leading-5" role="alert" data-testid="unique-warning">
    <b>Attention :</b> {uniqueWarning.sold} commande(s) payée(s) et {uniqueWarning.open} commande(s) en attente contiennent déjà cette bague
    {uniqueWarning.last ? " (dernière vente le " + new Date(uniqueWarning.last).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) + ")" : ""}.
    {" "}Une pièce unique cochée sera proposée à la vente comme un exemplaire neuf. Cliquez sur « Enregistrer quand même » pour confirmer.
  </div>
)}
`;

const LIST_BADGE = String.raw`
{p.is_unique === true && (() => {
  const st = pieceStateFor(p.id, pieceHolds).state;
  return (
    <span className={"inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] " + (st === "sold" ? "bg-[#eeeaec] text-[#6b5f66]" : st === "reserved" ? "bg-amber-50 text-amber-800" : "bg-[#f7efdf] text-[#8a6116]")} data-testid="unique-badge">
      {pieceBadgeLabel(st)}
    </span>
  );
})()}
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

function planAdmin() {
  const { raw, bom, eol } = readText(ADMIN_REL);
  if (raw.includes(MARK)) return { rel: ADMIN_REL, status: "déjà fait" };
  if (raw.includes("is_unique")) stop(ADMIN_REL + " contient déjà « is_unique » sans le repère " + MARK + " : version inattendue, je ne modifie rien.");

  // Chaque repère doit exister EXACTEMENT une fois. Les expressions tolèrent CRLF/LF et les accents mal encodés.
  const edits = [
    {
      name: "import de parisTime",
      re: /^import \{ isoToParisLocal \} from "@\/lib\/parisTime";[^\r\n]*/m,
      fn: (m) => m + eol + block(IMPORTS, "", eol),
    },
    {
      name: "fin de emptyProduct (active: true, puis const emptyPromo)",
      re: /^([ \t]*)active: true,(\r?\n)\};(\s*)const emptyPromo = \{/m,
      fn: (m, ind, e1, ws) => ind + "is_unique: false, // " + MARK + e1 + ind + "active: true," + e1 + "};" + ws + "const emptyPromo = {",
    },
    {
      name: "état toast (const [toast, setToast])",
      re: /^([ \t]*)const \[toast, setToast\] = useState\(""\);[^\r\n]*/m,
      fn: (m, ind) => m + eol + block(STATE, ind, eol),
    },
    {
      name: "début de loadProducts",
      re: /^([ \t]*)const loadProducts = async \(\) => \{/m,
      fn: (m, ind) => block(FUNCTIONS, ind, eol) + eol + m,
    },
    {
      name: "lecture des collections (setProducts(data))",
      re: /^([ \t]*)if \(!error && data\) setProducts\(data\);[^\r\n]*/m,
      fn: (m, ind) => m + eol + ind + "await loadPieceHolds(); // " + MARK,
    },
    {
      name: "début de openEditProduct",
      re: /^([ \t]*)const openEditProduct = \(p\) => \{/m,
      fn: (m, ind) => m + eol + ind + "  setUniqueWarning(null); // " + MARK,
    },
    {
      name: "closeProductForm",
      re: /^([ \t]*)const closeProductForm = \(\) => setProductForm\(null\);/m,
      fn: (m, ind) => ind + "const closeProductForm = () => { setUniqueWarning(null); setProductForm(null); }; // " + MARK,
    },
    {
      name: "avant const payload (repère : ligne slug)",
      re: /^([ \t]*)const payload = \{(\s*slug: productForm\.slug\.trim\(\),)/m,
      fn: (m, ind, rest) => block(WARNING_CHECK, ind, eol) + eol + ind + "const payload = {" + rest,
    },
    {
      name: "fin du payload (active: productForm.active, puis setSaving)",
      re: /^([ \t]*)active: productForm\.active,(\s*\};\s*setSaving\(true\);)/m,
      fn: (m, ind, rest) => ind + "active: productForm.active," + eol + ind + "is_unique: productForm.is_unique === true, // " + MARK + rest,
    },
    {
      name: "message d'erreur d'enregistrement (repère : slug déjà utilisé)",
      re: /(\? "Cet identifiant \(slug\) est d.{1,2}j.{1,2} utilis.{1,2} par une autre collection\."\s*): "Erreur lors de l'enregistrement : " \+ result\.error\.message/,
      fn: (m, head) => head + ": pieceLockText(result.error.message) || \"Erreur lors de l'enregistrement : \" + result.error.message",
    },
    {
      name: "suppression d'une collection (delete)",
      re: /^([ \t]*)const \{ error \} = await supabase\.from\("products"\)\.delete\(\)\.eq\("id", p\.id\);[^\r\n]*/m,
      fn: (m, ind) =>
        m + eol + block(String.raw`
if (error) {
  window.alert(pieceLockText(error.message, "delete") || "Suppression impossible : " + error.message);
  return;
}
`, ind, eol),
    },
    {
      name: "masquage d'une collection (toggleActive)",
      re: /^([ \t]*)await supabase\.from\("products"\)\.update\(\{ active: !p\.active \}\)\.eq\("id", p\.id\);[^\r\n]*/m,
      fn: (m, ind) =>
        ind + "const { error } = await supabase.from(\"products\").update({ active: !p.active }).eq(\"id\", p.id);" + eol +
        ind + "if (error) window.alert(pieceLockText(error.message, \"toggle\") || \"Modification impossible : \" + error.message);",
    },
    {
      name: "badge dans la liste (sous {p.collection})",
      re: /^([ \t]*)<div className="text-xs text-\[#8b737e\]">\{p\.collection\}<\/div>[^\r\n]*/m,
      fn: (m, ind) => m + eol + block(LIST_BADGE, ind, eol),
    },
    {
      name: "colonne Stock de la liste",
      re: /<td className="px-4 py-3">\{p\.stock\}<\/td>/,
      fn: () => '<td className="px-4 py-3">{p.is_unique === true ? "—" : p.stock}</td>',
    },
    {
      name: "libellé « Stock disponible »",
      re: /<span className="text-xs text-\[#8b737e\]">Stock disponible<\/span>/,
      fn: () => '<span className="text-xs text-[#8b737e]">Stock disponible{productForm.is_unique === true ? " (ignoré : la disponibilité vient des réservations)" : ""}</span>',
    },
    {
      name: "champ « Stock disponible » (désactivation)",
      re: /(<input type="number" min="0" value=\{productForm\.stock\} onChange=\{\(e\) => setProductForm\(\{ \.\.\.productForm, stock: e\.target\.value \}\)\})(\s*)className="mt-1 w-full rounded-xl border border-\[#eadfe4\] px-3 h-10 outline-none focus:border-\[#8f6075\]" \/>/,
      fn: (m, head, nl) =>
        head + " disabled={productForm.is_unique === true}" + nl +
        'className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] disabled:opacity-50 disabled:bg-[#f6f1f3]" />',
    },
    {
      name: "case « Visible sur le site » (la case « Pièce unique » se place juste après)",
      re: /(<span>Visible sur le site<\/span>\s*<\/span>\r?\n)([ \t]*)<\/label>/,
      fn: (m, head, ind) => head + ind + "</label>" + eol + block(UNIQUE_CHECKBOX, ind, eol),
    },
    {
      name: "pied du formulaire (avant le bouton Enregistrer)",
      re: /^([ \t]*)<div className="flex gap-3 mt-6">(\s*<button type="submit" disabled=\{saving \|\| uploadingPhoto \|\| uploadingVideo\})/m,
      fn: (m, ind, rest) => block(WARNING_BOX, ind, eol) + eol + ind + '<div className="flex gap-3 mt-6">' + rest,
    },
    {
      name: "texte du bouton Enregistrer",
      re: /(disabled=\{saving \|\| uploadingPhoto \|\| uploadingVideo\}[^>]*>\s*)\{saving \? "Enregistrement\.\.\." : "Enregistrer"\}/,
      fn: (m, head) =>
        head + '{saving ? "Enregistrement..." : uniqueWarning && uniqueWarning.productId === productForm.id ? "Enregistrer quand même" : "Enregistrer"}',
    },
  ];

  const failed = [];
  for (const e of edits) {
    const c = countMatches(raw, e.re);
    if (c !== 1) failed.push("  - " + e.name + " (attendu 1 fois, trouvé " + c + ")");
  }
  if (failed.length) stop(failed.length + " repère(s) introuvable(s) ou ambigu(s) dans " + ADMIN_REL + " :\n" + failed.join("\n"));
  let out = raw;
  for (const e of edits) out = out.replace(e.re, e.fn);
  if (!out.includes(MARK)) stop("contrôle interne : le repère " + MARK + " est absent du résultat.");
  return { rel: ADMIN_REL, status: "modifié", content: out, bom, edits: edits.length };
}

function planLib() {
  if (fs.existsSync(abs(LIB_REL))) {
    const existing = fs.readFileSync(abs(LIB_REL), "utf8");
    if (existing.includes(MARK)) return { rel: LIB_REL, status: "déjà fait" };
    stop(LIB_REL + " existe déjà sans le repère " + MARK + " : je ne l'écrase pas. Renommez-le ou supprimez-le, puis relancez.");
  }
  return { rel: LIB_REL, status: "créé", content: LIB_CONTENT, bom: false };
}

// ------------------------------------------------------------
// Vérifications (AVANT toute écriture)
// ------------------------------------------------------------
console.log("Lot 3 : case « Pièce unique » dans l'admin" + (DRY ? " (VÉRIFICATION SEULE)" : ""));
console.log("");

if (!fs.existsSync(abs("package.json")) || !fs.existsSync(abs(ADMIN_REL))) {
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

{
  const text = fs.readFileSync(abs(ADMIN_REL), "utf8");
  if (!text.includes(MARK)) {
    let dirty = "";
    try {
      dirty = git('status --porcelain -- "' + ADMIN_REL + '"');
    } catch (e) {
      stop("impossible de lire l'état Git de " + ADMIN_REL + ".");
    }
    if (dirty) stop(ADMIN_REL + " a des modifications non enregistrées. Faites un commit (ou git restore " + ADMIN_REL + ") avant de lancer ce script.");
  }
}
console.log("  ✓ " + ADMIN_REL + " identique au dernier commit");

if (!fs.existsSync(abs("lib/orderDisplay.js")) || !/export function formatOrderReference\(/.test(fs.readFileSync(abs("lib/orderDisplay.js"), "utf8"))) {
  stop("lib/orderDisplay.js n'exporte pas formatOrderReference : version inattendue.");
}
console.log("  ✓ formatOrderReference disponible (lib/orderDisplay.js)");

const plans = [planLib(), planAdmin()];
console.log("  ✓ tous les repères ont été trouvés");

const toWrite = plans.filter((p) => p.content);

if (DRY) {
  console.log("");
  for (const p of plans) console.log("  · " + p.rel + " : " + (p.content ? "serait " + p.status + (p.edits ? " (" + p.edits + " modifications)" : "") : p.status));
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
  fs.mkdirSync(path.dirname(abs(p.rel)), { recursive: true });
  fs.writeFileSync(abs(p.rel), (p.bom ? "\uFEFF" : "") + p.content, "utf8");
  console.log("  ✓ " + p.rel + " " + p.status);
}
console.log("");
console.log("Terminé : " + toWrite.length + " fichier(s) écrit(s). Suite : npm run build, puis git status -sb.");
