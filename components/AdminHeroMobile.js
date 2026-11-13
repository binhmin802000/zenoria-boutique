// ZENORIA_HERO_MOBILE_V1
import React, { useCallback, useEffect, useState } from "react";
import { supabase, getMediaUrl, PRODUCT_MEDIA_BUCKET, SITE_MEDIA_TABLE, SITE_SLOT_HERO_VIDEO } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import {
  HERO_MOBILE_KEY,
  DEFAULT_HERO_MOBILE,
  DEFAULT_VISITS,
  LABEL_STILL,
  LABEL_AUTOPLAY,
  parseHeroMobileSetting,
  buildHeroMobileValue,
  describeHeroMobileSetting,
  parseVisitsInput,
  splitStoragePath,
  sizeFromStorageList,
  heroPosterPath,
  estimateHeroEgress,
  heroEgressSummary,
  heroMobileErrorMessage,
  isDuplicateKeyError,
} from "@/lib/heroMobileSettings";
// ============================================================
// CARTE « VIDÉO D'ACCUEIL SUR MOBILE » (onglet « Contenu du site » de /admin, groupe « Vitrine & ambiance »)
//
// Un seul réglage : sur écran étroit (moins de 768 px), la vidéo d'accueil s'affiche en image fixe avec un bouton ▶ (par défaut,
// la vidéo n'est téléchargée que si la visiteuse appuie) ou démarre automatiquement. Enregistré dans la ligne « hero_mobile » de
// site_settings (créée au premier enregistrement). Ligne absente ou illisible : image fixe + ▶.
// Ce réglage ne passe jamais outre « économie de données », une connexion 2G ou « réduire les animations » de la visiteuse.
//
// Le bloc de chiffres lit les poids réels de la vidéo et de son image fixe : liste Supabase Storage, sinon en-tête Content-Length d'une
// requête HEAD (aucun octet de média n'est téléchargé). Le nombre de visites est une simulation, jamais enregistrée.
// L'écriture ne réussit que si la ligne n'a pas changé depuis son affichage (comparaison sur updated_at), comme les autres cartes.
// ============================================================
function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Taille d'un fichier public sans le télécharger : en-tête Content-Length d'une requête HEAD
async function headSize(path) {
  try {
    const res = await fetch(getMediaUrl(path, "site"), { method: "HEAD" });
    if (!res.ok) return null;
    const n = Number(res.headers.get("content-length"));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) {
    return null;
  }
}

// Poids (octets) de la vidéo d'accueil et de son image fixe : { video, poster } (null si inconnu)
async function readHeroSizes(videoPath) {
  const v = splitStoragePath(videoPath);
  if (!v) return { video: null, poster: null };
  const posterPath = heroPosterPath(videoPath);
  const p = posterPath ? splitStoragePath(posterPath) : null;
  let items = null;
  try {
    const res = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).list(v.dir, { limit: 100 });
    if (!res.error && Array.isArray(res.data)) items = res.data;
  } catch (e) {
    items = null;
  }
  let video = sizeFromStorageList(items, v.name);
  let poster = p ? sizeFromStorageList(items, p.name) : null;
  if (video === null) video = await headSize(videoPath);
  if (poster === null && posterPath) poster = await headSize(posterPath);
  return { video, poster };
}

export default function AdminHeroMobile() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [row, setRow] = useState(null); // ligne enregistrée { value, updated_at, updated_by_email } ou null
  const [heroPath, setHeroPath] = useState(null); // chemin de la vidéo d'accueil dédiée, ou null
  const [reloadTick, setReloadTick] = useState(0);
  const [sizes, setSizes] = useState({ state: "none", video: null, poster: null }); // none | loading | done
  const [autoplay, setAutoplay] = useState(DEFAULT_HERO_MOBILE.autoplay);
  const [visitsText, setVisitsText] = useState(String(DEFAULT_VISITS));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "ok" | "error", text }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [s, m] = await Promise.all([
        supabase.from(SITE_SETTINGS_TABLE).select("value, updated_at, updated_by_email").eq("key", HERO_MOBILE_KEY).maybeSingle(),
        supabase.from(SITE_MEDIA_TABLE).select("path").eq("slot", SITE_SLOT_HERO_VIDEO).maybeSingle(),
      ]);
      if (s.error) throw s.error;
      const saved = s.data || null;
      const cfg = parseHeroMobileSetting(saved ? saved.value : null);
      setRow(saved);
      setAutoplay(cfg.autoplay);
      setHeroPath(m && !m.error && m.data && m.data.path ? m.data.path : null);
      setReloadTick((t) => t + 1);
    } catch (e) {
      setLoadError(heroMobileErrorMessage(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poids des fichiers : lus après l'affichage de la carte, sans la bloquer
  useEffect(() => {
    let cancelled = false;
    if (!heroPath) {
      setSizes({ state: "none", video: null, poster: null });
      return undefined;
    }
    setSizes({ state: "loading", video: null, poster: null });
    readHeroSizes(heroPath).then((r) => {
      if (!cancelled) setSizes({ state: "done", video: r.video, poster: r.poster });
    });
    return () => {
      cancelled = true;
    };
  }, [heroPath, reloadTick]);

  const saved = parseHeroMobileSetting(row ? row.value : null);
  const dirty = autoplay !== saved.autoplay;
  const canSave = !busy && !loading && !loadError && dirty;
  const visits = parseVisitsInput(visitsText);
  const estimate = sizes.state === "done" ? estimateHeroEgress({ videoBytes: sizes.video, posterBytes: sizes.poster, visits: visits.ok ? visits.visits : null }) : null;
  const summary = heroEgressSummary(autoplay, estimate);

  const save = async () => {
    if (busy) return;
    const value = buildHeroMobileValue(autoplay);
    setBusy(true);
    setNotice(null);
    try {
      if (row) {
        const res = await supabase
          .from(SITE_SETTINGS_TABLE)
          .update({ value })
          .eq("key", HERO_MOBILE_KEY)
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
        const res = await supabase.from(SITE_SETTINGS_TABLE).insert({ key: HERO_MOBILE_KEY, value });
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
      setNotice({ type: "ok", text: "Réglage enregistré. Les visiteuses le voient au prochain chargement de la page." });
      await load();
    } catch (e) {
      setNotice({ type: "error", text: heroMobileErrorMessage(e) });
    }
    setBusy(false);
  };

  const reset = () => {
    setAutoplay(saved.autoplay);
    setNotice(null);
  };

  const optionClass = (active) =>
    "flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer " + (active ? "border-[#8f6075] bg-[#f5edf1]" : "border-[#eadfe4] bg-white");

  return (
    <section data-testid="hero-mobile-card" className="rounded-2xl border border-[#eadfe4] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-lg text-[#412f3b]">Vidéo d&apos;accueil sur mobile</h3>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Comportement de la vidéo de la bannière sur écran étroit (moins de 768 px). Sur ordinateur, la vidéo démarre toujours.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || busy}
          data-testid="hero-mobile-reload"
          className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] text-xs px-3 h-8 disabled:opacity-60"
        >
          Actualiser
        </button>
      </div>

      {loading && !row && !loadError && (
        <p data-testid="hero-mobile-loading" className="mt-4 text-sm text-[#8b737e]">Chargement du réglage…</p>
      )}
      {loadError && (
        <div role="alert" data-testid="hero-mobile-load-error" className="mt-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">
          {loadError}
        </div>
      )}

      {!loadError && (!loading || row) && (
        <div className="mt-4 space-y-4">
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="sr-only">Vidéo d&apos;accueil sur écran étroit</legend>
            <label className={optionClass(!autoplay)}>
              <input
                type="radio"
                name="hero-mobile-mode"
                checked={!autoplay}
                onChange={() => {
                  setAutoplay(false);
                  setNotice(null);
                }}
                data-testid="hero-mobile-still"
                className="mt-1 accent-[#8f6075]"
              />
              <span className="text-sm text-[#54434c]">
                <span className="block font-medium">{LABEL_STILL} (recommandé)</span>
                <span className="block text-xs text-[#8b737e] mt-0.5">La vidéo ne se charge que si la visiteuse appuie sur ▶.</span>
              </span>
            </label>
            <label className={optionClass(autoplay)}>
              <input
                type="radio"
                name="hero-mobile-mode"
                checked={autoplay}
                onChange={() => {
                  setAutoplay(true);
                  setNotice(null);
                }}
                data-testid="hero-mobile-autoplay"
                className="mt-1 accent-[#8f6075]"
              />
              <span className="text-sm text-[#54434c]">
                <span className="block font-medium">{LABEL_AUTOPLAY}</span>
                <span className="block text-xs text-[#8b737e] mt-0.5">La vidéo se télécharge dès l&apos;arrivée sur la page.</span>
              </span>
            </label>
          </fieldset>

          <p className="text-[11px] text-[#8b737e] leading-4">
            Une visiteuse qui a activé « économie de données » ou « réduire les animations », ou dont la connexion est en 2G, voit toujours l&apos;image fixe, quel que soit ce réglage.
          </p>

          {!heroPath ? (
            <p data-testid="hero-mobile-no-video" className="rounded-xl bg-amber-50 text-amber-800 text-sm px-4 py-3">
              Aucune vidéo d&apos;accueil dédiée n&apos;est enregistrée : tant que c&apos;est le cas, ce réglage est sans effet (le site affiche la vidéo de la première collection).
            </p>
          ) : (
            <div data-testid="hero-mobile-egress" className="rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3 space-y-2" aria-live="polite">
              {sizes.state !== "done" ? (
                <p className="text-sm text-[#8b737e]">Lecture du poids des fichiers…</p>
              ) : (
                <>
                  <p data-testid="hero-mobile-headline" className="text-base font-semibold text-[#8f6075]">{summary.headline}</p>
                  <p data-testid="hero-mobile-detail" className="text-xs text-[#54434c] leading-4">{summary.detail}</p>
                </>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label htmlFor="hero-mobile-visits" className="text-xs text-[#54434c]">Visites mobiles estimées</label>
                <input
                  id="hero-mobile-visits"
                  type="text"
                  inputMode="numeric"
                  maxLength={7}
                  value={visitsText}
                  onChange={(e) => setVisitsText(e.target.value)}
                  aria-invalid={!visits.ok}
                  data-testid="hero-mobile-visits"
                  className={"w-28 rounded-full border bg-white px-3 h-9 text-sm outline-none focus:border-[#8f6075] " + (visits.ok ? "border-[#eadfe4]" : "border-red-400")}
                />
                <span className="text-[11px] text-[#8b737e]">simulation, non enregistrée</span>
              </div>
              {!visits.ok && (
                <p role="alert" data-testid="hero-mobile-visits-error" className="text-xs text-red-600">{visits.error}</p>
              )}
              <p className="text-[11px] text-[#8b737e] leading-4">
                Estimation du premier passage sur un appareil : les médias sont ensuite mis en cache un an.
              </p>
            </div>
          )}

          <p data-testid="hero-mobile-current" className="text-[11px] text-[#8b737e] leading-4">
            {row ? (
              <>
                Réglage enregistré : {describeHeroMobileSetting(row.value)}
                {row.updated_at ? " — modifié le " + formatWhen(row.updated_at) : ""}
                {row.updated_by_email ? " par " + row.updated_by_email : ""}.
              </>
            ) : (
              <>Aucun réglage enregistré : le site applique {describeHeroMobileSetting(null)} (valeur par défaut).</>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              data-testid="hero-mobile-save"
              className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy || !dirty}
              data-testid="hero-mobile-cancel"
              className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Annuler les modifications
            </button>
          </div>

          <div aria-live="polite">
            {notice && (
              <div
                data-testid="hero-mobile-notice"
                data-type={notice.type}
                className={"rounded-xl text-sm px-4 py-3 " + (notice.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}
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
