// ZENORIA_API_WEBHOOK_STRIPE_V1
// ============================================================
// pages/api/webhooks/stripe.js
//
// Recoit les evenements envoyes par Stripe (mode test). Ne traite que
// "checkout.session.completed" : cree la commande dans orders et
// order_items, puis une ligne dans order_status_history, en utilisant la
// cle service_role (seule autorisee a ecrire dans ces tables).
//
// SECURITE : la signature de chaque requete est verifiee AVANT tout
// traitement. Une requete dont la signature ne correspond pas est
// rejetee : ca garantit qu'elle provient bien de Stripe, pas d'un tiers
// qui tenterait de fabriquer une fausse confirmation de paiement.
//
// Next.js doit recevoir le corps BRUT (non transforme en JSON) pour que
// la verification de signature fonctionne : d'ou bodyParser: false et la
// lecture manuelle du flux ci-dessous.
// ============================================================

import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Lit le corps brut d'une requete Node.js (IncomingMessage) en un seul Buffer.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[webhook-stripe] STRIPE_WEBHOOK_SECRET absente sur le serveur");
    return res.status(500).json({ ok: false, error: "configuration manquante" });
  }

  const signature = req.headers["stripe-signature"];
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[webhook-stripe] signature invalide :", err.message);
    return res.status(400).json({ ok: false, error: "signature invalide" });
  }

  // On répond vite et on ignore tout événement qu'on n'a pas demandé à
  // recevoir (seul "checkout.session.completed" a été sélectionné côté
  // Stripe, mais ce garde-fou reste utile si d'autres événements sont
  // ajoutés un jour sans modifier ce fichier).
  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ ok: true, ignored: event.type });
  }

  const session = event.data.object;

  try {
    // Évite de créer deux fois la même commande si Stripe renvoie le même
    // événement plusieurs fois (il réessaie automatiquement en cas de
    // non-réponse ou d'erreur de notre part).
    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (existingOrder) {
      return res.status(200).json({ ok: true, already: true, orderId: existingOrder.id });
    }

    const meta = session.metadata || {};
    let cartItems = [];
    try {
      cartItems = JSON.parse(meta.cart_items || "[]");
    } catch {
      cartItems = [];
    }

    const customer = session.customer_details || {};
    const address = customer.address || {};

    const { data: orderRow, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: null, // aucun compte relié au paiement pour l'instant (viendra avec le branchement du panier)
        guest_email: customer.email || null,
        status: "paid",
        is_test: event.livemode === false,
        subtotal: Number(meta.subtotal || 0),
        discount: Number(meta.discount || 0),
        shipping: Number(meta.shipping || 0),
        total: Number(meta.total || (session.amount_total || 0) / 100),
        promo_code: meta.promo_code || null,
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent || null,
        shipping_full_name: customer.name || null,
        shipping_address_line1: address.line1 || null,
        shipping_address_line2: address.line2 || null,
        shipping_postal_code: address.postal_code || null,
        shipping_city: address.city || null,
        shipping_country: address.country || "France",
        shipping_phone: customer.phone || null,
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (orderErr) {
      console.error("[webhook-stripe] échec insertion orders :", orderErr.message);
      return res.status(500).json({ ok: false, error: "échec enregistrement commande" });
    }

    if (cartItems.length > 0) {
      const itemsToInsert = cartItems.map((it) => ({
        order_id: orderRow.id,
        product_id: it.id ?? null,
        product_name: it.name || "Article",
        product_price: Number(it.price || 0),
        qty: Number(it.qty || 1),
      }));
      const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(itemsToInsert);
      if (itemsErr) {
        console.error("[webhook-stripe] échec insertion order_items :", itemsErr.message);
      }
    }

    const { error: historyErr } = await supabaseAdmin
      .from("order_status_history")
      .insert({ order_id: orderRow.id, status: "paid", note: "Paiement confirmé par Stripe (webhook)" });
    if (historyErr) {
      console.error("[webhook-stripe] échec insertion order_status_history :", historyErr.message);
    }

    return res.status(200).json({ ok: true, orderId: orderRow.id });
  } catch (err) {
    console.error("[webhook-stripe] erreur inattendue :", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: "erreur serveur" });
  }
}
