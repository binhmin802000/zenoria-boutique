import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Star, RefreshCw, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { REVIEWS_RULES, REFUSAL_REASONS, reviewErrorMessage } from "@/lib/reviewsSettings";

// ============================================================
// ONGLET « AVIS » (/admin#crm/avis) — ZENORIA_REVIEWS_STEP2_V1
//
// Modération des avis clientes : publier, refuser (motif obligatoire), répondre / retirer la réponse.
// Lecture : table reviews (l'admin lit tout grâce à la règle reviews_select_own).
// Écriture : uniquement par la fonction SQL moderate_review() (contrôle is_admin() dans la base).
// Le texte d'un avis n'est JAMAIS modifiable (déclencheur reviews_protect_content).
// Avis de commandes de test (is_test) : modérables, mais jamais publiés sur le site ni comptés.
// ============================================================

const TIME_ZONE = "Europe/Paris";
const FILTERS = [
  { id: "pending", label: "En attente" },
  { id: "published", label: "Publiés" },
  { id: "refused", label: "Refusés" },
  { id: "withdrawn", label: "Retirés" },
];

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });
}

// Jours ouvrés (lundi à vendredi) écoulés depuis une date, jours fériés non pris en compte
function businessDaysSince(value) {
  const start = new Date(value);
  const end = new Date();
  let n = 0;
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  while (d <= end) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

function Stars({ value }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={14} className={i <= value ? "fill-[#b48a5a] text-[#b48a5a]" : "text-[#e2d6da]"} />
      ))}
    </span>
  );
}

export default function AdminReviews() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [busyId, setBusyId] = useState(null);
  const [refuseId, setRefuseId] = useState(null);
  const [replyId, setReplyId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase
        .from("reviews")
        .select("id, order_id, product_id, rating, comment, display_name, status, refusal_reason, reply, reply_at, is_test, created_at, published_at, moderated_at, moderated_by_email, withdrawn_at, products(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (res.error) throw res.error;
      setRows(res.data || []);
    } catch (err) {
      setLoadError(reviewErrorMessage(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending");
    const late = pending.filter((r) => businessDaysSince(r.created_at) > REVIEWS_RULES.moderationDays);
    const pub = rows.filter((r) => r.status === "published" && !r.is_test);
    const avg = pub.length >= REVIEWS_RULES.minReviewsForAverage ? (pub.reduce((s, r) => s + r.rating, 0) / pub.length).toFixed(1).replace(".", ",") : "—";
    const count = (s) => rows.filter((r) => r.status === s).length;
    return { pending: pending.length, late: late.length, published: pub.length, avg, count };
  }, [rows]);

  const list = rows.filter((r) => r.status === filter);
  // En attente : les plus anciens d'abord (ordre de traitement)
  if (filter === "pending") list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const act = async (r, action, extra, message) => {
    setBusyId(r.id);
    setError("");
    try {
      const { error: err } = await supabase.rpc("moderate_review", { p_review_id: r.id, p_action: action, p_reason: null, p_reply: null, ...extra });
      if (err) throw err;
      setRefuseId(null);
      setReplyId(null);
      setToast(message);
      await load();
    } catch (err) {
      setError(reviewErrorMessage(err));
    }
    setBusyId(null);
  };

  const maxChars = REVIEWS_RULES.maxCommentLength;

  return (
    <section data-testid="admin-reviews" className="mt-2">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl flex items-center gap-2">
            <Star size={20} className="text-[#8f6075]" /> Avis clientes
          </h2>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Relisez chaque avis sous {REVIEWS_RULES.moderationDays} jours ouvrés. Publiez-le, ou refusez-le pour l&apos;un des motifs de la charte : la cliente voit le motif dans son espace. Le texte d&apos;un avis ne peut jamais être modifié.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Actualiser les avis"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        {[
          [stats.pending, "en attente"],
          [stats.late, `en retard (> ${REVIEWS_RULES.moderationDays} jours ouvrés)`],
          [stats.published, "publiés (hors tests)"],
          [stats.avg, `note moyenne${stats.avg === "—" ? ` (dès ${REVIEWS_RULES.minReviewsForAverage} avis)` : ""}`],
        ].map(([v, l], i) => (
          <div key={i} className={`rounded-2xl bg-white border p-4 ${i === 1 && stats.late > 0 ? "border-red-200" : "border-[#eee2e5]"}`}>
            <div className={`font-serif text-2xl ${i === 1 && stats.late > 0 ? "text-red-600" : "text-[#412f3b]"}`}>{v}</div>
            <div className="text-[11px] text-[#8b737e] leading-4">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-5" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => { setFilter(f.id); setRefuseId(null); setReplyId(null); }}
            data-testid={`reviews-filter-${f.id}`}
            className={`rounded-full px-4 h-9 text-sm border ${filter === f.id ? "bg-[#412f3b] text-white border-[#412f3b]" : "bg-white border-[#eadfe4] hover:bg-[#f5edf1]"}`}
          >
            {f.label} ({stats.count(f.id)})
          </button>
        ))}
      </div>

      {toast && <div data-testid="admin-reviews-toast" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {loadError && <div role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{loadError}</div>}
      {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

      <div className="mt-4 space-y-3">
        {!loading && !loadError && list.length === 0 && (
          <p className="text-sm text-[#8b737e] py-6 text-center">Aucun avis dans cette liste.</p>
        )}
        {list.map((r) => {
          const days = businessDaysSince(r.created_at);
          const late = r.status === "pending" && days > REVIEWS_RULES.moderationDays;
          const busy = busyId === r.id;
          return (
            <div key={r.id} data-testid={`admin-review-${r.id}`} className="rounded-2xl bg-white border border-[#eee2e5] p-4">
              <div className="flex flex-wrap justify-between gap-2 items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="font-medium text-sm">{r.display_name}</span>
                    <span className="text-[11px] text-[#8b737e]">· {(r.products && r.products.name) || `Bijou n° ${r.product_id}`} · commande n° {r.order_id}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.is_test && <span className="text-[10px] rounded-full px-2 py-0.5 bg-[#eef0f6] text-[#4a5578]">Test · jamais publié sur le site</span>}
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${late ? "bg-red-50 text-red-700" : "bg-[#f3f1f5] text-[#8b737e]"}`}>
                    Reçu le {formatDate(r.created_at)}{r.status === "pending" ? ` · ${days} j. ouvré${days > 1 ? "s" : ""}` : ""}
                  </span>
                </div>
              </div>

              {r.comment ? (
                <p className="text-sm text-[#54434c] leading-6 mt-2 whitespace-pre-line break-words">{r.comment}</p>
              ) : (
                <p className="text-[12px] text-[#8b737e] mt-2 italic">Note seule, sans commentaire.</p>
              )}

              {r.status === "refused" && (
                <div className="text-[11px] text-red-700 mt-1">Refusé le {formatDate(r.moderated_at)} · motif : {REFUSAL_REASONS[r.refusal_reason] || r.refusal_reason}{r.moderated_by_email ? ` · ${r.moderated_by_email}` : ""}</div>
              )}
              {r.status === "published" && (
                <div className="text-[11px] text-[#8b737e] mt-1">Publié le {formatDate(r.published_at)}{r.moderated_by_email ? ` · ${r.moderated_by_email}` : ""}</div>
              )}
              {r.status === "withdrawn" && <div className="text-[11px] text-[#8b737e] mt-1">Retiré par la cliente le {formatDate(r.withdrawn_at)}</div>}

              {r.reply && replyId !== r.id && (
                <div className="mt-2 rounded-xl bg-[#f8f2f4] px-3 py-2">
                  <div className="text-[11px] text-[#8f6075] flex items-center gap-1"><MessageCircle size={12} /> Réponse de Zenoria · {formatDate(r.reply_at)}</div>
                  <p className="text-sm text-[#54434c] leading-6 whitespace-pre-line break-words">{r.reply}</p>
                </div>
              )}

              {/* ACTIONS */}
              <div className="flex flex-wrap gap-2 mt-3">
                {(r.status === "pending" || r.status === "refused") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(r, "publish", {}, r.is_test ? "Avis publié (commande de test : il n'apparaîtra jamais sur le site)." : "Avis publié.")}
                    data-testid={`review-publish-${r.id}`}
                    className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-9 text-sm disabled:opacity-50"
                  >
                    Publier
                  </button>
                )}
                {(r.status === "pending" || r.status === "published") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setRefuseId(refuseId === r.id ? null : r.id); setReplyId(null); }}
                    data-testid={`review-refuse-${r.id}`}
                    className="rounded-full border border-red-200 text-red-700 px-4 h-9 text-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    {r.status === "published" ? "Dépublier (refuser)…" : "Refuser…"}
                  </button>
                )}
                {r.status === "published" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setReplyId(replyId === r.id ? null : r.id); setReplyText(r.reply || ""); setRefuseId(null); }}
                    data-testid={`review-reply-${r.id}`}
                    className="rounded-full border border-[#d9c5cc] px-4 h-9 text-sm hover:bg-[#f5edf1] disabled:opacity-50"
                  >
                    {r.reply ? "Modifier la réponse" : "Répondre"}
                  </button>
                )}
              </div>

              {refuseId === r.id && (
                <div className="mt-3 rounded-xl border border-red-100 bg-red-50/40 p-3">
                  <div className="text-xs text-[#54434c] mb-2">Motif du refus (visible par la cliente) :</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(REFUSAL_REASONS).map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        disabled={busy}
                        onClick={() => act(r, "refuse", { p_reason: code }, `Avis refusé · motif : ${label}.`)}
                        className="rounded-full border border-red-200 bg-white text-red-700 px-3 py-1 text-xs hover:bg-red-50 disabled:opacity-50"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {replyId === r.id && (
                <div className="mt-3">
                  <textarea
                    rows={3}
                    maxLength={maxChars}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Votre réponse publique, affichée sous l'avis."
                    className="w-full rounded-xl border border-[#eadfe4] focus:border-[#8f6075] px-3 py-2 text-sm leading-6 outline-none bg-white"
                  />
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <span className="text-[11px] text-[#8b737e]">{replyText.length.toLocaleString("fr-FR")} / {maxChars.toLocaleString("fr-FR")} · réponse vide = réponse retirée · non affichée en mode « étoiles seulement »</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(r, "reply", { p_reply: replyText }, replyText.trim() ? "Réponse enregistrée." : "Réponse retirée.")}
                        className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-9 text-sm disabled:opacity-50"
                      >
                        Enregistrer la réponse
                      </button>
                      <button type="button" onClick={() => setReplyId(null)} className="rounded-full border border-[#d9c5cc] px-4 h-9 text-sm hover:bg-[#f5edf1]">
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
