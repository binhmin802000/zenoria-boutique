// ZENORIA_R2_CONFIG_V1
// Validation pure de la configuration R2. Aucun secret n'est expose au navigateur.

const REQUIRED_R2_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildR2Endpoint(accountId) {
  const id = clean(accountId);
  return id ? "https://" + id + ".r2.cloudflarestorage.com" : "";
}

export function readR2Config(env = process.env) {
  const values = Object.fromEntries(
    REQUIRED_R2_ENV.map((name) => [name, clean(env[name])])
  );
  const missing = REQUIRED_R2_ENV.filter((name) => !values[name]);

  if (missing.length) {
    const error = new Error(
      "Configuration R2 incomplete : " + missing.join(", ")
    );
    error.code = "R2_CONFIG_MISSING";
    error.missing = missing;
    throw error;
  }

  return Object.freeze({
    accountId: values.R2_ACCOUNT_ID,
    accessKeyId: values.R2_ACCESS_KEY_ID,
    secretAccessKey: values.R2_SECRET_ACCESS_KEY,
    bucket: values.R2_BUCKET,
    endpoint: buildR2Endpoint(values.R2_ACCOUNT_ID),
    region: "auto",
  });
}

export function getR2ConfigStatus(env = process.env) {
  const missing = REQUIRED_R2_ENV.filter((name) => !clean(env[name]));
  return Object.freeze({
    configured: missing.length === 0,
    missing,
  });
}
