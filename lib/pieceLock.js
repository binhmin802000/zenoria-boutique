// ============================================================
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
