// ZENORIA_CART_TOTALS_V1
// ============================================================
// lib/cartTotals.js
//
// Logique de calcul du panier, partagee entre le site (pages/index.js) et
// les routes API (pages/api/checkout.js), pour que le montant affiche a
// la cliente et le montant reellement facture par Stripe soient TOUJOURS
// identiques.
//
// ATTENTION : ce fichier est une copie fidele de ce qui existe deja dans
// pages/index.js (SHIPPING_FEE, round2, effectivePrice, computeTotals).
// Si cette logique change un jour sur le site (nouveau type de remise,
// nouvelle regle de livraison...), ce fichier doit etre mis a jour EN MEME
// TEMPS, sinon le prix du panier et le prix facture pourraient diverger.
// ============================================================

import { DEFAULT_SHIPPING, qualifiesForFreeShipping } from "./shippingSettings";

export const SHIPPING_FEE = 4.9; // frais de livraison sous le seuil (France)

export const round2 = (n) => Math.round(n * 100) / 100;

// Prix reellement applique : le prix promotionnel s'il est defini et inferieur au prix normal.
export const effectivePrice = (p) => (p.promoPrice != null && p.promoPrice < p.price ? p.promoPrice : p.price);

// Calcul des montants du panier (sous-total, remise, livraison, total)
// -- copie exacte de la fonction du meme nom dans pages/index.js --
export function computeTotals(lines, promo, shippingCfg = DEFAULT_SHIPPING) {
  const subtotal = round2(lines.reduce((s, l) => s + effectivePrice(l.product) * l.qty, 0));
  let discount = 0;
  if (promo && promo.type === "percent") discount = round2((subtotal * promo.value) / 100);
  if (promo && promo.type === "fixed") discount = Math.min(promo.value, subtotal);
  const discounted = round2(subtotal - discount);
  const freeByPromo = Boolean(promo && promo.type === "shipping");
  const qualifies = qualifiesForFreeShipping(shippingCfg, discounted);
  const shipping = lines.length === 0 ? 0 : freeByPromo || qualifies ? 0 : SHIPPING_FEE;
  const total = round2(discounted + shipping);
  const remaining = shippingCfg.enabled ? round2(Math.max(0, shippingCfg.threshold - discounted)) : 0;
  return { subtotal, discount, shipping, total, remaining, freeShipping: lines.length > 0 && shipping === 0 };
}
