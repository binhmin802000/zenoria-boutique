// ============================================================
// orphanFiles.js — fichiers ORPHELINS du stockage : détection et suppression
//
// Un fichier est « orphelin » quand il est dans le stockage (bucket product-media) mais que RIEN ne l'utilise :
// ni une collection (photos, vidéo), ni un emplacement du site (vidéo d'accueil, photo de Savoir-faire).
// Cela vient en général d'un envoi abandonné, d'un média remplacé ou d'un fichier de test.
// Supprimer un fichier orphelin ne change rien à l'affichage du site.
//
// Règles de sécurité de ce fichier (la suppression est définitive, il n'y a pas de corbeille) :
//  1. Si la lecture des collections ou des emplacements du site échoue, AUCUN fichier n'est proposé : sans cette lecture,
//     tous les fichiers sembleraient orphelins.
//  2. Juste avant de supprimer, les références sont relues : un fichier devenu utilisé entre-temps est conservé.
//  3. Un fichier envoyé depuis moins d'une heure n'est pas supprimable : il peut appartenir à une collection en cours
//     de modification dans un autre onglet, pas encore enregistrée.
//  4. Une référence écrite sous forme d'adresse complète du stockage est reconnue comme une référence.
// ============================================================

export const MEDIA_BUCKET = "product-media";
export const FILES_LIMIT = 2000; // doit correspondre à la valeur par défaut de admin_storage_files (max_rows)
export const RECENT_MINUTES = 60;
const CHUNK = 50;

// ------------------------------------------------------------
// Références
// ------------------------------------------------------------

// Chemin du stockage désigné par une référence, ou null si elle n'en désigne pas.
//  - « bleu-de-mer/1700-p1.jpg »              -> chemin du stockage
//  - adresse complète du bucket product-media  -> chemin du stockage (reconnue pour ne jamais supprimer un fichier utilisé)
//  - adresse externe, ou simple nom de fichier (ancien format, dossier public/images) -> null
export function normalizeRef(ref) {
  if (typeof ref !== "string") return null;
  const s = ref.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/product-media\/([^?#]+)/i);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return m[1];
    }
  }
  return s.includes("/") ? s : null;
}

// Ensemble des chemins du stockage utilisés par les collections et par les emplacements du site.
export function buildReferenceSet(products, siteRows) {
  const set = new Set();
  const add = (v) => {
    const p = normalizeRef(v);
    if (p) set.add(p);
  };
  (products || []).forEach((p) => {
    if (Array.isArray(p.photos)) p.photos.forEach(add);
    if (p.video) add(p.video);
  });
  (siteRows || []).forEach((r) => {
    if (r && r.path) add(r.path);
  });
  return set;
}

// ------------------------------------------------------------
// Lecture
// ------------------------------------------------------------

const errText = (e) => String((e && (e.message || e.error)) || e || "");

// Table absente (script SQL pas encore exécuté) : rien ne peut s'y trouver, ce n'est pas une erreur de lecture.
export function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = errText(error);
  return code === "42P01" || code === "PGRST205" || /does not exist|could not find the table|schema cache/i.test(msg);
}

export function friendlyLoadError(kind, error) {
  const msg = errText(error);
  if (kind === "files") {
    if (/could not find the function|schema cache|does not exist/i.test(msg)) {
      return "La fonction de lecture des fichiers n'est pas installée. Exécutez le script supabase_admin_storage_files.sql dans Supabase (SQL Editor), puis actualisez.";
    }
    return "Impossible de lire la liste des fichiers : " + msg;
  }
  return "Impossible de vérifier quels fichiers sont utilisés (" + msg + "). Par sécurité, aucun fichier n'est proposé à la suppression.";
}

// Lit les collections et les emplacements du site. Renvoie { products, siteRows } ou { error }.
export async function readReferences(client) {
  let prod;
  let site;
  try {
    [prod, site] = await Promise.all([
      client.from("products").select("id,slug,name,photos,video,active"),
      client.from("site_media").select("slot,path"),
    ]);
  } catch (e) {
    return { error: friendlyLoadError("refs", e) };
  }
  if (!prod || prod.error || !Array.isArray(prod.data)) return { error: friendlyLoadError("refs", (prod && prod.error) || "réponse vide") };
  let siteRows = [];
  if (site && site.error) {
    if (!isMissingTable(site.error)) return { error: friendlyLoadError("refs", site.error) };
  } else if (site && Array.isArray(site.data)) {
    siteRows = site.data;
  } else {
    return { error: friendlyLoadError("refs", "réponse vide") };
  }
  return { products: prod.data, siteRows };
}

// Charge tout ce qu'il faut pour proposer les orphelins : { files, products, siteRows, truncated } ou { error }.
export async function loadOrphanData(client) {
  let filesRes;
  try {
    filesRes = await client.rpc("admin_storage_files", { max_rows: FILES_LIMIT });
  } catch (e) {
    return { error: friendlyLoadError("files", e) };
  }
  if (!filesRes || filesRes.error) return { error: friendlyLoadError("files", filesRes && filesRes.error) };
  const files = Array.isArray(filesRes.data) ? filesRes.data : [];
  const refs = await readReferences(client);
  if (refs.error) return { error: refs.error };
  return { files, products: refs.products, siteRows: refs.siteRows, truncated: files.length >= FILES_LIMIT };
}

// ------------------------------------------------------------
// Classement
// ------------------------------------------------------------

export function kindOf(name, mimetype) {
  const m = String(mimetype || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  const ext = String(name || "").toLowerCase().split(".").pop();
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v", "mkv", "avi"].includes(ext)) return "video";
  return "other";
}

export function folderOf(path) {
  const parts = String(path || "").split("/");
  if (parts[0] === "site") return "Contenu du site";
  return parts.length > 1 ? parts[0] : "(racine)";
}

export function baseName(path) {
  return String(path || "").split("/").pop();
}

// Âge d'un fichier en minutes (null si la date est inconnue)
export function ageInMinutes(createdAt, now = Date.now()) {
  const t = createdAt ? new Date(createdAt).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, (now - t) / 60000) : null;
}

export function isRecent(createdAt, now = Date.now()) {
  const age = ageInMinutes(createdAt, now);
  return age !== null && age < RECENT_MINUTES;
}

// Fichiers orphelins, avec ce qu'il faut pour les afficher. now : date de référence (millisecondes), pour les tests.
export function classifyFiles({ files, products, siteRows, truncated }, now = Date.now()) {
  const refs = buildReferenceSet(products, siteRows);
  const present = new Set();
  const orphans = [];
  let used = 0;
  (files || []).forEach((f) => {
    present.add(f.name);
    if (refs.has(f.name)) {
      used += 1;
      return;
    }
    const ageMinutes = ageInMinutes(f.created_at, now);
    const recent = isRecent(f.created_at, now);
    orphans.push({
      path: f.name,
      size: Number(f.size_bytes) || 0,
      createdAt: f.created_at || null,
      mimetype: f.mimetype || "",
      kind: kindOf(f.name, f.mimetype),
      folder: folderOf(f.name),
      ageMinutes,
      recent,
      selectable: !recent,
    });
  });
  // Références vers un fichier absent : détectables seulement si la liste est complète
  const broken = truncated ? null : [...refs].filter((p) => !present.has(p)).length;
  return { orphans, used, broken, totalBytes: orphans.reduce((s, o) => s + o.size, 0) };
}

export const SORTS = {
  size: { label: "Les plus lourds d'abord", fn: (a, b) => b.size - a.size },
  oldest: { label: "Les plus anciens d'abord", fn: (a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") },
  newest: { label: "Les plus récents d'abord", fn: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") },
};

export function sortOrphans(list, key) {
  const s = SORTS[key] || SORTS.size;
  return [...list].sort(s.fn);
}

// ------------------------------------------------------------
// Suppression
// ------------------------------------------------------------

// Supprime des fichiers du stockage par lots. Le stockage peut répondre sans erreur tout en ne supprimant rien
// (droits insuffisants) : seuls les noms renvoyés par le stockage comptent comme supprimés.
async function removeFiles(client, paths) {
  const removed = [];
  const failed = [];
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK);
    let res;
    try {
      res = await client.storage.from(MEDIA_BUCKET).remove(chunk);
    } catch (e) {
      chunk.forEach((p) => failed.push({ path: p, message: errText(e) || "erreur réseau" }));
      continue;
    }
    if (!res || res.error) {
      chunk.forEach((p) => failed.push({ path: p, message: errText(res && res.error) || "erreur du stockage" }));
      continue;
    }
    const names = new Set((Array.isArray(res.data) ? res.data : []).map((d) => d && d.name));
    chunk.forEach((p) => (names.has(p) ? removed.push(p) : failed.push({ path: p, message: "non supprimé (droits insuffisants ou fichier introuvable)" })));
  }
  return { removed, failed };
}

// Supprime les fichiers orphelins choisis. Les références sont relues juste avant : un fichier devenu utilisé est conservé.
// Un fichier envoyé depuis moins d'une heure est aussi refusé ici (en plus de l'interface), par prudence.
// Renvoie { removed, failed, skippedUsed, skippedRecent, bytesFreed } ou { error } (rien n'est alors supprimé).
export async function deleteOrphans(client, selected, now = Date.now()) {
  const wanted = (selected || []).filter((o) => o && typeof o.path === "string" && o.path.length > 0);
  if (wanted.length === 0) return { removed: [], failed: [], skippedUsed: [], skippedRecent: [], bytesFreed: 0 };

  const fresh = await readReferences(client);
  if (fresh.error) return { error: fresh.error };
  const refs = buildReferenceSet(fresh.products, fresh.siteRows);

  const skippedUsed = [];
  const skippedRecent = [];
  const toDelete = [];
  const sizeOf = new Map();
  wanted.forEach((o) => {
    sizeOf.set(o.path, Number(o.size) || 0);
    if (refs.has(o.path)) skippedUsed.push(o.path);
    else if (isRecent(o.createdAt, now)) skippedRecent.push(o.path);
    else toDelete.push(o.path);
  });

  const r = toDelete.length ? await removeFiles(client, toDelete) : { removed: [], failed: [] };
  const bytesFreed = r.removed.reduce((s, p) => s + (sizeOf.get(p) || 0), 0);
  return { removed: r.removed, failed: r.failed, skippedUsed, skippedRecent, bytesFreed };
}
