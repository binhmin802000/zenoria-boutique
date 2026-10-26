import React from "react";
import { ChevronRight } from "lucide-react";

// ============================================================
// ADMIN — Section d'accordeon reutilisable pour l'onglet "Contenu du site"
// ============================================================
// Un seul groupe ouvert a la fois : openId/onToggle sont geres par le
// parent (AdminSiteMedia), pas par ce composant lui-meme.
//
//  id       : identifiant unique du groupe (ex. "vitrine", "textes-legal")
//  title    : titre affiche dans le bandeau
//  count    : nombre de composants dans le groupe (affiche en badge)
//  isOpen   : vrai si ce groupe est actuellement ouvert
//  onToggle : appelee au clic sur le bandeau, avec l'id du groupe
//  children : contenu affiche uniquement si isOpen est vrai
// ============================================================
export default function AdminAccordionSection({ id, title, count, isOpen, onToggle, children }) {
  return (
    <div className="rounded-2xl border border-[#eadfe4] bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        data-testid={`admin-accordion-${id}`}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#fbf7f9] transition"
      >
        <span className="flex items-center gap-2">
          <span className="font-serif text-lg text-[#412f3b]">{title}</span>
          {typeof count === "number" && (
            <span className="text-[10px] font-sans bg-[#f5edf1] text-[#8f6075] px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </span>
        <ChevronRight size={16} className={`text-[#8f6075] transition-transform ${isOpen ? "rotate-90" : ""}`} />
      </button>
      {isOpen && (
        <div className="px-5 pb-5 space-y-6 border-t border-[#f0e6ea] pt-5">
          {children}
        </div>
      )}
    </div>
  );
}