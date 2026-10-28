import React, { useCallback, useEffect, useMemo, useState } from "react";
import AdminBilling from "@/components/AdminBilling"; // ZENORIA_BILLING_STEP2_V1
import AdminPaymentMethods from "@/components/AdminPaymentMethods"; // ZENORIA_PAYMENT_STEP2_V1
import { RefreshCw, FileDown } from "lucide-react"; // ZENORIA_INVOICE_STEP3B_V1
import { supabase, getMediaUrl } from "@/lib/supabase";
import { parseBankTransfer, BANK_TRANSFER_KEY } from "@/lib/paymentSettings"; // ZENORIA_ADMIN_TRANSFER_V1

// ZENORIA_INVOICE_STEP3B_V1 : télécharge la facture PDF d'une commande depuis l'admin (même route que l'espace cliente ;
// issue_invoice_for_order autorise un compte administrateur à générer la facture de n'importe quelle commande).
async function downloadInvoiceAdmin(orderId, onError) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session ? data.session.access_token : null;
    if (!token) { onError("Session expirée : reconnectez-vous."); return; }
    const res = await fetch(`/api/invoice/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      let message = "Impossible de générer la facture pour le moment.";
      try { const j = await res.json(); if (j && j.error) message = j.error; } catch (e) { /* réponse non JSON */ }
      onError(message);
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
    a.href = url;
    a.download = match ? match[1] : `facture-${orderId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    onError("Impossible de générer la facture pour le moment.");
  }
}
import { orderStatusInfo, formatOrderPrice, formatOrderReference } from "@/lib/orderDisplay"; // ZENORIA_ACCOUNT_STEP13_V1

// ============================================================
// GROUPE « CRM » de l'administration (/admin)
//
// Deux écrans :
//  - CrmAccounts : la liste des comptes créés sur le site. C'est tout ce que la base contient pour
//    l'instant sur les clientes : une adresse e-mail et des dates. Les données viennent de la fonction
//    SQL admin_list_accounts() (voir supabase_admin_connections.sql), réservée aux administrateurs.
//  - CrmRoadmap  : ce qui viendra, avec ce dont chaque élément dépend. Rien n'y est enregistré.
// ============================================================

const TIME_ZONE = "Europe/Paris";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/could not find the function|schema cache|does not exist/i.test(msg)) {
    return "La liste des comptes n'est pas installée. Exécutez le script supabase_admin_connections.sql dans Supabase (SQL Editor).";
  }
  return "Impossible de charger les comptes : " + msg;
}

export function CrmAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [includeAdmins, setIncludeAdmins] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [{ data, error: err }, profilesRes] = await Promise.all([
      supabase.rpc("admin_list_accounts"),
      supabase.from("customer_profiles").select("user_id, first_name, last_name, phone"),
    ]);
    if (err) {
      setError(friendlyError(err));
      setAccounts([]);
    } else {
      const profilesByUserId = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      const merged = (data || []).map((a) => ({ ...a, profile: profilesByUserId.get(a.account_id) || null }));
      setAccounts(merged);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Les comptes d'administrateurs ne sont pas des clientes : ils sont masqués par défaut
  const customers = useMemo(() => accounts.filter((a) => !a.is_admin_account), [accounts]);

  const stats = useMemo(() => {
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    return {
      total: customers.length,
      confirmed: customers.filter((a) => a.confirmed_at).length,
      recent: customers.filter((a) => a.created_at && new Date(a.created_at).getTime() >= monthAgo).length,
      never: customers.filter((a) => !a.last_sign_in_at).length,
    };
  }, [customers]);

  const q = query.trim().toLowerCase();
  const visible = (includeAdmins ? accounts : customers).filter((a) => !q || String(a.email || "").toLowerCase().includes(q));

  const cards = [
    { label: "Comptes clients", value: stats.total },
    { label: "Adresses confirmées", value: stats.confirmed },
    { label: "Inscrits ces 30 derniers jours", value: stats.recent },
    { label: "Jamais connectés", value: stats.never },
  ];

  return (
    <>
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Comptes clients</h1>
          <p className="text-sm text-[#8b737e]">Les personnes inscrites sur le site</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      <div data-testid="crm-notice" className="mb-5 rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3 text-[12px] leading-5 text-[#54434c]">
        Les comptes affichent désormais le prénom, le nom et le téléphone quand la cliente les a renseignés.
        Les adresses de livraison et l'historique des commandes viendront avec le paiement en ligne : voir l'onglet « À venir ».
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-white border border-[#eee2e5] px-4 py-4">
            <div className="font-serif text-3xl text-[#8f6075]" data-testid="crm-stat">
              {loading ? "…" : c.value}
            </div>
            <div className="text-xs text-[#756a70] mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une adresse e-mail"
          aria-label="Rechercher une adresse e-mail"
          data-testid="crm-search"
          className="w-full sm:w-72 rounded-full border border-[#eadfe4] bg-white px-4 h-10 text-sm outline-none focus:border-[#8f6075]"
        />
        <label className="flex items-center gap-2 text-sm text-[#54434c]">
          <input type="checkbox" checked={includeAdmins} onChange={(e) => setIncludeAdmins(e.target.checked)} data-testid="crm-include-admins" className="h-4 w-4" />
          Afficher aussi les comptes administrateurs
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto mb-4">
        <table className="w-full min-w-[560px] text-sm" data-testid="crm-table">
          <thead>
            <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Téléphone</th>
              <th className="px-4 py-3 font-medium">Inscrit(e) le</th>
              <th className="px-4 py-3 font-medium">Adresse</th>
              <th className="px-4 py-3 font-medium">Dernière connexion</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !error && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#8b737e]">
                  {q ? "Aucun compte ne correspond à cette recherche." : "Aucun compte client pour le moment."}
                </td>
              </tr>
            )}
            {visible.map((a) => (
              <tr key={a.account_id} className="border-t border-[#eee2e5]" data-testid="crm-row">
                <td className="px-4 py-3">
                  <span className="font-medium whitespace-nowrap">{a.email || "—"}</span>
                  {a.is_admin_account && <span className="ml-2 rounded-full bg-[#f5edf1] text-[#8f6075] px-2 py-0.5 text-[11px]">Admin</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">
                  {a.profile && (a.profile.first_name || a.profile.last_name)
                    ? [a.profile.first_name, a.profile.last_name].filter(Boolean).join(" ")
                    : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{a.profile?.phone || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{formatDateTime(a.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${a.confirmed_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {a.confirmed_at ? "Confirmée" : "Non confirmée"}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : "Jamais"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-4 text-[#8b737e]">
        Les adresses e-mail sont des données personnelles : cet écran est réservé à l&apos;administration. En attendant un outil d&apos;export et d&apos;effacement, une demande
        d&apos;effacement se traite à la main dans Supabase (Authentication, Users). L&apos;historique des connexions et les adresses IP restent dans Technique, onglet Connexions.
      </p>
    </>
  );
}

// ============================================================
// AdminOrders : liste des commandes passees sur le site (orders, order_items).
// LECTURE SEULE : aucune ecriture n'est possible depuis cet ecran. Les commandes
// sont creees automatiquement par le webhook de paiement Stripe
// (pages/api/webhooks/stripe.js), jamais a la main.
// ============================================================

// ZENORIA_ACCOUNT_STEP13_V1 : ORDER_STATUS_LABELS, formatOrderPrice et formatOrderReference sont désormais
// partagés avec l'espace cliente, voir lib/orderDisplay.js
function orderStatusBadge(status) {
  const info = orderStatusInfo(status);
  return (
    <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${info.className}`}>{info.label}</span>
  );
}

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

// Petite vignette d'un article de commande : reprend la meme logique que
// CartThumb (pages/index.js) -- photo si disponible, degrade couleur/pierre
// sinon, cadre neutre si le produit a ete supprime depuis (product_id est
// alors NULL, product_name reste le seul renseignement disponible).
function OrderItemThumb({ product }) {
  const [imgError, setImgError] = useState(false);
  if (!product) {
    return <div className="h-8 w-8 shrink-0 rounded-lg bg-[#f5edf1]" />;
  }
  const src = product.photos && product.photos[0] ? getMediaUrl(product.photos[0], product.slug) : null;
  if (src && !imgError) {
    return (
      <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-[#f5edf1]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" onError={() => setImgError(true)} className="w-full h-full object-cover object-center" />
      </div>
    );
  }
  return (
    <div className={`h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br ${product.color || "from-[#eadfe4] to-[#f5edf1]"} grid place-items-center text-xs`}>
      {product.stone || ""}
    </div>
  );
}

export function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [itemsByOrder, setItemsByOrder] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [openOrderId, setOpenOrderId] = useState(null);
  const [shippingDraft, setShippingDraft] = useState({});
  const [shippingBusyId, setShippingBusyId] = useState(null);
  const [invoiceBusyId, setInvoiceBusyId] = useState(null); // ZENORIA_INVOICE_STEP3B_V1
  const [invoiceErrorId, setInvoiceErrorId] = useState(null); // ZENORIA_INVOICE_STEP3B_V1
  const [invoiceErrorMsg, setInvoiceErrorMsg] = useState(""); // ZENORIA_INVOICE_STEP3B_V1
  const [adminNotice, setAdminNotice] = useState(""); // ZENORIA_ADMIN_TRANSFER_V1 : message de succes apres une action
  useEffect(() => {
    if (!adminNotice) return undefined;
    const t = setTimeout(() => setAdminNotice(""), 8000);
    return () => clearTimeout(t);
  }, [adminNotice]);
  const CARRIERS = ["Colissimo", "Mondial Relay", "Chronopost", "DPD", "Colis Privé"];

  const updateOrderStatus = async (orderId, action, extra) => {
    setShippingBusyId(orderId);
    try {
      const { data: adminAuth } = await supabase.auth.getSession(); // ZENORIA_ADMIN_ORDER_AUTH_V1
      const adminToken = adminAuth && adminAuth.session ? adminAuth.session.access_token : null;
      const res = await fetch("/api/admin/orders/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminToken ? { Authorization: "Bearer " + adminToken } : {}) },
        body: JSON.stringify({ orderId, action, ...extra }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError((data && data.error) || "Échec de la mise à jour.");
      } else {
        await load();
      }
    } catch (e) {
      setError("Impossible de contacter le serveur.");
    } finally {
      setShippingBusyId(null);
    }
  };
  const [statusHistoryByOrder, setStatusHistoryByOrder] = useState({});
  const [productsById, setProductsById] = useState({});
  const [datePreset, setDatePreset] = useState("all"); // "today" | "7d" | "30d" | "custom" | "all"
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeTestData, setIncludeTestData] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [
      { data: ordersData, error: ordersErr },
      { data: itemsData, error: itemsErr },
      { data: historyData, error: historyErr },
      { data: productsData },
    ] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("order_items").select("*"),
      supabase.from("order_status_history").select("*").order("changed_at", { ascending: true }),
      supabase.from("products").select("id, photos, slug, color, stone"),
    ]);
    if (ordersErr) {
      setError("Impossible de charger les commandes : " + ordersErr.message);
      setOrders([]);
    } else {
      setOrders(ordersData || []);
    }
    if (!itemsErr) {
      const grouped = {};
      (itemsData || []).forEach((it) => {
        if (!grouped[it.order_id]) grouped[it.order_id] = [];
        grouped[it.order_id].push(it);
      });
      setItemsByOrder(grouped);
    }
    if (!historyErr) {
      const groupedHistory = {};
      (historyData || []).forEach((h) => {
        if (!groupedHistory[h.order_id]) groupedHistory[h.order_id] = [];
        groupedHistory[h.order_id].push(h);
      });
      setStatusHistoryByOrder(groupedHistory);
    }
    setProductsById(Object.fromEntries((productsData || []).map((p) => [p.id, p])));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (!includeTestData && o.is_test) return false;
      if (dateFrom) {
        const from = new Date(dateFrom + "T00:00:00");
        if (!o.created_at || new Date(o.created_at) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo + "T23:59:59");
        if (!o.created_at || new Date(o.created_at) > to) return false;
      }
      return true;
    });
  }, [orders, includeTestData, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const paid = filteredOrders.filter((o) => o.status === "paid" || o.status === "shipped" || o.status === "delivered");
    const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const recent = filteredOrders.filter((o) => o.created_at && new Date(o.created_at).getTime() >= monthAgo).length;
    return { total: filteredOrders.length, paid: paid.length, revenue, recent };
  }, [filteredOrders]);

  const q = query.trim().toLowerCase();
  const visible = filteredOrders.filter((o) => {
    if (!q) return true;
    const email = (o.guest_email || "").toLowerCase();
    const ref = String(o.id);
    const reference = formatOrderReference(o).toLowerCase();
    return email.includes(q) || ref.includes(q) || reference.includes(q.replace(/\s+/g, ""));
  });

  const setPreset = (preset) => {
    setDatePreset(preset);
    const toIso = (d) => d.toISOString().slice(0, 10);
    const now = new Date();
    if (preset === "today") {
      const today = toIso(now);
      setDateFrom(today);
      setDateTo(today);
    } else if (preset === "7d") {
      const from = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
      setDateFrom(toIso(from));
      setDateTo(toIso(now));
    } else if (preset === "30d") {
      const from = new Date(now.getTime() - 29 * 24 * 3600 * 1000);
      setDateFrom(toIso(from));
      setDateTo(toIso(now));
    } else {
      setDateFrom("");
      setDateTo("");
    }
  };

  const cards = [
    { label: "Commandes totales", value: stats.total },
    { label: "Commandes payées", value: stats.paid },
    { label: "Chiffre d'affaires (payé)", value: formatOrderPrice(stats.revenue) },
    { label: "Commandes ces 30 derniers jours", value: stats.recent },
  ];

  return (
    <>
      {/* ZENORIA_BILLING_STEP2_V1 */}
      <AdminBilling />
      {/* ZENORIA_PAYMENT_STEP2_V1 */}
      <AdminPaymentMethods />
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Commandes</h1>
          <p className="text-sm text-[#8b737e]">Les commandes passées sur le site</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {adminNotice && (
        <div role="status" data-testid="admin-notice" className="mb-5 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{adminNotice}</div>
      )}
      {error && (
        <div className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-white border border-[#eee2e5] px-4 py-4">
            <div className="font-serif text-3xl text-[#8f6075]" data-testid="orders-stat">
              {loading ? "—" : c.value}
            </div>
            <div className="text-xs text-[#756a70] mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={() => setPreset("today")} data-testid="date-preset-today" className={`rounded-full px-3 h-8 text-xs border transition ${datePreset === "today" ? "bg-[#8f6075] text-white border-[#8f6075]" : "border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1]"}`}>
          Aujourd'hui
        </button>
        <button type="button" onClick={() => setPreset("7d")} data-testid="date-preset-7d" className={`rounded-full px-3 h-8 text-xs border transition ${datePreset === "7d" ? "bg-[#8f6075] text-white border-[#8f6075]" : "border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1]"}`}>
          7 jours
        </button>
        <button type="button" onClick={() => setPreset("30d")} data-testid="date-preset-30d" className={`rounded-full px-3 h-8 text-xs border transition ${datePreset === "30d" ? "bg-[#8f6075] text-white border-[#8f6075]" : "border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1]"}`}>
          30 jours
        </button>
        <button type="button" onClick={() => setPreset("all")} data-testid="date-preset-all" className={`rounded-full px-3 h-8 text-xs border transition ${datePreset === "all" ? "bg-[#8f6075] text-white border-[#8f6075]" : "border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1]"}`}>
          Tout
        </button>
        <span className="text-[#d9c5cc]">|</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDatePreset("custom"); setDateFrom(e.target.value); }}
          data-testid="date-from"
          aria-label="Date de début"
          className="rounded-full border border-[#eadfe4] bg-white px-3 h-8 text-xs outline-none focus:border-[#8f6075]"
        />
        <span className="text-[#8b737e] text-xs">au</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDatePreset("custom"); setDateTo(e.target.value); }}
          data-testid="date-to"
          aria-label="Date de fin"
          className="rounded-full border border-[#eadfe4] bg-white px-3 h-8 text-xs outline-none focus:border-[#8f6075]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par référence, e-mail ou numéro de commande"
          aria-label="Rechercher une commande"
          data-testid="orders-search"
          className="w-full sm:w-80 rounded-full border border-[#eadfe4] bg-white px-4 h-10 text-sm outline-none focus:border-[#8f6075]"
        />
        <label className="flex items-center gap-2 text-sm text-[#54434c]">
          <input type="checkbox" checked={includeTestData} onChange={(e) => setIncludeTestData(e.target.checked)} data-testid="orders-include-test" className="h-4 w-4" />
          Afficher aussi les données de test
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto mb-4">
        <table className="w-full min-w-[720px] text-sm" data-testid="orders-table">
          <thead>
            <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
              <th className="px-4 py-3 font-medium">Référence</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Montant</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {!loading && !error && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#8b737e]">
                  {q ? "Aucune commande ne correspond à cette recherche." : "Aucune commande pour le moment."}
                </td>
              </tr>
            )}
            {visible.map((o) => (
              <React.Fragment key={o.id}>
                <tr
                  className="border-t border-[#eee2e5] hover:bg-[#faf6f8] cursor-pointer transition"
                  data-testid="orders-row"
                  onClick={() => setOpenOrderId(openOrderId === o.id ? null : o.id)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">
                    {formatOrderReference(o)}
                    {o.is_test && <span className="ml-1.5 rounded-full bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[10px] align-middle">TEST</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium whitespace-nowrap">{o.guest_email || "Compte client"}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{formatDateTime(o.created_at)}</td>
                  <td className="px-4 py-3">{orderStatusBadge(o.status)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{formatOrderPrice(o.total)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setOpenOrderId(openOrderId === o.id ? null : o.id); }}
                      className="text-xs text-[#8f6075] underline"
                      data-testid="orders-row-clickable"
                    >
                      {openOrderId === o.id ? "Masquer" : "Voir le détail"}
                    </button>
                  </td>
                </tr>
                {openOrderId === o.id && (
                  <tr className="border-t border-[#eee2e5] bg-[#faf6f8]">
                    <td colSpan={6} className="px-4 py-4">
                      {o.is_test && (
                        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[12px] px-3 py-2">
                          Donnée de test : cette commande a été passée en mode test Stripe. Elle n&apos;est pas prise en compte dans les statistiques de production.
                        </div>
                      )}
                      <div className="mb-4">
                        <div className="text-xs font-medium text-[#8b737e] mb-3">Parcours de la commande</div>
                        {(() => {
                          const steps = [
                            { label: "Panier validé", done: true, date: o.created_at },
                            { label: "Paiement confirmé", done: Boolean(o.paid_at), date: o.paid_at },
                            { label: "Expédiée", done: Boolean((statusHistoryByOrder[o.id] || []).find((h) => h.status === "shipped")), date: (statusHistoryByOrder[o.id] || []).find((h) => h.status === "shipped")?.changed_at },
                            { label: "Livrée", done: Boolean((statusHistoryByOrder[o.id] || []).find((h) => h.status === "delivered")), date: (statusHistoryByOrder[o.id] || []).find((h) => h.status === "delivered")?.changed_at },
                          ];
                          return (
                            <div className="flex items-start">
                              {steps.map((step, i) => (
                                <React.Fragment key={step.label}>
                                  <div className="flex flex-col items-center text-center" style={{ minWidth: 92 }}>
                                    <span className={`h-3 w-3 rounded-full shrink-0 ${step.done ? "bg-[#8f6075]" : "bg-[#eadfe4]"}`} />
                                    <span className={`mt-1.5 text-[12px] leading-4 ${step.done ? "text-[#412f3b] font-medium" : "text-[#a79aa1]"}`}>{step.label}</span>
                                    <span className="text-[10px] text-[#8b737e] leading-4">{step.done && step.date ? formatDateTime(step.date) : step.done ? "" : "En attente"}</span>
                                  </div>
                                  {i < steps.length - 1 && (
                                    <div className={`h-[2px] flex-1 mt-1.5 ${steps[i + 1].done ? "bg-[#8f6075]" : "bg-[#eadfe4]"}`} />
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      <TransferPanel order={o} onDone={(msg) => { setAdminNotice(msg); load(); }} />
                      {/* ShippingPanel : transporteur, numéro de suivi, actions d'expédition */}
                      <div className="mb-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3.5">
                        <div className="text-xs font-medium text-[#8b737e] mb-2.5">Expédition</div>
                        {!["paid", "shipped", "delivered"].includes(o.status) && (
                          <p data-testid="shipping-locked" className="text-[12px] text-[#8b737e] mb-2">L&apos;expédition sera possible une fois la commande payée.</p>
                        )}
                        {o.tracking_number ? (
                          <p className="text-[13px] text-[#54434c] leading-5 mb-2">
                            {o.carrier} · Suivi : <strong>{o.tracking_number}</strong>
                            {o.shipped_at && <span className="text-[#8b737e]"> · expédiée le {formatDateTime(o.shipped_at)}</span>}
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 mb-2.5">
                            <select
                              value={(shippingDraft[o.id] || {}).carrier || CARRIERS[0]}
                              onChange={(e) => setShippingDraft((prev) => ({ ...prev, [o.id]: { ...prev[o.id], carrier: e.target.value } }))}
                              data-testid="shipping-carrier"
                              className="rounded-full border border-[#eadfe4] bg-white px-3 h-9 text-[13px] outline-none focus:border-[#8f6075]"
                            >
                              {CARRIERS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Numéro de suivi"
                              value={(shippingDraft[o.id] || {}).trackingNumber || ""}
                              onChange={(e) => setShippingDraft((prev) => ({ ...prev, [o.id]: { ...prev[o.id], trackingNumber: e.target.value } }))}
                              data-testid="shipping-tracking-number"
                              className="flex-1 min-w-[160px] rounded-full border border-[#eadfe4] bg-white px-3 h-9 text-[13px] outline-none focus:border-[#8f6075]"
                            />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={shippingBusyId === o.id || Boolean(o.tracking_number) || !["paid", "shipped"].includes(o.status)}
                            onClick={() => {
                              const draft = shippingDraft[o.id] || {};
                              updateOrderStatus(o.id, "ship", {
                                carrier: draft.carrier || CARRIERS[0],
                                trackingNumber: draft.trackingNumber || "",
                              });
                            }}
                            data-testid="mark-shipped"
                            className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Marquer comme expédiée
                          </button>
                          <button
                            type="button"
                            disabled={shippingBusyId === o.id || !["paid", "shipped"].includes(o.status)}
                            onClick={() => updateOrderStatus(o.id, "deliver")}
                            data-testid="mark-delivered"
                            className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Marquer comme livrée
                          </button>
                          {/* ZENORIA_INVOICE_STEP3B_V1 : facture générée à la demande (recomposée depuis des données figées) */}
                          {["paid", "shipped", "delivered"].includes(o.status) && (
                            <button
                              type="button"
                              onClick={async () => {
                                setInvoiceBusyId(o.id);
                                setInvoiceErrorId(null);
                                await downloadInvoiceAdmin(o.id, (msg) => { setInvoiceErrorId(o.id); setInvoiceErrorMsg(msg); });
                                setInvoiceBusyId(null);
                              }}
                              disabled={invoiceBusyId === o.id}
                              data-testid="invoice-download-admin"
                              className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1] text-xs font-medium px-4 h-9 transition disabled:opacity-50"
                            >
                              <FileDown size={13} /> {invoiceBusyId === o.id ? "Génération…" : "Facture"}
                            </button>
                          )}
                        </div>
                        {invoiceErrorId === o.id && (
                          <div role="alert" className="mt-2 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-xs">{invoiceErrorMsg}</div>
                        )}
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-[#8b737e] mb-1.5">Articles</div>
                          <ul className="space-y-2 text-[13px] text-[#54434c]">
                            {(itemsByOrder[o.id] || []).map((it) => (
                              <li key={it.id} className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 min-w-0">
                                  <OrderItemThumb product={productsById[it.product_id]} />
                                  <span className="truncate">{it.qty} × {it.product_name}</span>
                                </span>
                                <span className="shrink-0">{formatOrderPrice(it.product_price * it.qty)}</span>
                              </li>
                            ))}
                            {(itemsByOrder[o.id] || []).length === 0 && (
                              <li className="text-[#8b737e]">Aucun article enregistré.</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-[#8b737e] mb-1.5">Adresse de livraison</div>
                          <p className="text-[13px] text-[#54434c] leading-5">
                            {o.shipping_full_name || "—"}<br />
                            {o.shipping_address_line1 || ""}{o.shipping_address_line2 ? `, ${o.shipping_address_line2}` : ""}<br />
                            {o.shipping_postal_code || ""} {o.shipping_city || ""}<br />
                            {o.shipping_country || ""}
                          </p>
                          <div className="text-xs font-medium text-[#8b737e] mt-3 mb-1.5">Totaux</div>
                          <p className="text-[13px] text-[#54434c] leading-5">
                            Sous-total : {formatOrderPrice(o.subtotal)}<br />
                            {Number(o.discount) > 0 && <>Remise : -{formatOrderPrice(o.discount)}<br /></>}
                            Livraison : {Number(o.shipping) === 0 ? "Offerte" : formatOrderPrice(o.shipping)}<br />
                            <strong>Total : {formatOrderPrice(o.total)}</strong>
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-4 text-[#8b737e]">
        Les commandes par carte sont créées automatiquement par le webhook de paiement Stripe. Pour un virement, l&apos;encaissement, la prolongation et l&apos;annulation se font depuis le détail de la commande.
      </p>
    </>
  );
}

// Ce qui viendra, avec ce dont chaque élément dépend. Aucune date : elles dépendent de la base de données et du paiement.
const ROADMAP = [
  {
    title: "Newsletter et consentements",
    text: "Aujourd'hui, le champ « Je m'inscris » du site n'enregistre aucune adresse. Il faudra un consentement explicite, daté, avec possibilité de se désinscrire.",
    needs: "Base de données, phase 1 ; domaine vérifié dans Resend pour les envois.",
  },
  {
    title: "Export et anonymisation à la demande (RGPD)",
    text: "Fournir ou effacer toutes les données d'une cliente en un clic, avec une trace de la demande. À concevoir en même temps que les tables clientes.",
    needs: "Base de données, phase 1.",
  },
  {
    title: "Favoris et avis",
    text: "Les bagues mises en favori (aujourd'hui, uniquement dans le navigateur) et les avis des clientes.",
    needs: "Commandes enregistrées (pour n'accepter que des avis d'acheteuses).",
  },
];

export function CrmRoadmap() {
  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-2xl">À venir dans le CRM</h1>
        <p className="text-sm text-[#8b737e]">Ce qui sera ajouté, et ce dont chaque élément dépend</p>
      </div>
      <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12px] leading-5 px-4 py-3 mb-5" data-testid="roadmap-notice">
        Rien de cette liste n&apos;existe encore : aucune donnée n&apos;est enregistrée à ce sujet. Chaque élément dépend de la base de données (phase 1) ou du paiement en
        ligne, qui ne sont pas encore en place.
      </div>
      <ul className="grid md:grid-cols-2 gap-3" data-testid="roadmap-list">
        {ROADMAP.map((r) => (
          <li key={r.title} className="rounded-2xl bg-white border border-[#eee2e5] px-5 py-4" data-testid="roadmap-item">
            <div className="font-serif text-lg text-[#412f3b]">{r.title}</div>
            <p className="text-[13px] leading-5 text-[#54434c] mt-1.5">{r.text}</p>
            <p className="text-[11px] leading-4 text-[#8b737e] mt-2.5">
              <strong>Dépend de :</strong> {r.needs}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
