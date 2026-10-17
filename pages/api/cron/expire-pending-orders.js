// ZENORIA_API_CRON_EXPIRE_PENDING_V1
// ============================================================
// pages/api/cron/expire-pending-orders.js
//
// Route appelee automatiquement une fois par jour par Vercel (voir
// vercel.json, section "crons"). Fait passer au statut "expired" toute
// commande encore "pending" depuis plus de 24h, et trace l'evenement
// dans order_status_history.
//
// SECURITE : cette route n'est PAS protegee par une session utilisateur
// (elle n'est jamais appelee depuis un navigateur), mais par un secret
// partage (CRON_SECRET), verifie via l'en-tete Authorization que Vercel
// ajoute automatiquement a chaque appel programme. Toute requete sans ce
// secret, ou avec un secret incorrect, est rejetee.
//
// Avec le plan Vercel gratuit (Hobby), ce cron ne peut s'executer qu'une
// fois par jour, avec une precision de +/- 59 minutes : le delai reel
// avant expiration d'une commande peut donc varier entre 24h et un peu
// moins de 48h selon son heure de creation (choix assume, documente dans
// l'etat des lieux du projet).
// ============================================================

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const EXPIRE_AFTER_HOURS = 24;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ ok: false, error: "non autorisé" });
  }

  try {
    const cutoff = new Date(Date.now() - EXPIRE_AFTER_HOURS * 3600 * 1000).toISOString();

    const { data: toExpire, error: selectErr } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("status", "pending")
      .lt("created_at", cutoff);

    if (selectErr) {
      console.error("[cron-expire] échec lecture commandes pending :", selectErr.message);
      return res.status(500).json({ ok: false, error: "échec lecture" });
    }

    const ids = (toExpire || []).map((o) => o.id);

    if (ids.length === 0) {
      return res.status(200).json({ ok: true, expired: 0 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "expired" })
      .in("id", ids);

    if (updateErr) {
      console.error("[cron-expire] échec mise à jour des commandes :", updateErr.message);
      return res.status(500).json({ ok: false, error: "échec mise à jour" });
    }

    const historyRows = ids.map((id) => ({
      order_id: id,
      status: "expired",
      note: `Expirée automatiquement après ${EXPIRE_AFTER_HOURS}h sans paiement confirmé.`,
    }));
    const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert(historyRows);
    if (historyErr) {
      console.error("[cron-expire] échec écriture order_status_history :", historyErr.message);
    }

    return res.status(200).json({ ok: true, expired: ids.length });
  } catch (err) {
    console.error("[cron-expire] erreur inattendue :", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: "erreur serveur" });
  }
}
