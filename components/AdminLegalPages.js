import React, { useCallback, useEffect, useState } from "react";
import { Star, Lock, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { REVIEWS_KEY, parseReviewsSetting, buildReviewsValue, describeReviews } from "@/lib/reviewsSettings";

// ============================================================
// CARTES « AVIS CLIENTES » ET « POLITIQUE DE CONFIDENTIALITÉ » (onglet « Contenu du site » de /admin)
// ZENORIA_STORY_REVIEWS_V1
//
// Avis clientes : un interrupteur unique, table « site_settings », clé « reviews », valeur { "enabled": true|false }.
//   ON  : avis visibles, page /charte-des-avis et lien du footer visibles ;
//   OFF : tout est masqué (/charte-des-avis renvoie 404). Les avis déjà déposés restent en base.
//   Ligne absente ou illisible : OFF (voir lib/reviewsSettings.js).
// Confidentialité : aucune action possible, la page reste toujours en ligne (obligation RGPD).
// Prérequis SQL : contrainte site_settings_reviews_valid et lecture publique de la clé « reviews ».
// ============================================================

const TIME_ZONE = "Europe/Paris";

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/site_settings_reviews_valid|violates check constraint/i.test(msg)) {
    return "La base refuse cette valeur. Vérifiez que la contrainte site_settings_reviews_valid est bien installée dans Supabase.";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages n'est pas installée. Exécutez le script supabase_site_settings.sql dans Supabase (SQL Editor).";
  }
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {
    return "Enregistrement refusé : ce compte n'a pas les droits d'administration.";
  }
  return msg;
}

export default function AdminLegalPages() {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase.from(SITE_SETTINGS_TABLE).select("*").eq("key", REVIEWS_KEY).maybeSingle();
      if (res.error) setLoadError(friendlyError(res.error));
      else setRow(res.data || null);
    } catch (err) {
      setLoadError(friendlyError(err));
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

  const enabled = parseReviewsSetting(row ? row.value : null).enabled;
  const disabled = loading || Boolean(loadError) || saving;
  const savedAt = row ? formatDateTime(row.updated_at) : null;

  const toggle = async () => {
    const next = !enabled;
    setError("");
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from(SITE_SETTINGS_TABLE)
        .upsert({ key: REVIEWS_KEY, value: buildReviewsValue({ enabled: next }) }, { onConflict: "key" });
      if (err) throw err;
      setToast(
        next
          ? "Avis clientes activés : la charte des avis est en ligne. Les visiteurs le voient au prochain chargement de la page."
          : "Avis clientes désactivés : avis et charte des avis sont masqués. Les avis déjà déposés sont conservés."
      );
      await load();
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setSaving(false);
  };

  return (
    <>
      <section data-testid="reviews-panel" className="mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-xl flex items-center gap-2">
              <Star size={18} className="text-[#8f6075]" /> Avis clientes
            </h2>
            <p className="text-xs text-[#8b737e] mt-1 leading-4">
              Un seul interrupteur pour les avis et leur charte. Activé : avis visibles, page /charte-des-avis et lien du pied de page en ligne. Désactivé : tout est masqué, les avis déjà déposés restent enregistrés.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              aria-label="Actualiser le réglage des avis"
              className="h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Avis clientes et charte des avis"
              onClick={toggle}
              disabled={disabled}
              data-testid="reviews-switch"
              className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-emerald-600" : "bg-[#d9cfd3]"}`}
            >
              <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
            </button>
          </div>
        </div>

        {toast && <div data-testid="reviews-toast" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
        {loadError && <div role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{loadError}</div>}
        {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

        {!loadError && !loading && (
          <p data-testid="reviews-saved-text" className="mt-4 text-[11px] text-[#54434c] leading-4">
            Réglage actuel : <strong className="font-medium">{describeReviews(row ? row.value : null)}</strong>
            {savedAt && (
              <span className="text-[#8b737e]">
                {" "}· modifié le {savedAt}
                {row && row.updated_by_email ? ` · ${row.updated_by_email}` : ""}
              </span>
            )}
            {!row && <span className="text-[#8b737e]"> · rien d&apos;enregistré (désactivé par défaut)</span>}
          </p>
        )}
      </section>

      <section data-testid="privacy-panel" className="mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-xl flex items-center gap-2">
              <Lock size={18} className="text-[#8f6075]" /> Politique de confidentialité
            </h2>
            <p className="text-xs text-[#8b737e] mt-1 leading-4">
              Page /confidentialite : obligatoire (RGPD), elle ne peut pas être désactivée. Son contenu se modifie dans le code (pages/confidentialite.js).
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <span className="text-[11px] rounded-full px-3 py-1 bg-[#eef0f6] text-[#4a5578]">Toujours en ligne</span>
            <a href="/confidentialite" target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#8f6075] underline underline-offset-2">
              Voir la page
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
