// ZENORIA_CARE_INFO_V1
import React, { useCallback, useEffect, useState } from "react";
import { Bold, Underline } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import {
  CARE_INFO_KEY,
  CARE_INFO_MAX_LENGTH,
  DEFAULT_CARE_INFO,
  parseCareInfoSetting,
  validateCareInfoContent,
  buildCareInfoValue,
  sameCareInfoSetting,
  isDuplicateKeyError,
  careInfoErrorMessage,
} from "@/lib/careInfoSettings";
import CareInfoText from "@/components/CareInfoText";
// ============================================================
// CARTE « ENTRETIEN DU BIJOU » (onglet « Contenu du site » de /admin, groupe « Vitrine & ambiance »),
// sur le meme gabarit que les cartes « Badge Nouveauté » et « Pastille de nouveautés ».
//
// Interrupteur (afficher ou non l'encart et la page /entretien) + champ de texte avec deux boutons
// de mise en forme (G = **gras**, S = __souligné__, appliques a la selection du champ) + apercu.
//
// L'ecriture ne reussit que si la ligne n'a pas change depuis son affichage (comparaison sur
// updated_at), comme les autres reglages simples.
// ============================================================
function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Enveloppe la selection du champ avec le marqueur donne (ou le retire si deja present).
function toggleWrap(text, start, end, marker) {
  const selected = text.slice(start, end);
  const before = text.slice(Math.max(0, start - marker.length), start);
  const after = text.slice(end, end + marker.length);
  if (selected && before === marker && after === marker) {
    return {
      text: text.slice(0, start - marker.length) + selected + text.slice(end + marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }
  const insertion = marker + (selected || "mot") + marker;
  return {
    text: text.slice(0, start) + insertion + text.slice(end),
    start: start + marker.length,
    end: start + marker.length + (selected || "mot").length,
  };
}

export default function AdminCareInfo() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [row, setRow] = useState(null);
  const [enabled, setEnabled] = useState(DEFAULT_CARE_INFO.enabled);
  const [content, setContent] = useState(DEFAULT_CARE_INFO.content);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const textareaRef = React.useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase.from(SITE_SETTINGS_TABLE).select("value, updated_at, updated_by_email").eq("key", CARE_INFO_KEY).maybeSingle();
      if (res.error) throw res.error;
      const saved = res.data || null;
      const cfg = parseCareInfoSetting(saved ? saved.value : null);
      setRow(saved);
      setEnabled(cfg.enabled);
      setContent(cfg.content);
    } catch (e) {
      setLoadError(careInfoErrorMessage(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const validation = validateCareInfoContent(content);
  const draftValue = validation.ok ? buildCareInfoValue(enabled, content) : null;
  const dirty = Boolean(draftValue) && !sameCareInfoSetting(draftValue, row ? row.value : null);
  const canSave = !busy && !loading && !loadError && dirty;

  const applyFormat = (marker) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const result = toggleWrap(content, selectionStart, selectionEnd, marker);
    setContent(result.text);
    setNotice(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(result.start, result.end);
      }
    });
  };

  const save = async () => {
    if (busy) return;
    const check = validateCareInfoContent(content);
    if (!check.ok) {
      setNotice({ type: "error", text: check.error });
      return;
    }
    const value = buildCareInfoValue(enabled, content);
    setBusy(true);
    setNotice(null);
    try {
      if (row) {
        const res = await supabase.from(SITE_SETTINGS_TABLE).update({ value }).eq("key", CARE_INFO_KEY).eq("updated_at", row.updated_at).select("key");
        if (res.error) throw res.error;
        if (!Array.isArray(res.data) || res.data.length !== 1) {
          setNotice({ type: "error", text: "Le réglage n'a pas été modifié : il a changé entre-temps (autre écran ou autre session). Les valeurs ont été relues, vérifiez puis recommencez." });
          await load();
          setBusy(false);
          return;
        }
      } else {
        const res = await supabase.from(SITE_SETTINGS_TABLE).insert({ key: CARE_INFO_KEY, value });
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
      setNotice({ type: "error", text: careInfoErrorMessage(e) });
    }
    setBusy(false);
  };

  const reset = () => {
    const saved = parseCareInfoSetting(row ? row.value : null);
    setEnabled(saved.enabled);
    setContent(saved.content);
    setNotice(null);
  };

  return (
    <section data-testid="care-info-card" className="rounded-2xl border border-[#eadfe4] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-lg text-[#412f3b]">Entretien du bijou</h3>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Encart sur la fiche produit et page <code>/entretien</code>. Sélectionnez du texte puis cliquez G ou S pour le mettre en forme.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading || busy} data-testid="care-info-reload" className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] text-xs px-3 h-8 disabled:opacity-60">
          Actualiser
        </button>
      </div>
      {loading && !row && !loadError && <p data-testid="care-info-loading" className="mt-4 text-sm text-[#8b737e]">Chargement du réglage…</p>}
      {loadError && (
        <div role="alert" data-testid="care-info-load-error" className="mt-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">
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
              aria-label="Afficher l'entretien du bijou"
              data-testid="care-info-enabled"
              onClick={() => setEnabled((v) => !v)}
              disabled={busy}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${enabled ? "bg-[#8f6075]" : "bg-[#d9c5cc]"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
            <span className="text-sm text-[#54434c]">{enabled ? "Affiché sur la fiche produit et /entretien" : "Masqué (message « bientôt disponible »)"}</span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label htmlFor="care-info-content" className="text-sm text-[#54434c]">Texte</label>
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" onClick={() => applyFormat("**")} disabled={busy} data-testid="care-info-bold" aria-label="Mettre en gras" className="rounded-lg border border-[#d9c5cc] hover:bg-[#f5edf1] h-7 w-7 grid place-items-center disabled:opacity-60">
                  <Bold size={14} />
                </button>
                <button type="button" onClick={() => applyFormat("__")} disabled={busy} data-testid="care-info-underline" aria-label="Souligner" className="rounded-lg border border-[#d9c5cc] hover:bg-[#f5edf1] h-7 w-7 grid place-items-center disabled:opacity-60">
                  <Underline size={14} />
                </button>
              </div>
            </div>
            <textarea
              id="care-info-content"
              ref={textareaRef}
              rows={8}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setNotice(null);
              }}
              disabled={busy}
              maxLength={CARE_INFO_MAX_LENGTH}
              data-testid="care-info-textarea"
              aria-invalid={!validation.ok}
              className={`w-full rounded-xl border bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#8f6075] disabled:opacity-60 ${validation.ok ? "border-[#eadfe4]" : "border-red-400"}`}
            />
            <div className="flex items-center justify-between mt-1">
              {!validation.ok ? (
                <p role="alert" data-testid="care-info-error" className="text-xs text-red-600">{validation.error}</p>
              ) : (
                <span />
              )}
              <span className="text-[11px] text-[#8b737e]">{content.length} / {CARE_INFO_MAX_LENGTH}</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-[#8b737e] mb-1.5">Aperçu</p>
            <CareInfoText data-testid="care-info-preview" content={content} className="rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3 text-sm leading-6 text-[#54434c]" />
          </div>
          <p data-testid="care-info-current" className="text-[11px] text-[#8b737e] leading-4">
            {row ? (
              <>Réglage enregistré{row.updated_at ? " — modifié le " + formatWhen(row.updated_at) : ""}{row.updated_by_email ? " par " + row.updated_by_email : ""}.</>
            ) : (
              <>Aucun réglage enregistré : le site applique le texte par défaut.</>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={!canSave} data-testid="care-info-save" className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" onClick={reset} disabled={busy || (!dirty && validation.ok)} data-testid="care-info-cancel" className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              Annuler les modifications
            </button>
          </div>
          <div aria-live="polite">
            {notice && (
              <div data-testid="care-info-notice" data-type={notice.type} className={`rounded-xl text-sm px-4 py-3 ${notice.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {notice.text}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
