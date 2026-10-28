// ZENORIA - Lot 5b (admin) : actions sur une commande en attente de virement
// ============================================================
// Modifie components/AdminCrm.js et lib/orderDisplay.js. Tout ou rien : si un controle echoue,
// AUCUN des deux fichiers n'est ecrit.
//
//  AdminCrm.js
//   - Panneau "Paiement par virement" dans le detail d'une commande en attente de virement :
//       echeance et etat (En attente / Echeance depassee / En retard a partir de 5 jours),
//       reference a indiquer, montant attendu, et 3 actions :
//         Confirmer l'encaissement -> admin_confirm_transfer (montant, date de reception, note)
//         Prolonger                -> admin_extend_transfer (1 a 60 jours)
//         Annuler la commande      -> admin_cancel_transfer_order (motif + note)
//   - Commande annulee : ligne "annulee le ... par la cliente / par l'administration".
//   - Bandeau de succes ; bloc Expedition desactive tant que la commande n'est pas payee
//     (la route serveur refusait deja : on evite le clic qui echoue) ; texte de bas de page corrige.
//  orderDisplay.js
//   - Libelle "En attente de virement".
//   - Reference ZEN calculee en heure de Paris (et non celle du navigateur ou du serveur).
//
// Usage : node scripts/patch-admin-virement-actions.mjs --dry-run | --apply
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) { console.error("Utilisez --dry-run ou --apply."); process.exit(2); }

const crmFile = path.join(process.cwd(), "components", "AdminCrm.js");
const dispFile = path.join(process.cwd(), "lib", "orderDisplay.js");
for (const f of [crmFile, dispFile]) if (!fs.existsSync(f)) { console.error(`Fichier introuvable : ${f}`); process.exit(1); }
const crmOrig = fs.readFileSync(crmFile, "utf8");
const dispOrig = fs.readFileSync(dispFile, "utf8");
const fail = (m) => { console.error(`ECHEC : ${m}\nAucune modification n'a ete ecrite.`); process.exit(1); };
const count = (h, n) => { let c = 0, p = 0; while ((p = h.indexOf(n, p)) !== -1) { c++; p += n.length; } return c; };

if (crmOrig.includes("ZENORIA_ADMIN_TRANSFER_V1")) { console.log("Deja applique : rien a faire."); process.exit(0); }
if (!fs.existsSync(path.join(process.cwd(), "lib", "paymentSettings.js"))) fail("lib/paymentSettings.js introuvable (necessaire pour lire le delai par defaut).");
if (!/export function parseBankTransfer/.test(fs.readFileSync(path.join(process.cwd(), "lib", "paymentSettings.js"), "utf8")) || !/export const BANK_TRANSFER_KEY/.test(fs.readFileSync(path.join(process.cwd(), "lib", "paymentSettings.js"), "utf8")))
  fail("lib/paymentSettings.js : parseBankTransfer et BANK_TRANSFER_KEY doivent etre exportes.");

function editor(src, name) {
  const EOL = /\r\n/.test(src) ? "\r\n" : "\n";
  let lines = src.split(/\r\n|\n/);
  const api = {
    get lines() { return lines; },
    EOL,
    indentOf: (i) => lines[i].match(/^(\s*)/)[1],
    findUnique(needle, label) {
      const idxs = [];
      lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
      if (idxs.length !== 1) fail(`${name} - ${label} : attendu 1 ligne contenant ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
      return idxs[0];
    },
    insertAfter(i, arr) { lines = [...lines.slice(0, i + 1), ...arr, ...lines.slice(i + 1)]; },
    insertBefore(i, arr) { lines = [...lines.slice(0, i), ...arr, ...lines.slice(i)]; },
    replaceLines(i, n, arr) { lines = [...lines.slice(0, i), ...arr, ...lines.slice(i + n)]; },
    replaceInLine(i, from, to, label) {
      if (count(lines[i], from) !== 1) fail(`${name} - ${label} : fragment a remplacer introuvable sur la ligne.`);
      lines[i] = lines[i].replace(from, to);
    },
    text: () => lines.join(EOL),
  };
  return api;
}
const pad = (arr, ind) => arr.map((l) => (l === "" ? "" : ind + l));
const raw = (s) => s.replace(/^\n/, "").replace(/\n$/, "").split("\n");

// ---------------------------------------------------------------- orderDisplay.js
const D = editor(dispOrig, "orderDisplay.js");
{
  const i = D.findUnique('pending: { label: "En attente"', "libelle pending");
  D.insertAfter(i, ['  pending_transfer: { label: "En attente de virement", className: "bg-amber-50 text-amber-700" },']);
  console.log("OK repere : libelle \"En attente de virement\"");
}
{
  const s = D.findUnique("export function formatOrderReference(order) {", "fonction formatOrderReference");
  let e = -1;
  for (let k = s + 1; k < D.lines.length; k++) if (D.lines[k] === "}") { e = k; break; }
  if (e < 0) fail("orderDisplay.js - fin de formatOrderReference introuvable.");
  const old = D.lines.slice(s, e + 1).join("\n");
  for (const t of ["getFullYear", "getMonth", "getDate", "padStart(4"]) if (!old.includes(t)) fail(`orderDisplay.js - formatOrderReference : "${t}" absent de la fonction actuelle.`);
  D.replaceLines(s, e - s + 1, [
    "// L'annee, le mois et le jour sont ceux de Paris (Europe/Paris), quel que soit le fuseau de l'appareil ou du serveur.",
    "export function formatOrderReference(order) {",
    '  const counter = String(order.id).padStart(4, "0");',
    "  const d = order.created_at ? new Date(order.created_at) : null;",
    "  if (!d || Number.isNaN(d.getTime())) return `ZEN-${counter}`;",
    '  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);',
    '  const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";',
    '  return `ZEN-${get("year")}-${get("month")}${get("day")}-${counter}`;',
    "}",
  ]);
  console.log("OK repere : reference ZEN en heure de Paris");
}
const dispNew = D.text();

// ---------------------------------------------------------------- AdminCrm.js
const C = editor(crmOrig, "AdminCrm.js");

// 1. import
{
  const i = C.findUnique('import { supabase, getMediaUrl } from "@/lib/supabase";', "import supabase");
  C.insertAfter(i, ['import { parseBankTransfer, BANK_TRANSFER_KEY } from "@/lib/paymentSettings"; // ZENORIA_ADMIN_TRANSFER_V1']);
  console.log("OK repere : import paymentSettings");
}

// 2. composant TransferPanel
const PANEL = raw(String.raw`
// ZENORIA_ADMIN_TRANSFER_V1 : actions de l'administration sur une commande payee par virement.
// Les trois actions appellent des fonctions SQL atomiques qui verifient elles-memes le droit
// administrateur (is_admin) et le statut : confirmer l'encaissement, prolonger l'echeance, annuler.
const TRANSFER_LATE_DAYS = 5; // l'etat passe en rouge ("En retard") a partir de 5 jours apres l'echeance
const TRANSFER_CANCEL_REASONS = [
  { value: "not_received", label: "Virement non reçu dans les délais" },
  { value: "customer_request", label: "Demande de la cliente" },
  { value: "other", label: "Autre (à préciser)" },
];
function parisDay(value) {
  return new Date(value).toLocaleDateString("sv-SE", { timeZone: TIME_ZONE }); // AAAA-MM-JJ
}
function transferErrorMessage(err, kind) {
  const msg = String((err && err.message) || err || "");
  if (/FORBIDDEN/.test(msg)) return "Action réservée aux administratrices.";
  if (/ORDER_NOT_FOUND/.test(msg)) return "Commande introuvable.";
  if (/ORDER_STATE/.test(msg)) return "Cette commande n'est plus en attente de virement. Actualisez la liste.";
  if (/INVALID_DATE/.test(msg)) return "La date de réception doit être comprise entre la date de la commande et aujourd'hui.";
  if (/INVALID_AMOUNT/.test(msg)) return "Montant reçu invalide.";
  if (/INVALID_NOTE/.test(msg)) return "La note est trop longue (500 caractères maximum).";
  if (/INVALID_DAYS/.test(msg)) return "Indiquez un nombre de jours entre 1 et 60.";
  if (/INVALID_REASON/.test(msg)) return "Choisissez un motif.";
  if (/NOTE_REQUIRED/.test(msg)) return kind === "cancel" ? "Pour le motif « Autre », une note est obligatoire." : "Le montant reçu diffère du total : une note est obligatoire.";
  if (/PIECE_CONFLICT/.test(msg)) return "Une pièce unique de cette commande est déjà vendue ou réservée par une autre commande : l'encaissement ne peut pas être confirmé. Remboursez le virement ou contactez la cliente.";
  return "Action impossible pour le moment. Réessayez dans un instant.";
}
function transferDueState(order, now) {
  if (!order.transfer_due_at) return null;
  const diff = now - new Date(order.transfer_due_at).getTime();
  if (diff < 0) {
    const days = Math.ceil(-diff / 86400000);
    return { level: "ok", label: "En attente", detail: "échéance dans " + days + " jour" + (days > 1 ? "s" : "") };
  }
  const late = Math.floor(diff / 86400000);
  const detail = late === 0 ? "échéance dépassée depuis moins d'un jour" : "échéance dépassée de " + late + " jour" + (late > 1 ? "s" : "");
  if (late >= TRANSFER_LATE_DAYS) return { level: "late", label: "En retard", detail };
  return { level: "over", label: "Échéance dépassée", detail };
}
function TransferPanel({ order, onDone }) {
  const [mode, setMode] = useState(null); // null | "confirm" | "extend" | "cancel"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("3");
  const [reason, setReason] = useState("not_received");

  useEffect(() => {
    if (mode !== "extend") return undefined;
    let alive = true;
    supabase.from("site_settings").select("value").eq("key", BANK_TRANSFER_KEY).maybeSingle().then((res) => {
      if (alive && res && !res.error && res.data) setDays(String(parseBankTransfer(res.data.value).delay_days));
    });
    return () => { alive = false; };
  }, [mode]);

  if (order.payment_method !== "transfer") return null;
  if (order.status === "cancelled" && order.cancelled_at) {
    return (
      <div data-testid="transfer-cancelled-note" className="mb-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3 text-[13px] text-[#54434c]">
        <span className="font-medium text-[#412f3b]">Commande annulée</span> le {formatDateTime(order.cancelled_at)}{" "}
        {order.cancelled_by === "customer" ? "par la cliente" : order.cancelled_by === "admin" ? "par l'administration" : ""}.
        <span className="block text-[11px] text-[#8b737e] mt-0.5">Le motif figure dans l&apos;historique de la commande.</span>
      </div>
    );
  }
  if (order.status !== "pending_transfer") return null;

  const state = transferDueState(order, Date.now());
  const badgeClass = state && state.level === "late" ? "bg-red-50 text-red-700" : state && state.level === "over" ? "bg-amber-50 text-amber-700" : "bg-[#f5edf1] text-[#8f6075]";

  const open = (m) => {
    setError("");
    setNote("");
    if (m === "confirm") {
      setAmount(String(order.total).replace(".", ","));
      setReceived(parisDay(new Date()));
    }
    if (m === "cancel") setReason("not_received");
    setMode(m);
  };

  const run = async (kind) => {
    setError("");
    let call;
    let okMessage;
    if (kind === "confirm") {
      const amountNum = Number(String(amount).replace(/\s+/g, "").replace(",", "."));
      if (!Number.isFinite(amountNum) || amountNum <= 0) { setError("Saisissez le montant reçu."); return; }
      if (!received) { setError("Indiquez la date de réception du virement."); return; }
      if (Math.abs(amountNum - Number(order.total)) >= 0.01 && !note.trim()) { setError(transferErrorMessage("NOTE_REQUIRED", "confirm")); return; }
      call = () => supabase.rpc("admin_confirm_transfer", { p_order_id: order.id, p_amount: amountNum, p_received_on: received, p_note: note.trim() || null });
      okMessage = "Encaissement confirmé : la commande est payée et la facture est créée.";
    } else if (kind === "extend") {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 60) { setError(transferErrorMessage("INVALID_DAYS", "extend")); return; }
      call = () => supabase.rpc("admin_extend_transfer", { p_order_id: order.id, p_days: n });
      okMessage = "Échéance prolongée de " + n + " jour" + (n > 1 ? "s" : "") + ".";
    } else {
      if (reason === "other" && !note.trim()) { setError(transferErrorMessage("NOTE_REQUIRED", "cancel")); return; }
      call = () => supabase.rpc("admin_cancel_transfer_order", { p_order_id: order.id, p_reason: reason, p_note: note.trim() || null });
      okMessage = "Commande annulée : les pièces sont de nouveau en vente.";
    }
    setBusy(true);
    try {
      const res = await call();
      if (res && res.error) throw res.error;
      setBusy(false);
      setMode(null);
      onDone(okMessage);
    } catch (e) {
      setBusy(false);
      setError(transferErrorMessage(e, kind));
    }
  };

  const gap = mode === "confirm" && Math.abs(Number(String(amount).replace(/\s+/g, "").replace(",", ".")) - Number(order.total)) >= 0.01;
  const field = "rounded-full border border-[#eadfe4] bg-white px-3 h-9 text-[13px] outline-none focus:border-[#8f6075]";
  const primary = "rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed";
  const secondary = "rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#f5edf1] text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div data-testid="transfer-panel" className="mb-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="text-xs font-medium text-[#8b737e]">Paiement par virement</div>
        {state && <span data-testid="transfer-state" data-level={state.level} className={"rounded-full px-2.5 py-0.5 text-[11px] " + badgeClass}>{state.label}</span>}
      </div>
      <p className="text-[13px] text-[#54434c] leading-5 mb-3">
        Référence à indiquer : <strong>{formatOrderReference(order)}</strong> · Montant attendu : <strong>{formatOrderPrice(order.total)}</strong>
        {order.transfer_due_at && (
          <>
            <br />Échéance : {formatDateTime(order.transfer_due_at)}{state ? " (" + state.detail + ")" : ""}
          </>
        )}
      </p>
      {mode === null && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => open("confirm")} data-testid="transfer-confirm-open" className={primary}>Confirmer l&apos;encaissement</button>
          <button type="button" onClick={() => open("extend")} data-testid="transfer-extend-open" className={secondary}>Prolonger</button>
          <button type="button" onClick={() => open("cancel")} data-testid="transfer-cancel-open" className="rounded-full border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium px-4 h-9 transition">Annuler la commande</button>
        </div>
      )}
      {mode === "confirm" && (
        <div data-testid="transfer-confirm-form" className="rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-3 py-3 space-y-2.5">
          <div className="text-[13px] font-medium text-[#412f3b]">Confirmer l&apos;encaissement</div>
          <div className="flex flex-wrap gap-2">
            <label className="text-[12px] text-[#54434c]">Montant reçu (€)<br /><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" data-testid="transfer-amount" className={field + " w-32"} /></label>
            <label className="text-[12px] text-[#54434c]">Date de réception<br /><input type="date" value={received} min={parisDay(order.created_at)} max={parisDay(new Date())} onChange={(e) => setReceived(e.target.value)} data-testid="transfer-received" className={field} /></label>
          </div>
          <label className="block text-[12px] text-[#54434c]">{gap ? "Note (obligatoire : le montant diffère du total)" : "Note (facultative)"}<br /><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} data-testid="transfer-note" className={field + " w-full"} /></label>
          <p className="text-[11px] text-[#8b737e]">La commande passe en « Payée », la pièce est vendue et la facture est créée. Cette action ne peut pas être annulée.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => run("confirm")} data-testid="transfer-confirm-submit" className={primary}>{busy ? "Enregistrement…" : "Confirmer"}</button>
            <button type="button" disabled={busy} onClick={() => setMode(null)} className={secondary}>Retour</button>
          </div>
        </div>
      )}
      {mode === "extend" && (
        <div data-testid="transfer-extend-form" className="rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-3 py-3 space-y-2.5">
          <div className="text-[13px] font-medium text-[#412f3b]">Prolonger l&apos;échéance</div>
          <label className="text-[12px] text-[#54434c]">Nombre de jours (1 à 60)<br /><input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} data-testid="transfer-days" className={field + " w-28"} /></label>
          <p className="text-[11px] text-[#8b737e]">Le délai repart de l&apos;échéance actuelle, ou d&apos;aujourd&apos;hui si elle est dépassée.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => run("extend")} data-testid="transfer-extend-submit" className={primary}>{busy ? "Enregistrement…" : "Prolonger"}</button>
            <button type="button" disabled={busy} onClick={() => setMode(null)} className={secondary}>Retour</button>
          </div>
        </div>
      )}
      {error && mode !== "cancel" && <div role="alert" data-testid="transfer-error" className="mt-2 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-xs">{error}</div>}
      {mode === "cancel" && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="transfer-cancel-title" data-testid="transfer-cancel-dialog">
          <div className="w-full max-w-md rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl">
            <h3 id="transfer-cancel-title" className="font-serif text-xl text-[#412f3b]">Annuler cette commande ?</h3>
            <p className="mt-1 text-[13px] text-[#54434c]">{formatOrderReference(order)} · {formatOrderPrice(order.total)}</p>
            <div className="mt-4 space-y-2">
              {TRANSFER_CANCEL_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-[13px] text-[#54434c]">
                  <input type="radio" name={"transfer-cancel-reason-" + order.id} value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} data-testid={"transfer-reason-" + r.value} className="h-4 w-4 accent-[#8f6075]" />
                  {r.label}
                </label>
              ))}
            </div>
            <label className="mt-3 block text-[12px] text-[#54434c]">{reason === "other" ? "Note (obligatoire)" : "Note (facultative)"}<br /><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} data-testid="transfer-cancel-note" className="mt-1 w-full rounded-xl border border-[#eadfe4] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#8f6075]" /></label>
            <p className="mt-3 rounded-lg bg-amber-50 text-amber-800 text-[12px] px-3 py-2">Les pièces sont remises en vente tout de suite. Si le virement est arrivé, confirmez l&apos;encaissement au lieu d&apos;annuler. Cette action ne peut pas être annulée.</p>
            {error && <div role="alert" className="mt-3 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-xs">{error}</div>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => run("cancel")} data-testid="transfer-cancel-submit" className="rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-4 h-10 transition disabled:opacity-50">{busy ? "Annulation…" : "Annuler la commande"}</button>
              <button type="button" disabled={busy} onClick={() => setMode(null)} data-testid="transfer-cancel-back" className="rounded-full border border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1] text-xs font-medium px-4 h-10 transition">Retour</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`);
{
  const i = C.findUnique("// Petite vignette d'un article de commande", "commentaire avant OrderItemThumb");
  C.insertBefore(i, [...PANEL, ""]);
  console.log("OK repere : composant TransferPanel");
}

// 3. etat + effet du bandeau de succes
{
  const i = C.findUnique('const [invoiceErrorMsg, setInvoiceErrorMsg] = useState("");', "etat invoiceErrorMsg");
  const ind = C.indentOf(i);
  C.insertAfter(i, pad(raw(String.raw`
const [adminNotice, setAdminNotice] = useState(""); // ZENORIA_ADMIN_TRANSFER_V1 : message de succes apres une action
useEffect(() => {
  if (!adminNotice) return undefined;
  const t = setTimeout(() => setAdminNotice(""), 8000);
  return () => clearTimeout(t);
}, [adminNotice]);
`), ind));
  console.log("OK repere : bandeau de succes (etat + effet)");
}

// 4. bandeau de succes dans l'affichage (celui d'AdminOrders, pas celui de CrmAccounts)
{
  const start = C.findUnique("export function AdminOrders() {", "fonction AdminOrders");
  let idx = -1;
  for (let k = start; k < C.lines.length; k++) if (C.lines[k].trim() === "{error && (") { idx = k; break; }
  if (idx < 0) fail("AdminCrm.js - bandeau d'erreur d'AdminOrders introuvable.");
  C.insertBefore(idx, pad(raw(String.raw`
{adminNotice && (
  <div role="status" data-testid="admin-notice" className="mb-5 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{adminNotice}</div>
)}
`), C.indentOf(idx)));
  console.log("OK repere : bandeau de succes (affichage)");
}

// 5. panneau virement dans le detail d'une commande
{
  const i = C.findUnique("ShippingPanel : transporteur", "commentaire ShippingPanel");
  if (!C.lines[i].trim().startsWith("{/*")) fail("AdminCrm.js - le repere ShippingPanel n'est pas un commentaire JSX.");
  C.insertBefore(i, pad(["<TransferPanel order={o} onDone={(msg) => { setAdminNotice(msg); load(); }} />"], C.indentOf(i)));
  console.log("OK repere : panneau virement dans le detail de la commande");
}

// 6. bloc Expedition : desactive tant que la commande n'est pas payee
{
  const i = C.findUnique('mb-2.5">Expédition</div>', "titre du bloc Expedition");
  C.insertAfter(i, pad(raw(String.raw`
{!["paid", "shipped", "delivered"].includes(o.status) && (
  <p data-testid="shipping-locked" className="text-[12px] text-[#8b737e] mb-2">L&apos;expédition sera possible une fois la commande payée.</p>
)}
`), C.indentOf(i)));
  const a = C.findUnique("disabled={shippingBusyId === o.id || Boolean(o.tracking_number)}", "bouton Marquer comme expediee");
  C.replaceInLine(a, "disabled={shippingBusyId === o.id || Boolean(o.tracking_number)}",
    'disabled={shippingBusyId === o.id || Boolean(o.tracking_number) || !["paid", "shipped"].includes(o.status)}', "bouton expediee");
  const b = C.findUnique('disabled={shippingBusyId === o.id || o.status === "delivered"}', "bouton Marquer comme livree");
  C.replaceInLine(b, 'disabled={shippingBusyId === o.id || o.status === "delivered"}',
    'disabled={shippingBusyId === o.id || !["paid", "shipped"].includes(o.status)}', "bouton livree");
  console.log("OK repere : expedition desactivee tant que la commande n'est pas payee");
}

// 7. texte de bas de page
{
  const i = C.findUnique("aucune écriture manuelle n&apos;est possible depuis cet écran", "texte de bas de page");
  const ind = C.indentOf(i);
  C.replaceLines(i, 1, pad(["Les commandes par carte sont créées automatiquement par le webhook de paiement Stripe. Pour un virement, l&apos;encaissement, la prolongation et l&apos;annulation se font depuis le détail de la commande."], ind));
  console.log("OK repere : texte de bas de page corrige");
}
const crmNew = C.text();

// ---------------------------------------------------------------- garde-fous finaux
for (const n of ["updateOrderStatus", 'data-testid="mark-shipped"', 'data-testid="mark-delivered"', "downloadInvoiceAdmin", 'data-testid="invoice-download-admin"', "formatOrderReference(o)", "<AdminPaymentMethods />", "<AdminBilling />", "export function CrmAccounts", "export function AdminOrders", "export function CrmRoadmap"])
  if (count(crmNew, n) !== count(crmOrig, n)) fail(`garde-fou final : ${JSON.stringify(n)} ne doit pas changer (avant ${count(crmOrig, n)}, apres ${count(crmNew, n)}).`);
for (const [n, c] of [["<TransferPanel ", 1], ["function TransferPanel", 1], ['rpc("admin_confirm_transfer"', 1], ['rpc("admin_extend_transfer"', 1], ['rpc("admin_cancel_transfer_order"', 1], ["ZENORIA_ADMIN_TRANSFER_V1", 3], ['data-testid="shipping-locked"', 1], ["aucune écriture manuelle", 0]])
  if (count(crmNew, n) !== c) fail(`garde-fou final : ${JSON.stringify(n)} attendu ${c} fois, trouve ${count(crmNew, n)}.`);
if (count(dispNew, "pending_transfer") !== 1 || count(dispNew, "getFullYear") !== 0 || count(dispNew, "Europe/Paris") < 2) fail("garde-fou final : orderDisplay.js incoherent.");
for (const n of ["ORDER_STATUS_LABELS", "orderStatusInfo", "formatOrderPrice", "CUSTOMER_VISIBLE_STATUSES", "TRACKING_STEPS"]) if (count(dispNew, n) !== count(dispOrig, n)) fail(`garde-fou final : ${n} ne doit pas changer dans orderDisplay.js.`);
if (crmNew === crmOrig || dispNew === dispOrig) fail("aucune modification produite.");
console.log("OK garde-fou : actions existantes, facture, paiement et statuts clientes intacts ; nouveaux blocs presents");

console.log(`\nMode : ${dryRun ? "DRY-RUN" : "APPLY"}\nTous les controles sont conformes.`);
if (dryRun) console.log("VERIFICATION SEULE : aucun fichier modifie.");
else {
  fs.writeFileSync(crmFile, crmNew, "utf8");
  fs.writeFileSync(dispFile, dispNew, "utf8");
  console.log("Fichiers modifies : components\\AdminCrm.js, lib\\orderDisplay.js");
}
