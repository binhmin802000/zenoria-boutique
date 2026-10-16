// ZENORIA_API_CHECKOUT_V1
// ============================================================
// pages/api/checkout.js — cree une session Stripe Checkout (mode test)
//
// SECURITE : les prix ne sont JAMAIS pris depuis la requete envoyee par le
// navigateur. Ils sont relus depuis Supabase (table products), puis le
// total est recalcule avec EXACTEMENT la meme logique que le site
// (lib/cartTotals.js), pour que le montant facture corresponde toujours a
// ce que la cliente a vu dans son panier.
//
// Entree attendue (POST, JSON) :
//   { items: [{ id, qty }, ...], promoCode: "CODE" | null }
//
// Sortie :
//   succes  -> { ok: true, url: "https://checkout.stripe.com/..." }
//   erreur  -> { ok: false, error: "..." }
// ============================================================

import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting } from "@/lib/shippingSettings";
import { computeTotals, effectivePrice } from "@/lib/cartTotals";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ ok: false, error: "STRIPE_SECRET_KEY absente sur le serveur" });
  }

  try {
    const { items, promoCode } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "panier vide" });
    }

    // 1) Relit les vrais produits en base (jamais les prix envoyes par le navigateur)
    const ids = items.map((it) => Number(it && it.id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return res.status(400).json({ ok: false, error: "aucun identifiant de produit valide" });
    }

    const { data: productsRows, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price, promo_price, stock, active")
      .in("id", ids)
      .eq("active", true);

    if (prodErr) {
      return res.status(500).json({ ok: false, error: "impossible de lire le catalogue" });
    }

    const productById = new Map((productsRows || []).map((p) => [p.id, p]));

    // 2) Reconstitue les lignes du panier a partir des DONNEES EN BASE,
    //    jamais a partir de ce qu'a envoye le navigateur.
    const lines = [];
    for (const it of items) {
      const row = productById.get(Number(it && it.id));
      if (!row) continue; // produit inconnu, desactive ou supprime : ligne ignoree
      const qty = Math.max(1, Math.min(10, Math.floor(Number(it.qty) || 1))); // meme plafond que le site
      lines.push({
        product: {
          id: row.id,
          name: row.name,
          price: Number(row.price),
          promoPrice:
            row.promo_price !== null && row.promo_price !== undefined ? Number(row.promo_price) : null,
        },
        qty,
      });
    }

    if (lines.length === 0) {
      return res.status(400).json({ ok: false, error: "aucun article valide dans le panier" });
    }

    // 3) Relit le code promo en base (jamais ce qu'envoie le navigateur)
    let promo = null;
    let normalizedPromoCode = "";
    if (promoCode && String(promoCode).trim()) {
      normalizedPromoCode = String(promoCode).trim().toUpperCase();
      const { data: promoRow } = await supabase
        .from("promo_codes")
        .select("code, type, value, label, active")
        .eq("code", normalizedPromoCode)
        .eq("active", true)
        .maybeSingle();
      if (promoRow) promo = { type: promoRow.type, value: Number(promoRow.value), label: promoRow.label };
    }

    // 4) Relit le reglage de livraison en base
    const { data: settingsRows } = await supabase
      .from(SITE_SETTINGS_TABLE)
      .select("key, value")
      .in("key", [SHIPPING_KEY]);
    const shippingRow = (settingsRows || []).find((r) => r.key === SHIPPING_KEY);
    const shippingCfg = parseShippingSetting(shippingRow ? shippingRow.value : null) || DEFAULT_SHIPPING;

    // 5) Recalcule le total avec EXACTEMENT la meme logique que le site
    const totals = computeTotals(lines, promo, shippingCfg);

    // 6) Construit les lignes Stripe (prix en centimes, obligatoire pour Stripe)
    const stripeLineItems = lines.map((l) => ({
      price_data: {
        currency: "eur",
        product_data: { name: l.product.name },
        unit_amount: Math.round(effectivePrice(l.product) * 100),
      },
      quantity: l.qty,
    }));

    if (totals.shipping > 0) {
      stripeLineItems.push({
        price_data: {
          currency: "eur",
          product_data: { name: "Livraison (France)" },
          unit_amount: Math.round(totals.shipping * 100),
        },
        quantity: 1,
      });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const sessionParams = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: stripeLineItems,
      success_url: `${origin}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?paiement=annule`,
      metadata: {
        promo_code: normalizedPromoCode || "",
      },
    };

    // La remise (totals.discount) est appliquee via un coupon Stripe cree a
    // la volee, pour rester coherent avec les codes promo deja geres cote
    // Zenoria (table promo_codes), plutot que d'utiliser le systeme de
    // Promotion Codes propre a Stripe.
    if (totals.discount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(totals.discount * 100),
        currency: "eur",
        duration: "once",
        name: promo ? promo.label : "Remise",
      });
      sessionParams.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[checkout]", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: "erreur lors de la création du paiement" });
  }
}
