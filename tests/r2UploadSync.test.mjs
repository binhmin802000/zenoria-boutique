import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/supabase.js", import.meta.url),
  "utf8"
);

assert.equal(
  (source.match(/ZENORIA_R2_UPLOAD_SYNC_V1/g) || []).length,
  1
);

assert.equal(
  (source.match(/async function uploadWithVariants\(/g) || [])
    .length,
  1
);

assert.match(
  source,
  /supabase\.auth\.getSession\(\)/
);

assert.match(
  source,
  /\/api\/admin\/r2\/sync-paths/
);

assert.match(source, /Authorization:/);
assert.match(source, /Bearer/);
assert.match(source, /optionalPaths:\s*\[\]/);
assert.match(source, /COPIED_OK/);
assert.match(source, /SKIP_OK/);
assert.match(source, /cleanupNewSupabasePaths/);
assert.match(source, /\.remove\(uniquePaths\)/);
assert.match(source, /createdPaths\.push\(path\)/);
assert.match(source, /createdPaths\.push\(target\)/);

const syncPosition = source.indexOf(
  "await syncUploadedPathsToR2(createdPaths)"
);

const returnPosition = source.indexOf(
  "return originalResult;",
  syncPosition
);

assert.ok(syncPosition >= 0);
assert.ok(returnPosition > syncPosition);

console.log("r2UploadSync.test.mjs : OK");
