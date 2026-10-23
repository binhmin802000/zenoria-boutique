// ============================================================
// RÉGLAGES DES MOYENS DE PAIEMENT — ZENORIA_PAYMENT_STEP2_V1
//
// Fichier SANS dépendance, sur le modèle de lib/billingSettings.js.
// Utilisé par l'administration (components/AdminPaymentMethods.js) et par pages/api/checkout.js.
//
// Deux clés distinctes dans la table « site_settings » :
//
//  1. « payment_methods » — LISIBLE PAR LE PUBLIC (le panier doit savoir quoi proposer) :
//       { "stripe_enabled": true, "transfer_enabled": false }
//     Clé absente = carte active, virement désactivé (valeurs par défaut ci-dessous).
//
//  2. « bank_transfer » — RÉSERVÉE AUX ADMINISTRATEURS (coordonnées bancaires) :
//       { "beneficiary": "", "iban": "", "bic": "", "delay_days": 3 }
//     Jamais dans la lecture publique : elle sera servie par une route serveur, uniquement à la
//     cliente propriétaire de la commande.
//     delay_days : entier de 1 à 60 (contrainte site_settings_bank_transfer_valid en base).
//     C'est une date limite INDICATIVE : aucune annulation automatique n'est faite à son échéance.
// ============================================================

export const PAYMENT_METHODS_KEY = "payment_methods";
export const BANK_TRANSFER_KEY = "bank_transfer";
export const DELAY_MIN = 1;
export const DELAY_MAX = 60;

export const DEFAULT_PAYMENT_METHODS = Object.freeze({ stripe_enabled: true, transfer_enabled: false });
export const DEFAULT_BANK_TRANSFER = Object.freeze({ beneficiary: "", iban: "", bic: "", delay_days: 3 });

export function parsePaymentMethods(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    stripe_enabled: typeof v.stripe_enabled === "boolean" ? v.stripe_enabled : DEFAULT_PAYMENT_METHODS.stripe_enabled,
    transfer_enabled: typeof v.transfer_enabled === "boolean" ? v.transfer_enabled : DEFAULT_PAYMENT_METHODS.transfer_enabled,
  };
}

// IBAN et BIC : espaces ignorés, majuscules. L'IBAN est enregistré sans espaces et affiché par groupes de 4.
export function normalizeIban(v) {
  return String(v === null || v === undefined ? "" : v).replace(/\s+/g, "").toUpperCase();
}
export function normalizeBic(v) {
  return String(v === null || v === undefined ? "" : v).replace(/\s+/g, "").toUpperCase();
}
export function formatIban(v) {
  return normalizeIban(v).replace(/(.{4})/g, "$1 ").trim();
}

// Contrôle de l'IBAN (format + clé modulo 97) : évite d'afficher à une cliente un IBAN mal recopié.
export function isValidIban(v) {
  const s = normalizeIban(v);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const code = ch >= "A" ? ch.charCodeAt(0) - 55 : Number(ch);
    rem = Number(String(rem) + String(code)) % 97;
  }
  return rem === 1;
}
export function isValidBic(v) {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normalizeBic(v));
}

export function parseBankTransfer(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const d = Number(v.delay_days);
  return {
    beneficiary: typeof v.beneficiary === "string" ? v.beneficiary.slice(0, 120) : "",
    iban: typeof v.iban === "string" ? normalizeIban(v.iban).slice(0, 40) : "",
    bic: typeof v.bic === "string" ? normalizeBic(v.bic).slice(0, 16) : "",
    delay_days: Number.isInteger(d) && d >= DELAY_MIN && d <= DELAY_MAX ? d : DEFAULT_BANK_TRANSFER.delay_days,
  };
}

// Valeur enregistrée en base (à n'appeler qu'après validation du brouillon)
export function buildBankTransferValue(draft) {
  const d = draft || {};
  return {
    beneficiary: String(d.beneficiary || "").trim().slice(0, 120),
    iban: normalizeIban(d.iban).slice(0, 40),
    bic: normalizeBic(d.bic).slice(0, 16),
    delay_days: Number(d.delay_days),
  };
}

export function sameBankTransfer(a, b) {
  const x = buildBankTransferValue(a);
  const y = buildBankTransferValue(b);
  return x.beneficiary === y.beneficiary && x.iban === y.iban && x.bic === y.bic && String(x.delay_days) === String(y.delay_days);
}

export function isValidDelay(v) {
  const n = Number(v);
  return v !== "" && v !== null && v !== undefined && Number.isInteger(n) && n >= DELAY_MIN && n <= DELAY_MAX;
}

// Le virement ne peut être activé que si la cliente verra de vraies coordonnées
export function isTransferReady(bank) {
  const b = bank || {};
  return String(b.beneficiary || "").trim() !== "" && isValidIban(b.iban);
}

export function bankMissingFields(bank) {
  const b = bank || {};
  const missing = [];
  if (!String(b.beneficiary || "").trim()) missing.push("bénéficiaire");
  if (!normalizeIban(b.iban)) missing.push("IBAN");
  if (!normalizeBic(b.bic)) missing.push("BIC");
  return missing;
}
