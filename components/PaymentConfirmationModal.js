// ZENORIA_PAYMENT_CONFIRMATION_MODAL_V1
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

// Logo Zenoria, déjà hébergé dans Supabase Storage (réutilisé depuis le
// modèle d'e-mail « mot de passe oublié »).
const LOGO_URL =
  "https://dnzrssuclesccxgcurwz.supabase.co/storage/v1/object/public/product-media/Logos/zenoria_logo_horizontal_fond_blanc.png";

// Fenêtre affichée au retour réussi d'un paiement Stripe (voir le useEffect
// qui détecte "?paiement=succes" dans pages/index.js). Ne contient encore
// aucune mention d'e-mail de confirmation : cette promesse sera ajoutée
// une fois cet e-mail réellement construit (chantier séparé).
export default function PaymentConfirmationModal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[70]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-[70] inset-x-4 top-[10%] max-w-md mx-auto bg-[#fbf8f4] rounded-[2rem] shadow-2xl p-8 text-center"
          >
            <button className="absolute right-5 top-5" onClick={onClose} aria-label="Fermer">
              <X />
            </button>

            <img src={LOGO_URL} alt="Zenoria" className="h-10 mx-auto mb-6 object-contain" />

            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#f5edf1] grid place-items-center text-[#8f6075] text-2xl">
              ✓
            </div>

            <h3 className="font-serif text-3xl mb-4">Merci pour votre confiance</h3>

            <p className="text-sm text-[#54434c] leading-6 mb-8">
              Nous avons bien reçu votre commande et votre paiement. Votre bague sera façonnée à la main, avec la
              même attention que pour chacune de nos créations. Merci de votre confiance.
            </p>

            <button
              onClick={onClose}
              className="w-full rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white text-sm font-medium h-12 transition"
            >
              Continuer mes achats
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
