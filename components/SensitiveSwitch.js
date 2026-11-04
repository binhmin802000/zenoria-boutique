// components/SensitiveSwitch.js
// ZENORIA_CONFIG_C3B_KNOB_V1
// ZENORIA_CONFIG_C3B_LAYOUT_V1
// ZENORIA_CONFIG_C3A_V1
//
// Interrupteur "sensible" pour l'onglet Configuration (lot C3).
// Contrairement à ConfigSwitch (lot C2, bascule immédiate), ce composant
// exige la saisie du mot de confirmation "BINHEMI" avant d'exécuter l'action.
// Utilisé pour : Stripe, Virement, TVA (lot C3). La Maintenance n'utilise PAS
// ce composant (elle reste pilotée depuis son propre onglet).
//
// Props:
// - id            : string, identifiant unique (pour aria-* et data-testid)
// - label         : string, libellé affiché à côté de l'interrupteur
// - description   : string (optionnel), texte d'aide sous le libellé
// - checked       : bool, état actuel du réglage
// - onConfirm     : async (nextValue: bool) => void
//                   Appelée uniquement après saisie correcte de "BINHEMI".
//                   Doit lancer l'écriture réelle (ex: la même fonction que
//                   AdminPaymentMethods.js pour Stripe/Virement).
// - warningText   : string (optionnel), avertissement additionnel affiché
//                   dans le panneau de confirmation (ex: rappel TVA sur les
//                   factures déjà émises, ou "aucun moyen de paiement actif").
// - disabled      : bool (optionnel)
//
// Ce fichier est nouveau et ne modifie aucun fichier existant : il peut être
// ajouté sans risque de régression sur C1/C2/C5.

import { useState } from "react";
import { Lock, AlertTriangle } from "lucide-react";

const CONFIRM_WORD = "BINHEMI";

export default function SensitiveSwitch({
  id,
  label,
  description,
  checked,
  onConfirm,
  warningText,
  disabled = false,
}) {
  const [confirming, setConfirming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const nextValue = !checked;

  function openConfirm() {
    if (disabled || loading) return;
    setInputValue("");
    setError("");
    setConfirming(true);
  }

  function cancelConfirm() {
    setConfirming(false);
    setInputValue("");
    setError("");
  }

  async function validateConfirm() {
    if (inputValue.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(`Veuillez taper exactement « ${CONFIRM_WORD} » pour confirmer.`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm(nextValue);
      setConfirming(false);
      setInputValue("");
    } catch (err) {
      setError(
        err && err.message
          ? err.message
          : "Une erreur est survenue, le réglage n'a pas été modifié."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="w-full min-w-0 max-w-full whitespace-normal break-words text-left rounded-xl border border-[#e7d9e2] bg-white p-4"
      data-testid={`sensitive-switch-${id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <Lock size={16} className="mt-0.5 shrink-0 text-[#8b737e]" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-[#3b2b39]">{label}</p>
            {description && (
              <p className="mt-0.5 text-xs text-[#8b737e]">{description}</p>
            )}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled || loading}
          onClick={openConfirm}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            checked ? "bg-[#8f6075]" : "bg-[#e7d9e2]"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-[#f0d9b5] bg-[#fdf8ef] p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#3b2b39]">
                Vous allez {nextValue ? "activer" : "désactiver"} «{" "}
                <strong>{label}</strong> ».
              </p>
              {warningText && (
                <p className="mt-1 text-xs text-amber-700">{warningText}</p>
              )}
              <p className="mt-2 text-xs text-[#8b737e]">
                Pour confirmer, tapez « {CONFIRM_WORD} » :
              </p>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={loading}
                className="mt-1 w-full rounded-md border border-[#e7d9e2] px-2 py-1 text-sm uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-[#8f6075]"
                placeholder={CONFIRM_WORD}
                data-testid={`sensitive-switch-${id}-input`}
              />
              {error && (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelConfirm}
                  disabled={loading}
                  className="rounded-md px-3 py-1 text-sm text-[#8b737e] hover:bg-[#f5edf1]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={validateConfirm}
                  disabled={loading}
                  className="rounded-md bg-[#8f6075] px-3 py-1 text-sm text-white hover:bg-[#7a4f63] disabled:opacity-60"
                  data-testid={`sensitive-switch-${id}-validate`}
                >
                  {loading ? "Validation…" : "Valider"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
