// ZENORIA_CONFIG_C5_V1 : lecture et mise en forme du journal des changements de réglages (table site_settings_log).
// Le journal est alimenté par un déclencheur SQL (supabase_lotC5_journal_reglages.sql) : l'interface ne fait que le lire.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatGridOrderLogValue } from "@/lib/gridOrderSettings"; // ZENORIA_GRID_ORDER_V3

export const LOG_LIMIT = 50;

export const LOG_KEY_LABELS = {
  payment_methods: "Moyens de paiement",
  bank_transfer: "Virement bancaire",
  billing: "Facturation et TVA",
  shipping: "Livraison",
  season_fx: "Effet saisonnier",
  ring_animation: "Animation « Le geste »",
  reviews: "Avis clientes",
  contact: "Canaux de contact",
  site_texts: "Textes du site",
  cgv_text: "CGV",
  grid_order: "Ordre des bijoux",
  new_badge: "Badge Nouveauté", // ZENORIA_NEW_BADGE_V3
  newsletter: "Newsletter", // ZENORIA_NEW_BADGE_V3
};

export const LOG_FIELD_LABELS = {
  stripe_enabled: "Carte bancaire",
  transfer_enabled: "Virement",
  delay_days: "Délai de paiement",
  grace_days: "Délai de grâce",
  iban: "IBAN",
  bic: "BIC",
  beneficiary: "Bénéficiaire",
  vat_enabled: "TVA",
  vat_rate: "Taux de TVA",
  seller_name: "Nom du vendeur",
  seller_siret: "SIRET",
  seller_address: "Adresse",
  seller_vat_number: "N° de TVA",
  enabled: "Activé",
  fee: "Frais de livraison",
  threshold: "Seuil de livraison offerte",
  mode: "Mode",
  speed: "Vitesse",
  heart_color: "Couleur du cœur",
  season: "Saison",
  email: "E-mail",
  whatsapp: "WhatsApp",
  signal: "Signal",
  everyDays: "Fréquence de renouvellement",
  shuffledAt: "Dernier mélange manuel",
  days: "Durée d'affichage", // ZENORIA_NEW_BADGE_V3
};

const MAX_LINES = 4;

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
function plural(n, one, many) {
  return n + " " + (n > 1 ? many : one);
}

// Valeur lisible d'un champ. Les canaux de contact sont des objets { value, enabled }.
export function formatLogValue(field, v) {
  if (v === undefined || v === null || v === "") return "—";
  const gridText = formatGridOrderLogValue(field, v); // ZENORIA_GRID_ORDER_V3 : mode, fréquence et date de mélange de l'ordre des bijoux (null pour tout autre réglage)
  if (gridText !== null) return gridText;
  if (typeof v === "boolean") return v ? "activé" : "désactivé";
  if (typeof v === "object" && !Array.isArray(v)) {
    const state = typeof v.enabled === "boolean" ? (v.enabled ? "activé" : "désactivé") : "";
    const val = typeof v.value === "string" && v.value ? v.value : "";
    if (state || val) return [state, val].filter(Boolean).join(" · ");
    return JSON.stringify(v);
  }
  if (field === "fee" || field === "threshold") return money(v);
  if (field === "delay_days" || field === "grace_days" || field === "days") { // ZENORIA_NEW_BADGE_V3 : « days » = durée du badge Nouveauté
    const n = Number(v);
    return Number.isFinite(n) ? plural(n, "jour", "jours") : String(v);
  }
  if (field === "vat_rate") return String(v) + " %";
  return String(v);
}

// Décrit un changement : { key, label, lines: [texte], more, author, when }
export function describeLogEntry(entry) {
  const e = entry || {};
  const label = LOG_KEY_LABELS[e.key] || e.key || "Réglage inconnu";
  const author = e.changed_by_email || "SQL Editor ou non renseigné";
  const out = { id: e.id, key: e.key, label, lines: [], more: 0, author, when: e.changed_at || "" };

  if (e.action === "insert") {
    out.lines.push("Réglage créé");
    return out;
  }
  if (e.action === "delete") {
    out.lines.push("Réglage supprimé");
    return out;
  }
  // Textes volumineux : seules les tailles sont conservées
  if (e.old_size !== null && e.old_size !== undefined && e.new_size !== null && e.new_size !== undefined) {
    out.lines.push("Texte modifié (" + e.old_size + " → " + e.new_size + " caractères)");
    return out;
  }
  const fields = Array.isArray(e.changed_fields) ? e.changed_fields : null;
  const oldV = e.old_value && typeof e.old_value === "object" ? e.old_value : {};
  const newV = e.new_value && typeof e.new_value === "object" ? e.new_value : {};
  if (!fields || fields.length === 0) {
    out.lines.push("Modifié");
    return out;
  }
  const lines = fields.map((f) => {
    const name = LOG_FIELD_LABELS[f] || f;
    const a = formatLogValue(f, oldV[f]);
    const b = formatLogValue(f, newV[f]);
    // L'IBAN est masqué dans le journal : deux IBAN différents peuvent avoir le même aspect
    if (a === b) return name + " : modifié";
    return name + " : " + a + " → " + b;
  });
  out.lines = lines.slice(0, MAX_LINES);
  out.more = Math.max(0, lines.length - MAX_LINES);
  return out;
}

export function formatLogWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
}

function friendly(err) {
  const msg = err && err.message ? err.message : typeof err === "string" ? err : "";
  if (/does not exist|schema cache|relation|42P01/i.test(msg)) {
    return "Le journal n'est pas installé. Exécutez supabase_lotC5_journal_reglages.sql dans Supabase (SQL Editor), puis cliquez sur « Actualiser ».";
  }
  return "Le journal n'a pas pu être lu" + (msg ? " (" + msg + ")" : "") + ". Cliquez sur « Actualiser ».";
}

export async function loadSettingsLog(limit) {
  try {
    const res = await supabase.from("site_settings_log").select("*").order("changed_at", { ascending: false }).limit(limit || LOG_LIMIT);
    if (res.error || !Array.isArray(res.data)) return { entries: [], error: friendly(res.error) };
    return { entries: res.data, error: "" };
  } catch (e) {
    return { entries: [], error: friendly(e) };
  }
}

// refreshKey : toute valeur qui change quand l'écran relit ses réglages (le journal est alors relu aussi)
export function useSettingsLog(refreshKey) {
  const [state, setState] = useState({ loaded: false, loading: true, error: "", entries: [] });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadSettingsLog().then((res) => {
      if (alive) setState({ loaded: true, loading: false, error: res.error, entries: res.entries });
    });
    return () => {
      alive = false;
    };
  }, [refreshKey, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
