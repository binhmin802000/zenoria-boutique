// ZENORIA_R2_ANALYTICS_CHECK_ROUTE_V1
import { requireAdminApi } from "@/lib/requireAdminApi";
import { checkCloudflareR2Analytics } from "@/lib/cloudflareAnalytics";
export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "Methode non autorisee." }); }
  try {
    const admin = await requireAdminApi(req, res, "admin-r2-analytics-check");
    if (!admin) return;
    const result = await checkCloudflareR2Analytics();
    return res.status(200).json({ ok: true, storageDataset: result.storageDataset, operationsDataset: result.operationsDataset, sampleAvailable: result.sampleAvailable, storage: result.storage, operations: result.operations, operationTotals: result.operationTotals, unknownActions: result.unknownActions, usage: result.usage, periodStart: result.periodStart, durationMs: result.durationMs });
  } catch (error) {
    if (error?.code === "CF_ANALYTICS_CONFIG_MISSING") return res.status(503).json({ ok: false, error: "Configuration Analytics Cloudflare incomplete." });
    if (error?.code === "CF_ANALYTICS_ACCESS_DENIED") return res.status(502).json({ ok: false, error: "Acces Analytics Cloudflare refuse." });
    console.error("[admin-r2-analytics-check] echec :", error?.code || error);
    return res.status(502).json({ ok: false, error: "Diagnostic Analytics Cloudflare impossible." });
  }
}
