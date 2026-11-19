// ZENORIA_SECTION_NAV_V1 : calcul des sections precedente et suivante pour le bouton flottant de l'accueil.
export const SECTION_NAV_OFFSET = 80; // hauteur du header fixe (scroll-mt-20)
export const SECTION_NAV_MIN_SCROLL = 200; // en dessous : bouton masque (haut de page)
export const SECTION_NAV_IDLE_MS = 2500; // disparition apres inactivite

// sections : [{ id, label, top }] avec top = position absolue dans la page. Retourne { prev, next } (ou null).
export function computeSectionTargets(sections, scrollY, offset = SECTION_NAV_OFFSET) {
  const sorted = [...sections].filter((s) => Number.isFinite(s.top)).sort((a, b) => a.top - b.top);
  const pos = scrollY + offset;
  let prev = null;
  let next = null;
  for (const s of sorted) {
    if (s.top < pos - 4) prev = s;
    else if (s.top > pos + 4 && !next) next = s;
  }
  return { prev, next };
}

// Position de defilement pour amener une section sous le header ; null = haut de page.
export function scrollTopFor(target, offset = SECTION_NAV_OFFSET) {
  return target ? Math.max(0, Math.round(target.top - offset)) : 0;
}
