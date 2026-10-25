import React, { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { ProductMedia, PriceTag, AvailabilityBadge } from "@/components/ProductParts";
import FavoriteButton from "@/components/FavoriteButton";
import useModalFocus from "@/lib/useModalFocus";

// ============================================================================
// FICHE BAGUE — la fenêtre qui s'ouvre sur une bague (galerie, vidéo, prix, disponibilité, texte, « Ajouter au panier »).
// Elle est partagée entre l'accueil (pages/index.js) et la page du quiz (pages/quiz.js) : une modification ici s'applique aux deux.
//
//  product          : la bague à afficher, ou null (fenêtre fermée)
//  initialMode      : "video" ou "photo" (ce que la galerie montre en premier)
//  label            : petite ligne au-dessus du nom (par exemple « Automne · Ancrage »)
//  onClose          : appelée par la croix et par un clic à côté de la fenêtre (la touche Échap est gérée par la page)
//  onAdd            : appelée par « Ajouter au panier » avec la bague ; c'est la page qui décide de fermer la fiche ou non
//  extra            : contenu facultatif affiché sous la description (le quiz y met « Pourquoi elle vous va »)
//  favoriteActive   : facultatif, état du cœur favori pour cette bague (fourni par la page)
//  onToggleFavorite : facultatif, appelée au clic sur le cœur ; si absent, aucun bouton favori n'est affiché
//  ratingSlot       : facultatif, affiché sous le prix (note des avis) — ZENORIA_REVIEWS_STEP3_V1
//  reviewsSlot      : facultatif, affiché sous « Ajouter au panier » (derniers avis) — ZENORIA_REVIEWS_STEP3_V1
// ============================================================================
export default function ProductSheet({ product, initialMode = "video", label = "", onClose, onAdd, extra = null, addLabel = "Ajouter au panier", favoriteActive = false, onToggleFavorite, ratingSlot = null, reviewsSlot = null, uniqueNotice = null }) {
  const dialogRef = useRef(null);
  useModalFocus(Boolean(product), dialogRef);

  return (
    <AnimatePresence>
      {product && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="product-sheet-overlay"
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={product.name}
            data-testid="product-sheet"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 inset-x-4 top-[6%] max-w-4xl mx-auto bg-[#fbf8f4] rounded-[2rem] overflow-hidden shadow-2xl grid md:grid-cols-2 max-h-[88vh] overflow-y-auto"
          >
            <ProductMedia product={product} initialMode={initialMode} />
            <div className="p-8 relative">
              <button className="absolute right-5 top-5" onClick={onClose} aria-label="Fermer" data-testid="product-sheet-close" data-autofocus>
                <X />
              </button>
              <div className="text-xs uppercase tracking-widest text-[#9a7384]">{label}</div>
              <div className="flex items-start justify-between gap-3 mt-3">
                <h3 className="font-serif text-4xl">{product.name}</h3>
                {onToggleFavorite && (
                  <FavoriteButton active={favoriteActive} onToggle={onToggleFavorite} size={22} className="shrink-0 mt-2" />
                )}
              </div>
              <PriceTag product={product} className="text-2xl mt-4 block" />
              {ratingSlot}
              <div className="mt-3">
                <AvailabilityBadge product={product} showDetail />
              </div>

              {product.pitch && (
                <p className="text-[15px] leading-7 text-[#54434c] mt-5">{product.pitch}</p>
              )}
              <p className="text-sm leading-6 text-[#70656a] mt-3 italic">{product.energy}</p>
              {uniqueNotice}
              {extra}

              <button
                onClick={() => onAdd && onAdd(product)}
                data-testid="product-sheet-add"
                className="w-full mt-7 rounded-full h-12 bg-[#855a6f] hover:bg-[#6f4a5c] text-white text-sm font-medium transition"
              >
                {addLabel}
              </button>
              {reviewsSlot}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
