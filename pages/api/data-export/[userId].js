// ============================================================
// pages/api/data-export/[userId].js — GET : télécharge l'export PDF des données personnelles
//
// Authentification : même pattern que pages/api/invoice/[orderId].js — le
// navigateur envoie « Authorization: Bearer <access_token> », rejoué vers
// Supabase. La fonction get_my_data_export (SECURITY DEFINER) vérifie
// elle-même que l'appelante demande bien SES PROPRES données, ou qu'elle
// est administratrice. Aucune re-vérification applicative ici.
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { generateDataExportPdf } from "@/lib/dataExportPdf";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  const userId = String(req.query.userId || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return res.status(400).json({ ok: false, error: "identifiant invalide" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json({ ok: false, error: "connexion requise" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData || !userData.user) {
      return res.status(401).json({ ok: false, error: "session invalide" });
    }

    const { data: exportData, error: rpcErr } = await supabase.rpc("get_my_data_export", { p_user_id: userId });
    if (rpcErr) throw rpcErr;

    const pdfBuffer = await generateDataExportPdf({
      userEmail: userData.user.email,
      exportedAt: new Date().toISOString(),
      orders: (exportData && exportData.orders) || [],
      reviews: (exportData && exportData.reviews) || [],
      favorites: (exportData && exportData.favorites) || [],
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="zenoria-mes-donnees.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (/NOT_AUTHENTICATED/.test(msg)) return res.status(401).json({ ok: false, error: "connexion requise" });
    if (/NOT_ALLOWED/.test(msg)) return res.status(403).json({ ok: false, error: "ces données ne vous appartiennent pas" });
    return res.status(500).json({ ok: false, error: "impossible de générer l'export pour le moment" });
  }
}