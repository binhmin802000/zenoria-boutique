// ZENORIA_API_CHECKOUT_TRANSFER_V1
// ============================================================
// pages/api/checkout-transfer.js — cree une commande en attente de
// virement (pending_transfer), via la fonction SQL create_transfer_order
// (reservee a service_role).
//
// SECURITE : les prix ne sont JAMAIS pris depuis la requete envoyee par
// le navigateur. Ils sont relus depuis Supabase (table products), puis
// le total est recalcule avec EXACTEMENT la meme logique que le site
// et que le paiement par carte (lib/cartTotals.js). La fonction SQL
// recontrole elle-meme chaque prix et le sous-total (lot 1), en filet
// de securite supplementaire.
//
// Entree attendue (POST, JSON) :
//   {
//     items: [{ id, qty }, ...],
//     promoCode: "CODE" | null,
//     shipping: { fullName, line1, line2, postalCode, city, phone }
//   }
//
// Sortie :
//   succes -> { ok: true, orderId, total, dueAt }
//   erreur -> { ok: false, error: "..." }
// ============================================================
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting } from "@/lib/shippingSettings";
import { computeTotals, effectivePrice } from "@/lib/cartTotals";
import { isTestOrderMode } from "@/lib/testMode"; // ZENORIA_TEST_MODE_V1 : règle unique « commande de test » (carte et virement)

function errorForCode(code) {
  const map = {
    AUTH_REQUIRED: { status: 401, message: "Un compte est nécessaire pour payer par virement. Connectez-vous ou créez votre compte." },
    INVALID_EMAIL: { status: 400, message: "Adresse e-mail invalide." },
    INVALID_ITEMS: { status: 400, message: "Panier invalide." },
    INVALID_TOTALS: { status: 400, message: "Impossible de calculer le total. Réessayez." },
    INVALID_ADDRESS: { status: 400, message: "Adresse de livraison invalide." },
    TRANSFER_DISABLED: { status: 403, message: "Le paiement par virement est momentanément indisponible. Merci de réessayer plus tard ou de nous contacter." },
    INVALID_QTY: { status: 400, message: "Quantité invalide pour un article." },
    UNIQUE_QTY: { status: 409, message: "Cette pièce unique est limitée à un seul exemplaire." },
    PRODUCT_UNAVAILABLE: { status: 409, message: "Un article de votre panier n'est plus disponible." },
    PRICE_MISMATCH: { status: 409, message: "Le prix d'un article a changé. Merci de recharger votre panier." },
    SUBTOTAL_MISMATCH: { status: 409, message: "Le total a changé. Merci de recharger votre panier." },
    TRANSFER_CAP: { status: 409, message: "Vous avez déjà 2 bagues en attente de virement. Finalisez ou annulez une commande pour en passer une nouvelle." },
  };
  const key = String(code || "").split(":")[0];
  return map[key] || { status: 500, message: "Impossible de créer la commande pour le moment." };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  try {
    // 1) Authentification OBLIGATOIRE : le virement exige un compte, sans exception invité.
    const authorization = req.headers.authorization;
    const match = typeof authorization === "string" && /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) {
      return res.status(401).json({ ok: false, error: "Un compte est nécessaire pour payer par virement. Connectez-vous ou créez votre compte." });
    }
    let authResult;
    try {
      authResult = await supabaseAdmin.auth.getUser(match[1]);
    } catch (authCatchErr) {
      console.error("[checkout-transfer] erreur auth.getUser :", authCatchErr && authCatchErr.message, authCatchErr && authCatchErr.stack);
      return res.status(503).json({ ok: false, error: "Vérification de connexion indisponible. Réessayez." });
    }
    if (authResult.error) {
      console.error("[checkout-transfer] authResult.error :", authResult.error.message, "status:", authResult.error.status);
      const status = Number(authResult.error.status);
      const unavailable = !status || status >= 500 || status === 429;
      return res.status(unavailable ? 503 : 401).json({
        ok: false,
        error: unavailable ? "Vérification de connexion indisponible. Réessayez." : "Session expirée ou invalide. Reconnectez-vous.",
      });
    }
    const checkoutUser = authResult.data && authResult.data.user;
    if (!checkoutUser || !checkoutUser.id || !checkoutUser.email) {
      return res.status(401).json({ ok: false, error: "Reconnectez-vous avant de payer." });
    }

    const { items, promoCode, shipping } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "panier vide" });
    }
    if (!shipping || typeof shipping !== "object") {
      return res.status(400).json({ ok: false, error: "adresse de livraison manquante" });
    }

    // 2) Relit les vrais produits en base (jamais les prix envoyes par le navigateur)
    const ids = items.map((it) => Number(it && it.id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return res.status(400).json({ ok: false, error: "aucun identifiant de produit valide" });
    }

    const { data: productsRows, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price, promo_price, stock, active, is_unique")
      .in("id", ids)
      .eq("active", true);

    if (prodErr) {
      return res.status(500).json({ ok: false, error: "impossible de lire le catalogue" });
    }

    const productById = new Map((productsRows || []).map((p) => [p.id, p]));

    // 3) Reconstitue les lignes du panier a partir des DONNEES EN BASE,
    //    jamais a partir de ce qu'a envoye le navigateur.
    const lines = [];
    for (const it of items) {
      const row = productById.get(Number(it && it.id));
      if (!row) continue;
      const requestedQty = Math.floor(Number(it.qty) || 1);
      if (row.is_unique === true && requestedQty !== 1) {
        return res.status(400).json({ ok: false, error: `La pièce unique « ${row.name} » est limitée à un seul exemplaire.` });
      }
      const qty = row.is_unique === true ? 1 : Math.max(1, Math.min(10, requestedQty));
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

    // 4) Relit le code promo en base (jamais ce qu'envoie le navigateur)
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

    // 5) Relit le reglage de livraison en base
    const { data: settingsRows } = await supabase
      .from(SITE_SETTINGS_TABLE)
      .select("key, value")
      .in("key", [SHIPPING_KEY]);
    const shippingRow = (settingsRows || []).find((r) => r.key === SHIPPING_KEY);
    const shippingCfg = parseShippingSetting(shippingRow ? shippingRow.value : null) || DEFAULT_SHIPPING;

    // 6) Recalcule le total avec EXACTEMENT la meme logique que le site et la carte
    const totals = computeTotals(lines, promo, shippingCfg);

    // 7) Construit le tableau d'items au format attendu par create_transfer_order
    //    (unit_price doit matcher le regex '^[0-9]{1,6}(\.[0-9]{1,2})?$' cote SQL)
    const rpcItems = lines.map((l) => ({
      product_id: l.product.id,
      qty: l.qty,
      unit_price: effectivePrice(l.product).toFixed(2),
    }));

    const isTest = isTestOrderMode(); // ZENORIA_TEST_MODE_V1 : commande de test tant que la clé Stripe n'est pas en mode réel (comme la carte), et non d'après l'environnement de déploiement

    // 8) Appelle la fonction SQL atomique (service_role, verifie tout en interne :
    //    prix, plafond, reservation des pieces uniques, historique)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("create_transfer_order", {
      p_user_id: checkoutUser.id,
      p_email: checkoutUser.email,
      p_items: rpcItems,
      p_subtotal: totals.subtotal,
      p_discount: totals.discount,
      p_shipping: totals.shipping,
      p_total: totals.total,
      p_promo_code: normalizedPromoCode || null,
      p_ship_name: String(shipping.fullName || "").trim(),
      p_ship_line1: String(shipping.line1 || "").trim(),
      p_ship_line2: shipping.line2 ? String(shipping.line2).trim() : null,
      p_ship_postal: String(shipping.postalCode || "").trim(),
      p_ship_city: String(shipping.city || "").trim(),
      p_ship_phone: shipping.phone ? String(shipping.phone).trim() : null,
      p_is_test: isTest,
    });

    if (rpcError) {
      const { status, message } = errorForCode(rpcError.message);
      return res.status(status).json({ ok: false, error: message });
    }

    return res.status(200).json({
      ok: true,
      orderId: rpcResult.order_id,
      total: rpcResult.total,
      dueAt: rpcResult.due_at,
    });
  } catch (err) {
    console.error("[checkout-transfer]", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: "erreur lors de la création de la commande" });
  }
}