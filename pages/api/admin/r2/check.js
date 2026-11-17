// ZENORIA_R2_DIAGNOSTIC_ROUTE_V1
// Diagnostic strictement non destructif : HeadBucket uniquement.
import { requireAdminApi } from "@/lib/requireAdminApi";
import { checkR2Connection } from "@/lib/r2Server";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Methode non autorisee." });
  }

  try {
    const admin = await requireAdminApi(req, res, "admin-r2-check");
    if (!admin) return;

    const result = await checkR2Connection();
    return res.status(200).json({
      ok: true,
      bucket: result.bucket,
      durationMs: result.durationMs,
    });
  } catch (error) {
    if (error && error.code === "R2_CONFIG_MISSING") {
      console.error("[admin-r2-check] configuration incomplete :", error.missing);
      return res.status(503).json({ ok: false, error: "Configuration R2 incomplete." });
    }
    console.error("[admin-r2-check] connexion impossible :", error && error.code ? error.code : error);
    return res.status(502).json({ ok: false, error: "Connexion R2 impossible." });
  }
}
