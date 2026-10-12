import { useEffect, useRef } from "react";

// ============================================================================
// ZENORIA — Comportement commun des fenêtres (fiche bague, question du panier) :
//  - à l'ouverture, le focus se place sur l'élément marqué data-autofocus, sinon sur le premier élément utilisable ;
//  - la touche Tab reste dans la fenêtre (elle ne part pas vers la page cachée derrière) ;
//  - la page de fond ne défile plus ;
//  - à la fermeture, le focus revient là où il était et le défilement est rétabli.
// La touche Échap n'est pas gérée ici : chaque page décide de ce qu'elle ferme.
// ============================================================================

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const isVisible = (el) => !el.hidden && el.getAttribute("aria-hidden") !== "true" && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

export default function useModalFocus(open, containerRef) {
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const container = containerRef.current;
    const focusables = () => (container ? Array.from(container.querySelectorAll(FOCUSABLE)).filter(isVisible) : []);
    const first = container && (container.querySelector("[data-autofocus]") || focusables()[0]);
    if (first && typeof first.focus === "function") first.focus({ preventScroll: true });

    const onKeyDown = (e) => {
      if (e.key !== "Tab" || !container) return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      const index = list.indexOf(active);
      const outside = !container.contains(active);
      if (e.shiftKey && (index <= 0 || outside)) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && (index === list.length - 1 || outside)) {
        e.preventDefault();
        list[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const opener = openerRef.current;
      // Le focus ne revient que si l'élément d'origine existe encore dans la page
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, containerRef]);
}
