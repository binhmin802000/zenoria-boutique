// ZENORIA_CONTACT_SETTINGS_V1
// ============================================================
// RÉGLAGE DES CANAUX DE CONTACT (e-mail, WhatsApp, Signal)
//
// Fichier SANS dépendance : utilisé par la page d'accueil (pages/index.js,
// footer) et l'administration (components/AdminContact.js, onglet
// « Contenu du site »).
//
// Enregistrement : table « site_settings », clé « contact », valeur JSON :
//   {
//     "email":    { "enabled": true,  "value": "bagues.mandala@proton.me" },
//     "whatsapp": { "enabled": false, "value": "" },
//     "signal":   { "enabled": false, "value": "" }
//   }
//   enabled : interrupteur (true : affiché sur le site, false : masqué)
//   value   : adresse e-mail (canal email) ou numéro de téléphone au
//             format international sans espaces (canaux whatsapp/signal,
//             ex. "+33612345678")
//
// Voir supabase_site_settings_contact.sql pour la contrainte de
// validation correspondante.
//
// Si le réglage est absent ou illisible, le site utilise
// DEFAULT_CONTACT : seul l'e-mail est activé, avec l'adresse historique
// déjà utilisée dans le footer avant ce chantier.
// ============================================================

export const CONTACT_KEY = "contact";

export const DEFAULT_CONTACT = Object.freeze({
  email: Object.freeze({ enabled: true, value: "bagues.mandala@proton.me" }),
  whatsapp: Object.freeze({ enabled: false, value: "" }),
  signal: Object.freeze({ enabled: false, value: "" }),
});

const CHANNELS = ["email", "whatsapp", "signal"];

function parseChannel(value, fallback) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : fallback.enabled,
    value: typeof v.value === "string" ? v.value : fallback.value,
  };
}

// Lit la valeur enregistrée. Tout ce qui n'est pas reconnu (table absente,
// valeur abîmée, champ manquant) redonne la valeur par défaut, canal par
// canal : le site n'affiche jamais un contact vide ou cassé par accident.
export function parseContactSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const ch of CHANNELS) {
    out[ch] = parseChannel(v[ch], DEFAULT_CONTACT[ch]);
  }
  return out;
}

// Valeur à enregistrer depuis le formulaire (toujours complète et valide)
export function buildContactValue(s) {
  return parseContactSetting(s);
}

export function sameContactSetting(a, b) {
  const x = parseContactSetting(a);
  const y = parseContactSetting(b);
  return CHANNELS.every((ch) => x[ch].enabled === y[ch].enabled && x[ch].value === y[ch].value);
}

// Construit l'URL mailto:, avec objet et corps pré-remplis (texte neutre,
// valable quel que soit le motif de contact de la cliente).
export function buildMailtoLink(email) {
  const subject = encodeURIComponent("Question depuis le site Zenoria");
  const body = encodeURIComponent("Bonjour,\r\n\r\n");
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

// Construit l'URL wa.me : WhatsApp attend uniquement des chiffres (sans
// le "+", sans espaces, sans tirets).
export function buildWhatsAppLink(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

// Construit l'URL signal.me : Signal attend le format international
// complet avec le "+".
export function buildSignalLink(phone) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  return `https://signal.me/#p/+${digits}`;
}

// Texte du réglage enregistré, pour l'administration
export function describeContact(setting) {
  const s = parseContactSetting(setting);
  const parts = CHANNELS.filter((ch) => s[ch].enabled).map((ch) => {
    const label = ch === "email" ? "e-mail" : ch === "whatsapp" ? "WhatsApp" : "Signal";
    return label;
  });
  return parts.length > 0 ? `activés : ${parts.join(", ")}` : "aucun canal activé";
}

// Lecture côté site. Ne lève jamais d'erreur : en cas de problème, on
// renvoie le réglage par défaut.
export async function fetchContactSetting(client, table = "site_settings") {
  try {
    const res = await client.from(table).select("value").eq("key", CONTACT_KEY).maybeSingle();
    if (res && !res.error && res.data) return parseContactSetting(res.data.value);
  } catch (e) {
    // réglage illisible : valeur par défaut
  }
  return DEFAULT_CONTACT;
}
