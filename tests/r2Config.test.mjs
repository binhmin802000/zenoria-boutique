import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadConfig() {
  const url = new URL("../lib/r2Config.js", import.meta.url);
  let source = fs.readFileSync(url, "utf8");
  source = source
    .replace(/export function buildR2Endpoint/, "function buildR2Endpoint")
    .replace(/export function readR2Config/, "function readR2Config")
    .replace(/export function getR2ConfigStatus/, "function getR2ConfigStatus");
  source += "\nmodule.exports = { buildR2Endpoint, readR2Config, getR2ConfigStatus };";
  const sandbox = { module: { exports: {} }, exports: {}, process: { env: {} }, Error, Object };
  vm.runInNewContext(source, sandbox, { filename: "lib/r2Config.js" });
  return sandbox.module.exports;
}

const { buildR2Endpoint, readR2Config, getR2ConfigStatus } = loadConfig();

assert.equal(buildR2Endpoint("abc123"), "https://abc123.r2.cloudflarestorage.com");
assert.equal(buildR2Endpoint("  abc123  "), "https://abc123.r2.cloudflarestorage.com");
assert.equal(buildR2Endpoint(""), "");

const complete = {
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "zenoria-product-media",
};
const config = readR2Config(complete);
assert.equal(config.endpoint, "https://account.r2.cloudflarestorage.com");
assert.equal(config.region, "auto");
assert.equal(config.bucket, "zenoria-product-media");
assert.equal(getR2ConfigStatus(complete).configured, true);
assert.deepEqual(Array.from(getR2ConfigStatus(complete).missing), []);

const partial = { R2_ACCOUNT_ID: "account" };
const status = getR2ConfigStatus(partial);
assert.equal(status.configured, false);
assert.deepEqual(Array.from(status.missing), [
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
]);
assert.throws(
  () => readR2Config(partial),
  (error) => error.code === "R2_CONFIG_MISSING" && error.missing.length === 3
);

console.log("r2Config.test.mjs : OK");
