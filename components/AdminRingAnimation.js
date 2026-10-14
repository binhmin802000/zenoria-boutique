import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Upload, Trash2, RefreshCw } from "lucide-react";
import { supabase, getMediaUrl, saveSiteMedia, clearSiteMedia, deleteProductMedia, SITE_MEDIA_TABLE } from "@/lib/supabase";
import { MEDIA_BUCKET } from "@/lib/orphanFiles";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import {
  RING_SETTING_KEY,
  RING_SLOT,
  RING_SPEEDS,
  RING_MODES,
  RING_HEART_COLORS,
  DEFAULT_RING_PHOTO,
  DEFAULT_RING_SETTING,
  parseRingSetting,
  buildRingSettingValue,
  sameRingSetting,
  speedValue,
  ringColorFromPath,
  buildRingPath,
  resolveHeartColor,
  currentSeasonKey,
  describeRingSetting,
} from "@/lib/ringSettings";
import { DEFAULT_CUTOUT, cutoutRing, loadWorkImage, drawRgba, rgbaToPngBlob } from "@/lib/ringCutout";
import RingHandsVideo from "@/components/RingHandsVideo";

// ============================================================
// CARTE « ANIMATION LE GESTE » (onglet « Contenu du site » de /admin)
//
// Quatre réglages pour l'animation des deux mains, affichée sous la section Savoir-faire :
//  - la PHOTO de la bague (détourée dans le navigateur ; seul le PNG détouré est envoyé)
//  - la COULEUR du cœur : celle de la bague, ou celle de la saison active
//  - la VITESSE : lent, normal, rapide
//  - la LECTURE : une fois puis reste affichée, en boucle, ou disparaît après la lecture
//
// Les réglages sont enregistrés dans « site_settings » (clé « ring_animation »), la photo dans « site_media »
// (emplacement « ring_animation_photo »). Voir supabase_ring_animation.sql.
// Tant que rien n'est enregistré, le site garde la bague par défaut et les réglages recommandés.
// ============================================================

const MAX_ORIGINAL_MB = 30;
const TIME_ZONE = "Europe/Paris";
const SEASON_KEYS = ["printemps", "ete", "automne", "hiver"];
const CHECKER = { background: "repeating-conic-gradient(#e9e1e5 0% 25%, #ffffff 0% 50%) 50% / 16px 16px" };

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/mime|invalid_mime_type|not supported/i.test(msg)) {
    return "Le stockage refuse les fichiers PNG. Dans Supabase, ouvrez Storage > product-media et autorisez « image/png » (voir supabase_ring_animation_checks.sql).";
  }
  if (/site_media_slot_check|violates check constraint/i.test(msg)) {
    return "Ce troisième emplacement n'est pas encore autorisé : exécutez le script supabase_ring_animation.sql dans Supabase (SQL Editor).";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "Une table du site est introuvable. Exécutez le script supabase_ring_animation.sql dans Supabase (SQL Editor).";
  }
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {
    return "Enregistrement refusé : ce compte n'a pas les droits d'administration.";
  }
  return msg;
}

function Radio({ name, active, disabled, onChange, testId, title, badge, text }) {
  return (
    <label
      className={`flex gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ${
        active ? "border-[#8f6075] bg-[#faf6f8]" : "border-[#eee2e5] hover:bg-[#faf6f8]"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <input
        type="radio"
        name={name}
        checked={active}
        disabled={disabled}
        onChange={onChange}
        data-testid={testId}
        className="mt-1 h-4 w-4 shrink-0 accent-[#8f6075]"
      />
      <span className="min-w-0">
        <span className="text-sm font-medium">
          {title}
          {badge && <span className="ml-2 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-normal">{badge}</span>}
        </span>
        {text && <span className="block text-xs text-[#70656a] leading-5 mt-0.5">{text}</span>}
      </span>
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, testId, suffix }) {
  return (
    <label className="block text-xs text-[#54434c]">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-[#8b737e]">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
        className="w-full accent-[#8f6075]"
      />
    </label>
  );
}

export default function AdminRingAnimation() {
  const [settingRow, setSettingRow] = useState(null);
  const [photoRow, setPhotoRow] = useState(null);
  const [accents, setAccents] = useState({});
  const [draft, setDraft] = useState(DEFAULT_RING_SETTING);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  // détourage en cours : photo de travail + réglages, puis résultat calculé
  const [cutInput, setCutInput] = useState(null); // { work, name, mode, sat, circle }
  const [cutResult, setCutResult] = useState(null); // { ok, rgba, size, color } ou { ok: false, reason }
  const [cutLoading, setCutLoading] = useState(false);
  const resultCanvas = useRef(null);
  const sourceCanvas = useRef(null);
  const drawnWork = useRef(null); // photo de travail déjà dessinée dans « Votre photo »

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [setRes, mediaRes, famRes] = await Promise.all([
        supabase.from(SITE_SETTINGS_TABLE).select("*").eq("key", RING_SETTING_KEY).maybeSingle(),
        supabase.from(SITE_MEDIA_TABLE).select("*").eq("slot", RING_SLOT).maybeSingle(),
        supabase.from("families").select("key, accent").in("key", SEASON_KEYS),
      ]);
      if (setRes.error) {
        setLoadError(friendlyError(setRes.error));
      } else {
        const saved = setRes.data || null;
        setSettingRow(saved);
        setDraft(parseRingSetting(saved ? saved.value : null));
      }
      if (mediaRes.error) setLoadError((prev) => prev || friendlyError(mediaRes.error));
      else setPhotoRow(mediaRes.data || null);
      const map = {};
      ((famRes && famRes.data) || []).forEach((f) => {
        if (f && f.accent) map[f.key] = f.accent;
      });
      setAccents(map);
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

  // ---- Calcul du détourage (légèrement différé pendant qu'on déplace un curseur) ----
  useEffect(() => {
    if (!cutInput) {
      setCutResult(null);
      return undefined;
    }
    const t = setTimeout(() => {
      try {
        setCutResult(cutoutRing(cutInput.work, { mode: cutInput.mode, sat: cutInput.sat, circle: cutInput.circle }));
      } catch (err) {
        setCutResult({ ok: false, reason: "Le détourage a échoué : " + ((err && err.message) || err) });
      }
    }, 130);
    return () => clearTimeout(t);
  }, [cutInput]);

  useEffect(() => {
    if (cutResult && cutResult.ok && resultCanvas.current) drawRgba(resultCanvas.current, cutResult.rgba, cutResult.size);
  }, [cutResult]);

  useEffect(() => {
    const cv = sourceCanvas.current;
    if (!cutInput || !cv) return;
    const { work } = cutInput;
    if (drawnWork.current !== work) {
      drawnWork.current = work;
      cv.width = work.width;
      cv.height = work.height;
      cv.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(work.data), work.width, work.height), 0, 0);
    }
  }, [cutInput]);

  // ---- Choix de la photo ----
  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError(`« ${file.name} » n'est pas une image.`);
      return;
    }
    if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) {
      setError(`« ${file.name} » dépasse ${MAX_ORIGINAL_MB} Mo.`);
      return;
    }
    setCutLoading(true);
    try {
      const work = await loadWorkImage(file);
      setCutInput({ work, name: file.name, mode: DEFAULT_CUTOUT.mode, sat: DEFAULT_CUTOUT.sat, circle: { ...DEFAULT_CUTOUT.circle } });
    } catch (err) {
      setError("Lecture de la photo impossible : " + ((err && err.message) || err));
    }
    setCutLoading(false);
  };

  const patchCut = (patch) => setCutInput((prev) => (prev ? { ...prev, ...patch } : prev));
  const patchCircle = (patch) => setCutInput((prev) => (prev ? { ...prev, circle: { ...prev.circle, ...patch } } : prev));
  const placeCircle = (e) => {
    if (!cutInput || cutInput.mode !== "circle") return;
    const r = e.currentTarget.getBoundingClientRect();
    patchCircle({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };

  // ---- Envoi de la bague détourée : stockage -> table -> suppression de l'ancien fichier ----
  const publishCut = async () => {
    if (!cutResult || !cutResult.ok) return;
    setBusy(true);
    setError("");
    try {
      const blob = await rgbaToPngBlob(cutResult.rgba, cutResult.size);
      const oldPath = photoRow ? photoRow.path : null;
      const path = buildRingPath(cutResult.color, Date.now());
      const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: "image/png", cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      const { error: saveErr } = await saveSiteMedia(RING_SLOT, path);
      if (saveErr) {
        await deleteProductMedia(path); // on ne garde pas un fichier orphelin
        throw saveErr;
      }
      if (oldPath && oldPath !== path) deleteProductMedia(oldPath); // libère l'espace du quota
      setCutInput(null);
      setToast("Bague enregistrée. Les visiteurs la voient au prochain chargement de la page.");
      await load();
    } catch (err) {
      setError("Échec de l'envoi de la bague : " + friendlyError(err));
    }
    setBusy(false);
  };

  const removePhoto = async () => {
    if (!photoRow) return;
    if (!window.confirm("Retirer cette bague ? L'animation reviendra à la bague par défaut.")) return;
    setBusy(true);
    setError("");
    try {
      const { error: delErr } = await clearSiteMedia(RING_SLOT);
      if (delErr) throw delErr;
      deleteProductMedia(photoRow.path);
      setToast("Bague retirée : l'animation utilise de nouveau la bague par défaut.");
      await load();
    } catch (err) {
      setError("Échec de la suppression : " + friendlyError(err));
    }
    setBusy(false);
  };

  // ---- Enregistrement des réglages ----
  const saved = useMemo(() => parseRingSetting(settingRow ? settingRow.value : null), [settingRow]);
  const dirty = !sameRingSetting(draft, saved);
  const disabled = loading || Boolean(loadError) || saving || busy;

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const { error: err } = await supabase.from(SITE_SETTINGS_TABLE).upsert({ key: RING_SETTING_KEY, value: buildRingSettingValue(draft) }, { onConflict: "key" });
      if (err) throw err;
      setToast("Réglages enregistrés. Les visiteurs les voient au prochain chargement de la page.");
      await load();
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setSaving(false);
  };

  // ---- Aperçu en direct ----
  const photoUrl = photoRow ? getMediaUrl(photoRow.path, "site") : DEFAULT_RING_PHOTO;
  const ringColor = ringColorFromPath(photoRow ? photoRow.path : null);
  const seasonKey = currentSeasonKey(new Date());
  const heartColor = resolveHeartColor(draft, ringColor, accents[seasonKey]);
  const savedAt = settingRow ? formatDateTime(settingRow.updated_at) : null;

  return (
    <section data-testid="ring-anim-panel" className="mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <Heart size={18} className="text-[#8f6075]" /> Animation « Le geste »
          </h2>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Deux mains, une bague, puis un cœur : affichée sous la section Savoir-faire. Choisissez la bague, la couleur du cœur, la vitesse et le mode de lecture.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Actualiser les réglages de l'animation"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {toast && <div data-testid="ring-anim-toast" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {loadError && <div data-testid="ring-anim-load-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{loadError}</div>}
      {error && <div data-testid="ring-anim-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

      {/* 1. LA BAGUE */}
      <h3 className="font-serif text-lg mt-6">1. La bague</h3>
      <div className="flex items-center gap-4 mt-3">
        <div className="h-28 w-28 shrink-0 rounded-2xl border border-[#eee2e5] grid place-items-center" style={CHECKER}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="Bague de l'animation" data-testid="ring-anim-current" className="h-24 w-24 object-contain" />
        </div>
        <div className="min-w-0 text-[11px] text-[#54434c] space-y-1">
          {photoRow ? (
            <>
              <p className="text-sm text-[#412f3b]">Bague personnalisée</p>
              {formatDateTime(photoRow.updated_at || photoRow.created_at) && (
                <p className="text-[#8b737e]">
                  Enregistrée le {formatDateTime(photoRow.updated_at || photoRow.created_at)}
                  {photoRow.updated_by_email || photoRow.created_by_email ? ` · ${photoRow.updated_by_email || photoRow.created_by_email}` : ""}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-[#8b737e]">
                Couleur dominante : <i className="inline-block h-3.5 w-3.5 rounded-full border border-white shadow" style={{ background: ringColor }} /> {ringColor}
              </p>
            </>
          ) : (
            <p className="text-[#8b737e] leading-4" data-testid="ring-anim-default">
              Aucune bague choisie : l&apos;animation utilise la bague par défaut (collection Bleu).
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <label
          className={`inline-flex items-center gap-2 rounded-full px-5 h-10 text-sm cursor-pointer ${
            disabled || cutLoading ? "bg-[#d9c5cc] text-white cursor-not-allowed" : "bg-[#8f6075] hover:bg-[#71485b] text-white"
          }`}
        >
          <Upload size={15} />
          {cutLoading ? "Lecture de la photo..." : photoRow ? "Remplacer la bague" : "Choisir une photo de bague"}
          <input type="file" accept="image/*" disabled={disabled || cutLoading} onChange={onPick} data-testid="ring-anim-file" className="hidden" />
        </label>
        {photoRow && (
          <button
            type="button"
            onClick={removePhoto}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] text-red-600 px-4 h-10 text-sm disabled:opacity-60"
          >
            <Trash2 size={14} /> Revenir à la bague par défaut
          </button>
        )}
      </div>
      <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
        Photo de la bague de face, sur un fond clair et uni. Le fond est retiré dans votre navigateur : seule la bague détourée (environ 100 Ko) est envoyée, jamais votre photo d&apos;origine.
      </p>

      {/* Détourage */}
      {cutInput && (
        <div data-testid="ring-anim-cut" className="mt-5 rounded-2xl border border-[#d9c5cc] bg-[#fdfbfc] p-4">
          <div className="font-serif text-lg">Détourer la bague</div>
          <p className="text-[11px] text-[#8b737e] mt-0.5 leading-4">Photo : {cutInput.name}</p>

          <div className="grid sm:grid-cols-2 gap-5 mt-4">
            <div>
              <div className="text-xs text-[#54434c] mb-1.5">Votre photo{cutInput.mode === "circle" ? " (touchez la bague pour placer le cercle)" : ""}</div>
              <div className="relative rounded-xl overflow-hidden border border-[#eee2e5] bg-white mx-auto" style={{ maxWidth: 300, cursor: cutInput.mode === "circle" ? "crosshair" : "default" }} onClick={placeCircle}>
                <canvas ref={sourceCanvas} className="block w-full h-auto" />
                {cutInput.mode === "circle" && (
                  <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                    <ellipse
                      cx={cutInput.circle.x}
                      cy={cutInput.circle.y}
                      rx={(cutInput.circle.d * Math.min(cutInput.work.width, cutInput.work.height)) / 2 / cutInput.work.width}
                      ry={(cutInput.circle.d * Math.min(cutInput.work.width, cutInput.work.height)) / 2 / cutInput.work.height}
                      fill="none"
                      stroke="#8f6075"
                      vectorEffect="non-scaling-stroke"
                      style={{ strokeWidth: 2 }}
                    />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#54434c] mb-1.5">Résultat (damier = transparent)</div>
              <div className="rounded-xl border border-[#eee2e5] grid place-items-center h-[200px]" style={CHECKER}>
                {cutResult && cutResult.ok ? (
                  <canvas ref={resultCanvas} data-testid="ring-anim-result" className="h-44 w-44" />
                ) : (
                  <span className="text-[11px] text-[#8b737e] px-4 text-center leading-4">{cutResult ? cutResult.reason : "Calcul en cours..."}</span>
                )}
              </div>
              {cutResult && cutResult.ok && (
                <p className="flex items-center gap-1.5 text-[11px] text-[#54434c] mt-2">
                  Couleur du cœur proposée : <i className="inline-block h-3.5 w-3.5 rounded-full border border-white shadow" style={{ background: cutResult.color }} /> {cutResult.color}
                </p>
              )}
            </div>
          </div>

          <div role="radiogroup" aria-label="Mode de détourage" className="flex flex-wrap gap-2 mt-4">
            {[
              { id: "auto", label: "Automatique" },
              { id: "circle", label: "Cercle manuel" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => patchCut({ mode: m.id })}
                aria-pressed={cutInput.mode === m.id}
                data-testid={`cut-mode-${m.id}`}
                className={`rounded-full px-4 h-9 text-sm border ${cutInput.mode === m.id ? "bg-[#8f6075] text-white border-[#8f6075]" : "border-[#d9c5cc] hover:bg-[#f5edf1]"}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            {cutInput.mode === "auto" ? (
              <Slider label="Sensibilité" value={Math.round(cutInput.sat * 100)} min={10} max={40} step={1} suffix=" %" testId="cut-sat" onChange={(v) => patchCut({ sat: v / 100 })} />
            ) : (
              <>
                <Slider label="Position horizontale" value={Math.round(cutInput.circle.x * 100)} min={0} max={100} step={1} suffix=" %" testId="cut-x" onChange={(v) => patchCircle({ x: v / 100 })} />
                <Slider label="Position verticale" value={Math.round(cutInput.circle.y * 100)} min={0} max={100} step={1} suffix=" %" testId="cut-y" onChange={(v) => patchCircle({ y: v / 100 })} />
                <Slider label="Taille du cercle" value={Math.round(cutInput.circle.d * 100)} min={10} max={100} step={1} suffix=" %" testId="cut-d" onChange={(v) => patchCircle({ d: v / 100 })} />
              </>
            )}
          </div>
          <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
            {cutInput.mode === "auto"
              ? "Si des morceaux de la bague manquent, baissez la sensibilité. Si le fond reste visible, ou si le résultat n'est pas la bague, passez au cercle manuel."
              : "Placez le cercle juste autour de la bague : le fond à l'extérieur du cercle est retiré."}
          </p>

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={publishCut}
              disabled={busy || !cutResult || !cutResult.ok}
              data-testid="cut-publish"
              className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]"
            >
              {busy ? "Envoi en cours..." : "Utiliser cette bague"}
            </button>
            <button type="button" onClick={() => setCutInput(null)} disabled={busy} className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-10 text-sm disabled:opacity-60">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* 2. COULEUR DU CŒUR */}
      <h3 className="font-serif text-lg mt-7">2. Couleur du cœur et des étincelles</h3>
      <div role="radiogroup" aria-label="Couleur du cœur" className="mt-3 space-y-2.5">
        {RING_HEART_COLORS.map((c) => (
          <Radio
            key={c.id}
            name="ring-heart-color"
            active={draft.heart_color === c.id}
            disabled={disabled}
            onChange={() => setDraft((d) => ({ ...d, heart_color: c.id }))}
            testId={`ring-heart-${c.id}`}
            title={c.title}
            badge={c.badge}
            text={c.text}
          />
        ))}
      </div>

      {/* 3. VITESSE */}
      <h3 className="font-serif text-lg mt-7">3. Vitesse</h3>
      <div role="radiogroup" aria-label="Vitesse de l'animation" className="mt-3 grid sm:grid-cols-3 gap-2.5">
        {RING_SPEEDS.map((s) => (
          <Radio
            key={s.id}
            name="ring-speed"
            active={draft.speed === s.id}
            disabled={disabled}
            onChange={() => setDraft((d) => ({ ...d, speed: s.id }))}
            testId={`ring-speed-${s.id}`}
            title={s.label}
            badge={s.id === "normal" ? "recommandé" : ""}
            text={s.text}
          />
        ))}
      </div>

      {/* 4. LECTURE */}
      <h3 className="font-serif text-lg mt-7">4. Lecture</h3>
      <div role="radiogroup" aria-label="Mode de lecture" className="mt-3 space-y-2.5">
        {RING_MODES.map((m) => (
          <Radio
            key={m.id}
            name="ring-mode"
            active={draft.mode === m.id}
            disabled={disabled}
            onChange={() => setDraft((d) => ({ ...d, mode: m.id }))}
            testId={`ring-mode-${m.id}`}
            title={m.title}
            badge={m.badge}
            text={m.text}
          />
        ))}
      </div>

      {/* APERÇU */}
      <div className="flex items-center justify-between gap-3 mt-7">
        <h3 className="font-serif text-lg">Aperçu</h3>
        <button type="button" onClick={() => setReplayKey((k) => k + 1)} className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-9 text-sm">
          Rejouer
        </button>
      </div>
      <div className="mt-3 rounded-2xl bg-[#fbf8f4] border border-[#eee2e5] p-3" data-testid="ring-anim-preview">
        <div className="max-w-2xl mx-auto">
          <RingHandsVideo key={replayKey} crystalColor={heartColor} ringSrc={photoUrl} speed={speedValue(draft.speed)} mode={draft.mode} />
        </div>
      </div>
      <p className="text-[11px] text-[#8b737e] mt-2 leading-4">
        L&apos;aperçu suit vos choix avant l&apos;enregistrement.
        {draft.heart_color === "season" && (
          <> Pour la couleur de la saison, il montre l&apos;accent de la famille du moment ({seasonKey}) ; sur le site, c&apos;est celui de la saison active.</>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={disabled || !dirty}
          data-testid="ring-anim-save"
          className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]"
        >
          {saving ? "Enregistrement..." : "Enregistrer les réglages"}
        </button>
        {!loadError && !loading && (
          <p data-testid="ring-anim-saved-text" className="text-[11px] text-[#54434c] leading-4">
            Réglage actuel : <strong className="font-medium">{describeRingSetting(saved)}</strong>
            {savedAt && (
              <span className="text-[#8b737e]">
                {" "}
                · modifié le {savedAt}
                {settingRow && settingRow.updated_by_email ? ` · ${settingRow.updated_by_email}` : ""}
              </span>
            )}
            {!settingRow && <span className="text-[#8b737e]"> · aucun réglage enregistré (réglages recommandés)</span>}
          </p>
        )}
      </div>

      <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
        Dans tous les cas, les visiteurs dont l&apos;appareil demande moins de mouvement voient l&apos;image finale fixe, et l&apos;animation n&apos;empêche aucun clic.
      </p>
    </section>
  );
}
