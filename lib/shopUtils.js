// ZENORIA_STOCK_UI_V1
// ============================================================================
// ZENORIA — Outils de la boutique partagés entre l'accueil (pages/index.js) et la page du quiz (pages/quiz.js)
// Logique pure : aucun React, aucune classe Tailwind.
// ============================================================================
export const formatPrice = (n) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
// ============================================================
// DISPONIBILITÉ D'UNE BAGUE (lot 2c : stock reel uniquement)
//
// Bijou normal : le seul stock est celui saisi dans l'administration.
//   - stock > 0          -> « Disponible » (commandable)
//   - stock = 0          -> « Épuisé » (non commandable : « Écrivez-nous »)
//   - quantité > stock   -> « Disponible », état "insufficient" (le panier demande de réduire la quantité)
//   Aucune quantité n'est affichée (choix validé : pas de chiffre visible par la cliente).
//
// Pièce unique : la disponibilité vient des réservations (product.pieceState, fourni par la page
// à partir de la fonction publique public_piece_states). Sans cette information, la pièce est
// considérée comme disponible : c'est le serveur (reserve_order_items) qui protège la vente.
//   - "reserved" -> réservée par une autre cliente (non commandable)
//   - "sold"     -> vendue (non commandable)
//
// Le serveur reste la seule garantie : un affichage en retard n'entraîne jamais de vente au-delà du stock.
// ============================================================
// ZENORIA_STOCK_UI2_V1 : état des pièces uniques lu par la fonction publique public_piece_states.
// Tolérant au nom des colonnes (product_id ou id ; state ou status). Seuls « reserved » et « sold » sont retenus.
export function pieceStateMap(rows) {
  const m = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r) return;
    const id = Number(r.product_id !== undefined && r.product_id !== null ? r.product_id : r.id);
    const s = r.state !== undefined && r.state !== null ? r.state : r.status;
    if (Number.isFinite(id) && (s === "reserved" || s === "sold")) m.set(id, s);
  });
  return m;
}
// ZENORIA_STOCK_UI3_V1 : disponibilité réelle des bijoux normaux (stock moins les paiements en cours), lue par la fonction
// publique public_stock_states (lot 2a). Map : identifiant -> nombre disponible. Absente ou illisible : null (repli sur le stock).
export function stockStateMap(rows) {
  const m = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r) return;
    const id = Number(r.product_id !== undefined && r.product_id !== null ? r.product_id : r.id);
    const a = Number(r.available);
    if (Number.isFinite(id) && Number.isFinite(a)) m.set(id, Math.max(0, Math.floor(a)));
  });
  return m;
}
// Exemplaires réellement commandables d'un bijou normal : le stock, diminué des paiements en cours si la page les connaît
function availableFor(p) {
  const stock = typeof p.stock === "number" && Number.isFinite(p.stock) ? Math.max(0, Math.floor(p.stock)) : 0;
  if (typeof p.available === "number" && Number.isFinite(p.available)) return Math.min(stock, Math.max(0, Math.floor(p.available)));
  return stock;
}
// Quantité maximale commandable : le stock saisi dans l'administration (1 pour une pièce unique)
export function maxQtyFor(product) {
  if (!product) return 0;
  if (product.isUnique === true) return 1;
    return availableFor(product); // ZENORIA_STOCK_UI3_V1
}
export function getAvailability(product, qty = 0) {
  const p = product || {};
  if (p.isUnique === true) {
    if (p.pieceState === "sold") return { state: "sold", orderable: false, stock: 0, label: "Vendue", detail: "" };
    if (p.pieceState === "reserved") return { state: "reserved", orderable: false, stock: 0, label: "En cours de commande", detail: "" };
    return { state: "in-stock", orderable: true, stock: 1, label: "Disponible", detail: "" };
  }
  const stock = typeof p.stock === "number" && Number.isFinite(p.stock) ? Math.max(0, Math.floor(p.stock)) : 0;
  if (stock <= 0) {
    return { state: "out-of-stock", orderable: false, stock, label: "Épuisé", detail: "" }; // ZENORIA_STOCK_UI2C_V1 : pastille sans texte de panier
  }
    const avail = availableFor(p); // ZENORIA_STOCK_UI3_V1 : paiements en cours déduits
  if (avail <= 0) {
    return { state: "reserved", orderable: false, stock, label: "En cours de commande", detail: "" };
  }
  if (qty > avail) {
    return { state: "insufficient", orderable: true, stock, label: "Disponible", detail: "" };
  }
  return { state: "in-stock", orderable: true, stock, label: "Disponible", detail: "" };
}
