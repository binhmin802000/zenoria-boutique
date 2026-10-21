// ============================================================
// RÉGLAGES DE FACTURATION (TVA + identité vendeur) — ZENORIA_BILLING_STEP2_V1
//
// Fichier SANS dépendance, sur le modèle de lib/reviewsSettings.js.
// Utilisé par l'administration (components/AdminBilling.js) et par la fonction SQL
// issue_invoice_for_order (supabase_invoices.sql), qui lit directement la colonne jsonb.
//
// Enregistrement : table « site_settings », clé « billing », valeur JSON :
//     { "vat_enabled": false, "vat_rate": 20,
//       "seller_name": "", "seller_address": "", "seller_siret": "", "seller_vat_number": "" }
//
//   vat_enabled : interrupteur « Assujettie à la TVA » (false par défaut : franchise en base)
//   vat_rate    : taux en %, utilisé seulement si vat_enabled = true
//
// Option A (validée) : si vat_enabled passe à true, LES PRIX AFFICHÉS NE CHANGENT PAS.
// La TVA est alors calculée comme incluse dans ces prix (montant HT = TTC / (1 + taux/100)).
// Chaque facture déjà émise garde ses propres valeurs figées (table invoices) : changer ce
// réglage n'affecte jamais une facture déjà émise, seulement les prochaines.
//
// Tant qu'un champ vendeur est vide, la facture affiche « À compléter » plutôt qu'un blanc
// silencieux (voir pages/compte.js / l'admin, describeBilling ci-dessous).
// Cette clé n'est volontairement PAS dans la lecture publique de site_settings (elle peut
// contenir le SIRET) : réservée aux administrateurs.
// ============================================================

export const BILLING_KEY = "billing";

export const DEFAULT_BILLING = Object.freeze({
  vat_enabled: false,
  vat_rate: 20,
  seller_name: "",
  seller_address: "",
  seller_siret: "",
  seller_vat_number: "",
});

export function parseBillingSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rate = Number(v.vat_rate);
  return {
    vat_enabled: typeof v.vat_enabled === "boolean" ? v.vat_enabled : DEFAULT_BILLING.vat_enabled,
    vat_rate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : DEFAULT_BILLING.vat_rate,
    seller_name: typeof v.seller_name === "string" ? v.seller_name.slice(0, 200) : "",
    seller_address: typeof v.seller_address === "string" ? v.seller_address.slice(0, 300) : "",
    seller_siret: typeof v.seller_siret === "string" ? v.seller_siret.slice(0, 40) : "",
    seller_vat_number: typeof v.seller_vat_number === "string" ? v.seller_vat_number.slice(0, 40) : "",
  };
}

export function buildBillingValue(s) {
  return parseBillingSetting(s);
}

export function sameBillingSetting(a, b) {
  const x = parseBillingSetting(a);
  const y = parseBillingSetting(b);
  return Object.keys(DEFAULT_BILLING).every((k) => x[k] === y[k]);
}

// Résumé pour l'admin : ce qui manque avant de pouvoir émettre une vraie facture conforme
export function billingMissingFields(setting) {
  const s = parseBillingSetting(setting);
  const missing = [];
  if (!s.seller_name) missing.push("nom du vendeur");
  if (!s.seller_address) missing.push("adresse");
  if (!s.seller_siret) missing.push("SIRET");
  if (s.vat_enabled && !s.seller_vat_number) missing.push("n° de TVA intracommunautaire");
  return missing;
}

export function describeBilling(setting) {
  const s = parseBillingSetting(setting);
  const missing = billingMissingFields(s);
  const base = s.vat_enabled ? `TVA activée (${s.vat_rate} %)` : "TVA non applicable (franchise en base)";
  return missing.length ? `${base} · à compléter : ${missing.join(", ")}` : `${base} · informations complètes`;
}
