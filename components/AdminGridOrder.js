import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shuffle, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { parseGridOrderSetting } from "@/lib/gridOrder";
import {
  GRID_ORDER_KEY,
  parseEveryDaysInput,
  buildGridOrderValue,
  shuffledValue,
  sameGridOrderSetting,
  periodBounds,
  formatGridMoment,
  formatShuffleMoment,
  describeGridOrder,
} from "@/lib/gridOrderSettings";

// ============================================================
// CARTE « ORDRE DES BIJOUX » (onglet « Contenu du site » de /admin, groupe « Vitrine & ambiance ») — ZENORIA_GRID_ORDER_V3
//
// Trois informations, enregistrées dans la table « site_settings » (clé « grid_order ») :
//  - le mode : « aléatoire » (nouvel ordre à chaque période) ou « manuel » (ordre de la base, comme avant) ;
//  - la fréquence : un nouvel ordre tous les N jours (de 1 à 30), à 3 h du matin, heure de Paris ;
//  - la date du dernier « Mélanger maintenant », qui change l'ordre pour tous sans attendre la prochaine période.
//
// La grille « Nos créations » de l'accueil lit ce réglage au chargement de la page (pages/index.js). Les calculs sont dans
// lib/gridOrder.js (ordre) et lib/gridOrderSettings.js (saisie, aperçu, textes). Tant que rien n'est enregistré, le site utilise la
// valeur par défaut : aléatoire, chaque jour. Voir sql/supabase_grid_order.sql.
// ============================================================

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/site_settings_grid_order_valid|violates check constraint/i.test(msg)) {
    return "La valeur est refusée par la base. Vérifiez le mode et la fréquence (de 1 à 30 jours), puis réessayez.";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages n'est pas installée. Exécutez le script supabase_site_settings.sql dans Supabase (SQL Editor).";
  }
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {
    return "Enregistrement refusé : ce compte n'a pas les droits d'administration.";
  }
  return msg;
}

const MODES = [
  { id: "random", label: "Aléatoire", sub: "Un nouvel ordre à chaque période, le même pour tous les visiteurs." },
  { id: "manual", label: "Manuel", sub: "Les bijoux s'affichent dans l'ordre de la base, comme avant." },
];

export default function AdminGridOrder() {
  const [row, setRow] = useState(null); // ligne enregistrée (ou null : rien d'enregistré, donc valeur par défaut)
  const [mode, setMode] = useState("random");
  const [text, setText] = useState("1");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [nowMs, setNowMs] = useState(null); // renseigné après l'affichage : le rendu du serveur ne dépend jamais de l'heure
  const radioRefs = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase.from(SITE_SETTINGS_TABLE).select("*").eq("key", GRID_ORDER_KEY).maybeSingle();
      if (res.error) {
        setLoadError(friendlyError(res.error));
      } else {
        const stored = res.data || null;
        setRow(stored);
        const parsed = parseGridOrderSetting(stored ? stored.value : null);
        setMode(parsed.mode);
        setText(String(parsed.everyDays));
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
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const saved = useMemo(() => parseGridOrderSetting(row ? row.value : null), [row]);
  const input = useMemo(() => parseEveryDaysInput(text), [text]);
  const draft = input.ok ? { mode, everyDays: input.value, shuffledAt: saved.shuffledAt } : null;
  const modified = draft !== null && !sameGridOrderSetting(draft, saved); // la saisie diffère du réglage en vigueur
  const dirty = draft !== null && (!row || modified); // « Enregistrer » est utile : modification, ou rien d'enregistré (il crée la ligne)
  const disabled = loading || Boolean(loadError) || saving;
  const manualDraft = mode === "manual";
  const shown = draft || saved; // aperçu : si la saisie est invalide, on garde le dernier réglage valide

  let shuffleWhy = "";
  if (!input.ok) shuffleWhy = "Corrigez la fréquence saisie avant de mélanger.";
  else if (modified) shuffleWhy = "Enregistrez d'abord vos modifications pour pouvoir mélanger.";
  else if (saved.mode !== "random") shuffleWhy = "Le mélange n'a d'effet qu'en mode aléatoire.";

  const write = async (value, okMessage) => {
    setError("");
    setToast("");
    setSaving(true);
    try {
      const { error: err } = await supabase.from(SITE_SETTINGS_TABLE).upsert({ key: GRID_ORDER_KEY, value }, { onConflict: "key" });
      if (err) throw err;
      setToast(okMessage);
      await load();
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setSaving(false);
  };

  const save = () => {
    setError("");
    if (!draft) {
      setError(input.error);
      return;
    }
    write(buildGridOrderValue(draft), "Réglage enregistré. Les visiteurs le voient au prochain chargement de la page.");
  };

  const shuffle = () => {
    if (disabled || shuffleWhy) return;
    const value = shuffledValue(saved, Date.now());
    if (!value) {
      setError("Échec du mélange : l'heure de cet ordinateur est illisible.");
      return;
    }
    write(value, "Nouvel ordre enregistré. Les visiteurs le voient au prochain chargement de la page.");
  };

  const pickMode = (id) => {
    if (disabled) return;
    setMode(id);
    setError("");
    setToast("");
  };

  // Flèches du clavier dans le groupe de choix (comportement habituel d'un groupe de boutons radio)
  const onRadioKey = (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = mode === "random" ? "manual" : "random";
    pickMode(next);
    const el = radioRefs.current[next];
    if (el) el.focus();
  };

  const bounds = nowMs !== null && shown.mode === "random" ? periodBounds(nowMs, shown.everyDays) : null;
  const savedAt = row && row.updated_at ? formatShuffleMoment(row.updated_at) : null;

  return (
    <section data-testid="grid-order-panel" className="mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5" aria-labelledby="grid-order-title">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h2 id="grid-order-title" className="font-serif text-xl flex items-center gap-2">
            <Shuffle size={18} className="text-[#8f6075]" /> Ordre des bijoux
          </h2>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            L&apos;ordre dans lequel les créations s&apos;affichent dans la grille « Nos créations » de l&apos;accueil. En mode aléatoire, tous les visiteurs voient le même ordre, renouvelé à 3 h du matin (heure de Paris). Les bijoux commandables passent toujours avant les autres.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Actualiser le réglage de l'ordre des bijoux"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {toast && <div data-testid="grid-order-toast" role="status" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {loadError && <div data-testid="grid-order-load-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{loadError}</div>}
      {error && <div data-testid="grid-order-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

      <div className="mt-5 text-xs text-[#8b737e]" id="grid-order-mode-label">
        Ordre d&apos;affichage
      </div>
      <div role="radiogroup" aria-labelledby="grid-order-mode-label" className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {MODES.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              ref={(el) => {
                radioRefs.current[m.id] = el;
              }}
              disabled={disabled}
              onClick={() => pickMode(m.id)}
              onKeyDown={onRadioKey}
              data-testid={"grid-order-mode-" + m.id}
              className={`text-left rounded-xl border px-4 py-3 flex gap-3 items-start disabled:opacity-60 ${on ? "border-[#8f6075] bg-[#faf6f8]" : "border-[#eee2e5] hover:bg-[#faf6f8]"}`}
            >
              <span aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 grid place-items-center ${on ? "border-[#8f6075]" : "border-[#d9c5cc]"}`}>
                {on && <span className="h-2 w-2 rounded-full bg-[#8f6075]" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="block text-[12px] text-[#756a70] leading-4 mt-0.5">{m.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <label className="block mt-5 text-sm" htmlFor="grid-order-days">
        <span className="block text-xs text-[#8b737e]">Nouvel ordre tous les</span>
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id="grid-order-days"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          disabled={disabled || manualDraft}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
            setToast("");
          }}
          aria-invalid={!input.ok}
          aria-describedby="grid-order-days-help"
          data-testid="grid-order-days"
          className="w-24 rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white disabled:opacity-60"
        />
        <span className="text-sm text-[#54434c]">{input.ok && input.value > 1 ? "jours" : "jour"}</span>
      </div>
      <span id="grid-order-days-help" data-testid="grid-order-days-help" className={`block text-[11px] mt-1 leading-4 ${input.ok ? "text-[#8b737e]" : "text-red-600"}`}>
        {input.ok ? "Nombre entier de 1 à 30. Le nouvel ordre est appliqué à 3 h du matin, heure de Paris." : input.error}
      </span>
      {manualDraft && <span className="block text-[11px] text-[#8b737e] mt-1 leading-4">Mode manuel : cette fréquence est conservée et reprendra effet au retour en mode aléatoire.</span>}

      <div className="mt-5 rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3" aria-live="polite">
        <div className="text-xs text-[#8b737e] mb-1.5">{modified ? "Aperçu avec les valeurs saisies (pas encore enregistrées)" : "Aperçu"}</div>
        <ul data-testid="grid-order-preview" className="space-y-1 text-[13px] text-[#54434c] leading-5">
          {shown.mode === "manual" ? (
            <li>Mode manuel : l&apos;ordre ne change jamais tout seul.</li>
          ) : bounds ? (
            <>
              <li>
                Période en cours depuis le <strong className="font-medium">{formatGridMoment(bounds.startMs)}</strong>
              </li>
              <li>
                Prochain changement d&apos;ordre : <strong className="font-medium">{formatGridMoment(bounds.nextMs)}</strong>
              </li>
            </>
          ) : null}
          <li>
            Dernier mélange manuel : <strong className="font-medium">{formatShuffleMoment(saved.shuffledAt)}</strong>
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={disabled || !dirty}
          data-testid="grid-order-save"
          className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={shuffle}
          disabled={disabled || Boolean(shuffleWhy)}
          aria-describedby="grid-order-shuffle-hint"
          data-testid="grid-order-shuffle"
          className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#f5edf1] px-5 h-10 text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:border-[#d9c5cc] disabled:text-[#8b737e] disabled:hover:bg-transparent"
        >
          <Shuffle size={15} /> Mélanger maintenant
        </button>
        {!loadError && !loading && (
          <p data-testid="grid-order-saved-text" className="text-[11px] text-[#54434c] leading-4">
            Réglage actuel : <strong className="font-medium">{describeGridOrder(saved)}</strong>
            {savedAt && (
              <span className="text-[#8b737e]">
                {" "}
                · modifié le {savedAt}
                {row && row.updated_by_email ? ` · ${row.updated_by_email}` : ""}
              </span>
            )}
            {!row && <span className="text-[#8b737e]"> · rien d&apos;enregistré : valeur par défaut</span>}
          </p>
        )}
      </div>
      <p id="grid-order-shuffle-hint" data-testid="grid-order-shuffle-hint" className="text-[11px] text-[#8b737e] mt-2 leading-4">
        {shuffleWhy || "Change l'ordre pour tous les visiteurs dès leur prochain chargement de page, sans attendre 3 h du matin."}
      </p>

      <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
        L&apos;ordre est calculé dans le navigateur de chaque visiteur, à partir de l&apos;heure de Paris. Un onglet déjà ouvert garde son ordre jusqu&apos;au prochain chargement de la page. Les changements de ce réglage sont inscrits dans le journal de Configuration.
      </p>
    </section>
  );
}
