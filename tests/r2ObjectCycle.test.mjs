import assert from "node:assert/strict";
import fs from "node:fs";

const server = fs.readFileSync(new URL("../lib/r2Server.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../pages/api/admin/r2/object-cycle.js", import.meta.url), "utf8");

assert.match(server, /PutObjectCommand/);
assert.match(server, /HeadObjectCommand/);
assert.match(server, /DeleteObjectCommand/);
assert.match(server, /finally/);
assert.match(server, /CacheControl:\s*"no-store"/);
assert.match(server, /diagnostics\/r2-test-/);
assert.doesNotMatch(server, /ListObjects/);
assert.doesNotMatch(server, /GetObjectCommand/);
assert.match(route, /req\.method !== "POST"/);
assert.match(route, /requireAdminApi/);
assert.match(route, /runR2TechnicalObjectCycle/);
assert.doesNotMatch(route, /R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|accountId|endpoint|key:/);
assert.match(route, /deleted: result\.deleted/);
console.log("r2ObjectCycle.test.mjs : OK");
