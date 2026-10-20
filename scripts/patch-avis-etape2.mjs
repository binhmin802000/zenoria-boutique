// ============================================================
// scripts/patch-avis-etape2.mjs — MODULE AVIS, étape 2 (onglet admin « Avis » : modération)
// ZENORIA_REVIEWS_STEP2_V1
//
// Prérequis : supabase_reviews.sql exécuté ; étape 1 appliquée (lib/reviewsSettings.js avec REFUSAL_REASONS).
// Usage (dossier zenoria, branche module-avis) :
//   node scripts\patch-avis-etape2.mjs --dry-run   -> vérifie tout, n'écrit rien
//   node scripts\patch-avis-etape2.mjs             -> applique
// Sécurités identiques aux scripts précédents (branche, fichiers propres, repères uniques, rejouable, CRLF/UTF-8).
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_REVIEWS_STEP2_V1";
const BRANCH = "module-avis";
const DRY = process.argv.includes("--dry-run");
const NEW_FILES = {
  "components/AdminReviews.js": "import React, { useCallback, useEffect, useMemo, useState } from \"react\";\nimport { Star, RefreshCw, MessageCircle } from \"lucide-react\";\nimport { supabase } from \"@/lib/supabase\";\nimport { REVIEWS_RULES, REFUSAL_REASONS, reviewErrorMessage } from \"@/lib/reviewsSettings\";\n\n// ============================================================\n// ONGLET « AVIS » (/admin#crm/avis) — ZENORIA_REVIEWS_STEP2_V1\n//\n// Modération des avis clientes : publier, refuser (motif obligatoire), répondre / retirer la réponse.\n// Lecture : table reviews (l'admin lit tout grâce à la règle reviews_select_own).\n// Écriture : uniquement par la fonction SQL moderate_review() (contrôle is_admin() dans la base).\n// Le texte d'un avis n'est JAMAIS modifiable (déclencheur reviews_protect_content).\n// Avis de commandes de test (is_test) : modérables, mais jamais publiés sur le site ni comptés.\n// ============================================================\n\nconst TIME_ZONE = \"Europe/Paris\";\nconst FILTERS = [\n  { id: \"pending\", label: \"En attente\" },\n  { id: \"published\", label: \"Publiés\" },\n  { id: \"refused\", label: \"Refusés\" },\n  { id: \"withdrawn\", label: \"Retirés\" },\n];\n\nfunction formatDate(value) {\n  if (!value) return \"\";\n  return new Date(value).toLocaleDateString(\"fr-FR\", { timeZone: TIME_ZONE });\n}\n\n// Jours ouvrés (lundi à vendredi) écoulés depuis une date, jours fériés non pris en compte\nfunction businessDaysSince(value) {\n  const start = new Date(value);\n  const end = new Date();\n  let n = 0;\n  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);\n  while (d <= end) {\n    const w = d.getDay();\n    if (w !== 0 && w !== 6) n += 1;\n    d.setDate(d.getDate() + 1);\n  }\n  return n;\n}\n\nfunction Stars({ value }) {\n  return (\n    <span className=\"inline-flex gap-0.5\" aria-label={`${value} sur 5`}>\n      {[1, 2, 3, 4, 5].map((i) => (\n        <Star key={i} size={14} className={i <= value ? \"fill-[#b48a5a] text-[#b48a5a]\" : \"text-[#e2d6da]\"} />\n      ))}\n    </span>\n  );\n}\n\nexport default function AdminReviews() {\n  const [rows, setRows] = useState([]);\n  const [loading, setLoading] = useState(true);\n  const [loadError, setLoadError] = useState(\"\");\n  const [filter, setFilter] = useState(\"pending\");\n  const [busyId, setBusyId] = useState(null);\n  const [refuseId, setRefuseId] = useState(null);\n  const [replyId, setReplyId] = useState(null);\n  const [replyText, setReplyText] = useState(\"\");\n  const [error, setError] = useState(\"\");\n  const [toast, setToast] = useState(\"\");\n\n  const load = useCallback(async () => {\n    setLoading(true);\n    setLoadError(\"\");\n    try {\n      const res = await supabase\n        .from(\"reviews\")\n        .select(\"id, order_id, product_id, rating, comment, display_name, status, refusal_reason, reply, reply_at, is_test, created_at, published_at, moderated_at, moderated_by_email, withdrawn_at, products(name)\")\n        .order(\"created_at\", { ascending: false })\n        .limit(500);\n      if (res.error) throw res.error;\n      setRows(res.data || []);\n    } catch (err) {\n      setLoadError(reviewErrorMessage(err));\n    }\n    setLoading(false);\n  }, []);\n\n  useEffect(() => {\n    load();\n  }, [load]);\n\n  useEffect(() => {\n    if (!toast) return undefined;\n    const t = setTimeout(() => setToast(\"\"), 4000);\n    return () => clearTimeout(t);\n  }, [toast]);\n\n  const stats = useMemo(() => {\n    const pending = rows.filter((r) => r.status === \"pending\");\n    const late = pending.filter((r) => businessDaysSince(r.created_at) > REVIEWS_RULES.moderationDays);\n    const pub = rows.filter((r) => r.status === \"published\" && !r.is_test);\n    const avg = pub.length >= REVIEWS_RULES.minReviewsForAverage ? (pub.reduce((s, r) => s + r.rating, 0) / pub.length).toFixed(1).replace(\".\", \",\") : \"—\";\n    const count = (s) => rows.filter((r) => r.status === s).length;\n    return { pending: pending.length, late: late.length, published: pub.length, avg, count };\n  }, [rows]);\n\n  const list = rows.filter((r) => r.status === filter);\n  // En attente : les plus anciens d'abord (ordre de traitement)\n  if (filter === \"pending\") list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));\n\n  const act = async (r, action, extra, message) => {\n    setBusyId(r.id);\n    setError(\"\");\n    try {\n      const { error: err } = await supabase.rpc(\"moderate_review\", { p_review_id: r.id, p_action: action, p_reason: null, p_reply: null, ...extra });\n      if (err) throw err;\n      setRefuseId(null);\n      setReplyId(null);\n      setToast(message);\n      await load();\n    } catch (err) {\n      setError(reviewErrorMessage(err));\n    }\n    setBusyId(null);\n  };\n\n  const maxChars = REVIEWS_RULES.maxCommentLength;\n\n  return (\n    <section data-testid=\"admin-reviews\" className=\"mt-2\">\n      <div className=\"flex justify-between items-start gap-3\">\n        <div className=\"min-w-0\">\n          <h2 className=\"font-serif text-2xl flex items-center gap-2\">\n            <Star size={20} className=\"text-[#8f6075]\" /> Avis clientes\n          </h2>\n          <p className=\"text-xs text-[#8b737e] mt-1 leading-4\">\n            Relisez chaque avis sous {REVIEWS_RULES.moderationDays} jours ouvrés. Publiez-le, ou refusez-le pour l&apos;un des motifs de la charte : la cliente voit le motif dans son espace. Le texte d&apos;un avis ne peut jamais être modifié.\n          </p>\n        </div>\n        <button\n          type=\"button\"\n          onClick={load}\n          disabled={loading}\n          aria-label=\"Actualiser les avis\"\n          className=\"shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60\"\n        >\n          <RefreshCw size={14} className={loading ? \"animate-spin\" : \"\"} />\n        </button>\n      </div>\n\n      <div className=\"grid grid-cols-2 md:grid-cols-4 gap-3 mt-5\">\n        {[\n          [stats.pending, \"en attente\"],\n          [stats.late, `en retard (> ${REVIEWS_RULES.moderationDays} jours ouvrés)`],\n          [stats.published, \"publiés (hors tests)\"],\n          [stats.avg, `note moyenne${stats.avg === \"—\" ? ` (dès ${REVIEWS_RULES.minReviewsForAverage} avis)` : \"\"}`],\n        ].map(([v, l], i) => (\n          <div key={i} className={`rounded-2xl bg-white border p-4 ${i === 1 && stats.late > 0 ? \"border-red-200\" : \"border-[#eee2e5]\"}`}>\n            <div className={`font-serif text-2xl ${i === 1 && stats.late > 0 ? \"text-red-600\" : \"text-[#412f3b]\"}`}>{v}</div>\n            <div className=\"text-[11px] text-[#8b737e] leading-4\">{l}</div>\n          </div>\n        ))}\n      </div>\n\n      <div className=\"flex flex-wrap gap-2 mt-5\" role=\"tablist\">\n        {FILTERS.map((f) => (\n          <button\n            key={f.id}\n            type=\"button\"\n            role=\"tab\"\n            aria-selected={filter === f.id}\n            onClick={() => { setFilter(f.id); setRefuseId(null); setReplyId(null); }}\n            data-testid={`reviews-filter-${f.id}`}\n            className={`rounded-full px-4 h-9 text-sm border ${filter === f.id ? \"bg-[#412f3b] text-white border-[#412f3b]\" : \"bg-white border-[#eadfe4] hover:bg-[#f5edf1]\"}`}\n          >\n            {f.label} ({stats.count(f.id)})\n          </button>\n        ))}\n      </div>\n\n      {toast && <div data-testid=\"admin-reviews-toast\" className=\"mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm\">{toast}</div>}\n      {loadError && <div role=\"alert\" className=\"mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm\">{loadError}</div>}\n      {error && <div role=\"alert\" className=\"mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm\">{error}</div>}\n\n      <div className=\"mt-4 space-y-3\">\n        {!loading && !loadError && list.length === 0 && (\n          <p className=\"text-sm text-[#8b737e] py-6 text-center\">Aucun avis dans cette liste.</p>\n        )}\n        {list.map((r) => {\n          const days = businessDaysSince(r.created_at);\n          const late = r.status === \"pending\" && days > REVIEWS_RULES.moderationDays;\n          const busy = busyId === r.id;\n          return (\n            <div key={r.id} data-testid={`admin-review-${r.id}`} className=\"rounded-2xl bg-white border border-[#eee2e5] p-4\">\n              <div className=\"flex flex-wrap justify-between gap-2 items-start\">\n                <div className=\"min-w-0\">\n                  <div className=\"flex flex-wrap items-center gap-2\">\n                    <Stars value={r.rating} />\n                    <span className=\"font-medium text-sm\">{r.display_name}</span>\n                    <span className=\"text-[11px] text-[#8b737e]\">· {(r.products && r.products.name) || `Bijou n° ${r.product_id}`} · commande n° {r.order_id}</span>\n                  </div>\n                </div>\n                <div className=\"flex flex-wrap gap-1\">\n                  {r.is_test && <span className=\"text-[10px] rounded-full px-2 py-0.5 bg-[#eef0f6] text-[#4a5578]\">Test · jamais publié sur le site</span>}\n                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${late ? \"bg-red-50 text-red-700\" : \"bg-[#f3f1f5] text-[#8b737e]\"}`}>\n                    Reçu le {formatDate(r.created_at)}{r.status === \"pending\" ? ` · ${days} j. ouvré${days > 1 ? \"s\" : \"\"}` : \"\"}\n                  </span>\n                </div>\n              </div>\n\n              {r.comment ? (\n                <p className=\"text-sm text-[#54434c] leading-6 mt-2 whitespace-pre-line break-words\">{r.comment}</p>\n              ) : (\n                <p className=\"text-[12px] text-[#8b737e] mt-2 italic\">Note seule, sans commentaire.</p>\n              )}\n\n              {r.status === \"refused\" && (\n                <div className=\"text-[11px] text-red-700 mt-1\">Refusé le {formatDate(r.moderated_at)} · motif : {REFUSAL_REASONS[r.refusal_reason] || r.refusal_reason}{r.moderated_by_email ? ` · ${r.moderated_by_email}` : \"\"}</div>\n              )}\n              {r.status === \"published\" && (\n                <div className=\"text-[11px] text-[#8b737e] mt-1\">Publié le {formatDate(r.published_at)}{r.moderated_by_email ? ` · ${r.moderated_by_email}` : \"\"}</div>\n              )}\n              {r.status === \"withdrawn\" && <div className=\"text-[11px] text-[#8b737e] mt-1\">Retiré par la cliente le {formatDate(r.withdrawn_at)}</div>}\n\n              {r.reply && replyId !== r.id && (\n                <div className=\"mt-2 rounded-xl bg-[#f8f2f4] px-3 py-2\">\n                  <div className=\"text-[11px] text-[#8f6075] flex items-center gap-1\"><MessageCircle size={12} /> Réponse de Zenoria · {formatDate(r.reply_at)}</div>\n                  <p className=\"text-sm text-[#54434c] leading-6 whitespace-pre-line break-words\">{r.reply}</p>\n                </div>\n              )}\n\n              {/* ACTIONS */}\n              <div className=\"flex flex-wrap gap-2 mt-3\">\n                {(r.status === \"pending\" || r.status === \"refused\") && (\n                  <button\n                    type=\"button\"\n                    disabled={busy}\n                    onClick={() => act(r, \"publish\", {}, r.is_test ? \"Avis publié (commande de test : il n'apparaîtra jamais sur le site).\" : \"Avis publié.\")}\n                    data-testid={`review-publish-${r.id}`}\n                    className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-9 text-sm disabled:opacity-50\"\n                  >\n                    Publier\n                  </button>\n                )}\n                {(r.status === \"pending\" || r.status === \"published\") && (\n                  <button\n                    type=\"button\"\n                    disabled={busy}\n                    onClick={() => { setRefuseId(refuseId === r.id ? null : r.id); setReplyId(null); }}\n                    data-testid={`review-refuse-${r.id}`}\n                    className=\"rounded-full border border-red-200 text-red-700 px-4 h-9 text-sm hover:bg-red-50 disabled:opacity-50\"\n                  >\n                    {r.status === \"published\" ? \"Dépublier (refuser)…\" : \"Refuser…\"}\n                  </button>\n                )}\n                {r.status === \"published\" && (\n                  <button\n                    type=\"button\"\n                    disabled={busy}\n                    onClick={() => { setReplyId(replyId === r.id ? null : r.id); setReplyText(r.reply || \"\"); setRefuseId(null); }}\n                    data-testid={`review-reply-${r.id}`}\n                    className=\"rounded-full border border-[#d9c5cc] px-4 h-9 text-sm hover:bg-[#f5edf1] disabled:opacity-50\"\n                  >\n                    {r.reply ? \"Modifier la réponse\" : \"Répondre\"}\n                  </button>\n                )}\n              </div>\n\n              {refuseId === r.id && (\n                <div className=\"mt-3 rounded-xl border border-red-100 bg-red-50/40 p-3\">\n                  <div className=\"text-xs text-[#54434c] mb-2\">Motif du refus (visible par la cliente) :</div>\n                  <div className=\"flex flex-wrap gap-2\">\n                    {Object.entries(REFUSAL_REASONS).map(([code, label]) => (\n                      <button\n                        key={code}\n                        type=\"button\"\n                        disabled={busy}\n                        onClick={() => act(r, \"refuse\", { p_reason: code }, `Avis refusé · motif : ${label}.`)}\n                        className=\"rounded-full border border-red-200 bg-white text-red-700 px-3 py-1 text-xs hover:bg-red-50 disabled:opacity-50\"\n                      >\n                        {label}\n                      </button>\n                    ))}\n                  </div>\n                </div>\n              )}\n\n              {replyId === r.id && (\n                <div className=\"mt-3\">\n                  <textarea\n                    rows={3}\n                    maxLength={maxChars}\n                    value={replyText}\n                    onChange={(e) => setReplyText(e.target.value)}\n                    placeholder=\"Votre réponse publique, affichée sous l'avis.\"\n                    className=\"w-full rounded-xl border border-[#eadfe4] focus:border-[#8f6075] px-3 py-2 text-sm leading-6 outline-none bg-white\"\n                  />\n                  <div className=\"flex flex-wrap justify-between items-center gap-2\">\n                    <span className=\"text-[11px] text-[#8b737e]\">{replyText.length.toLocaleString(\"fr-FR\")} / {maxChars.toLocaleString(\"fr-FR\")} · réponse vide = réponse retirée · non affichée en mode « étoiles seulement »</span>\n                    <div className=\"flex gap-2\">\n                      <button\n                        type=\"button\"\n                        disabled={busy}\n                        onClick={() => act(r, \"reply\", { p_reply: replyText }, replyText.trim() ? \"Réponse enregistrée.\" : \"Réponse retirée.\")}\n                        className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-9 text-sm disabled:opacity-50\"\n                      >\n                        Enregistrer la réponse\n                      </button>\n                      <button type=\"button\" onClick={() => setReplyId(null)} className=\"rounded-full border border-[#d9c5cc] px-4 h-9 text-sm hover:bg-[#f5edf1]\">\n                        Annuler\n                      </button>\n                    </div>\n                  </div>\n                </div>\n              )}\n            </div>\n          );\n        })}\n      </div>\n    </section>\n  );\n}\n"
};

const ok = (m) => console.log("  \u2713 " + m);
const info = (m) => console.log("  \u00b7 " + m);
class Stop extends Error {}
const fail = (m) => { throw new Stop(m); };
const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();

function read(rel) {
  if (!fs.existsSync(rel)) fail(`fichier introuvable : ${rel} (lancez le script depuis le dossier zenoria)`);
  let text = fs.readFileSync(rel, "utf8");
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { rel, bom, eol, text: text.replace(/\r\n/g, "\n") };
}
const toDisk = (f, text) => (f.bom ? "\uFEFF" : "") + (f.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);
function once(text, re, replacer, label, file) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const n = (text.match(g) || []).length;
  if (n !== 1) fail(`repère « ${label} » trouvé ${n} fois dans ${file} (1 attendu)`);
  return text.replace(re, replacer);
}

const PATCHES = {
  "lib/adminNav.js": (t) => {
    if (/id: "avis"/.test(t)) fail("lib/adminNav.js contient déjà un onglet « avis » : vérifiez à la main");
    return once(
      t,
      /^([ \t]*)\{ id: "commandes", label: "Commandes" \},[ \t]*$/m,
      (m, ind) => `${m}\n${ind}{ id: "avis", label: "Avis" }, // ${MARK} : modération des avis clientes`,
      "onglet commandes",
      "lib/adminNav.js"
    );
  },
  "pages/admin.js": (t) => {
    const f = "pages/admin.js";
    if (/\bAdminReviews\b|\bReviewsTabIcon\b/.test(t)) fail("pages/admin.js mentionne déjà AdminReviews : vérifiez à la main");
    t = once(
      t,
      /^import \{ CrmAccounts, CrmRoadmap, AdminOrders \} from "@\/components\/AdminCrm";[ \t]*$/m,
      (m) => `${m}\n// ${MARK} : onglet « Avis »\nimport AdminReviews from "@/components/AdminReviews";\nimport { Star as ReviewsTabIcon } from "lucide-react";`,
      "import AdminCrm",
      f
    );
    t = once(t, /(const TAB_ICONS\s*=\s*\{)/, (m) => `${m}\n  avis: ReviewsTabIcon,`, "const TAB_ICONS = {", f);
    t = once(
      t,
      /^([ \t]*)\{tab === "commandes" && <AdminOrders \/>\}[ \t]*$/m,
      (m, ind) => `${m}\n\n${ind}{tab === "avis" && <AdminReviews />}`,
      "onglet commandes (rendu)",
      f
    );
    return t;
  },
};

try {
  console.log(`\nModule avis · étape 2 (onglet admin « Avis »)${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
  let branch = "";
  try { branch = git("rev-parse --abbrev-ref HEAD"); } catch (e) { fail("git introuvable ou dossier hors dépôt"); }
  if (branch !== BRANCH) fail(`branche actuelle « ${branch} » : passez d'abord sur ${BRANCH}`);
  ok(`branche ${BRANCH}`);

  if (!read("lib/reviewsSettings.js").text.includes("REFUSAL_REASONS")) fail("l'étape 1 n'est pas appliquée (REFUSAL_REASONS absent de lib/reviewsSettings.js)");
  ok("étape 1 présente");

  const touched = Object.keys(PATCHES).filter((rel) => !read(rel).text.includes(MARK));
  const dirty = touched.length ? git(`status --porcelain -- ${touched.join(" ")}`) : "";
  if (dirty) fail(`modifications locales non commitées sur :\n${dirty}\n  (git restore <fichier> ou commit avant de relancer)`);
  ok("fichiers concernés identiques au dernier commit");

  const writes = [];
  const eol = read("pages/admin.js").eol;
  for (const [rel, content] of Object.entries(NEW_FILES)) {
    if (fs.existsSync(rel)) {
      if (read(rel).text === content) { info(`${rel} : déjà présent, identique`); continue; }
      fail(`${rel} existe déjà avec un contenu différent : renommez-le ou supprimez-le, puis relancez`);
    }
    writes.push({ rel, data: eol === "\r\n" ? content.replace(/\n/g, "\r\n") : content, label: "créé" });
  }
  for (const [rel, patch] of Object.entries(PATCHES)) {
    const f = read(rel);
    if (f.text.includes(MARK)) { info(`${rel} : déjà modifié, laissé tel quel`); continue; }
    writes.push({ rel, data: toDisk(f, patch(f.text)), label: "modifié" });
  }
  ok("tous les repères ont été trouvés");
  if (DRY) { console.log(`\nVérification réussie : ${writes.length} fichier(s) seraient écrits. Rien n'a été modifié.\n`); process.exit(0); }

  for (const w of writes) {
    fs.mkdirSync(path.dirname(w.rel), { recursive: true });
    fs.writeFileSync(w.rel, w.data, "utf8");
    ok(`${w.rel} ${w.label}`);
  }
  console.log(`\nTerminé : ${writes.length} fichier(s) écrit(s). Suite : npm run build, puis git status -sb.\n`);
} catch (e) {
  if (e instanceof Stop) { console.error(`\n\u2717 ARRÊT : ${e.message}\nAucun fichier n'a été modifié.\n`); process.exit(1); }
  throw e;
}
