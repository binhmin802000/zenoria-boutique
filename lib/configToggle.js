// ZENORIA_CONFIG_C2_V1 : interrupteurs simples de l'onglet Accueil › Configuration.
// Chaque interrupteur ne modifie QU'UN champ d'un réglage de site_settings et conserve tout le reste tel quel.
// Le journal des changements (lot C5) enregistre chaque bascule, avec l'e-mail du compte connecté.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export const SETTINGS_TABLE = "site_settings";
const SEEN = " Les visiteuses le voient au prochain chargement de la page.";

// id de la ligne (buildConfigOverview) -> réglage et champ modifié
export const TOGGLES = {
  free_shipping: {
    key: "shipping",
    path: ["enabled"],
    on: "Livraison offerte activée : elle s'applique dès que le panier atteint le seuil.",
    off: "Livraison offerte désactivée : la livraison est facturée quel que soit le montant du panier.",
  },
  reviews_enabled: {
    key: "reviews",
    path: ["enabled"],
    on: "Avis clientes activés : avis et charte des avis visibles sur le site.",
    off: "Avis clientes désactivés : avis et charte des avis masqués. Les avis déjà déposés sont conservés.",
  },
  contact_email: { key: "contact", path: ["email", "enabled"], channel: "email", on: "E-mail affiché dans le pied de page.", off: "E-mail masqué dans le pied de page." },
  contact_whatsapp: { key: "contact", path: ["whatsapp", "enabled"], channel: "whatsapp", on: "WhatsApp affiché dans le pied de page.", off: "WhatsApp masqué dans le pied de page." },
  contact_signal: { key: "contact", path: ["signal", "enabled"], channel: "signal", on: "Signal affiché dans le pied de page.", off: "Signal masqué dans le pied de page." },
  newsletter_enabled: { // ZENORIA_NEWSLETTER_V1
    key: "newsletter",
    path: ["enabled"],
    on: "Newsletter activée : la section « Le cercle Zenoria » est visible en bas de l'accueil.",
    off: "Newsletter désactivée : la section « Le cercle Zenoria » est masquée sur l'accueil.",
  },
};
const CHANNELS = ["email", "whatsapp", "signal"];

export function isToggleId(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TOGGLES, id);
}

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
export function readPath(value, path) {
  let cur = value;
  for (const k of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}
// Copie la valeur en changeant UN seul champ. Ne modifie jamais l'original.
export function setPath(value, path, next) {
  const head = path[0];
  const rest = path.slice(1);
  const base = isObj(value) ? value : {};
  const out = Object.assign({}, base);
  out[head] = rest.length ? setPath(base[head], rest, next) : next;
  return out;
}

function contactWarning(t, value, next) {
  if (!t.channel) return "";
  if (next) {
    const v = readPath(value, [t.channel, "value"]);
    return typeof v === "string" && v.trim() ? "" : "Attention : aucune valeur n'est renseignée pour ce canal, il ne s'affichera pas sur le site (à renseigner dans Contenu du site › Contact).";
  }
  const anyActive = CHANNELS.some((ch) => readPath(value, [ch, "enabled"]) === true);
  return anyActive ? "" : "Attention : plus aucun canal de contact n'est actif sur le site.";
}

// Prépare l'écriture. rows : { clé: { value, updated_at, ... } } (lecture de site_settings par l'onglet).
export function planToggle(rows, id, next) {
  if (!isToggleId(id)) return { ok: false, error: "Interrupteur inconnu." };
  if (typeof next !== "boolean") return { ok: false, error: "Valeur invalide." };
  const t = TOGGLES[id];
  const row = rows ? rows[t.key] : null;
  if (!row) return { ok: false, error: "Le réglage « " + t.key + " » n'existe pas encore en base : enregistrez-le d'abord depuis son écran (Contenu du site)." };
  if (!isObj(row.value)) return { ok: false, error: "Le réglage « " + t.key + " » est illisible : ouvrez son écran (Contenu du site) pour le corriger." };
  if (typeof row.updated_at !== "string" || !row.updated_at) return { ok: false, error: "La date de dernière modification du réglage est absente : cliquez sur « Actualiser »." };
  const current = readPath(row.value, t.path);
  if (typeof current !== "boolean") return { ok: false, error: "La valeur actuelle de ce réglage est illisible : ouvrez son écran (Contenu du site) pour le corriger." };
  if (current === next) return { ok: true, noop: true, t, row };
  const value = setPath(row.value, t.path, next);
  return { ok: true, noop: false, t, row, value, warn: contactWarning(t, value, next) };
}

export function friendlyError(err) {
  const msg = err && err.message ? err.message : typeof err === "string" ? err : "";
  if (/violates check constraint|site_settings_[a-z_]+_valid/i.test(msg)) {
    return "La base refuse cette valeur (règle de validation du réglage). Ouvrez l'écran du réglage pour vérifier ses champs.";
  }
  if (/row-level security|permission denied|not authorized|unauthorized|jwt/i.test(msg)) {
    return "Modification refusée : ce compte n'a pas les droits d'administration.";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages est introuvable. Vérifiez que supabase_site_settings.sql a été exécuté.";
  }
  if (/failed to fetch|network|reseau|timeout/i.test(msg)) {
    return "Connexion impossible. Réessayez dans un instant.";
  }
  return "Échec de l'enregistrement" + (msg ? " (" + msg + ")" : "") + ".";
}

// Écrit le champ visé, seulement si la ligne n'a pas changé depuis son affichage (comparaison sur updated_at).
export async function toggleSetting(client, rows, id, next) {
  const plan = planToggle(rows, id, next);
  if (!plan.ok) return { ok: false, conflict: false, error: plan.error };
  if (plan.noop) return { ok: true, noop: true, message: "Ce réglage était déjà dans cet état.", warn: "" };
  try {
    const res = await client
      .from(SETTINGS_TABLE)
      .update({ value: plan.value })
      .eq("key", plan.t.key)
      .eq("updated_at", plan.row.updated_at)
      .select("key");
    if (res.error) return { ok: false, conflict: false, error: friendlyError(res.error) };
    if (!Array.isArray(res.data) || res.data.length !== 1) {
      return {
        ok: false,
        conflict: true,
        error: "Le réglage n'a pas été modifié : il a changé entre-temps (autre écran ou autre session), ou ce compte n'a pas les droits d'administration. Les valeurs ont été relues, vérifiez puis recommencez.",
      };
    }
    return { ok: true, noop: false, message: (next ? plan.t.on : plan.t.off) + SEEN, warn: plan.warn };
  } catch (e) {
    return { ok: false, conflict: false, error: friendlyError(e) };
  }
}

// rows : réglages lus par l'onglet ; reload : relit les réglages après une bascule (et donc le journal)
export function useConfigToggle(rows, reload) {
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState(null);
  const busy = useRef(false);
  const run = useCallback(
    async (id, next) => {
      if (busy.current) return;
      busy.current = true;
      setBusyId(id);
      setNotice(null);
      let res;
      try {
        res = await toggleSetting(supabase, rows, id, next);
      } catch (e) {
        res = { ok: false, conflict: false, error: friendlyError(e) };
      }
      if (res.ok) setNotice({ type: res.warn ? "warn" : "ok", text: res.message + (res.warn ? " " + res.warn : "") });
      else setNotice({ type: "error", text: res.error });
      if (res.ok || res.conflict) reload();
      busy.current = false;
      setBusyId("");
    },
    [rows, reload]
  );
  useEffect(() => {
    if (!notice || notice.type === "error") return undefined;
    const timer = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(timer);
  }, [notice]);
  return { busyId, notice, run };
}
