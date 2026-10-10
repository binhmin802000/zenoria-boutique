import React from "react";

// ============================================================
// CopyrightBadge - mention « © 2026 Zenoria » affichée par le SITE
// par-dessus une photo ou une vidéo, en bas à gauche de ce que le visiteur voit.
//
// Pourquoi : le filigrane enregistré dans le fichier est en bas à gauche de la
// photo entière, mais le site recadre la photo dans certaines vues (carte du
// catalogue, cercles) et en coupe alors le coin. Cette mention, posée par la
// page, reste toujours visible.
//
// UTILISATION : à placer à l'intérieur d'un conteneur « relative » qui contient
// la photo ou la vidéo.
//
//   <div className="relative">
//     <img ... />
//     <CopyrightBadge />                      // coin bas gauche (cartes, fiches)
//   </div>
//
//   <CopyrightBadge variant="circle" />       // bas du cercle (bannière, Savoir-faire)
//
// Un léger fond sombre translucide la garde lisible sur les photos très claires comme sur les photos sombres.
// La mention ne bloque aucun clic (pointer-events: none) et n'est pas sélectionnable.
// ============================================================

export default function CopyrightBadge({ variant = "corner", className = "" }) {
  const base =
    "pointer-events-none select-none absolute z-[6] whitespace-nowrap rounded-full bg-black/35 px-2.5 py-0.5 font-serif tracking-[.14em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,.7)]";
  const position =
    variant === "circle"
      ? "left-1/2 -translate-x-1/2 bottom-[13%] text-[10px]"
      : "left-3 bottom-2.5 text-[11px]";
  return (
    <span aria-hidden="true" className={`${base} ${position} ${className}`}>
      © 2026 Zenoria
    </span>
  );
}
