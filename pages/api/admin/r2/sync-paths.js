// ZENORIA_R2_SYNC_PATHS_V1
// Synchronise de 1 a 5 objets Supabase vers R2. Supabase reste intact.
import { createHash } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAdminApi } from "@/lib/requireAdminApi";
import { getR2Client, verifyR2ObjectSha256 } from "@/lib/r2Server";
import { validateSyncRequest } from "@/lib/r2Sync";

const SUPABASE_BUCKET = "product-media";

function publicUrl(objectPath) {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  return base + "/storage/v1/object/public/" + SUPABASE_BUCKET + "/" +
    objectPath.split("/").map(encodeURIComponent).join("/");
}

function missingR2Object(error) {
  return Number(error?.$metadata?.httpStatusCode) === 404 ||
    error?.name === "NotFound" || error?.name === "NoSuchKey";
}

async function syncOne(objectPath, optional) {
  const response = await fetch(publicUrl(objectPath), { cache: "no-store" });
  if (!response.ok) {
    if (optional && response.status === 404) {
      return { path: objectPath, status: "OPTIONAL_MISSING", bytes: 0 };
    }
    return { path: objectPath, status: "FAILED", bytes: 0, error: "Lecture Supabase HTTP " + response.status };
  }

  const source = Buffer.from(await response.arrayBuffer());
  const expectedSize = source.length;
  const sha256 = createHash("sha256").update(source).digest("hex");
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const { client, config } = getR2Client();

  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectPath }));
    if (Number(head.ContentLength) !== expectedSize) {
      return { path: objectPath, status: "FAILED", bytes: expectedSize, error: "Objet R2 existant de taille differente." };
    }
    const verification = await verifyR2ObjectSha256(objectPath, sha256);
    if (!verification.ok || verification.bytes !== expectedSize) {
      return { path: objectPath, status: "FAILED", bytes: expectedSize, error: "Objet R2 existant de SHA-256 different." };
    }
    return { path: objectPath, status: "SKIP_OK", bytes: expectedSize };
  } catch (error) {
    if (!missingR2Object(error)) {
      return { path: objectPath, status: "FAILED", bytes: expectedSize, error: String(error?.message || error) };
    }
  }

  let created = false;
  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectPath,
      Body: source,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: { source: "supabase-live-sync", sha256 },
    }));
    created = true;
    const verification = await verifyR2ObjectSha256(objectPath, sha256);
    if (!verification.ok || verification.bytes !== expectedSize) {
      throw new Error("Verification SHA-256 ou taille incorrecte.");
    }
    return { path: objectPath, status: "COPIED_OK", bytes: expectedSize };
  } catch (error) {
    if (created) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectPath }));
      } catch (cleanupError) {
        console.error("[admin-r2-sync-paths] nettoyage R2 impossible :", cleanupError);
      }
    }
    return { path: objectPath, status: "FAILED", bytes: expectedSize, error: String(error?.message || error) };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Methode non autorisee." });
  }
  const admin = await requireAdminApi(req, res, "admin-r2-sync-paths");
  if (!admin) return;

  const validation = validateSyncRequest(req.body);
  if (!validation.ok) return res.status(400).json({ ok: false, error: validation.error });

  try {
    const results = [];
    for (const path of validation.paths) {
      results.push(await syncOne(path, validation.optionalSet.has(path)));
    }
    const summary = { COPIED_OK: 0, SKIP_OK: 0, OPTIONAL_MISSING: 0, FAILED: 0 };
    for (const item of results) summary[item.status] += 1;
    return res.status(200).json({
      ok: summary.FAILED === 0,
      results,
      summary,
      sourcePreserved: true,
    });
  } catch (error) {
    console.error("[admin-r2-sync-paths] echec general :", error?.code || error);
    return res.status(502).json({ ok: false, error: "Synchronisation R2 impossible." });
  }
}
