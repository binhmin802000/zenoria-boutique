import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  SITE_SETTINGS_TABLE,
  SEASON_FX_KEY,
  FX_SEASON_KEYS,
  FX_SEASON_NAMES,
  parseSeasonFxSetting,
  buildSeasonFxValue,
  sameSeasonFx,
} from "@/lib/siteSettings";

// ============================================================
// RÉGLAGE DE L'ANIMATION SAISONNIÈRE (onglet « Contenu du site » de /admin)
//
// Trois choix, enregistrés dans la table « site_settings » (clé « season_fx ») :
//  - Automatique : l'animation suit la date (comportement d'origine du site)
//  - Forcée      : la même saison toute l'année (utile pour lancer l'Automne avant la date)
//  - Désactivée  : aucune animation
//
// Le site lit ce réglage à chaque chargement de page. Dans tous les cas, l'animation reste coupée pour
// les visiteurs dont l'appareil demande moins de mouvement. Voir supabase_site_settings.sql.
// ============================================================

const TIME_ZONE = "Europe/Paris";

const MODES = [
  {
    id: "auto",
    title: "Automatique",
    badge: "recommandé",
    text: "L'animation suit la date : pétales au printemps, poussière dorée en été, feuilles en automne, flocons en hiver (changement vers le 20 mars, le 21 juin, le 23 septembre et le 21 décembre). Un clic sur une carte saison donne son ambiance à la page.",
  },
  {
    id: "forced",
    title: "Forcée sur une saison",
    badge: "",
    text: "La même animation toute l'année, par exemple pour lancer la saison Automne avant la date. Un clic sur une carte saison ne la change plus.",
  },
  {
    id: "off",
    title: "Désactivée",
    badge: "",
    text: "Aucune animation sur la page d'accueil.",
  },
];

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages n'est pas encore installée. Exécutez le script supabase_site_settings.sql dans Supabase (SQL Editor).";
  }
  if (/row-level security|permission denied|not authorized/i.test(msg)) {
    return "Enregistrement refusé : ce compte n'a pas les droits d'administration.";
  }
  return msg;
}

export default function AdminSeasonFx() {
  const [row, setRow] = useState(null); // ligne enregistrée (ou null : aucune ligne, donc « automatique »)
  const [seasons, setSeasons] = useState([]); // [{ key, name }]
  const [mode, setMode] = useState("auto");
  const [season, setSeason] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [setRes, famRes] = await Promise.all([
        supabase.from(SITE_SETTINGS_TABLE).select("*").eq("key", SEASON_FX_KEY).maybeSingle(),
        supabase.from("families").select("key, name, is_season, sort_order").eq("is_season", true).order("sort_order", { ascending: true }),
      ]);
      if (setRes.error) {
        setLoadError(friendlyError(setRes.error));
      } else {
        const saved = setRes.data || null;
        setRow(saved);
        const parsed = parseSeasonFxSetting(saved ? saved.value : null);
        setMode(parsed.mode);
        setSeason(parsed.season || "");
      }
      // Les noms viennent de l'onglet Familles (une saison renommée s'affiche avec son nouveau nom)
      const fromDb = ((famRes && famRes.data) || [])
        .filter((f) => FX_SEASON_KEYS.includes(f.key))
        .map((f) => ({ key: f.key, name: f.name || FX_SEASON_NAMES[f.key] }));
      setSeasons(fromDb.length > 0 ? fromDb : FX_SEASON_KEYS.map((k) => ({ key: k, name: FX_SEASON_NAMES[k] })));
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

  const saved = useMemo(() => parseSeasonFxSetting(row ? row.value : null), [row]);
  const chosenSeason = season || (seasons[0] ? seasons[0].key : "");
  const draft = useMemo(() => buildSeasonFxValue(mode, mode === "forced" ? chosenSeason : null), [mode, chosenSeason]);
  const dirty = draft !== null && !sameSeasonFx(draft, saved);
  const disabled = loading || Boolean(loadError) || saving;

  const pickMode = (id) => {
    setMode(id);
    setError("");
    if (id === "forced" && !season && seasons[0]) setSeason(seasons[0].key);
  };

  const save = async () => {
    setError("");
    if (!draft) {
      setError("Choisissez une saison pour l'animation forcée.");
      return;
    }
    setSaving(true);
    try {
      const { error: err } = await supabase.from(SITE_SETTINGS_TABLE).upsert({ key: SEASON_FX_KEY, value: draft }, { onConflict: "key" });
      if (err) throw err;
      setToast("Réglage enregistré. Les visiteurs le voient au prochain chargement de la page.");
      await load();
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setSaving(false);
  };

  const seasonLabel = (key) => {
    const s = seasons.find((x) => x.key === key);
    return s ? s.name : FX_SEASON_NAMES[key] || key;
  };

  const savedText =
    saved.mode === "forced" ? `forcée sur ${seasonLabel(saved.season)}` : saved.mode === "off" ? "désactivée" : "automatique (suit la date)";
  const savedAt = row ? formatDateTime(row.updated_at) : null;

  return (
    <section data-testid="season-fx-panel" className="mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <Sparkles size={18} className="text-[#8f6075]" /> Animation saisonnière
          </h2>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Feuilles, pétales, poussière dorée ou flocons très discrets, entre le bloc d&apos;accueil et les quatre saisons.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Actualiser le réglage de l'animation"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {toast && (
        <div data-testid="season-fx-toast" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">
          {toast}
        </div>
      )}
      {loadError && (
        <div data-testid="season-fx-load-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">
          {loadError}
        </div>
      )}
      {error && (
        <div data-testid="season-fx-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div role="radiogroup" aria-label="Mode de l'animation saisonnière" className="mt-4 space-y-2.5">
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <label
              key={m.id}
              className={`flex gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ${
                active ? "border-[#8f6075] bg-[#faf6f8]" : "border-[#eee2e5] hover:bg-[#faf6f8]"
              } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name="season-fx-mode"
                value={m.id}
                checked={active}
                disabled={disabled}
                onChange={() => pickMode(m.id)}
                data-testid={`fx-mode-${m.id}`}
                className="mt-1 h-4 w-4 shrink-0 accent-[#8f6075]"
              />
              <span className="min-w-0">
                <span className="text-sm font-medium">
                  {m.title}
                  {m.badge && <span className="ml-2 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-normal">{m.badge}</span>}
                </span>
                <span className="block text-xs text-[#70656a] leading-5 mt-0.5">{m.text}</span>
              </span>
            </label>
          );
        })}
      </div>

      {mode === "forced" && (
        <label className="block mt-4 text-sm">
          <span className="block text-xs text-[#8b737e]">Saison de l&apos;animation</span>
          <select
            value={chosenSeason}
            disabled={disabled}
            onChange={(e) => {
              setSeason(e.target.value);
              setError("");
            }}
            data-testid="fx-season-select"
            className="mt-1 w-full sm:w-72 rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white"
          >
            {seasons.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={disabled || !dirty}
          data-testid="fx-save"
          className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {!loadError && !loading && (
          <p data-testid="fx-saved-text" className="text-[11px] text-[#54434c] leading-4">
            Réglage actuel : <strong className="font-medium">{savedText}</strong>
            {savedAt && (
              <span className="text-[#8b737e]">
                {" "}
                · modifié le {savedAt}
                {row && row.updated_by_email ? ` · ${row.updated_by_email}` : ""}
              </span>
            )}
            {!row && <span className="text-[#8b737e]"> · aucun réglage enregistré</span>}
          </p>
        )}
      </div>

      <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
        Dans tous les cas, l&apos;animation est coupée pour les visiteurs dont l&apos;appareil demande moins de mouvement, et elle n&apos;empêche aucun clic.
      </p>
    </section>
  );
}
