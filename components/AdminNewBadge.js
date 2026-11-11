// ZENORIA_NEW_BADGE_V2
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { NEW_BADGE_KEY, NEW_BADGE_MIN_DAYS, NEW_BADGE_MAX_DAYS, DEFAULT_NEW_BADGE, parseNewBadgeSetting } from "@/lib/newBadge";
import {
  parseDaysInput,
  buildNewBadgeValue,
  describeNewBadgeSetting,
  countNewProducts,
  previewText,
  newBadgeErrorMessage,
  isDuplicateKeyError,
} from "@/lib/newBadgeSettings";

// ============================================================
// CARTE « BADGE NOUVEAUTÉ » (onglet « Contenu du site » de /admin, groupe « Vitrine & ambiance »)
//
// Deux réglages : l'interrupteur (afficher ou non le badge) et la durée d'affichage, en jours, après la création du bijou.
// Enregistrés dans la ligne « new_badge » de site_settings (créée au premier enregistrement). Les déclencheurs existants
// enregistrent l'auteur et alimentent le journal des réglages. Le site lit ce réglage dans sa requête de réglages habituelle.
// Ligne absente ou illisible : le site applique les valeurs par défaut (activé, 14 jours).
//
// L'écriture ne réussit que si la ligne n'a pas changé depuis son affichage (comparaison sur updated_at), comme les
// interrupteurs de Configuration : une autre session ne peut pas être écrasée sans le savoir.
// ============================================================
function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminNewBadge() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [row, setRow] = useState(null); // ligne enregistrée { value, updated_at, updated_by_email } ou null
  const [products, setProducts] = useState(null); // bijoux en ligne (aperçu) ; null = non lus
  const [nowMs, setNowMs] = useState(null);
  const [enabled, setEnabled] = useState(DEFAULT_NEW_BADGE.enabled);
  const [daysText, setDaysText] = useState(String(DEFAULT_NEW_BADGE.days));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "ok" | "error", text }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [s, p] = await Promise.all([
        supabase.from(SITE_SETTINGS_TABLE).select("value, updated_at, updated_by_email").eq("key", NEW_BADGE_KEY).maybeSingle(),
        supabase.from("products").select("id, created_at, active").eq("active", true),
      ]);
      if (s.error) throw s.error;
      const saved = s.data || null;
      const cfg = parseNewBadgeSetting(saved ? saved.value : null);
      setRow(saved);
      setEnabled(cfg.enabled);
      setDaysText(String(cfg.days));
      setProducts(p && !p.error && Array.isArray(p.data) ? p.data : null);
    } catch (e) {
      setLoadError(newBadgeErrorMessage(e));
    }
    setNowMs(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saved = parseNewBadgeSetting(row ? row.value : null);
  const parsed = parseDaysInput(daysText);
  const draft = parsed.ok ? { enabled, days: parsed.days } : null;
  const dirty = Boolean(draft) && (draft.enabled !== saved.enabled || draft.days !== saved.days);
  const canSave = !busy && !loading && !loadError && dirty;
  const count = draft && products && nowMs !== null ? countNewProducts(products, draft, nowMs) : null;

  const save = async () => {
    if (busy) return;
    const check = parseDaysInput(daysText);
    if (!check.ok) {
      setNotice({ type: "error", text: check.error });
      return;
    }
    const value = buildNewBadgeValue(enabled, check.days);
    setBusy(true);
    setNotice(null);
    try {
      if (row) {
        const res = await supabase
          .from(SITE_SETTINGS_TABLE)
          .update({ value })
          .eq("key", NEW_BADGE_KEY)
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
        const res = await supabase.from(SITE_SETTINGS_TABLE).insert({ key: NEW_BADGE_KEY, value });
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
      setNotice({ type: "error", text: newBadgeErrorMessage(e) });
    }
    setBusy(false);
  };

  const reset = () => {
    setEnabled(saved.enabled);
    setDaysText(String(saved.days));
    setNotice(null);
  };

  return (
    <section data-testid="new-badge-card" className="rounded-2xl border border-[#eadfe4] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-lg text-[#412f3b]">Badge « Nouveauté »</h3>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Petit badge en bas à droite de la photo d&apos;un bijou, sur la grille de l&apos;accueil, pendant la durée choisie après son ajout au catalogue.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || busy}
          data-testid="new-badge-reload"
          className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] text-xs px-3 h-8 disabled:opacity-60"
        >
          Actualiser
        </button>
      </div>

      {loading && !row && !loadError && (
        <p data-testid="new-badge-loading" className="mt-4 text-sm text-[#8b737e]">Chargement du réglage…</p>
      )}

      {loadError && (
        <div role="alert" data-testid="new-badge-load-error" className="mt-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">
          {loadError}
        </div>
      )}

      {!loadError && (!loading || row || products !== null) && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Afficher le badge Nouveauté"
              data-testid="new-badge-enabled"
              onClick={() => setEnabled((v) => !v)}
              disabled={busy}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${enabled ? "bg-[#8f6075]" : "bg-[#d9c5cc]"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
            <span className="text-sm text-[#54434c]">{enabled ? "Badge affiché" : "Badge masqué"}</span>
          </div>

          <div>
            <label htmlFor="new-badge-days" className="block text-sm text-[#54434c] mb-1">
              Durée d&apos;affichage, en jours
            </label>
            <div className="flex items-center gap-2">
              <input
                id="new-badge-days"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={daysText}
                onChange={(e) => {
                  setDaysText(e.target.value);
                  setNotice(null);
                }}
                disabled={busy}
                aria-invalid={!parsed.ok}
                data-testid="new-badge-days"
                className={`w-24 rounded-full border bg-white px-3 h-10 text-sm outline-none focus:border-[#8f6075] ${parsed.ok ? "border-[#eadfe4]" : "border-red-400"}`}
              />
              <span className="text-xs text-[#8b737e]">de {NEW_BADGE_MIN_DAYS} à {NEW_BADGE_MAX_DAYS} jours (14 par défaut)</span>
            </div>
            {!parsed.ok && (
              <p role="alert" data-testid="new-badge-days-error" className="text-xs text-red-600 mt-1.5">{parsed.error}</p>
            )}
            {!enabled && <p className="text-[11px] text-[#8b737e] mt-1.5">La durée est conservée même quand le badge est masqué.</p>}
          </div>

          <p data-testid="new-badge-preview" className="rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3 text-sm text-[#54434c]">
            {draft ? previewText(count, draft) : "Corrigez la durée pour voir l'aperçu."}
          </p>

          <p data-testid="new-badge-current" className="text-[11px] text-[#8b737e] leading-4">
            {row ? (
              <>
                Réglage enregistré : {describeNewBadgeSetting(row.value)}
                {row.updated_at ? " — modifié le " + formatWhen(row.updated_at) : ""}
                {row.updated_by_email ? " par " + row.updated_by_email : ""}.
              </>
            ) : (
              <>Aucun réglage enregistré : le site applique les valeurs par défaut ({describeNewBadgeSetting(null)}).</>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              data-testid="new-badge-save"
              className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy || (!dirty && parsed.ok)}
              data-testid="new-badge-cancel"
              className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Annuler les modifications
            </button>
          </div>

          <div aria-live="polite">
            {notice && (
              <div
                data-testid="new-badge-notice"
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
