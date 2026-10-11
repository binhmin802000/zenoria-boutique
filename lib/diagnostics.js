// ============================================================
// diagnostics.js - Tests de la chaîne complète : poste, site (Vercel), Supabase, fichiers, exploitation
//
// Chaque test est simple et renvoie un état (OK, Attention, Panne, Non testé), un détail, et en cas
// de problème une CAUSE PROBABLE et l'ACTION à mener. Les tests s'exécutent du plus proche au plus
// lointain : si un maillon est en panne, ceux qui en dépendent sont marqués « Non testé » au lieu de
// produire de fausses alertes. À la fin, synthesize() croise les résultats pour dire où est le problème.
//
// Ce fichier ne dépend ni de React ni de Supabase : tout ce dont il a besoin lui est fourni par
// « env » (voir components/AdminHealth.js). Il peut donc être testé seul.
//
// Les tests partent du NAVIGATEUR de l'administratrice. Sur le réseau de l'entreprise, certains
// services peuvent être bloqués : c'est pourquoi le site (Vercel) refait lui-même la vérification de
// Supabase (/api/health?deep=1) et que les deux points de vue sont comparés.
// ============================================================

export const STATUS = { OK: "ok", WARN: "warn", FAIL: "fail", SKIP: "skip", PENDING: "pending", RUNNING: "running" };
export const STATUS_LABEL = { ok: "OK", warn: "Attention", fail: "Panne", skip: "Non testé", pending: "En attente", running: "En cours" };

export const GROUPS = [
  { id: "poste", label: "Poste et réseau" },
  { id: "site", label: "Site (Vercel)" },
  { id: "supabase", label: "Supabase : accès et sécurité" },
  { id: "donnees", label: "Données et fichiers" },
  { id: "exploitation", label: "Exploitation" },
  { id: "fournisseurs", label: "Fournisseurs" },
];

// Quel script SQL crée quoi (pour dire précisément lequel exécuter).
export const SQL_REQUIREMENTS = [
  { script: "supabase_admin_schema.sql", tables: ["products", "promo_codes", "admin_users"], core: true },
  { script: "supabase_site_media.sql", tables: ["site_media"] },
  { script: "supabase_admin_quotas.sql", tables: ["quota_settings"], rpcs: ["admin_usage_summary"] },
  { script: "supabase_admin_connections.sql", rpcs: ["admin_list_accounts"] },
  { script: "supabase_maintenance.sql", tables: ["site_maintenance"], rpcs: ["get_site_status"] },
];
export const DIAGNOSTIC_SCRIPT = "supabase_admin_diagnostic.sql";

// Image PNG de 1 pixel : sert au test d'envoi dans le stockage (le bucket n'accepte que des images et des vidéos).
const PNG_1X1_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// ---------- Aides ----------
export const errText = (e) => String((e && (e.message || e.details || e.error_description)) || e || "erreur inconnue");

export function isNetworkError(e) {
  const code = e && e.code ? String(e.code) : "";
  return !code && /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|délai|econn|enotfound|err_/i.test(errText(e));
}
export function isMissingTable(e) {
  const code = e && e.code ? String(e.code) : "";
  return code === "PGRST205" || code === "42P01" || /does not exist|could not find the table/i.test(errText(e));
}
export function isMissingFunction(e) {
  const code = e && e.code ? String(e.code) : "";
  return code === "PGRST202" || /could not find the function|function .* does not exist/i.test(errText(e));
}
export function isReadOnlyError(e) {
  const code = e && e.code ? String(e.code) : "";
  return code === "25006" || /read-only transaction|read only mode|read-only mode/i.test(errText(e));
}
export function isPermissionError(e) {
  const code = e && e.code ? String(e.code) : "";
  return code === "42501" || /row-level security|permission denied|not allowed|unauthorized/i.test(errText(e));
}

const result = (status, detail, cause, action, data) => ({ status, detail, cause: cause || "", action: action || "", data: data || null });
const ok = (detail, data) => result(STATUS.OK, detail, "", "", data);
const warn = (detail, cause, action, data) => result(STATUS.WARN, detail, cause, action, data);
const fail = (detail, cause, action, data) => result(STATUS.FAIL, detail, cause, action, data);
const skip = (detail) => result(STATUS.SKIP, detail);

const slowMs = 2500;

// Teste l'accessibilité d'un fichier : d'abord une requête légère (HEAD), puis, si le navigateur la
// refuse (restriction CORS), un chargement « comme un média » (une image ou les métadonnées d'une vidéo).
async function probeUrl(env, url, kind) {
  try {
    const res = await env.fetchFn(url, { method: "HEAD", cache: "no-store" });
    return { ok: res.ok, status: res.status, method: "HEAD" };
  } catch (e) {
    return new Promise((resolve) => {
      const el = env.document.createElement(kind === "video" ? "video" : "img");
      let done = false;
      const finish = (good) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ ok: good, status: good ? 200 : 0, method: "élément" });
      };
      const timer = setTimeout(() => finish(false), 8000);
      if (kind === "video") {
        el.preload = "metadata";
        el.onloadedmetadata = () => finish(true);
      } else {
        el.onload = () => finish(true);
      }
      el.onerror = () => finish(false);
      el.src = url;
    });
  }
}

// Exécute des tâches en parallèle, par lots (évite de saturer le réseau).
async function pool(items, size, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return out;
}

const T = (id, group, label, requires, run, extra) => ({ id, group, label, requires: requires || [], run, ...(extra || {}) });

// ============================================================
// LES TESTS
// ============================================================
export function buildTests() {
  return [
    // ---------------------------------------------------- Poste et réseau
    T("poste.online", "poste", "Connexion Internet du poste", [], async ({ env }) => {
      if (env.navigator.onLine === false) {
        return fail("Le navigateur indique que le poste est hors ligne.", "Pas de connexion Internet (câble, Wi-Fi, VPN).", "Rétablir la connexion puis relancer le diagnostic.");
      }
      const conn = env.navigator.connection;
      return ok("En ligne" + (conn && conn.effectiveType ? " · réseau " + conn.effectiveType : "") + " · " + env.location.host);
    }),

    T("poste.browser", "poste", "Navigateur : traitement des photos et vidéos", [], async ({ env }) => {
      const w = env.window || {};
      const missing = [];
      if (typeof w.createImageBitmap !== "function") missing.push("décodage d'image (createImageBitmap)");
      if (!(w.HTMLCanvasElement && w.HTMLCanvasElement.prototype.toBlob)) missing.push("canvas");
      let video = { ok: false, reason: "test indisponible" };
      try {
        video = env.videoSupport();
      } catch (e) {
        video = { ok: false, reason: errText(e) };
      }
      if (missing.length) return warn("Fonctions manquantes : " + missing.join(", ") + ".", "Navigateur trop ancien ou restreint.", "Utiliser une version récente de Chrome ou Edge pour l'administration.");
      if (!video.ok) return warn("Traitement vidéo indisponible : " + video.reason, "Le navigateur ne sait pas enregistrer de vidéo.", "Utiliser Chrome ou Edge récents, ou préparer les vidéos avec scripts/preparer-medias.mjs.", { video: false });
      return ok("Photos et vidéos : OK (enregistrement " + (video.mime || "vidéo").split(";")[0] + ")", { video: true });
    }),

    // ---------------------------------------------------- Site (Vercel)
    T("site.health", "site", "Le site répond (Vercel)", ["poste.online"], async ({ env, shared }) => {
      const t0 = env.now();
      const res = await env.fetchFn("/api/health", { cache: "no-store" });
      const ms = env.now() - t0;
      if (res.status === 404) {
        return fail("La route /api/health n'existe pas (HTTP 404).", "Le fichier pages/api/health.js n'est pas déployé (non publié ou mal placé).", "Placer pages/api/health.js dans le projet, puis git push et attendre « Ready » dans Vercel > Deployments.", { kind: "no_health" });
      }
      if (!res.ok) {
        return fail("Le site répond par une erreur (HTTP " + res.status + ").", "Erreur côté serveur Vercel : déploiement raté ou fonction en échec.", "Vercel > Deployments > dernier déploiement > Logs ; vérifier aussi le statut de Vercel.", { kind: "http_error", status: res.status });
      }
      let json;
      try {
        json = await res.json();
      } catch (e) {
        return fail("La réponse de /api/health n'est pas du JSON.", "Une page HTML a remplacé la sonde : maintenance totale mal configurée ou déploiement incomplet.", "Vérifier middleware.js et le dernier déploiement.", { kind: "not_json" });
      }
      shared.health = json;
      const detail = "OK · " + (json.env || "?") + " · région " + (json.region || "locale") + " · version " + (json.commit || "locale") + " · " + ms + " ms";
      if (ms > slowMs) return warn(detail, "Le site répond lentement.", "Relancer ; si cela persiste, consulter Vercel > Observability et le statut de Vercel.");
      return ok(detail, { ms });
    }),

    T("site.files", "site", "Fichiers du site (filigranes)", ["site.health"], async ({ env }) => {
      const files = ["/filigrane.png", "/filigrane-contraste.png"];
      const checks = await Promise.all(files.map((f) => probeUrl(env, f, "image")));
      const missing = files.filter((f, i) => !checks[i].ok);
      if (missing.length) {
        return warn("Introuvable : " + missing.join(", "), "Fichier oublié dans le dossier public/ ou non publié.", "Placer le fichier dans public/, puis git push. Sans lui, l'envoi de photos depuis /admin est refusé.", { missing });
      }
      return ok("filigrane.png et filigrane-contraste.png présents");
    }),

    T("site.server", "site", "Supabase vu depuis le site (serveur Vercel)", ["site.health"], async ({ env, shared }) => {
      const res = await env.fetchFn("/api/health?deep=1", { cache: "no-store" });
      let json = null;
      try {
        json = await res.json();
      } catch (e) {
        return fail("Réponse illisible de /api/health?deep=1 (HTTP " + res.status + ").", "La sonde complète n'a pas pu s'exécuter.", "Vérifier les logs de la fonction dans Vercel.", { kind: "not_json" });
      }
      shared.server = json;
      if (json.error && !json.supabase) {
        return fail(json.error, "Les variables d'environnement Supabase manquent sur le serveur Vercel.", "Vercel > Settings > Environment Variables : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY, puis redéployer.", { kind: "no_env" });
      }
      const s = json.supabase || {};
      const rest = s.rest || {};
      if (!rest.ok) {
        return fail("Supabase ne répond pas depuis Vercel : " + (rest.error || "erreur") + ".", "Supabase est en panne, le projet est en pause (plan gratuit : pause après une semaine d'inactivité), ou la table products est absente.", "Consulter le statut de Supabase ; dans le tableau de bord Supabase, restaurer le projet s'il est en pause.", { kind: "server_down" });
      }
      const auth = s.auth || {};
      const maint = s.maintenance || {};
      const parts = ["Données " + rest.ms + " ms", "authentification " + (auth.ok === true ? auth.ms + " ms" : auth.ok === null ? "point de contrôle non confirmé" : "sans réponse"), "maintenance " + (maint.ok ? "lue (" + maint.mode + ")" : "non lue")];
      if (auth.ok === false) return warn(parts.join(" · "), "Le service d'authentification ne répond pas au serveur.", "Vérifier le statut de Supabase (Auth). Les connexions et inscriptions peuvent échouer.", { kind: "auth_down" });
      if (rest.ms > slowMs) return warn(parts.join(" · "), "Supabase répond lentement.", "Relancer ; consulter le statut de Supabase.");
      return ok(parts.join(" · "), { kind: "ok" });
    }),

    // ---------------------------------------------------- Supabase : accès et sécurité
    T("supa.browser", "supabase", "Supabase vu depuis ce navigateur", ["poste.online"], async ({ env, shared }) => {
      const t0 = env.now();
      const { data, error } = await env.supabase.from("products").select("id,name,slug,active,photos,video");
      const ms = env.now() - t0;
      if (error) {
        if (isNetworkError(error)) {
          return fail("Aucune réponse de Supabase depuis ce navigateur.", "Supabase est injoignable depuis ce poste : réseau ou proxy d'entreprise (ENGIE), VPN, extension de blocage, ou panne / projet en pause côté Supabase.", "Comparer avec « Supabase vu depuis le site » ; tester depuis un autre réseau (téléphone en 4G) ; consulter le statut de Supabase.", { kind: "network" });
        }
        if (isMissingTable(error)) {
          return fail("La table products est absente.", "Le script de création de la base n'a pas été exécuté.", "Exécuter supabase_admin_schema.sql dans Supabase (SQL Editor).", { kind: "missing_table" });
        }
        if (/jwt|api key|apikey|PGRST301/i.test(errText(error) + " " + (error.code || ""))) {
          return fail("Supabase refuse la clé : " + errText(error), "La clé publique (NEXT_PUBLIC_SUPABASE_ANON_KEY) est fausse ou périmée.", "Vérifier .env.local en local et Vercel > Environment Variables en production.", { kind: "key" });
        }
        return fail("Erreur Supabase : " + errText(error), "Réponse inattendue de la base.", "Copier le rapport et le transmettre.", { kind: "other" });
      }
      shared.products = data || [];
      const active = shared.products.filter((p) => p.active).length;
      shared.activeCount = active;
      const detail = "Répond en " + ms + " ms · " + shared.products.length + " collection(s), dont " + active + " en ligne";
      if (ms > slowMs) return warn(detail, "Supabase répond lentement depuis ce poste.", "Relancer ; comparer avec la mesure du serveur Vercel.", { ms });
      return ok(detail, { ms });
    }),

    T("supa.auth", "supabase", "Authentification : session valide", ["supa.browser"], async ({ env }) => {
      const { data, error } = await env.supabase.auth.getUser();
      if (error) {
        if (isNetworkError(error)) return fail("Le service d'authentification ne répond pas.", "Réseau ou panne du service Auth de Supabase.", "Relancer ; consulter le statut de Supabase.", { kind: "network" });
        return warn("Session refusée : " + errText(error), "La session a expiré ou le compte a été modifié.", "Se déconnecter puis se reconnecter.", { kind: "session" });
      }
      if (!data || !data.user) return warn("Aucun utilisateur connecté.", "Session absente.", "Se reconnecter.");
      return ok("Session validée par le serveur d'authentification");
    }),

    T("supa.rls_visitor", "supabase", "Ce que voient les visiteurs (sans compte)", ["supa.browser"], async ({ env, shared }) => {
      const anon = env.createAnon();
      const prod = await anon.from("products").select("id,active");
      if (prod.error) {
        if (isNetworkError(prod.error)) return skip("Réseau indisponible pour ce test.");
        return fail("Un visiteur ne peut pas lire le catalogue : " + errText(prod.error), "La règle de lecture publique de la table products est trop stricte.", "Revoir la politique de sécurité « select » de products (supabase_admin_schema.sql).", { kind: "catalogue" });
      }
      const rows = prod.data || [];
      const anonActive = rows.filter((p) => p.active).length;
      const anonHidden = rows.filter((p) => !p.active).length;
      const leaks = [];
      for (const table of ["admin_users", "quota_settings", "site_maintenance"]) {
        const probe = await anon.from(table).select("*").limit(1);
        if (!probe.error && probe.data && probe.data.length > 0) leaks.push(table);
      }
      if (leaks.length) {
        return fail("Tables lisibles par n'importe qui : " + leaks.join(", ") + ".", "Une règle de sécurité (RLS) laisse ces données ouvertes aux visiteurs.", "Corriger les politiques « select » de ces tables en les limitant à is_admin().", { kind: "leak", leaks });
      }
      if (anonHidden > 0) {
        return warn("Les visiteurs voient " + anonHidden + " collection(s) masquée(s).", "La règle de lecture publique ne filtre pas sur active = true.", "Limiter la lecture publique de products aux collections actives.", { kind: "hidden_visible" });
      }
      if ((shared.activeCount || 0) > 0 && anonActive === 0) {
        return fail("Les visiteurs ne voient aucune collection alors que " + shared.activeCount + " sont en ligne.", "La règle de lecture publique bloque tout.", "Revoir la politique « select » de products.", { kind: "catalogue" });
      }
      return ok(anonActive + " collection(s) visible(s) par les visiteurs · tables sensibles protégées", { anonActive });
    }),

    T("supa.rls_policies", "supabase", "Règles de sécurité de la base (RLS)", ["supa.browser"], async ({ env }) => {
      const { data, error } = await env.supabase.rpc("admin_diag_rls_check");
      if (error) {
        if (isMissingFunction(error)) return warn("Contrôle non installé.", "Le script " + DIAGNOSTIC_SCRIPT + " n'a pas été exécuté.", "Exécuter " + DIAGNOSTIC_SCRIPT + " dans Supabase (SQL Editor).", { kind: "missing_fn", script: DIAGNOSTIC_SCRIPT });
        if (isNetworkError(error)) return skip("Réseau indisponible pour ce test.");
        return warn("Contrôle impossible : " + errText(error), "Réponse inattendue.", "Relancer.");
      }
      const issues = data || [];
      const fails = issues.filter((i) => i.severity === "fail");
      const warns = issues.filter((i) => i.severity !== "fail");
      const list = issues.slice(0, 5).map((i) => i.table_name + " : " + i.issue).join(" | ");
      if (fails.length) return fail(fails.length + " problème(s) de sécurité : " + list, "Des tables sont ouvertes à tout le monde en écriture ou sans RLS.", "Corriger les politiques indiquées avant toute vente.", { kind: "rls", issues });
      if (warns.length) return warn(warns.length + " point(s) à vérifier : " + list, "Règles d'écriture du stockage sans contrôle du rôle administrateur.", "Vérifier supabase_storage_setup.sql.", { kind: "rls_warn", issues });
      return ok("Aucune table ouverte, aucune règle d'écriture publique");
    }),

    // ---------------------------------------------------- Données et fichiers
    T("data.write", "donnees", "Base de données : écriture possible", ["supa.browser"], async ({ env }) => {
      const t0 = env.now();
      const { data, error } = await env.supabase.rpc("admin_diag_write_test");
      const ms = env.now() - t0;
      if (error) {
        if (isReadOnlyError(error)) {
          return fail("La base est en LECTURE SEULE.", "La limite de 500 Mo du plan gratuit est dépassée : le catalogue reste visible, mais aucune commande, inscription ni modification ne s'enregistre.", "Onglet Quotas : supprimer des fichiers ou des données inutiles ; ou passer Supabase en forfait Pro.", { kind: "read_only" });
        }
        if (isMissingFunction(error)) return warn("Test d'écriture non installé.", "Le script " + DIAGNOSTIC_SCRIPT + " n'a pas été exécuté.", "Exécuter " + DIAGNOSTIC_SCRIPT + " dans Supabase (SQL Editor).", { kind: "missing_fn", script: DIAGNOSTIC_SCRIPT });
        if (isNetworkError(error)) return skip("Réseau indisponible pour ce test.");
        return fail("Écriture impossible : " + errText(error), "La base refuse d'écrire.", "Consulter l'onglet Quotas et le statut de Supabase.", { kind: "write_error" });
      }
      const ro = data && data.read_only === "on";
      if (ro) return fail("La base est en lecture seule (transaction).", "Mode lecture seule activé.", "Onglet Quotas.", { kind: "read_only" });
      return ok("Écriture et suppression réussies (" + ms + " ms)");
    }),

    T("data.schema", "donnees", "Scripts SQL installés", ["supa.browser"], async ({ env }) => {
      const missingByScript = {};
      let core = false;
      const note = (script, name, isCore) => {
        (missingByScript[script] = missingByScript[script] || []).push(name);
        if (isCore) core = true;
      };
      for (const req of SQL_REQUIREMENTS) {
        for (const table of req.tables || []) {
          const { error } = await env.supabase.from(table).select("*", { count: "exact", head: true });
          if (error && isMissingTable(error)) note(req.script, table, req.core);
          else if (error && isNetworkError(error)) return skip("Réseau indisponible pour ce test.");
        }
        for (const rpc of req.rpcs || []) {
          const { error } = await env.supabase.rpc(rpc);
          if (error && isMissingFunction(error)) note(req.script, rpc + "()", req.core);
        }
      }
      const scripts = Object.keys(missingByScript);
      if (!scripts.length) return ok("Tous les scripts SQL attendus sont installés", { missingScripts: [] });
      const detail = scripts.map((s) => s + " (manque : " + missingByScript[s].join(", ") + ")").join(" ; ");
      const action = "Exécuter dans Supabase (SQL Editor) : " + scripts.join(", ") + ".";
      if (core) return fail(detail, "Le socle de la base n'est pas complet.", action, { missingScripts: scripts });
      return warn(detail, "Des fonctions de l'administration ne sont pas activées.", action, { missingScripts: scripts });
    }),

    T("data.storage_read", "donnees", "Stockage : lecture d'un fichier public", ["supa.browser"], async ({ env, shared }) => {
      const candidates = [];
      for (const p of shared.products || []) {
        for (const path of Array.isArray(p.photos) ? p.photos : []) if (String(path).includes("/")) candidates.push({ url: env.getMediaUrl(path, p.slug), kind: "image" });
        if (p.video && String(p.video).includes("/")) candidates.push({ url: env.getMediaUrl(p.video, p.slug), kind: "video" });
      }
      if (!candidates.length) return skip("Aucun fichier envoyé depuis l'administration à tester.");
      const probe = await probeUrl(env, candidates[0].url, candidates[0].kind);
      if (!probe.ok) {
        return fail("Un fichier du stockage est introuvable (HTTP " + (probe.status || "aucune réponse") + ").", "Le stockage Supabase est en panne, le bucket n'est pas public, ou le fichier a été supprimé.", "Supabase > Storage > product-media : vérifier que le bucket est public ; relancer.", { kind: "storage_read" });
      }
      return ok("Fichier public lu avec succès (méthode : " + probe.method + ")");
    }),

    T("data.storage_write", "donnees", "Stockage : envoi et suppression d'un fichier test", ["supa.browser"], async ({ env }) => {
      if (!env.options.storageWrite) return skip("Désactivé dans les options.");
      const bytes = Uint8Array.from(env.window.atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));
      const blob = new env.window.Blob([bytes], { type: "image/png" });
      const path = "diag/diag-" + env.now() + ".png";
      const t0 = env.now();
      const up = await env.supabase.storage.from(env.mediaBucket).upload(path, blob, { contentType: "image/png", upsert: false, cacheControl: "60" });
      if (up.error) {
        const msg = errText(up.error);
        if (isNetworkError(up.error)) return fail("Le stockage ne répond pas.", "Réseau ou panne du stockage Supabase.", "Relancer ; consulter le statut de Supabase.", { kind: "network" });
        if (/bucket not found/i.test(msg)) return fail("Le bucket product-media est introuvable.", "Le script de configuration du stockage n'a pas été exécuté.", "Exécuter supabase_storage_setup.sql dans Supabase (SQL Editor).", { kind: "bucket" });
        if (/row-level security|not allowed|unauthorized|permission/i.test(msg) || up.error.statusCode === "403") return fail("Envoi refusé : " + msg, "Les règles du stockage refusent l'envoi : compte non administrateur ou règles incorrectes.", "Vérifier supabase_storage_setup.sql et que ce compte figure dans admin_users.", { kind: "storage_rls" });
        if (/exceed|quota|too large|limit/i.test(msg)) return fail("Envoi refusé : " + msg, "Quota de stockage atteint (1 Go sur le plan gratuit).", "Onglet Quotas : supprimer des fichiers inutiles ou passer au forfait Pro.", { kind: "storage_quota" });
        return fail("Envoi impossible : " + msg, "Réponse inattendue du stockage.", "Copier le rapport et le transmettre.", { kind: "storage_other" });
      }
      const rm = await env.supabase.storage.from(env.mediaBucket).remove([path]);
      const ms = env.now() - t0;
      if (rm.error) return warn("Envoi réussi mais le fichier test (" + path + ") n'a pas pu être supprimé : " + errText(rm.error), "Les règles du stockage n'autorisent pas la suppression.", "Supprimer ce fichier à la main (Supabase > Storage > product-media > diag/) et vérifier les règles de suppression.", { kind: "storage_remove" });
      return ok("Envoi et suppression réussis (" + ms + " ms)");
    }),

    T(
      "data.media",
      "donnees",
      "Photos et vidéos des collections en ligne",
      ["supa.browser"],
      async ({ env, shared }) => {
        if (!env.options.media) return skip("Désactivé dans les options.");
        const items = [];
        for (const p of (shared.products || []).filter((x) => x.active)) {
          for (const path of Array.isArray(p.photos) ? p.photos : []) items.push({ label: p.name, path, kind: "image", url: env.getMediaUrl(path, p.slug) });
          if (p.video) items.push({ label: p.name, path: p.video, kind: "video", url: env.getMediaUrl(p.video, p.slug) });
        }
        const site = await env.supabase.from("site_media").select("slot,path");
        if (!site.error) for (const row of site.data || []) items.push({ label: row.slot === "hero_video" ? "Vidéo d'accueil" : "Photo Savoir-faire", path: row.path, kind: row.slot === "hero_video" ? "video" : "image", url: env.getMediaUrl(row.path, "site") });
        if (!items.length) return skip("Aucun média à contrôler.");
        const limited = items.slice(0, env.options.maxMedia || 80);
        const checked = await pool(limited, 6, async (it) => ({ it, probe: await probeUrl(env, it.url, it.kind) }));
        const broken = checked.filter((c) => !c.probe.ok).map((c) => ({ label: c.it.label, path: c.it.path }));
        const note = items.length > limited.length ? " (" + limited.length + " premiers sur " + items.length + ")" : "";
        if (!broken.length) return ok(limited.length + " fichier(s) accessible(s)" + note, { total: limited.length, broken: [] });
        const list = broken.slice(0, 6).map((b) => b.label + " : " + b.path).join(" | ");
        const detail = broken.length + " fichier(s) introuvable(s) sur " + limited.length + note + " — " + list;
        const cause = "Fichier supprimé, nom modifié, ou absent de public/images (anciennes collections).";
        const action = "Rouvrir la collection dans l'administration et renvoyer le média, ou replacer le fichier dans public/images/<identifiant>/.";
        if (broken.length === limited.length) return fail(detail, "Tous les médias sont introuvables : stockage indisponible ou bucket non public.", "Vérifier Supabase > Storage et le test « Stockage : lecture ».", { total: limited.length, broken });
        return warn(detail, cause, action, { total: limited.length, broken });
      },
      { timeoutMs: 45000 }
    ),

    // ---------------------------------------------------- Exploitation
    T("ops.maintenance", "exploitation", "Maintenance : état et comportement réel du site", ["supa.browser", "site.health"], async ({ env }) => {
      const rpc = await env.supabase.rpc("get_site_status", { preview: null });
      if (rpc.error) {
        if (isMissingFunction(rpc.error)) return warn("Maintenance non installée.", "Le script supabase_maintenance.sql n'a pas été exécuté : la maintenance ne peut pas être activée.", "Exécuter supabase_maintenance.sql dans Supabase (SQL Editor).", { kind: "missing_fn", script: "supabase_maintenance.sql" });
        if (isNetworkError(rpc.error)) return skip("Réseau indisponible pour ce test.");
        return fail("Lecture de l'état impossible : " + errText(rpc.error), "Réponse inattendue.", "Relancer.");
      }
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      const mode = row && row.mode ? row.mode : "off";
      const raw = await env.supabase.from("site_maintenance").select("mode,auto_end_at,activated_at").maybeSingle();
      let probe;
      try {
        const res = await env.fetchFn("/", { cache: "no-store", credentials: "omit", redirect: "manual" });
        probe = { status: res.status, retryAfter: res.headers.get("retry-after") };
      } catch (e) {
        return warn("État lu (" + mode + ") mais le site n'a pas pu être interrogé.", "Réseau interrompu pendant le test.", "Relancer.");
      }
      if (mode === "off") {
        if (probe.status === 503) {
          return fail("Le site répond 503 alors que la maintenance est désactivée.", "Réponse en cache sur une instance, ou middleware.js ancien : la réouverture met jusqu'à 15 s à se propager.", "Attendre 15 s puis relancer ; sinon vérifier le dernier déploiement.", { kind: "stuck_503" });
        }
        const expired = raw.data && raw.data.mode && raw.data.mode !== "off" && raw.data.auto_end_at;
        if (expired) return warn("Le site est ouvert (HTTP " + probe.status + ") mais l'état enregistré est « " + raw.data.mode + " » : la fin programmée est passée.", "La coupure a expiré toute seule.", "Onglet Maintenance : remettre l'état sur « Ouvert » pour clore.", { kind: "expired" });
        return ok("Site ouvert (HTTP " + probe.status + ")", { mode });
      }
      const since = raw.data && raw.data.activated_at ? Date.parse(raw.data.activated_at) : NaN;
      const longRun = Number.isFinite(since) && env.now() - since > 24 * 3600 * 1000;
      if (mode === "shop_pause") {
        if (probe.status === 503) return fail("Boutique en pause, mais le site répond 503.", "Le middleware bloque le site en mode « pause » : version ancienne ou erreur.", "Vérifier middleware.js et redéployer.", { kind: "pause_blocked" });
        return ok("Boutique en pause : site visible (HTTP " + probe.status + "), commandes fermées" + (longRun ? " depuis plus de 24 h" : ""), { mode });
      }
      if (probe.status !== 503) {
        return fail("Maintenance totale activée, mais le site répond normalement (HTTP " + probe.status + ").", "middleware.js absent ou non déployé, ancien déploiement, ou délai de propagation (jusqu'à 15 s).", "Vérifier que middleware.js est à la racine du projet et publié ; attendre 15 s ; relancer.", { kind: "not_blocking" });
      }
      if (!probe.retryAfter) return warn("Maintenance totale : le site répond 503 mais sans en-tête Retry-After.", "En-tête manquant : les moteurs de recherche ne savent pas quand revenir.", "Vérifier middleware.js.", { kind: "no_retry_after" });
      if (longRun) return warn("Maintenance totale active depuis plus de 24 h (503 avec Retry-After " + probe.retryAfter + " s).", "Au-delà de 24 à 48 h, Google peut retirer des pages de son index.", "Rouvrir le site dès que possible, ou passer en « boutique en pause ».", { kind: "too_long" });
      return ok("Maintenance totale : le site répond 503 avec Retry-After " + probe.retryAfter + " s", { mode });
    }),

    T("ops.errors", "exploitation", "Erreurs rencontrées par les visiteurs (24 h)", ["supa.browser"], async ({ env }) => {
      const { data, error } = await env.supabase.rpc("admin_client_errors", { hours: 24, max_rows: 20 });
      if (error) {
        if (isMissingFunction(error)) return warn("Journal des erreurs non installé.", "Le script " + DIAGNOSTIC_SCRIPT + " n'a pas été exécuté.", "Exécuter " + DIAGNOSTIC_SCRIPT + " dans Supabase (SQL Editor).", { kind: "missing_fn", script: DIAGNOSTIC_SCRIPT });
        if (isNetworkError(error)) return skip("Réseau indisponible pour ce test.");
        return warn("Lecture du journal impossible : " + errText(error), "Réponse inattendue.", "Relancer.");
      }
      const rows = data || [];
      if (!rows.length) return ok("Aucune erreur signalée par les visiteurs ces dernières 24 h", { distinct: 0, total: 0 });
      const total = rows.reduce((s, r) => s + (Number(r.occurrences) || 0), 0);
      const top = rows.slice(0, 3).map((r) => "« " + String(r.message).slice(0, 70) + " » ×" + r.occurrences).join(" | ");
      const detail = rows.length + " erreur(s) différente(s), " + total + " occurrence(s) cumulée(s) : " + top;
      const data2 = { distinct: rows.length, total };
      if (rows.length >= 10 || total >= 50) return fail(detail, "Beaucoup d'erreurs côté visiteurs : un défaut touche probablement plusieurs personnes.", "Ouvrir le journal plus bas, regarder les pages et navigateurs concernés ; corriger puis purger.", data2);
      return warn(detail, "Des visiteurs ont rencontré des erreurs.", "Consulter le journal plus bas.", data2);
    }),

    T("ops.quota", "exploitation", "Quotas Supabase et Vercel", [], async ({ env }) => {
      if (!env.quotaReady) return skip("Les quotas ne sont pas chargés (script supabase_admin_quotas.sql ou connexion).");
      const alerts = env.quotaAlerts || [];
      const critical = alerts.filter((a) => a.level === "critical");
      if (critical.length) return fail(critical.map((a) => a.text).join(" | "), "Un quota est presque atteint : risque de blocage (base en lecture seule, envois refusés).", "Onglet Quotas : libérer de la place ou passer au forfait supérieur.", { kind: "quota_critical" });
      if (alerts.length) return warn(alerts.map((a) => a.text).join(" | "), "Un quota approche de sa limite.", "Onglet Quotas.", { kind: "quota_warn" });
      return ok("Aucune alerte de quota");
    }),

    // ---------------------------------------------------- Fournisseurs (lus par le serveur Vercel)
    T("prov.vercel", "fournisseurs", "Statut officiel de Vercel", ["site.server"], async ({ shared }) => providerResult("Vercel", shared.server && shared.server.providers && shared.server.providers.vercel, "https://www.vercel-status.com")),
    T("prov.supabase", "fournisseurs", "Statut officiel de Supabase", ["site.server"], async ({ shared }) => providerResult("Supabase", shared.server && shared.server.providers && shared.server.providers.supabase, "https://status.supabase.com")),
  ];
}

function providerResult(name, p, page) {
  if (!p || p.ok === null || p.ok === undefined) {
    return skip("Statut de " + name + " non lisible automatiquement (" + ((p && p.error) || "indisponible") + "). Consulter " + page + ".");
  }
  if (p.ok) return ok("Tous les systèmes opérationnels" + (p.description ? " (" + p.description + ")" : ""), { indicator: p.indicator });
  const severe = p.indicator === "major" || p.indicator === "critical";
  const mk = severe ? fail : warn;
  return mk(name + " signale un incident : " + (p.description || p.indicator) + ".", "Panne ou dégradation chez le fournisseur : ce n'est pas un défaut du site.", "Attendre le rétablissement ; suivre " + page + ".", { indicator: p.indicator, provider: name });
}

// ============================================================
// EXÉCUTION
// ============================================================
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("délai dépassé"), { isTimeout: true })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function runDiagnostics(tests, env, hooks) {
  const h = hooks || {};
  const results = tests.map((t) => ({ id: t.id, group: t.group, label: t.label, status: STATUS.PENDING, detail: "", cause: "", action: "", ms: 0, data: null }));
  const index = new Map(results.map((r, i) => [r.id, i]));
  const shared = {};
  const emit = () => h.onUpdate && h.onUpdate(results.map((r) => ({ ...r })));
  emit();

  for (let i = 0; i < tests.length; i++) {
    if (h.shouldStop && h.shouldStop()) {
      for (let j = i; j < tests.length; j++) results[j] = { ...results[j], status: STATUS.SKIP, detail: "Diagnostic interrompu." };
      emit();
      break;
    }
    const t = tests[i];
    results[i] = { ...results[i], status: STATUS.RUNNING };
    emit();

    const blocking = (t.requires || []).map((id) => results[index.get(id)]).find((r) => r && r.status === STATUS.FAIL);
    if (blocking) {
      results[i] = { ...results[i], status: STATUS.SKIP, detail: "Non testé : « " + blocking.label + " » est en panne." };
      emit();
      continue;
    }

    const t0 = env.now();
    let out;
    try {
      out = await withTimeout(t.run({ env, shared, results }), t.timeoutMs || h.timeoutMs || 10000);
    } catch (e) {
      out = e && e.isTimeout
        ? fail("Pas de réponse dans le délai imparti.", "Le service ne répond pas, ou le réseau bloque la requête.", "Relancer ; tester depuis un autre réseau.", { kind: "timeout" })
        : fail("Erreur pendant le test : " + errText(e), "Erreur inattendue.", "Copier le rapport et le transmettre.", { kind: "exception" });
    }
    results[i] = { ...results[i], ...out, ms: env.now() - t0 };
    emit();
  }
  return results;
}

export function summarize(results) {
  const c = { ok: 0, warn: 0, fail: 0, skip: 0, pending: 0, running: 0 };
  for (const r of results) c[r.status] = (c[r.status] || 0) + 1;
  return c;
}

// ============================================================
// CONCLUSION : croise les résultats pour dire OÙ est le problème
// ============================================================
export function synthesize(results) {
  const by = Object.fromEntries(results.map((r) => [r.id, r]));
  const st = (id) => (by[id] ? by[id].status : undefined);
  const kind = (id) => (by[id] && by[id].data && by[id].data.kind) || "";
  const out = [];
  const add = (level, text) => out.push({ level, text });

  if (st("poste.online") === STATUS.FAIL) {
    add(STATUS.FAIL, "Le poste est hors ligne : aucun autre résultat n'est fiable. Rétablissez la connexion puis relancez.");
    return out;
  }
  if (st("site.health") === STATUS.FAIL) {
    const k = kind("site.health");
    add(STATUS.FAIL, k === "no_health" ? "Le site répond mais la sonde /api/health n'est pas déployée : publiez pages/api/health.js (git push) et attendez « Ready » dans Vercel." : "Le site (Vercel) ne répond pas correctement : voir Vercel > Deployments > Logs, et le statut de Vercel.");
  }

  const browserDown = st("supa.browser") === STATUS.FAIL && kind("supa.browser") === "network";
  const serverDown = st("site.server") === STATUS.FAIL;
  const serverAnswered = st("site.server") === STATUS.OK || st("site.server") === STATUS.WARN;
  if (browserDown && serverAnswered) {
    add(STATUS.WARN, "Supabase répond côté serveur (Vercel) mais pas depuis ce navigateur : le problème est LOCAL (réseau ou proxy d'entreprise, VPN, extension de blocage). Les visiteurs ne sont probablement pas concernés : testez depuis un autre réseau (téléphone en 4G).");
  } else if (browserDown && serverDown) {
    add(STATUS.FAIL, "Supabase ne répond ni depuis le site ni depuis ce navigateur : panne chez Supabase ou projet en pause (plan gratuit : pause après une semaine d'inactivité). Consultez le statut de Supabase, puis restaurez le projet dans son tableau de bord.");
  } else if (browserDown) {
    add(STATUS.FAIL, "Supabase ne répond pas depuis ce navigateur et le site n'a pas pu confirmer de son côté : testez depuis un autre réseau et consultez le statut de Supabase.");
  } else if (serverDown && st("supa.browser") === STATUS.OK) {
    add(STATUS.FAIL, "Supabase répond depuis ce navigateur mais pas depuis le serveur Vercel : vérifiez les variables d'environnement de Vercel (URL et clé) et redéployez.");
  }

  if (st("data.write") === STATUS.FAIL && kind("data.write") === "read_only") {
    add(STATUS.FAIL, "La base est en LECTURE SEULE (limite de 500 Mo dépassée) : le catalogue s'affiche mais plus rien ne s'enregistre (commandes, inscriptions, modifications). Libérez de la place (onglet Quotas) ou passez Supabase en forfait Pro.");
  } else if (st("data.write") === STATUS.FAIL) {
    add(STATUS.FAIL, "L'écriture dans la base échoue : consultez l'onglet Quotas et le statut de Supabase.");
  }

  if (st("supa.auth") === STATUS.FAIL) add(STATUS.FAIL, "Le service d'authentification ne répond pas : connexions et inscriptions risquent d'échouer.");
  if (kind("supa.rls_visitor") === "leak") add(STATUS.FAIL, "URGENT : des données réservées à l'administration sont lisibles par n'importe quel visiteur (" + ((by["supa.rls_visitor"].data && by["supa.rls_visitor"].data.leaks) || []).join(", ") + "). Corrigez les règles de sécurité avant toute vente.");
  if (st("supa.rls_policies") === STATUS.FAIL) add(STATUS.FAIL, "Des tables sont ouvertes à tout le monde en écriture ou sans RLS : corrigez avant toute vente.");

  const scripts = new Set();
  for (const r of results) {
    if (r.data && Array.isArray(r.data.missingScripts)) r.data.missingScripts.forEach((s) => scripts.add(s));
    if (r.data && r.data.kind === "missing_fn" && r.data.script) scripts.add(r.data.script);
  }
  if (scripts.size) add(STATUS.WARN, "Scripts SQL à exécuter dans Supabase (SQL Editor) : " + Array.from(scripts).join(", ") + ".");

  if (st("data.storage_read") === STATUS.FAIL || st("data.storage_write") === STATUS.FAIL) {
    const k = kind("data.storage_write");
    add(STATUS.FAIL, k === "storage_quota" ? "Le stockage est plein (1 Go sur le plan gratuit) : supprimez des fichiers inutiles ou passez au forfait Pro." : "Le stockage de fichiers pose problème : consultez le détail des tests « Stockage » ci-dessous.");
  }
  const media = by["data.media"];
  if (media && (media.status === STATUS.WARN || media.status === STATUS.FAIL) && media.data && media.data.broken) {
    add(media.status, media.data.broken.length + " photo(s) ou vidéo(s) introuvable(s) sur le site : voir la liste dans le test « Photos et vidéos des collections ».");
  }

  const mk = kind("ops.maintenance");
  if (mk === "not_blocking") add(STATUS.FAIL, "La maintenance totale est activée mais le site continue de répondre normalement : middleware.js n'est pas déployé ou pas pris en compte.");
  else if (mk === "stuck_503") add(STATUS.FAIL, "Le site répond 503 alors que la maintenance est désactivée : attendez 15 s et relancez ; sinon redéployez.");
  else if (mk === "too_long") add(STATUS.WARN, "La maintenance totale dure depuis plus de 24 h : risque pour le référencement. Rouvrez le site ou passez en « boutique en pause ».");

  if (st("ops.errors") === STATUS.FAIL) add(STATUS.FAIL, "Beaucoup d'erreurs sont remontées par les visiteurs : ouvrez le journal ci-dessous pour voir les pages et navigateurs concernés.");
  if (st("ops.quota") === STATUS.FAIL) add(STATUS.FAIL, "Un quota est presque atteint : voir l'onglet Quotas.");

  for (const id of ["prov.vercel", "prov.supabase"]) {
    if (st(id) === STATUS.FAIL || st(id) === STATUS.WARN) add(STATUS.WARN, by[id].detail + " Attendez le rétablissement avant de chercher une panne chez vous.");
  }

  if (!out.length) {
    const unreliable = results.some((r) => r.status === STATUS.SKIP);
    add(STATUS.OK, "Aucun problème détecté sur les maillons testés." + (unreliable ? " Certains tests n'ont pas pu être faits (voir « Non testé »)." : "") + " Ce diagnostic échantillonne la chaîne : il ne prouve pas que tout fonctionne pour tous les visiteurs.");
  }
  return out;
}

// ============================================================
// RAPPORT À COPIER (aucun secret : ni clé, ni adresse e-mail)
// ============================================================
export function formatReport(results, conclusions, meta) {
  const m = meta || {};
  const when = m.startedAt ? new Date(m.startedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "";
  const lines = [];
  lines.push("RAPPORT DE DIAGNOSTIC — Zenoria");
  if (when) lines.push("Date : " + when + " (heure de Paris)");
  if (m.origin) lines.push("Site : " + m.origin);
  if (m.agent) lines.push("Navigateur : " + m.agent);
  if (m.durationMs !== undefined) lines.push("Durée : " + (m.durationMs / 1000).toFixed(1).replace(".", ",") + " s");
  if (m.options) lines.push("Options : envoi test " + (m.options.storageWrite ? "oui" : "non") + ", contrôle des médias " + (m.options.media ? "oui" : "non"));
  lines.push("Remarque : tests lancés depuis le navigateur de l'administratrice (le réseau local peut bloquer certains services).");
  lines.push("");
  lines.push("CONCLUSION");
  for (const c of conclusions || []) lines.push("- [" + STATUS_LABEL[c.level].toUpperCase() + "] " + c.text);
  lines.push("");
  lines.push("RÉSULTATS");
  for (const g of GROUPS) {
    const rows = results.filter((r) => r.group === g.id);
    if (!rows.length) continue;
    lines.push("");
    lines.push(g.label.toUpperCase());
    for (const r of rows) {
      lines.push("[" + STATUS_LABEL[r.status].toUpperCase() + "] " + r.label + (r.ms ? " (" + r.ms + " ms)" : ""));
      if (r.detail) lines.push("    " + r.detail);
      if (r.cause && (r.status === STATUS.WARN || r.status === STATUS.FAIL)) lines.push("    Cause probable : " + r.cause);
      if (r.action && (r.status === STATUS.WARN || r.status === STATUS.FAIL)) lines.push("    Action : " + r.action);
    }
  }
  return lines.join("\n");
}
