// ZENORIA_REQUIRE_ADMIN_API_V1
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function requireAdminApi(req, res, logPrefix = "admin-api") {
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
      error: unavailable
        ? "Verification de connexion indisponible. Reessayez."
        : "Session expiree ou invalide. Reconnectez-vous.",
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
    console.error("[" + logPrefix + "] echec lecture admin_users :", adminErr.message);
    res.status(503).json({ ok: false, error: "Verification des droits indisponible. Reessayez." });
    return null;
  }
  if (!adminRow) {
    res.status(403).json({ ok: false, error: "Acces reserve aux administrateurs." });
    return null;
  }
  return user;
}
