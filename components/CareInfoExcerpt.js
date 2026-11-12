// ZENORIA_CARE_INFO_V1
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchCareInfoSetting, careInfoExcerpt } from "@/lib/careInfoSettings";
// ============================================================
// Court encart « Entretien du bijou » affiche sous la description de la fiche produit (ProductSheet.js,
// partage entre l'Accueil et le quiz). Lecture mise en cache en memoire du module (une seule fois par
// session de navigation, le reglage ne change pas pendant la visite) pour ne pas refaire l'appel reseau
// a chaque ouverture de fiche.
// ============================================================
let cached = null; // { enabled, excerpt } | null tant que non lu

export default function CareInfoExcerpt() {
  const [state, setState] = useState(cached);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetchCareInfoSetting(supabase).then((res) => {
      const next = { enabled: res.enabled, excerpt: careInfoExcerpt(res.content) };
      cached = next;
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!state || !state.enabled || !state.excerpt) return null;
  return (
    <p data-testid="product-sheet-care-info" className="text-sm leading-6 text-[#70656a] mt-4 rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3">
      {state.excerpt}{" "}
      <a href="/entretien" data-testid="product-sheet-care-info-link" className="underline underline-offset-2 text-[#855a6f] whitespace-nowrap">
        En savoir plus
      </a>
    </p>
  );
}
