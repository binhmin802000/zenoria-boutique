// ============================================================================
// ZENORIA — Couleurs de vêtements du quiz (logique pure : aucune classe Tailwind, aucun React)
//
// Contenu repris de la maquette validée : une palette de 8 couleurs par saison, deux couleurs « à éviter près du
// visage », six occasions. Chaque couleur est [nom, hex, ton] ; le ton (bright, soft, deep, neutral) sert à
// composer trois propositions par occasion. Ce sont des conseils d'inspiration, pas des règles.
// ============================================================================

export const OUTFIT_SEASONS = ["printemps", "ete", "automne", "hiver"];

// Accroche et couleurs de secours de chaque saison (le site utilise d'abord celles de l'onglet Familles)
export const SEASON_DEFAULTS = {
  printemps: { tag: "Fraîcheur et lumière", dots: ["#f26b5b","#f8b79a","#f0c24b","#9fdcb6"] },
  ete: { tag: "Douceur et légèreté", dots: ["#e8b7c4","#9db9e6","#b9a7e0","#a8bfa2"] },
  automne: { tag: "Chaleur et profondeur", dots: ["#c8643b","#d9a02b","#7b7a2c","#a8452a"] },
  hiver: { tag: "Éclat et contraste", dots: ["#2748b8","#c2182b","#0f8a5f","#4b2a7a"] },
};

export const GARMENTS = {
  printemps: [
    ["Corail","#f26b5b","bright"],
    ["Pêche","#f8b79a","soft"],
    ["Jaune doré","#f0c24b","bright"],
    ["Vert menthe","#9fdcb6","soft"],
    ["Turquoise clair","#4fc7c0","bright"],
    ["Vert feuillage","#3f8f55","deep"],
    ["Ivoire chaud","#f6ecd6","neutral"],
    ["Camel clair","#d9b78a","neutral"],
  ],
  ete: [
    ["Rose poudré","#e8b7c4","soft"],
    ["Bleu doux","#9db9e6","soft"],
    ["Lavande","#b9a7e0","soft"],
    ["Sauge","#a8bfa2","soft"],
    ["Framboise douce","#c75a85","bright"],
    ["Prune douce","#7a4b78","deep"],
    ["Gris perle","#cfd3dc","neutral"],
    ["Blanc cassé froid","#f1f1f4","neutral"],
  ],
  automne: [
    ["Terracotta","#c8643b","bright"],
    ["Moutarde","#d9a02b","bright"],
    ["Abricot","#e8a86a","soft"],
    ["Vert mousse","#5f7a3b","soft"],
    ["Olive","#7b7a2c","deep"],
    ["Rouille","#a8452a","deep"],
    ["Crème","#f3e6cf","neutral"],
    ["Brun chocolat","#5a3a2a","neutral"],
  ],
  hiver: [
    ["Bleu royal","#2748b8","bright"],
    ["Rouge vrai","#c2182b","bright"],
    ["Émeraude","#0f8a5f","bright"],
    ["Rose glacé","#f3c6dc","soft"],
    ["Bleu glacier","#bcd7f5","soft"],
    ["Violet profond","#4b2a7a","deep"],
    ["Noir","#16161a","neutral"],
    ["Blanc pur","#ffffff","neutral"],
  ],
};

// Couleurs plutôt à éviter près du visage, par saison
export const AVOID = {
  printemps: [["Noir pur","#16161a"],["Gris froid","#9aa0aa"]],
  ete: [["Orange vif","#f2711c"],["Moutarde","#d9a02b"]],
  automne: [["Blanc pur","#ffffff"],["Bleu électrique","#2a5bff"]],
  hiver: [["Beige terne","#d6c2a0"],["Orange pâle","#f4b183"]],
};

export const OCCASIONS = [
  {"key":"anniv","label":"Anniversaire","tags":["bright","soft","neutral"],"text":"Joyeuse et lumineuse : une couleur vive près du visage, et la bague apporte la touche façonnée à la main."},
  {"key":"diner","label":"Dîner chic","tags":["deep","neutral","soft"],"text":"Des tons profonds pour une allure élégante : la bague devient le seul éclat de la tenue."},
  {"key":"soiree","label":"Soirée","tags":["deep","bright","neutral"],"text":"Un fond intense, sur lequel les cristaux Swarovski prennent toute leur lumière."},
  {"key":"mariage","label":"Mariage (invitée)","tags":["soft","soft","neutral"],"text":"Des teintes douces et festives. On laisse le blanc à la mariée."},
  {"key":"pro","label":"Rendez-vous pro","tags":["neutral","deep","soft"],"text":"Des couleurs posées : la bague reste discrète et soignée."},
  {"key":"weekend","label":"Week-end","tags":["soft","bright","neutral"],"text":"Des couleurs faciles à porter, légères et naturelles."},
];

const isSeason = (s) => OUTFIT_SEASONS.includes(s);
export const occasionByKey = (key) => OCCASIONS.find((o) => o.key === key) || OCCASIONS[0];

// Trois couleurs de vêtements pour une saison et une occasion : la première est la couleur principale.
// Une même couleur n'apparaît jamais deux fois. Saison ou occasion inconnue : liste vide, sans erreur.
export function outfitFor(season, occasion) {
  if (!isSeason(season) || !occasion || !Array.isArray(occasion.tags)) return [];
  const pool = GARMENTS[season].slice();
  const out = [];
  for (const tag of occasion.tags) {
    if (!pool.length) break;
    let i = pool.findIndex((g) => g[2] === tag);
    if (i < 0) i = 0;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// Couleur présentée sur le mannequin au moment de la révélation : la première de la première occasion
export function flatteringGarment(season) {
  const o = outfitFor(season, OCCASIONS[0]);
  return o.length ? o[0][1] : null;
}
