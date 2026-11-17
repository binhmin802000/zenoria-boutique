// ZENORIA_R2_MIGRATION_BATCH_V1
// Migration idempotente par lots. Supabase reste intact et reste le fournisseur public.
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAdminApi } from "@/lib/requireAdminApi";
import { getR2Client, verifyR2ObjectSha256 } from "@/lib/r2Server";

const FILES_LIMIT = 2000;
const MAX_BATCH_SIZE = 5;
const SUPABASE_BUCKET = "product-media";

function publicUrl(objectPath) {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  return base + "/storage/v1/object/public/" + SUPABASE_BUCKET + "/" +
    objectPath.split("/").map(encodeURIComponent).join("/");
}

function getBearerToken(req) {
  const value = req.headers.authorization;
  const match = typeof value === "string" && /^Bearer ([^\s]+)$/i.exec(value);
  return match ? match[1] : "";
}

async function readSupabaseFiles(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw Object.assign(new Error("Configuration Supabase incomplete."), { code: "SUPABASE_CONFIG_MISSING" });
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await client.rpc("admin_storage_files", { max_rows: FILES_LIMIT });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

// ZENORIA_R2_MIGRATION_CURSOR_SHA_V1
async function migrateOne(file) {
  const objectPath = file.name;
  const expectedSize = Number(file.size_bytes) || 0;
  const response = await fetch(publicUrl(objectPath), { cache: "no-store" });
  if (!response.ok) {
    return { path: objectPath, status: "FAILED", bytes: expectedSize, error: "Lecture Supabase HTTP " + response.status };
  }
  const source = Buffer.from(await response.arrayBuffer());
  if (source.length !== expectedSize) {
    return { path: objectPath, status: "FAILED", bytes: expectedSize, error: "Taille Supabase inattendue." };
  }
  const sha256 = createHash("sha256").update(source).digest("hex");
  const contentType = file.mimetype || response.headers.get("content-type") || "application/octet-stream";
  const { client, config } = getR2Client();

  let exists = false;
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectPath }));
    exists = true;
    if (Number(head.ContentLength) !== expectedSize) {
      return { path: objectPath, status: "FAILED", bytes: expectedSize, error: "Objet R2 existant de taille differente." };
    }
    const verification = await verifyR2ObjectSha256(objectPath, sha256);
    if (!verification.ok || verification.bytes !== expectedSize) {
      return { path: objectPath, status: "FAILED", bytes: expectedSize, error: "Objet R2 existant de SHA-256 different." };
    }
    return { path: objectPath, status: "SKIP_OK", bytes: expectedSize };
  } catch (error) {
    if (exists) throw error;
    const status = Number(error?.$metadata?.httpStatusCode);
    if (status !== 404 && error?.name !== "NotFound" && error?.name !== "NoSuchKey") {
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
      Metadata: { source: "supabase-migration", sha256 },
    }));
    created = true;
    const verification = await verifyR2ObjectSha256(objectPath, sha256);
    if (!verification.ok || verification.bytes !== expectedSize) throw new Error("Verification SHA-256 ou taille incorrecte.");
    return { path: objectPath, status: "COPIED_OK", bytes: expectedSize };
  } catch (error) {
    if (created) {
      try { await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectPath })); } catch {}
    }
    return { path: objectPath, status: "FAILED", bytes: expectedSize, error: String(error?.message || error) };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Methode non autorisee." });
  }
  try {
    const admin = await requireAdminApi(req, res, "admin-r2-migrate-batch");
    if (!admin) return;
    const token = getBearerToken(req);
    const requested = Number(req.body?.batchSize) || MAX_BATCH_SIZE;
    const batchSize = Math.max(1, Math.min(requested, MAX_BATCH_SIZE));
    const files = await readSupabaseFiles(token);
    const requestedOffset = Number(req.body?.offset) || 0;
    const offset = Math.max(0, Math.min(requestedOffset, files.length));
    const candidates = files.slice(offset, offset + batchSize);
    const nextOffset = offset + candidates.length;

    if (!candidates.length) {
      return res.status(200).json({ ok: true, complete: true, offset, nextOffset, totalSupabase: files.length, results: [], summary: { COPIED_OK: 0, SKIP_OK: 0, FAILED: 0 }, sourcePreserved: true, publicProvider: "supabase" });
    }

    const results = [];
    for (const file of candidates) results.push(await migrateOne(file));
    const summary = { COPIED_OK: 0, SKIP_OK: 0, FAILED: 0 };
    for (const item of results) summary[item.status] += 1;

    return res.status(200).json({
      ok: summary.FAILED === 0,
      complete: nextOffset >= files.length,
      batchSize,
      offset,
      nextOffset,
      totalSupabase: files.length,
      results,
      summary,
      sourcePreserved: true,
      publicProvider: "supabase",
    });
  } catch (error) {
    console.error("[admin-r2-migrate-batch] echec :", error?.code || error);
    return res.status(502).json({ ok: false, error: "Migration R2 impossible." });
  }
}
