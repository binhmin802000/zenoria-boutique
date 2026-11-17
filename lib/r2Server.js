// ZENORIA_R2_SERVER_V1
// Module strictement serveur. Ne pas importer depuis une page ou un composant navigateur.
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
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
