// ZENORIA_ACCOUNT_NEWS_BADGE_V1
// Construit les lignes de l'onglet Accueil › Configuration pour le réglage « account_news_cache »,
// sur le modèle de lib/gridOrderOverview.js / lib/newBadgeOverview.js : réglage absent -> le site
// applique ses valeurs par défaut, affichées avec la mention « (par défaut) », jamais « Non défini ».
import { parseAccountNewsCacheSetting } from "./accountNewsCacheSettings.js";

export function accountNewsCacheOverviewItems(row) {
  const cfg = parseAccountNewsCacheSetting(row ? row.value : null);
  const isDefault = !row;
  return [
    {
      id: "account_news_cache_enabled",
      label: "Pastille sur toutes les pages",
      flag: cfg.enabled,
      sub: isDefault ? "Activée (par défaut)" : "Accueil et quiz, en plus de Mon compte",
    },
    {
      id: "account_news_cache_minutes",
      label: "Durée de cache",
      text: cfg.minutes + " min" + (isDefault ? " (par défaut)" : ""),
      missing: false,
    },
  ];
}
