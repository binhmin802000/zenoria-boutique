// ============================================================
// scripts/patch-avis-etape3.mjs — MODULE AVIS, étape 3 (affichage public + aperçu admin)
// ZENORIA_REVIEWS_STEP3_V1
//
// Prérequis : fonction SQL admin_preview_reviews installée ; étapes 1 et 2 appliquées.
// Usage (dossier zenoria, branche module-avis) :
//   node scripts\patch-avis-etape3.mjs --dry-run   -> vérifie tout, n'écrit rien
//   node scripts\patch-avis-etape3.mjs             -> applique
// La page du quiz n'est pas touchée : elle ne passe pas les nouveaux emplacements à la fiche bague.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_REVIEWS_STEP3_V1";
const BRANCH = "module-avis";
const DRY = process.argv.includes("--dry-run");
const NEW_FILES = {
  "components/Reviews.js": "import React, { useEffect, useRef, useState } from \"react\";\nimport { Star, MessageCircle, Eye } from \"lucide-react\";\nimport { supabase } from \"@/lib/supabase\";\nimport { REVIEWS_RULES, reviewErrorMessage } from \"@/lib/reviewsSettings\";\n\n// ============================================================\n// AFFICHAGE PUBLIC DES AVIS — ZENORIA_REVIEWS_STEP3_V1\n//\n//  ReviewRatingLine   : note + nombre d'avis sous le prix (fiche bague)\n//  ProductReviewsList : 2 derniers avis + mentions + lien (fiche bague)\n//  ReviewsSection     : section « Avis clientes » de l'accueil (score, répartition, filtres)\n//\n// Lecture publique : fonctions SQL public_reviews() et public_reviews_summary()\n//   (avis publiés < 3 ans, hors commandes de test, textes retirés en mode « étoiles seulement »).\n// Aperçu admin : fonction admin_preview_reviews() — avis EN ATTENTE et PUBLIÉS, tests compris,\n//   visibles seulement par l'administration, même interrupteur sur OFF, avec un bandeau « Aperçu admin ».\n// Informations exigées à proximité des avis (art. D111-17 C. conso) : contrôle, dates, classement, charte.\n// ============================================================\n\nexport const OPEN_REVIEWS_EVENT = \"zenoria:open-reviews\";\nconst TIME_ZONE = \"Europe/Paris\";\nconst EMPTY = { count: 0, average: null, dist: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };\nconst CACHE_MS = 20000;\nconst cache = new Map();\n\n// Ferme la fiche (fait par l'appelant) puis amène la section « Avis clientes », filtrée sur un bijou\nexport function openReviewsSection(productId) {\n  if (typeof window === \"undefined\") return;\n  setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_REVIEWS_EVENT, { detail: { productId: productId || null } })), 80);\n}\n\nfunction formatDate(value) {\n  if (!value) return \"\";\n  return new Date(value).toLocaleDateString(\"fr-FR\", { timeZone: TIME_ZONE });\n}\nconst formatAverage = (n) => (n === null || n === undefined ? \"\" : Number(n).toFixed(1).replace(\".\", \",\"));\n\nfunction summarize(rows) {\n  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };\n  rows.forEach((r) => { if (dist[r.rating] !== undefined) dist[r.rating] += 1; });\n  const count = rows.length;\n  const average = count >= REVIEWS_RULES.minReviewsForAverage ? rows.reduce((s, r) => s + r.rating, 0) / count : null;\n  return { count, average, dist };\n}\n\nasync function fetchReviews({ productId, rating, limit, preview, starsOnly }) {\n  if (preview) {\n    const res = await supabase.rpc(\"admin_preview_reviews\", { p_product_id: productId || null, p_limit: 200 });\n    if (res.error) throw res.error;\n    let all = res.data || [];\n    if (starsOnly) all = all.map((r) => ({ ...r, comment: null, reply: null, reply_at: null }));\n    const rows = all.filter((r) => !rating || r.rating === rating).slice(0, limit);\n    return { rows, summary: summarize(all) };\n  }\n  const [list, sum] = await Promise.all([\n    supabase.rpc(\"public_reviews\", { p_product_id: productId || null, p_rating: rating || null, p_limit: limit, p_offset: 0 }),\n    supabase.rpc(\"public_reviews_summary\", { p_product_id: productId || null }),\n  ]);\n  if (list.error) throw list.error;\n  if (sum.error) throw sum.error;\n  const s = (sum.data && sum.data[0]) || null;\n  const summary = s\n    ? { count: s.review_count || 0, average: s.average, dist: { 5: s.count_5, 4: s.count_4, 3: s.count_3, 2: s.count_2, 1: s.count_1 } }\n    : EMPTY;\n  return { rows: list.data || [], summary };\n}\n\nfunction cachedFetch(key, loader) {\n  const hit = cache.get(key);\n  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;\n  const promise = loader().catch((e) => { cache.delete(key); throw e; });\n  cache.set(key, { at: Date.now(), promise });\n  return promise;\n}\n\nfunction useReviewsData({ productId = null, rating = 0, limit = 2, reviewsCfg, isAdmin }) {\n  const enabled = Boolean(reviewsCfg && reviewsCfg.enabled);\n  const starsOnly = Boolean(reviewsCfg && reviewsCfg.mode === \"stars\");\n  const preview = Boolean(isAdmin);\n  const active = enabled || preview;\n  const key = JSON.stringify({ productId, rating, limit, preview, starsOnly, active });\n  const [state, setState] = useState({ loading: active, rows: [], summary: EMPTY, error: \"\" });\n\n  useEffect(() => {\n    let alive = true;\n    if (!active) {\n      setState({ loading: false, rows: [], summary: EMPTY, error: \"\" });\n      return undefined;\n    }\n    setState((s) => ({ ...s, loading: true }));\n    cachedFetch(key, () => fetchReviews({ productId, rating, limit, preview, starsOnly }))\n      .then((d) => { if (alive) setState({ loading: false, rows: d.rows, summary: d.summary, error: \"\" }); })\n      .catch((e) => { if (alive) setState({ loading: false, rows: [], summary: EMPTY, error: reviewErrorMessage(e) }); });\n    return () => { alive = false; };\n  }, [key]);\n\n  return { ...state, enabled, starsOnly, preview };\n}\n\nfunction Stars({ value, size = 14 }) {\n  const v = Math.round(Number(value) || 0);\n  return (\n    <span className=\"inline-flex gap-0.5\" aria-label={`${formatAverage(value) || v} sur 5`}>\n      {[1, 2, 3, 4, 5].map((i) => (\n        <Star key={i} size={size} className={i <= v ? \"fill-[#b48a5a] text-[#b48a5a]\" : \"text-[#e2d6da]\"} />\n      ))}\n    </span>\n  );\n}\n\nfunction PreviewBanner({ enabled }) {\n  return (\n    <div className=\"flex gap-2 items-start rounded-xl bg-[#eef0f6] text-[#4a5578] px-3 py-2 text-[11px] leading-4\">\n      <Eye size={14} className=\"shrink-0 mt-0.5\" />\n      <span>\n        <strong className=\"font-medium\">Aperçu admin</strong> — visible uniquement par l&apos;administration. Inclut les avis en attente et ceux des commandes de test, qui ne seront jamais publiés. Interrupteur « Avis clientes » : {enabled ? \"ON\" : \"OFF\"}.\n      </span>\n    </div>\n  );\n}\n\nfunction LegalNote({ enabled, className = \"\" }) {\n  return (\n    <p className={`text-[11px] leading-4 text-[#8b737e] ${className}`}>\n      Avis contrôlés avant publication, déposés uniquement par des clientes ayant reçu leur commande, publiés positifs comme négatifs, sans contrepartie. Classés du plus récent au plus ancien ; chaque avis reste en ligne {REVIEWS_RULES.publicationYears} ans.\n      {enabled && (\n        <>\n          {\" \"}\n          <a href=\"/charte-des-avis\" className=\"underline text-[#8f6075]\">Charte des avis</a>\n        </>\n      )}\n    </p>\n  );\n}\n\nfunction ReviewItem({ r, preview, showProduct = false }) {\n  return (\n    <div className=\"py-3 border-b border-[#eee2e5] last:border-b-0\" data-testid={`review-${r.id}`}>\n      <div className=\"flex flex-wrap justify-between gap-2 items-center\">\n        <span className=\"flex flex-wrap items-center gap-2\">\n          <Stars value={r.rating} />\n          <span className=\"text-sm font-medium text-[#412f3b]\">{r.display_name}</span>\n          {showProduct && r.product_name && <span className=\"text-[11px] text-[#8b737e]\">· {r.product_name}</span>}\n        </span>\n        <span className=\"flex flex-wrap gap-1\">\n          {preview && r.status === \"pending\" && <span className=\"text-[10px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-800\">En attente</span>}\n          {preview && r.is_test && <span className=\"text-[10px] rounded-full px-2 py-0.5 bg-[#eef0f6] text-[#4a5578]\">Test</span>}\n          <span className=\"text-[10px] rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700\">✓ Achat vérifié</span>\n        </span>\n      </div>\n      {r.comment && <p className=\"text-sm text-[#54434c] leading-6 mt-2 whitespace-pre-line break-words\">{r.comment}</p>}\n      <div className=\"text-[11px] text-[#8b737e] mt-1\">\n        {preview && r.status === \"pending\" ? \"Reçu\" : \"Publié\"} le {formatDate(r.published_at)} · commande du {formatDate(r.order_date)}\n      </div>\n      {r.reply && (\n        <div className=\"mt-2 rounded-xl bg-[#f8f2f4] px-3 py-2\">\n          <div className=\"text-[11px] text-[#8f6075] flex items-center gap-1\"><MessageCircle size={12} /> Réponse de Zenoria</div>\n          <p className=\"text-sm text-[#54434c] leading-6 whitespace-pre-line break-words\">{r.reply}</p>\n        </div>\n      )}\n    </div>\n  );\n}\n\n// ---------- Fiche bague : ligne sous le prix ----------\nexport function ReviewRatingLine({ productId, reviewsCfg, isAdmin, onSeeAll }) {\n  const d = useReviewsData({ productId, limit: 2, reviewsCfg, isAdmin });\n  if (d.loading || d.error || d.summary.count === 0) return null;\n  const { count, average } = d.summary;\n  return (\n    <div className=\"mt-3 flex flex-wrap items-center gap-2 text-sm\" data-testid=\"review-rating-line\">\n      {average !== null && (\n        <>\n          <Stars value={average} size={15} />\n          <strong className=\"font-medium text-[#412f3b]\">{formatAverage(average)}</strong>\n        </>\n      )}\n      <span className=\"text-[#8b737e]\">{average !== null ? \"· \" : \"\"}{count} avis vérifié{count > 1 ? \"s\" : \"\"}</span>\n      {onSeeAll && (\n        <button type=\"button\" onClick={onSeeAll} className=\"underline text-[#8f6075] text-sm\">Voir les avis</button>\n      )}\n      {d.preview && <span className=\"text-[10px] rounded-full px-2 py-0.5 bg-[#eef0f6] text-[#4a5578]\">Aperçu admin</span>}\n    </div>\n  );\n}\n\n// ---------- Fiche bague : 2 derniers avis ----------\nexport function ProductReviewsList({ productId, reviewsCfg, isAdmin, onSeeAll }) {\n  const d = useReviewsData({ productId, limit: 2, reviewsCfg, isAdmin });\n  if (d.loading) return null;\n  if (d.error) return d.preview ? <p className=\"mt-6 text-[11px] text-red-600\">Aperçu admin : {d.error}</p> : null;\n  if (d.summary.count === 0) return null;\n  return (\n    <div className=\"mt-7 pt-5 border-t border-[#eadfe4]\" data-testid=\"product-reviews\">\n      <div className=\"flex flex-wrap justify-between items-baseline gap-2 mb-1\">\n        <h4 className=\"font-serif text-xl text-[#412f3b]\">Derniers avis</h4>\n        <span className=\"text-[11px] text-[#8b737e]\">du plus récent au plus ancien</span>\n      </div>\n      {d.preview && <PreviewBanner enabled={d.enabled} />}\n      <div>\n        {d.rows.map((r) => <ReviewItem key={r.id} r={r} preview={d.preview} />)}\n      </div>\n      {onSeeAll && d.summary.count > d.rows.length && (\n        <button type=\"button\" onClick={onSeeAll} className=\"mt-2 underline text-[#8f6075] text-sm\">\n          Voir les {d.summary.count} avis\n        </button>\n      )}\n      <LegalNote enabled={d.enabled} className=\"mt-3\" />\n    </div>\n  );\n}\n\n// ---------- Section « Avis clientes » de l'accueil ----------\nexport function ReviewsSection({ reviewsCfg, isAdmin, products = [] }) {\n  const [productId, setProductId] = useState(null);\n  const [rating, setRating] = useState(0);\n  const [limit, setLimit] = useState(20);\n  const ref = useRef(null);\n  const preview = Boolean(isAdmin);\n  const cap = preview ? 200 : 50;\n  const d = useReviewsData({ productId, rating, limit, reviewsCfg, isAdmin });\n\n  useEffect(() => {\n    const open = (e) => {\n      const id = e && e.detail ? e.detail.productId : null;\n      setProductId(id || null);\n      setRating(0);\n      setLimit(20);\n      if (ref.current) ref.current.scrollIntoView({ behavior: \"smooth\", block: \"start\" });\n    };\n    window.addEventListener(OPEN_REVIEWS_EVENT, open);\n    if (window.location.hash === \"#avis\") open(null);\n    return () => window.removeEventListener(OPEN_REVIEWS_EVENT, open);\n  }, []);\n\n  const { count, average, dist } = d.summary;\n  const options = (Array.isArray(products) ? products : []).filter((p) => p && p.id && p.name);\n\n  return (\n    <section id=\"avis\" ref={ref} data-testid=\"reviews-section\" className=\"max-w-5xl mx-auto px-6 py-20 scroll-mt-24\">\n      <p className=\"text-xs uppercase tracking-[.25em] text-[#b48a5a] text-center\">Zenoria</p>\n      <h2 className=\"font-serif text-4xl text-[#412f3b] mt-3 text-center\">Avis clientes</h2>\n      {preview && <div className=\"mt-6\"><PreviewBanner enabled={d.enabled} /></div>}\n\n      <div className=\"mt-8 rounded-[2rem] bg-white border border-[#eee2e5] p-6 md:p-8\">\n        <div className=\"grid md:grid-cols-[220px_1fr] gap-8 items-center\">\n          <div className=\"text-center md:text-left\">\n            {average !== null ? (\n              <>\n                <div className=\"font-serif text-5xl text-[#412f3b] leading-none\">{formatAverage(average)}</div>\n                <div className=\"mt-2\"><Stars value={average} size={20} /></div>\n                <div className=\"text-xs text-[#8b737e] mt-1\">sur 5 · {count} avis vérifié{count > 1 ? \"s\" : \"\"}</div>\n              </>\n            ) : (\n              <div className=\"text-sm text-[#70656a]\">\n                {count === 0 ? \"Aucun avis pour l'instant.\" : `${count} avis vérifié${count > 1 ? \"s\" : \"\"}`}\n                <div className=\"text-[11px] text-[#8b737e] mt-1\">Note moyenne affichée à partir de {REVIEWS_RULES.minReviewsForAverage} avis.</div>\n              </div>\n            )}\n          </div>\n          <div className=\"space-y-1.5\">\n            {[5, 4, 3, 2, 1].map((k) => (\n              <button\n                key={k}\n                type=\"button\"\n                onClick={() => { setRating(rating === k ? 0 : k); setLimit(20); }}\n                className={`w-full grid grid-cols-[48px_1fr_32px] gap-2 items-center text-xs rounded-lg px-1 ${rating === k ? \"bg-[#f5edf1]\" : \"hover:bg-[#fbf7f9]\"}`}\n                aria-pressed={rating === k}\n              >\n                <span className=\"text-left text-[#54434c]\">{k} ★</span>\n                <span className=\"h-2 rounded-full bg-[#f0e7ea] overflow-hidden\">\n                  <span className=\"block h-full bg-[#b48a5a]\" style={{ width: `${count ? (dist[k] / count) * 100 : 0}%` }} />\n                </span>\n                <span className=\"text-right text-[#8b737e]\">{dist[k]}</span>\n              </button>\n            ))}\n          </div>\n        </div>\n\n        <div className=\"flex flex-wrap items-center gap-2 mt-6\">\n          <span className=\"text-xs text-[#8b737e]\">Filtrer :</span>\n          {[0, 5, 4, 3, 2, 1].map((k) => (\n            <button\n              key={k}\n              type=\"button\"\n              onClick={() => { setRating(k); setLimit(20); }}\n              className={`rounded-full px-3 h-8 text-xs border ${rating === k ? \"bg-[#412f3b] text-white border-[#412f3b]\" : \"bg-white border-[#eadfe4] hover:bg-[#f5edf1]\"}`}\n            >\n              {k ? `${k} ★` : \"Toutes les notes\"}\n            </button>\n          ))}\n          <select\n            value={productId || \"\"}\n            onChange={(e) => { setProductId(e.target.value ? Number(e.target.value) : null); setLimit(20); }}\n            aria-label=\"Filtrer par bijou\"\n            className=\"rounded-full border border-[#eadfe4] bg-white px-3 h-8 text-xs\"\n          >\n            <option value=\"\">Tous les bijoux</option>\n            {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}\n          </select>\n        </div>\n\n        <div className=\"mt-4\">\n          {d.error && <p className=\"text-sm text-red-600 py-4\">{preview ? `Aperçu admin : ${d.error}` : \"Les avis ne peuvent pas être affichés pour le moment.\"}</p>}\n          {!d.error && !d.loading && d.rows.length === 0 && <p className=\"text-sm text-[#8b737e] py-6 text-center\">Aucun avis pour ce filtre.</p>}\n          {d.rows.map((r) => <ReviewItem key={r.id} r={r} preview={preview} showProduct={!productId} />)}\n          {!d.loading && d.rows.length >= limit && limit < cap && (\n            <div className=\"text-center mt-4\">\n              <button type=\"button\" onClick={() => setLimit(Math.min(limit + 20, cap))} className=\"rounded-full border border-[#d9c5cc] px-5 h-10 text-sm hover:bg-[#f5edf1]\">\n                Afficher plus d&apos;avis\n              </button>\n            </div>\n          )}\n        </div>\n        <LegalNote enabled={d.enabled} className=\"mt-5\" />\n      </div>\n    </section>\n  );\n}\n"
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
  "components/ProductSheet.js": (t) => {
    const f = "components/ProductSheet.js";
    if (/ratingSlot|reviewsSlot/.test(t)) fail(`${f} contient déjà ratingSlot/reviewsSlot : vérifiez à la main`);
    t = once(
      t,
      /^\/\/  onToggleFavorite :[^\n]*$/m,
      (m) => `${m}\n//  ratingSlot       : facultatif, affiché sous le prix (note des avis) — ${MARK}\n//  reviewsSlot      : facultatif, affiché sous « Ajouter au panier » (derniers avis) — ${MARK}`,
      "commentaire onToggleFavorite",
      f
    );
    t = once(t, /favoriteActive = false, onToggleFavorite \}\) \{/, "favoriteActive = false, onToggleFavorite, ratingSlot = null, reviewsSlot = null }) {", "paramètres de ProductSheet", f);
    t = once(
      t,
      /^([ \t]*)<PriceTag product=\{product\} className="text-2xl mt-4 block" \/>[ \t]*$/m,
      (m, ind) => `${m}\n${ind}{ratingSlot}`,
      "PriceTag",
      f
    );
    t = once(
      t,
      /^([ \t]*)\{addLabel\}\n([ \t]*)<\/button>[ \t]*$/m,
      (m, a, ind) => `${m}\n${ind}{reviewsSlot}`,
      "fin du bouton Ajouter au panier",
      f
    );
    return t;
  },

  "pages/index.js": (t) => {
    const f = "pages/index.js";
    if (/\bReviewsSection\b/.test(t)) fail(`${f} mentionne déjà ReviewsSection : vérifiez à la main`);
    if (!/const \[products, setProducts\]/.test(t)) fail(`${f} : état « products » introuvable (const [products, setProducts])`);
    if (!/const \[reviewsCfg, setReviewsCfg\]/.test(t)) fail(`${f} : état « reviewsCfg » introuvable (chantier précédent absent ?)`);
    t = once(
      t,
      /^import MyReviewsPanel from "@\/components\/MyReviewsPanel";[ \t]*$/m,
      (m) => `${m}\n// ${MARK} : affichage des avis (fiche bague + section) et aperçu admin\nimport { ReviewRatingLine, ProductReviewsList, ReviewsSection, openReviewsSection } from "@/components/Reviews";`,
      "import MyReviewsPanel",
      f
    );
    t = once(
      t,
      /^([ \t]*)onToggleFavorite=\{\(\) => selected && toggleFavorite\(selected\.id\)\}[ \t]*$/m,
      (m, ind) =>
        `${m}\n` +
        `${ind}ratingSlot={selected && (reviewsCfg.enabled || isAdmin) ? <ReviewRatingLine productId={selected.id} reviewsCfg={reviewsCfg} isAdmin={isAdmin} onSeeAll={() => { const id = selected.id; setSelected(null); openReviewsSection(id); }} /> : null}\n` +
        `${ind}reviewsSlot={selected && (reviewsCfg.enabled || isAdmin) ? <ProductReviewsList productId={selected.id} reviewsCfg={reviewsCfg} isAdmin={isAdmin} onSeeAll={() => { const id = selected.id; setSelected(null); openReviewsSection(id); }} /> : null}`,
      "onToggleFavorite de ProductSheet",
      f
    );
    t = once(
      t,
      /^([ \t]*)<StorySection texts=\{siteTexts\} \/>[ \t]*$/m,
      (m, ind) => `${m}\n${ind}{/* AVIS CLIENTES : visibles si l'interrupteur est sur ON, ou en aperçu pour l'administration */}\n${ind}{(reviewsCfg.enabled || isAdmin) && <ReviewsSection reviewsCfg={reviewsCfg} isAdmin={isAdmin} products={products} />}`,
      "<StorySection />",
      f
    );
    return t;
  },
};

try {
  console.log(`\nModule avis · étape 3 (affichage + aperçu admin)${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
  let branch = "";
  try { branch = git("rev-parse --abbrev-ref HEAD"); } catch (e) { fail("git introuvable ou dossier hors dépôt"); }
  if (branch !== BRANCH) fail(`branche actuelle « ${branch} » : passez d'abord sur ${BRANCH}`);
  ok(`branche ${BRANCH}`);

  if (!fs.existsSync("components/AdminReviews.js")) fail("l'étape 2 n'est pas appliquée (components/AdminReviews.js absent)");
  ok("étapes 1 et 2 présentes");

  const touched = Object.keys(PATCHES).filter((rel) => !read(rel).text.includes(MARK));
  const dirty = touched.length ? git(`status --porcelain -- ${touched.join(" ")}`) : "";
  if (dirty) fail(`modifications locales non commitées sur :\n${dirty}\n  (commitez l'étape 2 ou git restore <fichier>, puis relancez)`);
  ok("fichiers concernés identiques au dernier commit");

  const writes = [];
  const eol = read("pages/index.js").eol;
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
