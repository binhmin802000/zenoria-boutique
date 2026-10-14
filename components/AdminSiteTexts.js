import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Type, RefreshCw, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import {
  SITE_TEXTS_KEY,
  TEXT_FIELDS,
  TEXT_GROUPS,
  DEFAULT_TEXTS,
  parseOverrides,
  resolveSiteTexts,
  buildTextsValue,
  sameOverrides,
  normalizeText,
  countLines,
} from "@/lib/siteTexts";

// ============================================================
// CARTE « TEXTES DU SITE » (onglet « Contenu du site » de /admin)
//
// Les textes du bloc Savoir-faire et de la page d'accueil, regroupés par bloc. Pour chaque texte :
//  - un champ de saisie (texte brut, pas de HTML), avec un compteur de caractères ;
//  - un bouton « Rétablir le texte d'origine ».
// Seuls les textes modifiés sont enregistrés, dans la table « site_settings » (clé « site_texts »). Un champ vide revient
// au texte d'origine. Tant que rien n'est enregistré, le site affiche ses textes d'origine (lib/siteTexts.js).
// Aucun script SQL à ajouter : la lecture publique et le contrôle de cette clé sont déjà installés
// (supabase_ring_animation.sql et supabase_shipping.sql). Voir supabase_site_texts_checks.sql.
// ============================================================

const TIME_ZONE = "Europe/Paris";

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/site_settings_site_texts_valid|violates check constraint/i.test(msg)) {
    return "La base refuse cette valeur (trop volumineuse ou mal formée). Raccourcissez les textes modifiés, ou vérifiez le script supabase_ring_animation.sql dans Supabase.";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages n'est pas installée. Exécutez le script supabase_site_settings.sql dans Supabase (SQL Editor).";
  }
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {
    return "Enregistrement refusé : ce compte n'a pas les droits d'administration.";
  }
  return msg;
}

export default function AdminSiteTexts() {
  const [row, setRow] = useState(null); // ligne enregistrée (ou null : rien d'enregistré, donc les textes d'origine)
  const [drafts, setDrafts] = useState({ ...DEFAULT_TEXTS });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase.from(SITE_SETTINGS_TABLE).select("*").eq("key", SITE_TEXTS_KEY).maybeSingle();
      if (res.error) {
        setLoadError(friendlyError(res.error));
      } else {
        const saved = res.data || null;
        setRow(saved);
        setDrafts(resolveSiteTexts(saved ? saved.value : null));
      }
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

  const savedOverrides = useMemo(() => parseOverrides(row ? row.value : null), [row]);
  const built = useMemo(() => buildTextsValue(drafts), [drafts]);
  const dirty = !sameOverrides(built.overrides, savedOverrides);
  const disabled = loading || Boolean(loadError) || saving;
  const customCount = Object.keys(savedOverrides).length;
  const errorCount = Object.keys(built.errors).length;

  const setDraft = (key, value) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    setError("");
  };

  const save = async () => {
    setError("");
    if (!built.valid) {
      setError("Certains textes sont trop longs ou ont trop de lignes : corrigez-les (messages en rouge) avant d'enregistrer.");
      return;
    }
    setSaving(true);
    try {
      const { error: err } = await supabase.from(SITE_SETTINGS_TABLE).upsert({ key: SITE_TEXTS_KEY, value: built.overrides }, { onConflict: "key" });
      if (err) throw err;
      setToast("Textes enregistrés. Les visiteurs les voient au prochain chargement de la page.");
      await load();
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setSaving(false);
  };

  const savedAt = row ? formatDateTime(row.updated_at) : null;

  return (
    <section data-testid="site-texts-panel" className="mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <Type size={18} className="text-[#8f6075]" /> Textes du site
          </h2>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Les textes du bloc Savoir-faire et de la page d&apos;accueil. Chaque champ affiche le texte actuel : modifiez-le, puis enregistrez. Texte brut uniquement (pas de mise en forme). Un champ vide revient au texte d&apos;origine.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Actualiser les textes du site"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {toast && <div data-testid="site-texts-toast" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {loadError && <div data-testid="site-texts-load-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{loadError}</div>}
      {error && <div data-testid="site-texts-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

      <div className="mt-4 space-y-3">
        {TEXT_GROUPS.map((g, gi) => {
          const fields = TEXT_FIELDS.filter((f) => f.group === g.id);
          const custom = fields.filter((f) => built.overrides[f.key] !== undefined).length;
          return (
            <details key={g.id} open={gi === 0} data-testid={`texts-group-${g.id}`} className="rounded-xl border border-[#eee2e5] bg-[#fdfbfc]">
              <summary className="cursor-pointer select-none px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-sm">{g.title}</span>
                <span className="text-[11px] text-[#8b737e]">{custom > 0 ? `${custom} texte${custom > 1 ? "s" : ""} modifié${custom > 1 ? "s" : ""}` : "textes d'origine"}</span>
              </summary>
              <div className="px-4 pb-4">
                <p className="text-[11px] text-[#8b737e] leading-4 mb-3">{g.hint}</p>
                <div className="space-y-4">
                  {fields.map((f) => {
                    const value = drafts[f.key] === undefined ? "" : drafts[f.key];
                    const n = normalizeText(value, Boolean(f.multiline));
                    const err = built.errors[f.key];
                    const isDefault = n === normalizeText(f.def, Boolean(f.multiline));
                    const isCustom = built.overrides[f.key] !== undefined;
                    const inputCls = `mt-1 w-full rounded-xl border px-3 text-sm outline-none bg-white disabled:opacity-60 ${err ? "border-red-300 focus:border-red-500" : "border-[#eadfe4] focus:border-[#8f6075]"}`;
                    return (
                      <div key={f.key} data-testid={`text-${f.key}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label htmlFor={`txt-${f.key}`} className="text-xs text-[#54434c] font-medium">{f.label}</label>
                          <span className={`text-[10px] rounded-full px-2 py-0.5 ${isCustom ? "bg-[#f1e3ea] text-[#6d4a5b]" : "bg-[#f3f1f5] text-[#8b737e]"}`}>{isCustom ? "modifié" : "texte d'origine"}</span>
                        </div>
                        {f.multiline ? (
                          <textarea
                            id={`txt-${f.key}`}
                            rows={f.rows || 3}
                            value={value}
                            disabled={disabled}
                            onChange={(e) => setDraft(f.key, e.target.value)}
                            aria-invalid={Boolean(err)}
                            className={`${inputCls} py-2 leading-6`}
                          />
                        ) : (
                          <input
                            id={`txt-${f.key}`}
                            type="text"
                            value={value}
                            disabled={disabled}
                            onChange={(e) => setDraft(f.key, e.target.value)}
                            aria-invalid={Boolean(err)}
                            className={`${inputCls} h-10`}
                          />
                        )}
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-[11px] leading-4 ${err ? "text-red-600" : "text-[#8b737e]"}`} data-testid={`text-help-${f.key}`}>
                            {err ? err : n === "" ? "Vide : le texte d'origine sera utilisé." : f.multiline ? `${n.length} / ${f.max} caractères · ${countLines(n)} ligne${countLines(n) > 1 ? "s" : ""} (${f.maxLines} au maximum)` : `${n.length} / ${f.max} caractères`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setDraft(f.key, f.def)}
                            disabled={disabled || isDefault}
                            data-testid={`restore-${f.key}`}
                            className="inline-flex items-center gap-1 text-[11px] text-[#8f6075] underline underline-offset-2 disabled:no-underline disabled:text-[#c9bcc3]"
                          >
                            <RotateCcw size={11} /> Rétablir le texte d&apos;origine
                          </button>
                        </div>
                        {f.note && <div className="text-[11px] text-[#8b737e] leading-4 mt-0.5">{f.note}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={disabled || !dirty || !built.valid}
          data-testid="site-texts-save"
          className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]"
        >
          {saving ? "Enregistrement..." : "Enregistrer les textes"}
        </button>
        {errorCount > 0 && <span className="text-[11px] text-red-600">{errorCount} texte{errorCount > 1 ? "s" : ""} à corriger avant d&apos;enregistrer.</span>}
        {!loadError && !loading && (
          <p data-testid="site-texts-saved-text" className="text-[11px] text-[#54434c] leading-4">
            Réglage actuel : <strong className="font-medium">{customCount === 0 ? "tous les textes d'origine" : `${customCount} texte${customCount > 1 ? "s" : ""} modifié${customCount > 1 ? "s" : ""}`}</strong>
            {savedAt && (
              <span className="text-[#8b737e]">
                {" "}
                · modifié le {savedAt}
                {row && row.updated_by_email ? ` · ${row.updated_by_email}` : ""}
              </span>
            )}
            {!row && <span className="text-[#8b737e]"> · rien d&apos;enregistré</span>}
          </p>
        )}
      </div>

      <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
        Les textes d&apos;origine sont conservés dans le code (lib/siteTexts.js) : « Rétablir » ou un champ vide les restaure toujours. Les autres textes du site (menu, fiches des collections, panier, quiz, pied de page) ne se modifient pas ici.
      </p>
    </section>
  );
}
