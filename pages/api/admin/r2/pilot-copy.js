// ZENORIA_R2_PILOT_COPY_ROUTE_V1
// Copie un seul fichier pilote. Supabase reste intact. Nettoyage R2 automatique sur echec.
import { createHash } from "node:crypto";
import { PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { requireAdminApi } from "@/lib/requireAdminApi";
import { getR2Client, verifyR2ObjectSha256 } from "@/lib/r2Server";

const PILOT_PATH = "violette/thumb_1794524724532-IMG_20250620_141016.jpg";
const EXPECTED_SIZE = 29618;
const SUPABASE_BUCKET = "product-media";

function publicUrl(path) {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  return base + "/storage/v1/object/public/" + SUPABASE_BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Methode non autorisee." });
  }

  let createdInR2 = false;
  try {
    const admin = await requireAdminApi(req, res, "admin-r2-pilot-copy");
    if (!admin) return;

    const sourceResponse = await fetch(publicUrl(PILOT_PATH), { cache: "no-store" });
    if (!sourceResponse.ok) {
      return res.status(502).json({ ok: false, error: "Lecture du pilote Supabase impossible." });
    }
    const source = Buffer.from(await sourceResponse.arrayBuffer());
    if (source.length !== EXPECTED_SIZE) {
      return res.status(409).json({ ok: false, error: "Taille source pilote inattendue." });
    }
    const sourceSha256 = createHash("sha256").update(source).digest("hex");
    const contentType = sourceResponse.headers.get("content-type") || "image/jpeg";
    const { client, config } = getR2Client();

    try {
      await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: PILOT_PATH }));
      return res.status(409).json({ ok: false, error: "Le pilote existe deja dans R2." });
    } catch (error) {
      if (Number(error?.$metadata?.httpStatusCode) !== 404 && error?.name !== "NotFound" && error?.name !== "NoSuchKey") throw error;
    }

    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: PILOT_PATH,
      Body: source,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: { source: "supabase-pilot", sha256: sourceSha256 },
    }));
    createdInR2 = true;

    const verification = await verifyR2ObjectSha256(PILOT_PATH, sourceSha256);
    if (!verification.ok || verification.bytes !== EXPECTED_SIZE) {
      throw Object.assign(new Error("Verification du pilote R2 incoherente."), { code: "R2_PILOT_VERIFY_FAILED" });
    }

    return res.status(200).json({
      ok: true,
      path: PILOT_PATH,
      sourceBytes: source.length,
      r2Bytes: verification.bytes,
      sha256Match: true,
      contentType: verification.contentType,
      sourcePreserved: true,
    });
  } catch (error) {
    if (createdInR2) {
      try {
        const { client, config } = getR2Client();
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: PILOT_PATH }));
      } catch (cleanupError) {
        console.error("[admin-r2-pilot-copy] nettoyage R2 impossible :", cleanupError);
      }
    }
    console.error("[admin-r2-pilot-copy] echec :", error && error.code ? error.code : error);
    return res.status(502).json({ ok: false, error: "Copie pilote R2 impossible." });
  }
}
