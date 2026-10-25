import React, { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { CGV_KEY, CGV_MAX_LENGTH, resolveCgvText, cgvTextProblem, buildCgvValue } from "@/lib/cgvSettings";

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function friendlyError(err) {
  const msg = err && err.message ? err.message : "";
  if (/JWT|session|auth/i.test(msg)) return "Session expirée : reconnectez-vous puis réessayez.";
  if (/network|fetch/i.test(msg)) return "Connexion indisponible. Vérifiez votre réseau et réessayez.";
  return "Impossible d'enregistrer les CGV pour le moment. Réessayez dans un instant.";
}

// ============================================================
// ADMIN — CGV (conditions générales de vente)
// ============================================================
// Panneau dédié, séparé des Textes du site : la clé cgv_text a sa
// propre date de mise à jour (updated_at), qui ne reflète que les
// vraies modifications des CGV. Affiché à la page publique /cgv.
// ============================================================
export default function AdminCgv() {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await supabase.from(SITE_SETTINGS_TABLE).select("value, updated_at").eq("key", CGV_KEY).maybeSingle();
      if (res && !res.error) {
        setDraft(resolveCgvText(res.data ? res.data.value : null));
        setUpdatedAt(res.data ? res.data.updated_at : null);
      }
    } catch (e) {
      setError(friendlyError(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const save = async () => {
    const problem = cgvTextProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData && userData.user ? userData.user.email : null;
      const { error: err } = await supabase
        .from(SITE_SETTINGS_TABLE)
        .upsert(
          { key: CGV_KEY, value: buildCgvValue(draft), updated_by_email: email },
          { onConflict: "key" }
        );
      if (err) throw err;
      setToast("CGV enregistrées.");
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
    setSaving(false);
  };

  const charCount = draft.length;
  const overLimit = charCount > CGV_MAX_LENGTH;

  return (
    <div className="rounded-2xl border border-[#eadfe4] bg-white p-5 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={18} className="text-[#8f6075]" />
        <h3 className="font-serif text-lg text-[#412f3b]">Conditions générales de vente (CGV)</h3>
      </div>
      <p className="text-xs text-[#8b737e] mb-3">
        Ce texte est affiché sur la page publique /cgv, avec sa date de dernière mise à jour.
      </p>
      {loading ? (
        <p className="text-sm text-[#8b737e]">Chargement…</p>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            rows={16}
            data-testid="cgv-textarea"
            className="w-full rounded-xl border border-[#d9c5cc] p-3 text-sm leading-6 font-mono"
            placeholder="Rédigez ici les conditions générales de vente…"
          />
          <div className={`text-[11px] mt-1 ${overLimit ? "text-red-600" : "text-[#8b737e]"}`}>
            {charCount} / {CGV_MAX_LENGTH} caractères
          </div>
          {error && <div role="alert" className="mt-2 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-sm">{error}</div>}
          {toast && <div className="mt-2 rounded-xl bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">{toast}</div>}
          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || overLimit}
              data-testid="cgv-save-btn"
              className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 text-sm disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {updatedAt && (
              <span className="text-xs text-[#8b737e]">Dernière mise à jour : {formatDateTime(updatedAt)}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}