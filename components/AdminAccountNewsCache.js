// ZENORIA_ACCOUNT_NEWS_BADGE_V1
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import {
  ACCOUNT_NEWS_CACHE_KEY,
  ACCOUNT_NEWS_CACHE_MIN_MINUTES,
  ACCOUNT_NEWS_CACHE_MAX_MINUTES,
  DEFAULT_ACCOUNT_NEWS_CACHE,
  parseAccountNewsCacheSetting,
  parseMinutesInput,
  buildAccountNewsCacheValue,
  sameAccountNewsCacheSetting,
  describeAccountNewsCacheSetting,
  accountNewsCacheErrorMessage,
  isDuplicateKeyError,
} from "@/lib/accountNewsCacheSettings";
// ============================================================
// CARTE « PASTILLE DE NOUVEAUTÉS SUR TOUTES LES PAGES » (onglet « Contenu du site » de /admin,
// groupe « Vitrine & ambiance »), sur le meme gabarit que la carte « Badge Nouveauté ».
//
// Deux reglages, dans la ligne « account_news_cache » de site_settings (creee au premier
// enregistrement) :
//  - l'interrupteur : etend (ou non) la pastille deja en production dans Mon compte a l'Accueil
//    et au quiz. Coupe cette extension UNIQUEMENT : la pastille de Mon compte n'est jamais touchee.
//  - la duree de cache (minutes) : le temps pendant lequel l'Accueil et le quiz reutilisent la
//    derniere lecture au lieu d'en refaire une, pour limiter les appels reseau.
//
// L'ecriture ne reussit que si la ligne n'a pas change depuis son affichage (comparaison sur
// updated_at), comme les autres reglages simples (badge Nouveaute, ordre des bijoux).
// ============================================================
function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminAccountNewsCache() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [row, setRow] = useState(null); // ligne enregistree { value, updated_at, updated_by_email } ou null
  const [enabled, setEnabled] = useState(DEFAULT_ACCOUNT_NEWS_CACHE.enabled);
  const [minutesText, setMinutesText] = useState(String(DEFAULT_ACCOUNT_NEWS_CACHE.minutes));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "ok" | "error", text }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase.from(SITE_SETTINGS_TABLE).select("value, updated_at, updated_by_email").eq("key", ACCOUNT_NEWS_CACHE_KEY).maybeSingle();
      if (res.error) throw res.error;
      const saved = res.data || null;
      const cfg = parseAccountNewsCacheSetting(saved ? saved.value : null);
      setRow(saved);
      setEnabled(cfg.enabled);
      setMinutesText(String(cfg.minutes));
    } catch (e) {
      setLoadError(accountNewsCacheErrorMessage(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saved = parseAccountNewsCacheSetting(row ? row.value : null);
  const parsed = parseMinutesInput(minutesText);
  const draftValue = parsed.ok ? buildAccountNewsCacheValue(enabled, parsed.minutes) : null;
  const dirty = Boolean(draftValue) && !sameAccountNewsCacheSetting(draftValue, row ? row.value : null);
  const canSave = !busy && !loading && !loadError && dirty;

  const save = async () => {
    if (busy) return;
    const check = parseMinutesInput(minutesText);
    if (!check.ok) {
      setNotice({ type: "error", text: check.error });
      return;
    }
    const value = buildAccountNewsCacheValue(enabled, check.minutes);
    setBusy(true);
    setNotice(null);
    try {
      if (row) {
        const res = await supabase
          .from(SITE_SETTINGS_TABLE)
          .update({ value })
          .eq("key", ACCOUNT_NEWS_CACHE_KEY)
          .eq("updated_at", row.updated_at)
          .select("key");
        if (res.error) throw res.error;
        if (!Array.isArray(res.data) || res.data.length !== 1) {
          setNotice({ type: "error", text: "Le réglage n'a pas été modifié : il a changé entre-temps (autre écran ou autre session). Les valeurs ont été relues, vérifiez puis recommencez." });
          await load();
          setBusy(false);
          return;
        }
      } else {
        const res = await supabase.from(SITE_SETTINGS_TABLE).insert({ key: ACCOUNT_NEWS_CACHE_KEY, value });
        if (res.error) {
          if (isDuplicateKeyError(res.error)) {
            setNotice({ type: "error", text: "Le réglage vient d'être créé depuis un autre écran. Les valeurs ont été relues, vérifiez puis recommencez." });
            await load();
            setBusy(false);
            return;
          }
          throw res.error;
        }
      }
      setNotice({ type: "ok", text: "Réglage enregistré. Il s'applique au prochain chargement de page, sans redéploiement." });
      await load();
    } catch (e) {
      setNotice({ type: "error", text: accountNewsCacheErrorMessage(e) });
    }
    setBusy(false);
  };

  const reset = () => {
    setEnabled(saved.enabled);
    setMinutesText(String(saved.minutes));
    setNotice(null);
  };

  return (
    <section data-testid="account-news-cache-card" className="rounded-2xl border border-[#eadfe4] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-lg text-[#412f3b]">Pastille de nouveautés sur toutes les pages</h3>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Étend à l&apos;Accueil et au quiz la pastille déjà affichée dans Mon compte. Sans effet sur Mon compte, qui garde sa propre lecture.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || busy}
          data-testid="account-news-cache-reload"
          className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] text-xs px-3 h-8 disabled:opacity-60"
        >
          Actualiser
        </button>
      </div>
      {loading && !row && !loadError && (
        <p data-testid="account-news-cache-loading" className="mt-4 text-sm text-[#8b737e]">Chargement du réglage…</p>
      )}
      {loadError && (
        <div role="alert" data-testid="account-news-cache-load-error" className="mt-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">
          {loadError}
        </div>
      )}
      {!loadError && !loading && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Étendre la pastille à toutes les pages"
              data-testid="account-news-cache-enabled"
              onClick={() => setEnabled((v) => !v)}
              disabled={busy}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${enabled ? "bg-[#8f6075]" : "bg-[#d9c5cc]"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
            <span className="text-sm text-[#54434c]">{enabled ? "Pastille étendue à toutes les pages" : "Pastille limitée à Mon compte"}</span>
          </div>
          <div>
            <label htmlFor="account-news-cache-minutes" className="block text-sm text-[#54434c] mb-1">
              Durée de cache, en minutes
            </label>
            <div className="flex items-center gap-2">
              <input
                id="account-news-cache-minutes"
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={minutesText}
                onChange={(e) => {
                  setMinutesText(e.target.value);
                  setNotice(null);
                }}
                disabled={busy || !enabled}
                aria-invalid={!parsed.ok}
                data-testid="account-news-cache-minutes"
                className={`w-24 rounded-full border bg-white px-3 h-10 text-sm outline-none focus:border-[#8f6075] disabled:opacity-60 ${parsed.ok ? "border-[#eadfe4]" : "border-red-400"}`}
              />
              <span className="text-xs text-[#8b737e]">de {ACCOUNT_NEWS_CACHE_MIN_MINUTES} à {ACCOUNT_NEWS_CACHE_MAX_MINUTES} min (15 par défaut)</span>
            </div>
            {!parsed.ok && (
              <p role="alert" data-testid="account-news-cache-minutes-error" className="text-xs text-red-600 mt-1.5">{parsed.error}</p>
            )}
            {!enabled && <p className="text-[11px] text-[#8b737e] mt-1.5">La durée est conservée même quand l&apos;extension est désactivée.</p>}
          </div>
          <p data-testid="account-news-cache-current" className="text-[11px] text-[#8b737e] leading-4">
            {row ? (
              <>
                Réglage enregistré : {describeAccountNewsCacheSetting(row.value)}
                {row.updated_at ? " — modifié le " + formatWhen(row.updated_at) : ""}
                {row.updated_by_email ? " par " + row.updated_by_email : ""}.
              </>
            ) : (
              <>Aucun réglage enregistré : le site applique les valeurs par défaut ({describeAccountNewsCacheSetting(null)}).</>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              data-testid="account-news-cache-save"
              className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy || (!dirty && parsed.ok)}
              data-testid="account-news-cache-cancel"
              className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Annuler les modifications
            </button>
          </div>
          <div aria-live="polite">
            {notice && (
              <div
                data-testid="account-news-cache-notice"
                data-type={notice.type}
                className={`rounded-xl text-sm px-4 py-3 ${notice.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
              >
                {notice.text}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
