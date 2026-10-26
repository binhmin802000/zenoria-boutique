// ============================================================
// pages/api/admin/data-requests/process.js — POST : traite une demande de suppression RGPD
//
// Sécurité : requiert un jeton d'administratrice valide (vérifié via
// is_admin() côté base, avec le jeton de la personne connectée), PUIS
// utilise la clé service_role pour exécuter process_deletion_request,
// qui est réservée à service_role. Jamais la clé service_role n'est
// exposée au navigateur : elle ne vit que dans cette route serveur.
// ============================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  const { requestId } = req.body || {};
  const parsedId = Number(requestId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return res.status(400).json({ ok: false, error: "identifiant de demande invalide" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json({ ok: false, error: "connexion requise" });
  }

  // Étape 1 : vérifie que l'appelante est bien administratrice, avec SON jeton.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  try {
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData || !userData.user) {
      return res.status(401).json({ ok: false, error: "session invalide" });
    }

    const { data: isAdminResult, error: adminErr } = await callerClient.rpc("is_admin");
    if (adminErr) throw adminErr;
    if (!isAdminResult) {
      return res.status(403).json({ ok: false, error: "réservé aux administrateurs" });
    }

    // Étape 2 : avec la vérification faite, utilise service_role pour traiter la demande.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: result, error: processErr } = await adminClient.rpc("process_deletion_request", { p_request_id: parsedId });
    if (processErr) throw processErr;

    return res.status(200).json({ ok: true, result });
  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (/REQUEST_NOT_FOUND/.test(msg)) return res.status(404).json({ ok: false, error: "demande introuvable" });
    if (/WRONG_REQUEST_TYPE/.test(msg)) return res.status(409).json({ ok: false, error: "cette demande n'est pas une suppression" });
    if (/ALREADY_PROCESSED/.test(msg)) return res.status(409).json({ ok: false, error: "cette demande a déjà été traitée" });
    return res.status(500).json({ ok: false, error: "impossible de traiter la demande pour le moment" });
  }
}