import React from "react";
import { DEFAULT_SHIPPING, shippingStripText } from "@/lib/shippingSettings";

// ============================================================
// BANDE DE LIVRAISON de la page /quiz - ZENORIA_SITE_HEADER_H2
//
// L'en-tête du quiz est le composant partagé components/SiteHeader.js (comme l'accueil) et son pied de page est
// components/Footer.js. Il ne reste ici que la bande de livraison, au-dessus de l'en-tête.
// ============================================================

// Bande de livraison, au-dessus de l'en-tête (comme sur l'accueil)
export function ShippingStrip({ setting = DEFAULT_SHIPPING }) {
  return (
    <div className="bg-[#342434] text-white/85 text-[11px] py-2 px-4 text-center tracking-wide">
      {shippingStripText(setting)}
    </div>
  );
}
