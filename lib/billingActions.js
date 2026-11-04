// lib/billingActions.js
// ZENORIA_CONFIG_C3C_V1
//
// Ecriture de l'interrupteur « Assujettie a la TVA » (cle "billing", champ vat_enabled).
// Utilisee par components/AdminConfig.js via SensitiveSwitch (confirmation "BINHEMI").
// Regles : on relit la valeur en base juste avant d'ecrire (pas de valeur perimee), on ne
// change QUE vat_enabled, les autres champs sont conserves. Les factures deja emises ne sont
// jamais touchees (elles sont figees dans la table invoices, voir lib/billingSettings.js).
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { BILLING_KEY, parseBillingSetting, billingMissingFields } from "@/lib/billingSettings";

// true  : l'activation est refusee tant que l'identite du vendeur est incomplete
//         (SIRET, adresse, n° de TVA intracommunautaire... selon billingMissingFields).
// false : l'activation est toujours permise (l'avertissement du panneau reste affiche).
export const BLOCK_ON_MISSING = true;

export class VatNotReadyError extends Error {}

// next : bool, valeur cible. Retourne la valeur ecrite, ou leve une erreur.
export async function setVatEnabled(next) {
  const { data, error: readError } = await supabase
    .from(SITE_SETTINGS_TABLE)
    .select("value")
    .eq("key", BILLING_KEY)
    .maybeSingle();
  if (readError) throw readError;
  if (!data) throw new Error("Le réglage de facturation est introuvable : le réglage n'a pas été modifié.");

  const raw = data.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value : {};
  const parsed = parseBillingSetting(raw);

  if (next && BLOCK_ON_MISSING) {
    const missing = billingMissingFields({ ...parsed, vat_enabled: true });
    if (missing.length) {
      throw new VatNotReadyError(
        "Pour activer la TVA, complétez d'abord dans Facturation et TVA : " + missing.join(", ") + "."
      );
    }
  }

  const value = { ...raw, ...parsed, vat_enabled: next };
  const { error } = await supabase
    .from(SITE_SETTINGS_TABLE)
    .upsert({ key: BILLING_KEY, value }, { onConflict: "key" });
  if (error) throw error;
  return value;
}
