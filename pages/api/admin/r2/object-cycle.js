// ZENORIA_R2_OBJECT_CYCLE_ROUTE_V1
// Cree, verifie puis supprime un petit objet technique. Aucun media Zenoria n'est touche.
import { requireAdminApi } from "@/lib/requireAdminApi";
import { runR2TechnicalObjectCycle } from "@/lib/r2Server";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Methode non autorisee." });
  }

  try {
    const admin = await requireAdminApi(req, res, "admin-r2-object-cycle");
    if (!admin) return;

    const result = await runR2TechnicalObjectCycle();
    return res.status(200).json({
        ok: result.ok,
        created: result.created,
        verified: result.verified,
        cleanupAttempted: result.cleanupAttempted,
        deleteRequested: result.deleteRequested,
        deleted: result.deleted,
        durationMs: result.durationMs,
        errorCode: result.errorCode,
        error: result.error,
      });
  } catch (error) {
    if (error && error.code === "R2_CONFIG_MISSING") {
      return res.status(503).json({ ok: false, error: "Configuration R2 incomplete." });
    }
    console.error("[admin-r2-object-cycle] echec :", error && error.code ? error.code : error);
    return res.status(502).json({ ok: false, error: "Cycle technique R2 impossible." });
  }
}
