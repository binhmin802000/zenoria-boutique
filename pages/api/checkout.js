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
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting } from "@/lib/shippingSettings";
import { PAYMENT_METHODS_KEY, parsePaymentMethods } from "@/lib/paymentSettings"; // ZENORIA_PAYMENT_STEP2_V1
import { computeTotals, effectivePrice } from "@/lib/cartTotals";
import { isTestOrderMode } from "@/lib/testMode"; // ZENORIA_TEST_MODE_V1 : règle unique « commande de test » (carte et virement)

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
    // ZENORIA_ORDER_OWNER_V1: identite verifiee par Supabase, jamais fournie par le JSON client.
    let checkoutUser = null;
    const authorization = req.headers.authorization;
    if (authorization !== undefined) {
      const match = typeof authorization === "string" && /^Bearer ([^\s]+)$/i.exec(authorization);
      if (!match) return res.status(401).json({ ok: false, error: "Connexion invalide. Reconnectez-vous." });
      let authResult;
      try {
        authResult = await supabaseAdmin.auth.getUser(match[1]);
      } catch {
        return res.status(503).json({ ok: false, error: "Verification de connexion indisponible. Reessayez." });
      }
      if (authResult.error) {
        const status = Number(authResult.error.status);
        const unavailable = !status || status >= 500 || status === 429;
        return res.status(unavailable ? 503 : 401).json({ ok: false, error: unavailable
          ? "Verification de connexion indisponible. Reessayez."
          : "Session expiree ou invalide. Reconnectez-vous." });
      }
      checkoutUser = authResult.data && authResult.data.user;
      if (!checkoutUser || !checkoutUser.id) return res.status(401).json({ ok: false, error: "Reconnectez-vous avant de payer." });
    }
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
      .select("id, name, price, promo_price, stock, is_unique, active")
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
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1)); // ZENORIA_STOCK_V1 : plus de plafond fixe, le stock reel (reserve_order_items) protege desormais la quantite
      lines.push({
        product: {
          id: row.id,
          name: row.name,
          price: Number(row.price),
          promoPrice: row.promo_price !== null && row.promo_price !== undefined ? Number(row.promo_price) : null,
          isUnique: row.is_unique === true,
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

    // ZENORIA_PAYMENT_STEP2_V1 : garde-fou carte désactivée (Admin > CRM > Commandes > Moyens de paiement).
    // Placé AVANT la création de la commande « pending » : aucune commande orpheline si la carte est coupée.
    // Réglage absent ou illisible = carte active : une panne de lecture ne doit jamais bloquer les ventes.
    // Le webhook Stripe ne lit pas ce réglage : un paiement déjà lancé avant la coupure reste confirmé.
    {
      const { data: payRow } = await supabase
        .from(SITE_SETTINGS_TABLE)
        .select("value")
        .eq("key", PAYMENT_METHODS_KEY)
        .maybeSingle();
      if (!parsePaymentMethods(payRow ? payRow.value : null).stripe_enabled) {
        return res.status(403).json({
          ok: false,
          error: "Le paiement par carte bancaire est momentanément indisponible. Merci de réessayer plus tard ou de nous contacter.",
        });
      }
    }

    // 5) Recalcule le total avec EXACTEMENT la meme logique que le site
    const totals = computeTotals(lines, promo, shippingCfg);

    // 5bis) Cree la commande en "pending" des maintenant, avant meme la
    // redirection vers Stripe : les paniers abandonnes restent ainsi visibles
    // dans /admin > Commandes. Le webhook la fera passer a "paid" une fois le
    // paiement confirme, au lieu d'en creer une nouvelle. Non bloquant : si
    // cette ecriture echoue, le paiement continue normalement (le webhook
    // creera alors la commande complete en filet de securite, comme avant).
    // ZENORIA_STOCK_V1 : la commande « pending » et sa reservation de stock/pieces deviennent BLOQUANTES.
    // Si l'une de ces etapes echoue, on arrete tout AVANT la redirection vers Stripe (pas de commande orpheline,
    // pas de paiement sur un article qui ne serait plus disponible). La reservation dure 31 minutes : la session
    // Stripe est creee avec la meme duree (voir plus bas), pour que les deux expirent ensemble.
    const RESERVATION_MINUTES = 31;
    let pendingOrderId = null;
    const { data: pendingOrder, error: pendingErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: checkoutUser ? checkoutUser.id : null,
        guest_email: "en_attente@zenoria.local", // temporaire : remplace par le vrai e-mail une fois le webhook confirme
        status: "pending",
        is_test: isTestOrderMode(), // ZENORIA_TEST_MODE_V1 : règle unique avec le virement (lib/testMode.js)
        subtotal: totals.subtotal,
        discount: totals.discount,
        shipping: totals.shipping,
        total: totals.total,
        promo_code: normalizedPromoCode || null,
      })
      .select("id")
      .single();
    if (pendingErr) {
      console.error("[checkout] échec création commande pending :", pendingErr.message);
      return res.status(500).json({ ok: false, error: "Impossible de créer la commande pour le moment. Réessayez." });
    }
    pendingOrderId = pendingOrder.id;
    const pendingItems = lines.map((l) => ({
      order_id: pendingOrderId,
      product_id: l.product.id,
      product_name: l.product.name,
      product_price: effectivePrice(l.product),
      qty: l.qty,
    }));
    const { error: pendingItemsErr } = await supabaseAdmin.from("order_items").insert(pendingItems);
    if (pendingItemsErr) {
      console.error("[checkout] échec création order_items (pending) :", pendingItemsErr.message);
      await supabaseAdmin.from("orders").delete().eq("id", pendingOrderId);
      return res.status(500).json({ ok: false, error: "Impossible de créer la commande pour le moment. Réessayez." });
    }
    const { error: reserveErr } = await supabaseAdmin.rpc("reserve_order_items", {
      p_order_id: pendingOrderId,
      p_expires_at: new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000).toISOString(),
    });
    if (reserveErr) {
      await supabaseAdmin.from("orders").delete().eq("id", pendingOrderId);
      const rawMessage = String(reserveErr.message || "");
      const errorCode = rawMessage.split(":")[0].trim();
      if (errorCode === "PIECE_UNAVAILABLE" || errorCode === "STOCK_UNAVAILABLE") {
        const productIds = (rawMessage.split(":")[1] || "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
        return res.status(409).json({
          ok: false,
          error:
            errorCode === "PIECE_UNAVAILABLE"
              ? "Une pièce unique de votre panier vient d'être réservée ou vendue. Retirez-la de votre panier pour continuer."
              : "Un article de votre panier n'est plus disponible en quantité suffisante. Retirez-le ou réduisez la quantité.",
          code: errorCode,
          productIds,
        });
      }
      console.error("[checkout] erreur non traduite de reserve_order_items :", errorCode.slice(0, 80) || "(sans code)", reserveErr.code || "");
      return res.status(500).json({ ok: false, error: "Impossible de créer la commande pour le moment. Réessayez." });
    }

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
      line_items: stripeLineItems,
      success_url: `${origin}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?paiement=annule`,
      shipping_address_collection: { allowed_countries: ["FR"] },
      phone_number_collection: { enabled: true },
      expires_at: Math.floor(Date.now() / 1000) + RESERVATION_MINUTES * 60, // ZENORIA_STOCK_V1 : la session Stripe expire en meme temps que la reservation de stock/pieces
      metadata: {
        zenoria_user_id: checkoutUser ? checkoutUser.id : "",
        promo_code: normalizedPromoCode || "",
        order_id: pendingOrderId ? String(pendingOrderId) : "",
        cart_items: JSON.stringify(
          lines.map((l) => ({ id: l.product.id, name: l.product.name, price: effectivePrice(l.product), qty: l.qty }))
        ),
        subtotal: String(totals.subtotal),
        discount: String(totals.discount),
        shipping: String(totals.shipping),
        total: String(totals.total),
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

    if (pendingOrderId) {
      const { error: linkErr } = await supabaseAdmin
        .from("orders")
        .update({ stripe_session_id: session.id })
        .eq("id", pendingOrderId);
      if (linkErr) {
        console.error("[checkout] échec liaison stripe_session_id :", linkErr.message);
      }
    }

    return res.status(200).json({ ok: true, url: session.url, sessionId: session.id }); // ZENORIA_STOCK_UI3_V1 : le site le garde pour libérer la réservation si la cliente revient sans payer
  } catch (err) {
    console.error("[checkout]", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: "erreur lors de la création du paiement" });
  }
}
