// ============================================================================
// ZENORIA — Outils de la boutique partagés entre l'accueil (pages/index.js) et la page du quiz (pages/quiz.js)
// Logique pure : aucun React, aucune classe Tailwind.
// ============================================================================

// Délai de fabrication une fois le stock épuisé (affiché sur les fiches et dans le panier)
export const BACKORDER_LEAD_TIME = "5 jours";

export const formatPrice = (n) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

// ============================================================
// DISPONIBILITÉ D'UNE BAGUE
// - qty <= stock      -> disponible immédiatement
// - qty > stock        -> la partie au-delà du stock est fabriquée sur
//                         commande, avec un délai de quelques jours.
// - stock === 0        -> rupture de stock, fabrication sur commande uniquement.
// ============================================================
export function getAvailability(product, qty = 0) {
  const stock = typeof product.stock === "number" ? product.stock : 0;
  if (stock <= 0) {
    return { state: "backorder", stock, label: "Rupture de stock", detail: `Fabriquée sur commande · délai ${BACKORDER_LEAD_TIME}` };
  }
  if (qty > stock) {
    return {
      state: "partial-backorder",
      stock,
      label: `${stock} disponible${stock > 1 ? "s" : ""}`,
      detail: `${qty - stock} exemplaire${qty - stock > 1 ? "s" : ""} fabriqué${qty - stock > 1 ? "s" : ""} sur commande · délai ${BACKORDER_LEAD_TIME}`,
    };
  }
  return { state: "in-stock", stock, label: `${stock} disponible${stock > 1 ? "s" : ""}`, detail: "" };
}
