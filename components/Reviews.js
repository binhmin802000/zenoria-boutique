import React, { useEffect, useRef, useState } from "react";
import { Star, MessageCircle, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { REVIEWS_RULES, reviewErrorMessage } from "@/lib/reviewsSettings";

// ============================================================
// AFFICHAGE PUBLIC DES AVIS — ZENORIA_REVIEWS_STEP3_V1
//
//  ReviewRatingLine   : note + nombre d'avis sous le prix (fiche bague)
//  ProductReviewsList : 2 derniers avis + mentions + lien (fiche bague)
//  ReviewsSection     : section « Avis clientes » de l'accueil (score, répartition, filtres)
//
// Lecture publique : fonctions SQL public_reviews() et public_reviews_summary()
//   (avis publiés < 3 ans, hors commandes de test, textes retirés en mode « étoiles seulement »).
// Aperçu admin : fonction admin_preview_reviews() — avis EN ATTENTE et PUBLIÉS, tests compris,
//   visibles seulement par l'administration, même interrupteur sur OFF, avec un bandeau « Aperçu admin ».
// Informations exigées à proximité des avis (art. D111-17 C. conso) : contrôle, dates, classement, charte.
// ============================================================

export const OPEN_REVIEWS_EVENT = "zenoria:open-reviews";
const TIME_ZONE = "Europe/Paris";
const EMPTY = { count: 0, average: null, dist: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
const CACHE_MS = 20000;
const cache = new Map();

// Ferme la fiche (fait par l'appelant) puis amène la section « Avis clientes », filtrée sur un bijou
export function openReviewsSection(productId) {
  if (typeof window === "undefined") return;
  setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_REVIEWS_EVENT, { detail: { productId: productId || null } })), 80);
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });
}
const formatAverage = (n) => (n === null || n === undefined ? "" : Number(n).toFixed(1).replace(".", ","));

function summarize(rows) {
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  rows.forEach((r) => { if (dist[r.rating] !== undefined) dist[r.rating] += 1; });
  const count = rows.length;
  const average = count >= REVIEWS_RULES.minReviewsForAverage ? rows.reduce((s, r) => s + r.rating, 0) / count : null;
  return { count, average, dist };
}

async function fetchReviews({ productId, rating, limit, preview, starsOnly }) {
  if (preview) {
    const res = await supabase.rpc("admin_preview_reviews", { p_product_id: productId || null, p_limit: 200 });
    if (res.error) throw res.error;
    let all = res.data || [];
    if (starsOnly) all = all.map((r) => ({ ...r, comment: null, reply: null, reply_at: null }));
    const rows = all.filter((r) => !rating || r.rating === rating).slice(0, limit);
    return { rows, summary: summarize(all) };
  }
  const [list, sum] = await Promise.all([
    supabase.rpc("public_reviews", { p_product_id: productId || null, p_rating: rating || null, p_limit: limit, p_offset: 0 }),
    supabase.rpc("public_reviews_summary", { p_product_id: productId || null }),
  ]);
  if (list.error) throw list.error;
  if (sum.error) throw sum.error;
  const s = (sum.data && sum.data[0]) || null;
  const summary = s
    ? { count: s.review_count || 0, average: s.average, dist: { 5: s.count_5, 4: s.count_4, 3: s.count_3, 2: s.count_2, 1: s.count_1 } }
    : EMPTY;
  return { rows: list.data || [], summary };
}

function cachedFetch(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = loader().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

function useReviewsData({ productId = null, rating = 0, limit = 2, reviewsCfg, isAdmin }) {
  const enabled = Boolean(reviewsCfg && reviewsCfg.enabled);
  const starsOnly = Boolean(reviewsCfg && reviewsCfg.mode === "stars");
  const preview = Boolean(isAdmin);
  const active = enabled || preview;
  const key = JSON.stringify({ productId, rating, limit, preview, starsOnly, active });
  const [state, setState] = useState({ loading: active, rows: [], summary: EMPTY, error: "" });

  useEffect(() => {
    let alive = true;
    if (!active) {
      setState({ loading: false, rows: [], summary: EMPTY, error: "" });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    cachedFetch(key, () => fetchReviews({ productId, rating, limit, preview, starsOnly }))
      .then((d) => { if (alive) setState({ loading: false, rows: d.rows, summary: d.summary, error: "" }); })
      .catch((e) => { if (alive) setState({ loading: false, rows: [], summary: EMPTY, error: reviewErrorMessage(e) }); });
    return () => { alive = false; };
  }, [key]);

  return { ...state, enabled, starsOnly, preview };
}

function Stars({ value, size = 14 }) {
  const v = Math.round(Number(value) || 0);
  return (
    <span className="inline-flex gap-0.5" aria-label={`${formatAverage(value) || v} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= v ? "fill-[#b48a5a] text-[#b48a5a]" : "text-[#e2d6da]"} />
      ))}
    </span>
  );
}

function PreviewBanner({ enabled }) {
  return (
    <div className="flex gap-2 items-start rounded-xl bg-[#eef0f6] text-[#4a5578] px-3 py-2 text-[11px] leading-4">
      <Eye size={14} className="shrink-0 mt-0.5" />
      <span>
        <strong className="font-medium">Aperçu admin</strong> — visible uniquement par l&apos;administration. Inclut les avis en attente et ceux des commandes de test, qui ne seront jamais publiés. Interrupteur « Avis clientes » : {enabled ? "ON" : "OFF"}.
      </span>
    </div>
  );
}

function LegalNote({ enabled, className = "" }) {
  return (
    <p className={`text-[11px] leading-4 text-[#8b737e] ${className}`}>
      Avis contrôlés avant publication, déposés uniquement par des clientes ayant reçu leur commande, publiés positifs comme négatifs, sans contrepartie. Classés du plus récent au plus ancien ; chaque avis reste en ligne {REVIEWS_RULES.publicationYears} ans.
      {enabled && (
        <>
          {" "}
          <a href="/charte-des-avis" className="underline text-[#8f6075]">Charte des avis</a>
        </>
      )}
    </p>
  );
}

function ReviewItem({ r, preview, showProduct = false }) {
  return (
    <div className="py-3 border-b border-[#eee2e5] last:border-b-0" data-testid={`review-${r.id}`}>
      <div className="flex flex-wrap justify-between gap-2 items-center">
        <span className="flex flex-wrap items-center gap-2">
          <Stars value={r.rating} />
          <span className="text-sm font-medium text-[#412f3b]">{r.display_name}</span>
          {showProduct && r.product_name && <span className="text-[11px] text-[#8b737e]">· {r.product_name}</span>}
        </span>
        <span className="flex flex-wrap gap-1">
          {preview && r.status === "pending" && <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-800">En attente</span>}
          {preview && r.is_test && <span className="text-[10px] rounded-full px-2 py-0.5 bg-[#eef0f6] text-[#4a5578]">Test</span>}
          <span className="text-[10px] rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700">✓ Achat vérifié</span>
        </span>
      </div>
      {r.comment && <p className="text-sm text-[#54434c] leading-6 mt-2 whitespace-pre-line break-words">{r.comment}</p>}
      <div className="text-[11px] text-[#8b737e] mt-1">
        {preview && r.status === "pending" ? "Reçu" : "Publié"} le {formatDate(r.published_at)} · commande du {formatDate(r.order_date)}
      </div>
      {r.reply && (
        <div className="mt-2 rounded-xl bg-[#f8f2f4] px-3 py-2">
          <div className="text-[11px] text-[#8f6075] flex items-center gap-1"><MessageCircle size={12} /> Réponse de Zenoria</div>
          <p className="text-sm text-[#54434c] leading-6 whitespace-pre-line break-words">{r.reply}</p>
        </div>
      )}
    </div>
  );
}

// ---------- Fiche bague : ligne sous le prix ----------
export function ReviewRatingLine({ productId, reviewsCfg, isAdmin, onSeeAll }) {
  const d = useReviewsData({ productId, limit: 2, reviewsCfg, isAdmin });
  if (d.loading || d.error || d.summary.count === 0) return null;
  const { count, average } = d.summary;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" data-testid="review-rating-line">
      {average !== null && (
        <>
          <Stars value={average} size={15} />
          <strong className="font-medium text-[#412f3b]">{formatAverage(average)}</strong>
        </>
      )}
      <span className="text-[#8b737e]">{average !== null ? "· " : ""}{count} avis vérifié{count > 1 ? "s" : ""}</span>
      {onSeeAll && (
        <button type="button" onClick={onSeeAll} className="underline text-[#8f6075] text-sm">Voir les avis</button>
      )}
      {d.preview && <span className="text-[10px] rounded-full px-2 py-0.5 bg-[#eef0f6] text-[#4a5578]">Aperçu admin</span>}
    </div>
  );
}

// ---------- Fiche bague : 2 derniers avis ----------
export function ProductReviewsList({ productId, reviewsCfg, isAdmin, onSeeAll }) {
  const d = useReviewsData({ productId, limit: 2, reviewsCfg, isAdmin });
  if (d.loading) return null;
  if (d.error) return d.preview ? <p className="mt-6 text-[11px] text-red-600">Aperçu admin : {d.error}</p> : null;
  if (d.summary.count === 0) return null;
  return (
    <div className="mt-7 pt-5 border-t border-[#eadfe4]" data-testid="product-reviews">
      <div className="flex flex-wrap justify-between items-baseline gap-2 mb-1">
        <h4 className="font-serif text-xl text-[#412f3b]">Derniers avis</h4>
        <span className="text-[11px] text-[#8b737e]">du plus récent au plus ancien</span>
      </div>
      {d.preview && <PreviewBanner enabled={d.enabled} />}
      <div>
        {d.rows.map((r) => <ReviewItem key={r.id} r={r} preview={d.preview} />)}
      </div>
      {onSeeAll && d.summary.count > d.rows.length && (
        <button type="button" onClick={onSeeAll} className="mt-2 underline text-[#8f6075] text-sm">
          Voir les {d.summary.count} avis
        </button>
      )}
      <LegalNote enabled={d.enabled} className="mt-3" />
    </div>
  );
}

// ---------- Section « Avis clientes » de l'accueil ----------
export function ReviewsSection({ reviewsCfg, isAdmin, products = [] }) {
  const [productId, setProductId] = useState(null);
  const [rating, setRating] = useState(0);
  const [limit, setLimit] = useState(20);
  const ref = useRef(null);
  const preview = Boolean(isAdmin);
  const cap = preview ? 200 : 50;
  const d = useReviewsData({ productId, rating, limit, reviewsCfg, isAdmin });

  useEffect(() => {
    const open = (e) => {
      const id = e && e.detail ? e.detail.productId : null;
      setProductId(id || null);
      setRating(0);
      setLimit(20);
      if (ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(OPEN_REVIEWS_EVENT, open);
    if (window.location.hash === "#avis") open(null);
    return () => window.removeEventListener(OPEN_REVIEWS_EVENT, open);
  }, []);

  const { count, average, dist } = d.summary;
  const options = (Array.isArray(products) ? products : []).filter((p) => p && p.id && p.name);

  return (
    <section id="avis" ref={ref} data-testid="reviews-section" className="max-w-5xl mx-auto px-6 py-20 scroll-mt-24">
      <p className="text-xs uppercase tracking-[.25em] text-[#b48a5a] text-center">Zenoria</p>
      <h2 className="font-serif text-4xl text-[#412f3b] mt-3 text-center">Avis clientes</h2>
      {preview && <div className="mt-6"><PreviewBanner enabled={d.enabled} /></div>}

      <div className="mt-8 rounded-[2rem] bg-white border border-[#eee2e5] p-6 md:p-8">
        <div className="grid md:grid-cols-[220px_1fr] gap-8 items-center">
          <div className="text-center md:text-left">
            {average !== null ? (
              <>
                <div className="font-serif text-5xl text-[#412f3b] leading-none">{formatAverage(average)}</div>
                <div className="mt-2"><Stars value={average} size={20} /></div>
                <div className="text-xs text-[#8b737e] mt-1">sur 5 · {count} avis vérifié{count > 1 ? "s" : ""}</div>
              </>
            ) : (
              <div className="text-sm text-[#70656a]">
                {count === 0 ? "Aucun avis pour l'instant." : `${count} avis vérifié${count > 1 ? "s" : ""}`}
                <div className="text-[11px] text-[#8b737e] mt-1">Note moyenne affichée à partir de {REVIEWS_RULES.minReviewsForAverage} avis.</div>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setRating(rating === k ? 0 : k); setLimit(20); }}
                className={`w-full grid grid-cols-[48px_1fr_32px] gap-2 items-center text-xs rounded-lg px-1 ${rating === k ? "bg-[#f5edf1]" : "hover:bg-[#fbf7f9]"}`}
                aria-pressed={rating === k}
              >
                <span className="text-left text-[#54434c]">{k} ★</span>
                <span className="h-2 rounded-full bg-[#f0e7ea] overflow-hidden">
                  <span className="block h-full bg-[#b48a5a]" style={{ width: `${count ? (dist[k] / count) * 100 : 0}%` }} />
                </span>
                <span className="text-right text-[#8b737e]">{dist[k]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-6">
          <span className="text-xs text-[#8b737e]">Filtrer :</span>
          {[0, 5, 4, 3, 2, 1].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { setRating(k); setLimit(20); }}
              className={`rounded-full px-3 h-8 text-xs border ${rating === k ? "bg-[#412f3b] text-white border-[#412f3b]" : "bg-white border-[#eadfe4] hover:bg-[#f5edf1]"}`}
            >
              {k ? `${k} ★` : "Toutes les notes"}
            </button>
          ))}
          <select
            value={productId || ""}
            onChange={(e) => { setProductId(e.target.value ? Number(e.target.value) : null); setLimit(20); }}
            aria-label="Filtrer par bijou"
            className="rounded-full border border-[#eadfe4] bg-white px-3 h-8 text-xs"
          >
            <option value="">Tous les bijoux</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="mt-4">
          {d.error && <p className="text-sm text-red-600 py-4">{preview ? `Aperçu admin : ${d.error}` : "Les avis ne peuvent pas être affichés pour le moment."}</p>}
          {!d.error && !d.loading && d.rows.length === 0 && <p className="text-sm text-[#8b737e] py-6 text-center">Aucun avis pour ce filtre.</p>}
          {d.rows.map((r) => <ReviewItem key={r.id} r={r} preview={preview} showProduct={!productId} />)}
          {!d.loading && d.rows.length >= limit && limit < cap && (
            <div className="text-center mt-4">
              <button type="button" onClick={() => setLimit(Math.min(limit + 20, cap))} className="rounded-full border border-[#d9c5cc] px-5 h-10 text-sm hover:bg-[#f5edf1]">
                Afficher plus d&apos;avis
              </button>
            </div>
          )}
        </div>
        <LegalNote enabled={d.enabled} className="mt-5" />
      </div>
    </section>
  );
}
