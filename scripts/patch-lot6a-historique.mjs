// patch-lot6a-historique.mjs
// Lot 6a : sous-onglet « Historique des actions » dans CRM > Commandes (lecture seule, sans SQL).
//
//   1. nouveau composant OrderActionsHistory (toutes les lignes de order_status_history, de toutes les commandes)
//   2. deux sous-onglets en haut de AdminOrders : « Commandes » (écran actuel, inchangé) et « Historique des actions »
//   3. un clic sur une référence ramène à la liste avec cette commande ouverte
//
// Aucune requête nouvelle : AdminOrders charge déjà tout l'historique (statusHistoryByOrder).
// Le filtre « données de test » (case TEST) s'applique aussi à l'historique.
//
// Usage :  node scripts/patch-lot6a-historique.mjs --dry-run
//          node scripts/patch-lot6a-historique.mjs --apply
// Marqueur : ZENORIA_ORDERS_6A_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_ORDERS_6A_V1";
const FILE = path.join(process.cwd(), "components", "AdminCrm.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lot6a-historique.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail("components/AdminCrm.js introuvable (lancez le script depuis la racine du projet).");

const raw = fs.readFileSync(FILE, "utf8");
const hasBom = raw.charCodeAt(0) === 0xfeff;
const crlf = raw.includes("\r\n");
console.log("components/AdminCrm.js (fins de ligne " + (crlf ? "Windows CRLF" : "LF") + ")");

let src = (hasBom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");
const linesBefore = src.split("\n").length;

if (src.includes(MARK)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}

function occurrences(str, sub) {
  let n = 0;
  let i = str.indexOf(sub);
  while (i >= 0) {
    n += 1;
    i = str.indexOf(sub, i + sub.length);
  }
  return n;
}
function replaceOnce(anchor, replacement, label) {
  const n = occurrences(src, anchor);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  src = src.replace(anchor, () => replacement);
}

// ------------------------------------------------------------------
// Prérequis : les helpers utilises par le nouveau composant doivent exister
// ------------------------------------------------------------------
for (const [needle, label] of [
  ["function formatDateTime(", "formatDateTime"],
  ["function orderStatusBadge(", "orderStatusBadge"],
  ["const [statusHistoryByOrder, setStatusHistoryByOrder] = useState({});", "statusHistoryByOrder"],
  ["const baseOrders = orders.filter(", "baseOrders"],
  ["const setPreset = (preset) => {", "setPreset"],
]) {
  if (occurrences(src, needle) !== 1) fail("Prerequis introuvable ou ambigu : " + label + ".");
}
if (!/import \{[^}]*formatOrderReference[^}]*\} from "@\/lib\/orderDisplay"/.test(src)) fail("Import formatOrderReference introuvable.");

// ------------------------------------------------------------------
// 1. Composant OrderActionsHistory (insere juste avant AdminOrders)
// ------------------------------------------------------------------
const COMPONENT = `// ${MARK} : sous-onglet « Historique des actions » (lecture seule).
// Toutes les lignes du journal order_status_history, de toutes les commandes, les plus récentes d'abord.
// Filtres : statut, « visible par la cliente », recherche libre (référence, e-mail, note, auteur).
// L'auteur n'est enregistré que pour certaines actions (virement, annulation) ; sinon : « Automatique ou non renseigné ».
const HISTORY_PAGE_SIZE = 100;
const HISTORY_STATUS_OPTIONS = ["pending_transfer", "paid", "shipped", "delivered", "cancelled", "expired", "refunded", "pending"];

function OrderActionsHistory({ orders, historyByOrder, loading, onOpenOrder }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [visibleOnly, setVisibleOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);

  const rows = useMemo(() => {
    const list = [];
    (orders || []).forEach((o) => {
      ((historyByOrder && historyByOrder[o.id]) || []).forEach((h) => list.push({ order: o, entry: h }));
    });
    list.sort((a, b) => {
      const diff = new Date(b.entry.changed_at).getTime() - new Date(a.entry.changed_at).getTime();
      return diff !== 0 && !Number.isNaN(diff) ? diff : Number(b.entry.id) - Number(a.entry.id);
    });
    return list;
  }, [orders, historyByOrder]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(({ order, entry }) => {
    if (statusFilter && entry.status !== statusFilter) return false;
    if (visibleOnly && !entry.customer_visible) return false;
    if (!q) return true;
    const haystack = [formatOrderReference(order), String(order.id), order.guest_email, entry.note, entry.actor_email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
  const shown = filtered.slice(0, limit);
  const field = "rounded-full border border-[#eadfe4] bg-white px-3 h-9 text-[13px] outline-none focus:border-[#8f6075]";

  return (
    <div data-testid="orders-history">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setLimit(HISTORY_PAGE_SIZE); }}
          aria-label="Filtrer par statut"
          data-testid="orders-history-status"
          className={field}
        >
          <option value="">Tous les statuts</option>
          {HISTORY_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{orderStatusInfo(s).label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[13px] text-[#54434c]">
          <input
            type="checkbox"
            checked={visibleOnly}
            onChange={(e) => { setVisibleOnly(e.target.checked); setLimit(HISTORY_PAGE_SIZE); }}
            data-testid="orders-history-visible-only"
            className="h-4 w-4"
          />
          Visibles par la cliente seulement
        </label>
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(HISTORY_PAGE_SIZE); }}
          placeholder="Référence, e-mail, note ou auteur"
          aria-label="Rechercher dans l'historique"
          data-testid="orders-history-search"
          className={field + " flex-1 min-w-[200px]"}
        />
      </div>
      <p className="text-[12px] text-[#8b737e] mb-2" data-testid="orders-history-count" aria-live="polite">
        {loading ? "Chargement…" : filtered.length + " action" + (filtered.length > 1 ? "s" : "") + " sur " + rows.length}
      </p>
      <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto mb-4">
        <table className="w-full min-w-[720px] text-sm" data-testid="orders-history-table">
          <thead>
            <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Commande</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Auteur</th>
            </tr>
          </thead>
          <tbody>
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[#8b737e]" data-testid="orders-history-empty">Aucune action pour ces critères.</td>
              </tr>
            )}
            {shown.map(({ order, entry }) => (
              <tr key={entry.id} className="border-t border-[#eee2e5] align-top" data-testid="orders-history-row">
                <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[#8b737e]">{formatDateTime(entry.changed_at)}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpenOrder(order)} data-testid="orders-history-open" className="text-[#8f6075] underline whitespace-nowrap">
                    {formatOrderReference(order)}
                  </button>
                  <div className="text-[12px] text-[#8b737e]">{order.guest_email || "Compte client"}</div>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#54434c]">
                  {orderStatusBadge(entry.status)}
                  {entry.note && <span className="block mt-1 leading-5">{entry.note}</span>}
                  {entry.customer_visible && <span className="block text-[11px] text-[#8f6075]">Visible par la cliente</span>}
                </td>
                <td className="px-4 py-3 text-[12px] text-[#54434c]">
                  {entry.actor_email || <span className="text-[#8b737e]">Automatique ou non renseigné</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + HISTORY_PAGE_SIZE)}
          data-testid="orders-history-more"
          className="mb-4 rounded-full border border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1] text-xs font-medium px-4 h-9 transition"
        >
          Afficher plus ({filtered.length - shown.length} restantes)
        </button>
      )}
      <p className="text-[11px] leading-4 text-[#8b737e]">
        Toutes les actions enregistrées dans le journal des commandes. L&apos;auteur n&apos;est enregistré que pour certaines actions (virement, annulation) ; pour les autres, la colonne indique « Automatique ou non renseigné ». Un clic sur la référence ouvre la commande.
      </p>
    </div>
  );
}

`;
replaceOnce("export function AdminOrders() {\n", COMPONENT + "export function AdminOrders() {\n", "export function AdminOrders()");

// ------------------------------------------------------------------
// 2a. Etat « view » dans AdminOrders
// ------------------------------------------------------------------
{
  const re = /(const \[statusFilter, setStatusFilter\] = useState\("all"\);[^\n]*\n)/;
  const n = (src.match(new RegExp(re.source, "g")) || []).length;
  if (n !== 1) fail("Etat statusFilter : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  src = src.replace(re, (m) => m + '  const [view, setView] = useState("list"); // ' + MARK + ' : "list" (commandes) ou "history" (historique des actions)\n');
}

// ------------------------------------------------------------------
// 2b. Sous-onglets + bascule : on enveloppe tout ce qui suit l'en-tete (graphe, filtres, tableau, aide)
// ------------------------------------------------------------------
const ANCHOR_START = "      {/* ZENORIA_ORDERS_5B4_V1 : en-tête réorganisé.";
const SUBTABS = `      {/* ${MARK} : sous-onglets Commandes / Historique des actions */}
      <div className="flex gap-1 border-b border-[#eee2e5] mb-4" role="tablist" data-testid="orders-subtabs">
        {[
          ["list", "Commandes"],
          ["history", "Historique des actions"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            data-testid={"orders-subtab-" + key}
            className={\`px-4 h-10 text-sm rounded-t-lg border border-b-0 -mb-px transition \${view === key ? "bg-white border-[#eee2e5] font-medium text-[#412f3b]" : "bg-[#f5edf1] border-transparent text-[#8b737e] hover:text-[#412f3b]"}\`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "history" ? (
        <OrderActionsHistory
          orders={baseOrders}
          historyByOrder={statusHistoryByOrder}
          loading={loading}
          onOpenOrder={(order) => {
            setView("list");
            setStatusFilter("all");
            setPreset("all");
            setQuery(formatOrderReference(order));
            setOpenOrderId(order.id);
          }}
        />
      ) : (
      <>
`;
replaceOnce(ANCHOR_START, SUBTABS + ANCHOR_START, "Commentaire ZENORIA_ORDERS_5B4_V1 (debut de l'en-tete)");

// Fermeture : juste avant le « </> » final de AdminOrders (fin de fichier)
{
  const reTail = /(la prolongation et l&apos;annulation se font depuis le détail de la commande\.\n\s*<\/p>\n)(\s*<\/>\n\s*\);\n\}\s*)$/;
  if (!reTail.test(src)) fail("Fin de AdminOrders (paragraphe d'aide puis </>) introuvable : le fichier a probablement change.");
  src = src.replace(reTail, (m, p1, p2) => p1 + "      </>\n      )}\n" + p2);
}

// ------------------------------------------------------------------
// Contrôles finaux
// ------------------------------------------------------------------
if (occurrences(src, MARK) < 3) fail("Marqueur attendu au moins 3 fois, trouve " + occurrences(src, MARK) + ".");
if (occurrences(src, "function OrderActionsHistory(") !== 1) fail("OrderActionsHistory doit etre defini une seule fois.");
if (occurrences(src, "<OrderActionsHistory") !== 1) fail("OrderActionsHistory doit etre utilise une seule fois.");
if (occurrences(src, 'const [view, setView]') !== 1) fail("Etat view duplique.");
const open = occurrences(src, "<>\n");
const close = occurrences(src, "</>\n");
if (open !== close) fail("Fragments <> / </> desequilibres (" + open + " / " + close + ").");

const lines = src.split("\n").length;
const out = (hasBom ? "\uFEFF" : "") + (crlf ? src.replace(/\n/g, "\r\n") : src);
console.log("");
console.log("  1. composant OrderActionsHistory ajoute               OK");
console.log("  2. etat « view » + sous-onglets Commandes / Historique OK");
console.log("  3. ecran Commandes enveloppe (contenu inchange)       OK");
console.log("  Lignes : " + linesBefore + " -> " + lines);

if (apply) {
  fs.writeFileSync(FILE, out, "utf8");
  console.log("\nEcrit : components/AdminCrm.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
