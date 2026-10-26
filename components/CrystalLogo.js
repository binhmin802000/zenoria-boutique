import React from "react";

// ============================================================
// LOGO ZENORIA — utilisé par l'accueil (index.js) et le pied de page
// partagé (Footer.js). Extrait depuis pages/index.js pour garantir un
// logo strictement identique sur toutes les pages qui l'utilisent.
//
//  mode    : 1, 2 ou 3 — variante de dégradé de couleur
//  compact : taille réduite (header) vs. taille normale (bannière)
//  dark    : texte blanc (fond sombre) vs. texte prune (fond clair)
// ============================================================
export default function CrystalLogo({ mode = 1, compact = false, dark = false }) {
  const styles = [
    "from-[#bd8792] via-[#d8b36d] to-[#705185]",
    "from-[#6f4a8e] via-[#ead4b0] to-[#bf8797]",
    "from-[#222] via-[#9d6f86] to-[#d7b66f]",
  ];
  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${compact ? "h-10 w-10" : "h-14 w-14"} rounded-full bg-gradient-to-br ${styles[mode - 1]} p-[2px] shadow-lg`}>
        <div className="relative h-full w-full rounded-full bg-[#fbf8f4] overflow-hidden">
          <div className="absolute -left-1 top-0 h-full w-[58%] rounded-r-full bg-gradient-to-br from-[#76518f] to-[#c89aa6]" />
          <div className="absolute right-1 top-1 h-[46%] w-[46%] rounded-full bg-[#fbf8f4]" />
          <div className="absolute left-2 bottom-2 h-2.5 w-2.5 rounded-full bg-[#fbf8f4] ring-1 ring-[#d8b36d]" />
          <div className="absolute right-3 top-3 h-2.5 w-2.5 rotate-45 bg-gradient-to-br from-white to-[#d8b36d] shadow" />
        </div>
      </div>
      <div>
        <div className={`${compact ? "text-xl" : "text-3xl"} tracking-[.22em] font-serif ${dark ? "text-white" : "text-[#412f3b]"}`}>ZENORIA</div>
        {!compact && <div className={`text-[10px] tracking-wide italic ${dark ? "text-white/60" : "text-[#755f6e]"}`}>L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme.</div>}
      </div>
    </div>
  );
}