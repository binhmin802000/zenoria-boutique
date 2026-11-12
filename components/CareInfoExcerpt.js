// ZENORIA_CARE_INFO_V1
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchCareInfoSetting } from "@/lib/careInfoSettings";
// ============================================================
// Lien « Entretien du bijou » affiche sous la description de la fiche produit (ProductSheet.js,
// partage entre l'Accueil et le quiz) : un simple lien vers /entretien, sans extrait de texte.
// Lecture mise en cache en memoire du module (une seule fois par session de navigation, le reglage
// ne change pas pendant la visite) pour ne pas refaire l'appel reseau a chaque ouverture de fiche.
// ============================================================
let cached = null; // { enabled } | null tant que non lu

export default function CareInfoExcerpt() {
  const [state, setState] = useState(cached);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetchCareInfoSetting(supabase).then((res) => {
      const next = { enabled: res.enabled };
      cached = next;
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!state || !state.enabled) return null;
  return (
    <p data-testid="product-sheet-care-info" className="mt-4">
      <a href="/entretien" data-testid="product-sheet-care-info-link" className="text-sm text-[#855a6f] underline underline-offset-2 hover:text-[#6f4a5c]">
        Entretien du bijou
      </a>
    </p>
  );
}
