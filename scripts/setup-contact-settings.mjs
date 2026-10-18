// scripts/setup-contact-settings.mjs
//
// Met en place le reglage "contact" (e-mail, WhatsApp, Signal),
// activable/desactivable et editable depuis /admin > Produits > Contenu
// du site, sur le meme modele que le reglage de livraison offerte
// (lib/shippingSettings.js, components/AdminShipping.js).
//
//   1. Cree lib/contactSettings.js : fonctions parse/build/same,
//      constructeurs de liens (mailto, wa.me, signal.me), valeur par
//      defaut (seul l'e-mail active, avec l'adresse deja en place dans
//      le footer).
//   2. Cree components/AdminContact.js : carte admin avec un
//      interrupteur + un champ de saisie par canal.
//   3. Modifie components/AdminSiteMedia.js : importe et affiche
//      <AdminContact /> juste apres <AdminShipping />.
//
// Prerequis : la contrainte site_settings_contact_valid doit deja
// exister (voir supabase_site_settings_contact.sql).
//
// Garanties : verifie l'etat des fichiers avant d'ecrire ; n'ecrase
// jamais un fichier existant avec un contenu different ; conserve les
// fins de ligne ; peut etre relance sans effet.
//
// Usage : node scripts/setup-contact-settings.mjs

import fs from "node:fs";
import path from "node:path";

const CONTACT_SETTINGS_CONTENT = [
  "// ZENORIA_CONTACT_SETTINGS_V1",
  "// ============================================================",
  "// R\u00c9GLAGE DES CANAUX DE CONTACT (e-mail, WhatsApp, Signal)",
  "//",
  "// Fichier SANS d\u00e9pendance : utilis\u00e9 par la page d'accueil (pages/index.js,",
  "// footer) et l'administration (components/AdminContact.js, onglet",
  "// \u00ab Contenu du site \u00bb).",
  "//",
  "// Enregistrement : table \u00ab site_settings \u00bb, cl\u00e9 \u00ab contact \u00bb, valeur JSON :",
  "//   {",
  "//     \"email\":    { \"enabled\": true,  \"value\": \"bagues.mandala@proton.me\" },",
  "//     \"whatsapp\": { \"enabled\": false, \"value\": \"\" },",
  "//     \"signal\":   { \"enabled\": false, \"value\": \"\" }",
  "//   }",
  "//   enabled : interrupteur (true : affich\u00e9 sur le site, false : masqu\u00e9)",
  "//   value   : adresse e-mail (canal email) ou num\u00e9ro de t\u00e9l\u00e9phone au",
  "//             format international sans espaces (canaux whatsapp/signal,",
  "//             ex. \"+33612345678\")",
  "//",
  "// Voir supabase_site_settings_contact.sql pour la contrainte de",
  "// validation correspondante.",
  "//",
  "// Si le r\u00e9glage est absent ou illisible, le site utilise",
  "// DEFAULT_CONTACT : seul l'e-mail est activ\u00e9, avec l'adresse historique",
  "// d\u00e9j\u00e0 utilis\u00e9e dans le footer avant ce chantier.",
  "// ============================================================",
  "",
  "export const CONTACT_KEY = \"contact\";",
  "",
  "export const DEFAULT_CONTACT = Object.freeze({",
  "  email: Object.freeze({ enabled: true, value: \"bagues.mandala@proton.me\" }),",
  "  whatsapp: Object.freeze({ enabled: false, value: \"\" }),",
  "  signal: Object.freeze({ enabled: false, value: \"\" }),",
  "});",
  "",
  "const CHANNELS = [\"email\", \"whatsapp\", \"signal\"];",
  "",
  "function parseChannel(value, fallback) {",
  "  const v = value && typeof value === \"object\" && !Array.isArray(value) ? value : {};",
  "  return {",
  "    enabled: typeof v.enabled === \"boolean\" ? v.enabled : fallback.enabled,",
  "    value: typeof v.value === \"string\" ? v.value : fallback.value,",
  "  };",
  "}",
  "",
  "// Lit la valeur enregistr\u00e9e. Tout ce qui n'est pas reconnu (table absente,",
  "// valeur ab\u00eem\u00e9e, champ manquant) redonne la valeur par d\u00e9faut, canal par",
  "// canal : le site n'affiche jamais un contact vide ou cass\u00e9 par accident.",
  "export function parseContactSetting(value) {",
  "  const v = value && typeof value === \"object\" && !Array.isArray(value) ? value : {};",
  "  const out = {};",
  "  for (const ch of CHANNELS) {",
  "    out[ch] = parseChannel(v[ch], DEFAULT_CONTACT[ch]);",
  "  }",
  "  return out;",
  "}",
  "",
  "// Valeur \u00e0 enregistrer depuis le formulaire (toujours compl\u00e8te et valide)",
  "export function buildContactValue(s) {",
  "  return parseContactSetting(s);",
  "}",
  "",
  "export function sameContactSetting(a, b) {",
  "  const x = parseContactSetting(a);",
  "  const y = parseContactSetting(b);",
  "  return CHANNELS.every((ch) => x[ch].enabled === y[ch].enabled && x[ch].value === y[ch].value);",
  "}",
  "",
  "// Construit l'URL mailto:, avec objet et corps pr\u00e9-remplis (texte neutre,",
  "// valable quel que soit le motif de contact de la cliente).",
  "export function buildMailtoLink(email) {",
  "  const subject = encodeURIComponent(\"Question depuis le site Zenoria\");",
  "  const body = encodeURIComponent(\"Bonjour,\\r\\n\\r\\n\");",
  "  return `mailto:${email}?subject=${subject}&body=${body}`;",
  "}",
  "",
  "// Construit l'URL wa.me : WhatsApp attend uniquement des chiffres (sans",
  "// le \"+\", sans espaces, sans tirets).",
  "export function buildWhatsAppLink(phone) {",
  "  const digits = String(phone || \"\").replace(/\\D/g, \"\");",
  "  return `https://wa.me/${digits}`;",
  "}",
  "",
  "// Construit l'URL signal.me : Signal attend le format international",
  "// complet avec le \"+\".",
  "export function buildSignalLink(phone) {",
  "  const digits = String(phone || \"\").replace(/[^\\d]/g, \"\");",
  "  return `https://signal.me/#p/+${digits}`;",
  "}",
  "",
  "// Texte du r\u00e9glage enregistr\u00e9, pour l'administration",
  "export function describeContact(setting) {",
  "  const s = parseContactSetting(setting);",
  "  const parts = CHANNELS.filter((ch) => s[ch].enabled).map((ch) => {",
  "    const label = ch === \"email\" ? \"e-mail\" : ch === \"whatsapp\" ? \"WhatsApp\" : \"Signal\";",
  "    return label;",
  "  });",
  "  return parts.length > 0 ? `activ\u00e9s : ${parts.join(\", \")}` : \"aucun canal activ\u00e9\";",
  "}",
  "",
  "// Lecture c\u00f4t\u00e9 site. Ne l\u00e8ve jamais d'erreur : en cas de probl\u00e8me, on",
  "// renvoie le r\u00e9glage par d\u00e9faut.",
  "export async function fetchContactSetting(client, table = \"site_settings\") {",
  "  try {",
  "    const res = await client.from(table).select(\"value\").eq(\"key\", CONTACT_KEY).maybeSingle();",
  "    if (res && !res.error && res.data) return parseContactSetting(res.data.value);",
  "  } catch (e) {",
  "    // r\u00e9glage illisible : valeur par d\u00e9faut",
  "  }",
  "  return DEFAULT_CONTACT;",
  "}",
].join("\r\n") + "\r\n";

const ADMIN_CONTACT_CONTENT = [
  "// ZENORIA_ADMIN_CONTACT_V1",
  "import React, { useCallback, useEffect, useMemo, useState } from \"react\";",
  "import { Mail, RefreshCw } from \"lucide-react\";",
  "import { supabase } from \"@/lib/supabase\";",
  "import { SITE_SETTINGS_TABLE } from \"@/lib/siteSettings\";",
  "import {",
  "  CONTACT_KEY,",
  "  DEFAULT_CONTACT,",
  "  parseContactSetting,",
  "  buildContactValue,",
  "  sameContactSetting,",
  "  describeContact,",
  "} from \"@/lib/contactSettings\";",
  "",
  "// ============================================================",
  "// CARTE \u00ab CANAUX DE CONTACT \u00bb (onglet \u00ab Contenu du site \u00bb de /admin)",
  "//",
  "// Trois canaux independants, enregistres dans la table \u00ab site_settings \u00bb",
  "// (cle \u00ab contact \u00bb) : e-mail, WhatsApp, Signal. Chacun a son propre",
  "// interrupteur (affiche ou masque sur le site) et sa propre valeur",
  "// (adresse e-mail ou numero de telephone).",
  "//",
  "// Le footer du site (pages/index.js) lit ce meme reglage : aucun canal",
  "// ne peut etre affiche sur le site sans etre a la fois active ET",
  "// renseigne ici.",
  "// ============================================================",
  "",
  "const TIME_ZONE = \"Europe/Paris\";",
  "",
  "function formatDateTime(value) {",
  "  if (!value) return null;",
  "  return new Date(value).toLocaleString(\"fr-FR\", { dateStyle: \"short\", timeStyle: \"short\", timeZone: TIME_ZONE });",
  "}",
  "",
  "function friendlyError(err) {",
  "  const msg = (err && err.message) || String(err || \"\");",
  "  if (/site_settings_contact_valid|violates check constraint/i.test(msg)) {",
  "    return \"La valeur est refus\u00e9e par la base. Ex\u00e9cutez le script supabase_site_settings_contact.sql dans Supabase (SQL Editor), puis r\u00e9essayez.\";",
  "  }",
  "  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {",
  "    return \"La table des r\u00e9glages n'est pas install\u00e9e. Ex\u00e9cutez le script supabase_site_settings_contact.sql dans Supabase (SQL Editor).\";",
  "  }",
  "  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {",
  "    return \"Enregistrement refus\u00e9 : ce compte n'a pas les droits d'administration.\";",
  "  }",
  "  return msg;",
  "}",
  "",
  "const CHANNEL_META = {",
  "  email: { label: \"E-mail\", placeholder: \"contact@zenoria.fr\", helper: \"Adresse e-mail affich\u00e9e dans le pied de page du site.\" },",
  "  whatsapp: { label: \"WhatsApp\", placeholder: \"+33612345678\", helper: \"Num\u00e9ro au format international (ex. +33612345678), jamais affich\u00e9 en clair : seul un bouton \u00ab WhatsApp \u00bb appara\u00eet sur le site.\" },",
  "  signal: { label: \"Signal\", placeholder: \"+33612345678\", helper: \"Num\u00e9ro au format international (ex. +33612345678), jamais affich\u00e9 en clair : seul un bouton \u00ab Signal \u00bb appara\u00eet sur le site.\" },",
  "};",
  "",
  "export default function AdminContact() {",
  "  const [row, setRow] = useState(null);",
  "  const [draftState, setDraftState] = useState(DEFAULT_CONTACT);",
  "  const [loading, setLoading] = useState(true);",
  "  const [loadError, setLoadError] = useState(\"\");",
  "  const [saving, setSaving] = useState(false);",
  "  const [error, setError] = useState(\"\");",
  "  const [toast, setToast] = useState(\"\");",
  "",
  "  const load = useCallback(async () => {",
  "    setLoading(true);",
  "    setLoadError(\"\");",
  "    try {",
  "      const res = await supabase.from(SITE_SETTINGS_TABLE).select(\"*\").eq(\"key\", CONTACT_KEY).maybeSingle();",
  "      if (res.error) {",
  "        setLoadError(friendlyError(res.error));",
  "      } else {",
  "        const saved = res.data || null;",
  "        setRow(saved);",
  "        setDraftState(parseContactSetting(saved ? saved.value : null));",
  "      }",
  "    } catch (err) {",
  "      setLoadError(friendlyError(err));",
  "    }",
  "    setLoading(false);",
  "  }, []);",
  "",
  "  useEffect(() => {",
  "    load();",
  "  }, [load]);",
  "",
  "  useEffect(() => {",
  "    if (!toast) return undefined;",
  "    const t = setTimeout(() => setToast(\"\"), 4000);",
  "    return () => clearTimeout(t);",
  "  }, [toast]);",
  "",
  "  const saved = useMemo(() => parseContactSetting(row ? row.value : null), [row]);",
  "  const dirty = !sameContactSetting(draftState, saved);",
  "  const disabled = loading || Boolean(loadError) || saving;",
  "  const savedAt = row ? formatDateTime(row.updated_at) : null;",
  "",
  "  const setChannel = (channel, patch) => {",
  "    setDraftState((prev) => ({ ...prev, [channel]: { ...prev[channel], ...patch } }));",
  "    setError(\"\");",
  "  };",
  "",
  "  const save = async () => {",
  "    setError(\"\");",
  "    setSaving(true);",
  "    try {",
  "      const { error: err } = await supabase",
  "        .from(SITE_SETTINGS_TABLE)",
  "        .upsert({ key: CONTACT_KEY, value: buildContactValue(draftState) }, { onConflict: \"key\" });",
  "      if (err) throw err;",
  "      setToast(\"R\u00e9glage enregistr\u00e9. Les visiteuses le voient au prochain chargement de la page.\");",
  "      await load();",
  "    } catch (err) {",
  "      setError(\"\u00c9chec de l'enregistrement : \" + friendlyError(err));",
  "    }",
  "    setSaving(false);",
  "  };",
  "",
  "  return (",
  "    <section data-testid=\"contact-panel\" className=\"mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5\">",
  "      <div className=\"flex justify-between items-start gap-3\">",
  "        <div className=\"min-w-0\">",
  "          <h2 className=\"font-serif text-xl flex items-center gap-2\">",
  "            <Mail size={18} className=\"text-[#8f6075]\" /> Canaux de contact",
  "          </h2>",
  "          <p className=\"text-xs text-[#8b737e] mt-1 leading-4\">",
  "            Activez ou d\u00e9sactivez l&apos;e-mail, WhatsApp et Signal affich\u00e9s dans le pied de page du site, et renseignez l&apos;adresse ou le num\u00e9ro associ\u00e9 \u00e0 chacun.",
  "          </p>",
  "        </div>",
  "        <button",
  "          type=\"button\"",
  "          onClick={load}",
  "          disabled={loading}",
  "          aria-label=\"Actualiser les r\u00e9glages de contact\"",
  "          className=\"shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60\"",
  "        >",
  "          <RefreshCw size={14} className={loading ? \"animate-spin\" : \"\"} />",
  "        </button>",
  "      </div>",
  "",
  "      {toast && <div data-testid=\"contact-toast\" className=\"mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm\">{toast}</div>}",
  "      {loadError && <div data-testid=\"contact-load-error\" role=\"alert\" className=\"mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm\">{loadError}</div>}",
  "      {error && <div data-testid=\"contact-error\" role=\"alert\" className=\"mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm\">{error}</div>}",
  "",
  "      <div className=\"mt-5 space-y-4\">",
  "        {Object.keys(CHANNEL_META).map((channel) => {",
  "          const meta = CHANNEL_META[channel];",
  "          const ch = draftState[channel];",
  "          return (",
  "            <div key={channel} className=\"rounded-xl border border-[#eee2e5] px-4 py-3.5\">",
  "              <div className=\"flex items-center justify-between gap-4\">",
  "                <div className=\"min-w-0\">",
  "                  <div className=\"text-sm font-medium\" id={`contact-switch-label-${channel}`}>{meta.label}</div>",
  "                  <div className=\"text-[12px] text-[#756a70] leading-5\">{meta.helper}</div>",
  "                </div>",
  "                <button",
  "                  type=\"button\"",
  "                  role=\"switch\"",
  "                  aria-checked={ch.enabled}",
  "                  aria-labelledby={`contact-switch-label-${channel}`}",
  "                  disabled={disabled}",
  "                  onClick={() => setChannel(channel, { enabled: !ch.enabled })}",
  "                  data-testid={`contact-switch-${channel}`}",
  "                  className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${ch.enabled ? \"bg-[#8f6075]\" : \"bg-[#d9c5cc]\"}`}",
  "                >",
  "                  <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${ch.enabled ? \"translate-x-5\" : \"\"}`} />",
  "                </button>",
  "              </div>",
  "              <label className=\"block mt-3 text-sm\">",
  "                <span className=\"block text-xs text-[#8b737e]\">{channel === \"email\" ? \"Adresse e-mail\" : \"Num\u00e9ro de t\u00e9l\u00e9phone\"}</span>",
  "                <input",
  "                  type=\"text\"",
  "                  value={ch.value}",
  "                  disabled={disabled}",
  "                  placeholder={meta.placeholder}",
  "                  onChange={(e) => setChannel(channel, { value: e.target.value })}",
  "                  data-testid={`contact-value-${channel}`}",
  "                  className=\"mt-1 w-full max-w-sm rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white disabled:opacity-60\"",
  "                />",
  "              </label>",
  "              {ch.enabled && !ch.value.trim() && (",
  "                <p className=\"text-[11px] text-amber-700 mt-1.5 leading-4\">",
  "                  Ce canal est activ\u00e9 mais aucune valeur n&apos;est renseign\u00e9e : il ne s&apos;affichera pas sur le site tant que ce champ est vide.",
  "                </p>",
  "              )}",
  "            </div>",
  "          );",
  "        })}",
  "      </div>",
  "",
  "      <div className=\"flex flex-wrap items-center gap-3 mt-5\">",
  "        <button",
  "          type=\"button\"",
  "          onClick={save}",
  "          disabled={disabled || !dirty}",
  "          data-testid=\"contact-save\"",
  "          className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]\"",
  "        >",
  "          {saving ? \"Enregistrement...\" : \"Enregistrer\"}",
  "        </button>",
  "        {!loadError && !loading && (",
  "          <p data-testid=\"contact-saved-text\" className=\"text-[11px] text-[#54434c] leading-4\">",
  "            R\u00e9glage actuel : <strong className=\"font-medium\">{describeContact(saved)}</strong>",
  "            {savedAt && (",
  "              <span className=\"text-[#8b737e]\">",
  "                {\" \"}",
  "                \u2014 modifi\u00e9 le {savedAt}",
  "                {row && row.updated_by_email ? ` par ${row.updated_by_email}` : \"\"}",
  "              </span>",
  "            )}",
  "            {!row && <span className=\"text-[#8b737e]\"> \u2014 rien d&apos;enregistr\u00e9 : valeur par d\u00e9faut</span>}",
  "          </p>",
  "        )}",
  "      </div>",
  "",
  "      <p className=\"text-[11px] text-[#8b737e] mt-3 leading-4\">",
  "        Le num\u00e9ro utilis\u00e9 pour WhatsApp et Signal n&apos;est jamais affich\u00e9 en clair sur le site : seul un bouton portant le nom du canal est visible, qui ouvre directement une conversation.",
  "      </p>",
  "    </section>",
  "  );",
  "}",
].join("\r\n") + "\r\n";

const contactSettingsPath = path.join("lib", "contactSettings.js");
const adminContactPath = path.join("components", "AdminContact.js");
const siteMediaPath = path.join("components", "AdminSiteMedia.js");

function writeIfAbsentOrSame(filePath, content, marker) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf8");
    if (existing.includes(marker)) {
      console.log(`= ${filePath} : déjà en place, inchangé.`);
      return false;
    }
    console.error(`✗ ${filePath} existe déjà avec un contenu différent — rien n'a été écrit.`);
    console.error("Supprimez-le ou renommez-le si vous voulez le remplacer, puis relancez ce script.");
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`✓ ${filePath} : créé.`);
  return true;
}

// ---------------------------------------------------------------------
// 1) lib/contactSettings.js
// ---------------------------------------------------------------------
writeIfAbsentOrSame(contactSettingsPath, CONTACT_SETTINGS_CONTENT, "ZENORIA_CONTACT_SETTINGS_V1");

// ---------------------------------------------------------------------
// 2) components/AdminContact.js
// ---------------------------------------------------------------------
writeIfAbsentOrSame(adminContactPath, ADMIN_CONTACT_CONTENT, "ZENORIA_ADMIN_CONTACT_V1");

// ---------------------------------------------------------------------
// 3) components/AdminSiteMedia.js : import + rendu
// ---------------------------------------------------------------------
if (!fs.existsSync(siteMediaPath)) {
  console.error(`✗ Fichier introuvable : ${siteMediaPath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(siteMediaPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("AdminContact")) {
  console.log(`= ${siteMediaPath} : <AdminContact /> déjà en place, inchangé.`);
} else {
  function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    return haystack.split(needle).length - 1;
  }

  const importNeedle = 'import AdminShipping from "@/components/AdminShipping";';
  const renderNeedle =
    "      {/* LIVRAISON OFFERTE : montant et interrupteur */}" + eol +
    "      <AdminShipping />";

  const importCount = countOccurrences(raw, importNeedle);
  const renderCount = countOccurrences(raw, renderNeedle);

  if (importCount !== 1 || renderCount !== 1) {
    console.error("✗ Repère(s) à adapter dans components/AdminSiteMedia.js — aucun fichier n'a été modifié.\n");
    if (importCount !== 1) console.error(`  • import de AdminShipping (${importCount} correspondance(s) trouvée(s), 1 attendue)`);
    if (renderCount !== 1) console.error(`  • rendu de <AdminShipping /> (${renderCount} correspondance(s) trouvée(s), 1 attendue)`);
    console.error("\nVérifiez le contenu actuel de components/AdminSiteMedia.js et collez-moi les lignes concernées.");
    process.exit(1);
  }

  let out = raw.replace(
    importNeedle,
    importNeedle + eol + 'import AdminContact from "@/components/AdminContact";'
  );
  out = out.replace(
    renderNeedle,
    "      {/* LIVRAISON OFFERTE : montant et interrupteur */}" + eol +
      "      <AdminShipping />" + eol +
      eol +
      "      {/* CANAUX DE CONTACT : e-mail, WhatsApp, Signal */}" + eol +
      "      <AdminContact />"
  );

  fs.writeFileSync(siteMediaPath, out, "utf8");
  console.log(`✓ ${siteMediaPath} : <AdminContact /> ajouté juste après <AdminShipping />.`);
}

console.log("\nTerminé.");
