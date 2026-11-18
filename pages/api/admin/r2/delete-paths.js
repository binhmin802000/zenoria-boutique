// ZENORIA_R2_DELETE_PATHS_V1
// Supprime de 1 a 5 objets R2. Supabase n'est jamais touche par cette route.
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { requireAdminApi } from "@/lib/requireAdminApi";
import { getR2Client } from "@/lib/r2Server";
import { MAX_SYNC_PATHS, isValidSyncPath } from "@/lib/r2Sync";

function missingR2Object(error) {
  return Number(error?.$metadata?.httpStatusCode) === 404 ||
    error?.name === "NotFound" || error?.name === "NoSuchKey";
}

function validateDeleteRequest(body) {
  const rawPaths = body && body.paths;
  if (!Array.isArray(rawPaths) || rawPaths.length < 1 || rawPaths.length > MAX_SYNC_PATHS) {
    return { ok: false, error: "paths doit contenir entre 1 et 5 chemins." };
  }
  if (rawPaths.some((path) => !isValidSyncPath(path) || path.startsWith("diagnostics/"))) {
    return { ok: false, error: "Un chemin de media est invalide." };
  }
  return { ok: true, paths: [...new Set(rawPaths)] };
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (missingR2Object(error)) return false;
    throw error;
  }
}

async function deleteOne(client, bucket, objectPath) {
  try {
    if (!(await objectExists(client, bucket, objectPath))) {
      return { path: objectPath, status: "ABSENT_OK" };
    }
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectPath }));
    if (await objectExists(client, bucket, objectPath)) {
      return { path: objectPath, status: "FAILED", error: "Objet R2 toujours present apres suppression." };
    }
    return { path: objectPath, status: "DELETED_OK" };
  } catch (error) {
    return { path: objectPath, status: "FAILED", error: String(error?.message || error) };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Methode non autorisee." });
  }
  const admin = await requireAdminApi(req, res, "admin-r2-delete-paths");
  if (!admin) return;

  const validation = validateDeleteRequest(req.body);
  if (!validation.ok) return res.status(400).json({ ok: false, error: validation.error });

  try {
    const { client, config } = getR2Client();
    const results = [];
    for (const path of validation.paths) {
      results.push(await deleteOne(client, config.bucket, path));
    }
    const summary = { DELETED_OK: 0, ABSENT_OK: 0, FAILED: 0 };
    for (const item of results) summary[item.status] += 1;
    return res.status(200).json({
      ok: summary.FAILED === 0,
      results,
      summary,
      supabaseUntouched: true,
    });
  } catch (error) {
    console.error("[admin-r2-delete-paths] echec general :", error?.code || error);
    return res.status(502).json({ ok: false, error: "Suppression R2 impossible." });
  }
}
