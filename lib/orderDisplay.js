// ============================================================
// AFFICHAGE DES COMMANDES — ZENORIA_ORDER_DISPLAY_V1
// Partagé entre l'admin (components/AdminCrm.js) et l'espace cliente (pages/compte.js).
//
// Un seul endroit pour les libellés/couleurs de statut, la référence lisible ZEN-AAAA-MMJJ-NNNN et
// le formatage d'un montant en euros. Évite la duplication (cf. vigilance de l'état des lieux : une
// liste dupliquée entre deux fichiers finit toujours par diverger).
// ============================================================

export const ORDER_STATUS_LABELS = {
  pending: { label: "En attente", className: "bg-amber-50 text-amber-700" },
  pending_transfer: { label: "En attente de virement", className: "bg-amber-50 text-amber-700" },
  paid: { label: "Payée", className: "bg-emerald-50 text-emerald-700" },
  shipped: { label: "Expédiée", className: "bg-sky-50 text-sky-700" },
  delivered: { label: "Livrée", className: "bg-violet-50 text-violet-700" },
  cancelled: { label: "Annulée", className: "bg-red-50 text-red-700" },
  refunded: { label: "Remboursée", className: "bg-[#f5edf1] text-[#8f6075]" },
  expired: { label: "Expirée", className: "bg-gray-100 text-gray-500" },
};

export function orderStatusInfo(status) {
  return ORDER_STATUS_LABELS[status] || { label: status || "—", className: "bg-[#f5edf1] text-[#54434c]" };
}

export function formatOrderPrice(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}

// Référence lisible : ZEN-AAAA-MMJJ-NNNN (année, mois+jour de la commande, puis l'identifiant de la
// commande complété à 4 chiffres). Purement un formatage d'affichage : la vraie clé reste orders.id.
// L'annee, le mois et le jour sont ceux de Paris (Europe/Paris), quel que soit le fuseau de l'appareil ou du serveur.
export function formatOrderReference(order) {
  const counter = String(order.id).padStart(4, "0");
  const d = order.created_at ? new Date(order.created_at) : null;
  if (!d || Number.isNaN(d.getTime())) return `ZEN-${counter}`;
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
  return `ZEN-${get("year")}-${get("month")}${get("day")}-${counter}`;
}

// Commandes affichées à une cliente dans son espace : seulement celles réellement abouties
// (les commandes en attente, expirées, annulées ou remboursées restent masquées).
export const CUSTOMER_VISIBLE_STATUSES = ["paid", "shipped", "delivered"];

// Les 3 étapes du suivi affiché à la cliente, avec la date tirée de order_status_history
export const TRACKING_STEPS = [
  { status: "paid", label: "Payée" },
  { status: "shipped", label: "Expédiée" },
  { status: "delivered", label: "Livrée" },
];
