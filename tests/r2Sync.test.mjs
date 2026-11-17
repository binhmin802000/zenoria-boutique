import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadLogic() {
  const file = new URL("../lib/r2Sync.js", import.meta.url);
  let source = fs.readFileSync(file, "utf8");
  source = source
    .replace(/export const MAX_SYNC_PATHS/, "const MAX_SYNC_PATHS")
    .replace(/export const MAX_SYNC_PATH_LENGTH/, "const MAX_SYNC_PATH_LENGTH")
    .replace(/export function isValidSyncPath/, "function isValidSyncPath")
    .replace(/export function validateSyncRequest/, "function validateSyncRequest");
  source += "\nmodule.exports = { MAX_SYNC_PATHS, MAX_SYNC_PATH_LENGTH, isValidSyncPath, validateSyncRequest };";
  const sandbox = { module: { exports: {} }, exports: {}, Set };
  vm.runInNewContext(source, sandbox, { filename: "lib/r2Sync.js" });
  return sandbox.module.exports;
}

const { isValidSyncPath, validateSyncRequest } = loadLogic();
assert.equal(isValidSyncPath("violette/photo.jpg"), true);
for (const bad of ["", "photo.jpg", "../secret", "a/../b", "a/./b", "a\\b.jpg", "a//b.jpg", "https://x.test/a.jpg", "a/b.jpg?x=1", "a/b.jpg#x"]) {
  assert.equal(isValidSyncPath(bad), false, bad);
}
assert.equal(isValidSyncPath("a/" + "x".repeat(499)), false);
assert.equal(validateSyncRequest({}).ok, false);
assert.equal(validateSyncRequest({ paths: [] }).ok, false);
assert.equal(validateSyncRequest({ paths: ["a/1", "a/2", "a/3", "a/4", "a/5", "a/6"] }).ok, false);
assert.equal(validateSyncRequest({ paths: ["a/1"], optionalPaths: "a/1" }).ok, false);
assert.equal(validateSyncRequest({ paths: ["a/1"], optionalPaths: ["a/2"] }).ok, false);
const valid = validateSyncRequest({ paths: ["a/1", "a/1", "a/2"], optionalPaths: ["a/2", "a/2"] });
assert.equal(valid.ok, true);
assert.deepEqual(Array.from(valid.paths), ["a/1", "a/2"]);
assert.deepEqual(Array.from(valid.optionalPaths), ["a/2"]);
assert.equal(valid.optionalSet.has("a/2"), true);
console.log("r2Sync.test.mjs : OK");
