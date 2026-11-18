// ZENORIA_CLOUDFLARE_ANALYTICS_V1
// Module strictement serveur. Aucun jeton ni identifiant de compte n'est retourne au navigateur.
const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const R2_CLASS_A_ACTIONS = new Set(["ListObjects", "PutObject", "ListMultipartUploads", "PutBucket", "PutBucketCors"]);
const R2_CLASS_B_ACTIONS = new Set(["GetObject", "HeadObject", "HeadBucket", "GetBucketLifecycleConfiguration", "GetBucketCors"]);
const R2_FREE_ACTIONS = new Set(["DeleteObject"]);
const FREE_LIMITS = { storageBytes: 10_000_000_000, classA: 1_000_000, classB: 10_000_000 };
function usagePercent(value, limit) { return limit > 0 ? Math.min(100, Math.max(0, value / limit * 100)) : 0; }
function classifyOperations(operations) {
  const totals = { classA: 0, classB: 0, free: 0, unclassified: 0 };
  const unknownActions = new Map();
  for (const item of operations) {
    const requests = Number(item.requests) || 0;
    if (R2_CLASS_A_ACTIONS.has(item.actionType)) totals.classA += requests;
    else if (R2_CLASS_B_ACTIONS.has(item.actionType)) totals.classB += requests;
    else if (R2_FREE_ACTIONS.has(item.actionType)) totals.free += requests;
    else { totals.unclassified += requests; unknownActions.set(item.actionType, (unknownActions.get(item.actionType) || 0) + requests); }
  }
  return { totals, unknownActions: [...unknownActions.entries()].map(([actionType, requests]) => ({ actionType, requests })).sort((a, b) => b.requests - a.requests) };
}
function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function config(env = process.env) {
  const accountId = clean(env.R2_ACCOUNT_ID);
  const token = clean(env.CLOUDFLARE_API_TOKEN);
  const bucket = clean(env.R2_BUCKET);
  const missing = [];
  if (!accountId) missing.push("R2_ACCOUNT_ID");
  if (!token) missing.push("CLOUDFLARE_API_TOKEN");
  if (!bucket) missing.push("R2_BUCKET");
  if (missing.length) { const error = new Error("Configuration Analytics Cloudflare incomplete."); error.code = "CF_ANALYTICS_CONFIG_MISSING"; error.missing = missing; throw error; }
  return { accountId, token, bucket };
}
const QUERY = `query ZenoriaR2AnalyticsCheck($accountTag: String!, $bucketName: String!, $since: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      r2StorageAdaptiveGroups(limit: 1, filter: { datetime_geq: $since, bucketName: $bucketName }, orderBy: [datetime_DESC]) {
        dimensions { datetime bucketName }
        max { objectCount payloadSize metadataSize uploadCount }
      }
      r2OperationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $since, bucketName: $bucketName }) {
        dimensions { actionType actionStatus bucketName }
        sum { requests }
      }
    }
  }
}`;
export async function checkCloudflareR2Analytics(env = process.env, fetchImpl = fetch) {
  if (typeof window !== "undefined") throw new Error("Analytics Cloudflare est reserve au serveur.");
  const startedAt = Date.now();
  const { accountId, token, bucket } = config(env);
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  let response;
  try {
    response = await fetchImpl(GRAPHQL_URL, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ query: QUERY, variables: { accountTag: accountId, bucketName: bucket, since } }) });
  } catch (cause) { const error = new Error("API Analytics Cloudflare indisponible."); error.code = "CF_ANALYTICS_NETWORK_FAILED"; error.cause = cause; throw error; }
  const payload = await response.json().catch(() => null);
  if (!response.ok) { const error = new Error("Acces Analytics Cloudflare refuse ou indisponible."); error.code = response.status === 401 || response.status === 403 ? "CF_ANALYTICS_ACCESS_DENIED" : "CF_ANALYTICS_HTTP_FAILED"; error.statusCode = response.status; throw error; }
  if (!payload || payload.errors?.length) { const error = new Error("Reponse GraphQL Analytics invalide."); error.code = "CF_ANALYTICS_GRAPHQL_FAILED"; error.graphqlCodes = (payload?.errors || []).map((item) => item?.extensions?.code).filter(Boolean); throw error; }
  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) { const error = new Error("Compte Cloudflare inaccessible avec ce jeton."); error.code = "CF_ANALYTICS_ACCOUNT_UNAVAILABLE"; throw error; }
  const storageAvailable = Array.isArray(account.r2StorageAdaptiveGroups);
  const operationsAvailable = Array.isArray(account.r2OperationsAdaptiveGroups);
  const sample = storageAvailable ? account.r2StorageAdaptiveGroups[0] : null;
  const storage = sample ? {
    collectedAt: sample.dimensions?.datetime || null,
    objectCount: Number(sample.max?.objectCount) || 0,
    payloadBytes: Number(sample.max?.payloadSize) || 0,
    metadataBytes: Number(sample.max?.metadataSize) || 0,
    pendingUploads: Number(sample.max?.uploadCount) || 0,
  } : null;
  const grouped = new Map();
  for (const row of operationsAvailable ? account.r2OperationsAdaptiveGroups : []) {
    const actionType = String(row.dimensions?.actionType || "Unknown");
    const actionStatus = String(row.dimensions?.actionStatus || "unknown");
    const key = actionType + "|" + actionStatus;
    grouped.set(key, (grouped.get(key) || 0) + (Number(row.sum?.requests) || 0));
  }
  const operations = [...grouped.entries()].map(([key, requests]) => {
    const [actionType, actionStatus] = key.split("|");
    return { actionType, actionStatus, requests };
  }).sort((a, b) => b.requests - a.requests || a.actionType.localeCompare(b.actionType));
  const classified = classifyOperations(operations);
  const usage = {
    storage: { used: storage ? storage.payloadBytes + storage.metadataBytes : 0, limit: FREE_LIMITS.storageBytes },
    classA: { used: classified.totals.classA, limit: FREE_LIMITS.classA },
    classB: { used: classified.totals.classB, limit: FREE_LIMITS.classB },
  };
  usage.storage.percent = usagePercent(usage.storage.used, usage.storage.limit);
  usage.classA.percent = usagePercent(usage.classA.used, usage.classA.limit);
  usage.classB.percent = usagePercent(usage.classB.used, usage.classB.limit);
  return {
    ok: true,
    storageDataset: storageAvailable,
    operationsDataset: operationsAvailable,
    sampleAvailable: Boolean(storage),
    storage,
    operations,
    operationTotals: classified.totals,
    unknownActions: classified.unknownActions,
    usage,
    periodStart: since,
    durationMs: Date.now() - startedAt,
  };
}
