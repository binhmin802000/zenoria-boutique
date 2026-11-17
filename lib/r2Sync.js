// ZENORIA_R2_SYNC_PATHS_V1
// Validation pure du contrat POST /api/admin/r2/sync-paths.
export const MAX_SYNC_PATHS = 5;
export const MAX_SYNC_PATH_LENGTH = 500;

export function isValidSyncPath(value) {
  if (typeof value !== "string") return false;
  if (!value || value.length > MAX_SYNC_PATH_LENGTH) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (value.includes("\\") || value.includes("?") || value.includes("#")) return false;
  if (value.includes("//")) return false;
  const parts = value.split("/");
  if (parts.length < 2 || parts.some((part) => !part || part === "." || part === "..")) return false;
  return true;
}

export function validateSyncRequest(body) {
  const rawPaths = body && body.paths;
  const rawOptional = body && body.optionalPaths;
  if (!Array.isArray(rawPaths) || rawPaths.length < 1 || rawPaths.length > MAX_SYNC_PATHS) {
    return { ok: false, error: "paths doit contenir entre 1 et 5 chemins." };
  }
  if (rawOptional !== undefined && !Array.isArray(rawOptional)) {
    return { ok: false, error: "optionalPaths doit etre un tableau." };
  }
  if (rawPaths.some((path) => !isValidSyncPath(path))) {
    return { ok: false, error: "Un chemin de media est invalide." };
  }
  const paths = [...new Set(rawPaths)];
  const optionalPaths = [...new Set(rawOptional || [])];
  if (optionalPaths.some((path) => !isValidSyncPath(path) || !paths.includes(path))) {
    return { ok: false, error: "Chaque chemin facultatif doit etre valide et figurer dans paths." };
  }
  return { ok: true, paths, optionalPaths, optionalSet: new Set(optionalPaths) };
}
