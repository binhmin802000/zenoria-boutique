// ZENORIA_R2_SERVER_V1
// Module strictement serveur. Ne pas importer depuis une page ou un composant navigateur.
import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { readR2Config } from "./r2Config";

let cachedClient = null;
let cachedSignature = "";

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Le client R2 ne peut etre utilise que cote serveur.");
  }
}

export function getR2Client(env = process.env) {
  assertServerOnly();
  const config = readR2Config(env);
  const signature = [
    config.accountId,
    config.accessKeyId,
    config.bucket,
  ].join(":");

  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedSignature = signature;
  }

  return { client: cachedClient, config };
}

export async function checkR2Connection(env = process.env) {
  const startedAt = Date.now();
  const { client, config } = getR2Client(env);

  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return {
      ok: true,
      bucket: config.bucket,
      endpoint: config.endpoint,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const wrapped = new Error("Connexion R2 impossible.");
    wrapped.code = "R2_CONNECTION_FAILED";
    wrapped.statusCode = Number(error?.$metadata?.httpStatusCode) || null;
    wrapped.cause = error;
    throw wrapped;
  }
}


// ZENORIA_R2_OBJECT_CYCLE_V1
export async function runR2TechnicalObjectCycle(env = process.env) {
  assertServerOnly();
  const startedAt = Date.now();
  const { client, config } = getR2Client(env);
  const randomPart = Math.random().toString(36).slice(2, 10);
  const key = "diagnostics/r2-test-" + Date.now() + "-" + randomPart + ".txt";
  const body = "ZENORIA_R2_DIAGNOSTIC_V1";
  let created = false;
  let verified = false;
  let deleted = false;

  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: "text/plain; charset=utf-8",
      CacheControl: "no-store",
      Metadata: { purpose: "zenoria-r2-diagnostic" },
    }));
    created = true;

    const head = await client.send(new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }));
    verified = Number(head.ContentLength) === Buffer.byteLength(body, "utf8");
    if (!verified) {
      const error = new Error("Objet technique R2 cree mais verification incoherente.");
      error.code = "R2_DIAGNOSTIC_VERIFY_FAILED";
      throw error;
    }
  } finally {
    if (created) {
      await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));
      deleted = true;
    }
  }

  return {
    ok: created && verified && deleted,
    created,
    verified,
    deleted,
    durationMs: Date.now() - startedAt,
  };
}

// ZENORIA_R2_INVENTORY_V1
export async function listR2Objects(env = process.env, maxRows = 2000) {
  assertServerOnly();
  const limit = Math.max(1, Math.min(Number(maxRows) || 2000, 10000));
  const { client, config } = getR2Client(env);
  const files = [];
  let continuationToken;
  let truncated = false;

  do {
    const remaining = limit - files.length;
    const response = await client.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      ContinuationToken: continuationToken,
      MaxKeys: Math.min(1000, remaining),
    }));

    for (const object of response.Contents || []) {
      if (!object.Key) continue;
      files.push({
        name: object.Key,
        size_bytes: Number(object.Size) || 0,
        created_at: object.LastModified ? object.LastModified.toISOString() : null,
        mimetype: "",
      });
      if (files.length >= limit) break;
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    truncated = Boolean(continuationToken);
  } while (continuationToken && files.length < limit);

  return { files, truncated, limit };
}