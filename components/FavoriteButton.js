// ZENORIA_FAVORITE_BUTTON_V1
import React from "react";
import { Heart } from "lucide-react";

// ============================================================
// Bouton coeur réutilisable (catalogue + fiche produit).
//
// Ce composant reste uniquement présentationnel : il affiche l'état
// rempli/vide selon la prop "active" et délègue tout le reste (mode
// invité vs connectée, écriture locale ou Supabase) au parent via
// "onToggle". Cela évite de dupliquer la logique de favoris à chaque
// endroit où le bouton est affiché.
// ============================================================

export default function FavoriteButton({ active, onToggle, size = 20, className = "" }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={active}
      aria-label={active ? "Retirer des favoris" : "Ajouter aux favoris"}
      title={active ? "Retirer des favoris" : "Ajouter aux favoris"}
      className={`inline-flex items-center justify-center rounded-full transition hover:scale-110 ${className}`}
    >
      <Heart
        size={size}
        className={active ? "fill-[#8f6075] text-[#8f6075]" : "text-[#8f6075]"}
        strokeWidth={1.75}
      />
    </button>
  );
}
