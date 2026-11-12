// ZENORIA_CARE_INFO_V1
// Construit la ligne de l'onglet Accueil › Configuration pour le réglage « care_info » (Entretien du
// bijou), sur le modèle de lib/newBadgeOverview.js / lib/accountNewsCacheOverview.js : réglage absent
// -> le site applique le texte par défaut, affiché « Activé (par défaut) », jamais « Non défini ».
import { parseCareInfoSetting } from "./careInfoSettings.js";

export function careInfoOverviewItems(row) {
  const cfg = parseCareInfoSetting(row ? row.value : null);
  const isDefault = !row;
  return [
    {
      id: "care_info_enabled",
      label: "Entretien du bijou",
      flag: cfg.enabled,
      sub: isDefault ? "Activé (par défaut)" : "Fiche produit et page /entretien",
    },
  ];
}
