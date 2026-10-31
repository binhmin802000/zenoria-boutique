// ZENORIA_CART_TOTALS_V1
// ZENORIA_SHIPPING_RULE_V1
// ============================================================
// lib/cartTotals.js
//
// Calcul du panier : SOURCE UNIQUE, partagee par le site (pages/index.js) et par les routes de paiement
// (pages/api/checkout.js pour la carte, pages/api/checkout-transfer.js pour le virement).
// Le montant affiche a la cliente et le montant facture sont donc TOUJOURS identiques.
// Ne JAMAIS recopier ce calcul dans une page : l'importer.
//
// REGLE DE LA LIVRAISON OFFERTE (unique : panier, barre de progression, carte, virement)
//   S = montant du panier = somme des (prix effectif x quantite), AVANT tout code promo.
//   - livraison offerte activee (reglage admin) ET S >= seuil (reglage admin) : livraison offerte ;
//   - sinon : frais de livraison (SHIPPING_FEE).
//   Un code promo se deduit de S pour le montant a payer ; il ne change JAMAIS le droit a la livraison offerte.
//   Un code dont le type est "shipping" n'a donc plus d'effet : sa remise est nulle.
//   A payer = S - remise + livraison.
//   « Plus que X EUR » et la barre de progression = seuil - S (jamais negatif), seulement si la livraison offerte est activee.
// Filet de securite : si le montant apres remise est inferieur a MIN_CHARGE (Stripe refuse moins de 0,50 EUR),
//   la livraison est facturee meme si le seuil est atteint.
// ============================================================
import { DEFAULT_SHIPPING, qualifiesForFreeShipping } from "./shippingSettings";
export const SHIPPING_FEE = 4.9; // frais de livraison sous le seuil (France) : reste regle dans le code, pas dans l'admin
export const MIN_CHARGE = 0.5; // montant minimal facturable par Stripe (EUR)
export const round2 = (n) => Math.round(n * 100) / 100;
// Prix reellement applique : le prix promotionnel s'il est defini et inferieur au prix normal.
export const effectivePrice = (p) => (p.promoPrice != null && p.promoPrice < p.price ? p.promoPrice : p.price);
// Calcul des montants du panier (sous-total, remise, livraison, total, reste a atteindre)
export function computeTotals(lines, promo, shippingCfg = DEFAULT_SHIPPING) {
  const subtotal = round2(lines.reduce((s, l) => s + effectivePrice(l.product) * l.qty, 0));
  let discount = 0;
  if (promo && promo.type === "percent") discount = round2((subtotal * promo.value) / 100);
  if (promo && promo.type === "fixed") discount = Math.min(promo.value, subtotal);
  const discounted = round2(subtotal - discount);
  let shipping = 0;
  if (lines.length > 0) {
    // le seuil se compare au montant du panier AVANT code promo ; le filet MIN_CHARGE evite un paiement inferieur a 0,50 EUR
    const free = qualifiesForFreeShipping(shippingCfg, subtotal) && discounted >= MIN_CHARGE;
    shipping = free ? 0 : SHIPPING_FEE;
  }
  const total = round2(discounted + shipping);
  const remaining = shippingCfg.enabled ? round2(Math.max(0, shippingCfg.threshold - subtotal)) : 0;
  return { subtotal, discount, shipping, total, remaining, freeShipping: lines.length > 0 && shipping === 0 };
}
