// ZENORIA_STOCK_UI3_V1
// ============================================================
// pages/api/checkout-cancel.js — la cliente revient de Stripe sans payer : on ferme sa session et on libère sa réservation.
//
// Entrée (POST, JSON) : { sessionId: "cs_test_..." }  (gardé par le site dans l'onglet, avant la redirection vers Stripe)
// Sortie : { ok: true, released: true|false }
//
// SÉCURITÉ
//  - Le numéro de session Stripe est long et impossible à deviner : seul l'onglet qui a lancé le paiement le connaît.
//  - Rien n'est fait si la session n'est plus « ouverte » (déjà payée ou déjà expirée) : un paiement réussi n'est jamais annulé.
//  - L'ordre compte : la session est d'abord fermée chez Stripe (plus aucun paiement possible), PUIS la commande « pending »
//    passe en « expired » et sa réservation est libérée. Le webhook checkout.session.expired qui suit trouvera une commande
//    qui n'est plus « pending » et ne refera rien.
// ============================================================
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }
  const sessionId = req.body && typeof req.body.sessionId === "string" ? req.body.sessionId.trim() : "";
  if (!SESSION_RE.test(sessionId)) {
    return res.status(400).json({ ok: false, error: "session invalide" });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.status !== "open") {
      return res.status(200).json({ ok: true, released: false });
    }
    await stripe.checkout.sessions.expire(sessionId);
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (!order || order.status !== "pending") {
      return res.status(200).json({ ok: true, released: false });
    }
    const { error: releaseErr } = await supabaseAdmin.rpc("release_order_items", { p_order_id: order.id, p_reason: "expired" });
    if (releaseErr) {
      console.error("[checkout-cancel] échec release_order_items :", releaseErr.message);
    }
    const { error: updateErr } = await supabaseAdmin.from("orders").update({ status: "expired" }).eq("id", order.id).eq("status", "pending");
    if (updateErr) {
      console.error("[checkout-cancel] échec passage en expired :", updateErr.message);
    }
    await supabaseAdmin.from("order_status_history").insert({
      order_id: order.id,
      status: "expired",
      note: "Paiement abandonné par la cliente (retour depuis la page de paiement) : commande close, article(s) remis en vente.",
    });
    return res.status(200).json({ ok: true, released: !releaseErr });
  } catch (err) {
    console.error("[checkout-cancel]", err && err.message ? err.message : err);
    return res.status(200).json({ ok: false, released: false });
  }
}
