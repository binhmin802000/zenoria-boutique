// lib/paymentActions.js
// ZENORIA_CONFIG_C3B_V1
//
// Fonction d'écriture PARTAGÉE pour les moyens de paiement (clé "payment_methods").
// Utilisée par components/AdminPaymentMethods.js (Admin > CRM > Commandes) ET par
// components/AdminConfig.js (onglet Configuration, lot C3) via SensitiveSwitch, afin de
// garantir un seul chemin d'écriture et un seul garde-fou (isTransferReady).
//
// lib/paymentSettings.js reste volontairement "sans dépendance" (voir son en-tête) : la
// dépendance à supabase est isolée ici, pas ajoutée à paymentSettings.js.
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { PAYMENT_METHODS_KEY, isTransferReady } from "@/lib/paymentSettings";

// Levée quand on tente d'activer le virement sans bénéficiaire/IBAN valides déjà enregistrés.
export class TransferNotReadyError extends Error {}

// currentMethods : { stripe_enabled, transfer_enabled } (déjà parsé via parsePaymentMethods)
// savedBank      : { beneficiary, iban, bic, delay_days, grace_days } (déjà parsé via parseBankTransfer)
// field          : "stripe_enabled" | "transfer_enabled"
// next           : bool, valeur cible
// Retourne la nouvelle valeur écrite, ou lève une erreur (TransferNotReadyError ou erreur Supabase).
export async function setPaymentMethod(currentMethods, savedBank, field, next) {
  if (field === "transfer_enabled" && next && !isTransferReady(savedBank)) {
    throw new TransferNotReadyError(
      "Pour activer le virement, renseignez puis enregistrez d'abord le bénéficiaire et un IBAN valide."
    );
  }
  const value = {
    stripe_enabled: field === "stripe_enabled" ? next : currentMethods.stripe_enabled,
    transfer_enabled: field === "transfer_enabled" ? next : currentMethods.transfer_enabled,
  };
  const { error } = await supabase
    .from(SITE_SETTINGS_TABLE)
    .upsert({ key: PAYMENT_METHODS_KEY, value }, { onConflict: "key" });
  if (error) throw error;
  return value;
}
