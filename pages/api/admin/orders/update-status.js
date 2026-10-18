// ZENORIA_API_ADMIN_ORDER_STATUS_V1
// ============================================================
// pages/api/admin/orders/update-status.js
//
// Marque une commande comme "expediee" (avec transporteur + numero de
// suivi) ou "livree", depuis l'admin (/admin > CRM > Commandes). Utilise
// la cle service_role (seule autorisee a ecrire dans orders), puisque la
// cle publique interdit toute ecriture sur cette table par securite.
//
// SECURITE : cette route n'est protegee par AUCUNE verification de
// session pour l'instant, car l'ensemble de la page /admin est deja
// protegee en amont (redirection si non connectee/non admin, voir
// pages/admin.js). Si cette route venait a etre appelee depuis un
// contexte different, il faudrait y ajouter une verification de session
// explicite.
//
// Entree attendue (POST, JSON) :
//   {
//     orderId: number,
//     action: "ship" | "deliver",
//     carrier?: string,         // requis si action === "ship"
//     trackingNumber?: string,  // requis si action === "ship"
//   }
// ============================================================

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_CARRIERS = ["Colissimo", "Mondial Relay", "Chronopost", "DPD", "Colis Privé"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  try {
    const { orderId, action, carrier, trackingNumber } = req.body || {};

    const id = Number(orderId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "identifiant de commande invalide" });
    }

    if (action !== "ship" && action !== "deliver") {
      return res.status(400).json({ ok: false, error: "action invalide" });
    }

    if (action === "ship") {
      const trimmedTracking = String(trackingNumber || "").trim();
      if (!ALLOWED_CARRIERS.includes(carrier)) {
        return res.status(400).json({ ok: false, error: "transporteur invalide" });
      }
      if (!trimmedTracking) {
        return res.status(400).json({ ok: false, error: "numéro de suivi requis" });
      }

      const { error: updateErr } = await supabaseAdmin
        .from("orders")
        .update({
          status: "shipped",
          carrier,
          tracking_number: trimmedTracking,
          shipped_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateErr) {
        console.error("[admin-order-status] échec mise à jour (ship) :", updateErr.message);
        return res.status(500).json({ ok: false, error: "échec de la mise à jour" });
      }

      const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert({
        order_id: id,
        status: "shipped",
        note: `Expédiée via ${carrier}, suivi : ${trimmedTracking}.`,
      });
      if (historyErr) {
        console.error("[admin-order-status] échec order_status_history (ship) :", historyErr.message);
      }

      return res.status(200).json({ ok: true });
    }

    // action === "deliver"
    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "delivered" })
      .eq("id", id);

    if (updateErr) {
      console.error("[admin-order-status] échec mise à jour (deliver) :", updateErr.message);
      return res.status(500).json({ ok: false, error: "échec de la mise à jour" });
    }

    const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert({
      order_id: id,
      status: "delivered",
      note: "Marquée comme livrée manuellement depuis l'administration.",
    });
    if (historyErr) {
      console.error("[admin-order-status] échec order_status_history (deliver) :", historyErr.message);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[admin-order-status] erreur inattendue :", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: "erreur serveur" });
  }
}
