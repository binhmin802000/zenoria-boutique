// ZENORIA_API_ADMIN_ORDER_STATUS_V2
// ============================================================
// pages/api/admin/orders/update-status.js
//
// Marque une commande comme "expediee" (avec transporteur + numero de
// suivi) ou "livree", depuis l'admin (/admin > CRM > Commandes). Utilise
// la cle service_role (seule autorisee a ecrire dans orders), puisque la
// cle publique interdit toute ecriture sur cette table par securite.
//
// SECURITE (V2) :
//   1. La requete doit porter le jeton de connexion de l'administratrice
//      (en-tete Authorization: Bearer ...). Le jeton est verifie par Supabase,
//      puis le compte doit figurer dans la table admin_users (la meme que la
//      fonction SQL is_admin()).
//        - pas de jeton ou jeton invalide : 401
//        - connectee mais pas administratrice : 403
//        - verification impossible (Supabase indisponible) : 503
//   2. Le statut courant est controle ET applique dans la meme ecriture :
//        - "ship"    : seulement depuis "paid" (ou "shipped", pour corriger un suivi)
//        - "deliver" : seulement depuis "paid" ou "shipped"
//      Une commande en attente, en attente de virement, annulee, expiree ou
//      remboursee ne peut jamais etre expediee ni livree. Si le statut a change
//      entre-temps, l'ecriture ne touche aucune ligne et la route repond 409.
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
const SHIPPABLE_FROM = ["paid", "shipped"];
const DELIVERABLE_FROM = ["paid", "shipped"];
const MAX_TRACKING_LENGTH = 60;

// Renvoie l'utilisateur administrateur, ou null apres avoir deja repondu a la requete.
async function requireAdmin(req, res) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === "string" && /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) {
    res.status(401).json({ ok: false, error: "Connexion requise." });
    return null;
  }

  let authResult;
  try {
    authResult = await supabaseAdmin.auth.getUser(match[1]);
  } catch {
    res.status(503).json({ ok: false, error: "Verification de connexion indisponible. Reessayez." });
    return null;
  }
  if (authResult.error) {
    const status = Number(authResult.error.status);
    const unavailable = !status || status >= 500 || status === 429;
    res.status(unavailable ? 503 : 401).json({
      ok: false,
      error: unavailable ? "Verification de connexion indisponible. Reessayez." : "Session expiree ou invalide. Reconnectez-vous.",
    });
    return null;
  }
  const user = authResult.data && authResult.data.user;
  if (!user || !user.id) {
    res.status(401).json({ ok: false, error: "Session expiree ou invalide. Reconnectez-vous." });
    return null;
  }

  const { data: adminRow, error: adminErr } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminErr) {
    console.error("[admin-order-status] echec lecture admin_users :", adminErr.message);
    res.status(503).json({ ok: false, error: "Verification des droits indisponible. Reessayez." });
    return null;
  }
  if (!adminRow) {
    res.status(403).json({ ok: false, error: "Acces reserve aux administrateurs." });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { orderId, action, carrier, trackingNumber } = req.body || {};

    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) {
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
      if (trimmedTracking.length > MAX_TRACKING_LENGTH) {
        return res.status(400).json({ ok: false, error: "numéro de suivi trop long" });
      }

      // Le controle du statut fait partie de l'ecriture : rien n'est modifie si la commande n'est pas payee.
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("orders")
        .update({
          status: "shipped",
          carrier,
          tracking_number: trimmedTracking,
          shipped_at: new Date().toISOString(),
        })
        .eq("id", id)
        .in("status", SHIPPABLE_FROM)
        .select("id");

      if (updateErr) {
        console.error("[admin-order-status] échec mise à jour (ship) :", updateErr.message);
        return res.status(500).json({ ok: false, error: "échec de la mise à jour" });
      }
      if (!updated || updated.length === 0) {
        return res.status(409).json({ ok: false, error: "Cette commande ne peut pas être expédiée dans son état actuel : elle doit d'abord être payée." });
      }

      const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert({
        order_id: id,
        status: "shipped",
        note: "Expédiée via " + carrier + ", suivi : " + trimmedTracking + ".",
      });
      if (historyErr) {
        console.error("[admin-order-status] échec order_status_history (ship) :", historyErr.message);
      }

      return res.status(200).json({ ok: true });
    }

    // action === "deliver"
    const { data: delivered, error: deliverErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "delivered" })
      .eq("id", id)
      .in("status", DELIVERABLE_FROM)
      .select("id");

    if (deliverErr) {
      console.error("[admin-order-status] échec mise à jour (deliver) :", deliverErr.message);
      return res.status(500).json({ ok: false, error: "échec de la mise à jour" });
    }
    if (!delivered || delivered.length === 0) {
      return res.status(409).json({ ok: false, error: "Cette commande ne peut pas être marquée comme livrée dans son état actuel : elle doit être payée ou expédiée." });
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
