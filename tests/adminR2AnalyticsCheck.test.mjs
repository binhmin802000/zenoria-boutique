import assert from "node:assert/strict";
import fs from "node:fs";
const code=fs.readFileSync(new URL("../components/AdminR2AnalyticsCheck.js",import.meta.url),"utf8");
assert.equal(code.includes('data-testid="r2-analytics-run"'),true);
assert.equal(code.includes('/api/admin/r2/analytics-check'),true);
assert.equal(code.includes('supabase.auth.getSession()'),true);
assert.equal(code.includes('Authorization:"Bearer "+data.session.access_token'),true);
assert.equal(code.includes('storageDataset'),true);
assert.equal(code.includes('operationsDataset'),true);
assert.equal(code.includes('Actualiser les metriques R2'),true);
for(const forbidden of ['useEffect','CLOUDFLARE_API_TOKEN','R2_ACCOUNT_ID','accountId','secret']) assert.equal(code.includes(forbidden),false);
console.log("adminR2AnalyticsCheck.test.mjs : OK");

assert.match(code, /payloadBytes/);
assert.match(code, /metadataBytes/);
assert.match(code, /objectCount/);
assert.match(code, /pendingUploads/);
assert.match(code, /actionType/);
assert.match(code, /actionStatus/);
assert.match(code, /non contractuelles/);
assert.match(code, /Actualiser les metriques R2/);

assert.match(code, /Operations classe A/);
assert.match(code, /Operations classe B/);
assert.match(code, /Actions non classees/);
assert.match(code, /r2\.dev/);
assert.match(code, /percent>=90/);
assert.match(code, /percent>=70/);
assert.match(code, /distinctes de la facturation Cloudflare/);
