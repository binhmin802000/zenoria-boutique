// ZENORIA_R2_INVENTORY_ROUTE_V1
// Inventaire comparatif strictement en lecture seule. Aucun objet n'est modifie.
import { requireAdminApi } from "@/lib/requireAdminApi";
import { listR2Objects } from "@/lib/r2Server";
import { createClient } from "@supabase/supabase-js";

const FILES_LIMIT = 2000;

function byName(files) {
  return new Map((files || []).filter((f) => f && f.name).map((f) => [f.name, f]));
}

function totalBytes(files) {
  return (files || []).reduce((sum, file) => sum + (Number(file.size_bytes) || 0), 0);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Methode non autorisee." });
  }

  try {
    const admin = await requireAdminApi(req, res, "admin-r2-inventory");
    if (!admin) return;

    // ZENORIA_R2_INVENTORY_ADMIN_JWT_V1
    const authorization = req.headers.authorization;
    const tokenMatch = typeof authorization === "string" && /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!tokenMatch) {
      return res.status(401).json({ ok: false, error: "Connexion requise." });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(503).json({ ok: false, error: "Configuration Supabase incomplete." });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: "Bearer " + tokenMatch[1] } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const [supabaseResult, r2Result] = await Promise.all([
      supabaseUser.rpc("admin_storage_files", { max_rows: FILES_LIMIT }),
      listR2Objects(process.env, FILES_LIMIT),
    ]);

    if (supabaseResult.error) {
      console.error("[admin-r2-inventory] inventaire Supabase impossible :", supabaseResult.error.message);
      return res.status(502).json({ ok: false, error: "Inventaire Supabase impossible." });
    }

    const supabaseFiles = Array.isArray(supabaseResult.data) ? supabaseResult.data : [];
    const r2Files = r2Result.files;
    const supabaseMap = byName(supabaseFiles);
    const r2Map = byName(r2Files);
    const missingInR2 = [...supabaseMap.keys()].filter((name) => !r2Map.has(name));
    const onlyInR2 = [...r2Map.keys()].filter((name) => !supabaseMap.has(name));
    const sizeMismatch = [...supabaseMap.keys()].filter((name) => {
      if (!r2Map.has(name)) return false;
      return (Number(supabaseMap.get(name).size_bytes) || 0) !== (Number(r2Map.get(name).size_bytes) || 0);
    });

    return res.status(200).json({
      ok: true,
      readOnly: true,
      supabase: { count: supabaseFiles.length, bytes: totalBytes(supabaseFiles), truncated: supabaseFiles.length >= FILES_LIMIT },
      r2: { count: r2Files.length, bytes: totalBytes(r2Files), truncated: r2Result.truncated },
      comparison: {
        missingInR2Count: missingInR2.length,
        onlyInR2Count: onlyInR2.length,
        sizeMismatchCount: sizeMismatch.length,
        missingInR2,
        onlyInR2,
        sizeMismatch,
      },
    });
  } catch (error) {
    if (error && error.code === "R2_CONFIG_MISSING") {
      return res.status(503).json({ ok: false, error: "Configuration R2 incomplete." });
    }
    console.error("[admin-r2-inventory] echec :", error && error.code ? error.code : error);
    return res.status(502).json({ ok: false, error: "Inventaire comparatif impossible." });
  }
}
