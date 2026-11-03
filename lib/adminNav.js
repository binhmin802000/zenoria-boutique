// ============================================================
// adminNav.js - Structure de la navigation de l'administration (/admin)
//
// Cinq groupes (ZENORIA_HOME_5D_V1 : Accueil en premier), chacun avec ses onglets (ZENORIA_ADMIN_NAV_5A_V1) :
//   Accueil   : Tableau de bord
//   Produits  : Bijoux, Familles, Codes promo (avec les bandeaux), Contenu du site
//   CRM       : Comptes, Commandes, Avis, RGPD (« À venir » supprimé)
//   Réglages  : Moyens de paiement, Facturation et TVA (déplacés depuis l'onglet Commandes)
//   Technique : Connexions, Quotas, Maintenance, Santé
//
// Pour AJOUTER un onglet : ajoutez une ligne ici (identifiant unique + libellé), une icône dans
// pages/admin.js (TAB_ICONS), puis le contenu correspondant dans la page.
// Pour RÉSERVER un onglet à un futur rôle (super administrateur), c'est ici qu'on filtrera la liste.
//
// La position est conservée dans l'adresse de la page : /admin#technique/sante. Les fonctions
// ci-dessous lisent et fabriquent cette adresse. Elles sont indépendantes de React et testées seules.
// ============================================================

export const ADMIN_NAV = [
  // ZENORIA_HOME_5D_V1 : groupe Accueil (tableau de bord), affiché en premier
  {
    id: "accueil",
    label: "Accueil",
    tabs: [{ id: "tableau", label: "Tableau de bord" }],
  },
  {
    id: "produits",
    label: "Produits",
    tabs: [
      { id: "collections", label: "Bijoux" },
      { id: "familles", label: "Familles" },
      { id: "promos", label: "Codes promo" },
      { id: "site", label: "Contenu du site" },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    tabs: [
      { id: "comptes", label: "Comptes" },
      { id: "commandes", label: "Commandes" },
      { id: "avis", label: "Avis" }, // ZENORIA_REVIEWS_STEP2_V1 : modération des avis clientes
      // « À venir » supprimé (lot 5a) : l'ancienne adresse #crm/avenir ouvre le premier onglet du CRM
      { id: "rgpd", label: "RGPD" },
    ],
  },
    {
    id: "reglages",
    label: "Réglages",
    tabs: [
      { id: "paiement", label: "Moyens de paiement" },
      { id: "facturation", label: "Facturation et TVA" },
    ],
  },
  {
    id: "technique",
    label: "Technique",
    tabs: [
      { id: "connexions", label: "Connexions" },
      { id: "quotas", label: "Quotas" },
      { id: "maintenance", label: "Maintenance" },
      { id: "sante", label: "Santé" },
    ],
  },
];

export const DEFAULT_NAV = { group: "accueil", sub: "tableau" }; // ZENORIA_HOME_5D_V1 : l'Accueil est la page d'ouverture

export function findGroup(id) {
  return ADMIN_NAV.find((g) => g.id === id) || null;
}

export function findGroupOfTab(tabId) {
  return ADMIN_NAV.find((g) => g.tabs.some((t) => t.id === tabId)) || null;
}

// Lit une adresse du type « #technique/sante » et renvoie { group, sub }, ou null si elle n'a rien à voir
// avec la navigation (par exemple un lien de connexion reçu par e-mail).
//  - « #technique »            -> premier onglet du groupe
//  - « #technique/inconnu »    -> premier onglet du groupe
//  - « #quotas »               -> raccourci : l'onglet est retrouvé dans son groupe
//  - tout le reste             -> null
export function parseAdminHash(hash) {
  const raw = String(hash || "").replace(/^#\/?/, "").trim().toLowerCase();
  if (!raw || !/^[a-z0-9-]+(\/[a-z0-9-]*)?\/?$/.test(raw)) return null;
  const [first, second] = raw.split("/");
  // ZENORIA_HOME_5D_V1 : l'ancien onglet « À venir » (supprimé au lot 5a) ouvre désormais l'Accueil
  if (first === "avenir" || (first === "crm" && second === "avenir")) return { group: "accueil", sub: "tableau" };
  const group = findGroup(first);
  if (group) {
    const sub = group.tabs.find((t) => t.id === second);
    return { group: group.id, sub: sub ? sub.id : group.tabs[0].id };
  }
  const owner = findGroupOfTab(first);
  if (owner && !second) return { group: owner.id, sub: first };
  return null;
}

export function buildAdminHash(group, sub) {
  return "#" + group + "/" + sub;
}

// Un lien de connexion Supabase (confirmation d'inscription, mot de passe oublié) arrive avec une adresse
// du type « #access_token=...&type=signup ». On ne doit jamais l'écraser : le client Supabase la lit.
export function isAuthCallbackHash(hash) {
  return /[=&]/.test(String(hash || ""));
}

// Niveau d'alerte à afficher sur le groupe « Technique » : le pire de ses onglets.
//  quotaLevel      : "ok" | "warn" | "critical" (voir lib/quota.js)
//  maintenanceMode : "off" | "shop_pause" | "full"
export function technicalAlertLevel(quotaLevel, maintenanceMode) {
  if (quotaLevel === "critical" || maintenanceMode === "full") return "critical";
  if ((quotaLevel && quotaLevel !== "ok") || maintenanceMode === "shop_pause") return "warn";
  return "ok";
}
