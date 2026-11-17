import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../pages/api/admin/r2/check.js", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../lib/requireAdminApi.js", import.meta.url), "utf8");

assert.match(route, /req\.method !== "POST"/);
assert.match(route, /requireAdminApi/);
assert.match(route, /checkR2Connection\(\)/);
assert.doesNotMatch(route, /PutObjectCommand|GetObjectCommand|ListObjects|DeleteObjectCommand/);
assert.doesNotMatch(route, /accessKeyId|secretAccessKey|endpoint/);
assert.match(route, /bucket: result\.bucket/);
assert.match(auth, /supabaseAdmin\.auth\.getUser/);
assert.match(auth, /from\("admin_users"\)/);
assert.match(auth, /status\(401\)/);
assert.match(auth, /status\(403\)/);
console.log("r2DiagnosticRoute.test.mjs : OK");
