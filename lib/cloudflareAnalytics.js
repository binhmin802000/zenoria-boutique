// ZENORIA_CLOUDFLARE_ANALYTICS_V1
// Module strictement serveur. Aucun jeton ni identifiant de compte n'est retourne au navigateur.
const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function config(env = process.env) {
  const accountId = clean(env.R2_ACCOUNT_ID);
  const token = clean(env.CLOUDFLARE_API_TOKEN);
  const missing = [];
  if (!accountId) missing.push("R2_ACCOUNT_ID");
  if (!token) missing.push("CLOUDFLARE_API_TOKEN");
  if (missing.length) { const error = new Error("Configuration Analytics Cloudflare incomplete."); error.code = "CF_ANALYTICS_CONFIG_MISSING"; error.missing = missing; throw error; }
  return { accountId, token };
}
const QUERY = `query ZenoriaR2AnalyticsCheck($accountTag: String!, $since: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      r2StorageAdaptiveGroups(limit: 1, filter: { datetime_geq: $since }, orderBy: [datetime_DESC]) {
        dimensions { datetime }
        max { objectCount payloadSize metadataSize uploadCount }
      }
    }
  }
}`;
export async function checkCloudflareR2Analytics(env = process.env, fetchImpl = fetch) {
  if (typeof window !== "undefined") throw new Error("Analytics Cloudflare est reserve au serveur.");
  const startedAt = Date.now();
  const { accountId, token } = config(env);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let response;
  try {
    response = await fetchImpl(GRAPHQL_URL, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ query: QUERY, variables: { accountTag: accountId, since } }) });
  } catch (cause) { const error = new Error("API Analytics Cloudflare indisponible."); error.code = "CF_ANALYTICS_NETWORK_FAILED"; error.cause = cause; throw error; }
  const payload = await response.json().catch(() => null);
  if (!response.ok) { const error = new Error("Acces Analytics Cloudflare refuse ou indisponible."); error.code = response.status === 401 || response.status === 403 ? "CF_ANALYTICS_ACCESS_DENIED" : "CF_ANALYTICS_HTTP_FAILED"; error.statusCode = response.status; throw error; }
  if (!payload || payload.errors?.length) { const error = new Error("Reponse GraphQL Analytics invalide."); error.code = "CF_ANALYTICS_GRAPHQL_FAILED"; error.graphqlCodes = (payload?.errors || []).map((item) => item?.extensions?.code).filter(Boolean); throw error; }
  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) { const error = new Error("Compte Cloudflare inaccessible avec ce jeton."); error.code = "CF_ANALYTICS_ACCOUNT_UNAVAILABLE"; throw error; }
  const storageAvailable = Array.isArray(account.r2StorageAdaptiveGroups);
  return { ok: true, storageDataset: storageAvailable, sampleAvailable: storageAvailable && account.r2StorageAdaptiveGroups.length > 0, durationMs: Date.now() - startedAt };
}
