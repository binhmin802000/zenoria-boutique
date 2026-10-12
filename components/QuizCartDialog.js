import React, { useRef } from "react";
import { X } from "lucide-react";
import useModalFocus from "@/lib/useModalFocus";

// ============================================================================
// QUIZ — la question posée quand la visiteuse veut voir son panier depuis le résultat du quiz.
// Le panier est celui de l'accueil (un seul panier pour tout le site). La question décide seulement de ce qui se passe ensuite :
//   - « Oui » : le panier s'ouvre sur l'accueil avec un bouton « Retour au quiz » qui ramène au même résultat ;
//   - « Non » : le panier s'ouvre sur l'accueil, comme d'habitude ;
//   - « Rester sur le quiz » (ou Échap, ou un clic à côté) : rien ne change, on reste sur le résultat.
// ============================================================================
export default function QuizCartDialog({ open, onStay, onYes, onNo }) {
  const dialogRef = useRef(null);
  useModalFocus(open, dialogRef);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" data-testid="cart-dialog-wrap">
      <div className="absolute inset-0 bg-black/45" onClick={onStay} aria-hidden="true" data-testid="cart-dialog-overlay" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-cart-title"
        aria-describedby="quiz-cart-text"
        data-testid="cart-dialog"
        className="relative w-full max-w-md rounded-[1.75rem] bg-[#fbf8f4] border border-white shadow-2xl p-7"
      >
        <button type="button" onClick={onStay} aria-label="Rester sur le quiz" className="absolute right-4 top-4 h-9 w-9 rounded-full grid place-items-center hover:bg-[#f0e6ea]">
          <X size={18} />
        </button>
        <h2 id="quiz-cart-title" className="font-serif text-2xl pr-8">
          Voir votre panier
        </h2>
        <p id="quiz-cart-text" className="text-sm text-[#6b5a63] leading-6 mt-2">
          Votre panier s&apos;ouvre sur la page d&apos;accueil de la boutique. Souhaitez-vous revenir à votre résultat du quiz ensuite ?
        </p>
        <div className="mt-6 grid gap-3">
          <button type="button" onClick={onYes} data-autofocus data-testid="cart-dialog-yes" className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white h-12 text-sm font-medium transition">
            Oui, me ramener au quiz
          </button>
          <button type="button" onClick={onNo} data-testid="cart-dialog-no" className="rounded-full border border-[#d9c5cc] bg-white hover:bg-[#f5edf1] text-[#54434c] h-12 text-sm font-medium transition">
            Non, quitter le quiz
          </button>
        </div>
        <button type="button" onClick={onStay} data-testid="cart-dialog-stay" className="mt-4 mx-auto block text-sm text-[#8f6075] underline underline-offset-2">
          Rester sur le quiz
        </button>
        <p className="text-[11px] text-[#8b737e] text-center mt-4">Votre panier est conservé dans tous les cas.</p>
      </div>
    </div>
  );
}
